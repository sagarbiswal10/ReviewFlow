import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VISITOR_QUOTA_MAX_GENERATIONS,
  VISITOR_QUOTA_WINDOW_MS,
  formatQuotaCountdown,
  formatReviewEventActionLabel,
  getMondaySundayWindow,
  getPortalTimeGreeting,
  getTimestampMs,
  isMondayToday,
  normalizeEmail,
  resolveVisitorQuotaState,
  getAllowedLanguagesForTier,
  isLanguageAllowedForTier,
  sanitizeAccessLevel,
  sanitizeEnabledFeatures,
  sanitizeFormTemplate,
  sanitizeGbpSettings,
  sanitizePackageTier,
  sanitizeReviewFlowMode,
  sanitizeReviewFlowModeForTier,
  sanitizeSlug,
  sanitizeWeeklyReportConfig,
  resolvePersistedInstantSeed,
  advancePersistedInstantSeed,
  parseAndValidateRecipientEmails,
} from '../src/utils/domainHelpers.ts';
import {
  buildContextualSeoSuggestions,
  sanitizeSeoKeywordPhrase,
} from '../src/utils/seoKeywordEngine.ts';
import {
  INDIA_SALON_REAL_REVIEW_DATASET,
  buildWritingStyleProfile,
} from '../src/data/realReviewDatasets.ts';
import {
  BACKEND_REVIEW_TEMPLATE_COUNTS,
  selectContextualReadyDrafts,
} from '../api/_lib/reviewTemplateBank.ts';
import {
  FORM_TEMPLATES,
  classifyQuestionsForTemplate,
  isExperienceRatingQuestion,
  mapOptionsToFiveFaces,
} from '../src/data/formTemplates.ts';
import {
  DEFAULT_SEO_KEYWORDS_BY_CATEGORY,
  createCategoryQuestions,
} from '../src/data/categoryPresets.ts';
import {
  buildAutoTranslatedQuestionContent,
  getLocalizedFormUiStrings,
  localizeQuestion,
  localizeWelcomeMessage,
  transliterateRomanToDevanagari,
} from '../src/data/localizedQuestions.ts';
import {
  buildWeeklyReportEmailContent,
  processDispatchWeeklyReportEmail,
} from '../api/_lib/apiCore.ts';
import { composeGroundedFallbackReview } from '../api/_lib/fallbackReviewComposer.ts';
import { BUSINESS_CATEGORIES } from '../src/types.ts';

test('TC-DOM-01: sanitizeSlug normalizes symbols, whitespace, and short strings deterministically', () => {
  assert.equal(sanitizeSlug('  Bella Bistro & Cafe! '), 'bella-bistro-cafe');
  assert.equal(sanitizeSlug('Lumina--Studio'), 'lumina-studio');
  assert.match(sanitizeSlug('a'), /^biz-[a-z0-9]{5}$/);
});

test('TC-DOM-02: sanitizeGbpSettings always locks 1-2 star reviews to manual_approval_only', () => {
  const forced = sanitizeGbpSettings({
    fiveStarMode: 'auto_publish',
    midStarMode: 'auto_publish',
    lowStarMode: 'auto_publish' as never,
    brandVoice: '  Warm and welcoming  ',
  });
  assert.equal(forced.fiveStarMode, 'auto_publish');
  assert.equal(forced.midStarMode, 'auto_publish');
  assert.equal(forced.lowStarMode, 'manual_approval_only');
  assert.equal(forced.brandVoice, 'Warm and welcoming');
});

test('TC-DOM-03: sanitizeWeeklyReportConfig validates emails, normalizes case, and falls back to clientEmail', () => {
  const fallbackOnly = sanitizeWeeklyReportConfig(undefined, '  OWNER@Bistro.COM ');
  assert.deepEqual(fallbackOnly.recipients, ['owner@bistro.com']);

  const filtered = sanitizeWeeklyReportConfig({
    recipients: ['Admin@Test.COM', 'not-an-email', 'Second@Test.org'],
  });
  assert.deepEqual(filtered.recipients, ['admin@test.com', 'second@test.org']);
});

test('TC-DOM-04: getMondaySundayWindow computes exact Monday-Sunday ISO spans and respects weekOffset', () => {
  // Wednesday, Nov 18, 2026
  const wednesday = new Date(2026, 10, 18, 14, 30, 0);
  const current = getMondaySundayWindow(0, wednesday);
  assert.equal(current.weekStart, '2026-11-16'); // Monday
  assert.equal(current.weekEnd, '2026-11-22'); // Sunday
  assert.ok(current.endMs > current.startMs);

  const previous = getMondaySundayWindow(-1, wednesday);
  assert.equal(previous.weekStart, '2026-11-09');
  assert.equal(previous.weekEnd, '2026-11-15');

  // Sunday edge case: Sunday Nov 22, 2026 belongs to week 2026-11-16..2026-11-22
  const sunday = new Date(2026, 10, 22, 20, 0, 0);
  const sundayWindow = getMondaySundayWindow(0, sunday);
  assert.equal(sundayWindow.weekStart, '2026-11-16');
  assert.equal(sundayWindow.weekEnd, '2026-11-22');

  assert.equal(isMondayToday(new Date(2026, 10, 16, 9, 0, 0)), true);
  assert.equal(isMondayToday(wednesday), false);
});

test('TC-DOM-05: getTimestampMs parses Firestore Timestamp-like objects, Dates, numbers, and ISO strings', () => {
  const sampleMs = Date.UTC(2026, 10, 20, 10, 0, 0);
  assert.equal(getTimestampMs(sampleMs), sampleMs);
  assert.equal(getTimestampMs(new Date(sampleMs)), sampleMs);
  assert.equal(getTimestampMs({ toMillis: () => sampleMs }), sampleMs);
  assert.equal(getTimestampMs({ toDate: () => new Date(sampleMs) }), sampleMs);
  assert.equal(getTimestampMs({ seconds: Math.floor(sampleMs / 1000) }), sampleMs);
  assert.equal(getTimestampMs('2026-11-20T10:00:00.000Z'), sampleMs);
  assert.equal(getTimestampMs(null), 0);
});

test('TC-DOM-06: formatReviewEventActionLabel handles all 4 lifecycle stages including form_start', () => {
  assert.equal(formatReviewEventActionLabel('scan'), 'QR Scan');
  assert.equal(formatReviewEventActionLabel('form_start'), 'Started Form');
  assert.equal(formatReviewEventActionLabel('generate'), 'AI Draft Created');
  assert.equal(formatReviewEventActionLabel('copy_redirect'), 'Opened Google Review');
});

test('TC-DOM-07: normalizeEmail, sanitizeAccessLevel, and sanitizeEnabledFeatures apply safe defaults', () => {
  assert.equal(normalizeEmail('  Rohan.Client@GMAIL.com '), 'rohan.client@gmail.com');
  assert.equal(sanitizeAccessLevel('unknown_tier'), 'full');
  assert.equal(sanitizeAccessLevel('read_only'), 'read_only');
  const feats = sanitizeEnabledFeatures({ customQuestions: false });
  assert.equal(feats.customQuestions, false);
  assert.equal(feats.gbpAutoReply, true);
  assert.equal(feats.weeklyReports, true);
});

test('TC-ARCH-01: GBP OAuth uses server-side flow and honors business-level permissions in ClientPortalView and ManagementConsoleView', () => {
  const clientPortalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf-8',
  );
  const adminConsoleSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ManagementConsoleView.tsx'),
    'utf-8',
  );
  const gbpTabSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/GbpAutoReplyTab.tsx'),
    'utf-8',
  );

  // ClientPortalView locks GBP Auto Reply with "Coming Soon" badge and locks Google Review Link
  assert.doesNotMatch(clientPortalSrc, /<GbpAutoReplyTab/);
  assert.match(clientPortalSrc, /lockedComingSoon:\s*true/);
  assert.match(clientPortalSrc, /Coming Soon/);
  assert.match(clientPortalSrc, /if \(tab === 'gbp_reply'\) return;/);
  assert.match(clientPortalSrc, /<BrandingTab[\s\S]*allowGoogleLinkEdit=\{false\}/);
  // ManagementConsoleView explicitly enables allowOAuthConnection & Google link editing, and keeps Top Businesses flush under its header
  assert.match(adminConsoleSrc, /<GbpAutoReplyTab[\s\S]*allowOAuthConnection/);
  assert.match(adminConsoleSrc, /<BrandingTab[\s\S]*allowGoogleLinkEdit/);
  assert.doesNotMatch(
    adminConsoleSrc,
    /\{\/\* 4-Col Top Businesses List \*\/\}\s*<div[^>]*justify-between/,
  );
  // GbpAutoReplyTab defaults allowOAuthConnection to false and uses server-side OAuth (no browser GIS token client)
  assert.match(gbpTabSrc, /allowOAuthConnection\s*=\s*false/);
  assert.match(gbpTabSrc, /startServerGbpOAuth/);
  assert.doesNotMatch(gbpTabSrc, /initTokenClient/);
});

test('TC-ARCH-02: ClientPortalView guards failed clientUid claims from infinite retry loops', () => {
  const clientPortalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf-8',
  );
  assert.match(clientPortalSrc, /claimedAttemptRef\.current\.add\(attemptKey\)/);
  assert.match(clientPortalSrc, /isClientUidLinked/);
  assert.doesNotMatch(clientPortalSrc, /const todayIso = toLocalDateStr\(new Date\(\)\);/);
});

test('TC-DOM-08: sanitizeFormTemplate, resolveVisitorQuotaState, and formatQuotaCountdown enforce 5-min refresh', () => {
  assert.equal(sanitizeFormTemplate('emoji_checklist_dark'), 'emoji_checklist_dark');
  assert.equal(sanitizeFormTemplate('invalid_template'), 'classic_cards');
  assert.equal(sanitizeFormTemplate(undefined), 'classic_cards');

  const now = 1_700_000_000_000;
  const activeState = resolveVisitorQuotaState(5, now + 125_000, now);
  assert.equal(activeState.generationCount, 5);
  assert.equal(activeState.expired, false);
  assert.equal(formatQuotaCountdown(activeState.quotaResetAt, now), '2:05');

  const expiredState = resolveVisitorQuotaState(
    VISITOR_QUOTA_MAX_GENERATIONS,
    now - 1,
    now,
    VISITOR_QUOTA_MAX_GENERATIONS,
    VISITOR_QUOTA_WINDOW_MS,
  );
  assert.equal(expiredState.generationCount, 0);
  assert.equal(expiredState.quotaResetAt, 0);
  assert.equal(expiredState.expired, true);
});

test('TC-TPL-01: Dynamic template engine adapts existing business questions cleanly with zero data loss', () => {
  assert.ok(FORM_TEMPLATES.length >= 6);
  const salonQuestions = [
    ...createCategoryQuestions('Hair Salons'),
    {
      id: 'q-custom-hygiene',
      prompt: 'Was the booking smooth?',
      type: 'single' as const,
      options: ['Super Easy', 'Took Time'],
      required: false,
    },
  ];

  const classified = classifyQuestionsForTemplate(salonQuestions);
  assert.ok(classified.ratingQuestion);
  assert.equal(classified.ratingQuestion.id, 'q-experience');
  assert.equal(classified.textQuestions.length, 1);
  // Original had 5 questions + 1 custom => 1 rating + 4 checklist + 1 text = 6 total preserved
  assert.equal(
    1 + classified.checklistQuestions.length + classified.textQuestions.length,
    salonQuestions.length,
  );
  assert.ok(classified.checklistQuestions.some((q) => q.id === 'q-custom-hygiene'));
  assert.equal(isExperienceRatingQuestion(classified.ratingQuestion), true);

  // Best-first preset options should map lowest -> highest left-to-right onto the 5 emoji faces
  const faces = mapOptionsToFiveFaces(classified.ratingQuestion.options);
  assert.equal(faces.length, 5);
  assert.equal(faces[0].optionValue, 'Needs Improvement');
  assert.equal(faces[4].optionValue, 'Excellent');
});

test('TC-DOM-09: sanitizeEnabledFeatures includes formTemplates, qrStudio, brandingSettings with safe true defaults and explicit overrides', () => {
  const defaults = sanitizeEnabledFeatures({});
  assert.equal(defaults.formTemplates, true);
  assert.equal(defaults.qrStudio, true);
  assert.equal(defaults.brandingSettings, true);
  assert.equal(defaults.customQuestions, true);
  assert.equal(defaults.gbpAutoReply, true);
  assert.equal(defaults.weeklyReports, true);

  const restricted = sanitizeEnabledFeatures({
    formTemplates: false,
    qrStudio: false,
    brandingSettings: false,
    customQuestions: false,
  });
  assert.equal(restricted.formTemplates, false);
  assert.equal(restricted.qrStudio, false);
  assert.equal(restricted.brandingSettings, false);
  assert.equal(restricted.customQuestions, false);
  assert.equal(restricted.inStoreQrStands, true);
});

test('TC-ARCH-03: Business Management controls and Client Portal enforces formTemplates, qrStudio, and brandingSettings permissions', () => {
  const adminConsoleSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ManagementConsoleView.tsx'),
    'utf-8',
  );
  const onboardingSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/OnboardingModal.tsx'),
    'utf-8',
  );
  const clientPortalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf-8',
  );

  for (const flag of ['formTemplates', 'qrStudio', 'brandingSettings']) {
    assert.match(adminConsoleSrc, new RegExp(flag));
    assert.match(onboardingSrc, new RegExp(flag));
    assert.match(clientPortalSrc, new RegExp(flag));
  }
});

test('TC-DOM-10: getPortalTimeGreeting returns morning, afternoon, evening, and Hello at night', () => {
  assert.equal(getPortalTimeGreeting(new Date(2026, 0, 1, 8, 30)), 'Good morning');
  assert.equal(getPortalTimeGreeting(new Date(2026, 0, 1, 14, 0)), 'Good afternoon');
  assert.equal(getPortalTimeGreeting(new Date(2026, 0, 1, 18, 45)), 'Good evening');
  assert.equal(getPortalTimeGreeting(new Date(2026, 0, 1, 22, 15)), 'Hello');
  assert.equal(getPortalTimeGreeting(new Date(2026, 0, 1, 2, 0)), 'Hello');
});

test('TC-DOM-11: Package tier gating restricts standard to English and standard_plus to all 4 languages', () => {
  assert.equal(sanitizePackageTier('standard'), 'standard');
  assert.equal(sanitizePackageTier('standard_plus'), 'standard_plus');
  assert.equal(sanitizePackageTier(undefined), 'standard_plus');

  assert.deepEqual(getAllowedLanguagesForTier('standard'), ['en']);
  assert.deepEqual(getAllowedLanguagesForTier('standard_plus'), ['en', 'hi', 'mr', 'hinglish']);
  assert.equal(isLanguageAllowedForTier('hi', 'standard'), false);
  assert.equal(isLanguageAllowedForTier('en', 'standard'), true);
  assert.equal(isLanguageAllowedForTier('mr', 'standard_plus'), true);
});

test('TC-SEO-01: Contextual SEO Keyword Engine builds non-superlative location+service phrases and enforces package tier', () => {
  assert.equal(sanitizeSeoKeywordPhrase('best salon in mumbai'), 'salon in mumbai');
  assert.equal(sanitizeSeoKeywordPhrase('top-rated hair studio'), 'hair studio');
  assert.equal(sanitizeSeoKeywordPhrase('best'), '');
  assert.equal(sanitizeSeoKeywordPhrase('Haircut in Andheri West'), 'Haircut in Andheri West');

  const standardByLang = buildContextualSeoSuggestions({
    businessName: 'Urban Glow Salon',
    category: 'Hair Salons',
    locality: 'Andheri West',
    city: 'Mumbai',
    servicesOffered: ['Haircut', 'Hair Spa'],
    packageTier: 'standard',
  });
  assert.ok((standardByLang.en || []).some((k) => k.toLowerCase().includes('andheri west')));
  assert.equal(standardByLang.hi, undefined);
  assert.equal(standardByLang.mr, undefined);

  const plusByLang = buildContextualSeoSuggestions({
    businessName: 'Urban Glow Salon',
    category: 'Hair Salons',
    locality: 'Andheri West',
    city: 'Mumbai',
    servicesOffered: ['Haircut', 'Hair Spa'],
    packageTier: 'standard_plus',
  });
  assert.ok((plusByLang.en || []).length > 0);
  assert.ok((plusByLang.hi || []).length > 0);
  assert.ok((plusByLang.mr || []).length > 0);
  assert.ok((plusByLang.hinglish || []).length > 0);
});

test('TC-LIB-01: INDIA_SALON_REAL_REVIEW_DATASET covers all 4 languages and distills style metrics cleanly', () => {
  for (const lang of ['en', 'hi', 'mr', 'hinglish'] as const) {
    const profile = buildWritingStyleProfile({
      language: lang,
      referenceReviews: INDIA_SALON_REAL_REVIEW_DATASET,
    });
    assert.ok(profile.sampleCount >= 2, `Expected reference samples for ${lang}`);
    assert.ok(profile.avgWordsPerSentence > 0);
  }
});

test('TC-DOM-12: sanitizeReviewFlowMode accepts ai_drafted_instant and defaults safely to guided_questions', () => {
  assert.equal(sanitizeReviewFlowMode('ai_drafted_instant'), 'ai_drafted_instant');
  assert.equal(sanitizeReviewFlowMode('guided_questions'), 'guided_questions');
  assert.equal(sanitizeReviewFlowMode(undefined), 'guided_questions');
  assert.equal(sanitizeReviewFlowMode('unknown'), 'guided_questions');
});

test('TC-LIB-02: Backend training bank has 50-60+ reviews per language and generates 5+ varied drafts without repeating owner/location everywhere', () => {
  for (const lang of ['en', 'hi', 'mr', 'hinglish'] as const) {
    assert.ok(
      BACKEND_REVIEW_TEMPLATE_COUNTS[lang] >= 50,
      `Expected >= 50 templates for ${lang}, got ${BACKEND_REVIEW_TEMPLATE_COUNTS[lang]}`,
    );

    const drafts = selectContextualReadyDrafts({
      businessName: 'Lumina Hair Studio',
      category: 'Hair Salons',
      ownerName: 'Rahul',
      locality: 'Andheri West',
      city: 'Mumbai',
      servicesOffered: ['Haircut', 'Keratin'],
      seoKeywords: ['best hair salon in Andheri West', 'keratin treatment Andheri West'],
      language: lang,
      count: 6,
      seed: 1,
    });

    assert.ok(drafts.length >= 5, `Expected >= 5 ready drafts for ${lang}`);
    assert.equal(new Set(drafts).size, drafts.length, `Expected unique drafts for ${lang}`);

    const ownerCount = drafts.filter((d) => d.includes('Rahul')).length;
    const areaCount = drafts.filter((d) => d.includes('Andheri West')).length;
    assert.ok(ownerCount <= 2, `Owner name should appear sparingly (${ownerCount}/6) in ${lang}`);
    assert.ok(areaCount <= 3, `Location should not appear in every draft (${areaCount}/6) in ${lang}`);
    assert.equal(
      drafts.some((d) => /\bbest\b/i.test(d)),
      false,
      `Superlative hype "best" must be stripped from ready drafts in ${lang}`,
    );
  }
});

test('TC-DOM-13: Standard tier locks review flow to ai_drafted_instant while Standard Plus allows guided_questions', () => {
  assert.equal(sanitizeReviewFlowModeForTier('guided_questions', 'standard'), 'ai_drafted_instant');
  assert.equal(sanitizeReviewFlowModeForTier('ai_drafted_instant', 'standard'), 'ai_drafted_instant');
  assert.equal(sanitizeReviewFlowModeForTier('guided_questions', 'standard_plus'), 'guided_questions');
  assert.equal(sanitizeReviewFlowModeForTier('ai_drafted_instant', 'standard_plus'), 'ai_drafted_instant');
});

test('TC-DOM-14: Instant AI draft seed stays identical across reloads and advances only on explicit Refresh', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  // First load initializes to 1
  const load1 = resolvePersistedInstantSeed(mockStorage, 'rohan-salon');
  assert.equal(load1, 1);

  // Page reload returns the exact same seed without rotating drafts
  const reloadSame = resolvePersistedInstantSeed(mockStorage, 'rohan-salon');
  assert.equal(reloadSame, 1);

  // Explicit Refresh button advances seed cleanly
  const afterRefresh = advancePersistedInstantSeed(mockStorage, 'rohan-salon', reloadSame);
  assert.equal(afterRefresh, 2);

  // Subsequent reload after Refresh stays on 2
  const reloadAfterRefresh = resolvePersistedInstantSeed(mockStorage, 'rohan-salon');
  assert.equal(reloadAfterRefresh, 2);
});

test('TC-CAT-01: Clothing & Apparel, Jewelry & Gold Shops, and Local Shops & Stores are supported across presets & SEO defaults', () => {
  for (const cat of [
    'Clothing & Apparel',
    'Jewelry & Gold Shops',
    'Local Shops & Stores',
  ] as const) {
    assert.ok(BUSINESS_CATEGORIES.includes(cat), `Missing ${cat} in BUSINESS_CATEGORIES`);
    const questions = createCategoryQuestions(cat);
    assert.ok(questions.length >= 4, `Expected >=4 starter questions for ${cat}`);
    assert.ok(
      DEFAULT_SEO_KEYWORDS_BY_CATEGORY[cat].length >= 5,
      `Expected >=5 default SEO keywords for ${cat}`,
    );
  }
});

test('TC-SEO-02: Hinglish SEO keyword generator outputs Roman Hindi search phrases rather than plain English filler', () => {
  const result = buildContextualSeoSuggestions({
    businessName: 'Shree Suvarna Jewellers',
    category: 'Jewelry & Gold Shops',
    locality: 'Thane West',
    city: 'Thane',
    servicesOffered: ['Hallmark Gold', 'Bridal Designs'],
    packageTier: 'standard_plus',
  });

  const hinglishTerms = result.hinglish || [];
  assert.ok(hinglishTerms.length >= 5, 'Expected >= 5 Hinglish SEO keywords');
  const romanHindiPattern = /\b(mein|ki|ka|se|accha|bharosemand|dukaan|sone|chandi|gehne|sewa|kaam|daam|kapde|samaan|jagah)\b/i;
  for (const phrase of hinglishTerms) {
    assert.ok(
      romanHindiPattern.test(phrase),
      `Expected Roman Hindi words in Hinglish SEO phrase "${phrase}"`,
    );
  }
});

test('TC-UI-BOUNDARY-01: Client Portal hides delete/SEO/writing-library/slug/download-QR controls & public landing demo calls no live AI', () => {
  const landingPath = path.join(process.cwd(), 'src/components/LandingPage.tsx');
  const showcasePath = path.join(process.cwd(), 'src/components/landing/InteractiveShowcaseSection.tsx');
  const brandingPath = path.join(process.cwd(), 'src/components/BrandingTab.tsx');
  const qrStudioPath = path.join(process.cwd(), 'src/components/QrStudioTab.tsx');

  const landingSrc = fs.readFileSync(landingPath, 'utf8');
  const showcaseSrc = fs.readFileSync(showcasePath, 'utf8');
  const brandingSrc = fs.readFileSync(brandingPath, 'utf8');
  const qrStudioSrc = fs.readFileSync(qrStudioPath, 'utf8');

  assert.equal(landingSrc.includes('onClick={onTryDemo}'), false);
  assert.equal(showcaseSrc.includes('onClick={onTryDemo}'), false);
  assert.ok(brandingSrc.includes('requiredKeyword="DELETE"'));
  assert.ok(qrStudioSrc.includes('requiredKeyword="REGENERATE"'));
  assert.ok(qrStudioSrc.includes("requiredKeyword={isActive ? 'PAUSE' : 'ACTIVATE'}"));
});

test('TC-LOC-01: localizeQuestion translates prompts, options, and UI strings to Marathi/Hindi/Hinglish and preserves custom owner translations', () => {
  const salonQuestions = createCategoryQuestions('Hair Salons');
  const serviceQ = salonQuestions[0];
  const mrLocalized = localizeQuestion(serviceQ, 'mr');
  assert.match(mrLocalized.prompt, /[\u0900-\u097F]/, 'Expected Devanagari prompt in Marathi');
  assert.equal(mrLocalized.options[0].canonicalValue, 'Haircut');
  assert.equal(mrLocalized.options[0].displayLabel, 'हेअरकट');

  const hiUi = getLocalizedFormUiStrings('hi');
  assert.equal(hiUi.generateReviewButton, 'रिव्यू तैयार करें');

  const customQ = {
    ...serviceQ,
    translations: {
      mr: {
        prompt: 'आमची विशेष हेअर ट्रीटमेंट कशी वाटली?',
        options: ['खूप उत्तम हेअरकट'],
      },
    },
  };
  const customMr = localizeQuestion(customQ, 'mr');
  assert.equal(customMr.prompt, 'आमची विशेष हेअर ट्रीटमेंट कशी वाटली?');
  assert.equal(customMr.options[0].canonicalValue, 'Haircut');
  assert.equal(customMr.options[0].displayLabel, 'खूप उत्तम हेअरकट');

  const autoFilled = buildAutoTranslatedQuestionContent(serviceQ, 'hinglish');
  assert.ok(autoFilled.prompt.length > 5);
});

test('TC-LOC-02: transliterateRomanToDevanagari converts phonetic Roman input to Devanagari cleanly', () => {
  const out = transliterateRomanToDevanagari('tumhala aajchi seva kashi vatli?');
  assert.equal(out, 'तुम्हाला आजची सेवा कशी वाटली?');
  assert.equal(transliterateRomanToDevanagari('khup chhan'), 'खूप छान');
});

test('TC-PREV-01: CustomerReviewFlow keeps preview buttons visible while blocking generation, refresh, copy, and Google redirects', () => {
  const flowSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CustomerReviewFlow.tsx'),
    'utf8',
  );
  assert.ok(flowSrc.includes('const handleGenerateSubmit = async (e: React.FormEvent) => {\n    e.preventDefault();\n    if (isPreview) return;'));
  assert.ok(flowSrc.includes('const handleRefreshInstantAiDrafts = async () => {\n    if (isPreview) return;'));
  assert.ok(flowSrc.includes('const handleCopyAndOpenInstantReview = async (idx: number, textToCopy: string) => {\n    if (isPreview) return;'));
  assert.ok(flowSrc.includes('const handleOpenGoogleReview = () => {\n    if (isPreview) return;'));
  assert.ok(flowSrc.includes('disabled={isPreview || isGenerating'));
  assert.ok(flowSrc.includes('disabled={isPreview || !draft.trim()}'));
});

test('TC-PORTAL-01: Client Portal & Business Management show one-page Analytics with See Full Activity + dedicated FullActivityPage', () => {
  const portalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf8',
  );
  const adminSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ManagementConsoleView.tsx'),
    'utf8',
  );
  const overviewSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/OverviewTab.tsx'),
    'utf8',
  );
  const fullActivitySrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/FullActivityPage.tsx'),
    'utf8',
  );
  const cssSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/index.css'),
    'utf8',
  );

  assert.ok(portalSrc.includes('isStandardPlan'));
  assert.ok(portalSrc.includes('isGuidedQuestionsAllowed'));
  assert.ok(portalSrc.includes('destinationStats'));
  assert.ok(portalSrc.includes('Ready AI Drafts'));
  assert.ok(portalSrc.includes('FullActivityPage'));
  assert.ok(portalSrc.includes('See Full Activity'));
  assert.ok(portalSrc.includes("id: 'full_activity'"));

  assert.ok(adminSrc.includes('FullActivityPage'));
  assert.ok(adminSrc.includes("id: 'full_activity'"));
  assert.ok(adminSrc.includes('See Full Activity'));
  assert.ok(adminSrc.includes('<span>Full Activity</span>'));
  assert.ok(overviewSrc.includes('See Full Activity'));

  assert.ok(fullActivitySrc.includes('rf-scrollbar-hidden'));
  assert.ok(fullActivitySrc.includes('AI Drafted & Generated'));
  assert.ok(cssSrc.includes('.rf-scrollbar-hidden'));
});

test('TC-LOC-03: Legacy Hotel prompts/options, welcome messages, and card headers translate completely across Marathi, Hindi, and Hinglish', () => {
  const legacyStayQ = {
    id: 'hotel-legacy-1',
    prompt: 'Which parts of your stay stood out?',
    type: 'multiple' as const,
    options: [
      'Clean & Comfortable Room',
      'Convenient Location',
      'Smooth Check-In',
      'Breakfast & Dining',
      'Quiet & Restful',
    ],
    required: true,
  };

  for (const lang of ['mr', 'hi', 'hinglish'] as const) {
    const loc = localizeQuestion(legacyStayQ, lang);
    assert.notEqual(loc.prompt, legacyStayQ.prompt, `Prompt stayed raw English in ${lang}`);
    if (lang === 'mr' || lang === 'hi') {
      assert.match(loc.prompt, /[\u0900-\u097F]/);
    } else {
      assert.ok(!/[\u0900-\u097F]/.test(loc.prompt));
    }
    for (let i = 0; i < legacyStayQ.options.length; i += 1) {
      assert.notEqual(
        loc.options[i].displayLabel,
        legacyStayQ.options[i],
        `Option "${legacyStayQ.options[i]}" stayed raw English in ${lang}`,
      );
    }

    const welcome = localizeWelcomeMessage(
      'Thanks for visiting Rohan! Tap a few quick options to share your honest experience.',
      'Rohan',
      lang,
    );
    assert.ok(welcome.includes('Rohan'));
    assert.ok(!welcome.toLowerCase().includes('thanks for visiting'));

    const ui = getLocalizedFormUiStrings(lang);
    assert.notEqual(ui.shareFeedbackHeading, 'Share your feedback');
    assert.equal(ui.instantOptionLabels.length, 5);
  }
});

test('TC-PATTERN-01: Instant AI drafts output exact 5-slot pattern (Short+SEO, Professional+SEO, Detailed+SEO, Average, Poor) & Guided rotates styles', () => {
  const seoByLang = {
    en: ['Luxury stay in Pune', 'Clean hotel rooms Pune'],
    hi: ['पुणे में आरामदायक होटल कमरा', 'साफ-सुथरा परिवार होटल'],
    mr: ['पुण्यात आरामदायी हॉटेल रूम', 'स्वच्छ कौटुंबिक मुक्काम'],
    hinglish: ['Pune mein aaramdayak hotel kamra', 'Saaf aur shaant stay'],
  };

  for (const lang of ['en', 'hi', 'mr', 'hinglish'] as const) {
    const drafts = selectContextualReadyDrafts({
      businessName: 'Rohan Residency',
      category: 'Hotels',
      locality: 'Baner',
      city: 'Pune',
      servicesOffered: ['AC Rooms'],
      seoKeywords: seoByLang[lang],
      language: lang,
      seed: 1,
    });
    assert.equal(drafts.length, 5, `Expected exactly 5 drafts in ${lang}`);
    assert.ok(drafts[2].length > drafts[0].length, `Expected Detailed slot > Short slot in ${lang}`);
    assert.ok(
      seoByLang[lang].some((kw) => drafts[0].includes(kw) || drafts[1].includes(kw) || drafts[2].includes(kw)),
      `Expected SEO keyword in positive slots for ${lang}`,
    );
    if (lang === 'en') {
      assert.match(drafts[3].toLowerCase(), /okay|decent|average|fair|fine|acceptable/);
      assert.match(drafts[4].toLowerCase(), /disappointed|below|not satisfied|frustrated|would not recommend/);
    } else if (lang === 'hi' || lang === 'mr') {
      assert.match(drafts[4], /[\u0900-\u097F]/);
    } else {
      assert.ok(!/[\u0900-\u097F]/.test(drafts[4]));
    }
    for (const d of drafts) {
      assert.equal(/\bbest\b/i.test(d), false, `Disallowed superlative "best" in: ${d}`);
    }

    const refreshed = selectContextualReadyDrafts({
      businessName: 'Rohan Residency',
      category: 'Hotels',
      seoKeywords: seoByLang[lang],
      language: lang,
      seed: 2,
    });
    assert.equal(refreshed.length, 5);
    assert.notEqual(refreshed[0], drafts[0]);
  }

  const flowSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CustomerReviewFlow.tsx'),
    'utf8',
  );
  assert.ok(flowSrc.includes("const STYLE_ROTATION: ReviewStyle[] = ['short', 'detailed', 'professional'];"));
  assert.ok(flowSrc.includes('getNextReviewStyle(selectedStyle, 1)'));
});

test('TC-REPORT-01: WeeklyReportsTab hides token consumption in Client Portal, shows it in Business Portal, and validates email dispatch payload', async () => {
  const portalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf8',
  );
  const adminSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ManagementConsoleView.tsx'),
    'utf8',
  );
  const reportsSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/WeeklyReportsTab.tsx'),
    'utf8',
  );

  // Client Portal renders WeeklyReportsTab without showTokenUsage; Admin Console enables showTokenUsage
  const portalTabSnippet = portalSrc.slice(
    portalSrc.indexOf('<WeeklyReportsTab'),
    portalSrc.indexOf('<WeeklyReportsTab') + 350,
  );
  assert.equal(portalTabSnippet.includes('showTokenUsage'), false);

  const adminTabSnippet = adminSrc.slice(
    adminSrc.indexOf('<WeeklyReportsTab'),
    adminSrc.indexOf('<WeeklyReportsTab') + 350,
  );
  assert.ok(adminTabSnippet.includes('showTokenUsage'));
  assert.ok(reportsSrc.includes('showTokenUsage = false'));
  assert.ok(reportsSrc.includes('{showTokenUsage && ('));
  assert.ok(reportsSrc.includes("apiFetch('/api/weekly-report-dispatch'"));
  assert.ok(reportsSrc.includes('requireAuth: true'));

  const sampleReport = {
    businessName: 'Rohan Hotel',
    weekStart: '2026-11-23',
    weekEnd: '2026-11-29',
    reviewGenMetrics: {
      totalScans: 42,
      uniqueSessions: 36,
      formsStarted: 28,
      draftsGenerated: 20,
      googleRedirects: 15,
      confirmedGoogleReviews: 8,
      averageGoogleRating: 4.8,
      bestStandName: 'Front Desk',
      bestStandScans: 30,
      lowestStandName: 'Lobby',
      lowestStandScans: 12,
    },
    autoReplyMetrics: {
      totalNewReviews: 8,
      aiRepliesGenerated: 8,
      autoPublished: 6,
      manuallyApproved: 2,
      waitingApproval: 0,
      failedReplies: 0,
      ignoredReviews: 0,
    },
    aiUsageMetrics: {
      totalRequests: 28,
      successfulRequests: 28,
      failedRequests: 0,
      totalTokens: 12500,
      estimatedCostUsd: 0.0125,
    },
  };

  const clientEmail = buildWeeklyReportEmailContent({
    report: sampleReport,
    includeAiUsage: false,
  });
  assert.equal(clientEmail.text.includes('Total Tokens'), false);
  assert.equal(clientEmail.html.includes('Estimated Cost'), false);

  const adminEmail = buildWeeklyReportEmailContent({
    report: sampleReport,
    includeAiUsage: true,
  });
  assert.ok(adminEmail.text.includes('12,500'));
  assert.ok(adminEmail.html.includes('$0.0125'));

  const dispatchRes = await processDispatchWeeklyReportEmail(
    {
      businessId: 'biz_test_1',
      recipients: ['owner@rohanhotel.com'],
      includeAiUsage: true,
      report: sampleReport,
    },
    { allowAiUsageSection: false },
  );
  assert.equal(dispatchRes.status, 200);
  assert.equal(dispatchRes.data.emailSent, false);
  assert.equal(dispatchRes.data.configured, false);

  // Domain typo validation (e.g. gmail.co -> gmail.com) on both frontend and backend
  const typoFrontend = parseAndValidateRecipientEmails('somnathbiswal2007@gmail.co');
  assert.equal(typoFrontend.ok, false);
  if (!typoFrontend.ok) {
    assert.equal(typoFrontend.suggestion?.fixedEmail, 'somnathbiswal2007@gmail.com');
  }
  const mixedFrontend = parseAndValidateRecipientEmails('owner@rohanhotel.com, bad-email');
  assert.equal(mixedFrontend.ok, false);
  const validFrontend = parseAndValidateRecipientEmails('SomnathBiswal2007@gmail.com, owner@rohanhotel.com');
  assert.equal(validFrontend.ok, true);
  if (validFrontend.ok) {
    assert.deepEqual(validFrontend.emails, ['somnathbiswal2007@gmail.com', 'owner@rohanhotel.com']);
  }

  const typoBackend = await processDispatchWeeklyReportEmail(
    {
      businessId: 'biz_test_1',
      recipients: ['somnathbiswal2007@gmail.co'],
      includeAiUsage: false,
      report: sampleReport,
    },
    { allowAiUsageSection: false },
  );
  assert.equal(typoBackend.status, 400);
  assert.match(String(typoBackend.data.error), /somnathbiswal2007@gmail\.com/);
});

test('TC-UI-TOAST-01: Error and success banners auto-dismiss after 5 seconds across portal views', () => {
  const hookSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/hooks/useAutoDismiss.ts'),
    'utf8',
  );
  assert.ok(hookSrc.includes('export const AUTO_DISMISS_MS = 5000;'));

  for (const rel of [
    'src/components/WeeklyReportsTab.tsx',
    'src/components/BrandingTab.tsx',
    'src/components/QuestionBuilderTab.tsx',
    'src/components/TemplatesTab.tsx',
    'src/components/QrStudioTab.tsx',
    'src/components/QrStandsTab.tsx',
    'src/components/GbpAutoReplyTab.tsx',
    'src/components/ManagementConsoleView.tsx',
    'src/components/ClientPortalView.tsx',
  ]) {
    const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    assert.ok(src.includes('useAutoDismiss('), `Missing useAutoDismiss in ${rel}`);
  }
});

test('TC-REVIEW-CARDS-01: Instant cards show Review 1..5 labels cleanly and Guided Generate rotates short/detailed/professional while ending Poor feedback constructively', () => {
  assert.equal(getLocalizedFormUiStrings('en').instantReviewCardLabel(1), 'Review 1');
  assert.equal(getLocalizedFormUiStrings('en').instantReviewCardLabel(5), 'Review 5');
  assert.equal(getLocalizedFormUiStrings('hinglish').instantReviewCardLabel(2), 'Review 2');
  assert.equal(getLocalizedFormUiStrings('hi').instantReviewCardLabel(3), 'रिव्यू 3');
  assert.equal(getLocalizedFormUiStrings('mr').instantReviewCardLabel(4), 'रिव्ह्यू 4');

  const flowSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CustomerReviewFlow.tsx'),
    'utf8',
  );
  assert.ok(flowSrc.includes('instantUi.instantReviewCardLabel(idx + 1)'));
  assert.ok(!flowSrc.includes('Option {idx + 1}'));
  assert.ok(flowSrc.includes('reviewflow_style_idx_'));
  assert.ok(flowSrc.includes('const shouldRotateOnSubmit = hasGeneratedOnceRef.current;'));

  for (const lang of ['en', 'hinglish', 'hi', 'mr'] as const) {
    const shortRes = composeGroundedFallbackReview({
      businessName: 'Rohan Salon',
      responses: [{ question: 'How was your visit?', answers: ['Good'] }],
      style: 'short',
      language: lang,
      variationSeed: 1,
    });
    const detailedRes = composeGroundedFallbackReview({
      businessName: 'Rohan Salon',
      responses: [{ question: 'How was your visit?', answers: ['Good'] }],
      style: 'detailed',
      language: lang,
      variationSeed: 1,
    });
    assert.ok(
      detailedRes.reviewText.length > shortRes.reviewText.length,
      `Expected detailed fallback > short fallback for ${lang}`,
    );

    const poorRes = composeGroundedFallbackReview({
      businessName: 'Rohan Salon',
      responses: [{ question: 'How was your visit?', answers: ['Very poor', 'Slow'] }],
      style: 'detailed',
      language: lang,
      variationSeed: 1,
    });
    assert.ok(poorRes.sentiment === 'negative' || poorRes.sentiment === 'very_negative');
    assert.equal(
      /would consider returning|dobara aane ka mann nahi karega|दोबारा आने का मन नहीं करेगा|पुन्हा येण्याची इच्छा वाटत नाही/i.test(
        poorRes.reviewText,
      ),
      false,
      `Expected constructive positive closing for ${lang}: ${poorRes.reviewText}`,
    );
  }
});





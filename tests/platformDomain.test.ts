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
  getTimestampMs,
  isMondayToday,
  normalizeEmail,
  resolveVisitorQuotaState,
  sanitizeAccessLevel,
  sanitizeEnabledFeatures,
  sanitizeFormTemplate,
  sanitizeGbpSettings,
  sanitizeSlug,
  sanitizeWeeklyReportConfig,
} from '../src/utils/domainHelpers.ts';
import {
  FORM_TEMPLATES,
  classifyQuestionsForTemplate,
  isExperienceRatingQuestion,
  mapOptionsToFiveFaces,
} from '../src/data/formTemplates.ts';
import { createCategoryQuestions } from '../src/data/categoryPresets.ts';

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

test('TC-ARCH-01: GBP OAuth connection is strictly restricted to ManagementConsoleView (not ClientPortalView)', () => {
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

  // ClientPortalView passes allowOAuthConnection={false}
  assert.match(clientPortalSrc, /<GbpAutoReplyTab[\s\S]*allowOAuthConnection=\{false\}/);
  // ManagementConsoleView explicitly enables allowOAuthConnection
  assert.match(adminConsoleSrc, /<GbpAutoReplyTab[\s\S]*allowOAuthConnection/);
  // GbpAutoReplyTab defaults allowOAuthConnection to false
  assert.match(gbpTabSrc, /allowOAuthConnection\s*=\s*false/);
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

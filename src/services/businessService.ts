import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch, parseApiJson } from '../utils/apiClient';
import { sanitizeExternalUrl, sanitizeLogoDataUrl } from '../utils/urlAndAuth';
import {
  DEFAULT_ENABLED_FEATURES,
  DEFAULT_SEO_KEYWORDS_BY_CATEGORY,
} from '../data/categoryPresets';
import type {
  AdminEmail,
  AdminUser,
  AiOperationType,
  Business,
  BusinessBranding,
  BusinessCategory,
  BusinessStats,
  ClientAccessLevel,
  EnabledFeatures,
  FeedbackQuestion,
  FeedbackSubmissionResponse,
  FormTemplateId,
  GbpReplySettings,
  LocalizedQuestionContent,
  PackageTier,
  PublicProfile,
  QrConfig,
  ReferenceReviewItem,
  ReviewDraft,
  ReviewDraftStatus,
  ReviewEvent,
  ReviewEventType,
  ReviewFlowMode,
  ReviewLanguage,
  ReviewStyle,
  WeeklyReportConfig,
} from '../types';

import {
  clampString,
  getAllowedLanguagesForTier,
  normalizeEmail,
  sanitizeAccessLevel,
  sanitizeEnabledFeatures,
  sanitizeFormTemplate,
  sanitizeGbpSettings,
  sanitizePackageTier,
  sanitizeReviewFlowMode,
  sanitizeReviewFlowModeForTier,
  sanitizeShortTagList,
  sanitizeSlug,
  sanitizeWeeklyReportConfig,
} from '../utils/domainHelpers';
import {
  buildContextualSeoSuggestions,
  sanitizeSeoSuggestionList,
} from '../utils/seoKeywordEngine';

export {
  normalizeEmail,
  sanitizeGbpSettings,
  sanitizeSlug,
  sanitizeWeeklyReportConfig,
};

export const BOOTSTRAPPED_ADMIN_EMAIL = (
  import.meta.env.VITE_ADMIN_EMAIL || ''
)
  .trim()
  .toLowerCase();

export function generateRandomToken(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function sanitizeColorHex(val: unknown, fallback: string): string {
  const clean = clampString(val, 20);
  return clean.length >= 4 ? clean : fallback;
}

function sanitizeBranding(branding?: Partial<BusinessBranding>): BusinessBranding {
  const questionColorRaw = clampString(branding?.questionColor, 20);
  const backgroundColorRaw = clampString(branding?.backgroundColor, 20);
  return {
    primaryColor: sanitizeColorHex(branding?.primaryColor, '#0F766E'),
    secondaryColor: sanitizeColorHex(branding?.secondaryColor, '#0F172A'),
    ...(questionColorRaw.length >= 4 ? { questionColor: questionColorRaw } : {}),
    ...(backgroundColorRaw.length >= 4 ? { backgroundColor: backgroundColorRaw } : {}),
    welcomeMessage: clampString(branding?.welcomeMessage, 240),
    thankYouMessage: clampString(branding?.thankYouMessage, 240),
    defaultReviewStyle:
      branding?.defaultReviewStyle === 'short' ||
      branding?.defaultReviewStyle === 'detailed' ||
      branding?.defaultReviewStyle === 'professional'
        ? branding.defaultReviewStyle
        : 'short',
  };
}

function sanitizeQrConfig(qrConfig?: Partial<QrConfig>, fallbackToken = 'v1token'): QrConfig {
  const rawToken = clampString(qrConfig?.token, 64);
  return {
    isActive: qrConfig?.isActive ?? true,
    fgColor: sanitizeColorHex(qrConfig?.fgColor, '#0F172A'),
    bgColor: sanitizeColorHex(qrConfig?.bgColor, '#FFFFFF'),
    token: rawToken.length >= 4 ? rawToken : fallbackToken,
    includeLogo: Boolean(qrConfig?.includeLogo),
  };
}

function sanitizeQuestionTranslations(
  rawTranslations: FeedbackQuestion['translations'],
  fallbackOptionCount: number,
): FeedbackQuestion['translations'] | undefined {
  if (!rawTranslations || typeof rawTranslations !== 'object') return undefined;
  const clean: Partial<Record<ReviewLanguage, LocalizedQuestionContent>> = {};
  const langs: ReviewLanguage[] = ['en', 'hi', 'mr', 'hinglish'];
  for (const lang of langs) {
    const entry = rawTranslations[lang];
    if (!entry || typeof entry !== 'object') continue;
    const prompt = clampString(entry.prompt, 220);
    const placeholder = clampString(entry.placeholder, 200);
    const options = Array.isArray(entry.options)
      ? entry.options
          .slice(0, Math.max(20, fallbackOptionCount))
          .map((opt) => clampString(opt, 100))
      : [];
    if (prompt || placeholder || options.some(Boolean)) {
      clean[lang] = {
        prompt,
        options,
        ...(placeholder ? { placeholder } : {}),
      };
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function sanitizeQuestions(questions: FeedbackQuestion[]): FeedbackQuestion[] {
  return questions.slice(0, 25).map((q, idx) => {
    const options = Array.isArray(q.options)
      ? q.options
          .map((opt) => clampString(opt, 80))
          .filter(Boolean)
          .slice(0, 20)
      : [];
    const translations = sanitizeQuestionTranslations(q.translations, options.length);
    return {
      id: clampString(q.id, 64) || `q-${idx + 1}`,
      prompt: clampString(q.prompt, 180) || 'Untitled Question',
      type: q.type === 'single' || q.type === 'multiple' || q.type === 'text' ? q.type : 'single',
      options,
      required: Boolean(q.required),
      ...(q.placeholder ? { placeholder: clampString(q.placeholder, 160) } : {}),
      ...(translations ? { translations } : {}),
    };
  });
}

function sanitizeSeoKeywords(keywords?: unknown): string[] {
  return sanitizeSeoSuggestionList(keywords, 15);
}

function sanitizeSeoKeywordsByLanguageMap(
  raw?: unknown,
): Partial<Record<ReviewLanguage, string[]>> {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const result: Partial<Record<ReviewLanguage, string[]>> = {};
  const langs: ReviewLanguage[] = ['en', 'hi', 'mr', 'hinglish'];
  for (const lang of langs) {
    const cleaned = sanitizeSeoSuggestionList(source[lang], 10);
    if (cleaned.length > 0) {
      result[lang] = cleaned;
    }
  }
  return result;
}

function sanitizeReferenceReviewsList(raw?: unknown): ReferenceReviewItem[] {
  if (!Array.isArray(raw)) return [];
  const clean: ReferenceReviewItem[] = [];
  const seenText = new Set<string>();
  for (let idx = 0; idx < raw.length; idx += 1) {
    const item = raw[idx];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<ReferenceReviewItem>;
    const text = clampString(obj.text, 500);
    if (text.length < 10) continue;
    const key = text.toLowerCase();
    if (seenText.has(key)) continue;
    seenText.add(key);

    const lang: ReviewLanguage =
      obj.language === 'hi' || obj.language === 'mr' || obj.language === 'hinglish'
        ? obj.language
        : 'en';
    const sentiment =
      obj.sentiment === 'neutral' || obj.sentiment === 'mixed' || obj.sentiment === 'negative'
        ? obj.sentiment
        : 'positive';

    clean.push({
      id: clampString(obj.id, 64) || `ref-${idx + 1}`,
      language: lang,
      sentiment,
      text,
      ...(obj.source ? { source: clampString(obj.source, 80) } : {}),
    });
    if (clean.length >= 25) break;
  }
  return clean;
}

export async function fetchContextualSeoKeywords(input: {
  businessName: string;
  category: BusinessCategory;
  address?: string;
  locality?: string;
  city?: string;
  servicesOffered?: string[];
  productsOffered?: string[];
  businessHighlights?: string;
  packageTier?: PackageTier;
}): Promise<{
  keywords: string[];
  keywordsByLanguage: Partial<Record<ReviewLanguage, string[]>>;
  allowedLanguages: ReviewLanguage[];
}> {
  const cleanTier = sanitizePackageTier(input.packageTier);
  const allowedLanguages = getAllowedLanguagesForTier(cleanTier);
  const localByLang = buildContextualSeoSuggestions({
    businessName: input.businessName,
    category: input.category,
    locality: input.locality,
    city: input.city,
    address: input.address,
    servicesOffered: input.servicesOffered,
    productsOffered: input.productsOffered,
    packageTier: cleanTier,
  });
  const localKeywords = localByLang.en || [];
  try {
    const res = await apiFetch('/api/generate-seo-keywords', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        businessName: input.businessName,
        category: input.category,
        address: input.address ?? '',
        locality: input.locality ?? '',
        city: input.city ?? '',
        servicesOffered: input.servicesOffered ?? [],
        productsOffered: input.productsOffered ?? [],
        businessHighlights: input.businessHighlights ?? '',
        packageTier: cleanTier,
      }),
    });
    if (res.ok) {
      const parsed = await parseApiJson<{
        keywords?: unknown;
        keywordsByLanguage?: unknown;
      }>(res);
      const apiKeywords = sanitizeSeoKeywords(parsed.data?.keywords);
      const apiByLang = sanitizeSeoKeywordsByLanguageMap(parsed.data?.keywordsByLanguage);
      if (apiKeywords.length > 0) {
        return {
          keywords: apiKeywords,
          keywordsByLanguage:
            Object.keys(apiByLang).length > 0 ? apiByLang : localByLang,
          allowedLanguages,
        };
      }
    }
  } catch {
    // Fallback cleanly to deterministic contextual SEO engine
  }
  return {
    keywords: localKeywords,
    keywordsByLanguage: localByLang,
    allowedLanguages,
  };
}

export async function fetchAutoSeoKeywords(input: {
  businessName: string;
  category: BusinessCategory;
  address?: string;
  locality?: string;
  city?: string;
  servicesOffered?: string[];
  productsOffered?: string[];
  businessHighlights?: string;
  packageTier?: PackageTier;
}): Promise<string[]> {
  const result = await fetchContextualSeoKeywords(input);
  return result.keywords.length > 0
    ? result.keywords
    : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category] ?? [];
}

const ALLOWED_BRANDING_KEYS = new Set([
  'primaryColor',
  'secondaryColor',
  'questionColor',
  'backgroundColor',
  'welcomeMessage',
  'thankYouMessage',
  'defaultReviewStyle',
]);
const ALLOWED_QR_KEYS = new Set(['isActive', 'fgColor', 'bgColor', 'token', 'includeLogo']);
const ALLOWED_FEATURE_KEYS = new Set([
  'aiReviewDrafts',
  'customQuestions',
  'pdfPosterExport',
  'analyticsView',
  'inStoreQrStands',
  'gbpAutoReply',
  'weeklyReports',
  'formTemplates',
  'qrStudio',
  'brandingSettings',
]);

const rawNeedsBrandingRepair = new WeakSet<Business>();
const rawNeedsQrRepair = new WeakSet<Business>();
const rawNeedsFeaturesRepair = new WeakSet<Business>();
const rawNeedsCoreStringsRepair = new WeakSet<Business>();

function needsBrandingRepair(b?: Partial<BusinessBranding>): boolean {
  if (!b || typeof b !== 'object') return true;
  const keys = Object.keys(b);
  if (keys.some((k) => !ALLOWED_BRANDING_KEYS.has(k))) return true;
  if (
    b.questionColor !== undefined &&
    b.questionColor !== null &&
    (typeof b.questionColor !== 'string' ||
      b.questionColor.length < 4 ||
      b.questionColor.length > 20)
  ) {
    return true;
  }
  if (
    b.backgroundColor !== undefined &&
    b.backgroundColor !== null &&
    (typeof b.backgroundColor !== 'string' ||
      b.backgroundColor.length < 4 ||
      b.backgroundColor.length > 20)
  ) {
    return true;
  }
  return (
    typeof b.primaryColor !== 'string' ||
    b.primaryColor.length < 4 ||
    b.primaryColor.length > 20 ||
    typeof b.secondaryColor !== 'string' ||
    b.secondaryColor.length < 4 ||
    b.secondaryColor.length > 20 ||
    typeof b.welcomeMessage !== 'string' ||
    b.welcomeMessage.length > 240 ||
    typeof b.thankYouMessage !== 'string' ||
    b.thankYouMessage.length > 240 ||
    (b.defaultReviewStyle !== 'short' &&
      b.defaultReviewStyle !== 'detailed' &&
      b.defaultReviewStyle !== 'professional')
  );
}

function needsQrConfigRepair(q?: Partial<QrConfig>): boolean {
  if (!q || typeof q !== 'object') return true;
  const keys = Object.keys(q);
  if (keys.some((k) => !ALLOWED_QR_KEYS.has(k))) return true;
  return (
    typeof q.isActive !== 'boolean' ||
    typeof q.fgColor !== 'string' ||
    q.fgColor.length < 4 ||
    q.fgColor.length > 20 ||
    typeof q.bgColor !== 'string' ||
    q.bgColor.length < 4 ||
    q.bgColor.length > 20 ||
    typeof q.token !== 'string' ||
    q.token.length < 4 ||
    q.token.length > 64 ||
    typeof q.includeLogo !== 'boolean'
  );
}

function needsFeaturesRepair(f?: Partial<EnabledFeatures>): boolean {
  if (!f || typeof f !== 'object') return true;
  const keys = Object.keys(f);
  if (keys.some((k) => !ALLOWED_FEATURE_KEYS.has(k))) return true;
  return (
    typeof f.aiReviewDrafts !== 'boolean' ||
    typeof f.customQuestions !== 'boolean' ||
    typeof f.pdfPosterExport !== 'boolean' ||
    typeof f.analyticsView !== 'boolean'
  );
}

const VALID_BUSINESS_CATEGORIES = new Set<BusinessCategory>([
  'Restaurants',
  'Hair Salons',
  'Beauty Salons',
  'Hotels',
  'Spas',
  'Gyms',
  'Healthcare',
  'Retail Stores',
  'Clothing & Apparel',
  'Jewelry & Gold Shops',
  'Local Shops & Stores',
  'Automobile Services',
  'Other Businesses',
]);

function sanitizeBusinessCategory(cat: unknown): BusinessCategory {
  if (typeof cat === 'string' && VALID_BUSINESS_CATEGORIES.has(cat as BusinessCategory)) {
    return cat as BusinessCategory;
  }
  return 'Other Businesses';
}

function needsCoreBusinessStringsRepair(raw: Record<string, unknown>): boolean {
  return (
    typeof raw.name !== 'string' ||
    raw.name.trim().length < 1 ||
    raw.name.length > 120 ||
    typeof raw.address !== 'string' ||
    raw.address.length > 240 ||
    typeof raw.phone !== 'string' ||
    raw.phone.length > 40 ||
    typeof raw.contactEmail !== 'string' ||
    raw.contactEmail.length > 120 ||
    typeof raw.googleReviewUrl !== 'string' ||
    raw.googleReviewUrl.length > 500 ||
    typeof raw.logoDataUrl !== 'string' ||
    raw.logoDataUrl.length > 350000 ||
    !Array.isArray(raw.questions) ||
    raw.questions.length > 25 ||
    !VALID_BUSINESS_CATEGORIES.has(raw.category as BusinessCategory)
  );
}

function needsOptionalBusinessFieldRepair(raw: Record<string, unknown>): {
  ownerName: boolean;
  clientUid: boolean;
  website: boolean;
  seoKeywords: boolean;
  seoKeywordsByLanguage: boolean;
  referenceReviews: boolean;
  formTemplate: boolean;
  locality: boolean;
  city: boolean;
  businessHighlights: boolean;
  qrStandLimit: boolean;
  gbpSettings: boolean;
  weeklyReportConfig: boolean;
  clientEmail: boolean;
  clientAccessLevel: boolean;
} {
  const gbp = raw.gbpSettings as Record<string, unknown> | undefined;
  const gbpValid =
    gbp === undefined ||
    gbp === null ||
    (typeof gbp === 'object' &&
      (gbp.fiveStarMode === 'auto_publish' || gbp.fiveStarMode === 'approval_required') &&
      (gbp.midStarMode === 'auto_publish' || gbp.midStarMode === 'approval_required') &&
      gbp.lowStarMode === 'manual_approval_only' &&
      typeof gbp.brandVoice === 'string' &&
      gbp.brandVoice.length <= 400 &&
      typeof gbp.autoSyncEnabled === 'boolean' &&
      Object.keys(gbp).every((k) =>
        ['fiveStarMode', 'midStarMode', 'lowStarMode', 'brandVoice', 'autoSyncEnabled'].includes(k),
      ));

  const wrc = raw.weeklyReportConfig as Record<string, unknown> | undefined;
  const wrcValid =
    wrc === undefined ||
    wrc === null ||
    (typeof wrc === 'object' &&
      typeof wrc.enabled === 'boolean' &&
      Array.isArray(wrc.recipients) &&
      wrc.recipients.length <= 10 &&
      (wrc.recipients.length === 0 ||
        (typeof wrc.recipients[0] === 'string' && wrc.recipients[0].length <= 120)) &&
      typeof wrc.autoMondayEnabled === 'boolean' &&
      (!('lastGeneratedWeekKey' in wrc) ||
        (typeof wrc.lastGeneratedWeekKey === 'string' && wrc.lastGeneratedWeekKey.length <= 24)) &&
      Object.keys(wrc).every((k) =>
        ['enabled', 'recipients', 'autoMondayEnabled', 'lastGeneratedWeekKey'].includes(k),
      ));

  const rawSeoLang = raw.seoKeywordsByLanguage;
  const seoByLangInvalid =
    'seoKeywordsByLanguage' in raw &&
    rawSeoLang !== null &&
    (typeof rawSeoLang !== 'object' ||
      Array.isArray(rawSeoLang) ||
      Object.keys(rawSeoLang as Record<string, unknown>).some(
        (k) => !['en', 'hi', 'mr', 'hinglish'].includes(k),
      ));

  return {
    ownerName:
      'ownerName' in raw &&
      raw.ownerName !== null &&
      (typeof raw.ownerName !== 'string' || raw.ownerName.length > 120),
    clientUid:
      'clientUid' in raw &&
      raw.clientUid !== null &&
      (typeof raw.clientUid !== 'string' || raw.clientUid.length > 128),
    website:
      'website' in raw &&
      raw.website !== null &&
      (typeof raw.website !== 'string' || raw.website.length > 300),
    seoKeywords:
      'seoKeywords' in raw &&
      raw.seoKeywords !== null &&
      (!Array.isArray(raw.seoKeywords) ||
        raw.seoKeywords.length > 15 ||
        raw.seoKeywords.some((k) => typeof k !== 'string' || k.length > 60)),
    seoKeywordsByLanguage: seoByLangInvalid,
    referenceReviews:
      'referenceReviews' in raw &&
      raw.referenceReviews !== null &&
      (!Array.isArray(raw.referenceReviews) || raw.referenceReviews.length > 45),
    formTemplate:
      'formTemplate' in raw &&
      raw.formTemplate !== null &&
      sanitizeFormTemplate(raw.formTemplate) !== raw.formTemplate,
    locality:
      'locality' in raw &&
      raw.locality !== null &&
      (typeof raw.locality !== 'string' || raw.locality.length > 120),
    city:
      'city' in raw &&
      raw.city !== null &&
      (typeof raw.city !== 'string' || raw.city.length > 120),
    businessHighlights:
      'businessHighlights' in raw &&
      raw.businessHighlights !== null &&
      (typeof raw.businessHighlights !== 'string' || raw.businessHighlights.length > 600),
    qrStandLimit:
      'qrStandLimit' in raw &&
      raw.qrStandLimit !== null &&
      (typeof raw.qrStandLimit !== 'number' ||
        !Number.isInteger(raw.qrStandLimit) ||
        raw.qrStandLimit < 1 ||
        raw.qrStandLimit > 100),
    gbpSettings: !gbpValid,
    weeklyReportConfig: !wrcValid,
    clientEmail: typeof raw.clientEmail !== 'string' || raw.clientEmail.length > 120,
    clientAccessLevel:
      raw.clientAccessLevel !== 'read_only' &&
      raw.clientAccessLevel !== 'qr_and_questions' &&
      raw.clientAccessLevel !== 'full',
  };
}

function hydrateBusiness(id: string, raw: Record<string, unknown>): Business {
  const data = raw as Partial<Business>;
  const category = (data.category as BusinessCategory) || 'Other Businesses';
  const hydratedKeywords = sanitizeSeoKeywords(data.seoKeywords);
  const normalizedClientEmail = normalizeEmail(data.clientEmail || '');
  const rawLimit = Number(data.qrStandLimit);
  const hydratedPackageTier = sanitizePackageTier(data.packageTier);
  const hydrated: Business = {
    id,
    ownerId: data.ownerId || '',
    ownerName: clampString(data.ownerName, 120),
    packageTier: hydratedPackageTier,
    reviewFlowMode: sanitizeReviewFlowModeForTier(data.reviewFlowMode, hydratedPackageTier),
    allowClientFlowModeSwitch:
      hydratedPackageTier === 'standard' ? false : data.allowClientFlowModeSwitch !== false,
    clientEmail: normalizedClientEmail,
    clientUid: clampString(data.clientUid, 128),
    clientAccessLevel: sanitizeAccessLevel(data.clientAccessLevel),
    enabledFeatures: sanitizeEnabledFeatures(data.enabledFeatures),
    slug: data.slug || '',
    name: data.name || 'Business',
    category,
    address: data.address || '',
    locality: clampString(data.locality, 120),
    city: clampString(data.city, 120),
    servicesOffered: sanitizeShortTagList(data.servicesOffered, 15, 60),
    productsOffered: sanitizeShortTagList(data.productsOffered, 15, 60),
    businessHighlights: clampString(data.businessHighlights, 500),
    phone: data.phone || '',
    contactEmail: data.contactEmail || '',
    website: clampString(data.website, 300),
    googleReviewUrl: data.googleReviewUrl || '',
    logoDataUrl: sanitizeLogoDataUrl(data.logoDataUrl),
    branding: sanitizeBranding(data.branding),
    qrConfig: sanitizeQrConfig(data.qrConfig, 'v1token'),
    questions: Array.isArray(data.questions) ? data.questions : [],
    formTemplate: sanitizeFormTemplate(data.formTemplate),
    seoKeywords:
      hydratedKeywords.length > 0
        ? hydratedKeywords
        : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[category] ?? [],
    seoKeywordsByLanguage: sanitizeSeoKeywordsByLanguageMap(data.seoKeywordsByLanguage),
    referenceReviews: sanitizeReferenceReviewsList(data.referenceReviews),
    qrStandLimit: Number.isInteger(rawLimit) && rawLimit >= 1 ? rawLimit : 4,
    gbpSettings: sanitizeGbpSettings(data.gbpSettings),
    weeklyReportConfig: sanitizeWeeklyReportConfig(data.weeklyReportConfig, normalizedClientEmail),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
  if (needsBrandingRepair(data.branding)) {
    rawNeedsBrandingRepair.add(hydrated);
  }
  if (needsQrConfigRepair(data.qrConfig)) {
    rawNeedsQrRepair.add(hydrated);
  }
  if (needsFeaturesRepair(data.enabledFeatures)) {
    rawNeedsFeaturesRepair.add(hydrated);
  }
  if (needsCoreBusinessStringsRepair(raw)) {
    rawNeedsCoreStringsRepair.add(hydrated);
  }
  return hydrated;
}

export async function checkIsAdmin(user: User): Promise<boolean> {
  const emailLower = normalizeEmail(user.email || '');
  if (
    BOOTSTRAPPED_ADMIN_EMAIL &&
    user.emailVerified &&
    emailLower === BOOTSTRAPPED_ADMIN_EMAIL
  ) {
    return true;
  }
  try {
    const checks: Promise<boolean>[] = [
      getDoc(doc(db, 'admins', user.uid))
        .then((snap) => snap.exists())
        .catch(() => false),
    ];
    if (emailLower) {
      checks.push(
        getDoc(doc(db, 'adminEmails', emailLower))
          .then((snap) => snap.exists())
          .catch(() => false),
      );
    }
    const result = await Promise.race([
      Promise.all(checks).then((flags) => flags.some(Boolean)),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 8000);
      }),
    ]);
    return result;
  } catch {
    return false;
  }
}

export function subscribeToAllBusinesses(
  onData: (businesses: Business[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'businesses';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) =>
        hydrateBusiness(docSnap.id, docSnap.data() as Record<string, unknown>),
      );
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToClientBusinesses(
  userUid: string,
  userEmail: string,
  onData: (businesses: Business[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const normalizedEmail = normalizeEmail(userEmail);
  const byOwner = new Map<string, Business>();
  const byEmail = new Map<string, Business>();
  let ownerReady = false;
  let emailReady = !normalizedEmail;

  const emitMerged = () => {
    if (!ownerReady || !emailReady) return;
    const combined = new Map<string, Business>();
    byOwner.forEach((v, k) => combined.set(k, v));
    byEmail.forEach((v, k) => combined.set(k, v));
    onData(Array.from(combined.values()));
  };

  const qOwner = query(collection(db, 'businesses'), where('ownerId', '==', userUid));
  const unsubOwner = onSnapshot(
    qOwner,
    (snapshot) => {
      byOwner.clear();
      snapshot.docs.forEach((d) => {
        const biz = hydrateBusiness(d.id, d.data() as Record<string, unknown>);
        const assignedEmail = (biz.clientEmail || '').trim().toLowerCase();
        if (assignedEmail && assignedEmail !== normalizedEmail) return;
        byOwner.set(d.id, biz);
      });
      ownerReady = true;
      emitMerged();
    },
    (error) => {
      ownerReady = true;
      emitMerged();
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'businesses');
      } catch {
        // logged
      }
    },
  );

  let unsubEmail: Unsubscribe = () => {};
  if (normalizedEmail) {
    const qEmail = query(
      collection(db, 'businesses'),
      where('clientEmail', '==', normalizedEmail),
    );
    unsubEmail = onSnapshot(
      qEmail,
      (snapshot) => {
        byEmail.clear();
        snapshot.docs.forEach((d) => {
          byEmail.set(d.id, hydrateBusiness(d.id, d.data() as Record<string, unknown>));
        });
        emailReady = true;
        emitMerged();
      },
      (error) => {
        emailReady = true;
        emitMerged();
        if (onError) onError(error);
        try {
          handleFirestoreError(error, OperationType.LIST, 'businesses');
        } catch {
          // logged
        }
      },
    );
  }

  return () => {
    unsubOwner();
    unsubEmail();
  };
}

export function subscribeToAllBusinessStats(
  onData: (statsMap: Record<string, BusinessStats>) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'businessStats'),
    (snapshot) => {
      const map: Record<string, BusinessStats> = {};
      snapshot.docs.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data() as BusinessStats;
      });
      onData(map);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'businessStats');
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToBusinessStats(
  businessId: string,
  onData: (stats: BusinessStats | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `businessStats/${businessId}`;
  return onSnapshot(
    doc(db, 'businessStats', businessId),
    (docSnap) => {
      if (!docSnap.exists()) {
        onData(null);
      } else {
        onData(docSnap.data() as BusinessStats);
      }
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToAllEvents(
  onData: (events: ReviewEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'reviewEvents';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(500));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReviewEvent[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ReviewEvent, 'id'>;
        return {
          ...data,
          id: docSnap.id,
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // logged
      }
    },
  );
}

function getEventTimeMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: unknown;
      _seconds?: unknown;
    };
    if (typeof candidate.toMillis === 'function') {
      try {
        const ms = candidate.toMillis();
        if (Number.isFinite(ms)) return ms;
      } catch {
        // Fallback to seconds fields below
      }
    }
    if (typeof candidate.toDate === 'function') {
      try {
        const ms = candidate.toDate().getTime();
        if (Number.isFinite(ms)) return ms;
      } catch {
        // Fallback to seconds fields below
      }
    }
    const rawSeconds = candidate.seconds ?? candidate._seconds;
    if (rawSeconds !== undefined && rawSeconds !== null) {
      const sec = Number(rawSeconds);
      if (Number.isFinite(sec)) return sec * 1000;
    }
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function claimBusinessClientUid(
  business: Business,
  clientUid: string,
): Promise<{ ok: boolean; error?: string }> {
  const cleanUid = clampString(clientUid, 128);
  if (!cleanUid || business.clientUid === cleanUid) return { ok: true };
  const now = serverTimestamp();

  try {
    await updateDoc(doc(db, 'businesses', business.id), {
      clientUid: cleanUid,
      updatedAt: now,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, error: raw };
  }

  try {
    await updateDoc(doc(db, 'publicProfiles', business.slug), {
      clientUid: cleanUid,
      updatedAt: now,
    });
  } catch {
    // Non-blocking if publicProfile doc is missing or paused
  }

  return { ok: true };
}

export function subscribeToBusinessEvents(
  businessId: string,
  ownerId: string,
  viewerUid: string,
  isAdmin: boolean,
  onData: (events: ReviewEvent[]) => void,
  onError?: (err: Error) => void,
  clientUid?: string,
): Unsubscribe {
  const isOwner = ownerId === viewerUid;
  const isLinkedClient = Boolean(clientUid && clientUid === viewerUid);

  if (!isAdmin && !isOwner && !isLinkedClient) {
    onData([]);
    return () => {};
  }

  const path = 'reviewEvents';
  const q = isAdmin
    ? query(collection(db, path), where('businessId', '==', businessId), limit(1000))
    : isOwner
      ? query(collection(db, path), where('ownerId', '==', viewerUid), limit(1000))
      : query(collection(db, path), where('clientUid', '==', viewerUid), limit(1000));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReviewEvent[] = snapshot.docs
        .map((docSnap) => ({
          ...(docSnap.data() as Omit<ReviewEvent, 'id'>),
          id: docSnap.id,
        }))
        .filter((item) => item.businessId === businessId)
        .sort((a, b) => getEventTimeMs(b.createdAt) - getEventTimeMs(a.createdAt));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export function subscribeToAdmins(
  onData: (admins: AdminUser[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as AdminUser));
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export function subscribeToAdminEmails(
  onData: (adminEmails: AdminEmail[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'adminEmails'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as AdminEmail));
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export async function grantAdminByUid(uid: string, email: string, addedByUid: string): Promise<void> {
  const cleanUid = clampString(uid, 128);
  const cleanEmail = normalizeEmail(email);
  const path = `admins/${cleanUid}`;
  const ref = doc(db, 'admins', cleanUid);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      return;
    }
    await setDoc(ref, {
      uid: cleanUid,
      email: cleanEmail,
      addedBy: addedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function grantAdminByEmail(email: string, addedByUid: string): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid Gmail or email address.');
  }
  const path = `adminEmails/${cleanEmail}`;
  const ref = doc(db, 'adminEmails', cleanEmail);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      return;
    }
    await setDoc(ref, {
      email: cleanEmail,
      addedBy: addedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeAdmin(uid: string): Promise<void> {
  const path = `admins/${uid}`;
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function revokeAdminByEmail(email: string): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  const path = `adminEmails/${cleanEmail}`;
  try {
    await deleteDoc(doc(db, 'adminEmails', cleanEmail));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function checkSlugAvailability(
  candidateSlug: string,
  currentBusinessId?: string,
): Promise<{ available: boolean; normalizedSlug: string }> {
  const normalizedSlug = sanitizeSlug(candidateSlug);
  const path = `publicProfiles/${normalizedSlug}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', normalizedSlug));
    if (!snap.exists()) {
      return { available: true, normalizedSlug };
    }
    const data = snap.data() as PublicProfile;
    if (currentBusinessId && data.businessId === currentBusinessId) {
      return { available: true, normalizedSlug };
    }
    return { available: false, normalizedSlug };
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('permission') || msg.includes('insufficient')) {
      return { available: false, normalizedSlug };
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createBusiness(
  ownerId: string,
  input: {
    ownerName?: string;
    packageTier?: PackageTier;
    reviewFlowMode?: ReviewFlowMode;
    allowClientFlowModeSwitch?: boolean;
    clientEmail?: string;
    clientAccessLevel?: ClientAccessLevel;
    enabledFeatures?: EnabledFeatures;
    name: string;
    slug: string;
    category: BusinessCategory;
    address: string;
    locality?: string;
    city?: string;
    servicesOffered?: string[];
    productsOffered?: string[];
    businessHighlights?: string;
    phone: string;
    contactEmail: string;
    website?: string;
    googleReviewUrl: string;
    logoDataUrl: string;
    branding: BusinessBranding;
    qrConfig: QrConfig;
    questions: FeedbackQuestion[];
    formTemplate?: FormTemplateId;
    seoKeywords?: string[];
    seoKeywordsByLanguage?: Partial<Record<ReviewLanguage, string[]>>;
    referenceReviews?: ReferenceReviewItem[];
  },
): Promise<string> {
  const businessRef = doc(collection(db, 'businesses'));
  const businessId = businessRef.id;
  let finalSlug = sanitizeSlug(input.slug || input.name);

  const availability = await checkSlugAvailability(finalSlug);
  if (!availability.available) {
    finalSlug = `${finalSlug.slice(0, 68)}-${generateRandomToken(4)}`;
  }

  const now = serverTimestamp();
  const cleanName = clampString(input.name, 120) || 'My Business';
  const cleanOwnerName = clampString(input.ownerName, 120);
  const cleanPackageTier = sanitizePackageTier(input.packageTier);
  const cleanFlowMode = sanitizeReviewFlowModeForTier(input.reviewFlowMode, cleanPackageTier);
  const cleanAllowFlowSwitch =
    cleanPackageTier === 'standard' ? false : input.allowClientFlowModeSwitch !== false;
  const cleanAddress = clampString(input.address, 240);
  const cleanLocality = clampString(input.locality, 120);
  const cleanCity = clampString(input.city, 120);
  const cleanServices = sanitizeShortTagList(input.servicesOffered, 15, 60);
  const cleanProducts = sanitizeShortTagList(input.productsOffered, 15, 60);
  const cleanHighlights = clampString(input.businessHighlights, 500);
  const cleanWebsite = clampString(
    input.website ? sanitizeExternalUrl(input.website, '') : '',
    300,
  );
  const cleanGoogleUrl = clampString(
    sanitizeExternalUrl(input.googleReviewUrl, 'https://www.google.com/maps'),
    500,
  );
  const cleanLogo = clampString(sanitizeLogoDataUrl(input.logoDataUrl), 350000);
  const cleanClientEmail = normalizeEmail(input.clientEmail || '');
  const cleanAccessLevel = sanitizeAccessLevel(input.clientAccessLevel);
  const cleanFeatures = sanitizeEnabledFeatures(input.enabledFeatures);
  const cleanBranding = sanitizeBranding(input.branding);
  const cleanQrConfig = sanitizeQrConfig(input.qrConfig);
  const cleanQuestions = sanitizeQuestions(input.questions);
  const cleanFormTemplate = sanitizeFormTemplate(input.formTemplate);
  const providedKeywords = sanitizeSeoKeywords(input.seoKeywords);
  const contextualSeed = buildContextualSeoSuggestions({
    businessName: cleanName,
    category: input.category,
    locality: cleanLocality,
    city: cleanCity,
    address: cleanAddress,
    servicesOffered: cleanServices,
    productsOffered: cleanProducts,
    packageTier: cleanPackageTier,
  });
  const seedEnglish = contextualSeed.en || [];
  const cleanSeoKeywords =
    providedKeywords.length > 0
      ? providedKeywords
      : seedEnglish.length > 0
        ? seedEnglish
        : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category] ?? [];
  const providedSeoByLang = sanitizeSeoKeywordsByLanguageMap(input.seoKeywordsByLanguage);
  const cleanSeoByLang =
    Object.keys(providedSeoByLang).length > 0
      ? providedSeoByLang
      : contextualSeed;
  const cleanReferenceReviews = sanitizeReferenceReviewsList(input.referenceReviews);

  const businessPayload = {
    ownerId: clampString(ownerId, 128),
    ...(cleanOwnerName ? { ownerName: cleanOwnerName } : {}),
    packageTier: cleanPackageTier,
    reviewFlowMode: cleanFlowMode,
    allowClientFlowModeSwitch: cleanAllowFlowSwitch,
    clientEmail: cleanClientEmail,
    clientAccessLevel: cleanAccessLevel,
    enabledFeatures: cleanFeatures,
    slug: finalSlug,
    name: cleanName,
    category: input.category,
    address: cleanAddress,
    ...(cleanLocality ? { locality: cleanLocality } : {}),
    ...(cleanCity ? { city: cleanCity } : {}),
    ...(cleanServices.length > 0 ? { servicesOffered: cleanServices } : {}),
    ...(cleanProducts.length > 0 ? { productsOffered: cleanProducts } : {}),
    ...(cleanHighlights ? { businessHighlights: cleanHighlights } : {}),
    phone: clampString(input.phone, 40),
    contactEmail: clampString(input.contactEmail, 120),
    ...(cleanWebsite ? { website: cleanWebsite } : {}),
    googleReviewUrl: cleanGoogleUrl,
    logoDataUrl: cleanLogo,
    branding: cleanBranding,
    qrConfig: cleanQrConfig,
    questions: cleanQuestions,
    formTemplate: cleanFormTemplate,
    seoKeywords: cleanSeoKeywords,
    ...(Object.keys(cleanSeoByLang).length > 0 ? { seoKeywordsByLanguage: cleanSeoByLang } : {}),
    ...(cleanReferenceReviews.length > 0 ? { referenceReviews: cleanReferenceReviews } : {}),
    qrStandLimit: 4,
    gbpSettings: sanitizeGbpSettings(),
    weeklyReportConfig: sanitizeWeeklyReportConfig(undefined, cleanClientEmail),
    createdAt: now,
    updatedAt: now,
  };

  const publicPayload = {
    businessId,
    ownerId: clampString(ownerId, 128),
    ...(cleanOwnerName ? { ownerName: cleanOwnerName } : {}),
    packageTier: cleanPackageTier,
    reviewFlowMode: cleanFlowMode,
    allowClientFlowModeSwitch: cleanAllowFlowSwitch,
    slug: finalSlug,
    name: cleanName,
    category: input.category,
    ...(cleanAddress ? { address: cleanAddress } : {}),
    ...(cleanLocality ? { locality: cleanLocality } : {}),
    ...(cleanCity ? { city: cleanCity } : {}),
    ...(cleanServices.length > 0 ? { servicesOffered: cleanServices } : {}),
    ...(cleanProducts.length > 0 ? { productsOffered: cleanProducts } : {}),
    ...(cleanHighlights ? { businessHighlights: cleanHighlights } : {}),
    googleReviewUrl: cleanGoogleUrl,
    logoDataUrl: cleanLogo,
    enabledFeatures: cleanFeatures,
    branding: cleanBranding,
    qrConfig: cleanQrConfig,
    questions: cleanQuestions,
    formTemplate: cleanFormTemplate,
    seoKeywords: cleanSeoKeywords,
    ...(Object.keys(cleanSeoByLang).length > 0 ? { seoKeywordsByLanguage: cleanSeoByLang } : {}),
    ...(cleanReferenceReviews.length > 0 ? { referenceReviews: cleanReferenceReviews } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const statsPayload = {
    businessId,
    ownerId: clampString(ownerId, 128),
    clientEmail: cleanClientEmail,
    slug: finalSlug,
    scans: 0,
    formsStarted: 0,
    generated: 0,
    redirects: 0,
    styleShort: 0,
    styleDetailed: 0,
    styleProfessional: 0,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(businessRef, businessPayload);
  batch.set(doc(db, 'publicProfiles', finalSlug), publicPayload);
  batch.set(doc(db, 'businessStats', businessId), statsPayload);

  try {
    await batch.commit();
    return businessId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `businesses/${businessId}`);
  }
}

export async function updateBusiness(
  current: Business,
  updates: Partial<{
    ownerName: string;
    packageTier: PackageTier;
    reviewFlowMode: ReviewFlowMode;
    allowClientFlowModeSwitch: boolean;
    clientEmail: string;
    clientAccessLevel: ClientAccessLevel;
    enabledFeatures: EnabledFeatures;
    slug: string;
    name: string;
    category: BusinessCategory;
    address: string;
    locality: string;
    city: string;
    servicesOffered: string[];
    productsOffered: string[];
    businessHighlights: string;
    phone: string;
    contactEmail: string;
    website: string;
    googleReviewUrl: string;
    logoDataUrl: string;
    branding: BusinessBranding;
    qrConfig: QrConfig;
    questions: FeedbackQuestion[];
    formTemplate: FormTemplateId;
    seoKeywords: string[];
    seoKeywordsByLanguage: Partial<Record<ReviewLanguage, string[]>>;
    referenceReviews: ReferenceReviewItem[];
    qrStandLimit: number;
    gbpSettings: GbpReplySettings;
    weeklyReportConfig: WeeklyReportConfig;
  }>,
  options: { isAdmin?: boolean } = {},
): Promise<string> {
  const isAdmin = Boolean(options.isAdmin);
  const access = isAdmin ? 'full' : current.clientAccessLevel;
  const currentUid = auth.currentUser?.uid || '';
  const isOwnerOrAdmin = isAdmin || (Boolean(currentUid) && current.ownerId === currentUid);
  const now = serverTimestamp();
  const batch = writeBatch(db);

  // Inspect live raw documents so any legacy/null/malformed fields on either doc are healed automatically
  let rawBizLive: Record<string, unknown> | null = null;
  let publicProfileState: 'exists' | 'missing' | 'unknown' = 'unknown';
  let publicNeedsBrandingRepair = false;
  let publicNeedsQrRepair = false;
  let publicNeedsFeaturesRepair = false;
  let publicNeedsCoreRepair = false;
  let publicNeedsCategoryRepair = false;
  let publicNeedsSeoRepair = false;
  let publicNeedsClientUidRepair = false;

  const [bizSnapResult, publicSnapResult] = await Promise.allSettled([
    getDoc(doc(db, 'businesses', current.id)),
    getDoc(doc(db, 'publicProfiles', current.slug)),
  ]);

  if (bizSnapResult.status === 'fulfilled' && bizSnapResult.value.exists()) {
    rawBizLive = bizSnapResult.value.data() as Record<string, unknown>;
  }

  if (publicSnapResult.status === 'fulfilled') {
    const publicSnap = publicSnapResult.value;
    if (publicSnap.exists()) {
      publicProfileState = 'exists';
      const rawPub = publicSnap.data() as Record<string, unknown>;
      publicNeedsBrandingRepair = needsBrandingRepair(rawPub.branding as Partial<BusinessBranding>);
      publicNeedsQrRepair = needsQrConfigRepair(rawPub.qrConfig as Partial<QrConfig>);
      publicNeedsFeaturesRepair = needsFeaturesRepair(rawPub.enabledFeatures as Partial<EnabledFeatures>);
      publicNeedsCoreRepair =
        typeof rawPub.googleReviewUrl !== 'string' ||
        typeof rawPub.logoDataUrl !== 'string' ||
        !Array.isArray(rawPub.questions);
      publicNeedsCategoryRepair = !VALID_BUSINESS_CATEGORIES.has(rawPub.category as BusinessCategory);
      publicNeedsSeoRepair =
        'seoKeywords' in rawPub &&
        (!Array.isArray(rawPub.seoKeywords) ||
          rawPub.seoKeywords.length > 15 ||
          rawPub.seoKeywords.some((k) => typeof k !== 'string'));
      publicNeedsClientUidRepair = 'clientUid' in rawPub && typeof rawPub.clientUid !== 'string';
    } else {
      publicProfileState = 'missing';
    }
  } else {
    // Permission error on paused public profile for non-owner client means doc exists
    publicProfileState = 'exists';
  }

  // Scoped update for 'qr_and_questions' tier clients
  if (!isAdmin && access === 'qr_and_questions') {
    const businessScopedUpdates: Record<string, unknown> = { updatedAt: now };
    const publicScopedUpdates: Record<string, unknown> = { updatedAt: now };

    if (
      updates.qrConfig !== undefined ||
      needsQrConfigRepair(current.qrConfig) ||
      rawNeedsQrRepair.has(current) ||
      publicNeedsQrRepair
    ) {
      const nextQrConfig = sanitizeQrConfig(
        updates.qrConfig ?? current.qrConfig,
        generateRandomToken(),
      );
      businessScopedUpdates.qrConfig = nextQrConfig;
      publicScopedUpdates.qrConfig = nextQrConfig;
    }
    if (updates.questions !== undefined) {
      const nextQuestions = sanitizeQuestions(updates.questions);
      businessScopedUpdates.questions = nextQuestions;
      publicScopedUpdates.questions = nextQuestions;
    }
    if (updates.formTemplate !== undefined) {
      const nextTemplate = sanitizeFormTemplate(updates.formTemplate);
      businessScopedUpdates.formTemplate = nextTemplate;
      publicScopedUpdates.formTemplate = nextTemplate;
    }

    batch.update(doc(db, 'businesses', current.id), businessScopedUpdates);
    if (publicProfileState !== 'missing') {
      batch.update(doc(db, 'publicProfiles', current.slug), publicScopedUpdates);
    }

    try {
      await batch.commit();
      return current.slug;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `businesses/${current.id}`);
    }
  }

  const nextSlug = updates.slug !== undefined ? sanitizeSlug(updates.slug) : current.slug;
  const slugChanged = nextSlug !== current.slug;

  if (slugChanged) {
    if (!isOwnerOrAdmin) {
      throw new Error(
        'Only the business owner or platform administrator can rename the public URL slug.',
      );
    }
    const check = await checkSlugAvailability(nextSlug, current.id);
    if (!check.available) {
      throw new Error(`The URL slug "${nextSlug}" is already taken by another business.`);
    }
  }

  const nextName =
    updates.name !== undefined
      ? clampString(updates.name, 120) || current.name
      : current.name;
  const nextCategory = sanitizeBusinessCategory(updates.category ?? current.category);
  const nextGoogleUrl =
    updates.googleReviewUrl !== undefined
      ? clampString(sanitizeExternalUrl(updates.googleReviewUrl, 'https://www.google.com/maps'), 500)
      : sanitizeExternalUrl(current.googleReviewUrl, 'https://www.google.com/maps');
  const nextLogo =
    updates.logoDataUrl !== undefined
      ? clampString(sanitizeLogoDataUrl(updates.logoDataUrl), 350000)
      : sanitizeLogoDataUrl(current.logoDataUrl);
  const nextBranding = sanitizeBranding(updates.branding ?? current.branding);
  const nextQrConfig = sanitizeQrConfig(updates.qrConfig ?? current.qrConfig, generateRandomToken());
  const nextQuestions = sanitizeQuestions(updates.questions ?? current.questions);
  const nextFormTemplate = sanitizeFormTemplate(updates.formTemplate ?? current.formTemplate);
  const nextSeoKeywords = sanitizeSeoKeywords(
    updates.seoKeywords ?? current.seoKeywords ?? DEFAULT_SEO_KEYWORDS_BY_CATEGORY[nextCategory],
  );

  const nextClientEmail = isAdmin
    ? clampString(normalizeEmail(updates.clientEmail ?? current.clientEmail), 120)
    : clampString(current.clientEmail, 120);
  const nextAccessLevel = isAdmin
    ? sanitizeAccessLevel(updates.clientAccessLevel ?? current.clientAccessLevel)
    : current.clientAccessLevel;
  const nextFeatures = isAdmin
    ? sanitizeEnabledFeatures(updates.enabledFeatures ?? current.enabledFeatures)
    : current.enabledFeatures;

  const optionalRepairs = rawBizLive ? needsOptionalBusinessFieldRepair(rawBizLive) : null;
  const liveNeedsCoreRepair = rawBizLive ? needsCoreBusinessStringsRepair(rawBizLive) : false;

  // Build minimal diff for businesses/{id} while self-healing any invalid nested subobjects
  const businessUpdates: Record<string, unknown> = { updatedAt: now };
  const publicUpdates: Record<string, unknown> = { updatedAt: now };

  if (slugChanged) {
    businessUpdates.slug = nextSlug;
  }
  if (updates.name !== undefined || (isAdmin && liveNeedsCoreRepair)) {
    const repairedName = clampString(nextName, 120) || 'Business';
    businessUpdates.name = repairedName;
    publicUpdates.name = repairedName;
  }
  if (updates.category !== undefined || (isAdmin && (liveNeedsCoreRepair || publicNeedsCategoryRepair))) {
    businessUpdates.category = nextCategory;
    publicUpdates.category = nextCategory;
  }
  if (updates.address !== undefined || (isAdmin && (rawNeedsCoreStringsRepair.has(current) || liveNeedsCoreRepair))) {
    const cleanAddr = clampString(updates.address ?? current.address, 240);
    businessUpdates.address = cleanAddr;
    if (updates.address !== undefined) {
      publicUpdates.address = cleanAddr;
    }
  }
  if (updates.phone !== undefined || (isAdmin && (rawNeedsCoreStringsRepair.has(current) || liveNeedsCoreRepair))) {
    businessUpdates.phone = clampString(updates.phone ?? current.phone, 40);
  }
  if (updates.contactEmail !== undefined || (isAdmin && (rawNeedsCoreStringsRepair.has(current) || liveNeedsCoreRepair))) {
    businessUpdates.contactEmail = clampString(updates.contactEmail ?? current.contactEmail, 120);
  }
  if (updates.website !== undefined || (isAdmin && optionalRepairs?.website)) {
    businessUpdates.website = clampString(
      updates.website ? sanitizeExternalUrl(updates.website, '') : current.website || '',
      300,
    );
  }
  if (
    isAdmin &&
    (updates.googleReviewUrl !== undefined ||
      rawNeedsCoreStringsRepair.has(current) ||
      liveNeedsCoreRepair ||
      publicNeedsCoreRepair)
  ) {
    businessUpdates.googleReviewUrl = nextGoogleUrl;
    publicUpdates.googleReviewUrl = nextGoogleUrl;
  }
  if (
    updates.logoDataUrl !== undefined ||
    (isAdmin && (rawNeedsCoreStringsRepair.has(current) || liveNeedsCoreRepair || publicNeedsCoreRepair))
  ) {
    businessUpdates.logoDataUrl = nextLogo;
    publicUpdates.logoDataUrl = nextLogo;
  }
  if (
    updates.branding !== undefined ||
    needsBrandingRepair(current.branding) ||
    rawNeedsBrandingRepair.has(current) ||
    (rawBizLive && needsBrandingRepair(rawBizLive.branding as Partial<BusinessBranding>)) ||
    publicNeedsBrandingRepair
  ) {
    businessUpdates.branding = nextBranding;
    publicUpdates.branding = nextBranding;
  }
  if (
    updates.qrConfig !== undefined ||
    (isAdmin && (
      needsQrConfigRepair(current.qrConfig) ||
      rawNeedsQrRepair.has(current) ||
      (rawBizLive && needsQrConfigRepair(rawBizLive.qrConfig as Partial<QrConfig>)) ||
      publicNeedsQrRepair
    ))
  ) {
    businessUpdates.qrConfig = nextQrConfig;
    publicUpdates.qrConfig = nextQrConfig;
  }
  if (
    updates.questions !== undefined ||
    (isAdmin && (rawNeedsCoreStringsRepair.has(current) || liveNeedsCoreRepair || publicNeedsCoreRepair))
  ) {
    businessUpdates.questions = nextQuestions;
    publicUpdates.questions = nextQuestions;
  }
  if (updates.formTemplate !== undefined || (isAdmin && optionalRepairs?.formTemplate)) {
    businessUpdates.formTemplate = nextFormTemplate;
    publicUpdates.formTemplate = nextFormTemplate;
  }
  if (updates.seoKeywords !== undefined || (isAdmin && (optionalRepairs?.seoKeywords || publicNeedsSeoRepair))) {
    businessUpdates.seoKeywords = nextSeoKeywords;
    publicUpdates.seoKeywords = nextSeoKeywords;
  }
  if (updates.seoKeywordsByLanguage !== undefined || (isAdmin && optionalRepairs?.seoKeywordsByLanguage)) {
    const cleanSeoByLang = sanitizeSeoKeywordsByLanguageMap(
      updates.seoKeywordsByLanguage ?? current.seoKeywordsByLanguage,
    );
    businessUpdates.seoKeywordsByLanguage = cleanSeoByLang;
    publicUpdates.seoKeywordsByLanguage = cleanSeoByLang;
  }
  if (updates.referenceReviews !== undefined || (isAdmin && optionalRepairs?.referenceReviews)) {
    const cleanRefs = sanitizeReferenceReviewsList(updates.referenceReviews ?? current.referenceReviews);
    businessUpdates.referenceReviews = cleanRefs;
    publicUpdates.referenceReviews = cleanRefs;
  }
  if (updates.ownerName !== undefined || (isAdmin && optionalRepairs?.ownerName)) {
    const cleanOwner = clampString(updates.ownerName ?? current.ownerName, 120);
    businessUpdates.ownerName = cleanOwner;
    publicUpdates.ownerName = cleanOwner;
  }
  if (updates.locality !== undefined || (isAdmin && optionalRepairs?.locality)) {
    const cleanLocality = clampString(updates.locality ?? current.locality, 120);
    businessUpdates.locality = cleanLocality;
    publicUpdates.locality = cleanLocality;
  }
  if (updates.city !== undefined || (isAdmin && optionalRepairs?.city)) {
    const cleanCity = clampString(updates.city ?? current.city, 120);
    businessUpdates.city = cleanCity;
    publicUpdates.city = cleanCity;
  }
  if (updates.servicesOffered !== undefined) {
    const cleanServices = sanitizeShortTagList(updates.servicesOffered, 15, 60);
    businessUpdates.servicesOffered = cleanServices;
    publicUpdates.servicesOffered = cleanServices;
  }
  if (updates.productsOffered !== undefined) {
    const cleanProducts = sanitizeShortTagList(updates.productsOffered, 15, 60);
    businessUpdates.productsOffered = cleanProducts;
    publicUpdates.productsOffered = cleanProducts;
  }
  if (updates.businessHighlights !== undefined || (isAdmin && optionalRepairs?.businessHighlights)) {
    const cleanHighlights = clampString(updates.businessHighlights ?? current.businessHighlights, 500);
    businessUpdates.businessHighlights = cleanHighlights;
    publicUpdates.businessHighlights = cleanHighlights;
  }
  if (isAdmin && (updates.gbpSettings !== undefined || optionalRepairs?.gbpSettings)) {
    businessUpdates.gbpSettings = sanitizeGbpSettings(updates.gbpSettings ?? current.gbpSettings);
  }
  if (isAdmin && (updates.weeklyReportConfig !== undefined || optionalRepairs?.weeklyReportConfig)) {
    businessUpdates.weeklyReportConfig = sanitizeWeeklyReportConfig(
      updates.weeklyReportConfig ?? current.weeklyReportConfig,
      nextClientEmail,
    );
  }

  const effectivePackageTier = sanitizePackageTier(
    isAdmin && updates.packageTier !== undefined ? updates.packageTier : current.packageTier,
  );
  const canSwitchFlowMode =
    isAdmin ||
    (effectivePackageTier === 'standard_plus' && current.allowClientFlowModeSwitch !== false);

  if (updates.reviewFlowMode !== undefined && canSwitchFlowMode) {
    const cleanMode = sanitizeReviewFlowModeForTier(updates.reviewFlowMode, effectivePackageTier);
    businessUpdates.reviewFlowMode = cleanMode;
    publicUpdates.reviewFlowMode = cleanMode;
  }

  const clientEmailChanged = isAdmin && nextClientEmail !== current.clientEmail;
  if (isAdmin) {
    if (updates.packageTier !== undefined) {
      const cleanTier = sanitizePackageTier(updates.packageTier);
      businessUpdates.packageTier = cleanTier;
      publicUpdates.packageTier = cleanTier;
      if (cleanTier === 'standard') {
        businessUpdates.reviewFlowMode = 'ai_drafted_instant';
        publicUpdates.reviewFlowMode = 'ai_drafted_instant';
        businessUpdates.allowClientFlowModeSwitch = false;
        publicUpdates.allowClientFlowModeSwitch = false;
      }
    }
    if (updates.allowClientFlowModeSwitch !== undefined) {
      const cleanAllowSwitch =
        effectivePackageTier === 'standard' ? false : Boolean(updates.allowClientFlowModeSwitch);
      businessUpdates.allowClientFlowModeSwitch = cleanAllowSwitch;
      publicUpdates.allowClientFlowModeSwitch = cleanAllowSwitch;
    }
    if (updates.clientEmail !== undefined || optionalRepairs?.clientEmail) {
      businessUpdates.clientEmail = nextClientEmail;
    }
    if (updates.clientAccessLevel !== undefined || optionalRepairs?.clientAccessLevel) {
      businessUpdates.clientAccessLevel = nextAccessLevel;
    }
    if (
      updates.enabledFeatures !== undefined ||
      rawNeedsFeaturesRepair.has(current) ||
      (rawBizLive && needsFeaturesRepair(rawBizLive.enabledFeatures as Partial<EnabledFeatures>)) ||
      publicNeedsFeaturesRepair
    ) {
      businessUpdates.enabledFeatures = nextFeatures;
      publicUpdates.enabledFeatures = nextFeatures;
    }
    if (updates.qrStandLimit !== undefined || optionalRepairs?.qrStandLimit) {
      const parsedLimit = Math.round(Number(updates.qrStandLimit ?? current.qrStandLimit));
      businessUpdates.qrStandLimit = Math.min(100, Math.max(1, parsedLimit || 4));
    }
    if (clientEmailChanged || optionalRepairs?.clientUid || publicNeedsClientUidRepair) {
      const nextUid = clientEmailChanged ? '' : current.clientUid || '';
      businessUpdates.clientUid = nextUid;
      publicUpdates.clientUid = nextUid;
    }
  }

  const nextOwnerName = clampString(updates.ownerName ?? current.ownerName, 120);
  const nextAddress = clampString(updates.address ?? current.address, 240);
  const nextLocality = clampString(updates.locality ?? current.locality, 120);
  const nextCity = clampString(updates.city ?? current.city, 120);
  const nextServices = sanitizeShortTagList(updates.servicesOffered ?? current.servicesOffered, 15, 60);
  const nextProducts = sanitizeShortTagList(updates.productsOffered ?? current.productsOffered, 15, 60);
  const nextHighlights = clampString(updates.businessHighlights ?? current.businessHighlights, 500);
  const nextPackageTier = effectivePackageTier;
  const nextFlowMode = sanitizeReviewFlowModeForTier(
    updates.reviewFlowMode !== undefined && canSwitchFlowMode
      ? updates.reviewFlowMode
      : current.reviewFlowMode,
    nextPackageTier,
  );
  const nextAllowFlowSwitch =
    nextPackageTier === 'standard'
      ? false
      : isAdmin && updates.allowClientFlowModeSwitch !== undefined
        ? Boolean(updates.allowClientFlowModeSwitch)
        : current.allowClientFlowModeSwitch !== false;
  const nextSeoByLang = sanitizeSeoKeywordsByLanguageMap(
    updates.seoKeywordsByLanguage ?? current.seoKeywordsByLanguage,
  );
  const nextRefs = sanitizeReferenceReviewsList(updates.referenceReviews ?? current.referenceReviews);

  const buildFreshPublicProfilePayload = (targetSlug: string) => ({
    businessId: current.id,
    ownerId: current.ownerId,
    ...(nextOwnerName ? { ownerName: nextOwnerName } : {}),
    packageTier: nextPackageTier,
    reviewFlowMode: nextFlowMode,
    allowClientFlowModeSwitch: nextAllowFlowSwitch,
    clientUid: clientEmailChanged ? '' : current.clientUid || '',
    slug: targetSlug,
    name: nextName,
    category: nextCategory,
    ...(nextAddress ? { address: nextAddress } : {}),
    ...(nextLocality ? { locality: nextLocality } : {}),
    ...(nextCity ? { city: nextCity } : {}),
    ...(nextServices.length > 0 ? { servicesOffered: nextServices } : {}),
    ...(nextProducts.length > 0 ? { productsOffered: nextProducts } : {}),
    ...(nextHighlights ? { businessHighlights: nextHighlights } : {}),
    googleReviewUrl: nextGoogleUrl,
    logoDataUrl: nextLogo,
    enabledFeatures: nextFeatures,
    branding: nextBranding,
    qrConfig: nextQrConfig,
    questions: nextQuestions,
    formTemplate: nextFormTemplate,
    seoKeywords: nextSeoKeywords,
    seoKeywordsByLanguage: nextSeoByLang,
    referenceReviews: nextRefs,
    createdAt: now,
    updatedAt: now,
  });

  batch.update(doc(db, 'businesses', current.id), businessUpdates);

  if (slugChanged) {
    if (publicProfileState !== 'missing') {
      batch.delete(doc(db, 'publicProfiles', current.slug));
    }
    batch.set(doc(db, 'publicProfiles', nextSlug), buildFreshPublicProfilePayload(nextSlug));
  } else if (publicProfileState === 'missing') {
    batch.set(doc(db, 'publicProfiles', current.slug), buildFreshPublicProfilePayload(current.slug));
  } else if (Object.keys(publicUpdates).length > 1) {
    batch.update(doc(db, 'publicProfiles', current.slug), publicUpdates);
  }

  if (slugChanged || clientEmailChanged) {
    const statsUpdates: Record<string, unknown> = {
      slug: nextSlug,
      updatedAt: now,
    };
    if (isAdmin && clientEmailChanged) {
      statsUpdates.clientEmail = nextClientEmail;
    }
    batch.update(doc(db, 'businessStats', current.id), statsUpdates);
  }

  try {
    await batch.commit();
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const isPermErr = rawMsg.includes('permission') || rawMsg.includes('insufficient');

    // If batch commit failed because the sibling publicProfiles doc had a legacy/broken schema or missing fields,
    // update businesses/{id} first and update or recreate publicProfiles/{slug} cleanly so the save succeeds.
    if (isPermErr && !slugChanged) {
      try {
        await updateDoc(doc(db, 'businesses', current.id), businessUpdates);
        try {
          if (publicProfileState === 'missing') {
            await setDoc(doc(db, 'publicProfiles', current.slug), buildFreshPublicProfilePayload(current.slug));
          } else if (Object.keys(publicUpdates).length > 1) {
            await updateDoc(doc(db, 'publicProfiles', current.slug), publicUpdates);
          }
        } catch {
          if (isOwnerOrAdmin) {
            const repairBatch = writeBatch(db);
            repairBatch.delete(doc(db, 'publicProfiles', current.slug));
            repairBatch.set(
              doc(db, 'publicProfiles', current.slug),
              buildFreshPublicProfilePayload(current.slug),
            );
            await repairBatch.commit();
          }
        }
        return nextSlug;
      } catch (isolatedErr) {
        handleFirestoreError(isolatedErr, OperationType.UPDATE, `businesses/${current.id}`);
      }
    }

    handleFirestoreError(error, OperationType.UPDATE, `businesses/${current.id}`);
  }

  if (isAdmin && clientEmailChanged) {
    // Best-effort sync so client-scoped queries on qrStands, weeklyReports, and gbpConnections match the reassigned clientEmail
    try {
      const syncBatch = writeBatch(db);
      let pendingOps = 0;

      const gbpRef = doc(db, 'gbpConnections', current.id);
      const gbpSnap = await getDoc(gbpRef).catch(() => null);
      if (gbpSnap?.exists()) {
        syncBatch.update(gbpRef, { clientEmail: nextClientEmail, updatedAt: now });
        pendingOps += 1;
      }

      const [standsSnap, reportsSnap] = await Promise.all([
        getDocs(query(collection(db, 'qrStands'), where('businessId', '==', current.id), limit(100))).catch(
          () => null,
        ),
        getDocs(query(collection(db, 'weeklyReports'), where('businessId', '==', current.id), limit(100))).catch(
          () => null,
        ),
      ]);

      standsSnap?.docs.forEach((d) => {
        if (pendingOps < 450) {
          syncBatch.update(d.ref, { clientEmail: nextClientEmail, clientUid: '', updatedAt: now });
          pendingOps += 1;
        }
      });

      reportsSnap?.docs.forEach((d) => {
        if (pendingOps < 450) {
          syncBatch.update(d.ref, { clientEmail: nextClientEmail, updatedAt: now });
          pendingOps += 1;
        }
      });

      if (pendingOps > 0) {
        await syncBatch.commit();
      }
    } catch {
      // Non-blocking secondary email sync
    }
  }

  return nextSlug;
}

export async function deleteBusiness(business: Business): Promise<void> {
  try {
    const res = await apiFetch('/api/gbp-oauth', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        action: 'delete_business_cascade',
        businessId: business.id,
      }),
    });
    const parsed = await parseApiJson<{ ok?: boolean; error?: string }>(res);
    if (res.status === 401 || res.status === 403) {
      throw new Error(parsed.data?.error || 'Not authorized to delete this business.');
    }
    if (res.ok && parsed.data?.ok) {
      return;
    }
  } catch (err) {
    // Only fall through to client-side cleanup on network/503/unavailable API errors
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('not authorized') || msg.includes('permission denied')) {
      throw err;
    }
  }

  const bestEffortDeleteCollection = async (colName: string) => {
    try {
      const snap = await getDocs(
        query(collection(db, colName), where('businessId', '==', business.id), limit(400)),
      );
      if (snap.empty) return;
      const chunkBatch = writeBatch(db);
      snap.docs.forEach((d) => chunkBatch.delete(d.ref));
      await chunkBatch.commit();
    } catch {
      // Best-effort cleanup across secondary collections when running without admin service account
    }
  };

  await Promise.all([
    bestEffortDeleteCollection('qrStands'),
    bestEffortDeleteCollection('qrStandRequests'),
    bestEffortDeleteCollection('gbpReviews'),
    bestEffortDeleteCollection('weeklyReports'),
    bestEffortDeleteCollection('reviewDrafts'),
    bestEffortDeleteCollection('reviewEvaluations'),
    bestEffortDeleteCollection('consentedExamples'),
  ]);

  await Promise.all([
    deleteDoc(doc(db, 'gbpConnections', business.id)).catch(() => null),
    deleteDoc(doc(db, 'businessIntegrations', business.id)).catch(() => null),
  ]);

  const batch = writeBatch(db);
  batch.delete(doc(db, 'businesses', business.id));
  batch.delete(doc(db, 'publicProfiles', business.slug));
  batch.delete(doc(db, 'businessStats', business.id));
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `businesses/${business.id}`);
  }
}

export async function getPublicProfileBySlug(slug: string): Promise<{
  status: 'found' | 'not_found' | 'paused';
  profile?: PublicProfile;
}> {
  const normalized = sanitizeSlug(slug);
  const path = `publicProfiles/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', normalized));
    if (!snap.exists()) {
      return { status: 'not_found' };
    }
    const raw = snap.data() as Partial<PublicProfile>;
    const cat = (raw.category as BusinessCategory) || 'Other Businesses';
    const kw = sanitizeSeoKeywords(raw.seoKeywords);
    const profile: PublicProfile = {
      businessId: raw.businessId || '',
      ownerId: raw.ownerId || '',
      ownerName: clampString(raw.ownerName, 120),
      packageTier: sanitizePackageTier(raw.packageTier),
      reviewFlowMode: sanitizeReviewFlowMode(raw.reviewFlowMode),
      allowClientFlowModeSwitch: raw.allowClientFlowModeSwitch !== false,
      clientUid: clampString(raw.clientUid, 128),
      slug: raw.slug || normalized,
      name: raw.name || 'Business',
      category: cat,
      address: clampString(raw.address, 240),
      locality: clampString(raw.locality, 120),
      city: clampString(raw.city, 120),
      servicesOffered: sanitizeShortTagList(raw.servicesOffered, 15, 60),
      productsOffered: sanitizeShortTagList(raw.productsOffered, 15, 60),
      businessHighlights: clampString(raw.businessHighlights, 500),
      googleReviewUrl: raw.googleReviewUrl || '',
      logoDataUrl: sanitizeLogoDataUrl(raw.logoDataUrl),
      enabledFeatures: sanitizeEnabledFeatures(raw.enabledFeatures),
      branding: sanitizeBranding(raw.branding),
      qrConfig: sanitizeQrConfig(raw.qrConfig, 'v1token'),
      pausedStandIds: Array.isArray(raw.pausedStandIds)
        ? raw.pausedStandIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
        : [],
      questions: Array.isArray(raw.questions) ? raw.questions : [],
      formTemplate: sanitizeFormTemplate(raw.formTemplate),
      seoKeywords: kw.length > 0 ? kw : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[cat] ?? [],
      seoKeywordsByLanguage: sanitizeSeoKeywordsByLanguageMap(raw.seoKeywordsByLanguage),
      referenceReviews: sanitizeReferenceReviewsList(raw.referenceReviews),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
    if (!profile.qrConfig?.isActive) {
      return { status: 'paused' };
    }
    return { status: 'found', profile };
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('permission') || msg.includes('insufficient')) {
      return { status: 'paused' };
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function recordReviewEvent(
  profile: PublicProfile,
  eventType: ReviewEventType,
  details: {
    reviewStyle?: string;
    sentiment?: string;
    language?: ReviewLanguage;
    selectedHighlights?: string[];
    standId?: string;
    standCode?: string;
    standName?: string;
    sessionId?: string;
  } = {},
): Promise<void> {
  if (!profile.qrConfig?.isActive || profile.ownerId === 'demo') {
    return;
  }

  const eventRef = doc(collection(db, 'reviewEvents'));
  const standId = clampString(details.standId ?? '', 128);
  const standCode = clampString(details.standCode ?? '', 64);
  const standName = clampString(details.standName ?? '', 120);
  const sessionId = clampString(details.sessionId ?? '', 128);
  const language: ReviewLanguage | undefined =
    details.language === 'hi' ||
    details.language === 'mr' ||
    details.language === 'hinglish' ||
    details.language === 'en'
      ? details.language
      : undefined;

  const payload = {
    businessId: profile.businessId,
    ownerId: profile.ownerId,
    ...(profile.clientUid ? { clientUid: profile.clientUid } : {}),
    slug: profile.slug,
    eventType,
    reviewStyle: clampString(details.reviewStyle ?? '', 40),
    sentiment: clampString(details.sentiment ?? '', 40),
    ...(language ? { language } : {}),
    selectedHighlights: (details.selectedHighlights ?? [])
      .map((s) => clampString(s, 60))
      .filter(Boolean)
      .slice(0, 15),
    ...(standId ? { standId } : {}),
    ...(standCode ? { standCode } : {}),
    ...(standName ? { standName } : {}),
    ...(sessionId ? { sessionId } : {}),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(eventRef, payload);
  } catch {
    // Non-blocking
  }

  const statsUpdate: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (eventType === 'scan') {
    statsUpdate.scans = increment(1);
  } else if (eventType === 'form_start') {
    statsUpdate.formsStarted = increment(1);
  } else if (eventType === 'generate') {
    statsUpdate.generated = increment(1);
    if (details.reviewStyle === 'short') statsUpdate.styleShort = increment(1);
    if (details.reviewStyle === 'detailed') statsUpdate.styleDetailed = increment(1);
    if (details.reviewStyle === 'professional') statsUpdate.styleProfessional = increment(1);
  } else if (eventType === 'copy_redirect') {
    statsUpdate.redirects = increment(1);
  }

  try {
    await updateDoc(doc(db, 'businessStats', profile.businessId), statsUpdate);
  } catch {
    // Non-blocking if businessStats doc is absent for legacy record
  }
}

function generateSecureClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${generateRandomToken(12)}`;
}

export async function saveFeedbackSubmission(input: {
  profile: PublicProfile;
  responses: FeedbackSubmissionResponse[];
  additionalComments: string;
  sentiment: string;
  selectedHighlights: string[];
  standId?: string;
  standCode?: string;
  standName?: string;
  sessionId: string;
}): Promise<string> {
  const submissionId = generateSecureClientId('fb');
  if (!input.profile.qrConfig?.isActive || input.profile.ownerId === 'demo') {
    return submissionId;
  }

  const cleanResponses = input.responses
    .filter((item) => item && item.question && Array.isArray(item.answers) && item.answers.length > 0)
    .slice(0, 25)
    .map((item) => ({
      question: clampString(item.question, 180),
      answers: item.answers.map((a) => clampString(a, 120)).filter(Boolean).slice(0, 20),
    }));

  const standId = clampString(input.standId ?? '', 128);
  const standCode = clampString(input.standCode ?? '', 64);
  const standName = clampString(input.standName ?? '', 120);
  const sessionId = clampString(input.sessionId, 128) || generateSecureClientId('sess');

  const payload = {
    submissionId,
    businessId: input.profile.businessId,
    ownerId: input.profile.ownerId,
    ...(input.profile.clientUid ? { clientUid: input.profile.clientUid } : {}),
    slug: input.profile.slug,
    responses: cleanResponses,
    additionalComments: clampString(input.additionalComments, 2000),
    sentiment: clampString(input.sentiment, 40),
    selectedHighlights: input.selectedHighlights
      .map((s) => clampString(s, 60))
      .filter(Boolean)
      .slice(0, 15),
    ...(standId ? { standId } : {}),
    ...(standCode ? { standCode } : {}),
    ...(standName ? { standName } : {}),
    sessionId,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'feedbackSubmissions', submissionId), payload);
  } catch {
    // Non-blocking persistence
  }
  return submissionId;
}

export async function createReviewDraftRecord(input: {
  profile: PublicProfile;
  feedbackSubmissionId: string;
  reviewText: string;
  language: ReviewLanguage;
  reviewStyle: ReviewStyle;
  variationSeed: number;
  sessionId: string;
}): Promise<string> {
  const draftId = generateSecureClientId('dr');
  if (!input.profile.qrConfig?.isActive || input.profile.ownerId === 'demo') {
    return draftId;
  }

  const cleanText = clampString(input.reviewText, 4000);
  if (!cleanText || !input.feedbackSubmissionId) {
    return draftId;
  }

  const now = serverTimestamp();
  const payload = {
    draftId,
    businessId: input.profile.businessId,
    ownerId: input.profile.ownerId,
    ...(input.profile.clientUid ? { clientUid: input.profile.clientUid } : {}),
    slug: input.profile.slug,
    feedbackSubmissionId: clampString(input.feedbackSubmissionId, 128),
    reviewText: cleanText,
    language: input.language,
    reviewStyle: input.reviewStyle,
    variationSeed: Math.min(1000, Math.max(1, Math.round(input.variationSeed || 1))),
    sessionId: clampString(input.sessionId, 128) || generateSecureClientId('sess'),
    status: 'Generated' as ReviewDraftStatus,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'reviewDrafts', draftId), payload);
  } catch {
    // Non-blocking persistence
  }
  return draftId;
}

export async function updateReviewDraftLifecycle(input: {
  profile: PublicProfile;
  draftId: string;
  status: 'Edited' | 'Copied' | 'Deleted';
  reviewText?: string;
}): Promise<void> {
  if (
    !input.draftId ||
    !input.profile.qrConfig?.isActive ||
    input.profile.ownerId === 'demo'
  ) {
    return;
  }

  const now = serverTimestamp();
  const updates: Record<string, unknown> = {
    status: input.status,
    updatedAt: now,
  };

  if (input.status === 'Edited') {
    const cleanText = clampString(input.reviewText ?? '', 4000);
    if (!cleanText) return;
    updates.reviewText = cleanText;
  } else if (input.status === 'Copied') {
    const cleanText = clampString(input.reviewText ?? '', 4000);
    if (cleanText) {
      updates.reviewText = cleanText;
    }
    updates.copiedAt = now;
  } else if (input.status === 'Deleted') {
    updates.deletedAt = now;
  }

  try {
    await updateDoc(doc(db, 'reviewDrafts', input.draftId), updates);
  } catch {
    // Non-blocking lifecycle update
  }
}

export function subscribeToBusinessReviewDrafts(
  businessId: string,
  ownerId: string,
  viewerUid: string,
  isAdmin: boolean,
  onData: (drafts: ReviewDraft[]) => void,
  onError?: (err: Error) => void,
  clientUid?: string,
): Unsubscribe {
  const isOwner = ownerId === viewerUid;
  const isLinkedClient = Boolean(clientUid && clientUid === viewerUid);

  if (!isAdmin && !isOwner && !isLinkedClient) {
    onData([]);
    return () => {};
  }

  const path = 'reviewDrafts';
  const q = isAdmin
    ? query(collection(db, path), where('businessId', '==', businessId), limit(500))
    : isOwner
      ? query(collection(db, path), where('ownerId', '==', viewerUid), limit(500))
      : query(collection(db, path), where('clientUid', '==', viewerUid), limit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReviewDraft[] = snapshot.docs
        .map((docSnap) => ({
          ...(docSnap.data() as Omit<ReviewDraft, 'id'>),
          id: docSnap.id,
        }))
        .filter((item) => item.businessId === businessId)
        .sort((a, b) => getEventTimeMs(b.createdAt) - getEventTimeMs(a.createdAt));
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export async function logAiUsage(input: {
  businessId: string;
  ownerId: string;
  clientEmail?: string;
  provider?: string;
  operationType?: AiOperationType;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  status: 'success' | 'failed';
  errorCode?: string;
}): Promise<void> {
  if (!input.businessId || !input.ownerId || input.ownerId === 'demo') return;
  const logRef = doc(collection(db, 'aiUsageLogs'));
  const cleanEmail = normalizeEmail(input.clientEmail || '');
  const payload = {
    requestId: logRef.id,
    businessId: clampString(input.businessId, 128),
    ownerId: clampString(input.ownerId, 128),
    ...(cleanEmail ? { clientEmail: cleanEmail } : {}),
    provider: clampString(input.provider || 'gemini', 40),
    operationType: input.operationType || 'review_draft',
    modelName: clampString(input.modelName || 'gemini-3.1-flash-lite', 80),
    inputTokens: Math.max(0, Math.round(Number(input.inputTokens || 0))),
    outputTokens: Math.max(0, Math.round(Number(input.outputTokens || 0))),
    totalTokens: Math.max(0, Math.round(Number(input.totalTokens || 0))),
    estimatedCostUsd: Math.max(0, Number(input.estimatedCostUsd || 0)),
    status: input.status === 'failed' ? 'failed' : 'success',
    errorCode: clampString(input.errorCode || '', 64),
    createdAt: serverTimestamp(),
  };
  try {
    await setDoc(logRef, payload);
  } catch {
    // Non-blocking telemetry log
  }
}

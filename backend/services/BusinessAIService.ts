import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { decryptApiKey, encryptApiKey, maskApiKey } from './CryptoService';
import {
  appendAiUsageLog,
  getAiRecord,
  getCentralFirestoreConfig,
  getUsageLogsForBusiness,
  upsertAiRecord,
  type AiConnectionStatus,
  type AiUsageLogRecord,
  type BusinessAiRecord,
} from './TenantVaultStore';

export type ReviewStyle = 'short' | 'detailed' | 'professional';

export const ALLOWED_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-4-hydrogen',
  'gemini-4-argon',
] as const;

export type AllowedGeminiModel = (typeof ALLOWED_GEMINI_MODELS)[number];

export const DEFAULT_GEMINI_MODEL: AllowedGeminiModel = 'gemini-3.1-flash-lite';

export interface QuestionResponseInput {
  question: string;
  answers: string[];
}

export interface ClassifiedGeminiError {
  code:
    | 'INVALID_KEY'
    | 'BILLING_DISABLED'
    | 'QUOTA_EXHAUSTED'
    | 'RATE_LIMITED'
    | 'MODEL_UNAVAILABLE'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';
  connectionStatus: AiConnectionStatus;
  httpStatus: number;
  retryable: boolean;
  userMessage: string;
  detail: string;
}

export function normalizeModelName(model?: string): AllowedGeminiModel {
  if (model && (ALLOWED_GEMINI_MODELS as readonly string[]).includes(model.trim())) {
    return model.trim() as AllowedGeminiModel;
  }
  return DEFAULT_GEMINI_MODEL;
}

export function classifyGeminiError(err: unknown): ClassifiedGeminiError {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();
  const statusProp =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : 0;

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('unauthenticated') ||
    statusProp === 401
  ) {
    return {
      code: 'INVALID_KEY',
      connectionStatus: 'invalid_key',
      httpStatus: 400,
      retryable: false,
      userMessage:
        'This Gemini API key is invalid or has been revoked. Generate a valid key at aistudio.google.com/apikey.',
      detail: rawMessage.slice(0, 220),
    };
  }

  if (
    lower.includes('billing') ||
    lower.includes('payment') ||
    lower.includes('free tier') ||
    lower.includes('permission_denied') ||
    statusProp === 403
  ) {
    return {
      code: 'BILLING_DISABLED',
      connectionStatus: 'billing_disabled',
      httpStatus: 403,
      retryable: false,
      userMessage:
        'Google AI billing or API permission is not enabled on this business Google Cloud project. Enable billing in Google Cloud / AI Studio and reconnect.',
      detail: rawMessage.slice(0, 220),
    };
  }

  if (
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('spending limit') ||
    lower.includes('exhausted')
  ) {
    return {
      code: 'QUOTA_EXHAUSTED',
      connectionStatus: 'quota_exhausted',
      httpStatus: 429,
      retryable: false,
      userMessage:
        'This business Gemini API key has reached its quota or spending limit. Check Google Cloud billing & quotas.',
      detail: rawMessage.slice(0, 220),
    };
  }

  if (statusProp === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      code: 'RATE_LIMITED',
      connectionStatus: 'connected',
      httpStatus: 429,
      retryable: true,
      userMessage: 'Gemini API rate limit reached for this business. Please try again in a few seconds.',
      detail: rawMessage.slice(0, 220),
    };
  }

  if (statusProp === 503 || lower.includes('unavailable') || lower.includes('model')) {
    return {
      code: 'MODEL_UNAVAILABLE',
      connectionStatus: 'connected',
      httpStatus: 503,
      retryable: true,
      userMessage: 'Selected Gemini model is temporarily busy. Try again or switch model in Infrastructure & AI.',
      detail: rawMessage.slice(0, 220),
    };
  }

  if (lower.includes('fetch') || lower.includes('network') || lower.includes('enotfound')) {
    return {
      code: 'NETWORK_ERROR',
      connectionStatus: 'error',
      httpStatus: 502,
      retryable: true,
      userMessage: 'Network error reaching Google Gemini API. Please retry shortly.',
      detail: rawMessage.slice(0, 220),
    };
  }

  return {
    code: 'UNKNOWN',
    connectionStatus: 'error',
    httpStatus: 500,
    retryable: false,
    userMessage: `Gemini API request failed: ${rawMessage.slice(0, 140)}`,
    detail: rawMessage.slice(0, 220),
  };
}

function createTenantGenAIClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function validateGeminiApiKey(
  apiKey: string,
  modelName?: string,
): Promise<
  | { valid: true; modelName: AllowedGeminiModel; maskedKey: string }
  | {
      valid: false;
      code: ClassifiedGeminiError['code'];
      connectionStatus: AiConnectionStatus;
      httpStatus: number;
      message: string;
    }
> {
  const cleanKey = apiKey.trim();
  if (!cleanKey || cleanKey.length < 20) {
    return {
      valid: false,
      code: 'INVALID_KEY',
      connectionStatus: 'invalid_key',
      httpStatus: 400,
      message: 'Please paste a valid Gemini API key from Google AI Studio (aistudio.google.com/apikey).',
    };
  }

  const model = normalizeModelName(modelName);
  try {
    const ai = createTenantGenAIClient(cleanKey);
    const result = await ai.models.generateContent({
      model,
      contents: 'Reply with OK',
      config: {
        maxOutputTokens: 8,
        ...(model === 'gemini-4-hydrogen' || model === 'gemini-4-argon'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
      },
    });
    if (!result) {
      throw new Error('Empty verification response from Gemini API.');
    }
    return {
      valid: true,
      modelName: model,
      maskedKey: maskApiKey(cleanKey),
    };
  } catch (err) {
    const classified = classifyGeminiError(err);
    return {
      valid: false,
      code: classified.code,
      connectionStatus: classified.connectionStatus,
      httpStatus: classified.httpStatus,
      message: classified.userMessage,
    };
  }
}

export async function connectBusinessGeminiKey(input: {
  businessId: string;
  apiKey: string;
  modelName?: string;
}): Promise<Omit<BusinessAiRecord, 'encryptedKey'>> {
  const cleanKey = input.apiKey.trim();
  const model = normalizeModelName(input.modelName);
  const validation = await validateGeminiApiKey(cleanKey, model);

  if (!validation.valid) {
    const existing = getAiRecord(input.businessId);
    if (existing) {
      upsertAiRecord({
        ...existing,
        lastValidatedAt: new Date().toISOString(),
        connectionStatus: validation.connectionStatus,
        lastError: validation.message,
        updatedAt: new Date().toISOString(),
      });
    }
    const err = new Error(validation.message) as Error & {
      httpStatus?: number;
      code?: string;
    };
    err.httpStatus = validation.httpStatus;
    err.code = validation.code;
    throw err;
  }

  const encrypted = encryptApiKey(cleanKey);
  const now = new Date().toISOString();
  const existing = getAiRecord(input.businessId);

  return upsertAiRecord({
    businessId: input.businessId,
    aiProvider: 'gemini',
    encryptedKey: encrypted,
    maskedKey: validation.maskedKey,
    modelName: validation.modelName,
    connectionStatus: 'connected',
    connectedAt: existing?.connectedAt || now,
    lastValidatedAt: now,
    lastSuccessfulRequest: existing?.lastSuccessfulRequest || null,
    lastError: null,
    totalRequests: existing?.totalRequests ?? 0,
    successfulRequests: existing?.successfulRequests ?? 0,
    failedRequests: existing?.failedRequests ?? 0,
    totalInputTokens: existing?.totalInputTokens ?? 0,
    totalOutputTokens: existing?.totalOutputTokens ?? 0,
    totalTokens: existing?.totalTokens ?? 0,
    updatedAt: now,
  });
}

export function updateBusinessAiModel(input: {
  businessId: string;
  modelName: string;
}): Omit<BusinessAiRecord, 'encryptedKey'> {
  const model = normalizeModelName(input.modelName);
  const now = new Date().toISOString();
  const existing = getAiRecord(input.businessId);
  if (!existing) {
    return upsertAiRecord({
      businessId: input.businessId,
      aiProvider: 'gemini',
      encryptedKey: null,
      maskedKey: '',
      modelName: model,
      connectionStatus: 'not_connected',
      connectedAt: null,
      lastValidatedAt: null,
      lastSuccessfulRequest: null,
      lastError: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      updatedAt: now,
    });
  }

  return upsertAiRecord({
    ...existing,
    modelName: model,
    updatedAt: now,
  });
}

export function getSafeBusinessAiSummary(businessId: string): Omit<BusinessAiRecord, 'encryptedKey'> {
  const existing = getAiRecord(businessId);
  if (!existing) {
    return {
      businessId,
      aiProvider: 'gemini',
      maskedKey: '',
      modelName: DEFAULT_GEMINI_MODEL,
      connectionStatus: 'not_connected',
      connectedAt: null,
      lastValidatedAt: null,
      lastSuccessfulRequest: null,
      lastError: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      updatedAt: '',
    };
  }
  const { encryptedKey: _omit, ...safe } = existing;
  return safe;
}

export function getBusinessAiUsageHistory(businessId: string): AiUsageLogRecord[] {
  return getUsageLogsForBusiness(businessId);
}

// Parse Central Firestore REST document value
interface FirestoreRestValue {
  stringValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

function readRestString(fields: Record<string, FirestoreRestValue> | undefined, key: string): string {
  return fields?.[key]?.stringValue ?? '';
}

function readRestStringArray(
  fields: Record<string, FirestoreRestValue> | undefined,
  key: string,
): string[] {
  const vals = fields?.[key]?.arrayValue?.values;
  if (!Array.isArray(vals)) return [];
  return vals.map((v) => v.stringValue ?? '').filter(Boolean);
}

export interface CentralPublicProfileLookup {
  found: boolean;
  businessId: string;
  slug: string;
  name: string;
  category: string;
  qrActive: boolean;
  seoKeywords: string[];
  lifecycleStatus: string;
}

export async function lookupPublicProfileInCentralFirestore(
  slug: string,
): Promise<CentralPublicProfileLookup | null> {
  const cfg = getCentralFirestoreConfig();
  if (!cfg.projectId || !cfg.apiKey) return null;

  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.projectId,
    )}/databases/${encodeURIComponent(cfg.databaseId)}/documents/publicProfiles/${encodeURIComponent(
      cleanSlug,
    )}?key=${encodeURIComponent(cfg.apiKey)}`;

    const res = await fetch(docUrl);
    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as { fields?: Record<string, FirestoreRestValue> };
    const fields = json.fields;
    if (!fields) return null;

    const qrFields = fields.qrConfig?.mapValue?.fields;
    return {
      found: true,
      businessId: readRestString(fields, 'businessId'),
      slug: readRestString(fields, 'slug') || cleanSlug,
      name: readRestString(fields, 'name'),
      category: readRestString(fields, 'category'),
      qrActive: qrFields?.isActive?.booleanValue !== false,
      seoKeywords: readRestStringArray(fields, 'seoKeywords'),
      lifecycleStatus: readRestString(fields, 'lifecycleStatus') || 'active',
    };
  } catch {
    return null;
  }
}

export const CATEGORY_SEO_KEYWORDS: Record<string, string[]> = {
  'Hair Salons': [
    'hair salon',
    'haircut',
    'hair styling',
    'hair colour',
    'hair spa',
    'keratin treatment',
    'hairstylist',
    'beard styling',
  ],
  'Beauty Salons': [
    'beauty salon',
    'facial and skincare',
    'manicure and pedicure',
    'makeup',
    'beauty parlour',
    'brows and lashes',
  ],
  Restaurants: [
    'restaurant',
    'dine-in',
    'fresh food',
    'dining experience',
    'takeaway',
    'delicious food',
  ],
  Hotels: [
    'hotel',
    'hotel stay',
    'clean comfortable rooms',
    'hospitality',
    'breakfast',
    'check-in',
  ],
  Spas: [
    'spa',
    'massage',
    'deep tissue massage',
    'aromatherapy',
    'wellness spa',
    'relaxing spa',
  ],
  Gyms: [
    'gym',
    'fitness center',
    'workout',
    'strength training',
    'cardio',
    'personal training',
    'fitness classes',
  ],
  Healthcare: [
    'clinic',
    'healthcare',
    'doctor consultation',
    'medical care',
    'routine check-up',
    'patient care',
  ],
  'Retail Stores': [
    'retail store',
    'shopping experience',
    'quality products',
    'store',
    'customer service',
  ],
  'Automobile Services': [
    'auto service',
    'car repair',
    'vehicle maintenance',
    'oil change',
    'car detailing',
    'diagnostics',
  ],
  'Other Businesses': [
    'local business',
    'service quality',
    'customer experience',
    'reliable service',
  ],
};

export function getCategoryKeywords(category: string): string[] {
  if (CATEGORY_SEO_KEYWORDS[category]) {
    return CATEGORY_SEO_KEYWORDS[category];
  }
  const normalized = category.toLowerCase();
  for (const [key, terms] of Object.entries(CATEGORY_SEO_KEYWORDS)) {
    if (normalized.includes(key.toLowerCase().replace(/s$/, ''))) {
      return terms;
    }
  }
  return category ? [category.toLowerCase(), 'quality service', 'customer experience'] : ['quality service'];
}

function buildDeterministicLocalSeoKeywords(
  businessName: string,
  category: string,
  address: string,
): string[] {
  const baseTerms = getCategoryKeywords(category);
  const primaryTerm = baseTerms[0] || category.toLowerCase() || 'local business';
  const nameWords = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'studio', 'center', 'centre'].includes(w));

  const cityToken = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !/^\d+$/.test(part))
    .slice(-1)[0];

  const candidateList: string[] = [
    ...baseTerms,
    ...(nameWords.slice(0, 2).map((w) => `${w} ${primaryTerm}`.slice(0, 45))),
    ...(cityToken ? [`${primaryTerm} in ${cityToken}`.slice(0, 45)] : []),
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const kw of candidateList) {
    const clean = kw.trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out.slice(0, 10);
}

export async function generateSeoKeywordsWithTenant(input: {
  businessId?: string;
  businessName: string;
  category: string;
  address?: string;
}): Promise<{ keywords: string[]; source: 'business_gemini' | 'deterministic_category' }> {
  const baseTerms = getCategoryKeywords(input.category);
  const aiRecord = input.businessId ? getAiRecord(input.businessId) : null;

  // Only invoke Gemini when the business itself has a connected tenant Gemini API key.
  // Before Step 4 (onboarding Step 1), generate tailored SEO keywords locally so one global key is never shared across tenants.
  if (!aiRecord?.encryptedKey || aiRecord.connectionStatus !== 'connected') {
    return {
      keywords: buildDeterministicLocalSeoKeywords(
        input.businessName,
        input.category,
        input.address || '',
      ),
      source: 'deterministic_category',
    };
  }

  let apiKey: string | null = null;
  const now = new Date().toISOString();
  const requestId = `seo_${crypto.randomUUID().slice(0, 12)}`;
  const model = normalizeModelName(aiRecord.modelName);

  try {
    apiKey = decryptApiKey(aiRecord.encryptedKey);
    const ai = createTenantGenAIClient(apiKey);
    const prompt = [
      `Business Name: ${input.businessName}`,
      input.category ? `Category: ${input.category}` : '',
      input.address ? `Location / Address: ${input.address}` : '',
      `Baseline Category Terms: ${baseTerms.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    const systemInstruction = [
      'You are a Google Business Profile & Local Search SEO strategist.',
      'Generate 8 to 10 high-intent Google Maps search keywords tailored to this specific business name, category, and optional location.',
      'Keep each keyword concise (1 to 4 words, max 45 characters), clean natural phrase, no hashtags.',
    ].join('\n');

    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        ...(model === 'gemini-4-hydrogen' || model === 'gemini-4-argon'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['keywords'],
        },
      },
    });

    const inputTokens = result.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = result.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = result.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

    appendAiUsageLog({
      requestId,
      businessId: aiRecord.businessId,
      modelName: model,
      inputTokens,
      outputTokens,
      totalTokens,
      status: 'success',
      errorCode: '',
      errorMessage: '',
      createdAt: now,
    });

    upsertAiRecord({
      ...aiRecord,
      lastSuccessfulRequest: now,
      lastError: null,
      totalRequests: aiRecord.totalRequests + 1,
      successfulRequests: aiRecord.successfulRequests + 1,
      totalInputTokens: aiRecord.totalInputTokens + inputTokens,
      totalOutputTokens: aiRecord.totalOutputTokens + outputTokens,
      totalTokens: aiRecord.totalTokens + totalTokens,
      updatedAt: now,
    });

    const parsed = JSON.parse((result.text ?? '').trim()) as { keywords?: unknown };
    if (Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
      const seen = new Set<string>();
      const cleanList: string[] = [];
      for (const item of parsed.keywords) {
        if (typeof item !== 'string') continue;
        const clean = item.trim().slice(0, 60);
        const key = clean.toLowerCase();
        if (clean && !seen.has(key)) {
          seen.add(key);
          cleanList.push(clean);
        }
      }
      if (cleanList.length > 0) {
        return { keywords: cleanList.slice(0, 12), source: 'business_gemini' };
      }
    }
  } catch (err) {
    const classified = classifyGeminiError(err);
    appendAiUsageLog({
      requestId,
      businessId: aiRecord.businessId,
      modelName: model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      status: 'failed',
      errorCode: classified.code,
      errorMessage: classified.userMessage,
      createdAt: now,
    });
    upsertAiRecord({
      ...aiRecord,
      connectionStatus: classified.connectionStatus,
      lastError: classified.userMessage,
      totalRequests: aiRecord.totalRequests + 1,
      failedRequests: aiRecord.failedRequests + 1,
      updatedAt: now,
    });
  } finally {
    apiKey = null;
  }

  return {
    keywords: buildDeterministicLocalSeoKeywords(
      input.businessName,
      input.category,
      input.address || '',
    ),
    source: 'deterministic_category',
  };
}

export interface GenerateReviewTenantInput {
  slug?: string;
  businessId?: string;
  isPreview?: boolean;
  businessName: string;
  category: string;
  seoKeywords?: string[];
  responses: QuestionResponseInput[];
  additionalComments?: string;
  style: ReviewStyle;
  variationSeed?: number;
}

export interface GenerateReviewTenantResult {
  review: string;
  drafts: Record<ReviewStyle, string>;
  keywordsUsed: string[];
  modelUsed: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export async function generateReviewWithTenantKey(
  input: GenerateReviewTenantInput,
): Promise<GenerateReviewTenantResult> {
  let resolvedBusinessId = (input.businessId || '').trim();
  let resolvedBusinessName = input.businessName.trim();
  let resolvedCategory = input.category.trim();
  let resolvedKeywords = Array.isArray(input.seoKeywords) ? input.seoKeywords : [];

  // 1. Authoritatively validate public slug / business mapping against Central Firestore
  if (input.slug) {
    const profile = await lookupPublicProfileInCentralFirestore(input.slug);
    if (profile && profile.found) {
      if (profile.lifecycleStatus === 'suspended') {
        const err = new Error('This business account is currently suspended by ReviewFlow administration.') as Error & {
          httpStatus?: number;
        };
        err.httpStatus = 403;
        throw err;
      }
      if (!profile.qrActive && !input.isPreview) {
        const err = new Error('This QR code is currently paused by the business.') as Error & {
          httpStatus?: number;
        };
        err.httpStatus = 403;
        throw err;
      }
      if (profile.businessId) {
        resolvedBusinessId = profile.businessId;
      }
      if (profile.name) resolvedBusinessName = profile.name;
      if (profile.category) resolvedCategory = profile.category;
      if (profile.seoKeywords.length > 0) resolvedKeywords = profile.seoKeywords;
    }
  }

  // 2. Resolve tenant-specific Gemini API key (never fall back to a shared key for registered businesses)
  const isBuiltInShowcaseDemo =
    input.slug === 'stylish-hair-studio' || resolvedBusinessId === 'demo-stylish-hair-studio';

  const aiRecord = resolvedBusinessId ? getAiRecord(resolvedBusinessId) : null;
  let decryptedKey: string | null = null;
  let preferredModel: AllowedGeminiModel = DEFAULT_GEMINI_MODEL;

  if (aiRecord?.encryptedKey) {
    decryptedKey = decryptApiKey(aiRecord.encryptedKey);
    preferredModel = normalizeModelName(aiRecord.modelName);
  } else if (isBuiltInShowcaseDemo && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    decryptedKey = process.env.GEMINI_API_KEY;
  }

  if (!decryptedKey) {
    const err = new Error(
      `${resolvedBusinessName || 'This business'} has not connected its own Gemini API key yet. Business owners must add their Gemini API key in Portal → Infrastructure & AI (from aistudio.google.com/apikey).`,
    ) as Error & { httpStatus?: number; code?: string };
    err.httpStatus = 400;
    err.code = 'TENANT_AI_KEY_MISSING';
    throw err;
  }

  const formattedResponses = input.responses
    .filter(
      (item) =>
        item &&
        typeof item.question === 'string' &&
        Array.isArray(item.answers) &&
        item.answers.length > 0,
    )
    .map((item) => `- ${item.question}: ${item.answers.join(', ')}`)
    .join('\n');

  const additionalComments = (input.additionalComments || '').trim();
  const categoryTerms = getCategoryKeywords(resolvedCategory);
  const mergedSeoKeywords = Array.from(new Set([...resolvedKeywords, ...categoryTerms])).slice(0, 14);
  const selectedTerms = input.responses
    .flatMap((r) => (Array.isArray(r?.answers) ? r.answers : []))
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  const prompt = [
    `Business: ${resolvedBusinessName}`,
    resolvedCategory ? `Category: ${resolvedCategory}` : '',
    `Target Local Search Keywords (prioritize the business's tailored keywords naturally where true to customer selections): ${mergedSeoKeywords.join(', ')}`,
    selectedTerms.length > 0 ? `Customer Selected Services/Traits: ${selectedTerms.join(', ')}` : '',
    `Variation: ${input.variationSeed ?? 1}`,
    'Customer Selections:',
    formattedResponses || '(None)',
    additionalComments ? `Comments: "${additionalComments}"` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const systemInstruction = [
    'You write authentic, human-sounding Google reviews optimized for Google Maps local search relevance.',
    'Generate ALL THREE variations (short, detailed, professional) from the exact customer inputs:',
    '- short: 2-3 sentences (~28-48 words), crisp and natural.',
    '- detailed: 4-5 sentences (~60-95 words), conversational story weaving services, staff/experience, and comments.',
    '- professional: 3-4 sentences (~45-70 words), articulate and courteous.',
    'SEO & Authenticity Rules:',
    '1. Naturally include the business name, the primary category search term (e.g. "hair salon", "gym", "restaurant", "spa", "auto repair", matching the business category), and the exact services/items the customer selected so Google indexes the review for local searches.',
    '2. Keep wording natural—never stuff awkward keyword lists or repeat the same phrase robotically.',
    '3. First-person perspective ("I" or "We"). Never invent staff names, prices, or unmentioned services.',
    '4. Match exact sentiment: if customer chose "Average", "Poor", or criticism, write an honest, balanced review without inflating praise.',
    '5. Avoid clichés ("exceeded all expectations", "cannot recommend enough", "from start to finish"). Plain text only—no quotes, hashtags, bullets, or emojis.',
    '6. Return keywordsUsed with the 3-6 exact local search phrases included in the drafts.',
  ].join('\n');

  const requestId = `rev_${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  try {
    const ai = createTenantGenAIClient(decryptedKey);
    const fallbackModel: AllowedGeminiModel =
      preferredModel === 'gemini-3.1-flash-lite' ? 'gemini-4-hydrogen' : 'gemini-3.1-flash-lite';
    const attempts: Array<{ model: AllowedGeminiModel; thinkingLevel?: ThinkingLevel }> = [
      {
        model: preferredModel,
        ...(preferredModel !== 'gemini-3.1-flash-lite' ? { thinkingLevel: ThinkingLevel.LOW } : {}),
      },
      {
        model: fallbackModel,
        ...(fallbackModel !== 'gemini-3.1-flash-lite' ? { thinkingLevel: ThinkingLevel.LOW } : {}),
      },
    ];

    let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let modelUsed: AllowedGeminiModel = preferredModel;
    let lastErr: unknown = null;

    for (const cfg of attempts) {
      for (let retry = 0; retry < 2; retry += 1) {
        try {
          response = await ai.models.generateContent({
            model: cfg.model,
            contents: prompt,
            config: {
              systemInstruction,
              ...(cfg.thinkingLevel ? { thinkingConfig: { thinkingLevel: cfg.thinkingLevel } } : {}),
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  short: { type: Type.STRING },
                  detailed: { type: Type.STRING },
                  professional: { type: Type.STRING },
                  keywordsUsed: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['short', 'detailed', 'professional', 'keywordsUsed'],
              },
            },
          });
          modelUsed = cfg.model;
          break;
        } catch (err) {
          lastErr = err;
          const classified = classifyGeminiError(err);
          // Do NOT retry invalid key, billing disabled, or quota exhaustion
          if (!classified.retryable) {
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
      if (response) break;
    }

    if (!response) {
      throw lastErr || new Error('Unable to generate review draft.');
    }

    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = response.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;

    const rawText = (response.text ?? '').trim();
    let drafts: Record<ReviewStyle, string> = { short: '', detailed: '', professional: '' };
    let keywordsUsed: string[] = [];

    if (rawText) {
      try {
        const parsed = JSON.parse(rawText) as {
          short?: string;
          detailed?: string;
          professional?: string;
          review?: string;
          keywordsUsed?: unknown;
        };
        const fallbackSingle = typeof parsed.review === 'string' ? parsed.review.trim() : '';
        drafts = {
          short: (typeof parsed.short === 'string' ? parsed.short.trim() : '') || fallbackSingle,
          detailed:
            (typeof parsed.detailed === 'string' ? parsed.detailed.trim() : '') || fallbackSingle,
          professional:
            (typeof parsed.professional === 'string' ? parsed.professional.trim() : '') ||
            fallbackSingle,
        };
        if (Array.isArray(parsed.keywordsUsed)) {
          keywordsUsed = parsed.keywordsUsed
            .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            .map((k) => k.trim())
            .slice(0, 6);
        }
      } catch {
        const cleanFallback = rawText.replace(/^["']|["']$/g, '').trim();
        drafts = { short: cleanFallback, detailed: cleanFallback, professional: cleanFallback };
      }
    }

    const reviewText = drafts[input.style] || drafts.short || drafts.detailed || drafts.professional;
    if (!reviewText) {
      throw new Error('Unable to generate a review draft right now. Please try again.');
    }

    if (aiRecord && resolvedBusinessId) {
      appendAiUsageLog({
        requestId,
        businessId: resolvedBusinessId,
        modelName: modelUsed,
        inputTokens,
        outputTokens,
        totalTokens,
        status: 'success',
        errorCode: '',
        errorMessage: '',
        createdAt: now,
      });

      upsertAiRecord({
        ...aiRecord,
        connectionStatus: 'connected',
        lastSuccessfulRequest: now,
        lastError: null,
        totalRequests: aiRecord.totalRequests + 1,
        successfulRequests: aiRecord.successfulRequests + 1,
        totalInputTokens: aiRecord.totalInputTokens + inputTokens,
        totalOutputTokens: aiRecord.totalOutputTokens + outputTokens,
        totalTokens: aiRecord.totalTokens + totalTokens,
        updatedAt: now,
      });
    }

    return {
      review: reviewText,
      drafts,
      keywordsUsed,
      modelUsed,
      usage: { inputTokens, outputTokens, totalTokens },
    };
  } catch (err) {
    const classified = classifyGeminiError(err);
    if (aiRecord && resolvedBusinessId) {
      appendAiUsageLog({
        requestId,
        businessId: resolvedBusinessId,
        modelName: preferredModel,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        status: 'failed',
        errorCode: classified.code,
        errorMessage: classified.userMessage,
        createdAt: now,
      });
      upsertAiRecord({
        ...aiRecord,
        connectionStatus: classified.connectionStatus,
        lastError: classified.userMessage,
        totalRequests: aiRecord.totalRequests + 1,
        failedRequests: aiRecord.failedRequests + 1,
        updatedAt: now,
      });
    }

    const wrapped = new Error(classified.userMessage) as Error & {
      httpStatus?: number;
      code?: string;
    };
    wrapped.httpStatus = classified.httpStatus;
    wrapped.code = classified.code;
    throw wrapped;
  } finally {
    // Discard plain key reference promptly
    decryptedKey = null;
  }
}

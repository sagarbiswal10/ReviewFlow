import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { validateReviewQuality, type QualityReviewLanguage, type ReviewQualityReport } from './reviewQualityCore.js';

export type ReviewStyle = 'short' | 'detailed' | 'professional';

export type ReviewLanguage = QualityReviewLanguage;

export interface QuestionResponseInput {
  question: string;
  answers: string[];
}

export interface FewShotExampleInput {
  responsesSummary: string;
  finalReview: string;
}

export interface GenerateReviewBody {
  businessName: string;
  category: string;
  seoKeywords?: string[];
  responses: QuestionResponseInput[];
  additionalComments?: string;
  style: ReviewStyle;
  language?: ReviewLanguage;
  variationSeed?: number;
  previousDrafts?: string[];
  fewShotExamples?: FewShotExampleInput[];
}

export interface GenerateSeoKeywordsBody {
  businessName: string;
  category: string;
  address?: string;
}

export interface GenerateReplyBody {
  businessName: string;
  category: string;
  reviewerName: string;
  starRating: number;
  reviewComment: string;
  brandVoice?: string;
  fiveStarMode?: 'auto_publish' | 'approval_required';
  midStarMode?: 'auto_publish' | 'approval_required';
}

export interface ValidateQrStandSlotBody {
  businessId: string;
  slotNumber: number;
}

export interface GbpProxyBody {
  action: 'list_locations' | 'fetch_reviews' | 'publish_reply';
  gbpAccessToken: string;
  locationName?: string;
  externalReviewId?: string;
  replyText?: string;
}

function cleanSecretEnv(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

export const AI_PROVIDER =
  cleanSecretEnv(process.env.AI_PROVIDER).toLowerCase() === 'openai' ? 'openai' : 'gemini';
export const GEMINI_MODEL = cleanSecretEnv(process.env.GEMINI_MODEL) || 'gemini-3.1-flash-lite';
export const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL !== undefined
    ? cleanSecretEnv(process.env.GEMINI_FALLBACK_MODEL)
    : 'gemini-4-hydrogen';
export const API_AUTH_REQUIRED = cleanSecretEnv(process.env.API_AUTH_REQUIRED) !== 'false';

const DEFAULT_FIREBASE_PROJECT_ID = 'gen-lang-client-0894437771';
const DEFAULT_FIREBASE_DATABASE_ID = 'ai-studio-c58774bf-bd18-4afa-b645-7a968ff8b63b';

function resolveFirebaseConfig(): { projectId: string; databaseId: string } {
  const envProjectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    ''
  ).trim();
  const envDbId = (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    ''
  ).trim();

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
      };
      return {
        projectId: envProjectId || (parsed.projectId || '').trim() || DEFAULT_FIREBASE_PROJECT_ID,
        databaseId:
          envDbId ||
          (parsed.firestoreDatabaseId || '').trim() ||
          DEFAULT_FIREBASE_DATABASE_ID,
      };
    }
  } catch {
    // Ignore missing/invalid local config file
  }
  return {
    projectId: envProjectId || DEFAULT_FIREBASE_PROJECT_ID,
    databaseId: envDbId || DEFAULT_FIREBASE_DATABASE_ID,
  };
}

const FIREBASE_CONF = resolveFirebaseConfig();
export const FIREBASE_PROJECT_ID = FIREBASE_CONF.projectId;
export const FIREBASE_DATABASE_ID = FIREBASE_CONF.databaseId;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

let certCache: { certs: Record<string, string>; expiresAt: number } = {
  certs: {},
  expiresAt: 0,
};

async function getFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && now < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }

  const res = await fetchWithTimeout(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    {},
    8000,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase Auth public keys (${res.status})`);
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await res.json()) as Record<string, string>;

  certCache = {
    certs,
    expiresAt: now + ttlSeconds * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json) as T;
}

export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<{ uid: string; email: string }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed bearer token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    exp?: number;
    iat?: number;
  }>(payloadB64);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid token signature algorithm.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Session token has expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 120) {
    throw new Error('Token issued-at claim is invalid.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token subject is missing.');
  }

  if (FIREBASE_PROJECT_ID) {
    if (payload.aud !== FIREBASE_PROJECT_ID) {
      throw new Error('Token audience does not match this project.');
    }
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
      throw new Error('Token issuer does not match this project.');
    }
  }

  let certs = await getFirebasePublicCerts();
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await getFirebasePublicCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Unknown token signing key.');
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const sigPadded = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
  const signatureBuffer = Buffer.from(sigPadded, 'base64');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signingInput);
  const valid = verifier.verify(certPem, signatureBuffer);
  if (!valid) {
    throw new Error('Invalid token signature.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
  };
}

export async function authenticateBearerHeader(
  authHeader: string,
): Promise<{ ok: true; user?: { uid: string; email: string }; rawToken?: string } | { ok: false; status: number; error: string }> {
  if (!API_AUTH_REQUIRED) {
    return { ok: true };
  }
  if (!authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'Authentication required. Please sign in to use this API endpoint.',
    };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Bearer token is missing.' };
  }
  try {
    const user = await verifyFirebaseIdToken(token);
    return { ok: true, user, rawToken: token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return { ok: false, status: 401, error: `Invalid or expired session token: ${msg}` };
  }
}

export function isOriginAllowed(origin: string, hostHeader: string): boolean {
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (!cleanOrigin) return true;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const candidateHosts = hostHeader
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const isSameHost = candidateHosts.some(
    (h) => cleanOrigin === `https://${h}` || cleanOrigin === `http://${h}`,
  );
  return allowedOrigins.length === 0 || isSameHost || allowedOrigins.includes(cleanOrigin);
}

const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const existing = rateBuckets.get(key) || [];
  const recent = existing.filter((ts) => ts > cutoff);
  if (recent.length >= maxRequests) {
    return false;
  }
  recent.push(now);
  rateBuckets.set(key, recent);

  if (rateBuckets.size > 5000) {
    for (const [k, stamps] of rateBuckets.entries()) {
      if (stamps.every((ts) => ts <= cutoff)) {
        rateBuckets.delete(k);
      }
    }
  }
  return true;
}

function getGeminiApiKey(): string {
  return cleanSecretEnv(process.env.GEMINI_API_KEY) || cleanSecretEnv(process.env.API_KEY);
}

function sanitizeApiErrorDetail(message: string): string {
  let clean = message;
  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } };
    if (typeof parsed?.error?.message === 'string') {
      clean = parsed.error.message;
    }
  } catch {
    // Keep original message if not raw JSON
  }
  return clean
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[redacted-key]')
    .replace(/AQ\.[0-9A-Za-z_.-]{10,}/g, '[redacted-key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 450);
}

function calculateEstimatedCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const lower = modelId.toLowerCase();
  const isLite = lower.includes('flash-lite') || lower.includes('lite');
  const inputPerMillion = isLite ? 0.075 : 0.15;
  const outputPerMillion = isLite ? 0.3 : 0.6;
  const cost = (inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000;
  return Number(cost.toFixed(6));
}

function createGenAIClient(useVertexAi: boolean) {
  const apiKey = getGeminiApiKey();
  const disableHeader =
    cleanSecretEnv(process.env.DISABLE_AISTUDIO_HEADER) === 'true' ||
    Boolean(process.env.VERCEL);

  return new GoogleGenAI({
    apiKey,
    ...(useVertexAi ? { vertexai: true } : {}),
    ...(disableHeader
      ? {}
      : {
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        }),
  });
}

function getVertexEndpointModes(): boolean[] {
  const apiKey = getGeminiApiKey();
  const explicit = cleanSecretEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI).toLowerCase();
  if (explicit === 'true') return apiKey.startsWith('AQ.') ? [true, false] : [true];
  if (apiKey.startsWith('AQ.')) return [false, true];
  if (explicit === 'false') return [false];
  return [false];
}

interface GeminiGenerationResult {
  text: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

async function generateGeminiContentWithFallback(
  contents: string,
  config: Record<string, unknown>,
  maxTransientAttempts = 1,
): Promise<GeminiGenerationResult> {
  const modelAttempts = Array.from(
    new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter(Boolean)),
  );
  const endpointModes = getVertexEndpointModes();
  let lastErr: unknown;

  for (let modeIdx = 0; modeIdx < endpointModes.length; modeIdx += 1) {
    const useVertexAi = endpointModes[modeIdx];
    const hasNextMode = modeIdx < endpointModes.length - 1;
    const ai = createGenAIClient(useVertexAi);

    for (const modelName of modelAttempts) {
      for (let attempt = 0; attempt < maxTransientAttempts; attempt += 1) {
        try {
          const supportsMinimalThinking =
            modelName.startsWith('gemini-3.') && modelName.includes('flash-lite');
          const modelConfig = supportsMinimalThinking
            ? { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
            : config;
          const response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: modelConfig,
          });
          const text = (response.text ?? '').trim();
          const usage = response.usageMetadata;
          const inputTokens = Math.max(0, Number(usage?.promptTokenCount || 0));
          const outputTokens = Math.max(0, Number(usage?.candidatesTokenCount || 0));
          const totalTokens = Math.max(
            inputTokens + outputTokens,
            Number(usage?.totalTokenCount || 0),
          );
          if (text) {
            return {
              text,
              modelId: modelName,
              inputTokens,
              outputTokens,
              totalTokens,
            };
          }
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isApiKeyInvalid =
            msg.includes('API_KEY_INVALID') ||
            msg.toLowerCase().includes('api key not valid');
          if (isApiKeyInvalid && hasNextMode) {
            break;
          }
          const isNotFound = msg.includes('404') || msg.includes('NOT_FOUND');
          if (isNotFound) break;

          const isTransient =
            msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
          if (!isTransient) throw err;

          if (attempt < maxTransientAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
      }

      const lastMsg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '');
      if (
        hasNextMode &&
        (lastMsg.includes('API_KEY_INVALID') ||
          lastMsg.toLowerCase().includes('api key not valid'))
      ) {
        break;
      }
    }
  }

  if (lastErr) throw lastErr;
  return {
    text: '',
    modelId: GEMINI_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

async function callOpenAIJson(
  systemInstruction: string,
  prompt: string,
): Promise<GeminiGenerationResult> {
  const apiKey = cleanSecretEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 180)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const inputTokens = Math.max(0, Number(data.usage?.prompt_tokens || 0));
  const outputTokens = Math.max(0, Number(data.usage?.completion_tokens || 0));
  const totalTokens = Math.max(
    inputTokens + outputTokens,
    Number(data.usage?.total_tokens || 0),
  );
  return {
    text: (data.choices?.[0]?.message?.content || '').trim(),
    modelId: model,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

const CATEGORY_SEO_KEYWORDS: Record<string, string[]> = {
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

function getCategoryKeywords(category: string): string[] {
  if (CATEGORY_SEO_KEYWORDS[category]) {
    return CATEGORY_SEO_KEYWORDS[category];
  }
  const normalized = category.toLowerCase();
  for (const [key, terms] of Object.entries(CATEGORY_SEO_KEYWORDS)) {
    if (normalized.includes(key.toLowerCase().replace(/s$/, ''))) {
      return terms;
    }
  }
  return category
    ? [category.toLowerCase(), 'quality service', 'customer experience']
    : ['quality service'];
}

export function getHealthPayload() {
  const activeModel =
    AI_PROVIDER === 'openai'
      ? (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
      : GEMINI_MODEL;
  const geminiKey = getGeminiApiKey();
  return {
    ok: true,
    provider: AI_PROVIDER,
    model: activeModel,
    authRequired: API_AUTH_REQUIRED,
    keyConfigured: Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY'),
  };
}

export async function processGenerateSeoKeywords(
  body: Partial<GenerateSeoKeywordsBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';

    if (!businessName) {
      return {
        status: 400,
        data: { error: 'Business name is required to generate SEO keywords.' },
      };
    }

    const baseTerms = getCategoryKeywords(category);
    const prompt = [
      `Business Name: ${businessName}`,
      category ? `Category: ${category}` : '',
      address ? `Location / Address: ${address}` : '',
      `Baseline Category Terms: ${baseTerms.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    const systemInstruction = [
      'You are a Google Business Profile & Local Search SEO strategist.',
      'Generate 8 to 10 high-intent Google Maps search keywords tailored to this specific business name, category, and optional location.',
      'Return valid JSON matching {"keywords": ["..."]}.',
      'Rules:',
      '1. Infer specialties directly from the business name + category.',
      '2. Include the primary category search term and top natural service phrases customers search on Google Maps.',
      '3. If a city or neighborhood appears in the address, include 1-2 natural local search phrases combining the category + area.',
      '4. Keep each keyword concise (1 to 4 words, max 45 characters), lowercase or clean natural phrase, no hashtags, no spammy stuffing.',
    ].join('\n');

    let genResult: GeminiGenerationResult;
    if (AI_PROVIDER === 'openai') {
      genResult = await callOpenAIJson(systemInstruction, prompt);
    } else {
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return {
          status: 400,
          data: { error: 'GEMINI_API_KEY is not configured on the server.' },
        };
      }

      genResult = await generateGeminiContentWithFallback(
        prompt,
        {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              keywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '8 to 10 Google Maps local search keywords tailored to this business.',
              },
            },
            required: ['keywords'],
          },
        },
        1,
      );
    }

    if (!genResult.text) {
      return {
        status: 502,
        data: { error: 'Unable to generate SEO keywords right now.' },
      };
    }

    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(genResult.text) as { keywords?: unknown };
      if (Array.isArray(parsed.keywords)) {
        const seen = new Set<string>();
        for (const item of parsed.keywords) {
          if (typeof item !== 'string') continue;
          const clean = item.trim().slice(0, 60);
          const key = clean.toLowerCase();
          if (clean && !seen.has(key)) {
            seen.add(key);
            keywords.push(clean);
          }
        }
      }
    } catch {
      keywords = baseTerms;
    }

    return {
      status: 200,
      data: {
        keywords: keywords.slice(0, 12),
        aiTelemetry: {
          provider: AI_PROVIDER,
          modelId: genResult.modelId,
          inputTokens: genResult.inputTokens,
          outputTokens: genResult.outputTokens,
          totalTokens: genResult.totalTokens,
          estimatedCostUsd: calculateEstimatedCostUsd(
            genResult.modelId,
            genResult.inputTokens,
            genResult.outputTokens,
          ),
          status: 'success',
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = sanitizeApiErrorDetail(message);
    if (
      message.includes('PERMISSION_DENIED') ||
      message.includes('API_KEY_INVALID') ||
      message.toLowerCase().includes('api key not valid')
    ) {
      return {
        status: 400,
        data: {
          error: `API key error when generating SEO keywords: ${detail || 'Please check GEMINI_API_KEY in Settings > Secrets or your server environment.'}`,
        },
      };
    }
    console.error('SEO keyword generation error:', detail || message);
    return {
      status: 500,
      data: { error: `Failed to generate SEO keywords: ${detail.slice(0, 180) || message.slice(0, 180)}` },
    };
  }
}

export async function processGenerateReview(
  body: Partial<GenerateReviewBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const additionalComments =
      typeof body.additionalComments === 'string' ? body.additionalComments.trim() : '';
    const style: ReviewStyle =
      body.style === 'short' || body.style === 'detailed' || body.style === 'professional'
        ? body.style
        : 'short';
    const language: ReviewLanguage =
      body.language === 'hi' || body.language === 'mr' || body.language === 'hinglish'
        ? body.language
        : 'en';
    const responses = Array.isArray(body.responses) ? body.responses : [];
    const variationSeed =
      typeof body.variationSeed === 'number' && Number.isFinite(body.variationSeed)
        ? Math.max(1, Math.round(body.variationSeed))
        : 1;
    const previousDrafts = Array.isArray(body.previousDrafts)
      ? body.previousDrafts
          .filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
          .map((d) => d.trim().slice(0, 1200))
          .slice(0, 5)
      : [];
    const fewShotExamples = Array.isArray(body.fewShotExamples)
      ? body.fewShotExamples
          .filter(
            (ex): ex is FewShotExampleInput =>
              Boolean(ex) &&
              typeof ex.responsesSummary === 'string' &&
              ex.responsesSummary.trim().length > 0 &&
              typeof ex.finalReview === 'string' &&
              ex.finalReview.trim().length > 0,
          )
          .slice(0, 3)
      : [];

    if (!businessName) {
      return { status: 400, data: { error: 'Business name is required.' } };
    }

    const formattedResponses = responses
      .filter(
        (item) =>
          item &&
          typeof item.question === 'string' &&
          Array.isArray(item.answers) &&
          item.answers.length > 0,
      )
      .map((item) => `- ${item.question}: ${item.answers.join(', ')}`)
      .join('\n');

    if (!formattedResponses && !additionalComments) {
      return {
        status: 400,
        data: {
          error:
            'Please answer at least one question or add a comment before generating a review draft.',
        },
      };
    }

    const styleGuidance: Record<ReviewStyle, string> =
      language === 'hinglish'
        ? {
            short: 'Keep it concise and straightforward (2-3 simple everyday sentences; do not pad length or force an intro/conclusion).',
            detailed: 'Write a relaxed 3-4 sentence Hinglish review covering ONLY the points shared by the customer without filler words or forced recommendations.',
            professional: 'Keep the tone polite, clear, and conversational (2-3 sentences), still sounding like an ordinary customer rather than corporate language.',
          }
        : {
            short: 'Keep it concise and natural (around 2-3 everyday sentences).',
            detailed: 'Write a relaxed 3-5 sentence review covering only the points the customer actually shared.',
            professional: 'Keep the tone polite, clear, and conversational (2-4 sentences).',
          };

    const variationAngles = [
      'Start directly with the main thing the customer noticed first, then wrap up naturally.',
      'Open with a brief everyday summary of the visit, then share the specific points mentioned.',
      'Use a relaxed mix of one shorter sentence and one slightly fuller sentence.',
      'Lead with what stood out most (good or mixed) in plain conversational phrasing.',
      'Begin naturally with why or how the visit felt overall, followed by the exact details given.',
      'Keep sentence transitions simple and understated, as if texting a friend a quick honest opinion.',
    ];
    const selectedAngle = variationAngles[(variationSeed - 1) % variationAngles.length];

    const languageRules: Record<ReviewLanguage, string> = {
      en: [
        'Target Language: English.',
        'Write entirely in natural, everyday conversational English (Roman script only).',
        'Good natural example: "The food was really good, and the staff were friendly. The only thing was that the service took a little longer than expected. Overall, I had a nice experience."',
        'Bad AI-sounding style to AVOID: "I had an absolutely amazing experience at this wonderful restaurant. The food was exceptional, and the staff provided outstanding hospitality."',
      ].join('\n'),
      hi: [
        'Target Language: Hindi (हिंदी, Devanagari script ONLY).',
        'Write the ENTIRE review in natural, everyday spoken Hindi using Devanagari script (हिंदी).',
        'Use conversational, commonly spoken Hindi — NOT stiff, bookish, or overly formal Sanskritized translations.',
        'Do NOT mix full English sentences or write Hindi in Roman script here (Roman Hinglish has its own separate option).',
        'Good natural Hindi example: "यहाँ का खाना काफी अच्छा था और स्टाफ भी बहुत अच्छा था। बस सर्विस में थोड़ा समय लगा। बाकी मेरा अनुभव अच्छा रहा।"',
      ].join('\n'),
      mr: [
        'Target Language: Marathi (मराठी, Devanagari script ONLY).',
        'Write the ENTIRE review in natural, everyday spoken Marathi using Devanagari script (मराठी).',
        'Use conversational, commonly spoken Marathi — NOT literal word-for-word or stiff formal translations.',
        'Do NOT mix English sentences or Roman script unless a single unavoidable service noun is needed.',
        'Good natural Marathi example: "इथलं जेवण खूप छान होतं आणि स्टाफसुद्धा खूप मदत करणारा होता. फक्त सर्व्हिसला थोडा वेळ लागला. बाकी अनुभव चांगला होता."',
      ].join('\n'),
      hinglish: [
        'ROLE & TARGET LANGUAGE: You are an expert Indian Hinglish conversational writer working for ReviewFlow. Convert customer questionnaire answers into a simple, natural Hinglish Google review that an ordinary Indian customer would comfortably write.',
        '1. ROMAN SCRIPT ONLY: Write in everyday Indian Hinglish using Roman English characters ONLY — NEVER use Devanagari script (write "accha", NEVER "अच्छा").',
        '2. PREFERRED EVERYDAY VOCABULARY (use simple Hindi + commonly spoken English naturally):',
        '   - Use "accha" instead of "excellent"',
        '   - Use "kaafi" instead of "extremely"',
        '   - Use "khana" or "food" instead of "cuisine"',
        '   - Use "service" instead of "hospitality"',
        '   - Use "staff" instead of "personnel"',
        '   - Use "jagah" instead of "establishment"',
        '   - Use "dobara" instead of "once again"',
        '   - Use "experience" instead of "overall customer experience"',
        '   - Mix natural Hindi expressions ("kaafi accha", "bahut badhiya", "accha laga", "thoda wait", "dobara aana pasand karunga") with simple English words (food, service, ambience, staff, experience) without translating every English word or using stiff textbook Hindi.',
        '3. STYLE REFERENCE EXAMPLES (match tone ONLY — NEVER repeatedly copy these exact sentences):',
        '   - "Food kaafi accha tha aur service bhi quick thi."',
        '   - "Staff ka behaviour accha laga."',
        '   - "Jagah clean thi aur overall experience bhi badhiya raha."',
        '   - "Thoda wait karna pada, but food accha tha."',
        '   - "Overall sab accha tha, dobara aana pasand karunga."',
        '4. STRICTLY FORBIDDEN AI / PROMOTIONAL / CORPORATE PHRASES:',
        '   - NEVER use: "An absolutely delightful experience", "A truly unforgettable experience", "Exceptional hospitality and outstanding service", "A perfect blend of quality and excellence", "Highly recommended to everyone", "A must-visit destination", "The epitome of excellence", "Overall experience was amazing", "I would highly recommend this place", "Everything was just perfect", "One of the best places ever".',
        '   - Avoid difficult English vocabulary, corporate jargon, and excessive adjectives.',
        '5. NATURAL SENTENCE VARIATION & NO FORCED PADDING:',
        '   - Keep it 2-3 short, clear sentences (or concise single flow). Do NOT force an intro, a positive closing, a recommendation, or an emotional statement.',
        '   - Do NOT add extra words just to stretch length, and NEVER intentionally introduce spelling mistakes or broken grammar.',
        '6. SENTIMENT ACCURACY:',
        '   - Positive: natural satisfaction without exaggeration.',
        '   - Neutral / Average: balanced & straightforward — if something was "Average", keep it average/okay/theek; NEVER upgrade average to excellent.',
        '   - Negative / Mixed: mention both good and bad points honestly and respectfully without hiding criticism or manipulating sentiment.',
        '7. OUTPUT FORMAT & HYGIENE: Output ONLY clean Hinglish review text — NO hashtags, NO emojis (unless the customer used one), NO title, NO explanation, NO claim of being "human-written".',
      ].join('\n'),
    };

    const languageLabel =
      language === 'hi'
        ? 'Hindi (हिंदी)'
        : language === 'mr'
          ? 'Marathi (मराठी)'
          : language === 'hinglish'
            ? 'Hinglish (Roman Hindi + English)'
            : 'English';

    const calibrationBlock =
      fewShotExamples.length > 0
        ? [
            'Curated Style Exemplars (learn natural tone & brevity ONLY; NEVER copy facts from them):',
            ...fewShotExamples.map(
              (ex, idx) =>
                `Example ${idx + 1} Feedback: ${ex.responsesSummary}\nExample ${idx + 1} Natural Review: "${ex.finalReview}"`,
            ),
          ].join('\n')
        : '';

    const previousDraftsBlock =
      previousDrafts.length > 0
        ? [
            'Previous Drafts Already Shown (write fresh sentence structure so it does NOT repeat these word-for-word):',
            ...previousDrafts.map((d, idx) => `- Draft ${idx + 1}: "${d}"`),
          ].join('\n')
        : '';

    const prompt = [
      `Business Context: ${businessName}${category ? ` (${category})` : ''}`,
      `Requested Language: ${languageLabel}`,
      `Length/Flow Preference: ${styleGuidance[style]}`,
      `Draft Variation #${variationSeed}: ${selectedAngle}`,
      'Customer Feedback (use ONLY this information):',
      formattedResponses || '(No multiple-choice selections)',
      additionalComments ? `Customer Written Note: "${additionalComments}"` : '',
      calibrationBlock,
      previousDraftsBlock,
    ]
      .filter(Boolean)
      .join('\n\n');

    const systemInstruction = [
      'You help a real customer put their own feedback into a natural, personal, everyday Google review.',
      'Return valid JSON strictly matching this schema: {"review": string, "language": string, "sentimentDetected": string, "groundedFacts": string[], "styleApplied": string, "keywordsUsed": string[], "selfCheck": {"noInventedClaims": boolean, "scriptCompliant": boolean, "conversationalTone": boolean, "simpleVocabulary": boolean, "accurateSentiment": boolean}}.',
      languageRules[language],
      'Strict Authenticity, Grounding & Final Quality Verification Rules:',
      '1. Use ONLY the customer\'s actual answers, selected options, and written note. NEVER invent dishes/products ordered, staff names/conversations, discounts/offers, amenities/facilities, pricing, or unmentioned incidents.',
      '2. Preserve the customer\'s exact meaning and sentiment. If they gave mixed, average, or critical feedback (like slow service or average ambience), state it plainly and honestly — NEVER convert "average" into "excellent" or claim everything was perfect.',
      '3. If the customer said "No" or "Maybe" to returning, NEVER promise they will definitely come back.',
      '4. NEVER use generic AI phrases, marketing fluff, or excessive adjectives (ban words like "amazing experience", "delightful experience", "exceptional hospitality", "perfect blend", "epitome of excellence", "exceeded all expectations", "hidden gem", "top-notch", "must-visit destination", "highly recommended", "seamless experience", "everything was just perfect", "one of the best places ever").',
      '5. Vary sentence length and structure naturally so different drafts do not repeat sentences or sound templated. Never force an intro/conclusion or pad words.',
      '6. Do not force business names or marketing keywords if they make the review sound unnatural or scripted. No quotation marks around the review, no bullet points, no titles, no explanations, no hashtags, no emojis (unless in customer note), and never claim the review is "human-written".',
      '7. Before responding, internally verify in selfCheck: (a) natural conversational everyday phrasing, (b) simple commonly used words, (c) natural language/script mix, (d) accurate sentiment & answers, (e) zero unsupported claims, (f) zero repetitive promotional phrases, (g) easy for an ordinary customer to read.',
      '8. In groundedFacts, list the exact facts from the customer feedback you included. In keywordsUsed, list 0-3 short exact phrases directly drawn from what the customer mentioned.',
    ].join('\n');

    const reviewResponseSchema = {
      type: Type.OBJECT,
      properties: {
        review: { type: Type.STRING },
        language: { type: Type.STRING },
        sentimentDetected: { type: Type.STRING },
        groundedFacts: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        styleApplied: { type: Type.STRING },
        keywordsUsed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        selfCheck: {
          type: Type.OBJECT,
          properties: {
            noInventedClaims: { type: Type.BOOLEAN },
            scriptCompliant: { type: Type.BOOLEAN },
            conversationalTone: { type: Type.BOOLEAN },
            simpleVocabulary: { type: Type.BOOLEAN },
            accurateSentiment: { type: Type.BOOLEAN },
          },
          required: [
            'noInventedClaims',
            'scriptCompliant',
            'conversationalTone',
            'simpleVocabulary',
            'accurateSentiment',
          ],
        },
      },
      required: [
        'review',
        'language',
        'sentimentDetected',
        'groundedFacts',
        'styleApplied',
        'keywordsUsed',
        'selfCheck',
      ],
    };

    const runModelCall = async (
      callSystem: string,
      callPrompt: string,
    ): Promise<GeminiGenerationResult> => {
      if (AI_PROVIDER === 'openai') {
        return callOpenAIJson(callSystem, callPrompt);
      }
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        throw new Error('GEMINI_API_KEY is not configured on the server.');
      }
      return generateGeminiContentWithFallback(
        callPrompt,
        {
          systemInstruction: callSystem,
          responseMimeType: 'application/json',
          responseSchema: reviewResponseSchema,
        },
        2,
      );
    };

    if (AI_PROVIDER !== 'openai') {
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return {
          status: 400,
          data: { error: 'GEMINI_API_KEY is not configured on the server.' },
        };
      }
    }

    const genResult = await runModelCall(systemInstruction, prompt);

    interface ParsedReviewJson {
      review?: string;
      short?: string;
      detailed?: string;
      professional?: string;
      language?: string;
      sentimentDetected?: string;
      groundedFacts?: unknown;
      styleApplied?: string;
      keywordsUsed?: unknown;
      selfCheck?: {
        noInventedClaims?: boolean;
        scriptCompliant?: boolean;
        conversationalTone?: boolean;
        simpleVocabulary?: boolean;
        accurateSentiment?: boolean;
      };
    }

    const parseReviewPayload = (rawText: string): {
      reviewText: string;
      keywordsUsed: string[];
      structuredMeta: {
        sentimentDetected: string;
        groundedFacts: string[];
        styleApplied: string;
        selfCheck: {
          noInventedClaims: boolean;
          scriptCompliant: boolean;
          conversationalTone: boolean;
          simpleVocabulary: boolean;
          accurateSentiment: boolean;
        };
      };
    } => {
      let parsedText = '';
      let parsedKeywords: string[] = [];
      let sentimentDetected = 'positive';
      let groundedFacts: string[] = [];
      let styleApplied: string = style;
      let selfCheck = {
        noInventedClaims: true,
        scriptCompliant: true,
        conversationalTone: true,
        simpleVocabulary: true,
        accurateSentiment: true,
      };

      if (rawText) {
        try {
          const parsed = JSON.parse(rawText) as ParsedReviewJson;
          const chosen = parsed[style];
          parsedText =
            (typeof parsed.review === 'string' ? parsed.review.trim() : '') ||
            (typeof chosen === 'string' ? chosen.trim() : '');
          if (Array.isArray(parsed.keywordsUsed)) {
            parsedKeywords = parsed.keywordsUsed
              .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
              .map((k) => k.trim())
              .slice(0, 6);
          }
          if (typeof parsed.sentimentDetected === 'string' && parsed.sentimentDetected.trim()) {
            sentimentDetected = parsed.sentimentDetected.trim().slice(0, 40);
          }
          if (Array.isArray(parsed.groundedFacts)) {
            groundedFacts = parsed.groundedFacts
              .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
              .map((f) => f.trim().slice(0, 120))
              .slice(0, 10);
          }
          if (typeof parsed.styleApplied === 'string' && parsed.styleApplied.trim()) {
            styleApplied = parsed.styleApplied.trim().slice(0, 40);
          }
          if (parsed.selfCheck && typeof parsed.selfCheck === 'object') {
            selfCheck = {
              noInventedClaims: Boolean(parsed.selfCheck.noInventedClaims ?? true),
              scriptCompliant: Boolean(parsed.selfCheck.scriptCompliant ?? true),
              conversationalTone: Boolean(parsed.selfCheck.conversationalTone ?? true),
              simpleVocabulary: Boolean(parsed.selfCheck.simpleVocabulary ?? true),
              accurateSentiment: Boolean(parsed.selfCheck.accurateSentiment ?? true),
            };
          }
        } catch {
          parsedText = rawText.replace(/^["']|["']$/g, '').trim();
        }
      }

      return {
        reviewText: parsedText,
        keywordsUsed: parsedKeywords,
        structuredMeta: {
          sentimentDetected,
          groundedFacts,
          styleApplied,
          selfCheck,
        },
      };
    };

    let { reviewText, keywordsUsed, structuredMeta } = parseReviewPayload(genResult.text);
    let totalInputTokens = genResult.inputTokens;
    let totalOutputTokens = genResult.outputTokens;
    let totalTokens = genResult.totalTokens;
    let finalModelId = genResult.modelId;

    if (!reviewText) {
      return {
        status: 502,
        data: { error: 'Unable to generate a review draft right now. Please try again.' },
      };
    }

    // Phase 3: Server-Side Quality Validation & Targeted Auto-Repair Pass
    let qualityReport: ReviewQualityReport = validateReviewQuality({
      reviewText,
      language,
      businessName,
      category,
      responses,
      additionalComments,
      previousDrafts,
      autoRepaired: false,
    });

    const hasFormattingViolation = qualityReport.issues.some(
      (i) => i.type === 'formatting_violation',
    );
    if (
      !qualityReport.passed ||
      !qualityReport.scriptCompliant ||
      qualityReport.clicheCount > 0 ||
      hasFormattingViolation
    ) {
      const repairIssues = qualityReport.issues
        .map((i) => `- [${i.type}] ${i.message}${i.evidence ? ` (Evidence: "${i.evidence}")` : ''}`)
        .join('\n');

      const repairPrompt = [
        `Original Draft Needed Fixing:\n"${reviewText}"`,
        `Detected Quality Issues:\n${repairIssues}`,
        `Customer Feedback (ONLY allowed facts):\n${formattedResponses || '(None)'}`,
        additionalComments ? `Customer Written Note: "${additionalComments}"` : '',
        `Rewrite the review cleanly in ${languageLabel} fixing EVERY issue above while staying natural and strictly grounded.`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const repairRes = await runModelCall(systemInstruction, repairPrompt);
        totalInputTokens += repairRes.inputTokens;
        totalOutputTokens += repairRes.outputTokens;
        totalTokens += repairRes.totalTokens;
        finalModelId = repairRes.modelId || finalModelId;

        const repairedParsed = parseReviewPayload(repairRes.text);
        if (repairedParsed.reviewText) {
          const repairedReport = validateReviewQuality({
            reviewText: repairedParsed.reviewText,
            language,
            businessName,
            category,
            responses,
            additionalComments,
            previousDrafts,
            autoRepaired: true,
          });
          if (
            repairedReport.score >= qualityReport.score ||
            (repairedReport.scriptCompliant && !qualityReport.scriptCompliant)
          ) {
            reviewText = repairedParsed.reviewText;
            if (repairedParsed.keywordsUsed.length > 0) {
              keywordsUsed = repairedParsed.keywordsUsed;
            }
            structuredMeta = repairedParsed.structuredMeta;
            qualityReport = repairedReport;
          }
        }
      } catch {
        // Non-fatal: fall back to initial draft + qualityReport if repair pass fails
      }
    }

    return {
      status: 200,
      data: {
        review: reviewText,
        language,
        drafts: { [style]: reviewText },
        keywordsUsed,
        structuredMeta,
        qualityReport,
        aiTelemetry: {
          provider: AI_PROVIDER,
          modelId: finalModelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens,
          estimatedCostUsd: calculateEstimatedCostUsd(
            finalModelId,
            totalInputTokens,
            totalOutputTokens,
          ),
          status: 'success',
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = sanitizeApiErrorDetail(message);
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status?: unknown }).status)
        : 500;
    if (
      status === 403 ||
      status === 400 ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('API_KEY_INVALID') ||
      message.toLowerCase().includes('api key not valid')
    ) {
      const isRefererBlock = detail.toLowerCase().includes('referer');
      return {
        status: status === 400 ? 400 : 403,
        data: {
          error: isRefererBlock
            ? 'Your Google API key has HTTP referrer restrictions enabled, which blocks server-side calls from Vercel. In Google Cloud Console, switch this key to None (or API-only restrictions), or use a standard server Gemini API key.'
            : `API key error when generating review: ${detail || 'Please check GEMINI_API_KEY in Settings > Secrets or your server environment.'} Please verify your GEMINI_API_KEY in Settings > Secrets.`,
        },
      };
    }
    if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        data: { error: 'AI generation rate limit reached. Please wait a moment and try again.' },
      };
    }
    console.error('Review generation error:', detail || message);
    return {
      status: 500,
      data: { error: `Failed to generate review draft: ${(detail || message).slice(0, 180)}` },
    };
  }
}

export async function processGenerateReply(
  body: Partial<GenerateReplyBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const reviewerName = typeof body.reviewerName === 'string' ? body.reviewerName.trim() : 'Customer';
    const starRating = Number(body.starRating);
    const reviewComment = typeof body.reviewComment === 'string' ? body.reviewComment.trim() : '';
    const brandVoice = typeof body.brandVoice === 'string' ? body.brandVoice.trim() : '';
    const fiveStarMode =
      body.fiveStarMode === 'approval_required' ? 'approval_required' : 'auto_publish';
    const midStarMode =
      body.midStarMode === 'auto_publish' ? 'auto_publish' : 'approval_required';

    if (!businessName) {
      return { status: 400, data: { error: 'Business name is required.' } };
    }
    if (!Number.isInteger(starRating) || starRating < 1 || starRating > 5) {
      return { status: 400, data: { error: 'Star rating must be an integer between 1 and 5.' } };
    }

    const recommendedStatus =
      starRating <= 2
        ? 'awaiting_approval'
        : starRating === 5
          ? fiveStarMode === 'auto_publish'
            ? 'auto_published'
            : 'awaiting_approval'
          : midStarMode === 'auto_publish'
            ? 'auto_published'
            : 'awaiting_approval';

    const prompt = [
      `Business Name: ${businessName}`,
      category ? `Category: ${category}` : '',
      `Customer Name: ${reviewerName}`,
      `Star Rating: ${starRating} out of 5`,
      `Customer Review: "${reviewComment || '(No written comment, rating only)'}"`,
      brandVoice ? `Brand Voice Guidance: ${brandVoice}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const systemInstruction = [
      'You are writing a thoughtful, authentic Google Business Profile owner response on behalf of the business.',
      'Return valid JSON matching {"reply": "..."}.',
      'Rules:',
      '1. Address the reviewer naturally by name if appropriate.',
      '2. Reference specifics mentioned in their review without making up facts.',
      '3. For 5-star reviews: warm gratitude, invite them back.',
      '4. For 3-4 star reviews: thank them, acknowledge feedback constructively, commit to improvement.',
      '5. For 1-2 star reviews: remain calm, empathetic, non-defensive, apologize for any shortfall, and invite them to contact management directly to make things right.',
      '6. Keep concise (2-4 sentences, 35-75 words), human tone, no emojis or hashtags.',
    ].join('\n');

    let genResult: GeminiGenerationResult;
    if (AI_PROVIDER === 'openai') {
      genResult = await callOpenAIJson(systemInstruction, prompt);
    } else {
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return {
          status: 400,
          data: { error: 'GEMINI_API_KEY is not configured on the server.' },
        };
      }

      genResult = await generateGeminiContentWithFallback(
        prompt,
        {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: { type: Type.STRING },
            },
            required: ['reply'],
          },
        },
        2,
      );
    }

    let replyText = '';
    if (genResult.text) {
      try {
        const parsed = JSON.parse(genResult.text) as { reply?: unknown };
        if (typeof parsed.reply === 'string') {
          replyText = parsed.reply.trim();
        }
      } catch {
        replyText = genResult.text.replace(/^["']|["']$/g, '').trim();
      }
    }

    if (!replyText) {
      return {
        status: 502,
        data: { error: 'AI provider did not return a reply.' },
      };
    }

    return {
      status: 200,
      data: {
        replyText,
        recommendedStatus,
        aiTelemetry: {
          provider: AI_PROVIDER,
          modelId: genResult.modelId,
          inputTokens: genResult.inputTokens,
          outputTokens: genResult.outputTokens,
          totalTokens: genResult.totalTokens,
          estimatedCostUsd: calculateEstimatedCostUsd(
            genResult.modelId,
            genResult.inputTokens,
            genResult.outputTokens,
          ),
          status: 'success',
        },
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = sanitizeApiErrorDetail(message);
    console.error('GBP reply generation error:', detail || message);
    return {
      status: 500,
      data: { error: `Failed to generate AI reply: ${(detail || message).slice(0, 180)}` },
    };
  }
}

export async function processValidateQrStandSlot(
  body: Partial<ValidateQrStandSlotBody>,
  callerBearerToken?: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const businessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
  const slotNumber = Number(body.slotNumber);

  if (!businessId || !/^[a-zA-Z0-9_-]{1,128}$/.test(businessId)) {
    return { status: 400, data: { error: 'Valid businessId is required.' } };
  }
  if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 100) {
    return { status: 400, data: { error: 'slotNumber must be an integer between 1 and 100.' } };
  }

  let effectiveLimit = 4;
  if (FIREBASE_PROJECT_ID && callerBearerToken) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIREBASE_DATABASE_ID)}/documents/businesses/${encodeURIComponent(businessId)}`;
      const res = await fetchWithTimeout(
        url,
        { headers: { Authorization: `Bearer ${callerBearerToken}` } },
        6000,
      );
      if (res.status === 403 || res.status === 401) {
        return {
          status: 403,
          data: { error: 'Not authorized to manage QR stands for this business.' },
        };
      }
      if (res.status === 404) {
        return {
          status: 404,
          data: { error: 'Business record not found.' },
        };
      }
      if (res.ok) {
        const docJson = (await res.json()) as {
          fields?: { qrStandLimit?: { integerValue?: string } };
        };
        const rawLimit = Number(docJson.fields?.qrStandLimit?.integerValue || '4');
        if (Number.isInteger(rawLimit) && rawLimit >= 1) {
          effectiveLimit = rawLimit;
        }
      }
    } catch {
      // Fallback to default limit if Firestore REST lookup is unreachable; Firestore Rules also enforce qrStandLimit atomically
    }
  }

  if (slotNumber > effectiveLimit) {
    return {
      status: 403,
      data: {
        error: `QR stand limit reached (${effectiveLimit} stands max). Submit an Additional QR Stand Request for admin approval.`,
        limit: effectiveLimit,
        allowed: false,
      },
    };
  }

  return {
    status: 200,
    data: {
      allowed: true,
      slotNumber,
      limit: effectiveLimit,
      standId: `${businessId}_slot_${slotNumber}`,
    },
  };
}

export async function processGbpProxy(
  body: Partial<GbpProxyBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const action = body.action;
  const gbpAccessToken = typeof body.gbpAccessToken === 'string' ? body.gbpAccessToken.trim() : '';

  if (!gbpAccessToken) {
    return {
      status: 400,
      data: { error: 'Google Business Profile OAuth access token is required.' },
    };
  }

  try {
    if (action === 'list_locations') {
      const accountsRes = await fetchWithTimeout(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        { headers: { Authorization: `Bearer ${gbpAccessToken}` } },
        10000,
      );
      const accountsBody = await accountsRes.text();
      if (!accountsRes.ok) {
        return {
          status: accountsRes.status,
          data: {
            error: `Google Business Profile API (${accountsRes.status}): ${sanitizeApiErrorDetail(accountsBody)}`,
          },
        };
      }
      const accountsJson = JSON.parse(accountsBody) as {
        accounts?: Array<{ name?: string; accountName?: string }>;
      };
      const accounts = accountsJson.accounts || [];
      const locations: Array<{
        accountName: string;
        locationName: string;
        title: string;
        placeId: string;
      }> = [];

      for (const acc of accounts.slice(0, 5)) {
        if (!acc.name) continue;
        const locUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,metadata`;
        const locRes = await fetchWithTimeout(
          locUrl,
          { headers: { Authorization: `Bearer ${gbpAccessToken}` } },
          10000,
        );
        if (!locRes.ok) continue;
        const locJson = (await locRes.json()) as {
          locations?: Array<{
            name?: string;
            title?: string;
            metadata?: { placeId?: string };
          }>;
        };
        for (const loc of locJson.locations || []) {
          if (!loc.name) continue;
          locations.push({
            accountName: acc.name,
            locationName: loc.name.startsWith('accounts/') ? loc.name : `${acc.name}/${loc.name}`,
            title: loc.title || loc.name,
            placeId: loc.metadata?.placeId || '',
          });
        }
      }

      return { status: 200, data: { accounts, locations } };
    }

    if (action === 'fetch_reviews') {
      const locationName = typeof body.locationName === 'string' ? body.locationName.trim() : '';
      if (!locationName || !/^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+$/.test(locationName)) {
        return { status: 400, data: { error: 'Valid Google Business Profile locationName is required.' } };
      }
      const revRes = await fetchWithTimeout(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=25`,
        { headers: { Authorization: `Bearer ${gbpAccessToken}` } },
        10000,
      );
      const revText = await revRes.text();
      if (!revRes.ok) {
        return {
          status: revRes.status,
          data: {
            error: `Google Reviews API (${revRes.status}): ${sanitizeApiErrorDetail(revText)}`,
          },
        };
      }
      const revJson = JSON.parse(revText) as {
        reviews?: Array<{
          reviewId?: string;
          reviewer?: { displayName?: string };
          starRating?: string;
          comment?: string;
          createTime?: string;
        }>;
      };
      const starMap: Record<string, number> = {
        ONE: 1,
        TWO: 2,
        THREE: 3,
        FOUR: 4,
        FIVE: 5,
      };
      const reviews = (revJson.reviews || []).map((r) => ({
        externalReviewId: r.reviewId || `gbp-${Date.now()}`,
        reviewerName: r.reviewer?.displayName || 'Google Reviewer',
        starRating: starMap[r.starRating || 'FIVE'] || 5,
        comment: r.comment || '',
        reviewDate: r.createTime || new Date().toISOString(),
      }));
      return { status: 200, data: { reviews } };
    }

    if (action === 'publish_reply') {
      const locationName = typeof body.locationName === 'string' ? body.locationName.trim() : '';
      const externalReviewId =
        typeof body.externalReviewId === 'string' ? body.externalReviewId.trim() : '';
      const replyText = typeof body.replyText === 'string' ? body.replyText.trim() : '';
      if (
        !locationName ||
        !/^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+$/.test(locationName) ||
        !externalReviewId ||
        !/^[a-zA-Z0-9_-]+$/.test(externalReviewId) ||
        !replyText
      ) {
        return {
          status: 400,
          data: { error: 'Valid locationName, externalReviewId, and replyText are required.' },
        };
      }
      const pubRes = await fetchWithTimeout(
        `https://mybusiness.googleapis.com/v4/${locationName}/reviews/${externalReviewId}/reply`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gbpAccessToken}`,
          },
          body: JSON.stringify({ comment: replyText }),
        },
        10000,
      );
      const pubText = await pubRes.text();
      if (!pubRes.ok) {
        return {
          status: pubRes.status,
          data: {
            error: `Google Reply API (${pubRes.status}): ${sanitizeApiErrorDetail(pubText)}`,
          },
        };
      }
      return { status: 200, data: { published: true } };
    }

    return { status: 400, data: { error: 'Unsupported GBP action.' } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: sanitizeApiErrorDetail(msg) } };
  }
}

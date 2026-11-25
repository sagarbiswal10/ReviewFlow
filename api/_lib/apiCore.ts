import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { composeGroundedFallbackReview } from './fallbackReviewComposer.js';
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

export interface ReferenceReviewPatternInput {
  language?: ReviewLanguage;
  sentiment?: string;
  text: string;
}

export interface GenerateReviewBody {
  businessId?: string;
  visitorId?: string;
  packageTier?: 'standard' | 'standard_plus';
  businessName: string;
  ownerName?: string;
  category: string;
  locality?: string;
  city?: string;
  servicesOffered?: string[];
  productsOffered?: string[];
  businessHighlights?: string;
  seoKeywords?: string[];
  referenceReviews?: ReferenceReviewPatternInput[];
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
  locality?: string;
  city?: string;
  servicesOffered?: string[];
  productsOffered?: string[];
  businessHighlights?: string;
  packageTier?: 'standard' | 'standard_plus';
  language?: ReviewLanguage;
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
    : 'gemini-3.1-flash-lite';
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
    email_verified?: boolean;
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
  if (payload.email_verified !== true) {
    throw new Error('Please verify your email address before using protected API endpoints.');
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
  const cleanOrigin = origin.trim().replace(/\/+$/, '').toLowerCase();
  if (!cleanOrigin) return true;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  const candidateHosts = hostHeader
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const isSameHost = candidateHosts.some(
    (h) => cleanOrigin === `https://${h}` || cleanOrigin === `http://${h}`,
  );
  if (isSameHost) return true;
  if (allowedOrigins.length > 0 && allowedOrigins.includes(cleanOrigin)) return true;
  return false;
}

export class PayloadTooLargeError extends Error {
  constructor(message = 'Request payload exceeds maximum allowed size.') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

export async function readSafeJsonBody(
  req: { body?: unknown } & AsyncIterable<unknown>,
  maxBytes = 1_048_576,
): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized, 'utf-8') > maxBytes) {
      throw new PayloadTooLargeError();
    }
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf-8') > maxBytes) {
      throw new PayloadTooLargeError();
    }
    return req.body.trim() ? (JSON.parse(req.body) as Record<string, unknown>) : {};
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export function sanitizeLogError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return sanitizeApiErrorDetail(msg) || 'Unexpected error';
}

export const VISITOR_QUOTA_MAX_GENERATIONS = 5;
export const VISITOR_QUOTA_WINDOW_MS = 5 * 60 * 1000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimitSlot(
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now(),
): { allowed: boolean; count: number; remaining: number; resetAt: number } {
  const existing = rateBuckets.get(key);
  let bucket =
    existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  if (bucket.count >= maxRequests) {
    rateBuckets.set(key, bucket);
    return {
      allowed: false,
      count: maxRequests,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket = { count: bucket.count + 1, resetAt: bucket.resetAt };
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 5000) {
    for (const [k, b] of rateBuckets.entries()) {
      if (b.resetAt <= now) {
        rateBuckets.delete(k);
      }
    }
  }

  return {
    allowed: true,
    count: bucket.count,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  return consumeRateLimitSlot(key, maxRequests, windowMs).allowed;
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
  // Always fall back to standard Gemini Developer API (false) if Vertex AI (true) rejects due to billing or auth
  if (explicit === 'true') return [true, false];
  if (apiKey.startsWith('AQ.')) return [false, true];
  if (explicit === 'false') return [false];
  return [false];
}

function isBillingRequiredError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('requires billing') ||
    lower.includes('billing_disabled') ||
    lower.includes('enable billing') ||
    lower.includes('billing to be enabled')
  );
}

function formatGeminiEndpointError(
  err: unknown,
  actionLabel: string,
): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const detail = sanitizeApiErrorDetail(rawMessage);
  const rawStatus =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status?: unknown }).status)
      : 500;

  if (isBillingRequiredError(rawMessage)) {
    return {
      status: 403,
      message: `Billing required for ${actionLabel}: ${detail}. Enable billing on that Google Cloud project, OR switch GEMINI_API_KEY to a free-tier Google AI Studio API key (with GOOGLE_GENAI_USE_VERTEXAI=false) in Settings > Secrets or your deployment environment variables.`,
    };
  }

  if (
    rawStatus === 403 ||
    rawStatus === 400 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.toLowerCase().includes('api key not valid')
  ) {
    const isRefererBlock = detail.toLowerCase().includes('referer');
    return {
      status: rawStatus === 400 ? 400 : 403,
      message: isRefererBlock
        ? 'Your Google API key has HTTP referrer restrictions enabled, which blocks server-side calls. In Google Cloud Console, switch this key to None (or API-only restrictions), or use a standard server Gemini API key.'
        : `API key error when ${actionLabel}: ${detail || 'Please check GEMINI_API_KEY in Settings > Secrets or your server environment.'} Please verify your GEMINI_API_KEY in Settings > Secrets.`,
    };
  }

  if (rawStatus === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI generation rate limit reached. Please wait a moment and try again.',
    };
  }

  return {
    status: 500,
    message: `Failed when ${actionLabel}: ${(detail || rawMessage).slice(0, 180)}`,
  };
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
    new Set(
      [GEMINI_MODEL, GEMINI_FALLBACK_MODEL, 'gemini-3.1-flash-lite'].filter(
        Boolean,
      ),
    ),
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
          const supportsLowThinking =
            modelName === 'gemini-4-hydrogen' || modelName === 'gemini-4-neon';
          const modelConfig = supportsMinimalThinking
            ? { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } }
            : supportsLowThinking
              ? { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : config;
          let response;
          try {
            response = await ai.models.generateContent({
              model: modelName,
              contents,
              config: modelConfig,
            });
          } catch (innerErr) {
            const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr);
            const usedThinkingConfig = supportsMinimalThinking || supportsLowThinking;
            if (
              usedThinkingConfig &&
              (innerMsg.includes('400') || innerMsg.includes('INVALID_ARGUMENT'))
            ) {
              response = await ai.models.generateContent({
                model: modelName,
                contents,
                config,
              });
            } else {
              throw innerErr;
            }
          }
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
          if (isApiKeyInvalid) {
            if (hasNextMode) break;
            throw err;
          }

          // Try next fallback model if current model is missing, billing-gated, permission-denied, or rejects config
          const isModelLevelError =
            msg.includes('404') ||
            msg.includes('NOT_FOUND') ||
            msg.includes('403') ||
            msg.includes('PERMISSION_DENIED') ||
            msg.includes('400') ||
            msg.includes('INVALID_ARGUMENT') ||
            isBillingRequiredError(msg);
          if (isModelLevelError) {
            break;
          }

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
          lastMsg.toLowerCase().includes('api key not valid') ||
          (useVertexAi && isBillingRequiredError(lastMsg)))
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

const SEO_HYPE_STRIP_REGEX =
  /\b(best|top-rated|top rated|number one|#1|no\.?\s*1|most popular|world class|finest|unmatched)\b/gi;

function cleanSeoPhrase(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(SEO_HYPE_STRIP_REGEX, '')
    .replace(/[#*@]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\-–—\s]+|[,.\-–—\s]+$/g, '')
    .trim()
    .slice(0, 55);
  return cleaned.length >= 3 ? cleaned : '';
}

function sanitizeSeoPhraseArray(items: unknown, max = 10): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = cleanSeoPhrase(item);
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
      if (out.length >= max) break;
    }
  }
  return out;
}

export async function processGenerateSeoKeywords(
  body: Partial<GenerateSeoKeywordsBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const locality = typeof body.locality === 'string' ? body.locality.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const servicesOffered = Array.isArray(body.servicesOffered)
      ? body.servicesOffered.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 10)
      : [];
    const productsOffered = Array.isArray(body.productsOffered)
      ? body.productsOffered.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 10)
      : [];
    const businessHighlights =
      typeof body.businessHighlights === 'string' ? body.businessHighlights.trim().slice(0, 300) : '';
    const packageTier = body.packageTier === 'standard' ? 'standard' : 'standard_plus';

    if (!businessName) {
      return {
        status: 400,
        data: { error: 'Business name is required to generate SEO keywords.' },
      };
    }

    const baseTerms = getCategoryKeywords(category);
    const locLine = [locality, city, address].filter(Boolean).join(', ');
    const isStandardPlus = packageTier === 'standard_plus';
    const prompt = [
      `Business Name: ${businessName}`,
      category ? `Category: ${category}` : '',
      locLine ? `Location / Locality: ${locLine}` : '',
      servicesOffered.length > 0 ? `Services: ${servicesOffered.join(', ')}` : '',
      productsOffered.length > 0 ? `Products: ${productsOffered.join(', ')}` : '',
      businessHighlights ? `Business Details: ${businessHighlights}` : '',
      `Baseline Category Terms: ${baseTerms.join(', ')}`,
      isStandardPlus
        ? 'Plan Tier: STANDARD PLUS — generate natural local search keywords in English (en), Hindi Devanagari (hi), Marathi Devanagari (mr), and Roman-script Hinglish (hinglish).'
        : 'Plan Tier: STANDARD — generate natural local search keywords in English (en) ONLY.',
    ]
      .filter(Boolean)
      .join('\n');

    const systemInstruction = [
      'You are a Google Business Profile & Local Search SEO strategist.',
      isStandardPlus
        ? 'Return valid JSON matching {"en": string[], "hi": string[], "mr": string[], "hinglish": string[]} with 6-8 clean local search phrases per language.'
        : 'Return valid JSON matching {"en": string[]} with 8-10 clean English local search phrases.',
      'Strict SEO Rules:',
      '1. Derive terms ONLY from business name, category, actual locality/city, and real services or products.',
      '2. NEVER include unrelated categories or unsupported superlative claims ("best", "top-rated", "number one", "#1", "most popular").',
      '3. Combine service + locality/city accurately where location info is provided.',
      '4. Keep each keyword concise (1 to 4 words, max 50 chars), natural search style, zero hashtags.',
      '5. In hi/mr use natural Devanagari search terms; in hinglish use natural Roman Hindi terms.',
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
          responseSchema: isStandardPlus
            ? {
                type: Type.OBJECT,
                properties: {
                  en: { type: Type.ARRAY, items: { type: Type.STRING } },
                  hi: { type: Type.ARRAY, items: { type: Type.STRING } },
                  mr: { type: Type.ARRAY, items: { type: Type.STRING } },
                  hinglish: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['en', 'hi', 'mr', 'hinglish'],
              }
            : {
                type: Type.OBJECT,
                properties: {
                  en: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['en'],
              },
          temperature: 0.5,
          maxOutputTokens: 450,
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

    const keywordsByLanguage: Partial<Record<ReviewLanguage, string[]>> = {};
    try {
      const parsed = JSON.parse(genResult.text) as {
        keywords?: unknown;
        en?: unknown;
        hi?: unknown;
        mr?: unknown;
        hinglish?: unknown;
      };
      const enList = sanitizeSeoPhraseArray(parsed.en ?? parsed.keywords, 12);
      keywordsByLanguage.en = enList.length > 0 ? enList : sanitizeSeoPhraseArray(baseTerms, 10);
      if (isStandardPlus) {
        keywordsByLanguage.hi = sanitizeSeoPhraseArray(parsed.hi, 10);
        keywordsByLanguage.mr = sanitizeSeoPhraseArray(parsed.mr, 10);
        keywordsByLanguage.hinglish = sanitizeSeoPhraseArray(parsed.hinglish, 10);
      }
    } catch {
      keywordsByLanguage.en = sanitizeSeoPhraseArray(baseTerms, 10);
    }

    const primaryKeywords = keywordsByLanguage.en || sanitizeSeoPhraseArray(baseTerms, 10);

    return {
      status: 200,
      data: {
        keywords: primaryKeywords.slice(0, 12),
        keywordsByLanguage,
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
    const formatted = formatGeminiEndpointError(err, 'generating SEO keywords');
    if (formatted.status >= 500) {
      console.error('SEO keyword generation error:', formatted.message);
    }
    return {
      status: formatted.status,
      data: { error: formatted.message },
    };
  }
}

export async function processGenerateReview(
  body: Partial<GenerateReviewBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim().slice(0, 120) : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const locality = typeof body.locality === 'string' ? body.locality.trim().slice(0, 120) : '';
    const city = typeof body.city === 'string' ? body.city.trim().slice(0, 120) : '';
    const locationSummary = [locality, city].filter(Boolean).join(', ');
    const servicesOffered = Array.isArray(body.servicesOffered)
      ? body.servicesOffered
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim().slice(0, 60))
          .slice(0, 12)
      : [];
    const productsOffered = Array.isArray(body.productsOffered)
      ? body.productsOffered
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim().slice(0, 60))
          .slice(0, 12)
      : [];
    const businessHighlights =
      typeof body.businessHighlights === 'string' ? body.businessHighlights.trim().slice(0, 400) : '';
    const packageTier = body.packageTier === 'standard' ? 'standard' : 'standard_plus';
    const additionalComments =
      typeof body.additionalComments === 'string' ? body.additionalComments.trim() : '';
    const style: ReviewStyle =
      body.style === 'short' || body.style === 'detailed' || body.style === 'professional'
        ? body.style
        : 'short';
    const requestedLanguage: ReviewLanguage =
      body.language === 'hi' || body.language === 'mr' || body.language === 'hinglish'
        ? body.language
        : 'en';
    const language: ReviewLanguage = packageTier === 'standard' ? 'en' : requestedLanguage;
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
    const seoKeywords = Array.isArray(body.seoKeywords)
      ? body.seoKeywords
          .filter((kw): kw is string => typeof kw === 'string' && kw.trim().length > 0)
          .map((kw) => kw.trim().slice(0, 60))
          .slice(0, 15)
      : [];
    const rawReferenceReviews = Array.isArray(body.referenceReviews)
      ? body.referenceReviews
          .filter((r): r is ReferenceReviewPatternInput => Boolean(r) && typeof r.text === 'string' && r.text.trim().length > 0)
          .slice(0, 40)
      : [];
    const referenceTexts = rawReferenceReviews.map((r) => r.text.trim().slice(0, 500));
    const langMatchedRefs = rawReferenceReviews.filter((r) => !r.language || r.language === language);
    const referenceStylePatterns = (langMatchedRefs.length > 0 ? langMatchedRefs : rawReferenceReviews)
      .slice(0, 4)
      .map((r) => r.text.trim().slice(0, 240));

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

    const businessId = typeof body.businessId === 'string' ? body.businessId.trim().slice(0, 128) : '';
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim().slice(0, 128) : '';

    if (!formattedResponses && !additionalComments) {
      return {
        status: 400,
        data: {
          error:
            'Please answer at least one question or add a comment before generating a review draft.',
        },
      };
    }

    let visitorQuota: { remaining: number; resetAt: number } | null = null;
    if (businessId && visitorId) {
      const slot = consumeRateLimitSlot(
        `visitor:${businessId}:${visitorId}`,
        VISITOR_QUOTA_MAX_GENERATIONS,
        VISITOR_QUOTA_WINDOW_MS,
      );
      if (!slot.allowed) {
        const secsLeft = Math.max(1, Math.ceil((slot.resetAt - Date.now()) / 1000));
        const minsLeft = Math.floor(secsLeft / 60);
        const remSecs = secsLeft % 60;
        const countdownLabel =
          minsLeft > 0 ? `${minsLeft}m ${String(remSecs).padStart(2, '0')}s` : `${remSecs}s`;
        return {
          status: 429,
          data: {
            error: `You have reached the limit of ${VISITOR_QUOTA_MAX_GENERATIONS} review generations. Your limit will refresh in ${countdownLabel}. You can still edit, copy, and post your current review.`,
            quotaRemaining: 0,
            quotaResetAt: slot.resetAt,
          },
        };
      }
      visitorQuota = { remaining: slot.remaining, resetAt: slot.resetAt };
    }

    const styleGuidance: Record<ReviewStyle, string> =
      language === 'hinglish'
        ? {
            short: 'Normally generate 2 concise sentences in natural Roman Hindi (do not force extra length or repeat details).',
            detailed: 'Write 2-4 natural Roman Hindi sentences using only information present in the customer\'s answers.',
            professional: 'Keep the tone polite, clear, and conversational in 2-4 everyday Roman Hindi sentences.',
          }
        : {
            short: 'Keep it concise and natural (around 2-3 everyday sentences).',
            detailed: 'Write a relaxed 3-5 sentence review covering only the points the customer actually shared.',
            professional: 'Keep the tone polite, clear, and conversational (2-4 sentences).',
          };

    const variationAngles = [
      'Start directly with the most memorable or noticeable point first, then wrap up naturally.',
      'Open with a brief everyday summary of the overall visit, then combine the specific details smoothly.',
      'Start directly with the positive feedback, then add any neutral or slow points naturally.',
      'Lead honestly with the main concern or mixed point if present, balanced with what worked well.',
      'Combine related answers together into flowing sentences rather than splitting each field into its own sentence.',
      'End naturally on the last detail without adding a forced closing line or recommendation.',
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
        'Do NOT mix full English sentences or write Hindi in Roman script here (Roman Hindi has its own separate option).',
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
        'REVIEWFLOW – NATURAL ROMAN HINDI REVIEW GENERATION PROMPT',
        '1. ROLE & MOST IMPORTANT RULE: You are a natural Hindi-language review writer for ReviewFlow. Convert customer questionnaire answers into a natural, simple, conversational Hindi review written using English letters (Roman Hindi). DO NOT USE ENGLISH VOCABULARY in the generated review — use Hindi words written in English letters ONLY.',
        '2. STRICT LANGUAGE RULES:',
        '   - Write ONLY in everyday Hindi using English letters (Roman script). ZERO Devanagari script.',
        '   - DO NOT use English vocabulary, even if commonly used in India (e.g. do NOT write "food", "staff", "service", "ambience", "experience", "overall", "good", "average", "price", "room", "stay", "check-in", "helpful", "clean", "nice").',
        '   - Business names, personal names, and unavoidable official names may remain unchanged.',
        '   - Never use formal, literary, or dictionary-style Hindi; avoid word-for-word translation; never copy English words just because the questionnaire contains them.',
        '3. ENGLISH-TO-HINDI VOCABULARY PREFERENCES (choose what sounds natural, not forced):',
        '   - Honestly -> Sach kahun toh | Overall -> Kul milakar | Experience -> Anubhav / Tajurba',
        '   - Staff -> Wahan ke log / Karmchari | Service -> Sewa / Madad | Behaviour -> Bartaav',
        '   - Food -> Khana | Quality -> Gunvatta / Khane ka swaad | Ambience -> Wahan ka mahaul | Location -> Jagah',
        '   - Price -> Daam | Value for money -> Daam ke hisaab se accha | Cleanliness -> Safai | Hygiene -> Saaf-safai',
        '   - Booking -> Pehle se jagah pakki karna | Check-in -> Andar aane ki prakriya | Check-out -> Bahar jaane ki prakriya',
        '   - Room -> Kamra | Stay -> Wahan rehna | Facilities -> Suvidhayein | Support -> Madad | Helpful -> Madad karne wale',
        '   - Comfortable -> Aaramdayak | Convenient -> Aasaan | Satisfied -> Khush | Disappointed -> Niraash',
        '   - Amazing -> Bahut badhiya | Excellent -> Bahut accha | Average -> Theek-thaak | Poor -> Kharab | Recommended -> Jaane layak | Definitely -> Pakka | Worth it -> Paise vasool',
        '4. SENTIMENT-BASED EXPRESSIONS (examples ONLY — never force or repeat, never exaggerate):',
        '   - very_positive: "Ekdum badhiya tha.", "Bahut maza aaya.", "Dil khush ho gaya.", "Sach mein bahut accha laga.", "Poora paisa vasool tha."',
        '   - positive: "Kaafi accha laga.", "Sab kuch badhiya tha.", "Kaafi khush hue.", "Dobara zaroor aayenge."',
        '   - neutral: "Theek-thaak tha.", "Bas chal gaya.", "Kuch khaas nahi tha.", "Jaisa socha tha waisa hi tha."',
        '   - mixed: "Kuch cheezein acchi thi lekin kuch aur behtar ho sakti thi.", "Shuruaat acchi thi lekin baad mein utna maza nahi aaya.", "Kul milakar anubhav mila-jula raha."',
        '   - negative: "Utna accha nahi laga.", "Sach kahun toh kuch khaas nahi tha.", "Kaafi bura laga.", "Isse behtar ummeed thi.", "Dobara aane ka mann nahi karega."',
        '   - very_negative: "Bahut hi kharab anubhav raha.", "Bilkul accha nahi laga.", "Kaafi niraash hue.", "Jaisa socha tha usse bilkul alag nikla."',
        '5. UNIVERSAL BUSINESS UNDERSTANDING & NO QUESTIONNAIRE LABEL COPYING:',
        '   - Understand any business category dynamically without copying English field labels. Example:',
        '     BAD: "Check-in easily ho gaya tha aur concierge ne help ki. Overall stay kuch khaas nahi raha."',
        '     GOOD: "Andar aane ka kaam aasani se ho gaya tha aur madad bhi mil gayi. Lekin baaki logon ka bartaav accha nahi laga. Sach kahun toh poora anubhav kuch khaas nahi raha."',
        '6. FACTUAL ACCURACY & NO GENERALIZING:',
        '   - Never generalize one person\'s helpful or poor behaviour to the entire team. Preserve positive and negative points accurately without inventing anything.',
        '7. SENTENCE FLOW, PUNCTUATION & FINAL ENGLISH VOCABULARY CHECK:',
        '   - Keep punctuation minimal (prefer "Sach kahun toh poora anubhav kuch khaas nahi raha." over unnecessary commas); avoid repeated exclamation marks and unrequested emojis. Use 2-4 concise sentences.',
        '   - Before returning JSON, check EVERY word of the review: if any English word slipped in, rewrite that sentence in natural Roman Hindi and confirm validation.english_vocabulary_found = false.',
      ].join('\n'),
    };

    const languageLabel =
      language === 'hi'
        ? 'Hindi (हिंदी)'
        : language === 'mr'
          ? 'Marathi (मराठी)'
          : language === 'hinglish'
            ? 'Hinglish (Natural Roman Hindi)'
            : 'English';

    const calibrationBlock =
      fewShotExamples.length > 0
        ? [
            'Curated Style Exemplars (learn natural tone & brevity ONLY; NEVER copy facts or complete sentences):',
            ...fewShotExamples.map(
              (ex, idx) =>
                `Example ${idx + 1} Feedback: ${ex.responsesSummary}\nExample ${idx + 1} Natural Review: "${ex.finalReview}"`,
            ),
          ].join('\n')
        : '';

    const referenceStyleBlock =
      referenceStylePatterns.length > 0
        ? [
            `Isolated Writing Library for ${businessName} (study sentence rhythm, everyday vocabulary, and conversational expressions in ${languageLabel} ONLY — NEVER copy complete sentences or phrases):`,
            ...referenceStylePatterns.map((txt, idx) => `- Style Ref ${idx + 1}: "${txt}"`),
          ].join('\n')
        : '';

    const previousDraftsBlock =
      previousDrafts.length > 0
        ? [
            'Previous Drafts Already Shown (write fresh sentence structure so it does NOT repeat these word-for-word):',
            ...previousDrafts.map((d, idx) => `- Draft ${idx + 1}: "${d}"`),
          ].join('\n')
        : '';

    const seoKeywordsBlock =
      seoKeywords.length > 0
        ? language === 'hinglish'
          ? `Business Local SEO Context (express naturally in Roman Hindi meaning ONLY if directly relevant to what the customer experienced — NEVER force English buzzwords or superlatives): ${seoKeywords.join(', ')}`
          : `Target Local SEO Keywords for ${businessName}: ${seoKeywords.join(', ')} (naturally weave 1-2 relevant phrases ONLY when compatible with the customer's actual feedback — NEVER force keywords, NEVER repeat business name/keyword in every sentence, and NEVER add unsupported superlatives like "best", "top-rated", "number one", or "most popular").`
        : '';

    const identityLines = [
      `Business Name: ${businessName}${category ? ` (${category})` : ''}`,
      locationSummary ? `Location / Locality: ${locationSummary}` : '',
      ownerName
        ? `Shop Owner Name (OPTIONAL context): ${ownerName} — ONLY mention ${ownerName} if the customer's answers or written note explicitly say ${ownerName} personally helped or assisted them. NEVER invent an owner interaction or mention ${ownerName} automatically.`
        : '',
      servicesOffered.length > 0 ? `Services Offered: ${servicesOffered.join(', ')}` : '',
      productsOffered.length > 0 ? `Products Offered: ${productsOffered.join(', ')}` : '',
      businessHighlights ? `Business Notes: ${businessHighlights}` : '',
    ].filter(Boolean);

    const prompt = [
      `Business Identity Context:\n${identityLines.join('\n')}`,
      seoKeywordsBlock,
      `Requested Language: ${languageLabel}`,
      `Length/Flow Preference: ${styleGuidance[style]}`,
      `Draft Variation #${variationSeed}: ${selectedAngle}`,
      'Customer Feedback (use ONLY this information):',
      formattedResponses || '(No multiple-choice selections)',
      additionalComments ? `Customer Written Note: "${additionalComments}"` : '',
      referenceStyleBlock,
      calibrationBlock,
      previousDraftsBlock,
    ]
      .filter(Boolean)
      .join('\n\n');

    const systemInstruction = [
      'You are ReviewFlow\'s authentic customer review-writing assistant.',
      'Return ONLY valid JSON: {"review": string, "alternates": [string, string], "sentiment": "very_positive" | "positive" | "neutral" | "mixed" | "negative" | "very_negative", "keywordsUsed": string[]}.',
      languageRules[language],
      'Strict Authenticity, Originality & Grounding Rules:',
      '1. Use ONLY information supplied in the customer\'s questionnaire answers, custom fields, and written comment (plus naturally phrasing 1-2 fitting business SEO keywords if compatible). NEVER invent specific services purchased, food items ordered, staff/owner interactions, conversations, pricing/discounts, facilities, or unmentioned incidents.',
      '2. Owner Name Rule: NEVER assume the customer interacted with the shop owner unless the customer explicitly mentioned the owner in their answers or comment.',
      '3. Zero-Copying Rule: Learn natural tone, rhythm, and everyday phrasing from the isolated writing library, NEVER copy complete sentences or phrases from reference reviews or previous drafts.',
      '4. No SEO Hype / Superlatives: NEVER add unsupported claims such as "best", "top-rated", "number one", "#1", or "most popular" unless the customer themselves wrote it.',
      '5. Preserve exact customer meaning and sentiment accurately — NEVER upgrade "average" to "excellent" or hide genuine criticism.',
      '6. Never generalize one person\'s behaviour to everyone. Keep punctuation minimal and readable; 2-4 natural sentences.',
      '7. NEVER use generic AI clichés ("amazing experience", "delightful experience", "exceptional hospitality", "perfect blend", "epitome of excellence", "exceeded expectations", "hidden gem", "top-notch", "must-visit", "highly recommended", "everything was perfect", "one of the best places ever"). No quotes, no bullet points, no headings, no hashtags, no unrequested emojis.',
      '8. In alternates, write 2 distinctly phrased original variations using the EXACT same language, script, and grounded facts. In keywordsUsed, list 0-3 short natural keywords used cleanly.',
    ].join('\n');

    const reviewResponseSchema = {
      type: Type.OBJECT,
      properties: {
        review: { type: Type.STRING },
        alternates: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        sentiment: {
          type: Type.STRING,
          enum: ['very_positive', 'positive', 'neutral', 'mixed', 'negative', 'very_negative'],
        },
        keywordsUsed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['review', 'alternates', 'sentiment', 'keywordsUsed'],
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
          temperature: 0.75,
          maxOutputTokens: 420,
        },
        1,
      );
    };

    const buildGroundedFallbackResponse = (
      fallbackReason: string,
    ): { status: number; data: Record<string, unknown> } => {
      const composed = composeGroundedFallbackReview({
        businessName,
        category,
        responses,
        additionalComments,
        style,
        language,
        variationSeed,
      });
      const fallbackAlts = [variationSeed + 1, variationSeed + 2]
        .map(
          (altSeed) =>
            composeGroundedFallbackReview({
              businessName,
              category,
              responses,
              additionalComments,
              style,
              language,
              variationSeed: altSeed,
            }).reviewText,
        )
        .filter((txt, idx, arr) => txt && txt !== composed.reviewText && arr.indexOf(txt) === idx);
      const fallbackQuality = validateReviewQuality({
        reviewText: composed.reviewText,
        language,
        businessName,
        category,
        responses,
        additionalComments,
        previousDrafts,
        autoRepaired: false,
      });
      console.warn('Review generation falling back to grounded composer:', sanitizeLogError(fallbackReason));
      return {
        status: 200,
        data: {
          review: composed.reviewText,
          alternates: fallbackAlts,
          language,
          script: composed.script,
          sentiment: composed.sentiment,
          validation: {
            english_vocabulary_found: false,
            facts_preserved: true,
            sentiment_preserved: true,
            unsupported_claims: false,
          },
          drafts: { [style]: composed.reviewText },
          keywordsUsed: composed.keywordsUsed,
          structuredMeta: {
            sentimentDetected: composed.sentiment,
            groundedFacts: composed.groundedFacts,
            styleApplied: style,
            selfCheck: {
              noInventedClaims: true,
              scriptCompliant: fallbackQuality.scriptCompliant,
              conversationalTone: true,
              simpleVocabulary: true,
              accurateSentiment: true,
            },
          },
          qualityReport: fallbackQuality,
          ...(visitorQuota
            ? {
                quotaRemaining: visitorQuota.remaining,
                quotaResetAt: visitorQuota.resetAt,
              }
            : {}),
          aiTelemetry: {
            provider: 'grounded-fallback',
            modelId: 'grounded-composer-v1',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            status: 'success',
          },
        },
      };
    };

    if (AI_PROVIDER !== 'openai') {
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return buildGroundedFallbackResponse('GEMINI_API_KEY is not configured on the server.');
      }
    }

    let genResult: GeminiGenerationResult;
    try {
      genResult = await runModelCall(systemInstruction, prompt);
    } catch (upstreamErr) {
      const formatted = formatGeminiEndpointError(upstreamErr, 'generating review');
      return buildGroundedFallbackResponse(formatted.message);
    }

    type ReviewSentimentLevel =
      | 'very_positive'
      | 'positive'
      | 'neutral'
      | 'mixed'
      | 'negative'
      | 'very_negative';

    const ALLOWED_SENTIMENTS = new Set<ReviewSentimentLevel>([
      'very_positive',
      'positive',
      'neutral',
      'mixed',
      'negative',
      'very_negative',
    ]);

    interface ParsedReviewJson {
      review?: string;
      alternates?: unknown;
      short?: string;
      detailed?: string;
      professional?: string;
      language?: string;
      script?: string;
      sentiment?: string;
      sentimentDetected?: string;
      groundedFacts?: unknown;
      styleApplied?: string;
      keywordsUsed?: unknown;
      validation?: {
        english_vocabulary_found?: boolean;
        facts_preserved?: boolean;
        sentiment_preserved?: boolean;
        unsupported_claims?: boolean;
      };
      selfCheck?: {
        noInventedClaims?: boolean;
        scriptCompliant?: boolean;
        conversationalTone?: boolean;
        simpleVocabulary?: boolean;
        accurateSentiment?: boolean;
      };
    }

    const defaultScript: 'roman' | 'devanagari' =
      language === 'hi' || language === 'mr' ? 'devanagari' : 'roman';

    const parseReviewPayload = (rawText: string): {
      reviewText: string;
      alternates: string[];
      keywordsUsed: string[];
      script: 'roman' | 'devanagari';
      sentiment: ReviewSentimentLevel;
      validation: {
        english_vocabulary_found: boolean;
        facts_preserved: boolean;
        sentiment_preserved: boolean;
        unsupported_claims: boolean;
      };
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
      let parsedAlternates: string[] = [];
      let parsedKeywords: string[] = [];
      let script: 'roman' | 'devanagari' = defaultScript;
      let sentiment: ReviewSentimentLevel = 'positive';
      let groundedFacts: string[] = [];
      let styleApplied: string = style;
      let validation = {
        english_vocabulary_found: false,
        facts_preserved: true,
        sentiment_preserved: true,
        unsupported_claims: false,
      };
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
          if (Array.isArray(parsed.alternates)) {
            parsedAlternates = parsed.alternates
              .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
              .map((a) => a.trim())
              .slice(0, 3);
          }
          if (parsed.script === 'roman' || parsed.script === 'devanagari') {
            script = parsed.script;
          }
          if (Array.isArray(parsed.keywordsUsed)) {
            parsedKeywords = parsed.keywordsUsed
              .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
              .map((k) => k.trim())
              .slice(0, 6);
          }
          const rawSentiment = (parsed.sentiment || parsed.sentimentDetected || '').trim().toLowerCase();
          if (ALLOWED_SENTIMENTS.has(rawSentiment as ReviewSentimentLevel)) {
            sentiment = rawSentiment as ReviewSentimentLevel;
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
          if (parsed.validation && typeof parsed.validation === 'object') {
            validation = {
              english_vocabulary_found: Boolean(parsed.validation.english_vocabulary_found ?? false),
              facts_preserved: Boolean(parsed.validation.facts_preserved ?? true),
              sentiment_preserved: Boolean(parsed.validation.sentiment_preserved ?? true),
              unsupported_claims: Boolean(parsed.validation.unsupported_claims ?? false),
            };
          }
          if (parsed.selfCheck && typeof parsed.selfCheck === 'object') {
            selfCheck = {
              noInventedClaims: Boolean(parsed.selfCheck.noInventedClaims ?? !validation.unsupported_claims),
              scriptCompliant: Boolean(parsed.selfCheck.scriptCompliant ?? !validation.english_vocabulary_found),
              conversationalTone: Boolean(parsed.selfCheck.conversationalTone ?? true),
              simpleVocabulary: Boolean(parsed.selfCheck.simpleVocabulary ?? !validation.english_vocabulary_found),
              accurateSentiment: Boolean(parsed.selfCheck.accurateSentiment ?? validation.sentiment_preserved),
            };
          } else {
            selfCheck = {
              noInventedClaims: !validation.unsupported_claims && validation.facts_preserved,
              scriptCompliant: !validation.english_vocabulary_found,
              conversationalTone: true,
              simpleVocabulary: !validation.english_vocabulary_found,
              accurateSentiment: validation.sentiment_preserved,
            };
          }
        } catch {
          parsedText = rawText.replace(/^["']|["']$/g, '').trim();
        }
      }

      return {
        reviewText: parsedText,
        alternates: parsedAlternates,
        keywordsUsed: parsedKeywords,
        script,
        sentiment,
        validation,
        structuredMeta: {
          sentimentDetected: sentiment,
          groundedFacts,
          styleApplied,
          selfCheck,
        },
      };
    };

    let { reviewText, alternates, keywordsUsed, script, sentiment, validation, structuredMeta } =
      parseReviewPayload(genResult.text);
    let totalInputTokens = genResult.inputTokens;
    let totalOutputTokens = genResult.outputTokens;
    let totalTokens = genResult.totalTokens;
    let finalModelId = genResult.modelId;

    if (!reviewText) {
      return buildGroundedFallbackResponse('Upstream model returned an empty review draft.');
    }

    // Phase 3: Server-Side Quality Validation & Targeted Auto-Repair Pass
    let qualityReport: ReviewQualityReport = validateReviewQuality({
      reviewText,
      language,
      businessName,
      category,
      ownerName,
      responses,
      additionalComments,
      previousDrafts,
      referenceReviews: referenceTexts,
      autoRepaired: false,
    });

    const needsModelValidationRepair =
      (language === 'hinglish' && validation.english_vocabulary_found) ||
      validation.unsupported_claims;
    const hasCriticalQualityIssue =
      !qualityReport.scriptCompliant ||
      qualityReport.inventedClaimCount > 0 ||
      qualityReport.contradictionCount > 0 ||
      qualityReport.clicheCount > 0 ||
      (qualityReport.copiedReferenceCount ?? 0) > 0 ||
      (qualityReport.ownerHallucinationCount ?? 0) > 0 ||
      needsModelValidationRepair;
    if (hasCriticalQualityIssue) {
      const repairIssues = [
        ...qualityReport.issues.map(
          (i) => `- [${i.type}] ${i.message}${i.evidence ? ` (Evidence: "${i.evidence}")` : ''}`,
        ),
        language === 'hinglish' && validation.english_vocabulary_found
          ? '- [validation] Replace all English vocabulary with everyday Hindi words in English letters.'
          : '',
        !validation.facts_preserved
          ? '- [validation] Ensure all supplied customer facts are accurately preserved.'
          : '',
        !validation.sentiment_preserved
          ? '- [validation] Ensure the customer sentiment is accurately preserved without exaggeration or omissions.'
          : '',
        validation.unsupported_claims
          ? '- [validation] Remove any claims or details not present in the customer feedback.'
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const repairPrompt = [
        `Original Draft Needed Fixing:\n"${reviewText}"`,
        `Detected Quality Issues:\n${repairIssues}`,
        `Customer Feedback (ONLY allowed facts):\n${formattedResponses || '(None)'}`,
        additionalComments ? `Customer Written Note: "${additionalComments}"` : '',
        `Rewrite the review cleanly in ${languageLabel} fixing EVERY issue above while staying natural, original (never copying reference wording), and strictly grounded.`,
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
            ownerName,
            responses,
            additionalComments,
            previousDrafts,
            referenceReviews: referenceTexts,
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
            script = repairedParsed.script;
            sentiment = repairedParsed.sentiment;
            validation = repairedParsed.validation;
            structuredMeta = repairedParsed.structuredMeta;
            qualityReport = repairedReport;
          }
        }
      } catch {
        // Non-fatal: fall back to initial draft + qualityReport if repair pass fails
      }
    }

    const seenTexts = new Set<string>([
      reviewText.trim().toLowerCase(),
      ...previousDrafts.map((d) => d.trim().toLowerCase()),
    ]);
    const verifiedAlternates: string[] = [];
    for (const candidateAlt of alternates) {
      const cleanAlt = candidateAlt.trim();
      const normalizedAlt = cleanAlt.toLowerCase();
      if (!cleanAlt || seenTexts.has(normalizedAlt)) continue;
      const altQuality = validateReviewQuality({
        reviewText: cleanAlt,
        language,
        businessName,
        category,
        ownerName,
        responses,
        additionalComments,
        previousDrafts: [...previousDrafts, reviewText, ...verifiedAlternates],
        referenceReviews: referenceTexts,
        autoRepaired: false,
      });
      if (
        altQuality.scriptCompliant &&
        altQuality.inventedClaimCount === 0 &&
        altQuality.contradictionCount === 0 &&
        (altQuality.copiedReferenceCount ?? 0) === 0 &&
        (altQuality.ownerHallucinationCount ?? 0) === 0
      ) {
        seenTexts.add(normalizedAlt);
        verifiedAlternates.push(cleanAlt);
        if (verifiedAlternates.length >= 2) break;
      }
    }

    return {
      status: 200,
      data: {
        review: reviewText,
        alternates: verifiedAlternates,
        language,
        script,
        sentiment,
        validation,
        drafts: { [style]: reviewText },
        keywordsUsed,
        structuredMeta,
        qualityReport,
        ...(visitorQuota
          ? {
              quotaRemaining: visitorQuota.remaining,
              quotaResetAt: visitorQuota.resetAt,
            }
          : {}),
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
    const formatted = formatGeminiEndpointError(err, 'generating review');
    if (formatted.status >= 500) {
      console.error('Review generation error:', formatted.message);
    }
    return {
      status: formatted.status,
      data: { error: formatted.message },
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
    const formatted = formatGeminiEndpointError(err, 'generating AI reply');
    if (formatted.status >= 500) {
      console.error('GBP reply generation error:', formatted.message);
    }
    return {
      status: formatted.status,
      data: { error: formatted.message },
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
      let lastLocError: { status: number; message: string } | null = null;

      for (const acc of accounts.slice(0, 5)) {
        if (!acc.name || !/^accounts\/[a-zA-Z0-9_-]+$/.test(acc.name)) continue;
        const locUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,metadata`;
        const locRes = await fetchWithTimeout(
          locUrl,
          { headers: { Authorization: `Bearer ${gbpAccessToken}` } },
          10000,
        );
        if (!locRes.ok) {
          const locErrBody = await locRes.text().catch(() => '');
          lastLocError = {
            status: locRes.status,
            message: `Google Business Information API (${locRes.status}): ${sanitizeApiErrorDetail(locErrBody) || locRes.statusText}`,
          };
          continue;
        }
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

      if (locations.length === 0 && lastLocError) {
        return {
          status: lastLocError.status,
          data: { error: lastLocError.message },
        };
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

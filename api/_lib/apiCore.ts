import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export type ReviewStyle = 'short' | 'detailed' | 'professional';

export interface QuestionResponseInput {
  question: string;
  answers: string[];
}

export interface GenerateReviewBody {
  businessName: string;
  category: string;
  seoKeywords?: string[];
  responses: QuestionResponseInput[];
  additionalComments?: string;
  style: ReviewStyle;
  variationSeed?: number;
}

export interface GenerateSeoKeywordsBody {
  businessName: string;
  category: string;
  address?: string;
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
    : 'gemini-3.5-flash-lite';
export const API_AUTH_REQUIRED = cleanSecretEnv(process.env.API_AUTH_REQUIRED) !== 'false';

function resolveFirebaseProjectId(): string {
  const fromEnv = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    ''
  ).trim();
  if (fromEnv) return fromEnv;

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { projectId?: string };
      return (parsed.projectId || '').trim();
    }
  } catch {
    // Ignore missing/invalid local config file
  }
  return '';
}

export const FIREBASE_PROJECT_ID = resolveFirebaseProjectId();

let certCache: { certs: Record<string, string>; expiresAt: number } = {
  certs: {},
  expiresAt: 0,
};

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certCache.expiresAt && Object.keys(certCache.certs).length > 0) {
    return certCache.certs;
  }

  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
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

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
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
): Promise<{ ok: true; user?: { uid: string; email: string } } | { ok: false; status: number; error: string }> {
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
    return { ok: true, user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    return { ok: false, status: 401, error: `Invalid or expired session token: ${msg}` };
  }
}

export function isOriginAllowed(origin: string, hostHeader: string): boolean {
  const cleanOrigin = origin.replace(/\/+$/, '');
  if (!cleanOrigin) return true;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const isSameHost =
    cleanOrigin === `https://${hostHeader}` || cleanOrigin === `http://${hostHeader}`;
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
  return cleanSecretEnv(process.env.GEMINI_API_KEY);
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
  const explicit = cleanSecretEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI).toLowerCase();
  if (explicit === 'true') return [true];
  if (explicit === 'false') return [false];
  const apiKey = getGeminiApiKey();
  return apiKey.startsWith('AQ.') ? [false, true] : [false];
}

async function generateGeminiContentWithFallback(
  contents: string,
  config: Record<string, unknown>,
  maxTransientAttempts = 1,
): Promise<string> {
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
          if (text) return text;
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isApiKeyInvalid =
            msg.includes('API_KEY_INVALID') ||
            msg.toLowerCase().includes('api key not valid');
          if (isApiKeyInvalid && hasNextMode) {
            // Standard Gemini rejected an AQ. key -> try Vertex AI Express mode next
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
  return '';
}

async function callOpenAIJson(systemInstruction: string, prompt: string): Promise<string> {
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
  };
  return (data.choices?.[0]?.message?.content || '').trim();
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
  return {
    ok: true,
    provider: AI_PROVIDER,
    model: activeModel,
    authRequired: API_AUTH_REQUIRED,
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
      '1. Infer specialties directly from the business name + category (e.g. "Royal Keratin Salon" -> "hair salon", "keratin treatment", "haircut", "hair styling"; "IronPeak CrossFit Gym" -> "gym", "crossfit gym", "strength training", "personal training", "fitness center").',
      '2. Include the primary category search term (e.g. "hair salon", "gym", "restaurant", "spa") and top natural service phrases customers search on Google Maps.',
      '3. If a city or neighborhood appears in the address, include 1-2 natural local search phrases combining the category + area (e.g. "hair salon in Austin").',
      '4. Keep each keyword concise (1 to 4 words, max 45 characters), lowercase or clean natural phrase, no hashtags, no spammy stuffing.',
    ].join('\n');

    let responseText = '';
    if (AI_PROVIDER === 'openai') {
      responseText = await callOpenAIJson(systemInstruction, prompt);
    } else {
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return {
          status: 400,
          data: { error: 'GEMINI_API_KEY is not configured on the server.' },
        };
      }

      responseText = await generateGeminiContentWithFallback(
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

    if (!responseText) {
      return {
        status: 502,
        data: { error: 'Unable to generate SEO keywords right now.' },
      };
    }

    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(responseText) as { keywords?: unknown };
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

    return { status: 200, data: { keywords: keywords.slice(0, 12) } };
  } catch (err: unknown) {
    console.error('SEO keyword generation error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 500,
      data: { error: `Failed to generate SEO keywords: ${message.slice(0, 180)}` },
    };
  }
}

export async function processGenerateReview(
  body: Partial<GenerateReviewBody>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const customSeoKeywords = Array.isArray(body.seoKeywords)
      ? body.seoKeywords
          .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
          .map((k) => k.trim().slice(0, 60))
          .slice(0, 15)
      : [];
    const additionalComments =
      typeof body.additionalComments === 'string' ? body.additionalComments.trim() : '';
    const style: ReviewStyle =
      body.style === 'short' || body.style === 'detailed' || body.style === 'professional'
        ? body.style
        : 'short';
    const responses = Array.isArray(body.responses) ? body.responses : [];
    const variationSeed = typeof body.variationSeed === 'number' ? body.variationSeed : 1;

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

    const categoryTerms = getCategoryKeywords(category);
    const mergedSeoKeywords = Array.from(
      new Set([...customSeoKeywords, ...categoryTerms]),
    ).slice(0, 10);

    const styleGuidance: Record<ReviewStyle, string> = {
      short: '2-3 sentences (~28-48 words), crisp and natural.',
      detailed: '4-5 sentences (~60-95 words), conversational story weaving services, experience, and comments.',
      professional: '3-4 sentences (~45-70 words), articulate and courteous.',
    };

    const prompt = [
      `Business: ${businessName}`,
      category ? `Category: ${category}` : '',
      `Style (${style}): ${styleGuidance[style]}`,
      `SEO Keywords: ${mergedSeoKeywords.join(', ')}`,
      `Variation: ${variationSeed}`,
      'Selections:',
      formattedResponses || '(None)',
      additionalComments ? `Comments: "${additionalComments}"` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const systemInstruction = [
      'Write 1 authentic first-person ("I"/"We") Google review from customer selections, optimized naturally for local search.',
      'Return JSON: {"review":"...","keywordsUsed":["..."]}.',
      'Rules: Include business name, category term, and selected services naturally; never invent details; match exact sentiment (keep honest if Average/Poor); no clichés ("exceeded all expectations"), quotes, bullets, or emojis; list 2-5 exact keywords used in keywordsUsed.',
    ].join('\n');

    let rawText = '';
    if (AI_PROVIDER === 'openai') {
      rawText = await callOpenAIJson(systemInstruction, prompt);
    } else {
      const geminiKey = getGeminiApiKey();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return {
          status: 400,
          data: { error: 'GEMINI_API_KEY is not configured on the server.' },
        };
      }

      rawText = await generateGeminiContentWithFallback(
        prompt,
        {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              review: { type: Type.STRING },
              keywordsUsed: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['review', 'keywordsUsed'],
          },
        },
        2,
      );
    }

    let reviewText = '';
    let keywordsUsed: string[] = [];

    if (rawText) {
      try {
        const parsed = JSON.parse(rawText) as {
          review?: string;
          short?: string;
          detailed?: string;
          professional?: string;
          keywordsUsed?: unknown;
        };
        const chosen = parsed[style];
        reviewText =
          (typeof parsed.review === 'string' ? parsed.review.trim() : '') ||
          (typeof chosen === 'string' ? chosen.trim() : '');
        if (Array.isArray(parsed.keywordsUsed)) {
          keywordsUsed = parsed.keywordsUsed
            .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
            .map((k) => k.trim())
            .slice(0, 6);
        }
      } catch {
        reviewText = rawText.replace(/^["']|["']$/g, '').trim();
      }
    }

    if (!reviewText) {
      return {
        status: 502,
        data: { error: 'Unable to generate a review draft right now. Please try again.' },
      };
    }

    return {
      status: 200,
      data: {
        review: reviewText,
        drafts: { [style]: reviewText },
        keywordsUsed,
      },
    };
  } catch (err: unknown) {
    console.error('Review generation error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status?: unknown }).status)
        : 500;
    if (
      status === 403 ||
      status === 400 ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('API_KEY_INVALID')
    ) {
      const detail = sanitizeApiErrorDetail(message);
      const isRefererBlock = detail.toLowerCase().includes('referer');
      return {
        status: status === 400 ? 400 : 403,
        data: {
          error: isRefererBlock
            ? 'Your Google API key has HTTP referrer restrictions enabled, which blocks server-side calls from Vercel. In Google Cloud Console, switch this key to None (or API-only restrictions), or use a standard server Gemini API key.'
            : `API key error when generating review: ${detail || 'Please check GEMINI_API_KEY in your server environment.'}`,
        },
      };
    }
    if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        data: { error: 'AI generation rate limit reached. Please wait a moment and try again.' },
      };
    }
    return {
      status: 500,
      data: { error: `Failed to generate review draft: ${message.slice(0, 180)}` },
    };
  }
}

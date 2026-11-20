import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = isProd ? Number(process.env.PORT) || 3000 : 3000;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase() === 'openai' ? 'openai' : 'gemini';
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').trim();
const GEMINI_FALLBACK_MODEL = (
  process.env.GEMINI_FALLBACK_MODEL !== undefined
    ? process.env.GEMINI_FALLBACK_MODEL
    : 'gemini-3.1-flash-lite'
).trim();
const API_AUTH_REQUIRED = process.env.API_AUTH_REQUIRED !== 'false';

type ReviewStyle = 'short' | 'detailed' | 'professional';

interface QuestionResponseInput {
  question: string;
  answers: string[];
}

interface GenerateReviewBody {
  businessName: string;
  category: string;
  seoKeywords?: string[];
  responses: QuestionResponseInput[];
  additionalComments?: string;
  style: ReviewStyle;
  variationSeed?: number;
}

interface GenerateSeoKeywordsBody {
  businessName: string;
  category: string;
  address?: string;
}

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email: string;
  };
}

function resolveFirebaseProjectId(): string {
  const fromEnv = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    ''
  ).trim();
  if (fromEnv) return fromEnv;

  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { projectId?: string };
      return (parsed.projectId || '').trim();
    }
  } catch {
    // Ignore missing/invalid local config file
  }
  return '';
}

const FIREBASE_PROJECT_ID = resolveFirebaseProjectId();

// Cached Firebase Auth X.509 public certificates for zero-dependency JWT verification
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

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string }> {
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

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const authUid = (req as AuthenticatedRequest).authUser?.uid;
    const key = authUid ? `uid:${authUid}` : `ip:${getClientIp(req)}`;
    const now = Date.now();
    const cutoff = now - windowMs;

    const existing = buckets.get(key) || [];
    const recent = existing.filter((ts) => ts > cutoff);
    if (recent.length >= maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait a minute before trying again.',
      });
      return;
    }
    recent.push(now);
    buckets.set(key, recent);

    if (buckets.size > 5000) {
      for (const [k, stamps] of buckets.entries()) {
        if (stamps.every((ts) => ts <= cutoff)) {
          buckets.delete(k);
        }
      }
    }
    next();
  };
}

async function requireAuthenticatedUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!API_AUTH_REQUIRED) {
    next();
    return;
  }
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required. Please sign in to use this API endpoint.',
    });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Bearer token is missing.' });
    return;
  }
  try {
    req.authUser = await verifyFirebaseIdToken(token);
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    res.status(401).json({ error: `Invalid or expired session token: ${msg}` });
  }
}

function createGenAIClient() {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const disableHeader = process.env.DISABLE_AISTUDIO_HEADER === 'true';
  const useVertexAi =
    process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true' || apiKey.startsWith('AQ.');

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

async function callOpenAIJson(systemInstruction: string, prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
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
  return category ? [category.toLowerCase(), 'quality service', 'customer experience'] : ['quality service'];
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Strict CORS middleware for custom-domain / multi-origin self-hosting
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const origin = (req.headers.origin || '').replace(/\/+$/, '');
    const hostHeader = req.headers.host || '';
    const isSameHost = origin && (origin === `https://${hostHeader}` || origin === `http://${hostHeader}`);

    if (origin) {
      const allowed =
        allowedOrigins.length === 0 || isSameHost || allowedOrigins.includes(origin);
      if (!allowed) {
        if (req.method === 'OPTIONS') {
          res.status(403).end();
          return;
        }
        res.status(403).json({ error: 'Origin not allowed by CORS policy.' });
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const publicReviewLimiter = createRateLimiter(30, 5 * 60 * 1000);
  const seoKeywordLimiter = createRateLimiter(30, 5 * 60 * 1000);

  app.get('/api/health', (_req: Request, res: Response) => {
    const activeModel =
      AI_PROVIDER === 'openai'
        ? (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
        : GEMINI_MODEL;
    res.json({
      ok: true,
      provider: AI_PROVIDER,
      model: activeModel,
      authRequired: API_AUTH_REQUIRED,
    });
  });

  app.post(
    '/api/generate-seo-keywords',
    requireAuthenticatedUser,
    seoKeywordLimiter,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as Partial<GenerateSeoKeywordsBody>;
        const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
        const category = typeof body.category === 'string' ? body.category.trim() : '';
        const address = typeof body.address === 'string' ? body.address.trim() : '';

        if (!businessName) {
          res.status(400).json({ error: 'Business name is required to generate SEO keywords.' });
          return;
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
          if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
            res.status(400).json({
              error: 'GEMINI_API_KEY is not configured on the server.',
            });
            return;
          }

          const ai = createGenAIClient();
          const modelAttempts = Array.from(
            new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter(Boolean)),
          );

          let lastErr: unknown;
          for (const modelName of modelAttempts) {
            try {
              const result = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                  systemInstruction,
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      keywords: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: '8 to 10 Google Maps local search keywords tailored to this business.',
                      },
                    },
                    required: ['keywords'],
                  },
                },
              });
              responseText = (result.text ?? '').trim();
              if (responseText) break;
            } catch (err) {
              lastErr = err;
              const msg = err instanceof Error ? err.message : String(err);
              const isRecoverable =
                msg.includes('503') ||
                msg.includes('UNAVAILABLE') ||
                msg.includes('429') ||
                msg.includes('404') ||
                msg.includes('NOT_FOUND');
              if (!isRecoverable) throw err;
            }
          }
          if (!responseText && lastErr) throw lastErr;
        }

        if (!responseText) {
          res.status(502).json({ error: 'Unable to generate SEO keywords right now.' });
          return;
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

        res.json({ keywords: keywords.slice(0, 12) });
      } catch (err: unknown) {
        console.error('SEO keyword generation error:', err);
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: `Failed to generate SEO keywords: ${message.slice(0, 180)}` });
      }
    },
  );

  app.post('/api/generate-review', publicReviewLimiter, async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<GenerateReviewBody>;
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
        res.status(400).json({ error: 'Business name is required.' });
        return;
      }

      const formattedResponses = responses
        .filter((item) => item && typeof item.question === 'string' && Array.isArray(item.answers) && item.answers.length > 0)
        .map((item) => `- ${item.question}: ${item.answers.join(', ')}`)
        .join('\n');

      if (!formattedResponses && !additionalComments) {
        res.status(400).json({
          error: 'Please answer at least one question or add a comment before generating a review draft.',
        });
        return;
      }

      const categoryTerms = getCategoryKeywords(category);
      const mergedSeoKeywords = Array.from(
        new Set([...customSeoKeywords, ...categoryTerms]),
      ).slice(0, 14);
      const selectedTerms = responses
        .flatMap((r) => (Array.isArray(r?.answers) ? r.answers : []))
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

      const prompt = [
        `Business: ${businessName}`,
        category ? `Category: ${category}` : '',
        `Target Local Search Keywords (prioritize the business's tailored keywords naturally where true to customer selections): ${mergedSeoKeywords.join(', ')}`,
        selectedTerms.length > 0 ? `Customer Selected Services/Traits: ${selectedTerms.join(', ')}` : '',
        `Variation: ${variationSeed}`,
        'Customer Selections:',
        formattedResponses || '(None)',
        additionalComments ? `Comments: "${additionalComments}"` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const systemInstruction = [
        'You write authentic, human-sounding Google reviews optimized for Google Maps local search relevance.',
        'Return valid JSON matching {"short": "...", "detailed": "...", "professional": "...", "keywordsUsed": ["..."]}.',
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

      let rawText = '';
      if (AI_PROVIDER === 'openai') {
        rawText = await callOpenAIJson(systemInstruction, prompt);
      } else {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
          res.status(400).json({
            error: 'GEMINI_API_KEY is not configured on the server.',
          });
          return;
        }

        const ai = createGenAIClient();
        const generateFast = async () => {
          const modelAttempts = Array.from(
            new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL].filter(Boolean)),
          );
          let lastErr: unknown;
          for (const modelName of modelAttempts) {
            for (let retry = 0; retry < 2; retry += 1) {
              try {
                return await ai.models.generateContent({
                  model: modelName,
                  contents: prompt,
                  config: {
                    systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                        short: {
                          type: Type.STRING,
                          description: 'Short & Simple draft (2-3 sentences).',
                        },
                        detailed: {
                          type: Type.STRING,
                          description: 'Natural & Detailed draft (4-5 sentences).',
                        },
                        professional: {
                          type: Type.STRING,
                          description: 'Professional draft (3-4 sentences).',
                        },
                        keywordsUsed: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                          description: '3 to 6 high-intent Google search keywords included naturally.',
                        },
                      },
                      required: ['short', 'detailed', 'professional', 'keywordsUsed'],
                    },
                  },
                });
              } catch (err) {
                lastErr = err;
                const msg = err instanceof Error ? err.message : String(err);
                const isRecoverable =
                  msg.includes('503') ||
                  msg.includes('UNAVAILABLE') ||
                  msg.includes('429') ||
                  msg.includes('404') ||
                  msg.includes('NOT_FOUND');
                if (!isRecoverable) throw err;
                await new Promise((resolve) => setTimeout(resolve, 150));
              }
            }
          }
          throw lastErr;
        };

        const response = await generateFast();
        rawText = (response.text ?? '').trim();
      }

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
            detailed: (typeof parsed.detailed === 'string' ? parsed.detailed.trim() : '') || fallbackSingle,
            professional:
              (typeof parsed.professional === 'string' ? parsed.professional.trim() : '') || fallbackSingle,
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

      const reviewText = drafts[style] || drafts.short || drafts.detailed || drafts.professional;

      if (!reviewText) {
        res.status(502).json({ error: 'Unable to generate a review draft right now. Please try again.' });
        return;
      }

      res.json({
        review: reviewText,
        drafts,
        keywordsUsed,
      });
    } catch (err: unknown) {
      console.error('Review generation error:', err);
      const message = err instanceof Error ? err.message : String(err);
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 500;
      if (status === 403 || status === 400 || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
        res.status(status === 400 ? 400 : 403).json({
          error: 'API key error when generating review. Please check server environment configuration.',
        });
        return;
      }
      if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'AI generation rate limit reached. Please wait a moment and try again.',
        });
        return;
      }
      res.status(500).json({
        error: `Failed to generate review draft: ${message.slice(0, 180)}`,
      });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReviewFlow server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ReviewFlow server:', err);
  process.exit(1);
});

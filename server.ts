import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  authenticateBearerHeader,
  checkRateLimit,
  getHealthPayload,
  isOriginAllowed,
  processGbpProxy,
  processGenerateReply,
  processGenerateReview,
  processGenerateSeoKeywords,
  processValidateQrStandSlot,
  sanitizeLogError,
  type GbpProxyBody,
  type GenerateReplyBody,
  type GenerateReviewBody,
  type GenerateSeoKeywordsBody,
  type ValidateQrStandSlotBody,
} from './api/_lib/apiCore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = isProd ? Number(process.env.PORT) || 3000 : 3000;

interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email: string;
  };
  rawBearerToken?: string;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authUid = (req as AuthenticatedRequest).authUser?.uid;
    const key = authUid ? `uid:${authUid}` : `ip:${getClientIp(req)}`;
    if (!checkRateLimit(key, maxRequests, windowMs)) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait a minute before trying again.',
      });
      return;
    }
    next();
  };
}

async function requireAuthenticatedUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization || '';
    const result = await authenticateBearerHeader(authHeader);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    if (result.user) {
      req.authUser = result.user;
    }
    if (result.rawToken) {
      req.rawBearerToken = result.rawToken;
    }
    next();
  } catch (err) {
    console.error('Auth middleware error:', sanitizeLogError(err));
    res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = (req.headers.origin || '').replace(/\/+$/, '');
    const forwardedHost =
      typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'] : '';
    const hostHeader = [forwardedHost, req.headers.host || ''].filter(Boolean).join(',');

    if (origin) {
      if (!isOriginAllowed(origin, hostHeader)) {
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
  const authenticatedLimiter = createRateLimiter(40, 5 * 60 * 1000);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json(getHealthPayload());
  });

  app.post(
    '/api/generate-seo-keywords',
    requireAuthenticatedUser,
    authenticatedLimiter,
    async (req: Request, res: Response) => {
      try {
        const result = await processGenerateSeoKeywords(
          req.body as Partial<GenerateSeoKeywordsBody>,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
        console.error('generate-seo-keywords route error:', sanitizeLogError(err));
        res.status(500).json({ error: 'Internal server error while generating SEO keywords.' });
      }
    },
  );

  app.post('/api/generate-review', publicReviewLimiter, async (req: Request, res: Response) => {
    try {
      const result = await processGenerateReview(req.body as Partial<GenerateReviewBody>);
      res.status(result.status).json(result.data);
    } catch (err) {
      console.error('generate-review route error:', sanitizeLogError(err));
      res.status(500).json({ error: 'Internal server error while generating review draft.' });
    }
  });

  app.post(
    '/api/generate-reply',
    requireAuthenticatedUser,
    authenticatedLimiter,
    async (req: Request, res: Response) => {
      try {
        const result = await processGenerateReply(req.body as Partial<GenerateReplyBody>);
        res.status(result.status).json(result.data);
      } catch (err) {
        console.error('generate-reply route error:', sanitizeLogError(err));
        res.status(500).json({ error: 'Internal server error while generating reply.' });
      }
    },
  );

  app.post(
    '/api/qr-stand-authorize',
    requireAuthenticatedUser,
    authenticatedLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const result = await processValidateQrStandSlot(
          req.body as Partial<ValidateQrStandSlotBody>,
          req.rawBearerToken,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
        console.error('qr-stand-authorize route error:', sanitizeLogError(err));
        res.status(500).json({ error: 'Internal server error while authorizing QR stand.' });
      }
    },
  );

  app.post(
    '/api/gbp-sync',
    requireAuthenticatedUser,
    authenticatedLimiter,
    async (req: Request, res: Response) => {
      try {
        const result = await processGbpProxy(req.body as Partial<GbpProxyBody>);
        res.status(result.status).json(result.data);
      } catch (err) {
        console.error('gbp-sync route error:', sanitizeLogError(err));
        res.status(500).json({ error: 'Internal server error while syncing Google Business Profile.' });
      }
    },
  );

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

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
  processDispatchWeeklyReportEmail,
  processGbpProxy,
  processGenerateReply,
  processGenerateReview,
  processGenerateSeoKeywords,
  processGoogleReviewsWebhook,
  processValidateQrStandSlot,
  sanitizeLogError,
  verifyGoogleReviewsWebhookAuth,
  verifyWeeklyReportCallerAccess,
  type DispatchWeeklyReportBody,
  type GbpProxyBody,
  type GenerateReplyBody,
  type GenerateReviewBody,
  type GenerateSeoKeywordsBody,
  type GoogleReviewsWebhookBody,
  type ValidateQrStandSlotBody,
} from './api/_lib/apiCore.ts';
import {
  disconnectGbpAction,
  handleGbpOAuthCallback,
  listGbpAccountsAction,
  listGbpLocationsAction,
  publishGbpReplyServerAction,
  selectGbpLocationsAction,
  startGbpOAuthFlow,
  syncGbpReviewsAction,
  type GbpLocationInfo,
} from './api/_lib/gbpOAuthService.ts';

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

  app.post(
    '/api/weekly-report-dispatch',
    requireAuthenticatedUser,
    authenticatedLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = (req.body || {}) as Partial<DispatchWeeklyReportBody>;
        const accessCheck = await verifyWeeklyReportCallerAccess({
          businessId: typeof body.businessId === 'string' ? body.businessId : '',
          caller: req.authUser,
          rawToken: req.rawBearerToken,
        });
        if (!accessCheck.ok) {
          res.status(accessCheck.status).json({ error: accessCheck.error });
          return;
        }
        const result = await processDispatchWeeklyReportEmail(body, {
          allowAiUsageSection: accessCheck.isAdmin,
        });
        res.status(result.status).json(result.data);
      } catch (err) {
        console.error('weekly-report-dispatch route error:', sanitizeLogError(err));
        res.status(500).json({ error: 'Internal server error while dispatching weekly report email.' });
      }
    },
  );

  app.post(
    '/api/webhooks/google-reviews',
    authenticatedLimiter,
    async (req: Request, res: Response) => {
      try {
        const headerSecret =
          typeof req.headers['x-webhook-secret'] === 'string'
            ? req.headers['x-webhook-secret']
            : '';
        const authHeader =
          typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
        const queryToken =
          typeof req.query.token === 'string'
            ? req.query.token
            : typeof req.query.secret === 'string'
              ? req.query.secret
              : '';
        const reqProto =
          typeof req.headers['x-forwarded-proto'] === 'string'
            ? req.headers['x-forwarded-proto'].split(',')[0].trim()
            : req.protocol || 'https';
        const reqHost =
          (typeof req.headers['x-forwarded-host'] === 'string' &&
            req.headers['x-forwarded-host'].split(',')[0].trim()) ||
          req.get('host') ||
          '';
        const expectedAudience = reqHost ? `${reqProto}://${reqHost}${req.path}` : '';
        const authResult = await verifyGoogleReviewsWebhookAuth({
          headerSecret,
          authHeader,
          queryToken,
          expectedAudience,
        });
        if (!authResult.ok) {
          res.status(authResult.status).json({ error: authResult.error });
          return;
        }
        const result = await processGoogleReviewsWebhook(
          req.body as Partial<GoogleReviewsWebhookBody>,
        );
        res.status(result.status).json(result.data);
      } catch (err) {
        console.error('google-reviews webhook route error:', sanitizeLogError(err));
        res
          .status(500)
          .json({ error: 'Internal server error while processing Google review webhook.' });
      }
    },
  );

  app.post(
    '/api/gbp-oauth',
    requireAuthenticatedUser,
    authenticatedLimiter,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const caller = {
          uid: req.authUser?.uid || '',
          email: req.authUser?.email || '',
        };
        if (!caller.uid) {
          res.status(401).json({ error: 'Authenticated user required.' });
          return;
        }
        const body = (req.body || {}) as {
          action?: string;
          businessId?: string;
          accountName?: string;
          locations?: GbpLocationInfo[];
          replaceExistingTopic?: boolean;
          returnPath?: string;
          reviewId?: string;
          externalReviewId?: string;
          replyText?: string;
          locationName?: string;
        };
        const businessId = typeof body.businessId === 'string' ? body.businessId : '';

        if (body.action === 'start') {
          const originHeader =
            typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
          const reqProto =
            typeof req.headers['x-forwarded-proto'] === 'string'
              ? req.headers['x-forwarded-proto'].split(',')[0].trim()
              : req.protocol || 'http';
          const reqHost =
            (typeof req.headers['x-forwarded-host'] === 'string' &&
              req.headers['x-forwarded-host'].split(',')[0].trim()) ||
            req.get('host') ||
            '';
          const requestOrigin = originHeader || (reqHost ? `${reqProto}://${reqHost}` : '');
          const result = await startGbpOAuthFlow({
            businessId,
            caller,
            requestOrigin,
            returnPath: body.returnPath,
          });
          res.status(result.status).json(result.data);
          return;
        }
        if (body.action === 'accounts') {
          const result = await listGbpAccountsAction({ businessId, caller });
          res.status(result.status).json(result.data);
          return;
        }
        if (body.action === 'locations') {
          const result = await listGbpLocationsAction({
            businessId,
            accountName: typeof body.accountName === 'string' ? body.accountName : '',
            caller,
          });
          res.status(result.status).json(result.data);
          return;
        }
        if (body.action === 'select') {
          const result = await selectGbpLocationsAction({
            businessId,
            accountName: typeof body.accountName === 'string' ? body.accountName : '',
            locations: Array.isArray(body.locations) ? body.locations : [],
            replaceExistingTopic: Boolean(body.replaceExistingTopic),
            caller,
          });
          res.status(result.status).json(result.data);
          return;
        }
        if (body.action === 'sync') {
          const result = await syncGbpReviewsAction({ businessId, caller });
          res.status(result.status).json(result.data);
          return;
        }
        if (body.action === 'publish_reply') {
          const result = await publishGbpReplyServerAction({
            businessId,
            reviewId: typeof body.reviewId === 'string' ? body.reviewId : '',
            externalReviewId:
              typeof body.externalReviewId === 'string' ? body.externalReviewId : '',
            replyText: typeof body.replyText === 'string' ? body.replyText : '',
            locationName: typeof body.locationName === 'string' ? body.locationName : undefined,
            caller,
          });
          res.status(result.status).json(result.data);
          return;
        }
        if (body.action === 'disconnect') {
          const result = await disconnectGbpAction({ businessId, caller });
          res.status(result.status).json(result.data);
          return;
        }
        res.status(400).json({ error: 'Unsupported GBP OAuth action.' });
      } catch (err) {
        console.error('gbp-oauth route error:', sanitizeLogError(err));
        res
          .status(500)
          .json({ error: 'Internal server error while processing Google Business Profile request.' });
      }
    },
  );

  app.get('/api/gbp-oauth/callback', async (req: Request, res: Response) => {
    try {
      const { redirectUrl } = await handleGbpOAuthCallback({
        code: typeof req.query.code === 'string' ? req.query.code : undefined,
        state: typeof req.query.state === 'string' ? req.query.state : undefined,
        oauthError: typeof req.query.error === 'string' ? req.query.error : undefined,
        oauthErrorDescription:
          typeof req.query.error_description === 'string'
            ? req.query.error_description
            : undefined,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, redirectUrl);
    } catch (err) {
      console.error('gbp-oauth callback route error:', sanitizeLogError(err));
      res.redirect(
        302,
        '/portal?gbp_oauth=error&gbp_error=Unexpected+error+completing+Google+connection',
      );
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

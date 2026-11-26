import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  PayloadTooLargeError,
  authenticateBearerHeader,
  checkRateLimit,
  isOriginAllowed,
  readSafeJsonBody,
  sanitizeLogError,
} from './_lib/apiCore.js';
import {
  disconnectGbpAction,
  listGbpAccountsAction,
  listGbpLocationsAction,
  publishGbpReplyServerAction,
  selectGbpLocationsAction,
  startGbpOAuthFlow,
  syncGbpReviewsAction,
  type GbpLocationInfo,
} from './_lib/gbpOAuthService.js';

type NodeReq = IncomingMessage & { body?: unknown; method?: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function resolveRequestOrigin(req: NodeReq): string {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (originHeader) return originHeader.replace(/\/+$/, '');
  const proto =
    typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto'].split(',')[0].trim()
      : 'https';
  const host =
    (typeof req.headers['x-forwarded-host'] === 'string' &&
      req.headers['x-forwarded-host'].split(',')[0].trim()) ||
    (typeof req.headers.host === 'string' ? req.headers.host.split(',')[0].trim() : '');
  return host ? `${proto}://${host}` : '';
}

export default async function handler(req: NodeReq, res: ServerResponse) {
  try {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    const forwardedHost =
      typeof req.headers['x-forwarded-host'] === 'string' ? req.headers['x-forwarded-host'] : '';
    const host = [forwardedHost, typeof req.headers.host === 'string' ? req.headers.host : '']
      .filter(Boolean)
      .join(',');

    if (origin && !isOriginAllowed(origin, host)) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 403;
        res.end();
        return;
      }
      sendJson(res, 403, { error: 'Origin not allowed by CORS policy.' });
      return;
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin.replace(/\/+$/, ''));
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const authResult = await authenticateBearerHeader(authHeader);
    if (!authResult.ok || !authResult.user) {
      sendJson(
        res,
        authResult.ok ? 401 : authResult.status,
        { error: authResult.ok ? 'Authenticated user required.' : authResult.error },
      );
      return;
    }

    const rateKey = `gbp-oauth:${authResult.user.uid}`;
    if (!checkRateLimit(rateKey, 45, 5 * 60 * 1000)) {
      sendJson(res, 429, { error: 'Rate limit exceeded. Please wait a minute and retry.' });
      return;
    }

    let body: {
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
    try {
      body = (await readSafeJsonBody(req)) as typeof body;
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, { error: err.message });
        return;
      }
      sendJson(res, 400, { error: 'Invalid JSON request body.' });
      return;
    }

    const caller = { uid: authResult.user.uid, email: authResult.user.email || '' };
    const businessId = typeof body.businessId === 'string' ? body.businessId : '';

    if (body.action === 'start') {
      const requestOrigin = resolveRequestOrigin(req);
      if (!requestOrigin) {
        sendJson(res, 400, { error: 'Unable to determine request origin for OAuth callback.' });
        return;
      }
      const result = await startGbpOAuthFlow({
        businessId,
        caller,
        requestOrigin,
        returnPath: body.returnPath,
      });
      sendJson(res, result.status, result.data);
      return;
    }

    if (body.action === 'accounts') {
      const result = await listGbpAccountsAction({ businessId, caller });
      sendJson(res, result.status, result.data);
      return;
    }

    if (body.action === 'locations') {
      const result = await listGbpLocationsAction({
        businessId,
        accountName: typeof body.accountName === 'string' ? body.accountName : '',
        caller,
      });
      sendJson(res, result.status, result.data);
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
      sendJson(res, result.status, result.data);
      return;
    }

    if (body.action === 'sync') {
      const result = await syncGbpReviewsAction({ businessId, caller });
      sendJson(res, result.status, result.data);
      return;
    }

    if (body.action === 'publish_reply') {
      const result = await publishGbpReplyServerAction({
        businessId,
        reviewId: typeof body.reviewId === 'string' ? body.reviewId : '',
        externalReviewId: typeof body.externalReviewId === 'string' ? body.externalReviewId : '',
        replyText: typeof body.replyText === 'string' ? body.replyText : '',
        locationName: typeof body.locationName === 'string' ? body.locationName : undefined,
        caller,
      });
      sendJson(res, result.status, result.data);
      return;
    }

    if (body.action === 'disconnect') {
      const result = await disconnectGbpAction({ businessId, caller });
      sendJson(res, result.status, result.data);
      return;
    }

    sendJson(res, 400, { error: 'Unsupported GBP OAuth action.' });
  } catch (err) {
    console.error('gbp-oauth error:', sanitizeLogError(err));
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'Internal server error while processing Google Business Profile request.',
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  PayloadTooLargeError,
  checkRateLimit,
  processGoogleReviewsWebhook,
  readSafeJsonBody,
  resolveTrustedRequestHost,
  sanitizeLogError,
  verifyGoogleReviewsWebhookAuth,
  type GoogleReviewsWebhookBody,
} from '../_lib/apiCore.js';

type NodeReq = IncomingMessage & { body?: unknown; method?: string; url?: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function extractQueryToken(rawUrl?: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, 'https://localhost');
    return (
      parsed.searchParams.get('token') ||
      parsed.searchParams.get('secret') ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

function resolveWebhookAudienceUrl(req: NodeReq): string {
  const rawProto =
    typeof req.headers['x-forwarded-proto'] === 'string' &&
    req.headers['x-forwarded-proto'].split(',')[0].trim() === 'http'
      ? 'http'
      : 'https';
  const rawHost = resolveTrustedRequestHost(req.headers);
  if (!rawHost) return '';
  let pathname = '/api/webhooks/google-reviews';
  if (req.url) {
    try {
      pathname = new URL(req.url, `${rawProto}://${rawHost}`).pathname;
    } catch {
      pathname = '/api/webhooks/google-reviews';
    }
  }
  return `${rawProto}://${rawHost}${pathname}`;
}

export default async function handler(req: NodeReq, res: ServerResponse) {
  try {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Webhook-Secret',
    );

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed. Send a POST request.' });
      return;
    }

    const headerSecret =
      typeof req.headers['x-webhook-secret'] === 'string'
        ? req.headers['x-webhook-secret']
        : '';
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const queryToken = extractQueryToken(req.url);
    const expectedAudience = resolveWebhookAudienceUrl(req);

    const authResult = await verifyGoogleReviewsWebhookAuth({
      headerSecret,
      authHeader,
      queryToken,
      expectedAudience,
    });
    if (!authResult.ok) {
      sendJson(res, authResult.status, { error: authResult.error });
      return;
    }

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
      req.socket?.remoteAddress ||
      'unknown';
    const rateKey = authResult.actorId ? `webhook:${authResult.actorId}` : `webhook:ip:${clientIp}`;
    if (!checkRateLimit(rateKey, 60, 5 * 60 * 1000)) {
      sendJson(res, 429, {
        error: 'Rate limit exceeded. Please wait before sending more webhook events.',
      });
      return;
    }

    let body: Partial<GoogleReviewsWebhookBody>;
    try {
      body = (await readSafeJsonBody(req)) as Partial<GoogleReviewsWebhookBody>;
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, { error: err.message });
        return;
      }
      sendJson(res, 400, { error: 'Invalid JSON webhook payload.' });
      return;
    }

    const result = await processGoogleReviewsWebhook(body);
    sendJson(res, result.status, result.data);
  } catch (err) {
    console.error('google-reviews webhook error:', sanitizeLogError(err));
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'Internal server error while processing Google review webhook.',
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  PayloadTooLargeError,
  checkRateLimit,
  isOriginAllowed,
  processGenerateReview,
  readSafeJsonBody,
  sanitizeLogError,
  type GenerateReviewBody,
} from './_lib/apiCore.js';

type NodeReq = IncomingMessage & { body?: unknown; method?: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
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

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
      req.socket?.remoteAddress ||
      'unknown';
    if (!checkRateLimit(`ip:${clientIp}`, 30, 5 * 60 * 1000)) {
      sendJson(res, 429, {
        error: 'Rate limit exceeded. Please wait a minute before trying again.',
      });
      return;
    }

    let body: Partial<GenerateReviewBody>;
    try {
      body = (await readSafeJsonBody(req)) as Partial<GenerateReviewBody>;
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, { error: err.message });
        return;
      }
      sendJson(res, 400, { error: 'Invalid JSON request payload.' });
      return;
    }

    const result = await processGenerateReview(body);
    sendJson(res, result.status, result.data);
  } catch (err) {
    console.error('generate-review error:', sanitizeLogError(err));
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error while generating review draft.' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getHealthPayload, isOriginAllowed } from './_lib/apiCore.js';

type NodeReq = IncomingMessage & { method?: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    sendJson(res, 200, getHealthPayload());
  } catch (err) {
    console.error('health check error:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Health check failed.' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
}

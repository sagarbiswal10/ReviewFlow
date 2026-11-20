import type { IncomingMessage, ServerResponse } from 'node:http';
import { getHealthPayload, isOriginAllowed } from './_lib/apiCore.js';

type NodeReq = IncomingMessage & { method?: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req: NodeReq, res: ServerResponse) {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';

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
}

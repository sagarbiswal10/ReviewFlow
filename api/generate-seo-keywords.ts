import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  authenticateBearerHeader,
  checkRateLimit,
  isOriginAllowed,
  processGenerateSeoKeywords,
  type GenerateSeoKeywordsBody,
} from './_lib/apiCore.js';

type NodeReq = IncomingMessage & { body?: unknown; method?: string };

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: NodeReq): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
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
  const authResult = await authenticateBearerHeader(authResultHeader(authHeader));
  if (!authResult.ok) {
    sendJson(res, authResult.status, { error: authResult.error });
    return;
  }

  const forwarded = req.headers['x-forwarded-for'];
  const clientIp =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.socket?.remoteAddress ||
    'unknown';
  const rateKey = authResult.user ? `uid:${authResult.user.uid}` : `ip:${clientIp}`;
  if (!checkRateLimit(rateKey, 30, 5 * 60 * 1000)) {
    sendJson(res, 429, {
      error: 'Rate limit exceeded. Please wait a minute before trying again.',
    });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as Partial<GenerateSeoKeywordsBody>;
    const result = await processGenerateSeoKeywords(body);
    sendJson(res, result.status, result.data);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request payload.' });
  }
}

function authResultHeader(header: string): string {
  return header;
}

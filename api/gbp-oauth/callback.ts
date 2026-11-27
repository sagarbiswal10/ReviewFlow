import type { IncomingMessage, ServerResponse } from 'node:http';
import { sanitizeLogError } from '../_lib/apiCore.js';
import { handleGbpOAuthCallback } from '../_lib/gbpOAuthService.js';

type NodeReq = IncomingMessage & { method?: string; url?: string };

export default async function handler(req: NodeReq, res: ServerResponse) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed.' }));
      return;
    }

    const parsed = new URL(req.url || '/api/gbp-oauth/callback', 'https://localhost');
    const code = parsed.searchParams.get('code') || undefined;
    const state = parsed.searchParams.get('state') || undefined;
    const oauthError = parsed.searchParams.get('error') || undefined;
    const oauthErrorDescription = parsed.searchParams.get('error_description') || undefined;

    const { redirectUrl } = await handleGbpOAuthCallback({
      code,
      state,
      oauthError,
      oauthErrorDescription,
    });

    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', redirectUrl);
    res.end();
  } catch (err) {
    console.error('gbp-oauth callback error:', sanitizeLogError(err));
    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Location',
      '/portal?gbp_oauth=error&gbp_error_code=callback_failed',
    );
    res.end();
  }
}

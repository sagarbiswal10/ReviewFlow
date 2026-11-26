import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  PayloadTooLargeError,
  VISITOR_QUOTA_MAX_GENERATIONS,
  VISITOR_QUOTA_WINDOW_MS,
  checkRateLimit,
  consumeRateLimitSlot,
  isOriginAllowed,
  processGbpProxy,
  processGenerateReply,
  processGenerateReview,
  processGenerateSeoKeywords,
  processValidateQrStandSlot,
  readSafeJsonBody,
  sanitizeLogError,
  verifyFirebaseIdToken,
} from '../api/_lib/apiCore.ts';

test('TC-API-01: isOriginAllowed allows same-host, empty origin, and configured ALLOWED_ORIGINS only (strict when empty)', () => {
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  try {
    process.env.ALLOWED_ORIGINS = '';
    assert.equal(isOriginAllowed('', 'reviewflow-mocha.vercel.app'), true);
    assert.equal(isOriginAllowed('https://reviewflow-mocha.vercel.app', 'reviewflow-mocha.vercel.app'), true);
    assert.equal(isOriginAllowed('http://localhost:3000', 'localhost:3000'), true);
    assert.equal(isOriginAllowed('https://evil-site.com', 'reviewflow-mocha.vercel.app'), false);

    process.env.ALLOWED_ORIGINS = 'https://reviewflow-mocha.vercel.app';
    assert.equal(isOriginAllowed('https://reviewflow-mocha.vercel.app', 'other.com'), true);
    assert.equal(isOriginAllowed('https://evil-site.com', 'reviewflow-mocha.vercel.app'), false);
  } finally {
    if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prevAllowed;
  }
});

test('TC-API-02: checkRateLimit enforces request caps per bucket key', () => {
  const key = `qa-rate-limit-${Date.now()}`;
  assert.equal(checkRateLimit(key, 2, 10_000), true);
  assert.equal(checkRateLimit(key, 2, 10_000), true);
  assert.equal(checkRateLimit(key, 2, 10_000), false);
  assert.equal(checkRateLimit(`${key}-other`, 2, 10_000), true);
});

test('TC-API-03: processGenerateReview validates required businessName and feedback answers', async () => {
  const noBiz = await processGenerateReview({
    businessName: '   ',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Great'] }],
    style: 'short',
  });
  assert.equal(noBiz.status, 400);

  const noFeedback = await processGenerateReview({
    businessName: 'Bella Bistro',
    category: 'Restaurants',
    responses: [],
    additionalComments: '   ',
    style: 'short',
    language: 'hi',
  });
  assert.equal(noFeedback.status, 400);
});

test('TC-API-04: processGenerateReply validates businessName and integer starRating bounds (1-5)', async () => {
  const noBiz = await processGenerateReply({
    businessName: '',
    starRating: 5,
    reviewComment: 'Great!',
  });
  assert.equal(noBiz.status, 400);

  for (const invalidRating of [0, 6, 3.5, NaN]) {
    const res = await processGenerateReply({
      businessName: 'Lumina Studio',
      starRating: invalidRating,
      reviewComment: 'Nice visit',
    });
    assert.equal(res.status, 400);
  }
});

test('TC-API-05: processGenerateSeoKeywords rejects blank businessName', async () => {
  const res = await processGenerateSeoKeywords({
    businessName: ' ',
    category: 'Hair Salons',
  });
  assert.equal(res.status, 400);
});

test('TC-API-06: processValidateQrStandSlot enforces slot range (1-100), clean businessId, and default quota (4)', async () => {
  const badBiz = await processValidateQrStandSlot({ businessId: '../hack', slotNumber: 1 });
  assert.equal(badBiz.status, 400);

  const badSlot = await processValidateQrStandSlot({ businessId: 'biz_123', slotNumber: 0 });
  assert.equal(badSlot.status, 400);

  const allowedSlot = await processValidateQrStandSlot({ businessId: 'biz_123', slotNumber: 4 });
  assert.equal(allowedSlot.status, 200);
  assert.equal(allowedSlot.data.allowed, true);
  assert.equal(allowedSlot.data.standId, 'biz_123_slot_4');

  const overQuota = await processValidateQrStandSlot({ businessId: 'biz_123', slotNumber: 5 });
  assert.equal(overQuota.status, 403);
  assert.equal(overQuota.data.allowed, false);
});

test('TC-API-07: processGbpProxy validates OAuth token, GBP resource paths, and supported actions', async () => {
  const noToken = await processGbpProxy({ action: 'list_locations', gbpAccessToken: '' });
  assert.equal(noToken.status, 400);

  const badLocation = await processGbpProxy({
    action: 'fetch_reviews',
    gbpAccessToken: 'fake-token',
    locationName: 'invalid/location/path',
  });
  assert.equal(badLocation.status, 400);

  const badReply = await processGbpProxy({
    action: 'publish_reply',
    gbpAccessToken: 'fake-token',
    locationName: 'accounts/123/locations/456',
    externalReviewId: 'bad/id',
    replyText: 'Thank you!',
  });
  assert.equal(badReply.status, 400);

  const unknownAction = await processGbpProxy({
    action: 'delete_everything' as never,
    gbpAccessToken: 'fake-token',
  });
  assert.equal(unknownAction.status, 400);
});

test('TC-API-08: processGenerateReview enforces max 5 generations with 5-minute auto-refresh window', async () => {
  assert.equal(VISITOR_QUOTA_MAX_GENERATIONS, 5);
  assert.equal(VISITOR_QUOTA_WINDOW_MS, 5 * 60 * 1000);

  const bizId = `biz_limit_${Date.now()}`;
  const visitorId = `vis_limit_${Date.now()}`;
  const bucketKey = `visitor:${bizId}:${visitorId}`;

  for (let i = 0; i < 5; i += 1) {
    const slot = consumeRateLimitSlot(bucketKey, VISITOR_QUOTA_MAX_GENERATIONS, VISITOR_QUOTA_WINDOW_MS);
    assert.equal(slot.allowed, true);
    assert.equal(slot.remaining, 4 - i);
    assert.ok(slot.resetAt > Date.now());
  }

  const blocked = await processGenerateReview({
    businessId: bizId,
    visitorId,
    businessName: 'Spice Villa',
    category: 'Restaurants',
    responses: [{ question: 'Food', answers: ['Good'] }],
    style: 'short',
    language: 'hinglish',
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.data.quotaRemaining, 0);
  assert.ok(typeof blocked.data.quotaResetAt === 'number');
  assert.ok(String(blocked.data.error || '').includes('5'));

  // Verify automatic refresh after 5 minutes + 1ms
  const simKey = `visitor:sim_${Date.now()}`;
  const startMs = 1_700_000_000_000;
  for (let i = 0; i < 5; i += 1) {
    assert.equal(consumeRateLimitSlot(simKey, 5, VISITOR_QUOTA_WINDOW_MS, startMs + i * 1000).allowed, true);
  }
  assert.equal(consumeRateLimitSlot(simKey, 5, VISITOR_QUOTA_WINDOW_MS, startMs + 60_000).allowed, false);
  const refreshed = consumeRateLimitSlot(simKey, 5, VISITOR_QUOTA_WINDOW_MS, startMs + VISITOR_QUOTA_WINDOW_MS + 1);
  assert.equal(refreshed.allowed, true);
  assert.equal(refreshed.count, 1);
  assert.equal(refreshed.remaining, 4);
});

test('TC-API-09: readSafeJsonBody rejects payloads exceeding the configured byte limit and sanitizeLogError redacts keys', async () => {
  const smallReq = Readable.from([JSON.stringify({ ok: true })]) as AsyncIterable<unknown> & {
    body?: unknown;
  };
  const parsed = await readSafeJsonBody(smallReq, 1024);
  assert.equal(parsed.ok, true);

  const oversizedReq = Readable.from(['x'.repeat(2048)]) as AsyncIterable<unknown> & {
    body?: unknown;
  };
  await assert.rejects(() => readSafeJsonBody(oversizedReq, 1024), PayloadTooLargeError);

  const preParsedOversized = { body: { big: 'a'.repeat(2048) } } as AsyncIterable<unknown> & {
    body?: unknown;
  };
  await assert.rejects(() => readSafeJsonBody(preParsedOversized, 1024), PayloadTooLargeError);

  const cleanMsg = sanitizeLogError(new Error('Upstream failed using AIzaSyTestKey1234567890'));
  assert.equal(cleanMsg.includes('AIzaSyTestKey'), false);
  assert.ok(cleanMsg.includes('[redacted-key]'));
});

test('TC-API-10: verifyFirebaseIdToken rejects malformed tokens and unverified email claims', async () => {
  await assert.rejects(() => verifyFirebaseIdToken('not.a.valid.jwt.token'), /Malformed bearer token/i);

  const b64 = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj), 'utf-8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const unverifiedToken = [
    b64({ alg: 'RS256', kid: 'kid-1' }),
    b64({
      sub: 'user-123',
      email: 'user@example.com',
      email_verified: false,
      iat: futureExp - 3600,
      exp: futureExp,
    }),
    'fakesig',
  ].join('.');

  await assert.rejects(
    () => verifyFirebaseIdToken(unverifiedToken),
    /verify your email address/i,
  );
});

test('TC-API-11: processGenerateReview succeeds via grounded fallback across languages when GEMINI_API_KEY is unset', async () => {
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  const prevApiKey = process.env.API_KEY;
  try {
    process.env.GEMINI_API_KEY = '';
    process.env.API_KEY = '';

    for (const lang of ['en', 'hinglish', 'hi', 'mr'] as const) {
      const res = await processGenerateReview({
        businessName: 'Oho Shwarma',
        category: 'Restaurants',
        responses: [
          { question: 'Overall experience', answers: ['Good', 'Friendly staff'] },
        ],
        additionalComments: lang === 'en' ? 'Quick counter service.' : '',
        style: 'short',
        language: lang,
        variationSeed: 1,
      });

      assert.equal(res.status, 200);
      assert.equal(typeof res.data.review, 'string');
      assert.ok(String(res.data.review).includes('Oho Shwarma'));
      const report = res.data.qualityReport as { scriptCompliant?: boolean; passed?: boolean };
      assert.equal(report?.scriptCompliant, true);
      assert.equal(report?.passed, true);
    }

    const mixedRes = await processGenerateReview({
      businessName: 'Oho Shwarma',
      category: 'Restaurants',
      responses: [
        { question: 'Food', answers: ['Tasty food'] },
        { question: 'Wait time', answers: ['Slow service'] },
      ],
      style: 'detailed',
      language: 'en',
      variationSeed: 2,
    });
    assert.equal(mixedRes.status, 200);
    assert.equal(mixedRes.data.sentiment, 'mixed');
  } finally {
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    if (prevApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = prevApiKey;
  }
});

test('TC-API-12: verifyGoogleReviewsWebhookAuth enforces GBP_WEBHOOK_SECRET across token, header, and bearer', async () => {
  const prevSecret = process.env.GBP_WEBHOOK_SECRET;
  try {
    process.env.GBP_WEBHOOK_SECRET = 'super-secret-token-123';
    const mod = await import('../api/_lib/apiCore.ts');

    const bad = await mod.verifyGoogleReviewsWebhookAuth({ queryToken: 'wrong' });
    assert.equal(bad.ok, false);

    const byQuery = await mod.verifyGoogleReviewsWebhookAuth({ queryToken: 'super-secret-token-123' });
    assert.equal(byQuery.ok, true);

    const byHeader = await mod.verifyGoogleReviewsWebhookAuth({ headerSecret: 'super-secret-token-123' });
    assert.equal(byHeader.ok, true);

    const byBearer = await mod.verifyGoogleReviewsWebhookAuth({
      authHeader: 'Bearer super-secret-token-123',
    });
    assert.equal(byBearer.ok, true);
  } finally {
    if (prevSecret === undefined) delete process.env.GBP_WEBHOOK_SECRET;
    else process.env.GBP_WEBHOOK_SECRET = prevSecret;
  }
});

test('TC-API-13: processGoogleReviewsWebhook decodes Google Pub/Sub base64 payloads cleanly', async () => {
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = '';
    const mod = await import('../api/_lib/apiCore.ts');

    const pubsubPayload = {
      businessId: 'biz_123',
      businessName: 'Kamothe Glow Salon',
      category: 'Hair Salons',
      review: {
        name: 'accounts/acc1/locations/loc2/reviews/rev999',
        reviewer: { displayName: 'Aarav Patel' },
        starRating: 'TWO',
        comment: 'Had to wait 25 minutes.',
      },
    };

    const res = await mod.processGoogleReviewsWebhook({
      message: {
        data: Buffer.from(JSON.stringify(pubsubPayload), 'utf-8').toString('base64'),
        messageId: 'msg-1',
      },
    });
    // Without GEMINI_API_KEY, processGenerateReply cleanly returns 400 (after decoding Pub/Sub + resolving businessName)
    assert.equal(res.status, 400);
    assert.match(String(res.data.error), /GEMINI_API_KEY/i);

    const missingBiz = await mod.processGoogleReviewsWebhook({
      reviewerName: 'Guest',
      starRating: 5,
    });
    assert.equal(missingBiz.status, 400);
    assert.match(String(missingBiz.data.error), /Business could not be resolved/i);
  } finally {
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
  }
});



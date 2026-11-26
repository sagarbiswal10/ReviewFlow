import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  assertAuthorizedForBusiness,
  classifyGbpApiError,
  configureAccountPubSubNotifications,
  decryptTokenPayload,
  encryptTokenPayload,
  fetchPaginatedGbpAccounts,
  fetchPaginatedGbpLocations,
  resolveSharedPubSubTopic,
} from '../api/_lib/gbpOAuthService.js';

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('encryptTokenPayload and decryptTokenPayload round-trip tokens and detect tampering', () => {
  const key = crypto.randomBytes(32);
  const sample = {
    accessToken: 'ya29.test-access-token',
    refreshToken: '1//test-refresh-token',
    expiresAtMs: Date.now() + 3600_000,
    scope: 'https://www.googleapis.com/auth/business.manage',
    tokenType: 'Bearer',
    connectedEmail: 'owner@example.com',
  };

  const envelope = encryptTokenPayload(sample, key);
  assert.ok(envelope.iv);
  assert.ok(envelope.tag);
  assert.ok(envelope.ciphertext);
  assert.ok(!envelope.ciphertext.includes(sample.accessToken));
  assert.ok(!envelope.ciphertext.includes(sample.refreshToken));

  const decrypted = decryptTokenPayload(envelope, key);
  assert.equal(decrypted.accessToken, sample.accessToken);
  assert.equal(decrypted.refreshToken, sample.refreshToken);
  assert.equal(decrypted.connectedEmail, sample.connectedEmail);

  // Tamper with auth tag -> must fail authentication
  const badTag = Buffer.from(envelope.tag, 'base64');
  badTag[0] ^= 0xff;
  assert.throws(() =>
    decryptTokenPayload({ ...envelope, tag: badTag.toString('base64') }, key),
  );

  // Tamper with ciphertext -> must fail authentication
  const badCipher = Buffer.from(envelope.ciphertext, 'base64');
  badCipher[0] ^= 0xff;
  assert.throws(() =>
    decryptTokenPayload({ ...envelope, ciphertext: badCipher.toString('base64') }, key),
  );

  // Missing / too-short encryption key -> must throw
  const prevKey = process.env.GBP_TOKEN_ENCRYPTION_KEY;
  process.env.GBP_TOKEN_ENCRYPTION_KEY = 'too-short';
  try {
    assert.throws(() => encryptTokenPayload(sample));
  } finally {
    if (prevKey === undefined) {
      delete process.env.GBP_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.GBP_TOKEN_ENCRYPTION_KEY = prevKey;
    }
  }
});

test('resolveSharedPubSubTopic defaults to reviewflow-google-reviews and respects short/full env overrides', () => {
  const prevTopic = process.env.GBP_PUBSUB_TOPIC;
  const prevProject = process.env.GOOGLE_CLOUD_PROJECT;
  const prevFbProject = process.env.VITE_FIREBASE_PROJECT_ID;

  try {
    delete process.env.GBP_PUBSUB_TOPIC;
    process.env.GOOGLE_CLOUD_PROJECT = 'reviewflow-prod';
    assert.equal(
      resolveSharedPubSubTopic(),
      'projects/reviewflow-prod/topics/reviewflow-google-reviews',
    );

    process.env.GBP_PUBSUB_TOPIC = 'custom-short-topic';
    assert.equal(
      resolveSharedPubSubTopic(),
      'projects/reviewflow-prod/topics/custom-short-topic',
    );

    process.env.GBP_PUBSUB_TOPIC = 'projects/other-proj/topics/reviewflow-google-reviews';
    assert.equal(
      resolveSharedPubSubTopic(),
      'projects/other-proj/topics/reviewflow-google-reviews',
    );
  } finally {
    if (prevTopic === undefined) delete process.env.GBP_PUBSUB_TOPIC;
    else process.env.GBP_PUBSUB_TOPIC = prevTopic;
    if (prevProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = prevProject;
    if (prevFbProject === undefined) delete process.env.VITE_FIREBASE_PROJECT_ID;
    else process.env.VITE_FIREBASE_PROJECT_ID = prevFbProject;
  }
});

test('classifyGbpApiError produces actionable messages without leaking secrets', () => {
  const authErr = classifyGbpApiError(401, JSON.stringify({ error: { message: 'invalid_grant' } }), 'accounts');
  assert.match(authErr, /expired|revoked|reconnect/i);

  const quotaErr = classifyGbpApiError(429, JSON.stringify({ error: { message: 'Quota exceeded' } }), 'locations');
  assert.match(quotaErr, /quota|rate|try again/i);

  const permErr = classifyGbpApiError(403, JSON.stringify({ error: { message: 'API has not been used in project' } }), 'accounts');
  assert.match(permErr, /permission|enabled|access/i);

  const unverifiedErr = classifyGbpApiError(400, JSON.stringify({ error: { message: 'Location is not verified' } }), 'notifications');
  assert.match(unverifiedErr, /verified/i);
});

test('fetchPaginatedGbpAccounts traverses nextPageToken pages', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    if (!url.includes('pageToken=')) {
      return makeJsonResponse({
        accounts: [{ name: 'accounts/111', accountName: 'Biz One', type: 'PERSONAL' }],
        nextPageToken: 'page-2-token',
      });
    }
    return makeJsonResponse({
      accounts: [{ name: 'accounts/222', accountName: 'Biz Two', type: 'LOCATION_GROUP' }],
    });
  }) as typeof fetch;

  try {
    const accounts = await fetchPaginatedGbpAccounts('ya29.fake-access');
    assert.equal(accounts.length, 2);
    assert.equal(accounts[0].name, 'accounts/111');
    assert.equal(accounts[1].name, 'accounts/222');
    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls[1].includes('pageToken=page-2-token'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPaginatedGbpLocations includes required readMask and paginates results', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    if (!url.includes('pageToken=')) {
      return makeJsonResponse({
        locations: [
          {
            name: 'locations/loc-1',
            title: 'Downtown Cafe',
            storeCode: 'DT-01',
            storefrontAddress: {
              addressLines: ['123 Main St'],
              locality: 'Austin',
              administrativeArea: 'TX',
              postalCode: '78701',
            },
            metadata: { placeId: 'ChIJ123' },
          },
        ],
        nextPageToken: 'loc-page-2',
      });
    }
    return makeJsonResponse({
      locations: [
        {
          name: 'locations/loc-2',
          title: 'Uptown Cafe',
          storeCode: 'UT-02',
        },
      ],
    });
  }) as typeof fetch;

  try {
    const locations = await fetchPaginatedGbpLocations('ya29.fake-access', 'accounts/111');
    assert.equal(locations.length, 2);
    assert.ok(requestedUrls[0].includes('readMask='));
    assert.ok(decodeURIComponent(requestedUrls[0]).includes('name,title,storeCode,storefrontAddress,metadata'));
    assert.equal(locations[0].title, 'Downtown Cafe');
    assert.equal(locations[0].storeCode, 'DT-01');
    assert.match(locations[0].address ?? '', /123 Main St/);
    assert.equal(locations[0].placeId, 'ChIJ123');
    assert.equal(locations[1].title, 'Uptown Cafe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('configureAccountPubSubNotifications detects foreign topic conflict without overwriting and merges types on patch', async () => {
  const originalFetch = globalThis.fetch;
  const prevTopic = process.env.GBP_PUBSUB_TOPIC;
  const prevProject = process.env.GOOGLE_CLOUD_PROJECT;
  process.env.GBP_PUBSUB_TOPIC = 'reviewflow-google-reviews';
  process.env.GOOGLE_CLOUD_PROJECT = 'reviewflow-proj';

  try {
    // Case 1: Foreign Pub/Sub topic already configured -> conflict, NO PATCH issued
    const calls1: Array<{ method: string; url: string; body?: string }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      calls1.push({ method, url, body: typeof init?.body === 'string' ? init.body : undefined });
      return makeJsonResponse({
        name: 'accounts/111/notificationSetting',
        pubsubTopic: 'projects/other-vendor/topics/their-topic',
        notificationTypes: ['NEW_REVIEW'],
      });
    }) as typeof fetch;

    const conflictResult = await configureAccountPubSubNotifications({
      accessToken: 'ya29.fake-access',
      accountName: 'accounts/111',
      replaceExistingTopic: false,
    });
    assert.equal(conflictResult.status, 'conflict');
    assert.equal(conflictResult.existingTopic, 'projects/other-vendor/topics/their-topic');
    assert.equal(calls1.length, 1);
    assert.equal(calls1[0].method, 'GET');

    // Case 2: Empty or confirmed replace -> merges EXISTING_EVENT + NEW_REVIEW + UPDATED_REVIEW via PATCH
    const calls2: Array<{ method: string; url: string; body?: string }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      const bodyStr = typeof init?.body === 'string' ? init.body : undefined;
      calls2.push({ method, url, body: bodyStr });
      if (method === 'GET') {
        return makeJsonResponse({
          name: 'accounts/111/notificationSetting',
          pubsubTopic: 'projects/reviewflow-proj/topics/reviewflow-google-reviews',
          notificationTypes: ['EXISTING_EVENT', 'NEW_REVIEW'],
        });
      }
      const parsed = bodyStr ? JSON.parse(bodyStr) : {};
      return makeJsonResponse({
        name: 'accounts/111/notificationSetting',
        pubsubTopic: parsed.pubsubTopic,
        notificationTypes: parsed.notificationTypes,
      });
    }) as typeof fetch;

    const okResult = await configureAccountPubSubNotifications({
      accessToken: 'ya29.fake-access',
      accountName: 'accounts/111',
      replaceExistingTopic: false,
    });
    assert.equal(okResult.status, 'enabled');
    assert.equal(okResult.pubsubTopic, 'projects/reviewflow-proj/topics/reviewflow-google-reviews');
    assert.ok(okResult.notificationTypes.includes('EXISTING_EVENT'));
    assert.ok(okResult.notificationTypes.includes('NEW_REVIEW'));
    assert.ok(okResult.notificationTypes.includes('UPDATED_REVIEW'));
    assert.equal(calls2.length, 2);
    assert.equal(calls2[1].method, 'PATCH');
  } finally {
    globalThis.fetch = originalFetch;
    if (prevTopic === undefined) delete process.env.GBP_PUBSUB_TOPIC;
    else process.env.GBP_PUBSUB_TOPIC = prevTopic;
    if (prevProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = prevProject;
  }
});

test('assertAuthorizedForBusiness enforces business-level Firestore isolation', async () => {
  const originalFetch = globalThis.fetch;
  const prevSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: 'reviewflow-test',
    client_email: 'sa@reviewflow-test.iam.gserviceaccount.com',
    private_key: pem,
  });

  globalThis.fetch = (async (input: string | URL | Request) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = decodeURIComponent(rawUrl);
    if (url.includes('oauth2.googleapis.com/token')) {
      return makeJsonResponse({ access_token: 'sa-firestore-token', expires_in: 3600 });
    }
    if (url.includes('/businesses/biz-owner-1')) {
      return makeJsonResponse({
        name: 'projects/reviewflow-test/databases/(default)/documents/businesses/biz-owner-1',
        fields: {
          ownerId: { stringValue: 'uid-owner-1' },
          clientEmail: { stringValue: 'client@biz1.com' },
          planTier: { stringValue: 'full' },
        },
      });
    }
    if (url.includes('/users/uid-other-user')) {
      return makeJsonResponse({ error: { status: 'NOT_FOUND' } }, 404);
    }
    return makeJsonResponse({ error: { status: 'NOT_FOUND' } }, 404);
  }) as typeof fetch;

  try {
    // Reject cross-tenant / non-owner non-client user
    const denied = await assertAuthorizedForBusiness('biz-owner-1', {
      uid: 'uid-other-user',
      email: 'attacker@other.com',
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 403);
    }

    // Reject path traversal / invalid businessId
    const invalidId = await assertAuthorizedForBusiness('../other-biz', {
      uid: 'uid-owner-1',
      email: 'owner@biz1.com',
    });
    assert.equal(invalidId.ok, false);
    if (!invalidId.ok) {
      assert.equal(invalidId.status, 400);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (prevSa === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevSa;
  }
});

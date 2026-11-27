import crypto from 'node:crypto';
import {
  AI_PROVIDER,
  FIREBASE_DATABASE_ID,
  FIREBASE_PROJECT_ID,
  GEMINI_MODEL,
  cleanSecretEnv,
  fetchWithTimeout,
  getServiceAccountFirestoreToken,
  processGbpProxy,
  processGenerateReply,
  sanitizeApiErrorDetail,
} from './apiCore.js';

export const GBP_OAUTH_SCOPE =
  'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email openid';
const DEFAULT_SHARED_PUBSUB_TOPIC_NAME = 'reviewflow-google-reviews';

export interface GbpAccountInfo {
  name: string;
  accountName: string;
  type: string;
  verificationState: string;
  vettedState: string;
  role: string;
}

export interface GbpLocationInfo {
  accountName: string;
  locationName: string;
  title: string;
  address: string;
  storeCode: string;
  placeId: string;
  hasVoiceOfMerchant?: boolean;
  hasPendingEdits?: boolean;
}

interface EncryptedTokenEnvelope {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

interface DecryptedGbpTokens {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  scope: string;
  connectedEmail: string;
}

interface FirestoreFieldValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  mapValue?: { fields?: Record<string, FirestoreFieldValue> };
  arrayValue?: { values?: FirestoreFieldValue[] };
}

function getFsBase(): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIREBASE_DATABASE_ID)}/documents`;
}

function deriveAes256Key(rawSecret: string): Buffer {
  const clean = rawSecret.trim();
  if (/^[0-9a-f]{64}$/i.test(clean)) {
    return Buffer.from(clean, 'hex');
  }
  return crypto.createHash('sha256').update(clean, 'utf-8').digest();
}

export function getEncryptionKeyOrThrow(): Buffer {
  const raw = cleanSecretEnv(process.env.GBP_TOKEN_ENCRYPTION_KEY);
  if (!raw || raw.length < 16) {
    throw new Error(
      'Server configuration error: GBP_TOKEN_ENCRYPTION_KEY (at least 16 characters, or 64-char hex) must be set in server environment variables.',
    );
  }
  return deriveAes256Key(raw);
}

export function encryptTokenPayload(payload: DecryptedGbpTokens, keyOverride?: Buffer): EncryptedTokenEnvelope {
  const key = keyOverride ?? getEncryptionKeyOrThrow();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export function decryptTokenPayload(
  envelope: EncryptedTokenEnvelope,
  keyOverride?: Buffer,
): DecryptedGbpTokens {
  const key = keyOverride ?? getEncryptionKeyOrThrow();
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
  const parsed = JSON.parse(decrypted) as Partial<DecryptedGbpTokens>;
  return {
    accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : '',
    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : '',
    expiresAtMs: typeof parsed.expiresAtMs === 'number' ? parsed.expiresAtMs : 0,
    scope: typeof parsed.scope === 'string' ? parsed.scope : '',
    connectedEmail: typeof parsed.connectedEmail === 'string' ? parsed.connectedEmail : '',
  };
}

export function resolveSharedPubSubTopic(): string {
  const configured = cleanSecretEnv(process.env.GBP_PUBSUB_TOPIC);
  const project =
    cleanSecretEnv(process.env.GOOGLE_CLOUD_PROJECT) ||
    cleanSecretEnv(process.env.GCP_PROJECT_ID) ||
    FIREBASE_PROJECT_ID;
  if (configured) {
    if (configured.startsWith('projects/')) return configured;
    return `projects/${project}/topics/${configured.replace(/^topics\//, '')}`;
  }
  return `projects/${project}/topics/${DEFAULT_SHARED_PUBSUB_TOPIC_NAME}`;
}

export function resolveOAuthClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId =
    cleanSecretEnv(process.env.GOOGLE_OAUTH_CLIENT_ID) ||
    cleanSecretEnv(process.env.VITE_GOOGLE_OAUTH_CLIENT_ID);
  const clientSecret = cleanSecretEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  if (!clientId) {
    throw new Error(
      'Google OAuth Client ID is not configured on the server (set GOOGLE_OAUTH_CLIENT_ID in environment variables).',
    );
  }
  if (!clientSecret) {
    throw new Error(
      'Google OAuth Client Secret is not configured on the server (set GOOGLE_OAUTH_CLIENT_SECRET in environment variables — never prefix with VITE_).',
    );
  }
  return { clientId, clientSecret };
}

export function resolveOAuthRedirectUri(requestOrigin: string): string {
  const explicit = cleanSecretEnv(process.env.GBP_OAUTH_REDIRECT_URI);
  if (explicit) return explicit;
  const cleanOrigin = requestOrigin.trim().replace(/\/+$/, '');
  return `${cleanOrigin}/api/gbp-oauth/callback`;
}

function sanitizeReturnPath(rawPath?: string): string {
  const clean = (rawPath || '').trim();
  if (clean === '/admin' || clean.startsWith('/admin?')) return clean.split('?')[0];
  return '/portal';
}

function readFsStr(fields: Record<string, FirestoreFieldValue> | undefined, key: string): string {
  const v = fields?.[key]?.stringValue;
  return typeof v === 'string' ? v.trim() : '';
}

function readFsBool(
  fields: Record<string, FirestoreFieldValue> | undefined,
  key: string,
  fallback = false,
): boolean {
  const v = fields?.[key]?.booleanValue;
  return typeof v === 'boolean' ? v : fallback;
}

function readFsInt(fields: Record<string, FirestoreFieldValue> | undefined, key: string): number {
  const raw = fields?.[key]?.integerValue ?? fields?.[key]?.doubleValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function requireServiceToken(): Promise<string> {
  const token = await getServiceAccountFirestoreToken();
  if (!token) {
    throw new Error(
      'Server-side Firestore credential missing: set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel/server environment variables so ReviewFlow can store encrypted OAuth credentials securely.',
    );
  }
  return token;
}

async function fsGetDoc(
  serviceToken: string,
  collection: string,
  docId: string,
): Promise<{ exists: boolean; fields?: Record<string, FirestoreFieldValue> }> {
  const res = await fetchWithTimeout(
    `${getFsBase()}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
    { headers: { Authorization: `Bearer ${serviceToken}` } },
    8000,
  );
  if (res.status === 404) return { exists: false };
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firestore read (${collection}) failed (${res.status}): ${sanitizeApiErrorDetail(errText)}`);
  }
  const json = (await res.json()) as { fields?: Record<string, FirestoreFieldValue> };
  return { exists: true, fields: json.fields };
}

async function fsSetOrPatchDoc(
  serviceToken: string,
  collection: string,
  docId: string,
  fields: Record<string, FirestoreFieldValue>,
  updateMask?: string[],
): Promise<void> {
  const params = new URLSearchParams();
  if (updateMask && updateMask.length > 0) {
    for (const m of updateMask) {
      params.append('updateMask.fieldPaths', m);
    }
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(
    `${getFsBase()}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}${qs}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({ fields }),
    },
    8000,
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Firestore write (${collection}) failed (${res.status}): ${sanitizeApiErrorDetail(errText)}`);
  }
}

async function fsDeleteDoc(
  serviceToken: string,
  collection: string,
  docId: string,
): Promise<void> {
  await fetchWithTimeout(
    `${getFsBase()}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${serviceToken}` },
    },
    8000,
  ).catch(() => null);
}

export interface AuthorizedBusinessRecord {
  businessId: string;
  ownerId: string;
  clientEmail: string;
  slug: string;
  name: string;
  category: string;
  gbpSettings: {
    fiveStarMode: 'auto_publish' | 'approval_required';
    midStarMode: 'auto_publish' | 'approval_required';
    brandVoice: string;
    autoSyncEnabled: boolean;
  };
}

export function isCallerAuthorizedForBusinessRecord(input: {
  callerUid: string;
  callerEmail: string;
  isAdmin: boolean;
  ownerId: string;
  clientEmail: string;
  accessLevel: string;
}): boolean {
  if (input.isAdmin) return true;
  const callerEmail = (input.callerEmail || '').trim().toLowerCase();
  const clientEmail = (input.clientEmail || '').trim().toLowerCase();
  const isSelfOwned = Boolean(
    input.ownerId &&
      input.ownerId === input.callerUid &&
      (!clientEmail || (callerEmail && clientEmail === callerEmail)),
  );
  const isAssignedFullClient = Boolean(
    callerEmail && clientEmail && clientEmail === callerEmail && input.accessLevel === 'full',
  );
  return isSelfOwned || isAssignedFullClient;
}

export async function assertAuthorizedForBusiness(
  businessId: string,
  caller: { uid: string; email: string },
): Promise<{ ok: true; business: AuthorizedBusinessRecord } | { ok: false; status: number; error: string }> {
  const cleanBizId = (businessId || '').trim();
  if (!cleanBizId || !/^[a-zA-Z0-9_-]{1,128}$/.test(cleanBizId)) {
    return { ok: false, status: 400, error: 'A valid ReviewFlow businessId is required.' };
  }

  let serviceToken: string;
  try {
    serviceToken = await requireServiceToken();
  } catch (err) {
    return {
      ok: false,
      status: 503,
      error: err instanceof Error ? err.message : 'Server configuration missing.',
    };
  }

  const bizDoc = await fsGetDoc(serviceToken, 'businesses', cleanBizId);
  if (!bizDoc.exists || !bizDoc.fields) {
    return { ok: false, status: 404, error: 'Business profile not found.' };
  }

  const bf = bizDoc.fields;
  const ownerId = readFsStr(bf, 'ownerId');
  const clientEmail = readFsStr(bf, 'clientEmail').toLowerCase();
  const slug = readFsStr(bf, 'slug');
  const accessLevel = readFsStr(bf, 'clientAccessLevel') || 'full';
  const callerEmail = (caller.email || '').trim().toLowerCase();

  const superAdminEnv = cleanSecretEnv(process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '');
  const envAdminSet = new Set(
    superAdminEnv
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  let isAdmin = Boolean(callerEmail && envAdminSet.has(callerEmail));
  if (!isAdmin) {
    const [adminUidDoc, adminEmailDoc] = await Promise.all([
      fsGetDoc(serviceToken, 'admins', caller.uid).catch(() => ({ exists: false })),
      callerEmail
        ? fsGetDoc(serviceToken, 'adminEmails', callerEmail).catch(() => ({ exists: false }))
        : Promise.resolve({ exists: false }),
    ]);
    isAdmin = adminUidDoc.exists || adminEmailDoc.exists;
  }

  if (
    !isCallerAuthorizedForBusinessRecord({
      callerUid: caller.uid,
      callerEmail,
      isAdmin,
      ownerId,
      clientEmail,
      accessLevel,
    })
  ) {
    return {
      ok: false,
      status: 403,
      error:
        'Permission denied: your account does not have Full Self-Service or owner access to manage Google Business Profile connections for this business.',
    };
  }

  const gbpMap = bf.gbpSettings?.mapValue?.fields;
  return {
    ok: true,
    business: {
      businessId: cleanBizId,
      ownerId,
      clientEmail,
      slug,
      name: readFsStr(bf, 'name') || 'Business',
      category: readFsStr(bf, 'category'),
      gbpSettings: {
        fiveStarMode:
          readFsStr(gbpMap, 'fiveStarMode') === 'approval_required'
            ? 'approval_required'
            : 'auto_publish',
        midStarMode:
          readFsStr(gbpMap, 'midStarMode') === 'auto_publish'
            ? 'auto_publish'
            : 'approval_required',
        brandVoice: readFsStr(gbpMap, 'brandVoice'),
        autoSyncEnabled: readFsBool(gbpMap, 'autoSyncEnabled', true),
      },
    },
  };
}

export function classifyGbpApiError(status: number, rawBody: string, contextLabel: string): string {
  const detail = sanitizeApiErrorDetail(rawBody);
  const lower = detail.toLowerCase();

  if (status === 401 || lower.includes('invalid_grant') || lower.includes('token has been expired or revoked')) {
    return 'Your Google authorization expired or was revoked. Please click "Connect Google Business Profile" to re-authorize.';
  }
  if (lower.includes('quota') || lower.includes('rate limit') || status === 429) {
    return `Google Business Profile API access pending or rate-limited (${status}): ${detail || 'API quota is currently 0 or throttled in Google Cloud Console. Ensure My Business Account Management, Business Information, Notifications, and My Business v4 API access is approved.'}`;
  }
  if (
    status === 403 &&
    (lower.includes('has not been used in project') ||
      lower.includes('it is disabled') ||
      lower.includes('insufficient') ||
      lower.includes('permission'))
  ) {
    return `Google Business Profile API permission error while ${contextLabel}: ${detail}. Verify My Business Account Management API, My Business Business Information API, and My Business Notifications API are enabled and the business.manage scope was granted.`;
  }
  if (lower.includes('unverified') || lower.includes('voice of merchant')) {
    return `Google Business Profile verification issue: ${detail}. Please verify ownership of this location in Google Business Profile Manager first.`;
  }
  return `Google Business Profile API (${status}) while ${contextLabel}: ${detail || 'Unexpected error.'}`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
  maxRetries = 2,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fetchWithTimeout(url, init, timeoutMs);
    if (res.ok || (res.status !== 429 && res.status < 500) || attempt === maxRetries) {
      return res;
    }
    lastRes = res;
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
  }
  return lastRes as Response;
}

export async function startGbpOAuthFlow(input: {
  businessId: string;
  caller: { uid: string; email: string };
  requestOrigin: string;
  returnPath?: string;
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) {
    return { status: authCheck.status, data: { error: authCheck.error } };
  }

  let clientId: string;
  let redirectUri: string;
  let serviceToken: string;
  try {
    const creds = resolveOAuthClientCredentials();
    clientId = creds.clientId;
    getEncryptionKeyOrThrow();
    serviceToken = await requireServiceToken();
    redirectUri = resolveOAuthRedirectUri(input.requestOrigin);
  } catch (err) {
    return {
      status: 503,
      data: { error: err instanceof Error ? err.message : 'OAuth configuration incomplete.' },
    };
  }

  const rawState = crypto.randomBytes(32).toString('hex');
  const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');
  const nowMs = Date.now();
  const expiresAtMs = nowMs + 10 * 60 * 1000;
  const cleanOrigin = input.requestOrigin.trim().replace(/\/+$/, '');
  const cleanReturnPath = sanitizeReturnPath(input.returnPath);

  await fsSetOrPatchDoc(serviceToken, 'gbpOAuthStates', stateHash, {
    stateHash: { stringValue: stateHash },
    businessId: { stringValue: authCheck.business.businessId },
    uid: { stringValue: input.caller.uid },
    email: { stringValue: input.caller.email.toLowerCase() },
    returnOrigin: { stringValue: cleanOrigin },
    returnPath: { stringValue: cleanReturnPath },
    redirectUri: { stringValue: redirectUri },
    used: { booleanValue: false },
    expiresAtMs: { integerValue: String(expiresAtMs) },
    createdAt: { timestampValue: new Date(nowMs).toISOString() },
  });

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GBP_OAUTH_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account consent',
    state: rawState,
  });

  return {
    status: 200,
    data: {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`,
      redirectUri,
    },
  };
}

async function saveEncryptedTokensToVault(
  serviceToken: string,
  input: {
    businessId: string;
    ownerId: string;
    tokens: DecryptedGbpTokens;
  },
): Promise<void> {
  const envelope = encryptTokenPayload(input.tokens);
  const nowIso = new Date().toISOString();
  await fsSetOrPatchDoc(serviceToken, 'gbpTokenVault', input.businessId, {
    businessId: { stringValue: input.businessId },
    ownerId: { stringValue: input.ownerId },
    connectedEmail: { stringValue: input.tokens.connectedEmail.slice(0, 120) },
    hasRefreshToken: { booleanValue: Boolean(input.tokens.refreshToken) },
    expiresAtMs: { integerValue: String(Math.round(input.tokens.expiresAtMs)) },
    v: { integerValue: '1' },
    iv: { stringValue: envelope.iv },
    tag: { stringValue: envelope.tag },
    ciphertext: { stringValue: envelope.ciphertext },
    updatedAt: { timestampValue: nowIso },
  });
}

async function readDecryptedTokensFromVault(
  serviceToken: string,
  businessId: string,
): Promise<DecryptedGbpTokens | null> {
  const docSnap = await fsGetDoc(serviceToken, 'gbpTokenVault', businessId);
  if (!docSnap.exists || !docSnap.fields) return null;
  const iv = readFsStr(docSnap.fields, 'iv');
  const tag = readFsStr(docSnap.fields, 'tag');
  const ciphertext = readFsStr(docSnap.fields, 'ciphertext');
  if (!iv || !tag || !ciphertext) return null;
  return decryptTokenPayload({ v: 1, iv, tag, ciphertext });
}

function buildSelectedLocationsArrayValue(locs: GbpLocationInfo[]): FirestoreFieldValue {
  return {
    arrayValue: {
      values: locs.slice(0, 50).map((loc) => ({
        mapValue: {
          fields: {
            accountName: { stringValue: loc.accountName.slice(0, 160) },
            locationName: { stringValue: loc.locationName.slice(0, 200) },
            title: { stringValue: loc.title.slice(0, 160) },
            address: { stringValue: (loc.address || '').slice(0, 240) },
            storeCode: { stringValue: (loc.storeCode || '').slice(0, 64) },
            placeId: { stringValue: (loc.placeId || '').slice(0, 120) },
          },
        },
      })),
    },
  };
}

function readSelectedLocationsFromFields(
  fields: Record<string, FirestoreFieldValue> | undefined,
): GbpLocationInfo[] {
  const values = fields?.selectedLocations?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => v.mapValue?.fields)
    .filter((f): f is Record<string, FirestoreFieldValue> => Boolean(f))
    .map((f) => ({
      accountName: readFsStr(f, 'accountName'),
      locationName: readFsStr(f, 'locationName'),
      title: readFsStr(f, 'title'),
      address: readFsStr(f, 'address'),
      storeCode: readFsStr(f, 'storeCode'),
      placeId: readFsStr(f, 'placeId'),
    }))
    .filter((l) => Boolean(l.locationName));
}

async function upsertGbpConnectionMetadata(
  serviceToken: string,
  businessId: string,
  ownerId: string,
  clientEmail: string,
  updates: Partial<{
    connectionStatus: 'disconnected' | 'connected' | 'pending_api_approval';
    connectedEmail: string;
    accountName: string;
    locationName: string;
    locationTitle: string;
    placeId: string;
    selectedLocations: GbpLocationInfo[];
    notificationStatus: 'enabled' | 'not_configured' | 'conflict' | 'error';
    notificationTopic: string;
    notificationTypes: string[];
    notificationError: string;
    tokenStatus: 'valid' | 'expired_or_revoked' | 'none';
    touchSyncedAt: boolean;
  }>,
): Promise<void> {
  const existing = await fsGetDoc(serviceToken, 'gbpConnections', businessId);
  const nowIso = new Date().toISOString();
  const ef = existing.fields;

  const nextFields: Record<string, FirestoreFieldValue> = {
    businessId: { stringValue: businessId },
    ownerId: { stringValue: readFsStr(ef, 'ownerId') || ownerId },
    clientEmail: { stringValue: (readFsStr(ef, 'clientEmail') || clientEmail).toLowerCase().slice(0, 120) },
    connectionStatus: {
      stringValue: updates.connectionStatus ?? (readFsStr(ef, 'connectionStatus') || 'disconnected'),
    },
    connectedEmail: {
      stringValue: (updates.connectedEmail !== undefined ? updates.connectedEmail : readFsStr(ef, 'connectedEmail')).slice(0, 120),
    },
    accountName: {
      stringValue: (updates.accountName !== undefined ? updates.accountName : readFsStr(ef, 'accountName')).slice(0, 160),
    },
    locationName: {
      stringValue: (updates.locationName !== undefined ? updates.locationName : readFsStr(ef, 'locationName')).slice(0, 200),
    },
    locationTitle: {
      stringValue: (updates.locationTitle !== undefined ? updates.locationTitle : readFsStr(ef, 'locationTitle')).slice(0, 160),
    },
    placeId: {
      stringValue: (updates.placeId !== undefined ? updates.placeId : readFsStr(ef, 'placeId')).slice(0, 120),
    },
    createdAt: { timestampValue: ef?.createdAt?.timestampValue || nowIso },
    updatedAt: { timestampValue: nowIso },
  };

  const selectedLocs =
    updates.selectedLocations !== undefined
      ? updates.selectedLocations
      : readSelectedLocationsFromFields(ef);
  if (selectedLocs.length > 0 || updates.selectedLocations !== undefined) {
    nextFields.selectedLocations = buildSelectedLocationsArrayValue(selectedLocs);
  }

  const notifStatus =
    updates.notificationStatus ?? readFsStr(ef, 'notificationStatus');
  if (notifStatus) {
    nextFields.notificationStatus = { stringValue: notifStatus };
  }
  const notifTopic =
    updates.notificationTopic !== undefined
      ? updates.notificationTopic
      : readFsStr(ef, 'notificationTopic');
  if (notifTopic !== undefined && notifTopic !== '') {
    nextFields.notificationTopic = { stringValue: notifTopic.slice(0, 300) };
  }
  const notifTypes =
    updates.notificationTypes ??
    (ef?.notificationTypes?.arrayValue?.values || [])
      .map((v) => v.stringValue || '')
      .filter(Boolean);
  if (notifTypes.length > 0 || updates.notificationTypes !== undefined) {
    nextFields.notificationTypes = {
      arrayValue: { values: notifTypes.slice(0, 20).map((t) => ({ stringValue: t })) },
    };
  }
  const notifErr =
    updates.notificationError !== undefined
      ? updates.notificationError
      : readFsStr(ef, 'notificationError');
  if (notifErr) {
    nextFields.notificationError = { stringValue: notifErr.slice(0, 400) };
  }

  const tokStatus = updates.tokenStatus ?? readFsStr(ef, 'tokenStatus');
  if (tokStatus) {
    nextFields.tokenStatus = { stringValue: tokStatus };
  }
  if (updates.touchSyncedAt) {
    nextFields.lastSyncedAt = { timestampValue: nowIso };
  } else if (ef?.lastSyncedAt?.timestampValue) {
    nextFields.lastSyncedAt = { timestampValue: ef.lastSyncedAt.timestampValue };
  }

  await fsSetOrPatchDoc(serviceToken, 'gbpConnections', businessId, nextFields);
}

function decodeEmailFromIdToken(idToken?: string): string {
  if (!idToken || idToken.split('.').length !== 3) return '';
  try {
    const padded = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as {
      email?: string;
    };
    return typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

export async function fetchPaginatedGbpAccounts(accessToken: string): Promise<GbpAccountInfo[]> {
  const accounts: GbpAccountInfo[] = [];
  let pageToken = '';
  for (let page = 0; page < 25; page += 1) {
    const params = new URLSearchParams({ pageSize: '20' });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetchWithRetry(
      `https://mybusinessaccountmanagement.googleapis.com/v1/accounts?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      10_000,
    );
    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(classifyGbpApiError(res.status, bodyText, 'listing Google Business Profile accounts'));
    }
    const json = JSON.parse(bodyText) as {
      accounts?: Array<{
        name?: string;
        accountName?: string;
        type?: string;
        verificationState?: string;
        vettedState?: string;
        role?: string;
      }>;
      nextPageToken?: string;
    };
    for (const acc of json.accounts || []) {
      if (!acc.name) continue;
      accounts.push({
        name: acc.name,
        accountName: acc.accountName || acc.name,
        type: acc.type || 'PERSONAL',
        verificationState: acc.verificationState || 'VERIFICATION_STATE_UNSPECIFIED',
        vettedState: acc.vettedState || '',
        role: acc.role || '',
      });
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return accounts;
}

export async function fetchPaginatedGbpLocations(
  accessToken: string,
  accountName: string,
): Promise<GbpLocationInfo[]> {
  if (!/^accounts\/[a-zA-Z0-9_-]+$/.test(accountName)) {
    throw new Error('Invalid Google Business Profile account resource name.');
  }
  const locations: GbpLocationInfo[] = [];
  let pageToken = '';
  for (let page = 0; page < 25; page += 1) {
    const params = new URLSearchParams({
      readMask: 'name,title,storeCode,storefrontAddress,metadata',
      pageSize: '100',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetchWithRetry(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      10_000,
    );
    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(
        classifyGbpApiError(res.status, bodyText, 'listing Google Business Profile locations'),
      );
    }
    const json = JSON.parse(bodyText) as {
      locations?: Array<{
        name?: string;
        title?: string;
        storeCode?: string;
        storefrontAddress?: {
          addressLines?: string[];
          locality?: string;
          administrativeArea?: string;
          postalCode?: string;
          regionCode?: string;
        };
        metadata?: {
          placeId?: string;
          hasVoiceOfMerchant?: boolean;
          hasPendingEdits?: boolean;
        };
      }>;
      nextPageToken?: string;
    };
    for (const loc of json.locations || []) {
      if (!loc.name) continue;
      const fullLocationName = loc.name.startsWith('accounts/')
        ? loc.name
        : `${accountName}/${loc.name}`;
      const addr = loc.storefrontAddress;
      const formattedAddress = addr
        ? [
            ...(Array.isArray(addr.addressLines) ? addr.addressLines : []),
            addr.locality || '',
            addr.administrativeArea || '',
            addr.postalCode || '',
          ]
            .map((s) => s.trim())
            .filter(Boolean)
            .join(', ')
        : '';
      locations.push({
        accountName,
        locationName: fullLocationName,
        title: loc.title || fullLocationName,
        address: formattedAddress,
        storeCode: (loc.storeCode || '').trim(),
        placeId: (loc.metadata?.placeId || '').trim(),
        hasVoiceOfMerchant: loc.metadata?.hasVoiceOfMerchant,
        hasPendingEdits: loc.metadata?.hasPendingEdits,
      });
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return locations;
}

export async function handleGbpOAuthCallback(input: {
  code?: string;
  state?: string;
  oauthError?: string;
  oauthErrorDescription?: string;
}): Promise<{ redirectUrl: string }> {
  const fallbackReturn = '/portal';
  const rawState = (input.state || '').trim();
  if (!rawState) {
    return {
      redirectUrl: `${fallbackReturn}?gbp_oauth=error&gbp_error=${encodeURIComponent(
        'Missing OAuth CSRF state parameter. Please click Connect Google Business Profile again.',
      )}`,
    };
  }

  let serviceToken: string;
  try {
    serviceToken = await requireServiceToken();
  } catch (err) {
    return {
      redirectUrl: `${fallbackReturn}?gbp_oauth=error&gbp_error=${encodeURIComponent(
        err instanceof Error ? err.message : 'Server configuration missing.',
      )}`,
    };
  }

  const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');
  const stateDoc = await fsGetDoc(serviceToken, 'gbpOAuthStates', stateHash);
  if (!stateDoc.exists || !stateDoc.fields) {
    return {
      redirectUrl: `${fallbackReturn}?gbp_oauth=error&gbp_error=${encodeURIComponent(
        'Invalid or already-used OAuth state. Please start the Google connection again.',
      )}`,
    };
  }

  const sf = stateDoc.fields;
  const businessId = readFsStr(sf, 'businessId');
  const returnOrigin = readFsStr(sf, 'returnOrigin');
  const returnPath = sanitizeReturnPath(readFsStr(sf, 'returnPath'));
  const redirectUri = readFsStr(sf, 'redirectUri');
  const alreadyUsed = readFsBool(sf, 'used', true);
  const expiresAtMs = readFsInt(sf, 'expiresAtMs');
  const targetBase = returnOrigin ? `${returnOrigin}${returnPath}` : returnPath;

  // Enforce single-use CSRF state immediately before exchanging authorization code
  await fsDeleteDoc(serviceToken, 'gbpOAuthStates', stateHash);

  if (alreadyUsed || !expiresAtMs || Date.now() > expiresAtMs) {
    return {
      redirectUrl: `${targetBase}?gbp_oauth=error&businessId=${encodeURIComponent(businessId)}&gbp_error_code=oauth_state_expired`,
    };
  }

  if (input.oauthError) {
    const codeKey =
      input.oauthError === 'access_denied' ? 'access_denied' : 'google_oauth_rejected';
    return {
      redirectUrl: `${targetBase}?gbp_oauth=error&businessId=${encodeURIComponent(businessId)}&gbp_error_code=${codeKey}`,
    };
  }

  const code = (input.code || '').trim();
  if (!code) {
    return {
      redirectUrl: `${targetBase}?gbp_oauth=error&businessId=${encodeURIComponent(businessId)}&gbp_error_code=missing_code`,
    };
  }

  try {
    const { clientId, clientSecret } = resolveOAuthClientCredentials();
    const tokenRes = await fetchWithTimeout(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      },
      10_000,
    );
    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(
        `Google token exchange failed (${tokenRes.status}): ${sanitizeApiErrorDetail(tokenText)}`,
      );
    }

    const tokenJson = JSON.parse(tokenText) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id_token?: string;
    };
    const accessToken = (tokenJson.access_token || '').trim();
    if (!accessToken) {
      throw new Error('Google did not return an OAuth access token.');
    }

    const grantedScope = (tokenJson.scope || '').trim();
    if (grantedScope && !grantedScope.includes('business.manage')) {
      return {
        redirectUrl: `${targetBase}?gbp_oauth=error&businessId=${encodeURIComponent(
          businessId,
        )}&gbp_error_code=missing_scope`,
      };
    }

    let connectedEmail = decodeEmailFromIdToken(tokenJson.id_token);
    if (!connectedEmail) {
      const uiRes = await fetchWithTimeout(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        { headers: { Authorization: `Bearer ${accessToken}` } },
        6000,
      ).catch(() => null);
      if (uiRes?.ok) {
        const uiJson = (await uiRes.json()) as { email?: string };
        connectedEmail = (uiJson.email || '').trim().toLowerCase();
      }
    }

    const bizSnap = await fsGetDoc(serviceToken, 'businesses', businessId);
    const ownerId = readFsStr(bizSnap.fields, 'ownerId');
    const clientEmail = readFsStr(bizSnap.fields, 'clientEmail');

    // Requirement #9 & Security: Preserve existing refresh_token when Google does not return a new one
    const existingVault = await readDecryptedTokensFromVault(serviceToken, businessId).catch(
      () => null,
    );
    const preservedRefreshToken =
      (tokenJson.refresh_token || '').trim() || existingVault?.refreshToken || '';

    const expiresInSec = Number(tokenJson.expires_in) || 3500;
    await saveEncryptedTokensToVault(serviceToken, {
      businessId,
      ownerId,
      tokens: {
        accessToken,
        refreshToken: preservedRefreshToken,
        expiresAtMs: Date.now() + expiresInSec * 1000,
        scope: grantedScope || GBP_OAUTH_SCOPE,
        connectedEmail: connectedEmail || existingVault?.connectedEmail || '',
      },
    });

    // Do not claim connected until Google Business Profile API confirms access
    try {
      const accounts = await fetchPaginatedGbpAccounts(accessToken);
      await upsertGbpConnectionMetadata(serviceToken, businessId, ownerId, clientEmail, {
        connectionStatus: 'connected',
        connectedEmail: connectedEmail || existingVault?.connectedEmail || '',
        tokenStatus: 'valid',
        accountName: accounts[0]?.name || '',
        locationTitle:
          accounts.length === 0
            ? 'No GBP accounts found on this Google account'
            : undefined,
      });

      return {
        redirectUrl: `${targetBase}?gbp_oauth=connected&businessId=${encodeURIComponent(
          businessId,
        )}&accounts=${accounts.length}`,
      };
    } catch (apiErr) {
      const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
      await upsertGbpConnectionMetadata(serviceToken, businessId, ownerId, clientEmail, {
        connectionStatus: 'pending_api_approval',
        connectedEmail: connectedEmail || existingVault?.connectedEmail || '',
        tokenStatus: 'valid',
        notificationError: msg,
      });
      return {
        redirectUrl: `${targetBase}?gbp_oauth=pending_api_approval&businessId=${encodeURIComponent(
          businessId,
        )}&gbp_error_code=api_pending_approval`,
      };
    }
  } catch (err) {
    console.error('GBP callback token exchange error:', sanitizeApiErrorDetail(err instanceof Error ? err.message : String(err)));
    return {
      redirectUrl: `${targetBase}?gbp_oauth=error&businessId=${encodeURIComponent(
        businessId,
      )}&gbp_error_code=callback_failed`,
    };
  }
}

export async function getValidGbpAccessToken(
  businessId: string,
  forceRefresh = false,
): Promise<{ accessToken: string; connectedEmail: string }> {
  const serviceToken = await requireServiceToken();
  const vault = await readDecryptedTokensFromVault(serviceToken, businessId);
  if (!vault || (!vault.accessToken && !vault.refreshToken)) {
    throw new Error(
      'Google Business Profile is not connected for this business yet. Click "Connect Google Business Profile" first.',
    );
  }

  if (!forceRefresh && vault.accessToken && Date.now() < vault.expiresAtMs - 60_000) {
    return { accessToken: vault.accessToken, connectedEmail: vault.connectedEmail };
  }

  if (!vault.refreshToken) {
    const bizSnap = await fsGetDoc(serviceToken, 'businesses', businessId);
    await upsertGbpConnectionMetadata(
      serviceToken,
      businessId,
      readFsStr(bizSnap.fields, 'ownerId'),
      readFsStr(bizSnap.fields, 'clientEmail'),
      { connectionStatus: 'disconnected', tokenStatus: 'expired_or_revoked' },
    );
    throw new Error(
      'Google session expired and no refresh token was available. Please reconnect your Google Business Profile.',
    );
  }

  const { clientId, clientSecret } = resolveOAuthClientCredentials();
  const refreshRes = await fetchWithTimeout(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: vault.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    },
    10_000,
  );
  const refreshText = await refreshRes.text();
  if (!refreshRes.ok) {
    const bizSnap = await fsGetDoc(serviceToken, 'businesses', businessId);
    const ownerId = readFsStr(bizSnap.fields, 'ownerId');
    const clientEmail = readFsStr(bizSnap.fields, 'clientEmail');
    if (refreshRes.status === 400 || refreshRes.status === 401) {
      await upsertGbpConnectionMetadata(serviceToken, businessId, ownerId, clientEmail, {
        connectionStatus: 'disconnected',
        tokenStatus: 'expired_or_revoked',
      });
    }
    throw new Error(classifyGbpApiError(refreshRes.status, refreshText, 'refreshing Google OAuth token'));
  }

  const refreshJson = JSON.parse(refreshText) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  const newAccessToken = (refreshJson.access_token || '').trim();
  if (!newAccessToken) {
    throw new Error('Google did not return a refreshed access token.');
  }

  const bizSnap = await fsGetDoc(serviceToken, 'businesses', businessId);
  await saveEncryptedTokensToVault(serviceToken, {
    businessId,
    ownerId: readFsStr(bizSnap.fields, 'ownerId'),
    tokens: {
      accessToken: newAccessToken,
      refreshToken: (refreshJson.refresh_token || '').trim() || vault.refreshToken,
      expiresAtMs: Date.now() + (Number(refreshJson.expires_in) || 3500) * 1000,
      scope: (refreshJson.scope || '').trim() || vault.scope,
      connectedEmail: vault.connectedEmail,
    },
  });

  return { accessToken: newAccessToken, connectedEmail: vault.connectedEmail };
}

async function runWithRefreshedToken<T>(
  businessId: string,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const { accessToken } = await getValidGbpAccessToken(businessId, false);
  try {
    return await fn(accessToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('expired or was revoked') || msg.includes('(401)')) {
      const refreshed = await getValidGbpAccessToken(businessId, true);
      return await fn(refreshed.accessToken);
    }
    throw err;
  }
}

export async function listGbpAccountsAction(input: {
  businessId: string;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };
  try {
    const accounts = await runWithRefreshedToken(input.businessId, fetchPaginatedGbpAccounts);
    return {
      status: 200,
      data: {
        accounts,
        emptyMessage:
          accounts.length === 0
            ? 'No Google Business Profile accounts were found on this Google account. Ensure you signed in with the Google account that owns or manages your Business Profile.'
            : undefined,
      },
    };
  } catch (err) {
    return {
      status: 400,
      data: { error: err instanceof Error ? err.message : 'Failed to list GBP accounts.' },
    };
  }
}

export async function listGbpLocationsAction(input: {
  businessId: string;
  accountName: string;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };

  const cleanAccount = (input.accountName || '').trim();
  if (!/^accounts\/[a-zA-Z0-9_-]+$/.test(cleanAccount)) {
    return { status: 400, data: { error: 'Please select a valid Google Business Profile account.' } };
  }

  try {
    const locations = await runWithRefreshedToken(input.businessId, (token) =>
      fetchPaginatedGbpLocations(token, cleanAccount),
    );
    return {
      status: 200,
      data: {
        accountName: cleanAccount,
        locations,
        emptyMessage:
          locations.length === 0
            ? 'No business locations were returned under this account. Confirm the profile is created and verified under this Google account.'
            : undefined,
      },
    };
  } catch (err) {
    return {
      status: 400,
      data: { error: err instanceof Error ? err.message : 'Failed to list GBP locations.' },
    };
  }
}

export async function configureAccountPubSubNotifications(input: {
  accessToken: string;
  accountName: string;
  replaceExistingTopic?: boolean;
}): Promise<{
  status: 'enabled' | 'conflict' | 'error';
  pubsubTopic: string;
  notificationTypes: string[];
  existingTopic?: string;
  existingTypes?: string[];
  errorMessage?: string;
}> {
  const cleanAccount = (input.accountName || '').trim();
  if (!/^accounts\/[a-zA-Z0-9_-]+$/.test(cleanAccount)) {
    return {
      status: 'error',
      pubsubTopic: '',
      notificationTypes: [],
      errorMessage: 'Valid GBP accountName is required to configure Pub/Sub notifications.',
    };
  }

  const sharedTopic = resolveSharedPubSubTopic();
  const notifUrl = `https://mybusinessnotifications.googleapis.com/v1/${cleanAccount}/notificationSetting`;

  const getRes = await fetchWithRetry(
    notifUrl,
    { headers: { Authorization: `Bearer ${input.accessToken}` } },
    10_000,
  );
  const getBody = await getRes.text();
  if (!getRes.ok) {
    return {
      status: 'error',
      pubsubTopic: sharedTopic,
      notificationTypes: [],
      errorMessage: classifyGbpApiError(
        getRes.status,
        getBody,
        'reading GBP notification settings',
      ),
    };
  }

  const existingSetting = JSON.parse(getBody || '{}') as {
    name?: string;
    pubsubTopic?: string;
    notificationTypes?: string[];
  };
  const existingTopic = (existingSetting.pubsubTopic || '').trim();
  const existingTypes = Array.isArray(existingSetting.notificationTypes)
    ? existingSetting.notificationTypes.filter((t): t is string => typeof t === 'string')
    : [];

  // Requirement #20: Do not overwrite an existing different Pub/Sub topic unexpectedly
  if (existingTopic && existingTopic !== sharedTopic && !input.replaceExistingTopic) {
    return {
      status: 'conflict',
      pubsubTopic: sharedTopic,
      notificationTypes: existingTypes,
      existingTopic,
      existingTypes,
      errorMessage: `This Google Business account already uses a different Pub/Sub topic (${existingTopic}). Confirm if you want to switch notifications to ReviewFlow's shared topic (${sharedTopic}).`,
    };
  }

  const mergedTypes = Array.from(
    new Set([...existingTypes, 'NEW_REVIEW', 'UPDATED_REVIEW']),
  );

  // Skip unnecessary PATCH if already configured identically
  if (
    existingTopic === sharedTopic &&
    mergedTypes.includes('NEW_REVIEW') &&
    mergedTypes.includes('UPDATED_REVIEW') &&
    mergedTypes.length === existingTypes.length
  ) {
    return {
      status: 'enabled',
      pubsubTopic: sharedTopic,
      notificationTypes: mergedTypes,
    };
  }

  const patchUrl = `${notifUrl}?updateMask=pubsubTopic,notificationTypes`;
  const patchRes = await fetchWithRetry(
    patchUrl,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        name: `${cleanAccount}/notificationSetting`,
        pubsubTopic: sharedTopic,
        notificationTypes: mergedTypes,
      }),
    },
    10_000,
  );
  const patchText = await patchRes.text();
  if (!patchRes.ok) {
    return {
      status: 'error',
      pubsubTopic: sharedTopic,
      notificationTypes: existingTypes,
      errorMessage: classifyGbpApiError(
        patchRes.status,
        patchText,
        'enabling NEW_REVIEW and UPDATED_REVIEW notifications',
      ),
    };
  }

  const updated = JSON.parse(patchText || '{}') as {
    pubsubTopic?: string;
    notificationTypes?: string[];
  };

  return {
    status: 'enabled',
    pubsubTopic: (updated.pubsubTopic || sharedTopic).trim(),
    notificationTypes: Array.isArray(updated.notificationTypes)
      ? updated.notificationTypes
      : mergedTypes,
  };
}

export async function selectGbpLocationsAction(input: {
  businessId: string;
  accountName: string;
  locations: GbpLocationInfo[];
  replaceExistingTopic?: boolean;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };

  const cleanAccount = (input.accountName || '').trim();
  if (!/^accounts\/[a-zA-Z0-9_-]+$/.test(cleanAccount)) {
    return { status: 400, data: { error: 'Valid Google Business Profile account is required.' } };
  }

  const cleanLocs: GbpLocationInfo[] = (Array.isArray(input.locations) ? input.locations : [])
    .map((loc) => ({
      accountName: cleanAccount,
      locationName: (loc.locationName || '').trim(),
      title: (loc.title || loc.locationName || '').trim().slice(0, 160),
      address: (loc.address || '').trim().slice(0, 240),
      storeCode: (loc.storeCode || '').trim().slice(0, 64),
      placeId: (loc.placeId || '').trim().slice(0, 120),
    }))
    .filter((l) => /^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+$/.test(l.locationName))
    .slice(0, 50);

  if (cleanLocs.length === 0) {
    return {
      status: 400,
      data: { error: 'Please select at least one valid Google Business Profile location.' },
    };
  }

  try {
    const serviceToken = await requireServiceToken();
    const { connectedEmail } = await getValidGbpAccessToken(input.businessId, false);
    const notifResult = await runWithRefreshedToken(input.businessId, (token) =>
      configureAccountPubSubNotifications({
        accessToken: token,
        accountName: cleanAccount,
        replaceExistingTopic: input.replaceExistingTopic,
      }),
    );

    const primary = cleanLocs[0];
    const summaryTitle =
      cleanLocs.length === 1
        ? primary.title
        : `${primary.title} (+${cleanLocs.length - 1} more)`;

    await upsertGbpConnectionMetadata(
      serviceToken,
      input.businessId,
      authCheck.business.ownerId,
      authCheck.business.clientEmail,
      {
        connectionStatus: 'connected',
        connectedEmail,
        accountName: cleanAccount,
        locationName: primary.locationName,
        locationTitle: summaryTitle,
        placeId: primary.placeId,
        selectedLocations: cleanLocs,
        notificationStatus: notifResult.status,
        notificationTopic: notifResult.pubsubTopic,
        notificationTypes: notifResult.notificationTypes,
        notificationError: notifResult.errorMessage || '',
        tokenStatus: 'valid',
      },
    );

    return {
      status: 200,
      data: {
        ok: true,
        selectedLocations: cleanLocs,
        notification: notifResult,
      },
    };
  } catch (err) {
    return {
      status: 400,
      data: {
        error: err instanceof Error ? err.message : 'Unable to save selected GBP locations.',
      },
    };
  }
}

export async function syncGbpReviewsAction(input: {
  businessId: string;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };

  try {
    const serviceToken = await requireServiceToken();
    const connDoc = await fsGetDoc(serviceToken, 'gbpConnections', input.businessId);
    const selectedLocs = readSelectedLocationsFromFields(connDoc.fields);
    const fallbackLoc = readFsStr(connDoc.fields, 'locationName');
    const targetLocNames =
      selectedLocs.length > 0
        ? selectedLocs.map((l) => l.locationName)
        : fallbackLoc
          ? [fallbackLoc]
          : [];

    if (targetLocNames.length === 0) {
      return {
        status: 400,
        data: { error: 'Select at least one Google Business Profile location before syncing.' },
      };
    }

    let imported = 0;
    const errors: string[] = [];

    for (const locName of targetLocNames) {
      const fetchResult = await runWithRefreshedToken(input.businessId, (token) =>
        processGbpProxy({
          action: 'fetch_reviews',
          gbpAccessToken: token,
          locationName: locName,
        }),
      );
      if (fetchResult.status !== 200) {
        errors.push(String(fetchResult.data.error || `Sync error for ${locName}`));
        continue;
      }

      const reviews = Array.isArray(fetchResult.data.reviews)
        ? (fetchResult.data.reviews as Array<{
            externalReviewId: string;
            reviewerName: string;
            starRating: number;
            comment: string;
            reviewDate: string;
          }>)
        : [];

      for (const rev of reviews) {
        const cleanExtId = rev.externalReviewId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const docId = `${input.businessId}_${cleanExtId}`.slice(0, 128);
        const existingDoc = await fsGetDoc(serviceToken, 'gbpReviews', docId);
        if (existingDoc.exists) continue;

        const replyRes = await processGenerateReply({
          businessName: authCheck.business.name,
          category: authCheck.business.category,
          reviewerName: rev.reviewerName,
          starRating: rev.starRating,
          reviewComment: rev.comment,
          brandVoice: authCheck.business.gbpSettings.brandVoice,
          fiveStarMode: authCheck.business.gbpSettings.fiveStarMode,
          midStarMode: authCheck.business.gbpSettings.midStarMode,
        });

        if (replyRes.status !== 200) continue;

        const replyText = String(replyRes.data.replyText || '').trim();
        let finalStatus: 'auto_published' | 'awaiting_approval' =
          rev.starRating <= 2
            ? 'awaiting_approval'
            : replyRes.data.recommendedStatus === 'auto_published'
              ? 'auto_published'
              : 'awaiting_approval';
        let publishedAt = '';
        let errorMessage = '';

        if (finalStatus === 'auto_published') {
          const pubRes = await runWithRefreshedToken(input.businessId, (token) =>
            processGbpProxy({
              action: 'publish_reply',
              gbpAccessToken: token,
              locationName: locName,
              externalReviewId: rev.externalReviewId,
              replyText,
            }),
          );
          if (pubRes.status === 200) {
            publishedAt = new Date().toISOString();
          } else {
            finalStatus = 'awaiting_approval';
            errorMessage = String(pubRes.data.error || 'Failed to publish to Google').slice(0, 400);
          }
        }

        const aiTelemetry = (replyRes.data.aiTelemetry || {}) as {
          provider?: string;
          modelId?: string;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          estimatedCostUsd?: number;
        };
        const nowIso = new Date().toISOString();
        await fsSetOrPatchDoc(serviceToken, 'gbpReviews', docId, {
          businessId: { stringValue: input.businessId },
          ownerId: { stringValue: authCheck.business.ownerId },
          clientEmail: { stringValue: authCheck.business.clientEmail.slice(0, 120) },
          externalReviewId: { stringValue: rev.externalReviewId.slice(0, 160) },
          reviewerName: { stringValue: (rev.reviewerName || 'Google Reviewer').slice(0, 120) },
          starRating: { integerValue: String(rev.starRating) },
          comment: { stringValue: (rev.comment || '').slice(0, 4000) },
          reviewDate: { stringValue: (rev.reviewDate || nowIso).slice(0, 64) },
          source: { stringValue: 'google_gbp_api' },
          aiReplyText: { stringValue: replyText.slice(0, 4000) },
          replyStatus: { stringValue: finalStatus },
          aiProvider: { stringValue: String(aiTelemetry.provider || AI_PROVIDER).slice(0, 40) },
          aiModelId: { stringValue: String(aiTelemetry.modelId || GEMINI_MODEL).slice(0, 80) },
          inputTokens: { integerValue: String(Math.max(0, Math.round(aiTelemetry.inputTokens || 0))) },
          outputTokens: { integerValue: String(Math.max(0, Math.round(aiTelemetry.outputTokens || 0))) },
          totalTokens: { integerValue: String(Math.max(0, Math.round(aiTelemetry.totalTokens || 0))) },
          estimatedCostUsd: { doubleValue: Math.max(0, Number(aiTelemetry.estimatedCostUsd || 0)) },
          ...(errorMessage ? { errorMessage: { stringValue: errorMessage } } : {}),
          ...(publishedAt ? { publishedAt: { stringValue: publishedAt } } : {}),
          createdAt: { timestampValue: nowIso },
          updatedAt: { timestampValue: nowIso },
        });
        imported += 1;
      }
    }

    await upsertGbpConnectionMetadata(
      serviceToken,
      input.businessId,
      authCheck.business.ownerId,
      authCheck.business.clientEmail,
      { touchSyncedAt: true },
    );

    if (imported === 0 && errors.length > 0) {
      return { status: 400, data: { error: errors[0] } };
    }

    return {
      status: 200,
      data: {
        ok: true,
        imported,
        warnings: errors,
      },
    };
  } catch (err) {
    return {
      status: 400,
      data: { error: err instanceof Error ? err.message : 'Unable to sync GBP reviews.' },
    };
  }
}

export async function publishGbpReplyServerAction(input: {
  businessId: string;
  reviewId: string;
  externalReviewId: string;
  replyText: string;
  locationName?: string;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };

  const cleanText = (input.replyText || '').trim().slice(0, 4000);
  if (!cleanText) {
    return { status: 400, data: { error: 'Reply text cannot be empty.' } };
  }

  try {
    const serviceToken = await requireServiceToken();
    const connDoc = await fsGetDoc(serviceToken, 'gbpConnections', input.businessId);
    const targetLocation =
      (input.locationName || '').trim() || readFsStr(connDoc.fields, 'locationName');
    if (!/^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+$/.test(targetLocation)) {
      return {
        status: 400,
        data: { error: 'No connected Google Business Profile location found for this business.' },
      };
    }

    const pubRes = await runWithRefreshedToken(input.businessId, (token) =>
      processGbpProxy({
        action: 'publish_reply',
        gbpAccessToken: token,
        locationName: targetLocation,
        externalReviewId: input.externalReviewId,
        replyText: cleanText,
      }),
    );

    const nowIso = new Date().toISOString();
    if (pubRes.status !== 200) {
      if (input.reviewId) {
        await fsSetOrPatchDoc(
          serviceToken,
          'gbpReviews',
          input.reviewId,
          {
            aiReplyText: { stringValue: cleanText },
            replyStatus: { stringValue: 'failed' },
            errorMessage: {
              stringValue: String(pubRes.data.error || 'Publish failed').slice(0, 400),
            },
            updatedAt: { timestampValue: nowIso },
          },
          ['aiReplyText', 'replyStatus', 'errorMessage', 'updatedAt'],
        ).catch(() => null);
      }
      return {
        status: pubRes.status,
        data: { error: pubRes.data.error || 'Failed to publish reply to Google.' },
      };
    }

    if (input.reviewId) {
      await fsSetOrPatchDoc(
        serviceToken,
        'gbpReviews',
        input.reviewId,
        {
          aiReplyText: { stringValue: cleanText },
          replyStatus: { stringValue: 'published' },
          publishedAt: { stringValue: nowIso },
          errorMessage: { stringValue: '' },
          updatedAt: { timestampValue: nowIso },
        },
        ['aiReplyText', 'replyStatus', 'publishedAt', 'errorMessage', 'updatedAt'],
      ).catch(() => null);
    }

    return { status: 200, data: { published: true } };
  } catch (err) {
    return {
      status: 400,
      data: { error: err instanceof Error ? err.message : 'Unable to publish Google reply.' },
    };
  }
}

export async function disconnectGbpAction(input: {
  businessId: string;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };

  const serviceToken = await requireServiceToken();
  const vault = await readDecryptedTokensFromVault(serviceToken, input.businessId).catch(() => null);
  const tokenToRevoke = vault?.refreshToken || vault?.accessToken || '';

  if (tokenToRevoke) {
    await fetchWithTimeout(
      'https://oauth2.googleapis.com/revoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokenToRevoke }).toString(),
      },
      6000,
    ).catch(() => null);
  }

  await fsDeleteDoc(serviceToken, 'gbpTokenVault', input.businessId);
  await upsertGbpConnectionMetadata(
    serviceToken,
    input.businessId,
    authCheck.business.ownerId,
    authCheck.business.clientEmail,
    {
      connectionStatus: 'disconnected',
      connectedEmail: '',
      accountName: '',
      locationName: '',
      locationTitle: '',
      placeId: '',
      selectedLocations: [],
      notificationStatus: 'not_configured',
      notificationTopic: '',
      notificationTypes: [],
      notificationError: '',
      tokenStatus: 'none',
    },
  );

  return {
    status: 200,
    data: {
      ok: true,
      disconnected: true,
    },
  };
}

async function fsQueryCollectionDocIdsByBusinessId(
  serviceToken: string,
  collectionId: string,
  businessId: string,
): Promise<string[]> {
  const docIds: string[] = [];
  const res = await fetchWithTimeout(
    `${getFsBase()}:runQuery`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'businessId' },
              op: 'EQUAL',
              value: { stringValue: businessId },
            },
          },
          select: { fields: [] },
          limit: 1000,
        },
      }),
    },
    10_000,
  ).catch(() => null);

  if (!res || !res.ok) return docIds;
  const rows = (await res.json()) as Array<{ document?: { name?: string } }>;
  for (const row of rows) {
    const fullName = row.document?.name || '';
    if (!fullName) continue;
    const id = fullName.split('/').pop();
    if (id) docIds.push(id);
  }
  return docIds;
}

export async function deleteBusinessCascadeAction(input: {
  businessId: string;
  caller: { uid: string; email: string };
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const authCheck = await assertAuthorizedForBusiness(input.businessId, input.caller);
  if (!authCheck.ok) return { status: authCheck.status, data: { error: authCheck.error } };

  const serviceToken = await requireServiceToken();
  const vault = await readDecryptedTokensFromVault(serviceToken, input.businessId).catch(() => null);
  const tokenToRevoke = vault?.refreshToken || vault?.accessToken || '';

  if (tokenToRevoke) {
    await fetchWithTimeout(
      'https://oauth2.googleapis.com/revoke',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokenToRevoke }).toString(),
      },
      6000,
    ).catch(() => null);
  }

  let deletedDocs = 0;

  const singletonTargets: Array<[string, string]> = [
    ['gbpTokenVault', input.businessId],
    ['gbpConnections', input.businessId],
    ['businessIntegrations', input.businessId],
    ['businessStats', input.businessId],
    ['businesses', input.businessId],
  ];
  if (authCheck.business.slug) {
    singletonTargets.push(['publicProfiles', authCheck.business.slug]);
  }

  await Promise.all(
    singletonTargets.map(async ([col, docId]) => {
      await fsDeleteDoc(serviceToken, col, docId);
      deletedDocs += 1;
    }),
  );

  const dependentCollections = [
    'qrStands',
    'qrStandRequests',
    'gbpReviews',
    'weeklyReports',
    'reviewEvents',
    'aiUsageLogs',
    'feedbackSubmissions',
    'reviewDrafts',
    'reviewEvaluations',
    'consentedExamples',
  ];

  for (const col of dependentCollections) {
    const ids = await fsQueryCollectionDocIdsByBusinessId(
      serviceToken,
      col,
      input.businessId,
    );
    for (let i = 0; i < ids.length; i += 20) {
      const slice = ids.slice(i, i + 20);
      await Promise.all(slice.map((id) => fsDeleteDoc(serviceToken, col, id)));
      deletedDocs += slice.length;
    }
  }

  return {
    status: 200,
    data: {
      ok: true,
      businessId: input.businessId,
      deletedDocs,
    },
  };
}

export async function resolveWebhookContextAndFetchReview(input: {
  locationName: string;
  externalReviewId?: string;
}): Promise<{
  businessId?: string;
  accessToken?: string;
  review?: {
    externalReviewId: string;
    reviewerName: string;
    starRating: number;
    comment: string;
    reviewDate: string;
  };
}> {
  const serviceToken = await getServiceAccountFirestoreToken();
  if (!serviceToken || !FIREBASE_PROJECT_ID || !input.locationName) return {};

  // Look up connection matching primary locationName first, fallback scanning connected docs
  const queryRes = await fetchWithTimeout(
    `${getFsBase()}:runQuery`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'gbpConnections' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'connectionStatus' },
              op: 'EQUAL',
              value: { stringValue: 'connected' },
            },
          },
          limit: 100,
        },
      }),
    },
    6000,
  ).catch(() => null);

  if (!queryRes?.ok) return {};
  const rows = (await queryRes.json()) as Array<{
    document?: { fields?: Record<string, FirestoreFieldValue> };
  }>;

  let matchedBizId = '';
  for (const row of rows) {
    const f = row.document?.fields;
    if (!f) continue;
    const primaryLoc = readFsStr(f, 'locationName');
    const multiLocs = readSelectedLocationsFromFields(f);
    if (
      primaryLoc === input.locationName ||
      multiLocs.some((l) => l.locationName === input.locationName)
    ) {
      matchedBizId = readFsStr(f, 'businessId');
      break;
    }
  }

  if (!matchedBizId) return {};

  let accessToken = '';
  try {
    const tokenRes = await getValidGbpAccessToken(matchedBizId, false);
    accessToken = tokenRes.accessToken;
  } catch {
    return { businessId: matchedBizId };
  }

  if (!input.externalReviewId || !accessToken) {
    return { businessId: matchedBizId, accessToken };
  }

  const revRes = await fetchWithRetry(
    `https://mybusiness.googleapis.com/v4/${input.locationName}/reviews/${encodeURIComponent(
      input.externalReviewId,
    )}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    8000,
  ).catch(() => null);

  if (!revRes?.ok) {
    return { businessId: matchedBizId, accessToken };
  }

  const r = (await revRes.json()) as {
    reviewId?: string;
    reviewer?: { displayName?: string };
    starRating?: string;
    comment?: string;
    createTime?: string;
  };
  const starMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return {
    businessId: matchedBizId,
    accessToken,
    review: {
      externalReviewId: r.reviewId || input.externalReviewId,
      reviewerName: r.reviewer?.displayName || 'Google Reviewer',
      starRating: starMap[(r.starRating || '').toUpperCase()] || 5,
      comment: r.comment || '',
      reviewDate: r.createTime || new Date().toISOString(),
    },
  };
}

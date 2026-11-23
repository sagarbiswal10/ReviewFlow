import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch, formatApiError, parseApiJson } from '../utils/apiClient';
import {
  clampString,
  getMondaySundayWindow,
  getTimestampMs,
  isMondayToday,
  normalizeEmail,
  sanitizeSlug,
} from '../utils/domainHelpers';
import type {
  AiUsageLog,
  Business,
  GbpConnection,
  GbpReplyStatus,
  GbpReview,
  QrStand,
  QrStandRequest,
  ReviewEvent,
  WeeklyModelUsageItem,
  WeeklyReport,
} from '../types';

export { getMondaySundayWindow, getTimestampMs, isMondayToday };

export const STAND_PLACEMENT_PRESETS = [
  'Restaurant Entrance',
  'Cash Counter',
  'Dining Table',
  'Reception Desk',
  'Checkout Counter',
  'Waiting Lounge',
  'Private Suite',
  'Pickup Window',
] as const;

function subscribeClientScopedCollection<T extends { businessId: string }>(
  collectionName: string,
  businessId: string,
  viewerUid: string,
  viewerEmail: string,
  isAdmin: boolean,
  mapDoc: (id: string, data: Record<string, unknown>) => T,
  onData: (items: T[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (isAdmin) {
    const q = query(collection(db, collectionName), where('businessId', '==', businessId), limit(500));
    return onSnapshot(
      q,
      (snapshot) => {
        onData(
          snapshot.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>)),
        );
      },
      (err) => {
        if (onError) onError(err);
      },
    );
  }

  const normalizedEmail = normalizeEmail(viewerEmail);
  const byOwner = new Map<string, T>();
  const byEmail = new Map<string, T>();
  let ownerReady = false;
  let emailReady = !normalizedEmail;

  const emit = () => {
    if (!ownerReady || !emailReady) return;
    const merged = new Map<string, T>();
    byOwner.forEach((v, k) => merged.set(k, v));
    byEmail.forEach((v, k) => merged.set(k, v));
    onData(Array.from(merged.values()).filter((item) => item.businessId === businessId));
  };

  const unsubOwner = onSnapshot(
    query(collection(db, collectionName), where('ownerId', '==', viewerUid), limit(500)),
    (snapshot) => {
      byOwner.clear();
      snapshot.docs.forEach((d) => {
        byOwner.set(d.id, mapDoc(d.id, d.data() as Record<string, unknown>));
      });
      ownerReady = true;
      emit();
    },
    (err) => {
      ownerReady = true;
      if (onError) onError(err);
    },
  );

  let unsubEmail: Unsubscribe = () => {};
  if (normalizedEmail) {
    unsubEmail = onSnapshot(
      query(collection(db, collectionName), where('clientEmail', '==', normalizedEmail), limit(500)),
      (snapshot) => {
        byEmail.clear();
        snapshot.docs.forEach((d) => {
          byEmail.set(d.id, mapDoc(d.id, d.data() as Record<string, unknown>));
        });
        emailReady = true;
        emit();
      },
      (err) => {
        emailReady = true;
        if (onError) onError(err);
      },
    );
  }

  return () => {
    unsubOwner();
    unsubEmail();
  };
}

export function subscribeToBusinessQrStands(
  businessId: string,
  viewerUid: string,
  viewerEmail: string,
  isAdmin: boolean,
  onData: (stands: QrStand[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeClientScopedCollection<QrStand>(
    'qrStands',
    businessId,
    viewerUid,
    viewerEmail,
    isAdmin,
    (id, raw) => ({ ...(raw as Omit<QrStand, 'id'>), id }),
    (items) => onData([...items].sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0))),
    onError,
  );
}

export async function createQrStand(input: {
  business: Business;
  name: string;
  placement: string;
  existingStands: QrStand[];
  fgColor?: string;
  bgColor?: string;
  includeLogo?: boolean;
}): Promise<QrStand> {
  const limitCount = Math.max(1, input.business.qrStandLimit ?? 4);
  const usedSlots = new Set(input.existingStands.map((s) => s.slotNumber));
  let slotNumber = 1;
  while (usedSlots.has(slotNumber) && slotNumber <= limitCount) {
    slotNumber += 1;
  }

  if (slotNumber > limitCount) {
    throw new Error(
      `Active stand limit reached (${limitCount} max). Submit an Additional QR Stand Request for admin approval.`,
    );
  }

  try {
    const authRes = await apiFetch('/api/qr-stand-authorize', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        businessId: input.business.id,
        slotNumber,
      }),
    });
    const parsedAuth = await parseApiJson<{
      allowed?: boolean;
      error?: string;
      standId?: string;
    }>(authRes);

    if (authRes.status === 400 || authRes.status === 401 || authRes.status === 403) {
      throw new Error(
        parsedAuth.data?.error || 'Server rejected QR stand slot allocation.',
      );
    }
    if (parsedAuth.data && parsedAuth.data.allowed === false) {
      throw new Error(
        parsedAuth.data.error || 'Server rejected QR stand slot allocation.',
      );
    }
  } catch (err) {
    // Rejections (400/401/403 or allowed=false) must propagate cleanly; network/404/5xx fall back to Firestore rules enforcement
    const isNetworkOrGatewayError =
      err instanceof TypeError || (err instanceof SyntaxError);
    if (!isNetworkOrGatewayError && err instanceof Error) {
      throw err;
    }
  }

  const standId = `${input.business.id}_slot_${slotNumber}`;
  const cleanName = clampString(input.name, 120) || `QR Stand #${slotNumber}`;
  const cleanPlacement = clampString(input.placement, 80) || 'Counter';
  const rawSlug = sanitizeSlug(`${cleanPlacement}-${slotNumber}`).slice(0, 48);
  const standCode = rawSlug.length >= 2 ? rawSlug : `stand-${slotNumber}`;
  const rawFg = clampString(input.fgColor || input.business.qrConfig.fgColor, 20);
  const rawBg = clampString(input.bgColor || input.business.qrConfig.bgColor, 20);
  const fgColor = rawFg.length >= 4 ? rawFg : '#0F172A';
  const bgColor = rawBg.length >= 4 ? rawBg : '#FFFFFF';
  const now = serverTimestamp();

  const payload = {
    businessId: input.business.id,
    ownerId: input.business.ownerId,
    ...(input.business.clientUid ? { clientUid: input.business.clientUid } : {}),
    clientEmail: normalizeEmail(input.business.clientEmail || ''),
    slug: input.business.slug,
    slotNumber,
    standCode,
    name: cleanName,
    placement: cleanPlacement,
    isActive: true,
    fgColor,
    bgColor,
    includeLogo: input.includeLogo ?? input.business.qrConfig.includeLogo,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'qrStands', standId), payload);
    return { ...payload, id: standId };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `qrStands/${standId}`);
  }
}

export async function updateQrStand(
  stand: QrStand,
  updates: Partial<{
    name: string;
    placement: string;
    isActive: boolean;
    fgColor: string;
    bgColor: string;
    includeLogo: boolean;
  }>,
): Promise<void> {
  const nextName = clampString(updates.name ?? stand.name, 120) || stand.name;
  const nextPlacement = clampString(updates.placement ?? stand.placement, 80) || stand.placement;
  const nextCode =
    updates.placement !== undefined
      ? sanitizeSlug(`${nextPlacement}-${stand.slotNumber}`).slice(0, 48) || stand.standCode
      : stand.standCode;

  const rawFg = clampString(updates.fgColor ?? stand.fgColor, 20);
  const rawBg = clampString(updates.bgColor ?? stand.bgColor, 20);
  const payload: Record<string, unknown> = {
    name: nextName,
    placement: nextPlacement,
    standCode: nextCode.length >= 2 ? nextCode : `stand-${stand.slotNumber}`,
    isActive: updates.isActive ?? stand.isActive,
    fgColor: rawFg.length >= 4 ? rawFg : '#0F172A',
    bgColor: rawBg.length >= 4 ? rawBg : '#FFFFFF',
    includeLogo: updates.includeLogo ?? stand.includeLogo,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'qrStands', stand.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qrStands/${stand.id}`);
  }
}

export async function deleteQrStand(standId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'qrStands', standId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `qrStands/${standId}`);
  }
}

export function subscribeToBusinessQrStandRequests(
  businessId: string,
  viewerUid: string,
  viewerEmail: string,
  isAdmin: boolean,
  onData: (requests: QrStandRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeClientScopedCollection<QrStandRequest>(
    'qrStandRequests',
    businessId,
    viewerUid,
    viewerEmail,
    isAdmin,
    (id, raw) => ({ ...(raw as Omit<QrStandRequest, 'id'>), id }),
    (items) => onData([...items].sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt))),
    onError,
  );
}

export function subscribeToAllQrStandRequests(
  onData: (requests: QrStandRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'qrStandRequests'),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => ({ ...(d.data() as Omit<QrStandRequest, 'id'>), id: d.id }))
        .sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

export async function submitQrStandRequest(input: {
  business: Business;
  requestedAdditionalStands: number;
  reason: string;
}): Promise<string> {
  const count = Math.min(50, Math.max(1, Math.round(Number(input.requestedAdditionalStands) || 1)));
  const cleanReason = clampString(input.reason, 400);
  if (cleanReason.length < 3) {
    throw new Error('Please describe where the additional QR stands will be placed.');
  }

  const reqRef = doc(collection(db, 'qrStandRequests'));
  const now = serverTimestamp();
  const payload = {
    businessId: input.business.id,
    businessName: clampString(input.business.name, 120) || 'Business',
    ownerId: input.business.ownerId,
    ...(input.business.clientUid ? { clientUid: input.business.clientUid } : {}),
    clientEmail: normalizeEmail(input.business.clientEmail || ''),
    requestedAdditionalStands: count,
    currentLimit: Math.max(1, input.business.qrStandLimit ?? 4),
    reason: cleanReason,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(reqRef, payload);
    return reqRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `qrStandRequests/${reqRef.id}`);
  }
}

export async function reviewQrStandRequest(input: {
  request: QrStandRequest;
  decision: 'approved' | 'rejected';
  adminUser: User;
  adminNote?: string;
}): Promise<void> {
  const now = serverTimestamp();
  const batch = writeBatch(db);
  const cleanNote = clampString(input.adminNote || '', 400);
  batch.update(doc(db, 'qrStandRequests', input.request.id), {
    status: input.decision,
    reviewedByUid: input.adminUser.uid,
    reviewedByEmail: normalizeEmail(input.adminUser.email || ''),
    adminNote: cleanNote,
    updatedAt: now,
  });

  if (input.decision === 'approved') {
    const nextLimit = Math.min(
      100,
      Math.max(1, (input.request.currentLimit || 4) + (input.request.requestedAdditionalStands || 1)),
    );
    batch.update(doc(db, 'businesses', input.request.businessId), {
      qrStandLimit: nextLimit,
      updatedAt: now,
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `qrStandRequests/${input.request.id}`);
  }
}

const GBP_OAUTH_CLIENT_STORAGE_KEY = 'reviewflow_gbp_oauth_client_id';

export function getSavedGbpOAuthClientId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(GBP_OAUTH_CLIENT_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveGbpOAuthClientId(clientId: string): string {
  const clean = clientId.trim();
  if (clean && !clean.endsWith('.apps.googleusercontent.com')) {
    throw new Error(
      'Enter a valid Google OAuth Web Client ID ending in .apps.googleusercontent.com (never paste a Client Secret).',
    );
  }
  if (typeof window !== 'undefined') {
    try {
      if (clean) {
        localStorage.setItem(GBP_OAUTH_CLIENT_STORAGE_KEY, clean);
      } else {
        localStorage.removeItem(GBP_OAUTH_CLIENT_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }
  return clean;
}

export function getGoogleOAuthClientId(): string {
  const envId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (envId) return envId;
  const savedId = getSavedGbpOAuthClientId();
  if (savedId) return savedId;
  return (firebaseConfig.oAuthClientId || '').trim();
}

export function isCustomGbpOAuthClientConfigured(): boolean {
  return Boolean(
    (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim() || getSavedGbpOAuthClientId(),
  );
}

interface GoogleTokenClient {
  requestAccessToken: (opts?: { prompt?: string; hint?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            hint?: string;
            callback: (resp: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;
function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser window unavailable.'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://accounts.google.com/gsi/client"]',
      );
      if (existing) {
        if (window.google?.accounts?.oauth2) {
          resolve();
          return;
        }
        const onLoad = () => resolve();
        const onError = () => {
          gsiScriptPromise = null;
          existing.remove();
          reject(new Error('Failed to load Google OAuth script.'));
        };
        existing.addEventListener('load', onLoad, { once: true });
        existing.addEventListener('error', onError, { once: true });
        window.setTimeout(() => {
          if (window.google?.accounts?.oauth2) {
            resolve();
          }
        }, 1200);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        gsiScriptPromise = null;
        script.remove();
        reject(new Error('Failed to load Google Identity Services.'));
      };
      document.head.appendChild(script);
    });
  }
  return gsiScriptPromise;
}

export async function requestGbpOAuthToken(options?: {
  loginHint?: string;
  allowFallbackClient?: boolean;
}): Promise<string> {
  const clientId = getGoogleOAuthClientId();
  const hasCustomClient = isCustomGbpOAuthClientConfigured();
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  if (!clientId || (!hasCustomClient && !options?.allowFallbackClient)) {
    throw new Error(
      `A Google Cloud Web OAuth Client ID configured for ${currentOrigin || 'this origin'} is required before opening Google Business Profile OAuth (the default Firebase Auth client ID causes Google Error 400: origin_mismatch). Paste your Web OAuth Client ID below or set VITE_GOOGLE_OAUTH_CLIENT_ID.`,
    );
  }
  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services OAuth client is unavailable.');
  }
  const cleanHint = (options?.loginHint || '').trim();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      fn();
    };

    const timeoutId = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'Google authorization timed out. If the popup showed "Access blocked: Authorisation error" or was closed, verify your Authorized JavaScript Origins and Test Users in Google Cloud Console.',
          ),
        ),
      );
    }, 90_000);

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/business.manage',
      ...(cleanHint ? { hint: cleanHint } : {}),
      callback: (resp) => {
        if (resp.error) {
          const desc = resp.error_description || resp.error;
          finish(() =>
            reject(
              new Error(
                `Google OAuth error (${desc}). Make sure ${currentOrigin || 'this app URL'} is authorized for OAuth Client ${clientId} and Google Business Profile API access is approved.`,
              ),
            ),
          );
          return;
        }
        if (!resp.access_token) {
          finish(() => reject(new Error('Google did not return an OAuth access token.')));
          return;
        }
        finish(() => resolve(resp.access_token as string));
      },
      error_callback: (err) => {
        if (err?.type === 'popup_closed') {
          finish(() =>
            reject(
              new Error(
                `Authorization popup was closed. If Google showed "Access blocked: Authorisation error" (Error 400: origin_mismatch), verify ${currentOrigin || 'this domain'} is listed under Authorized JavaScript Origins on OAuth Client ${clientId} and your Gmail is under OAuth Consent Screen -> Test Users.`,
              ),
            ),
          );
          return;
        }
        if (err?.type === 'popup_failed_to_open') {
          finish(() =>
            reject(
              new Error(
                'Google authorization popup was blocked by your browser. Please allow popups for this site and try again.',
              ),
            ),
          );
          return;
        }
        finish(() =>
          reject(
            new Error(
              err?.message ||
                'Google OAuth could not start. Check your OAuth Client ID and Authorized JavaScript Origins.',
            ),
          ),
        );
      },
    });
    client.requestAccessToken({
      prompt: 'select_account consent',
      ...(cleanHint ? { hint: cleanHint } : {}),
    });
  });
}

export function subscribeToGbpConnection(
  businessId: string,
  onData: (connection: GbpConnection | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'gbpConnections', businessId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(snap.data() as GbpConnection);
      }
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

export async function saveGbpConnection(input: {
  business: Business;
  connectionStatus: GbpConnection['connectionStatus'];
  connectedEmail: string;
  accountName: string;
  locationName: string;
  locationTitle: string;
  placeId: string;
  existing: GbpConnection | null;
}): Promise<void> {
  const now = serverTimestamp();
  const ref = doc(db, 'gbpConnections', input.business.id);
  const payload = {
    businessId: input.business.id,
    ownerId: input.business.ownerId,
    clientEmail: normalizeEmail(input.business.clientEmail || ''),
    connectionStatus: input.connectionStatus,
    connectedEmail: normalizeEmail(input.connectedEmail || ''),
    accountName: clampString(input.accountName, 160),
    locationName: clampString(input.locationName, 200),
    locationTitle: clampString(input.locationTitle, 160),
    placeId: clampString(input.placeId, 120),
    lastSyncedAt: now,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    await setDoc(ref, payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `gbpConnections/${input.business.id}`);
  }
}

export async function disconnectGbpConnection(
  business: Business,
  existing: GbpConnection | null,
): Promise<void> {
  await saveGbpConnection({
    business,
    connectionStatus: 'disconnected',
    connectedEmail: existing?.connectedEmail || '',
    accountName: '',
    locationName: '',
    locationTitle: '',
    placeId: '',
    existing,
  });
}

export function subscribeToBusinessGbpReviews(
  businessId: string,
  viewerUid: string,
  viewerEmail: string,
  isAdmin: boolean,
  onData: (reviews: GbpReview[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeClientScopedCollection<GbpReview>(
    'gbpReviews',
    businessId,
    viewerUid,
    viewerEmail,
    isAdmin,
    (id, raw) => ({ ...(raw as Omit<GbpReview, 'id'>), id }),
    (items) => onData([...items].sort((a, b) => Date.parse(b.reviewDate || '') - Date.parse(a.reviewDate || ''))),
    onError,
  );
}

export async function listGbpLocationsWithToken(gbpAccessToken: string): Promise<
  Array<{ accountName: string; locationName: string; title: string; placeId: string }>
> {
  try {
    const res = await apiFetch('/api/gbp-sync', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        action: 'list_locations',
        gbpAccessToken,
      }),
    });
    const parsed = await parseApiJson<{
      locations?: Array<{ accountName: string; locationName: string; title: string; placeId: string }>;
      error?: string;
    }>(res);
    if (!parsed.ok) {
      throw new Error(
        parsed.data?.error || `Failed to fetch Google Business Profile locations (${parsed.status}).`,
      );
    }
    return parsed.data?.locations || [];
  } catch (err) {
    throw new Error(formatApiError(err, 'Failed to fetch Google Business Profile locations.'));
  }
}

interface AiReplyApiResponse {
  replyText?: string;
  recommendedStatus?: 'auto_published' | 'awaiting_approval';
  aiTelemetry?: {
    provider: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    status: 'success' | 'failed';
  };
  error?: string;
}

export async function generateAndStoreGbpReviewReply(input: {
  business: Business;
  reviewerName: string;
  starRating: number;
  comment: string;
  reviewDate?: string;
  externalReviewId?: string;
  source?: GbpReview['source'];
  gbpAccessToken?: string;
  locationName?: string;
  existingReviewId?: string;
}): Promise<GbpReview> {
  const cleanStar = Math.min(5, Math.max(1, Math.round(Number(input.starRating) || 5)));
  const settings = input.business.gbpSettings;

  let data: AiReplyApiResponse;
  try {
    const res = await apiFetch('/api/generate-reply', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        businessName: input.business.name,
        category: input.business.category,
        reviewerName: input.reviewerName,
        starRating: cleanStar,
        reviewComment: input.comment,
        brandVoice: settings?.brandVoice || '',
        fiveStarMode: settings?.fiveStarMode || 'auto_publish',
        midStarMode: settings?.midStarMode || 'approval_required',
      }),
    });
    const parsed = await parseApiJson<AiReplyApiResponse>(res);
    if (!parsed.ok || !parsed.data?.replyText) {
      throw new Error(parsed.data?.error || `Failed to generate AI reply (${parsed.status}).`);
    }
    data = parsed.data;
  } catch (err) {
    throw new Error(formatApiError(err, 'Failed to generate AI reply.'));
  }

  const telemetry = data.aiTelemetry || {
    provider: 'gemini',
    modelId: 'gemini-3.1-flash-lite',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    status: 'success' as const,
  };

  let finalStatus: GbpReplyStatus =
    cleanStar <= 2
      ? 'awaiting_approval'
      : data.recommendedStatus === 'auto_published'
        ? 'auto_published'
        : 'awaiting_approval';
  let publishedAt = '';
  let errorMessage = '';

  const extId = clampString(
    input.externalReviewId || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    160,
  );

  if (finalStatus === 'auto_published') {
    if (input.gbpAccessToken && input.locationName) {
      try {
        const pubRes = await apiFetch('/api/gbp-sync', {
          method: 'POST',
          requireAuth: true,
          body: JSON.stringify({
            action: 'publish_reply',
            gbpAccessToken: input.gbpAccessToken,
            locationName: input.locationName,
            externalReviewId: extId,
            replyText: data.replyText,
          }),
        });
        const parsedPub = await parseApiJson<{ error?: string }>(pubRes);
        if (!parsedPub.ok) {
          errorMessage = parsedPub.data?.error || 'Google reply publish returned an error.';
          finalStatus = 'awaiting_approval';
        } else {
          publishedAt = new Date().toISOString();
        }
      } catch (pubErr) {
        errorMessage = formatApiError(pubErr, 'Unable to reach Google Reply API.');
        finalStatus = 'awaiting_approval';
      }
    } else {
      publishedAt = new Date().toISOString();
    }
  }

  const now = serverTimestamp();
  const docId =
    input.existingReviewId || `${input.business.id}_${extId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  const docFields = {
    aiReplyText: clampString(data.replyText, 4000),
    replyStatus: finalStatus,
    aiProvider: clampString(telemetry.provider, 40),
    aiModelId: clampString(telemetry.modelId, 80),
    inputTokens: Math.max(0, telemetry.inputTokens),
    outputTokens: Math.max(0, telemetry.outputTokens),
    totalTokens: Math.max(0, telemetry.totalTokens),
    estimatedCostUsd: Math.max(0, telemetry.estimatedCostUsd),
    ...(errorMessage ? { errorMessage: clampString(errorMessage, 400) } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    updatedAt: now,
  };

  if (input.existingReviewId) {
    try {
      await updateDoc(doc(db, 'gbpReviews', input.existingReviewId), docFields);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `gbpReviews/${input.existingReviewId}`);
    }
  } else {
    const createPayload = {
      businessId: input.business.id,
      ownerId: input.business.ownerId,
      clientEmail: normalizeEmail(input.business.clientEmail || ''),
      externalReviewId: extId,
      reviewerName: clampString(input.reviewerName, 120) || 'Customer',
      starRating: cleanStar,
      comment: clampString(input.comment, 4000),
      reviewDate: input.reviewDate || new Date().toISOString(),
      source: input.source || 'manual_sync',
      ...docFields,
      createdAt: now,
    };
    try {
      await setDoc(doc(db, 'gbpReviews', docId), createPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `gbpReviews/${docId}`);
    }
  }

  const usageRef = doc(collection(db, 'aiUsageLogs'));
  try {
    await setDoc(usageRef, {
      requestId: usageRef.id,
      businessId: input.business.id,
      ownerId: input.business.ownerId,
      clientEmail: normalizeEmail(input.business.clientEmail || ''),
      provider: clampString(telemetry.provider, 40),
      operationType: 'gbp_auto_reply',
      modelName: clampString(telemetry.modelId, 80),
      inputTokens: Math.max(0, telemetry.inputTokens),
      outputTokens: Math.max(0, telemetry.outputTokens),
      totalTokens: Math.max(0, telemetry.totalTokens),
      estimatedCostUsd: Math.max(0, telemetry.estimatedCostUsd),
      status: 'success',
      errorCode: '',
      createdAt: now,
    });
  } catch {
    // Non-blocking AI telemetry write
  }

  return {
    id: docId,
    businessId: input.business.id,
    ownerId: input.business.ownerId,
    clientEmail: normalizeEmail(input.business.clientEmail || ''),
    externalReviewId: extId,
    reviewerName: clampString(input.reviewerName, 120) || 'Customer',
    starRating: cleanStar,
    comment: clampString(input.comment, 4000),
    reviewDate: input.reviewDate || new Date().toISOString(),
    source: input.source || 'manual_sync',
    ...docFields,
  };
}

export async function syncGbpReviewsWithToken(input: {
  business: Business;
  gbpAccessToken: string;
  locationName: string;
  existingReviews: GbpReview[];
}): Promise<number> {
  let fetchedReviews: Array<{
    externalReviewId: string;
    reviewerName: string;
    starRating: number;
    comment: string;
    reviewDate: string;
  }> = [];
  try {
    const res = await apiFetch('/api/gbp-sync', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        action: 'fetch_reviews',
        gbpAccessToken: input.gbpAccessToken,
        locationName: input.locationName,
      }),
    });
    const parsed = await parseApiJson<{
      reviews?: typeof fetchedReviews;
      error?: string;
    }>(res);
    if (!parsed.ok) {
      throw new Error(
        parsed.data?.error || `Failed to sync reviews from Google Business Profile (${parsed.status}).`,
      );
    }
    fetchedReviews = parsed.data?.reviews || [];
  } catch (err) {
    throw new Error(formatApiError(err, 'Failed to sync reviews from Google Business Profile.'));
  }
  const existingIds = new Set(input.existingReviews.map((r) => r.externalReviewId));
  let imported = 0;
  for (const rev of fetchedReviews) {
    if (existingIds.has(rev.externalReviewId)) continue;
    await generateAndStoreGbpReviewReply({
      business: input.business,
      externalReviewId: rev.externalReviewId,
      reviewerName: rev.reviewerName,
      starRating: rev.starRating,
      comment: rev.comment,
      reviewDate: rev.reviewDate,
      source: 'google_gbp_api',
      gbpAccessToken: input.gbpAccessToken,
      locationName: input.locationName,
    });
    imported += 1;
  }
  return imported;
}

export async function approveAndPublishGbpReply(input: {
  review: GbpReview;
  editedText: string;
  gbpAccessToken?: string;
  locationName?: string;
}): Promise<void> {
  const cleanText = clampString(input.editedText, 4000);
  if (!cleanText) {
    throw new Error('Reply text cannot be empty before publishing.');
  }

  let nextStatus: GbpReplyStatus = 'manually_approved';
  let errorMessage = '';

  if (input.gbpAccessToken && input.locationName) {
    try {
      const res = await apiFetch('/api/gbp-sync', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          action: 'publish_reply',
          gbpAccessToken: input.gbpAccessToken,
          locationName: input.locationName,
          externalReviewId: input.review.externalReviewId,
          replyText: cleanText,
        }),
      });
      const parsed = await parseApiJson<{ published?: boolean; error?: string }>(res);
      if (!parsed.ok) {
        errorMessage =
          parsed.data?.error || `Failed to publish reply to Google Business Profile (${parsed.status}).`;
        nextStatus = 'failed';
      } else {
        nextStatus = 'published';
      }
    } catch (err) {
      errorMessage = formatApiError(err, 'Failed to reach Google Business Profile API.');
      nextStatus = 'failed';
    }
  }

  try {
    await updateDoc(doc(db, 'gbpReviews', input.review.id), {
      aiReplyText: cleanText,
      replyStatus: nextStatus,
      ...(nextStatus !== 'failed' ? { publishedAt: new Date().toISOString() } : {}),
      errorMessage: clampString(errorMessage, 400),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `gbpReviews/${input.review.id}`);
  }

  if (nextStatus === 'failed' && errorMessage) {
    throw new Error(errorMessage);
  }
}

export async function updateGbpReviewReplyText(reviewId: string, replyText: string): Promise<void> {
  const cleanText = clampString(replyText, 4000);
  if (!cleanText) throw new Error('Reply text cannot be empty.');
  try {
    await updateDoc(doc(db, 'gbpReviews', reviewId), {
      aiReplyText: cleanText,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `gbpReviews/${reviewId}`);
  }
}

export async function ignoreGbpReview(reviewId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'gbpReviews', reviewId), {
      replyStatus: 'ignored',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `gbpReviews/${reviewId}`);
  }
}

export function subscribeToBusinessAiUsage(
  businessId: string,
  viewerUid: string,
  viewerEmail: string,
  isAdmin: boolean,
  onData: (logs: AiUsageLog[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeClientScopedCollection<AiUsageLog>(
    'aiUsageLogs',
    businessId,
    viewerUid,
    viewerEmail,
    isAdmin,
    (id, raw) => ({ ...(raw as Omit<AiUsageLog, 'id'>), id }),
    (items) => onData([...items].sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt))),
    onError,
  );
}

export function subscribeToAllAiUsage(
  onData: (logs: AiUsageLog[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'aiUsageLogs'), limit(1000)),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => ({ ...(d.data() as Omit<AiUsageLog, 'id'>), id: d.id }))
        .sort((a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}



export function subscribeToBusinessWeeklyReports(
  businessId: string,
  viewerUid: string,
  viewerEmail: string,
  isAdmin: boolean,
  onData: (reports: WeeklyReport[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeClientScopedCollection<WeeklyReport>(
    'weeklyReports',
    businessId,
    viewerUid,
    viewerEmail,
    isAdmin,
    (id, raw) => ({ ...(raw as Omit<WeeklyReport, 'id'>), id }),
    (items) => onData([...items].sort((a, b) => b.weekStart.localeCompare(a.weekStart))),
    onError,
  );
}

export function subscribeToAllWeeklyReports(
  onData: (reports: WeeklyReport[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'weeklyReports'),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => ({ ...(d.data() as Omit<WeeklyReport, 'id'>), id: d.id }))
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

export async function fetchBusinessReportInputs(businessId: string): Promise<{
  qrStands: QrStand[];
  gbpReviews: GbpReview[];
}> {
  const [standsSnap, reviewsSnap] = await Promise.all([
    getDocs(query(collection(db, 'qrStands'), where('businessId', '==', businessId), limit(500))).catch(
      () => null,
    ),
    getDocs(query(collection(db, 'gbpReviews'), where('businessId', '==', businessId), limit(500))).catch(
      () => null,
    ),
  ]);

  const qrStands: QrStand[] = standsSnap
    ? standsSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          businessId: clampString(data.businessId, 128),
          ownerId: clampString(data.ownerId, 128),
          clientEmail: normalizeEmail(String(data.clientEmail || '')),
          slug: clampString(data.slug, 120),
          standCode: clampString(data.standCode, 64),
          name: clampString(data.name, 80) || 'QR Stand',
          placement: clampString(data.placement, 80) || 'Counter',
          slotNumber: Number(data.slotNumber || 1),
          isActive: data.isActive !== false,
          fgColor: clampString(data.fgColor, 20) || '#0F172A',
          bgColor: clampString(data.bgColor, 20) || '#FFFFFF',
          includeLogo: Boolean(data.includeLogo),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      })
    : [];

  const gbpReviews: GbpReview[] = reviewsSnap
    ? reviewsSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          businessId: clampString(data.businessId, 128),
          ownerId: clampString(data.ownerId, 128),
          clientEmail: normalizeEmail(String(data.clientEmail || '')),
          externalReviewId: clampString(data.externalReviewId, 200),
          reviewerName: clampString(data.reviewerName, 120) || 'Google Customer',
          starRating: Math.min(5, Math.max(1, Number(data.starRating || 5))),
          comment: clampString(data.comment, 2000),
          reviewDate: clampString(data.reviewDate, 64) || new Date().toISOString(),
          aiReplyText: clampString(data.aiReplyText, 2000),
          replyStatus: (data.replyStatus as GbpReplyStatus) || 'awaiting_approval',
          aiProvider: clampString(data.aiProvider, 40) || 'gemini',
          aiModelId: clampString(data.aiModelId, 80) || 'gemini-3.1-flash-lite',
          inputTokens: Number(data.inputTokens || 0),
          outputTokens: Number(data.outputTokens || 0),
          totalTokens: Number(data.totalTokens || 0),
          estimatedCostUsd: Number(data.estimatedCostUsd || 0),
          source: (data.source as GbpReview['source']) || 'manual_sync',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      })
    : [];

  return { qrStands, gbpReviews };
}

export async function generateAndSaveWeeklyReport(input: {
  business: Business;
  events: ReviewEvent[];
  qrStands: QrStand[];
  gbpReviews: GbpReview[];
  aiUsageLogs: AiUsageLog[];
  generatedBy: string;
  weekStart: string;
  weekEnd: string;
  startMs: number;
  endMs: number;
  existingReport?: WeeklyReport;
}): Promise<WeeklyReport> {
  const { business, weekStart, weekEnd, startMs, endMs } = input;
  const bizEvents = input.events.filter((ev) => {
    if (ev.businessId !== business.id) return false;
    const ms = getTimestampMs(ev.createdAt);
    return ms >= startMs && ms <= endMs;
  });

  const scanEvents = bizEvents.filter((e) => e.eventType === 'scan');
  const formStartEvents = bizEvents.filter((e) => e.eventType === 'form_start');
  const draftEvents = bizEvents.filter((e) => e.eventType === 'generate');
  const redirectEvents = bizEvents.filter((e) => e.eventType === 'copy_redirect');

  const uniqueSessionIds = new Set<string>();
  bizEvents.forEach((ev, idx) => {
    uniqueSessionIds.add(ev.sessionId || ev.id || `evt-${idx}`);
  });

  const standCounts = new Map<string, { name: string; scans: number }>();
  for (const st of input.qrStands) {
    standCounts.set(st.standCode || st.id, { name: st.name, scans: 0 });
  }
  for (const ev of scanEvents) {
    const key = ev.standCode || ev.standId || 'main-qr';
    const label = ev.standName || (ev.standCode ? `Stand (${ev.standCode})` : 'Primary QR Stand');
    const prev = standCounts.get(key) || { name: label, scans: 0 };
    prev.scans += 1;
    standCounts.set(key, prev);
  }
  const rankedStands = Array.from(standCounts.values()).sort((a, b) => b.scans - a.scans);
  const bestStand = rankedStands[0];
  const lowestStand = rankedStands.length > 0 ? rankedStands[rankedStands.length - 1] : undefined;

  const weekReviews = input.gbpReviews.filter((r) => {
    if (r.businessId !== business.id) return false;
    const ms = Date.parse(r.reviewDate || '') || getTimestampMs(r.createdAt);
    return ms >= startMs && ms <= endMs;
  });

  const ratingSum = weekReviews.reduce((acc, r) => acc + (r.starRating || 0), 0);
  const averageGoogleRating =
    weekReviews.length > 0 ? Number((ratingSum / weekReviews.length).toFixed(2)) : 0;

  const weekLogs = input.aiUsageLogs.filter((l) => {
    if (l.businessId !== business.id) return false;
    const ms = getTimestampMs(l.createdAt);
    return ms >= startMs && ms <= endMs;
  });

  const modelBuckets = new Map<string, WeeklyModelUsageItem>();
  let totalTokens = 0;
  let totalCost = 0;
  let successCount = 0;
  let failedCount = 0;

  for (const log of weekLogs) {
    const provider = log.provider || 'gemini';
    const modelId = log.modelName || 'gemini-3.1-flash-lite';
    const bucketKey = `${provider}::${modelId}`;
    const existingBucket = modelBuckets.get(bucketKey) || {
      provider,
      modelId,
      count: 0,
      successCount: 0,
      failedCount: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };
    existingBucket.count += 1;
    if (log.status === 'failed') {
      existingBucket.failedCount += 1;
      failedCount += 1;
    } else {
      existingBucket.successCount += 1;
      successCount += 1;
    }
    existingBucket.totalTokens += log.totalTokens || 0;
    existingBucket.estimatedCostUsd = Number(
      (existingBucket.estimatedCostUsd + (log.estimatedCostUsd || 0)).toFixed(6),
    );
    totalTokens += log.totalTokens || 0;
    totalCost = Number((totalCost + (log.estimatedCostUsd || 0)).toFixed(6));
    modelBuckets.set(bucketKey, existingBucket);
  }

  const reportId = `${business.id}_${weekStart}`;
  const now = serverTimestamp();

  const payload = {
    businessId: business.id,
    businessName: clampString(business.name, 120) || 'Business',
    ownerId: business.ownerId,
    clientEmail: normalizeEmail(business.clientEmail || ''),
    weekStart,
    weekEnd,
    reviewGenMetrics: {
      totalScans: scanEvents.length,
      uniqueSessions: uniqueSessionIds.size,
      formsStarted: formStartEvents.length,
      draftsGenerated: draftEvents.length,
      googleRedirects: redirectEvents.length,
      confirmedGoogleReviews: weekReviews.length,
      averageGoogleRating,
      bestStandName: bestStand?.name || 'N/A',
      bestStandScans: bestStand?.scans || 0,
      lowestStandName: lowestStand?.name || 'N/A',
      lowestStandScans: lowestStand?.scans || 0,
    },
    autoReplyMetrics: {
      totalNewReviews: weekReviews.length,
      aiRepliesGenerated: weekReviews.filter((r) => Boolean(r.aiReplyText)).length,
      autoPublished: weekReviews.filter((r) => r.replyStatus === 'auto_published').length,
      waitingApproval: weekReviews.filter((r) => r.replyStatus === 'awaiting_approval').length,
      manuallyApproved: weekReviews.filter(
        (r) => r.replyStatus === 'manually_approved' || r.replyStatus === 'published',
      ).length,
      failedReplies: weekReviews.filter((r) => r.replyStatus === 'failed').length,
      ignoredReviews: weekReviews.filter((r) => r.replyStatus === 'ignored').length,
    },
    aiUsageMetrics: {
      totalRequests: weekLogs.length,
      successfulRequests: successCount,
      failedRequests: failedCount,
      totalTokens,
      estimatedCostUsd: totalCost,
      byModel: Array.from(modelBuckets.values()),
    },
    dispatchedToEmails: input.existingReport?.dispatchedToEmails ?? [],
    ...(input.existingReport?.dispatchedAt
      ? { dispatchedAt: input.existingReport.dispatchedAt }
      : {}),
    generatedBy: clampString(input.generatedBy, 128) || 'system',
    createdAt: input.existingReport?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'weeklyReports', reportId), payload);
    return { ...payload, id: reportId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `weeklyReports/${reportId}`);
  }
}

export async function markWeeklyReportDispatched(
  report: WeeklyReport,
  recipientEmails: string[],
): Promise<void> {
  const cleanEmails = recipientEmails
    .map((e) => normalizeEmail(e))
    .filter((e) => Boolean(e) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    .slice(0, 15);
  if (cleanEmails.length === 0) {
    throw new Error('Add at least one valid contact email address before dispatching.');
  }
  try {
    await updateDoc(doc(db, 'weeklyReports', report.id), {
      dispatchedToEmails: cleanEmails,
      dispatchedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `weeklyReports/${report.id}`);
  }
}

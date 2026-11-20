import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../utils/apiClient';
import {
  DEFAULT_ENABLED_FEATURES,
  DEFAULT_SEO_KEYWORDS_BY_CATEGORY,
} from '../data/categoryPresets';
import type {
  AdminEmail,
  AdminUser,
  Business,
  BusinessBranding,
  BusinessCategory,
  BusinessStats,
  ClientAccessLevel,
  EnabledFeatures,
  FeedbackQuestion,
  PublicProfile,
  QrConfig,
  ReviewEvent,
  ReviewEventType,
} from '../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = (
  import.meta.env.VITE_ADMIN_EMAIL || 'harkiratcourse36@gmail.com'
)
  .trim()
  .toLowerCase();

export function sanitizeSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 76);
  if (cleaned.length >= 2) {
    return cleaned;
  }
  return `biz-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 120);
}

export function generateRandomToken(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function clampString(val: unknown, max: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}

function sanitizeEnabledFeatures(features?: Partial<EnabledFeatures>): EnabledFeatures {
  return {
    aiReviewDrafts: features?.aiReviewDrafts ?? DEFAULT_ENABLED_FEATURES.aiReviewDrafts,
    customQuestions: features?.customQuestions ?? DEFAULT_ENABLED_FEATURES.customQuestions,
    pdfPosterExport: features?.pdfPosterExport ?? DEFAULT_ENABLED_FEATURES.pdfPosterExport,
    analyticsView: features?.analyticsView ?? DEFAULT_ENABLED_FEATURES.analyticsView,
  };
}

function sanitizeAccessLevel(level?: unknown): ClientAccessLevel {
  if (level === 'read_only' || level === 'qr_and_questions' || level === 'full') {
    return level;
  }
  return 'full';
}

function sanitizeBranding(branding: BusinessBranding): BusinessBranding {
  return {
    primaryColor: clampString(branding.primaryColor, 20) || '#0F766E',
    secondaryColor: clampString(branding.secondaryColor, 20) || '#0F172A',
    welcomeMessage: clampString(branding.welcomeMessage, 240),
    thankYouMessage: clampString(branding.thankYouMessage, 240),
    defaultReviewStyle:
      branding.defaultReviewStyle === 'short' ||
      branding.defaultReviewStyle === 'detailed' ||
      branding.defaultReviewStyle === 'professional'
        ? branding.defaultReviewStyle
        : 'short',
  };
}

function sanitizeQrConfig(qrConfig: QrConfig): QrConfig {
  return {
    isActive: Boolean(qrConfig.isActive),
    fgColor: clampString(qrConfig.fgColor, 20) || '#0F172A',
    bgColor: clampString(qrConfig.bgColor, 20) || '#FFFFFF',
    token: clampString(qrConfig.token, 64) || generateRandomToken(),
    includeLogo: Boolean(qrConfig.includeLogo),
  };
}

function sanitizeQuestions(questions: FeedbackQuestion[]): FeedbackQuestion[] {
  return questions.slice(0, 25).map((q, idx) => ({
    id: clampString(q.id, 64) || `q-${idx + 1}`,
    prompt: clampString(q.prompt, 180) || 'Untitled Question',
    type: q.type === 'single' || q.type === 'multiple' || q.type === 'text' ? q.type : 'single',
    options: Array.isArray(q.options)
      ? q.options
          .map((opt) => clampString(opt, 80))
          .filter(Boolean)
          .slice(0, 20)
      : [],
    required: Boolean(q.required),
    ...(q.placeholder ? { placeholder: clampString(q.placeholder, 160) } : {}),
  }));
}

function sanitizeSeoKeywords(keywords?: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of keywords) {
    if (typeof item !== 'string') continue;
    const trimmed = clampString(item, 60);
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      clean.push(trimmed);
      if (clean.length >= 15) break;
    }
  }
  return clean;
}

export async function fetchAutoSeoKeywords(input: {
  businessName: string;
  category: BusinessCategory;
  address?: string;
}): Promise<string[]> {
  try {
    const res = await apiFetch('/api/generate-seo-keywords', {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({
        businessName: input.businessName,
        category: input.category,
        address: input.address ?? '',
      }),
    });
    if (!res.ok) {
      return DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category] ?? [];
    }
    const data = (await res.json()) as { keywords?: unknown };
    const cleaned = sanitizeSeoKeywords(data.keywords);
    return cleaned.length > 0
      ? cleaned
      : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category] ?? [];
  } catch {
    return DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category] ?? [];
  }
}

function hydrateBusiness(id: string, raw: Record<string, unknown>): Business {
  const data = raw as Partial<Business>;
  const category = (data.category as BusinessCategory) || 'Other Businesses';
  const hydratedKeywords = sanitizeSeoKeywords(data.seoKeywords);
  return {
    id,
    ownerId: data.ownerId || '',
    ownerName: clampString(data.ownerName, 120),
    clientEmail: normalizeEmail(data.clientEmail || ''),
    clientAccessLevel: sanitizeAccessLevel(data.clientAccessLevel),
    enabledFeatures: sanitizeEnabledFeatures(data.enabledFeatures),
    slug: data.slug || '',
    name: data.name || 'Business',
    category,
    address: data.address || '',
    phone: data.phone || '',
    contactEmail: data.contactEmail || '',
    website: clampString(data.website, 300),
    googleReviewUrl: data.googleReviewUrl || '',
    logoDataUrl: data.logoDataUrl || '',
    branding: data.branding || {
      primaryColor: '#0F766E',
      secondaryColor: '#0F172A',
      welcomeMessage: '',
      thankYouMessage: '',
      defaultReviewStyle: 'short',
    },
    qrConfig: data.qrConfig || {
      isActive: true,
      fgColor: '#0F172A',
      bgColor: '#FFFFFF',
      token: 'v1',
      includeLogo: false,
    },
    questions: Array.isArray(data.questions) ? data.questions : [],
    seoKeywords:
      hydratedKeywords.length > 0
        ? hydratedKeywords
        : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[category] ?? [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function checkIsAdmin(user: User): Promise<boolean> {
  const emailLower = normalizeEmail(user.email || '');
  if (
    BOOTSTRAPPED_ADMIN_EMAIL &&
    user.emailVerified &&
    emailLower === BOOTSTRAPPED_ADMIN_EMAIL
  ) {
    return true;
  }
  try {
    const checks: Promise<boolean>[] = [
      getDoc(doc(db, 'admins', user.uid))
        .then((snap) => snap.exists())
        .catch(() => false),
    ];
    if (emailLower) {
      checks.push(
        getDoc(doc(db, 'adminEmails', emailLower))
          .then((snap) => snap.exists())
          .catch(() => false),
      );
    }
    const result = await Promise.race([
      Promise.all(checks).then((flags) => flags.some(Boolean)),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 8000);
      }),
    ]);
    return result;
  } catch {
    return false;
  }
}

export function subscribeToAllBusinesses(
  onData: (businesses: Business[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'businesses';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) =>
        hydrateBusiness(docSnap.id, docSnap.data() as Record<string, unknown>),
      );
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToClientBusinesses(
  userUid: string,
  userEmail: string,
  onData: (businesses: Business[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const normalizedEmail = normalizeEmail(userEmail);
  const byOwner = new Map<string, Business>();
  const byEmail = new Map<string, Business>();
  let ownerReady = false;
  let emailReady = !normalizedEmail;

  const emitMerged = () => {
    if (!ownerReady || !emailReady) return;
    const combined = new Map<string, Business>();
    byOwner.forEach((v, k) => combined.set(k, v));
    byEmail.forEach((v, k) => combined.set(k, v));
    onData(Array.from(combined.values()));
  };

  const qOwner = query(collection(db, 'businesses'), where('ownerId', '==', userUid));
  const unsubOwner = onSnapshot(
    qOwner,
    (snapshot) => {
      byOwner.clear();
      snapshot.docs.forEach((d) => {
        byOwner.set(d.id, hydrateBusiness(d.id, d.data() as Record<string, unknown>));
      });
      ownerReady = true;
      emitMerged();
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'businesses');
      } catch {
        // logged
      }
    },
  );

  let unsubEmail: Unsubscribe = () => {};
  if (normalizedEmail) {
    const qEmail = query(
      collection(db, 'businesses'),
      where('clientEmail', '==', normalizedEmail),
    );
    unsubEmail = onSnapshot(
      qEmail,
      (snapshot) => {
        byEmail.clear();
        snapshot.docs.forEach((d) => {
          byEmail.set(d.id, hydrateBusiness(d.id, d.data() as Record<string, unknown>));
        });
        emailReady = true;
        emitMerged();
      },
      (error) => {
        if (onError) onError(error);
        try {
          handleFirestoreError(error, OperationType.LIST, 'businesses');
        } catch {
          // logged
        }
      },
    );
  }

  return () => {
    unsubOwner();
    unsubEmail();
  };
}

export function subscribeToAllBusinessStats(
  onData: (statsMap: Record<string, BusinessStats>) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'businessStats'),
    (snapshot) => {
      const map: Record<string, BusinessStats> = {};
      snapshot.docs.forEach((docSnap) => {
        map[docSnap.id] = docSnap.data() as BusinessStats;
      });
      onData(map);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'businessStats');
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToBusinessStats(
  businessId: string,
  onData: (stats: BusinessStats | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `businessStats/${businessId}`;
  return onSnapshot(
    doc(db, 'businessStats', businessId),
    (docSnap) => {
      if (!docSnap.exists()) {
        onData(null);
      } else {
        onData(docSnap.data() as BusinessStats);
      }
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToAllEvents(
  onData: (events: ReviewEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'reviewEvents';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(250));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReviewEvent[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ReviewEvent, 'id'>;
        return {
          ...data,
          id: docSnap.id,
        };
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // logged
      }
    },
  );
}

export function subscribeToAdmins(
  onData: (admins: AdminUser[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as AdminUser));
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export function subscribeToAdminEmails(
  onData: (adminEmails: AdminEmail[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'adminEmails'),
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as AdminEmail));
    },
    (error) => {
      if (onError) onError(error);
    },
  );
}

export async function grantAdminByUid(uid: string, email: string, addedByUid: string): Promise<void> {
  const cleanUid = clampString(uid, 128);
  const cleanEmail = normalizeEmail(email);
  const path = `admins/${cleanUid}`;
  try {
    await setDoc(doc(db, 'admins', cleanUid), {
      uid: cleanUid,
      email: cleanEmail,
      addedBy: addedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function grantAdminByEmail(email: string, addedByUid: string): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid Gmail or email address.');
  }
  const path = `adminEmails/${cleanEmail}`;
  try {
    await setDoc(doc(db, 'adminEmails', cleanEmail), {
      email: cleanEmail,
      addedBy: addedByUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function revokeAdmin(uid: string): Promise<void> {
  const path = `admins/${uid}`;
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function revokeAdminByEmail(email: string): Promise<void> {
  const cleanEmail = normalizeEmail(email);
  const path = `adminEmails/${cleanEmail}`;
  try {
    await deleteDoc(doc(db, 'adminEmails', cleanEmail));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function checkSlugAvailability(
  candidateSlug: string,
  currentBusinessId?: string,
): Promise<{ available: boolean; normalizedSlug: string }> {
  const normalizedSlug = sanitizeSlug(candidateSlug);
  const path = `publicProfiles/${normalizedSlug}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', normalizedSlug));
    if (!snap.exists()) {
      return { available: true, normalizedSlug };
    }
    const data = snap.data() as PublicProfile;
    if (currentBusinessId && data.businessId === currentBusinessId) {
      return { available: true, normalizedSlug };
    }
    return { available: false, normalizedSlug };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createBusiness(
  ownerId: string,
  input: {
    ownerName?: string;
    clientEmail?: string;
    clientAccessLevel?: ClientAccessLevel;
    enabledFeatures?: EnabledFeatures;
    name: string;
    slug: string;
    category: BusinessCategory;
    address: string;
    phone: string;
    contactEmail: string;
    website?: string;
    googleReviewUrl: string;
    logoDataUrl: string;
    branding: BusinessBranding;
    qrConfig: QrConfig;
    questions: FeedbackQuestion[];
    seoKeywords?: string[];
  },
): Promise<string> {
  const businessRef = doc(collection(db, 'businesses'));
  const businessId = businessRef.id;
  let finalSlug = sanitizeSlug(input.slug || input.name);

  const availability = await checkSlugAvailability(finalSlug);
  if (!availability.available) {
    finalSlug = `${finalSlug.slice(0, 68)}-${generateRandomToken(4)}`;
  }

  const now = serverTimestamp();
  const cleanName = clampString(input.name, 120) || 'My Business';
  const cleanOwnerName = clampString(input.ownerName, 120);
  const cleanWebsite = clampString(input.website, 300);
  const cleanGoogleUrl = clampString(input.googleReviewUrl, 500);
  const cleanLogo = clampString(input.logoDataUrl, 350000);
  const cleanClientEmail = normalizeEmail(input.clientEmail || '');
  const cleanAccessLevel = sanitizeAccessLevel(input.clientAccessLevel);
  const cleanFeatures = sanitizeEnabledFeatures(input.enabledFeatures);
  const cleanBranding = sanitizeBranding(input.branding);
  const cleanQrConfig = sanitizeQrConfig(input.qrConfig);
  const cleanQuestions = sanitizeQuestions(input.questions);
  const providedKeywords = sanitizeSeoKeywords(input.seoKeywords);
  const cleanSeoKeywords =
    providedKeywords.length > 0
      ? providedKeywords
      : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[input.category] ?? [];

  const businessPayload = {
    ownerId: clampString(ownerId, 128),
    ...(cleanOwnerName ? { ownerName: cleanOwnerName } : {}),
    clientEmail: cleanClientEmail,
    clientAccessLevel: cleanAccessLevel,
    enabledFeatures: cleanFeatures,
    slug: finalSlug,
    name: cleanName,
    category: input.category,
    address: clampString(input.address, 240),
    phone: clampString(input.phone, 40),
    contactEmail: clampString(input.contactEmail, 120),
    ...(cleanWebsite ? { website: cleanWebsite } : {}),
    googleReviewUrl: cleanGoogleUrl,
    logoDataUrl: cleanLogo,
    branding: cleanBranding,
    qrConfig: cleanQrConfig,
    questions: cleanQuestions,
    seoKeywords: cleanSeoKeywords,
    createdAt: now,
    updatedAt: now,
  };

  const publicPayload = {
    businessId,
    ownerId: clampString(ownerId, 128),
    slug: finalSlug,
    name: cleanName,
    category: input.category,
    googleReviewUrl: cleanGoogleUrl,
    logoDataUrl: cleanLogo,
    enabledFeatures: cleanFeatures,
    branding: cleanBranding,
    qrConfig: cleanQrConfig,
    questions: cleanQuestions,
    seoKeywords: cleanSeoKeywords,
    createdAt: now,
    updatedAt: now,
  };

  const statsPayload = {
    businessId,
    ownerId: clampString(ownerId, 128),
    clientEmail: cleanClientEmail,
    slug: finalSlug,
    scans: 0,
    generated: 0,
    redirects: 0,
    styleShort: 0,
    styleDetailed: 0,
    styleProfessional: 0,
    updatedAt: now,
  };

  const batch = writeBatch(db);
  batch.set(businessRef, businessPayload);
  batch.set(doc(db, 'publicProfiles', finalSlug), publicPayload);
  batch.set(doc(db, 'businessStats', businessId), statsPayload);

  try {
    await batch.commit();
    return businessId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `businesses/${businessId}`);
  }
}

export async function updateBusiness(
  current: Business,
  updates: Partial<{
    ownerName: string;
    clientEmail: string;
    clientAccessLevel: ClientAccessLevel;
    enabledFeatures: EnabledFeatures;
    slug: string;
    name: string;
    category: BusinessCategory;
    address: string;
    phone: string;
    contactEmail: string;
    website: string;
    googleReviewUrl: string;
    logoDataUrl: string;
    branding: BusinessBranding;
    qrConfig: QrConfig;
    questions: FeedbackQuestion[];
    seoKeywords: string[];
  }>,
  options: { isAdmin?: boolean } = {},
): Promise<string> {
  const isAdmin = Boolean(options.isAdmin);
  const access = isAdmin ? 'full' : current.clientAccessLevel;
  const now = serverTimestamp();
  const batch = writeBatch(db);

  // Scoped update for 'qr_and_questions' tier clients
  if (!isAdmin && access === 'qr_and_questions') {
    const nextQrConfig = sanitizeQrConfig(updates.qrConfig ?? current.qrConfig);
    const nextQuestions = sanitizeQuestions(updates.questions ?? current.questions);
    batch.update(doc(db, 'businesses', current.id), {
      qrConfig: nextQrConfig,
      questions: nextQuestions,
      updatedAt: now,
    });
    batch.update(doc(db, 'publicProfiles', current.slug), {
      qrConfig: nextQrConfig,
      questions: nextQuestions,
      updatedAt: now,
    });
    try {
      await batch.commit();
      return current.slug;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `businesses/${current.id}`);
    }
  }

  const nextSlug = updates.slug ? sanitizeSlug(updates.slug) : current.slug;
  const slugChanged = nextSlug !== current.slug;

  if (slugChanged) {
    const check = await checkSlugAvailability(nextSlug, current.id);
    if (!check.available) {
      throw new Error(`The URL slug "${nextSlug}" is already taken by another business.`);
    }
  }

  const nextName = clampString(updates.name ?? current.name, 120) || current.name;
  const nextCategory = updates.category ?? current.category;
  const nextGoogleUrl = clampString(updates.googleReviewUrl ?? current.googleReviewUrl, 500);
  const nextLogo = clampString(updates.logoDataUrl ?? current.logoDataUrl, 350000);
  const nextBranding = sanitizeBranding(updates.branding ?? current.branding);
  const nextQrConfig = sanitizeQrConfig(updates.qrConfig ?? current.qrConfig);
  const nextQuestions = sanitizeQuestions(updates.questions ?? current.questions);
  const nextSeoKeywords = sanitizeSeoKeywords(
    updates.seoKeywords ?? current.seoKeywords ?? DEFAULT_SEO_KEYWORDS_BY_CATEGORY[nextCategory],
  );

  const nextClientEmail = isAdmin
    ? normalizeEmail(updates.clientEmail ?? current.clientEmail)
    : current.clientEmail;
  const nextAccessLevel = isAdmin
    ? sanitizeAccessLevel(updates.clientAccessLevel ?? current.clientAccessLevel)
    : current.clientAccessLevel;
  const nextFeatures = isAdmin
    ? sanitizeEnabledFeatures(updates.enabledFeatures ?? current.enabledFeatures)
    : current.enabledFeatures;

  const businessUpdates: Record<string, unknown> = {
    slug: nextSlug,
    name: nextName,
    category: nextCategory,
    address: clampString(updates.address ?? current.address, 240),
    phone: clampString(updates.phone ?? current.phone, 40),
    contactEmail: clampString(updates.contactEmail ?? current.contactEmail, 120),
    googleReviewUrl: nextGoogleUrl,
    logoDataUrl: nextLogo,
    branding: nextBranding,
    qrConfig: nextQrConfig,
    questions: nextQuestions,
    seoKeywords: nextSeoKeywords,
    updatedAt: now,
  };

  if (updates.ownerName !== undefined) {
    businessUpdates.ownerName = clampString(updates.ownerName, 120);
  }
  if (updates.website !== undefined) {
    businessUpdates.website = clampString(updates.website, 300);
  }

  if (isAdmin) {
    businessUpdates.clientEmail = nextClientEmail;
    businessUpdates.clientAccessLevel = nextAccessLevel;
    businessUpdates.enabledFeatures = nextFeatures;
  }

  batch.update(doc(db, 'businesses', current.id), businessUpdates);

  if (slugChanged) {
    batch.delete(doc(db, 'publicProfiles', current.slug));
    batch.set(doc(db, 'publicProfiles', nextSlug), {
      businessId: current.id,
      ownerId: current.ownerId,
      slug: nextSlug,
      name: nextName,
      category: nextCategory,
      googleReviewUrl: nextGoogleUrl,
      logoDataUrl: nextLogo,
      enabledFeatures: nextFeatures,
      branding: nextBranding,
      qrConfig: nextQrConfig,
      questions: nextQuestions,
      seoKeywords: nextSeoKeywords,
      createdAt: current.createdAt ?? now,
      updatedAt: now,
    });
  } else {
    const publicUpdates: Record<string, unknown> = {
      name: nextName,
      category: nextCategory,
      googleReviewUrl: nextGoogleUrl,
      logoDataUrl: nextLogo,
      branding: nextBranding,
      qrConfig: nextQrConfig,
      questions: nextQuestions,
      seoKeywords: nextSeoKeywords,
      updatedAt: now,
    };
    if (isAdmin) {
      publicUpdates.enabledFeatures = nextFeatures;
    }
    batch.update(doc(db, 'publicProfiles', current.slug), publicUpdates);
  }

  if (slugChanged || (isAdmin && nextClientEmail !== current.clientEmail)) {
    const statsUpdates: Record<string, unknown> = {
      slug: nextSlug,
      updatedAt: now,
    };
    if (isAdmin) {
      statsUpdates.clientEmail = nextClientEmail;
    }
    batch.update(doc(db, 'businessStats', current.id), statsUpdates);
  }

  try {
    await batch.commit();
    return nextSlug;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `businesses/${current.id}`);
  }
}

export async function deleteBusiness(business: Business): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'businesses', business.id));
  batch.delete(doc(db, 'publicProfiles', business.slug));
  batch.delete(doc(db, 'businessStats', business.id));
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `businesses/${business.id}`);
  }
}

export async function getPublicProfileBySlug(slug: string): Promise<{
  status: 'found' | 'not_found' | 'paused';
  profile?: PublicProfile;
}> {
  const normalized = sanitizeSlug(slug);
  const path = `publicProfiles/${normalized}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', normalized));
    if (!snap.exists()) {
      return { status: 'not_found' };
    }
    const raw = snap.data() as Partial<PublicProfile>;
    const profile: PublicProfile = {
      businessId: raw.businessId || '',
      ownerId: raw.ownerId || '',
      slug: raw.slug || normalized,
      name: raw.name || 'Business',
      category: raw.category || 'Other Businesses',
      googleReviewUrl: raw.googleReviewUrl || '',
      logoDataUrl: raw.logoDataUrl || '',
      enabledFeatures: sanitizeEnabledFeatures(raw.enabledFeatures),
      branding: raw.branding || {
        primaryColor: '#0F766E',
        secondaryColor: '#0F172A',
        welcomeMessage: '',
        thankYouMessage: '',
        defaultReviewStyle: 'short',
      },
      qrConfig: raw.qrConfig || {
        isActive: false,
        fgColor: '#0F172A',
        bgColor: '#FFFFFF',
        token: 'v1',
        includeLogo: false,
      },
      questions: Array.isArray(raw.questions) ? raw.questions : [],
      seoKeywords: (() => {
        const kw = sanitizeSeoKeywords(raw.seoKeywords);
        const cat = (raw.category as BusinessCategory) || 'Other Businesses';
        return kw.length > 0 ? kw : DEFAULT_SEO_KEYWORDS_BY_CATEGORY[cat] ?? [];
      })(),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
    if (!profile.qrConfig?.isActive) {
      return { status: 'paused' };
    }
    return { status: 'found', profile };
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('permission') || msg.includes('insufficient')) {
      return { status: 'paused' };
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function recordReviewEvent(
  profile: PublicProfile,
  eventType: ReviewEventType,
  details: {
    reviewStyle?: string;
    sentiment?: string;
    selectedHighlights?: string[];
  } = {},
): Promise<void> {
  if (!profile.qrConfig?.isActive || profile.ownerId === 'demo') {
    return;
  }

  const eventRef = doc(collection(db, 'reviewEvents'));
  const payload = {
    businessId: profile.businessId,
    ownerId: profile.ownerId,
    slug: profile.slug,
    eventType,
    reviewStyle: clampString(details.reviewStyle ?? '', 40),
    sentiment: clampString(details.sentiment ?? '', 40),
    selectedHighlights: (details.selectedHighlights ?? [])
      .map((s) => clampString(s, 60))
      .filter(Boolean)
      .slice(0, 15),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(eventRef, payload);
  } catch {
    // Non-blocking
  }

  const statsUpdate: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (eventType === 'scan') {
    statsUpdate.scans = increment(1);
  } else if (eventType === 'generate') {
    statsUpdate.generated = increment(1);
    if (details.reviewStyle === 'short') statsUpdate.styleShort = increment(1);
    if (details.reviewStyle === 'detailed') statsUpdate.styleDetailed = increment(1);
    if (details.reviewStyle === 'professional') statsUpdate.styleProfessional = increment(1);
  } else if (eventType === 'copy_redirect') {
    statsUpdate.redirects = increment(1);
  }

  try {
    await updateDoc(doc(db, 'businessStats', profile.businessId), statsUpdate);
  } catch {
    // Non-blocking if businessStats doc is absent for legacy record
  }
}

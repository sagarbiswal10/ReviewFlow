import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { Business, FeedbackQuestion, TenantWebAppConfig } from '../types';

const tenantAppCache = new Map<string, FirebaseApp>();
const tenantDbCache = new Map<string, Firestore>();

export function getTenantFirestore(
  businessId: string,
  config: TenantWebAppConfig,
): Firestore | null {
  if (!config?.projectId || !config?.apiKey || !config?.appId) {
    return null;
  }

  const cacheKey = `${businessId}:${config.projectId}:${config.databaseId || '(default)'}`;
  const existingDb = tenantDbCache.get(cacheKey);
  if (existingDb) return existingDb;

  try {
    const appName = `tenant-${businessId}-${config.projectId}`.slice(0, 64);
    let app = tenantAppCache.get(appName) || getApps().find((a) => a.name === appName);
    if (!app) {
      app = initializeApp(
        {
          apiKey: config.apiKey,
          authDomain: config.authDomain || `${config.projectId}.firebaseapp.com`,
          projectId: config.projectId,
          appId: config.appId,
          ...(config.storageBucket ? { storageBucket: config.storageBucket } : {}),
        },
        appName,
      );
      tenantAppCache.set(appName, app);
    }

    const db =
      config.databaseId && config.databaseId !== '(default)'
        ? getFirestore(app, config.databaseId)
        : getFirestore(app);
    tenantDbCache.set(cacheKey, db);
    return db;
  } catch {
    return null;
  }
}

export async function syncBusinessSchemaToTenantFirestore(
  business: Business,
  config: TenantWebAppConfig,
): Promise<{ synced: boolean; error?: string }> {
  const tenantDb = getTenantFirestore(business.id, config);
  if (!tenantDb) {
    return { synced: false, error: 'Invalid tenant Firebase web configuration.' };
  }

  try {
    const bizRef = doc(tenantDb, 'businesses', business.id);
    await setDoc(
      bizRef,
      {
        business_id: business.id,
        owner_uid: business.ownerId,
        business_name: business.name,
        category: business.category,
        address: business.address,
        contact_details: {
          owner_name: business.ownerName || '',
          phone: business.phone,
          email: business.contactEmail,
          website: business.website || '',
        },
        google_review_url: business.googleReviewUrl,
        branding: business.branding,
        active: business.qrConfig.isActive,
        created_at: serverTimestamp(),
      },
      { merge: true },
    );

    await setDoc(
      doc(tenantDb, 'businesses', business.id, 'qr_codes', `qr-${business.qrConfig.token}`),
      {
        qr_id: `qr-${business.qrConfig.token}`,
        qr_name: `${business.name} Primary QR`,
        destination_url: `/review/${business.slug}?v=${business.qrConfig.token}`,
        active: business.qrConfig.isActive,
        created_at: serverTimestamp(),
      },
      { merge: true },
    );

    await Promise.all(
      business.questions.map((q, index) =>
        setDoc(
          doc(tenantDb, 'businesses', business.id, 'questions', q.id),
          {
            question_id: q.id,
            question_text: q.prompt,
            question_type: q.type,
            options: q.options,
            required: q.required,
            display_order: index,
          },
          { merge: true },
        ),
      ),
    );

    return { synced: true };
  } catch (err) {
    return {
      synced: false,
      error:
        err instanceof Error
          ? err.message
          : 'Unable to write initial schema to tenant Firestore. Check tenant security rules.',
    };
  }
}

export async function fetchTenantQuestions(
  businessId: string,
  config: TenantWebAppConfig | null | undefined,
): Promise<FeedbackQuestion[] | null> {
  if (!config) return null;
  const tenantDb = getTenantFirestore(businessId, config);
  if (!tenantDb) return null;

  try {
    const qRef = query(
      collection(tenantDb, 'businesses', businessId, 'questions'),
      orderBy('display_order', 'asc'),
    );
    const snap = await getDocs(qRef);
    if (snap.empty) return null;

    return snap.docs.map((d) => {
      const data = d.data() as {
        question_id?: string;
        question_text?: string;
        question_type?: 'single' | 'multiple' | 'text';
        options?: string[];
        required?: boolean;
      };
      return {
        id: data.question_id || d.id,
        prompt: data.question_text || 'Question',
        type: data.question_type || 'single',
        options: Array.isArray(data.options) ? data.options : [],
        required: Boolean(data.required),
      };
    });
  } catch {
    return null;
  }
}

export async function recordTenantCustomerSubmission(input: {
  businessId: string;
  config: TenantWebAppConfig | null | undefined;
  customerAnswers: Record<string, string[] | string>;
  selectedServices: string[];
  generatedText: string;
  modelName: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}): Promise<void> {
  if (!input.config) return;
  const tenantDb = getTenantFirestore(input.businessId, input.config);
  if (!tenantDb) return;

  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const feedbackId = `fb_${suffix}`;
  const reviewId = `rev_${suffix}`;
  const requestId = `req_${suffix}`;

  try {
    await Promise.allSettled([
      setDoc(doc(tenantDb, 'businesses', input.businessId, 'feedback', feedbackId), {
        feedback_id: feedbackId,
        customer_answers: input.customerAnswers,
        selected_services: input.selectedServices,
        submitted_at: serverTimestamp(),
      }),
      setDoc(doc(tenantDb, 'businesses', input.businessId, 'review_drafts', reviewId), {
        review_id: reviewId,
        generated_text: input.generatedText.slice(0, 3000),
        model_name: input.modelName,
        created_at: serverTimestamp(),
      }),
      setDoc(doc(tenantDb, 'businesses', input.businessId, 'usage_logs', requestId), {
        request_id: requestId,
        model_name: input.modelName,
        input_tokens: input.usage.inputTokens,
        output_tokens: input.usage.outputTokens,
        total_tokens: input.usage.totalTokens,
        status: 'success',
        created_at: serverTimestamp(),
      }),
    ]);
  } catch {
    // Non-blocking: tenant Firestore writes run best-effort without disrupting customer Google handoff
  }
}

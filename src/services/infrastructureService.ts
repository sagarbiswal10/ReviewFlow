import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getApiBaseUrl } from '../utils/apiClient';
import type {
  AdminInfrastructureOverview,
  AiUsageLogRecord,
  Business,
  BusinessAiSummary,
  BusinessProvisioningSummary,
  TenantMonitoringSummary,
  TenantTemplatesBundle,
  TenantWebAppConfig,
} from '../types';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (user) {
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const baseUrl = getApiBaseUrl();
  const targetUrl = /^https?:\/\//i.test(url) ? url : `${baseUrl}${url}`;
  const res = await fetch(targetUrl, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json;
}

export async function fetchProvisioningTemplates(): Promise<TenantTemplatesBundle> {
  return apiJson('/api/provisioning/templates');
}

export async function fetchProvisioningStatus(businessId: string): Promise<{
  provisioning: BusinessProvisioningSummary | null;
}> {
  return apiJson(`/api/provisioning/status/${encodeURIComponent(businessId)}`);
}

export async function startProvisioning(input: {
  businessId: string;
  businessName: string;
  region?: string;
}): Promise<{ accepted: boolean; provisioning: BusinessProvisioningSummary }> {
  return apiJson('/api/provisioning/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function retryProvisioning(input: {
  businessId: string;
  businessName: string;
  region?: string;
}): Promise<{ accepted: boolean; provisioning: BusinessProvisioningSummary }> {
  return apiJson('/api/provisioning/retry', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function connectCustomerFirebase(input: {
  businessId: string;
  region?: string;
  webAppConfig: TenantWebAppConfig;
}): Promise<{ provisioning: BusinessProvisioningSummary }> {
  return apiJson('/api/provisioning/connect-customer', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchTenantMonitoring(businessId: string): Promise<{
  monitoring: TenantMonitoringSummary;
}> {
  return apiJson(`/api/provisioning/monitoring/${encodeURIComponent(businessId)}`);
}

export async function validateGeminiKey(
  apiKey: string,
  modelName?: string,
): Promise<{ valid: boolean; modelName: string; maskedKey: string }> {
  return apiJson('/api/ai/validate-key', {
    method: 'POST',
    body: JSON.stringify({ apiKey, modelName }),
  });
}

export async function connectBusinessGeminiKey(input: {
  businessId: string;
  apiKey: string;
  modelName?: string;
}): Promise<{ ai: BusinessAiSummary }> {
  return apiJson('/api/ai/connect', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateBusinessGeminiModel(input: {
  businessId: string;
  modelName: string;
}): Promise<{ ai: BusinessAiSummary; allowedModels: string[] }> {
  return apiJson('/api/ai/model', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchAiStatus(businessId: string): Promise<{
  ai: BusinessAiSummary;
  allowedModels: string[];
}> {
  return apiJson(`/api/ai/status/${encodeURIComponent(businessId)}`);
}

export async function fetchAiUsage(businessId: string): Promise<{
  summary: BusinessAiSummary;
  logs: AiUsageLogRecord[];
}> {
  return apiJson(`/api/ai/usage/${encodeURIComponent(businessId)}`);
}

export async function fetchAdminInfrastructureOverview(): Promise<AdminInfrastructureOverview> {
  return apiJson('/api/admin/infrastructure-overview');
}

// Mirror non-secret infrastructure summary to Central Firestore (NEVER writes raw/encrypted API keys)
export async function syncNonSecretIntegrationToCentral(input: {
  business: Business;
  provisioning?: BusinessProvisioningSummary | null;
  ai?: BusinessAiSummary | null;
  alertThresholds?: { tokenSpikeLimit: number };
}): Promise<void> {
  const { business, provisioning, ai, alertThresholds } = input;
  try {
    await setDoc(
      doc(db, 'businessIntegrations', business.id),
      {
        businessId: business.id,
        ownerId: business.ownerId,
        clientEmail: business.clientEmail || '',
        firebaseProjectId: provisioning?.projectId || business.tenantFirebase?.projectId || '',
        firebaseOwnershipModel: provisioning?.ownershipModel || 'customer_owned',
        firebaseProvisioningStatus: provisioning?.status || 'not_started',
        aiConnectionStatus: ai?.connectionStatus || 'not_connected',
        maskedGeminiKey: ai?.maskedKey || '',
        modelName: ai?.modelName || import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite',
        totalTokensUsed: ai?.totalTokens ?? 0,
        ...(alertThresholds ? { alertThresholds } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Non-blocking mirror sync
  }
}

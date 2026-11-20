import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { EncryptedSecret } from './CryptoService';

export type AiConnectionStatus =
  | 'not_connected'
  | 'connected'
  | 'invalid_key'
  | 'billing_disabled'
  | 'quota_exhausted'
  | 'error';

export type ProvisioningStatus =
  | 'not_started'
  | 'queued'
  | 'creating_gcp_project'
  | 'enabling_firebase'
  | 'creating_firestore'
  | 'deploying_rules_indexes'
  | 'verifying_health'
  | 'completed'
  | 'failed';

export interface TenantWebAppConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
  appId: string;
  databaseId: string;
  storageBucket?: string;
}

export interface ProvisioningLogEntry {
  timestamp: string;
  step: string;
  status: 'info' | 'success' | 'error';
  message: string;
}

export interface BusinessAiRecord {
  businessId: string;
  aiProvider: 'gemini';
  encryptedKey: EncryptedSecret | null;
  maskedKey: string;
  modelName: string;
  connectionStatus: AiConnectionStatus;
  connectedAt: string | null;
  lastValidatedAt: string | null;
  lastSuccessfulRequest: string | null;
  lastError: string | null;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  updatedAt: string;
}

export interface BusinessProvisioningRecord {
  businessId: string;
  jobId: string;
  ownershipModel: 'reviewflow_managed' | 'customer_owned';
  status: ProvisioningStatus;
  projectId: string;
  databaseId: string;
  region: string;
  webAppConfig: TenantWebAppConfig | null;
  billingOwnershipNote: string;
  healthStatus: 'healthy' | 'degraded' | 'unknown';
  backupStatus: 'configured' | 'manual_required' | 'not_configured';
  lastError: string | null;
  retryCount: number;
  logs: ProvisioningLogEntry[];
  updatedAt: string;
}

export interface AiUsageLogRecord {
  requestId: string;
  businessId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: 'success' | 'failed';
  errorCode: string;
  errorMessage: string;
  createdAt: string;
}

interface VaultData {
  aiConfigs: Record<string, BusinessAiRecord>;
  provisioning: Record<string, BusinessProvisioningRecord>;
  usageLogs: AiUsageLogRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const VAULT_FILE = path.join(DATA_DIR, 'tenant-vault.json');

function ensureVaultLoaded(): VaultData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(VAULT_FILE)) {
    const empty: VaultData = {
      aiConfigs: {},
      provisioning: {},
      usageLogs: [],
    };
    fs.writeFileSync(VAULT_FILE, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  try {
    const raw = fs.readFileSync(VAULT_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VaultData>;
    return {
      aiConfigs: parsed.aiConfigs ?? {},
      provisioning: parsed.provisioning ?? {},
      usageLogs: Array.isArray(parsed.usageLogs) ? parsed.usageLogs : [],
    };
  } catch {
    return { aiConfigs: {}, provisioning: {}, usageLogs: [] };
  }
}

function saveVault(data: VaultData) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function getAiRecord(businessId: string): BusinessAiRecord | null {
  const vault = ensureVaultLoaded();
  return vault.aiConfigs[businessId] ?? null;
}

export function getAllAiStatusSummaries(): Record<
  string,
  Omit<BusinessAiRecord, 'encryptedKey'>
> {
  const vault = ensureVaultLoaded();
  const out: Record<string, Omit<BusinessAiRecord, 'encryptedKey'>> = {};
  for (const [id, rec] of Object.entries(vault.aiConfigs)) {
    const { encryptedKey: _omit, ...safe } = rec;
    out[id] = safe;
  }
  return out;
}

export function upsertAiRecord(record: BusinessAiRecord): Omit<BusinessAiRecord, 'encryptedKey'> {
  const vault = ensureVaultLoaded();
  vault.aiConfigs[record.businessId] = record;
  saveVault(vault);
  const { encryptedKey: _omit, ...safe } = record;
  return safe;
}

export function getProvisioningRecord(businessId: string): BusinessProvisioningRecord | null {
  const vault = ensureVaultLoaded();
  return vault.provisioning[businessId] ?? null;
}

export function getAllProvisioningRecords(): Record<string, BusinessProvisioningRecord> {
  const vault = ensureVaultLoaded();
  return vault.provisioning;
}

export function upsertProvisioningRecord(
  record: BusinessProvisioningRecord,
): BusinessProvisioningRecord {
  const vault = ensureVaultLoaded();
  vault.provisioning[record.businessId] = record;
  saveVault(vault);
  return record;
}

export function appendAiUsageLog(log: AiUsageLogRecord) {
  const vault = ensureVaultLoaded();
  vault.usageLogs.unshift(log);
  if (vault.usageLogs.length > 500) {
    vault.usageLogs = vault.usageLogs.slice(0, 500);
  }
  saveVault(vault);
}

export function getUsageLogsForBusiness(businessId: string): AiUsageLogRecord[] {
  const vault = ensureVaultLoaded();
  return vault.usageLogs.filter((l) => l.businessId === businessId).slice(0, 100);
}

export function getAllUsageLogs(): AiUsageLogRecord[] {
  const vault = ensureVaultLoaded();
  return vault.usageLogs.slice(0, 200);
}

// Cryptographic Firebase ID Token Verifier (Google public x509 certs)
let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!res.ok) {
    throw new Error('Unable to fetch Firebase token verification certificates.');
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = { certs, expiresAt: Date.now() + maxAgeSec * 1000 };
  return certs;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

function getCentralFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID?.trim()) {
    return process.env.FIREBASE_PROJECT_ID.trim();
  }
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      if (cfg.projectId) return cfg.projectId;
    }
  } catch {
    // ignore
  }
  return '';
}

export async function verifyFirebaseIdToken(
  authHeader: string | undefined,
): Promise<VerifiedFirebaseUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      email?: string;
      email_verified?: boolean;
    };

    if (header.alg !== 'RS256' || !header.kid) return null;
    const projectId = getCentralFirebaseProjectId();
    if (!projectId) return null;
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!payload.sub || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      return null;
    }

    const certs = await getGooglePublicCerts();
    const cert = certs[header.kid];
    if (!cert) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    const valid = verifier.verify(cert, Buffer.from(parts[2], 'base64url'));
    if (!valid) return null;

    return {
      uid: payload.sub,
      email: (payload.email || '').toLowerCase(),
      emailVerified: Boolean(payload.email_verified),
    };
  } catch {
    return null;
  }
}

export function getCentralFirestoreConfig(): { projectId: string; databaseId: string; apiKey: string } {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        projectId?: string;
        firestoreDatabaseId?: string;
        apiKey?: string;
      };
      return {
        projectId: process.env.FIREBASE_PROJECT_ID?.trim() || cfg.projectId || '',
        databaseId: process.env.FIREBASE_DATABASE_ID?.trim() || cfg.firestoreDatabaseId || '(default)',
        apiKey: cfg.apiKey || '',
      };
    }
  } catch {
    // ignore
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID?.trim() || '',
    databaseId: process.env.FIREBASE_DATABASE_ID?.trim() || '(default)',
    apiKey: '',
  };
}

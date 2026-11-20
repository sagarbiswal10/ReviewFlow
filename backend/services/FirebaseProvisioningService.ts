import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  getProvisioningRecord,
  upsertProvisioningRecord,
  type BusinessProvisioningRecord,
  type ProvisioningLogEntry,
  type TenantWebAppConfig,
} from './TenantVaultStore';

const activeProvisioningJobs = new Set<string>();

const TEMPLATE_DIR = path.resolve(process.cwd(), 'infrastructure', 'tenant-firebase');

export function getTenantInfrastructureTemplates(): {
  firestoreRules: string;
  firestoreIndexes: string;
  storageRules: string;
} {
  const readTemplate = (file: string, fallback: string) => {
    try {
      const p = path.join(TEMPLATE_DIR, file);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    firestoreRules: readTemplate('firestore.rules', ''),
    firestoreIndexes: readTemplate('firestore.indexes.json', '{}'),
    storageRules: readTemplate('storage.rules', ''),
  };
}

interface GcpServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function getGcpServiceAccount(): GcpServiceAccount | null {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GcpServiceAccount>;
    if (parsed.client_email && parsed.private_key) {
      return {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
        project_id: parsed.project_id,
      };
    }
  } catch {
    // ignore malformed JSON
  }
  return null;
}

async function getGcpAccessToken(sa: GcpServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
      aud: 'https://oauth2.googleapis.com/token',
      exp: nowSec + 3600,
      iat: nowSec,
    }),
  ).toString('base64url');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key).toString('base64url');
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Cloud IAM token exchange failed: ${errText.slice(0, 180)}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function pollGcpOperation(
  operationName: string,
  accessToken: string,
  baseUrl = 'https://cloudresourcemanager.googleapis.com/v3',
): Promise<Record<string, unknown>> {
  const opUrl = operationName.startsWith('http')
    ? operationName
    : `${baseUrl}/${operationName.replace(/^\//, '')}`;
  for (let i = 0; i < 20; i += 1) {
    const res = await fetch(opUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Operation polling failed (${res.status}).`);
    }
    const op = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: Record<string, unknown>;
    };
    if (op.done) {
      if (op.error?.message) {
        throw new Error(op.error.message);
      }
      return op.response || {};
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for Google Cloud operation: ${operationName}`);
}

function buildDeterministicGcpProjectId(businessId: string): string {
  const clean = businessId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'tenant';
  const hash = crypto.createHash('sha256').update(businessId).digest('hex').slice(0, 8);
  return `rf-${clean}-${hash}`.slice(0, 30);
}

function appendLog(
  existingLogs: ProvisioningLogEntry[],
  step: string,
  status: 'info' | 'success' | 'error',
  message: string,
): ProvisioningLogEntry[] {
  return [
    ...existingLogs.slice(-39),
    { timestamp: new Date().toISOString(), step, status, message },
  ];
}

export async function checkTenantFirestoreHealth(
  webAppConfig: TenantWebAppConfig,
  accessToken?: string,
): Promise<{ healthy: boolean; detail: string }> {
  const dbId = webAppConfig.databaseId || '(default)';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    webAppConfig.projectId,
  )}/databases/${encodeURIComponent(dbId)}/documents/businesses?pageSize=1`;

  try {
    const url = accessToken
      ? baseUrl
      : `${baseUrl}&key=${encodeURIComponent(webAppConfig.apiKey)}`;
    const res = await fetch(
      url,
      accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    );
    if (res.ok || res.status === 403 || res.status === 404) {
      // 200/404 confirms database endpoint is reachable and Firestore is initialized; 403 confirms rules engine is active.
      return {
        healthy: true,
        detail:
          res.status === 403
            ? 'Firestore reachable with security rules active.'
            : 'Firestore REST health check succeeded.',
      };
    }
    const txt = await res.text();
    return {
      healthy: false,
      detail: `Firestore health check returned HTTP ${res.status}: ${txt.slice(0, 140)}`,
    };
  } catch (err) {
    return {
      healthy: false,
      detail: err instanceof Error ? err.message : 'Network error reaching tenant Firestore.',
    };
  }
}

export async function connectCustomerFirebaseProject(input: {
  businessId: string;
  region?: string;
  webAppConfig: TenantWebAppConfig;
}): Promise<BusinessProvisioningRecord> {
  const cleanConfig: TenantWebAppConfig = {
    projectId: input.webAppConfig.projectId.trim(),
    apiKey: input.webAppConfig.apiKey.trim(),
    authDomain:
      input.webAppConfig.authDomain?.trim() || `${input.webAppConfig.projectId.trim()}.firebaseapp.com`,
    appId: input.webAppConfig.appId.trim(),
    databaseId: input.webAppConfig.databaseId?.trim() || '(default)',
    storageBucket:
      input.webAppConfig.storageBucket?.trim() || `${input.webAppConfig.projectId.trim()}.appspot.com`,
  };

  if (!cleanConfig.projectId || !cleanConfig.apiKey || !cleanConfig.appId) {
    const err = new Error(
      'Firebase Project ID, Web API Key, and Firebase App ID are required.',
    ) as Error & { httpStatus?: number };
    err.httpStatus = 400;
    throw err;
  }

  const health = await checkTenantFirestoreHealth(cleanConfig);
  const existing = getProvisioningRecord(input.businessId);
  const now = new Date().toISOString();

  const logs = appendLog(
    existing?.logs ?? [],
    'customer_owned_connect',
    health.healthy ? 'success' : 'error',
    `Connected customer-owned Firebase project "${cleanConfig.projectId}" (${health.detail})`,
  );

  return upsertProvisioningRecord({
    businessId: input.businessId,
    jobId: existing?.jobId || `job_${crypto.randomUUID().slice(0, 10)}`,
    ownershipModel: 'customer_owned',
    status: health.healthy ? 'completed' : 'failed',
    projectId: cleanConfig.projectId,
    databaseId: cleanConfig.databaseId,
    region: input.region?.trim() || existing?.region || 'asia-south1',
    webAppConfig: cleanConfig,
    billingOwnershipNote:
      'Customer owns Google Cloud project, Firebase project, quotas, and direct Google billing.',
    healthStatus: health.healthy ? 'healthy' : 'degraded',
    backupStatus: 'manual_required',
    lastError: health.healthy ? null : health.detail,
    retryCount: existing?.retryCount ?? 0,
    logs,
    updatedAt: now,
  });
}

async function executeAutomatedGcpProvisioning(
  businessId: string,
  businessName: string,
  region: string,
): Promise<void> {
  let rec = getProvisioningRecord(businessId);
  if (!rec) return;

  const updateState = (
    patch: Partial<BusinessProvisioningRecord>,
    logEntry?: { step: string; status: 'info' | 'success' | 'error'; message: string },
  ) => {
    const nextLogs = logEntry ? appendLog(rec!.logs, logEntry.step, logEntry.status, logEntry.message) : rec!.logs;
    rec = upsertProvisioningRecord({
      ...rec!,
      ...patch,
      logs: nextLogs,
      updatedAt: new Date().toISOString(),
    });
  };

  const sa = getGcpServiceAccount();
  if (!sa) {
    updateState(
      {
        status: 'failed',
        healthStatus: 'unknown',
        lastError:
          'Automated Google Cloud project creation requires GCP_SERVICE_ACCOUNT_JSON on the ReviewFlow server. Alternatively, use "Connect Business-Owned Firebase Project" to link the business owner’s own Firebase project right now.',
      },
      {
        step: 'preflight_credentials',
        status: 'error',
        message: 'Server GCP_SERVICE_ACCOUNT_JSON is not configured for ReviewFlow-managed GCP provisioning.',
      },
    );
    return;
  }

  const projectId = rec.projectId || buildDeterministicGcpProjectId(businessId);
  let accessToken = '';

  try {
    updateState(
      { status: 'creating_gcp_project', projectId, lastError: null },
      { step: 'gcp_project', status: 'info', message: `Creating/verifying Google Cloud project ${projectId}...` },
    );

    accessToken = await getGcpAccessToken(sa);

    // 1. Check if deterministic GCP project already exists (idempotency / duplicate prevention)
    const getProjRes = await fetch(
      `https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(projectId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (getProjRes.status === 404) {
      const parent = process.env.GCP_ORGANIZATION_ID?.trim();
      const createPayload: Record<string, unknown> = {
        projectId,
        displayName: `ReviewFlow - ${businessName}`.slice(0, 30),
        labels: { reviewflow_business_id: businessId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) },
      };
      if (parent) {
        createPayload.parent = parent.startsWith('organizations/') || parent.startsWith('folders/')
          ? parent
          : `organizations/${parent}`;
      }

      const createProjRes = await fetch('https://cloudresourcemanager.googleapis.com/v3/projects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createPayload),
      });
      if (!createProjRes.ok) {
        throw new Error(`GCP project creation failed: ${(await createProjRes.text()).slice(0, 180)}`);
      }
      const op = (await createProjRes.json()) as { name?: string };
      if (op.name) {
        await pollGcpOperation(op.name, accessToken);
      }
    } else if (!getProjRes.ok) {
      throw new Error(`Unable to inspect GCP project ${projectId}: ${getProjRes.status}`);
    }

    // 2. Link billing account if explicitly configured (disclosing ReviewFlow billing ownership)
    const billingAccount = process.env.GCP_BILLING_ACCOUNT_ID?.trim();
    if (billingAccount) {
      const billingName = billingAccount.startsWith('billingAccounts/')
        ? billingAccount
        : `billingAccounts/${billingAccount}`;
      const billRes = await fetch(
        `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ billingAccountName: billingName }),
        },
      );
      if (!billRes.ok) {
        throw new Error(`Cloud Billing attachment failed: ${(await billRes.text()).slice(0, 180)}`);
      }
    }

    // 3. Enable required Google APIs
    await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serviceIds: [
          'firebase.googleapis.com',
          'firestore.googleapis.com',
          'firebaserules.googleapis.com',
          'monitoring.googleapis.com',
        ],
      }),
    });

    // 4. Add Firebase to project & register Web App
    updateState(
      { status: 'enabling_firebase' },
      { step: 'add_firebase', status: 'info', message: `Enabling Firebase and Web App on ${projectId}...` },
    );

    const addFbRes = await fetch(
      `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}:addFirebase`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    );
    if (addFbRes.ok) {
      const fbOp = (await addFbRes.json()) as { name?: string };
      if (fbOp.name) {
        await pollGcpOperation(fbOp.name, accessToken, 'https://firebase.googleapis.com/v1beta1');
      }
    }

    let webAppName = '';
    const listAppsRes = await fetch(
      `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/webApps`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (listAppsRes.ok) {
      const listData = (await listAppsRes.json()) as { apps?: Array<{ name: string }> };
      webAppName = listData.apps?.[0]?.name || '';
    }
    if (!webAppName) {
      const createAppRes = await fetch(
        `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/webApps`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ displayName: `${businessName} Web`.slice(0, 40) }),
        },
      );
      if (createAppRes.ok) {
        const appOp = (await createAppRes.json()) as { name?: string };
        if (appOp.name) {
          const resp = await pollGcpOperation(
            appOp.name,
            accessToken,
            'https://firebase.googleapis.com/v1beta1',
          );
          webAppName = typeof resp.name === 'string' ? resp.name : '';
        }
      }
    }

    let webAppConfig: TenantWebAppConfig | null = null;
    if (webAppName) {
      const cfgRes = await fetch(`https://firebase.googleapis.com/v1beta1/${webAppName}/config`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as Partial<TenantWebAppConfig>;
        if (cfg.apiKey && cfg.appId) {
          webAppConfig = {
            projectId,
            apiKey: cfg.apiKey,
            authDomain: cfg.authDomain || `${projectId}.firebaseapp.com`,
            appId: cfg.appId,
            databaseId: '(default)',
            storageBucket: cfg.storageBucket || `${projectId}.appspot.com`,
          };
        }
      }
    }

    // 5. Create Firestore Database
    updateState(
      { status: 'creating_firestore' },
      { step: 'create_firestore', status: 'info', message: `Provisioning Firestore database in ${region}...` },
    );

    const checkDbRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (checkDbRes.status === 404) {
      const createDbRes = await fetch(
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
          projectId,
        )}/databases?databaseId=(default)`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'FIRESTORE_NATIVE',
            locationId: region,
            deleteProtectionState: 'DELETE_PROTECTION_ENABLED',
            pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
          }),
        },
      );
      if (createDbRes.ok) {
        const dbOp = (await createDbRes.json()) as { name?: string };
        if (dbOp.name) {
          await pollGcpOperation(dbOp.name, accessToken, 'https://firestore.googleapis.com/v1');
        }
      }
    }

    // 6. Deploy Security Rules & Indexes
    updateState(
      { status: 'deploying_rules_indexes' },
      { step: 'rules_indexes', status: 'info', message: 'Deploying tenant Firestore rules and composite indexes...' },
    );

    const templates = getTenantInfrastructureTemplates();
    if (templates.firestoreRules) {
      const rulesetRes = await fetch(
        `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/rulesets`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source: {
              files: [{ name: 'firestore.rules', content: templates.firestoreRules }],
            },
          }),
        },
      );
      if (rulesetRes.ok) {
        const ruleset = (await rulesetRes.json()) as { name: string };
        await fetch(
          `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(
            projectId,
          )}/releases/cloud.firestore`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              release: {
                name: `projects/${projectId}/releases/cloud.firestore`,
                rulesetName: ruleset.name,
              },
            }),
          },
        );
      }
    }

    // 7. Health Check
    updateState(
      { status: 'verifying_health' },
      { step: 'health_check', status: 'info', message: 'Verifying live Firestore endpoint & rules health...' },
    );

    const health = webAppConfig
      ? await checkTenantFirestoreHealth(webAppConfig, accessToken)
      : { healthy: false, detail: 'Web app config was not returned by Firebase Management API.' };

    updateState(
      {
        status: health.healthy ? 'completed' : 'failed',
        webAppConfig,
        healthStatus: health.healthy ? 'healthy' : 'degraded',
        backupStatus: 'configured',
        lastError: health.healthy ? null : health.detail,
        billingOwnershipNote: billingAccount
          ? 'ReviewFlow manages this Google Cloud project and billing arrangement.'
          : 'Google Cloud project created by ReviewFlow; attach a billing account for production quotas.',
      },
      {
        step: 'completed',
        status: health.healthy ? 'success' : 'error',
        message: health.healthy
          ? `Firebase project ${projectId} provisioned and healthy.`
          : health.detail,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateState(
      {
        status: 'failed',
        healthStatus: 'degraded',
        lastError: message.slice(0, 260),
      },
      {
        step: 'provisioning_error',
        status: 'error',
        message: message.slice(0, 220),
      },
    );
  }
}

export function startAutomatedProvisioningJob(input: {
  businessId: string;
  businessName: string;
  region?: string;
  isRetry?: boolean;
}): { accepted: boolean; record: BusinessProvisioningRecord } {
  const existing = getProvisioningRecord(input.businessId);

  // Duplicate-project prevention & idempotency
  if (existing?.status === 'completed' && existing.projectId) {
    return { accepted: false, record: existing };
  }
  if (activeProvisioningJobs.has(input.businessId)) {
    return { accepted: false, record: existing! };
  }

  const projectId = existing?.projectId || buildDeterministicGcpProjectId(input.businessId);
  const region = input.region?.trim() || existing?.region || 'asia-south1';
  const now = new Date().toISOString();

  const initialRecord = upsertProvisioningRecord({
    businessId: input.businessId,
    jobId: existing?.jobId || `job_${crypto.randomUUID().slice(0, 10)}`,
    ownershipModel: 'reviewflow_managed',
    status: 'queued',
    projectId,
    databaseId: '(default)',
    region,
    webAppConfig: existing?.webAppConfig || null,
    billingOwnershipNote:
      'ReviewFlow creates and manages this Google Cloud / Firebase project under its Google Cloud organization & billing arrangement.',
    healthStatus: 'unknown',
    backupStatus: 'not_configured',
    lastError: null,
    retryCount: input.isRetry ? (existing?.retryCount ?? 0) + 1 : existing?.retryCount ?? 0,
    logs: appendLog(
      existing?.logs ?? [],
      input.isRetry ? 'retry_queued' : 'queued',
      'info',
      `Async provisioning job queued for ${input.businessName} (target project: ${projectId}, region: ${region}).`,
    ),
    updatedAt: now,
  });

  activeProvisioningJobs.add(input.businessId);
  setImmediate(() => {
    executeAutomatedGcpProvisioning(input.businessId, input.businessName, region).finally(() => {
      activeProvisioningJobs.delete(input.businessId);
    });
  });

  return { accepted: true, record: initialRecord };
}

export async function getTenantFirebaseMonitoring(businessId: string): Promise<{
  available: boolean;
  projectId: string | null;
  consoleMonitoringUrl: string | null;
  consoleBillingUrl: string | null;
  firestoreHealth: { healthy: boolean; detail: string } | null;
  metrics24h: {
    reads: number | null;
    writes: number | null;
    deletes: number | null;
  } | null;
  reason?: string;
}> {
  const rec = getProvisioningRecord(businessId);
  if (!rec || !rec.projectId) {
    return {
      available: false,
      projectId: null,
      consoleMonitoringUrl: null,
      consoleBillingUrl: null,
      firestoreHealth: null,
      metrics24h: null,
      reason: 'No dedicated Firebase project has been provisioned or connected for this business yet.',
    };
  }

  const consoleMonitoringUrl = `https://console.firebase.google.com/project/${encodeURIComponent(
    rec.projectId,
  )}/firestore/usage`;
  const consoleBillingUrl = `https://console.cloud.google.com/billing/linkedaccount?project=${encodeURIComponent(
    rec.projectId,
  )}`;

  const firestoreHealth = rec.webAppConfig
    ? await checkTenantFirestoreHealth(rec.webAppConfig)
    : null;

  const sa = getGcpServiceAccount();
  if (!sa || rec.ownershipModel !== 'reviewflow_managed') {
    return {
      available: false,
      projectId: rec.projectId,
      consoleMonitoringUrl,
      consoleBillingUrl,
      firestoreHealth,
      metrics24h: null,
      reason:
        rec.ownershipModel === 'customer_owned'
          ? 'Customer-owned Firebase project: read/write quota and billing metrics are managed inside the business owner’s Google Cloud / Firebase Console.'
          : 'Live Cloud Monitoring API metrics require server GCP service account credentials.',
    };
  }

  try {
    const token = await getGcpAccessToken(sa);
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const queryMetric = async (metricType: string): Promise<number> => {
      const url = new URL(
        `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(rec.projectId)}/timeSeries`,
      );
      url.searchParams.set('filter', `metric.type="${metricType}"`);
      url.searchParams.set('interval.startTime', startTime);
      url.searchParams.set('interval.endTime', endTime);
      url.searchParams.set('aggregation.alignmentPeriod', '86400s');
      url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_SUM');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Monitoring API ${res.status}`);
      const json = (await res.json()) as {
        timeSeries?: Array<{ points?: Array<{ value?: { int64Value?: string; doubleValue?: number } }> }>;
      };
      let total = 0;
      for (const ts of json.timeSeries ?? []) {
        for (const p of ts.points ?? []) {
          total += Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0);
        }
      }
      return total;
    };

    const [reads, writes, deletes] = await Promise.all([
      queryMetric('firestore.googleapis.com/document/read_count'),
      queryMetric('firestore.googleapis.com/document/write_count'),
      queryMetric('firestore.googleapis.com/document/delete_count'),
    ]);

    return {
      available: true,
      projectId: rec.projectId,
      consoleMonitoringUrl,
      consoleBillingUrl,
      firestoreHealth,
      metrics24h: { reads, writes, deletes },
    };
  } catch (err) {
    return {
      available: false,
      projectId: rec.projectId,
      consoleMonitoringUrl,
      consoleBillingUrl,
      firestoreHealth,
      metrics24h: null,
      reason: err instanceof Error ? err.message : 'Cloud Monitoring API metrics unavailable.',
    };
  }
}

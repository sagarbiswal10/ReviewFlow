import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Server,
} from 'lucide-react';
import type {
  AiUsageLogRecord,
  Business,
  BusinessAiSummary,
  BusinessProvisioningSummary,
  TenantMonitoringSummary,
  TenantTemplatesBundle,
  TenantWebAppConfig,
} from '../types';
import { updateBusiness } from '../services/businessService';
import {
  connectBusinessGeminiKey,
  connectCustomerFirebase,
  fetchAiUsage,
  fetchProvisioningStatus,
  fetchProvisioningTemplates,
  fetchTenantMonitoring,
  retryProvisioning,
  startProvisioning,
  syncNonSecretIntegrationToCentral,
  updateBusinessGeminiModel,
  validateGeminiKey,
} from '../services/infrastructureService';
import { syncBusinessSchemaToTenantFirestore } from '../services/tenantFirebaseService';

interface BusinessInfrastructurePanelProps {
  business: Business;
  isAdmin?: boolean;
  readOnly?: boolean;
}

const REGION_OPTIONS = [
  { id: 'asia-south1', label: 'Mumbai (asia-south1)' },
  { id: 'asia-south2', label: 'Delhi (asia-south2)' },
  { id: 'us-central1', label: 'Iowa (us-central1)' },
  { id: 'europe-west1', label: 'Belgium (europe-west1)' },
];

const MODEL_OPTIONS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Cheapest)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Fastest)' },
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Flash (Balanced)' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Pro (Paid Key)' },
];

export function BusinessInfrastructurePanel({
  business,
  isAdmin = false,
  readOnly = false,
}: BusinessInfrastructurePanelProps) {
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState<BusinessProvisioningSummary | null>(null);
  const [monitoring, setMonitoring] = useState<TenantMonitoringSummary | null>(null);
  const [aiSummary, setAiSummary] = useState<BusinessAiSummary | null>(null);
  const [usageLogs, setUsageLogs] = useState<AiUsageLogRecord[]>([]);
  const [templates, setTemplates] = useState<TenantTemplatesBundle | null>(null);

  // Provisioning actions
  const [fbMode, setFbMode] = useState<'automated' | 'customer_owned'>('automated');
  const [selectedRegion, setSelectedRegion] = useState('asia-south1');
  const [fbBusy, setFbBusy] = useState(false);
  const [fbNotice, setFbNotice] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);
  const [customerConfig, setCustomerConfig] = useState<TenantWebAppConfig>({
    projectId: business.tenantFirebase?.projectId || '',
    apiKey: business.tenantFirebase?.apiKey || '',
    authDomain: business.tenantFirebase?.authDomain || '',
    appId: business.tenantFirebase?.appId || '',
    databaseId: business.tenantFirebase?.databaseId || '(default)',
    storageBucket: business.tenantFirebase?.storageBucket || '',
  });
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  // Gemini API Key integration actions
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(
    import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite',
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [tokenAlertLimit, setTokenAlertLimit] = useState(250000);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [provRes, aiRes, monRes, tplRes] = await Promise.allSettled([
        fetchProvisioningStatus(business.id),
        fetchAiUsage(business.id),
        fetchTenantMonitoring(business.id),
        fetchProvisioningTemplates(),
      ]);

      const nextProv = provRes.status === 'fulfilled' ? provRes.value.provisioning : null;
      const nextAi = aiRes.status === 'fulfilled' ? aiRes.value.summary : null;
      const nextLogs = aiRes.status === 'fulfilled' ? aiRes.value.logs : [];
      const nextMon = monRes.status === 'fulfilled' ? monRes.value.monitoring : null;
      const nextTpl = tplRes.status === 'fulfilled' ? tplRes.value : null;

      setProvisioning(nextProv);
      setAiSummary(nextAi);
      setUsageLogs(nextLogs);
      setMonitoring(nextMon);
      setTemplates(nextTpl);

      if (nextAi?.modelName) setSelectedModel(nextAi.modelName);
      if (nextProv?.region) setSelectedRegion(nextProv.region);
      if (nextProv?.webAppConfig) setCustomerConfig(nextProv.webAppConfig);
      if (nextProv?.ownershipModel === 'customer_owned') setFbMode('customer_owned');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [business.id]);

  // Poll async provisioning job while in-progress
  useEffect(() => {
    if (
      !provisioning ||
      !['queued', 'creating_gcp_project', 'enabling_firebase', 'creating_firestore', 'deploying_rules_indexes', 'verifying_health'].includes(
        provisioning.status,
      )
    ) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const res = await fetchProvisioningStatus(business.id);
        if (res.provisioning) {
          setProvisioning(res.provisioning);
          if (res.provisioning.status === 'completed' && res.provisioning.webAppConfig) {
            await syncPostProvisioning(res.provisioning, aiSummary);
          }
        }
      } catch {
        // ignore poll glitch
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [provisioning?.status, business.id]);

  const syncPostProvisioning = async (
    nextProv: BusinessProvisioningSummary | null,
    nextAi: BusinessAiSummary | null,
  ) => {
    const firebaseReady = nextProv?.status === 'completed' && Boolean(nextProv.webAppConfig);
    const aiReady = nextAi?.connectionStatus === 'connected';

    const nextLifecycle =
      business.lifecycleStatus === 'suspended'
        ? 'suspended'
        : firebaseReady && aiReady
          ? 'active'
          : 'provisioning';

    if (nextProv?.webAppConfig) {
      await syncBusinessSchemaToTenantFirestore(business, nextProv.webAppConfig);
    }

    await updateBusiness(
      business,
      {
        ...(nextProv?.webAppConfig ? { tenantFirebase: nextProv.webAppConfig } : {}),
        lifecycleStatus: nextLifecycle,
      },
      { isAdmin },
    );

    await syncNonSecretIntegrationToCentral({
      business,
      provisioning: nextProv,
      ai: nextAi,
      alertThresholds: { tokenSpikeLimit: tokenAlertLimit },
    });
  };

  const handleStartAutomatedProvisioning = async (isRetry = false) => {
    setFbBusy(true);
    setFbError(null);
    setFbNotice(null);
    try {
      const res = isRetry
        ? await retryProvisioning({
            businessId: business.id,
            businessName: business.name,
            region: selectedRegion,
          })
        : await startProvisioning({
            businessId: business.id,
            businessName: business.name,
            region: selectedRegion,
          });
      setProvisioning(res.provisioning);
      setFbNotice('Provisioning job queued. Live status updates will appear below.');
    } catch (err) {
      setFbError(err instanceof Error ? err.message : 'Unable to start provisioning.');
    } finally {
      setFbBusy(false);
    }
  };

  const handleConnectCustomerProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFbBusy(true);
    setFbError(null);
    setFbNotice(null);
    try {
      const res = await connectCustomerFirebase({
        businessId: business.id,
        region: selectedRegion,
        webAppConfig: customerConfig,
      });
      setProvisioning(res.provisioning);
      await syncPostProvisioning(res.provisioning, aiSummary);
      setMonitoring((await fetchTenantMonitoring(business.id)).monitoring);
      setFbNotice(
        res.provisioning.status === 'completed'
          ? `Connected Firebase project "${res.provisioning.projectId}" and synced initial collections.`
          : res.provisioning.lastError || 'Project saved, health check degraded.',
      );
    } catch (err) {
      setFbError(err instanceof Error ? err.message : 'Unable to connect Firebase project.');
    } finally {
      setFbBusy(false);
    }
  };

  const handleValidateOnly = async () => {
    setAiBusy(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await validateGeminiKey(apiKeyInput, selectedModel);
      setAiNotice(`Key validated cleanly (${res.maskedKey}) using ${res.modelName}. Click Save Key Securely to bind it.`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gemini API key validation failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleConnectGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setAiBusy(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await connectBusinessGeminiKey({
        businessId: business.id,
        apiKey: apiKeyInput.trim(),
        modelName: selectedModel,
      });
      setAiSummary(res.ai);
      setApiKeyInput('');
      await syncPostProvisioning(provisioning, res.ai);
      setAiNotice(`Encrypted & saved Gemini API key (${res.ai.maskedKey}) exclusively for ${business.name}.`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to connect Gemini API key.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleModelChange = async (nextModel: string) => {
    setSelectedModel(nextModel);
    if (readOnly) return;
    try {
      const res = await updateBusinessGeminiModel({
        businessId: business.id,
        modelName: nextModel,
      });
      setAiSummary(res.ai);
      await syncNonSecretIntegrationToCentral({
        business,
        provisioning,
        ai: res.ai,
      });
    } catch {
      // ignore
    }
  };

  const handleCopyText = async (label: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTemplate(label);
      setTimeout(() => setCopiedTemplate(null), 2000);
    } catch {
      // ignore
    }
  };

  const firebaseReady = provisioning?.status === 'completed';
  const aiReady = aiSummary?.connectionStatus === 'connected';
  const spikeExceeded = (aiSummary?.totalTokens ?? 0) >= tokenAlertLimit;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 flex items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Loading isolated infrastructure status for {business.name}...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top 3-Step Isolation Activation Status */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Dedicated Business Infrastructure &amp; AI Isolation
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              {business.name} operates with its own isolated Firebase project, Firestore database, and business-owned Gemini API billing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider tabular-nums">
              Status: {business.lifecycleStatus || (firebaseReady && aiReady ? 'active' : 'provisioning')}
            </span>
            <button
              type="button"
              onClick={loadAll}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] font-medium text-slate-500">1. Registration</p>
            <p className="mt-1 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Profile Saved</span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] font-medium text-slate-500">2. Dedicated Firebase</p>
            <p
              className={`mt-1 text-xs font-semibold flex items-center gap-1.5 truncate ${
                firebaseReady ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {firebaseReady ? provisioning?.projectId : provisioning?.status || 'Not Configured'}
              </span>
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] font-medium text-slate-500">3. Gemini API Key</p>
            <p
              className={`mt-1 text-xs font-semibold flex items-center gap-1.5 truncate ${
                aiReady ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {aiReady ? aiSummary?.maskedKey : aiSummary?.connectionStatus || 'Not Connected'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Business-Wise Firebase Infrastructure */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              Isolated Business Firebase Project &amp; Firestore
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Each business maintains independent Firestore quotas, feedback collections, security rules, and composite indexes.
            </p>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setFbMode('automated')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  fbMode === 'automated' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Automated Provisioning
              </button>
              <button
                type="button"
                onClick={() => setFbMode('customer_owned')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  fbMode === 'customer_owned' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Connect Own Firebase
              </button>
            </div>
          )}
        </div>

        {fbMode === 'automated' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed">
              <strong>Ownership Disclosure:</strong> Automated provisioning creates an isolated Google Cloud &amp; Firebase project using ReviewFlow&apos;s server GCP credentials (`GCP_SERVICE_ACCOUNT_JSON`). ReviewFlow manages that Google Cloud project and linked billing arrangement unless you choose &ldquo;Connect Own Firebase&rdquo; to bind a Google Cloud project owned directly by the business.
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Firestore Region
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  disabled={readOnly}
                  className="h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  {REGION_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {!readOnly && (
                <>
                  <button
                    type="button"
                    disabled={fbBusy || provisioning?.status === 'completed'}
                    onClick={() => handleStartAutomatedProvisioning(false)}
                    className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    {fbBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <Server className="w-3.5 h-3.5" />
                    <span>
                      {provisioning?.status === 'completed'
                        ? 'Project Provisioned'
                        : 'Start Automated Provisioning'}
                    </span>
                  </button>

                  {provisioning?.status === 'failed' && (
                    <button
                      type="button"
                      disabled={fbBusy}
                      onClick={() => handleStartAutomatedProvisioning(true)}
                      className="h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Job</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleConnectCustomerProject} className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed">
              <strong>Customer-Owned Firebase Project:</strong> Create a project in your own{' '}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 font-semibold underline"
              >
                Firebase Console
              </a>
              , enable Cloud Firestore, register a Web App, and paste your Firebase Web Config below. Google Cloud billing and Firestore quotas belong directly to your business Google account.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Firebase Project ID *
                </label>
                <input
                  type="text"
                  required
                  value={customerConfig.projectId}
                  onChange={(e) =>
                    setCustomerConfig((p) => ({
                      ...p,
                      projectId: e.target.value,
                      authDomain: p.authDomain || `${e.target.value}.firebaseapp.com`,
                    }))
                  }
                  placeholder="my-salon-reviews"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Firebase Web API Key *
                </label>
                <input
                  type="text"
                  required
                  value={customerConfig.apiKey}
                  onChange={(e) => setCustomerConfig((p) => ({ ...p, apiKey: e.target.value }))}
                  placeholder="AIzaSy..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Firebase App ID *
                </label>
                <input
                  type="text"
                  required
                  value={customerConfig.appId}
                  onChange={(e) => setCustomerConfig((p) => ({ ...p, appId: e.target.value }))}
                  placeholder="1:1234567890:web:abcdef"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Firestore Database ID
                </label>
                <input
                  type="text"
                  value={customerConfig.databaseId}
                  onChange={(e) =>
                    setCustomerConfig((p) => ({ ...p, databaseId: e.target.value || '(default)' }))
                  }
                  placeholder="(default)"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                />
              </div>
            </div>

            {!readOnly && (
              <button
                type="submit"
                disabled={fbBusy}
                className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {fbBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Verify Health &amp; Connect Firebase Project</span>
              </button>
            )}
          </form>
        )}

        {fbError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {fbError}
          </div>
        )}
        {fbNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            {fbNotice}
          </div>
        )}

        {/* Live Provisioning Logs & Health Monitoring */}
        {provisioning && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            <div className="rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">Provisioning Job Status</span>
                <span className="font-mono text-slate-600">{provisioning.status}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Project: <span className="font-mono text-slate-900">{provisioning.projectId}</span> ·
                Region: <span className="font-mono">{provisioning.region}</span> ·
                Ownership: <span className="font-medium">{provisioning.ownershipModel}</span>
              </p>
              <p className="text-[11px] text-slate-500">{provisioning.billingOwnershipNote}</p>
              {provisioning.logs.length > 0 && (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-1 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                  {provisioning.logs.slice(-6).map((log, i) => (
                    <p
                      key={`${log.timestamp}-${i}`}
                      className={`text-[11px] font-mono ${
                        log.status === 'error'
                          ? 'text-red-700'
                          : log.status === 'success'
                            ? 'text-emerald-700'
                            : 'text-slate-600'
                      }`}
                    >
                      [{log.step}] {log.message}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Firestore Health &amp; Quota Monitoring
                </span>
                <span className="text-xs font-medium text-slate-700">
                  Health: {monitoring?.firestoreHealth?.healthy ? 'Healthy' : provisioning.healthStatus}
                </span>
              </div>

              {monitoring?.available && monitoring.metrics24h ? (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] text-slate-500">24h Reads</p>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      {monitoring.metrics24h.reads ?? 0}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] text-slate-500">24h Writes</p>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      {monitoring.metrics24h.writes ?? 0}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-[10px] text-slate-500">24h Deletes</p>
                    <p className="text-sm font-bold text-slate-900 tabular-nums">
                      {monitoring.metrics24h.deletes ?? 0}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {monitoring?.reason ||
                    'Real-time Cloud Monitoring metrics are viewed in the project’s Firebase Console.'}
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                {monitoring?.consoleMonitoringUrl && (
                  <a
                    href={monitoring.consoleMonitoringUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Firebase Usage Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {monitoring?.consoleBillingUrl && (
                  <a
                    href={monitoring.consoleBillingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Google Cloud Billing</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reusable Tenant Security Rules, Indexes & Storage Rules Templates */}
        {templates && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Tenant Firebase templates ready to deploy to any isolated business project:
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'firestore.rules', content: templates.firestoreRules },
                { key: 'firestore.indexes.json', content: templates.firestoreIndexes },
                { key: 'storage.rules', content: templates.storageRules },
              ].map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => handleCopyText(tpl.key, tpl.content)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-mono text-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedTemplate === tpl.key ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedTemplate === tpl.key ? `Copied ${tpl.key}` : tpl.key}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Business-Wise Gemini API Integration */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">
              Business-Wise Gemini API Key &amp; Token Usage
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Each business connects its own Gemini API key. Google bills the business directly through its own Google Cloud billing account.
            </p>
          </div>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-teal-700 inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            <span>Open Google Cloud Console</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
          <p className="font-semibold text-slate-900">How to connect this business&apos;s Gemini API key:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open Google Cloud Console (<span className="font-mono">console.cloud.google.com</span>) and sign in with the business owner&apos;s Google account.</li>
            <li>Create or select the business&apos;s Google Cloud project and enable the Generative Language API.</li>
            <li>Generate a Gemini API key, paste it below, validate it, and save securely (AES-256-GCM encrypted server-side).</li>
          </ol>
        </div>

        {aiSummary?.lastError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Latest Key / Quota Alert ({aiSummary.connectionStatus})</p>
              <p className="mt-0.5">{aiSummary.lastError}</p>
            </div>
          </div>
        )}

        {spikeExceeded && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Token usage alert: This business has consumed {(aiSummary?.totalTokens ?? 0).toLocaleString()} tokens, exceeding the configured alert threshold of {tokenAlertLimit.toLocaleString()} tokens.
            </span>
          </div>
        )}

        <form onSubmit={handleConnectGeminiKey} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {aiSummary?.maskedKey
                ? `Rotate Gemini API Key (Current: ${aiSummary.maskedKey})`
                : 'Paste Business Gemini API Key'}
            </label>
            <input
              type="password"
              value={apiKeyInput}
              disabled={readOnly}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter Gemini API key"
              autoComplete="off"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 font-mono text-xs"
            />
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Gemini Model
            </label>
            <select
              value={selectedModel}
              disabled={readOnly}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-xs bg-white"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {!readOnly && (
            <div className="lg:col-span-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={aiBusy || !apiKeyInput.trim()}
                onClick={handleValidateOnly}
                className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                Validate Key
              </button>
              <button
                type="submit"
                disabled={aiBusy || !apiKeyInput.trim()}
                className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {aiBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Save Key Securely</span>
              </button>
            </div>
          )}
        </form>

        {aiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {aiError}
          </div>
        )}
        {aiNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            {aiNotice}
          </div>
        )}

        {/* Per-Business AI Token Metrics & Alert Threshold */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] text-slate-500">AI Requests</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {aiSummary?.totalRequests ?? 0}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] text-slate-500">Success / Failed</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {aiSummary?.successfulRequests ?? 0} / {aiSummary?.failedRequests ?? 0}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] text-slate-500">Input Tokens</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {(aiSummary?.totalInputTokens ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-[11px] text-slate-500">Output Tokens</p>
            <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
              {(aiSummary?.totalOutputTokens ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
            <label className="block text-[11px] text-slate-500">Token Alert Limit</label>
            <input
              type="number"
              min={1000}
              step={10000}
              value={tokenAlertLimit}
              onChange={(e) => setTokenAlertLimit(Number(e.target.value) || 250000)}
              className="mt-1 w-full h-7 px-2 rounded border border-slate-200 bg-white text-xs font-mono tabular-nums"
            />
          </div>
        </div>

        {/* Recent AI Usage Logs */}
        {usageLogs.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-4">Request</th>
                  <th className="py-2.5 px-4">Model</th>
                  <th className="py-2.5 px-4 text-right">Input</th>
                  <th className="py-2.5 px-4 text-right">Output</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usageLogs.slice(0, 8).map((log) => (
                  <tr key={log.requestId}>
                    <td className="py-2 px-4 font-mono text-slate-700">{log.requestId}</td>
                    <td className="py-2 px-4 text-slate-700">{log.modelName}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums">{log.inputTokens}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums">{log.outputTokens}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold">
                      {log.totalTokens}
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`font-medium ${
                          log.status === 'success' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {log.status === 'success' ? 'Success' : log.errorCode || 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

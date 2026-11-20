export const BUSINESS_CATEGORIES = [
  'Restaurants',
  'Hair Salons',
  'Beauty Salons',
  'Hotels',
  'Spas',
  'Gyms',
  'Healthcare',
  'Retail Stores',
  'Automobile Services',
  'Other Businesses',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export type ReviewStyle = 'short' | 'detailed' | 'professional';

export type QuestionType = 'single' | 'multiple' | 'text';

export type ClientAccessLevel = 'read_only' | 'qr_and_questions' | 'full';

export type BusinessLifecycleStatus =
  | 'onboarding'
  | 'provisioning'
  | 'active'
  | 'suspended';

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

export interface EnabledFeatures {
  aiReviewDrafts: boolean;
  customQuestions: boolean;
  pdfPosterExport: boolean;
  analyticsView: boolean;
}

export interface FeedbackQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  placeholder?: string;
}

export interface BusinessBranding {
  primaryColor: string;
  secondaryColor: string;
  welcomeMessage: string;
  thankYouMessage: string;
  defaultReviewStyle: ReviewStyle;
}

export interface QrConfig {
  isActive: boolean;
  fgColor: string;
  bgColor: string;
  token: string;
  includeLogo: boolean;
}

export interface Business {
  id: string;
  ownerId: string;
  ownerName?: string;
  clientEmail: string;
  clientAccessLevel: ClientAccessLevel;
  enabledFeatures: EnabledFeatures;
  slug: string;
  name: string;
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
  lifecycleStatus?: BusinessLifecycleStatus;
  tenantFirebase?: TenantWebAppConfig | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicProfile {
  businessId: string;
  ownerId: string;
  slug: string;
  name: string;
  category: BusinessCategory;
  googleReviewUrl: string;
  logoDataUrl: string;
  enabledFeatures: EnabledFeatures;
  branding: BusinessBranding;
  qrConfig: QrConfig;
  questions: FeedbackQuestion[];
  seoKeywords?: string[];
  lifecycleStatus?: BusinessLifecycleStatus;
  tenantFirebase?: TenantWebAppConfig | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BusinessStats {
  businessId: string;
  ownerId: string;
  clientEmail: string;
  slug: string;
  scans: number;
  generated: number;
  redirects: number;
  styleShort: number;
  styleDetailed: number;
  styleProfessional: number;
  updatedAt?: unknown;
}

export type ReviewEventType = 'scan' | 'generate' | 'copy_redirect';

export interface ReviewEvent {
  id: string;
  businessId: string;
  ownerId: string;
  slug: string;
  eventType: ReviewEventType;
  reviewStyle: string;
  sentiment: string;
  selectedHighlights: string[];
  createdAt?: unknown;
}

export interface AdminUser {
  uid: string;
  email: string;
  addedBy: string;
  createdAt?: unknown;
}

export interface BusinessAiSummary {
  businessId: string;
  aiProvider: 'gemini';
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

export interface ProvisioningLogEntry {
  timestamp: string;
  step: string;
  status: 'info' | 'success' | 'error';
  message: string;
}

export interface BusinessProvisioningSummary {
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

export interface TenantMonitoringSummary {
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
}

export interface AdminInfrastructureOverview {
  aiSummaries: Record<string, BusinessAiSummary>;
  provisioningRecords: Record<string, BusinessProvisioningSummary>;
  recentUsageLogs: AiUsageLogRecord[];
  allowedModels: string[];
}

export interface TenantTemplatesBundle {
  firestoreRules: string;
  firestoreIndexes: string;
  storageRules: string;
}

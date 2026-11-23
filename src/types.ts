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

export type ReviewLanguage = 'en' | 'hi' | 'mr' | 'hinglish';

export type ReviewDraftStatus = 'Generated' | 'Edited' | 'Copied' | 'Deleted';

export interface FeedbackSubmissionResponse {
  question: string;
  answers: string[];
}

export interface FeedbackSubmission {
  id: string;
  submissionId: string;
  businessId: string;
  ownerId: string;
  clientUid?: string;
  slug: string;
  responses: FeedbackSubmissionResponse[];
  additionalComments: string;
  sentiment: string;
  selectedHighlights: string[];
  standId?: string;
  standCode?: string;
  standName?: string;
  sessionId: string;
  createdAt?: unknown;
}

export interface ReviewDraft {
  id: string;
  draftId: string;
  businessId: string;
  ownerId: string;
  clientUid?: string;
  slug: string;
  feedbackSubmissionId: string;
  reviewText: string;
  language: ReviewLanguage;
  reviewStyle: ReviewStyle;
  variationSeed: number;
  sessionId: string;
  status: ReviewDraftStatus;
  generatedAt?: unknown;
  copiedAt?: unknown;
  deletedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type QuestionType = 'single' | 'multiple' | 'text';

export type ClientAccessLevel = 'read_only' | 'qr_and_questions' | 'full';

export interface EnabledFeatures {
  aiReviewDrafts: boolean;
  customQuestions: boolean;
  pdfPosterExport: boolean;
  analyticsView: boolean;
  inStoreQrStands?: boolean;
  gbpAutoReply?: boolean;
  weeklyReports?: boolean;
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

export type GbpFiveStarMode = 'auto_publish' | 'approval_required';
export type GbpMidStarMode = 'auto_publish' | 'approval_required';

export interface GbpReplySettings {
  fiveStarMode: GbpFiveStarMode;
  midStarMode: GbpMidStarMode;
  lowStarMode: 'manual_approval_only';
  brandVoice: string;
  autoSyncEnabled: boolean;
}

export interface WeeklyReportConfig {
  enabled: boolean;
  recipients: string[];
  autoMondayEnabled: boolean;
  lastGeneratedWeekKey?: string;
}

export interface Business {
  id: string;
  ownerId: string;
  ownerName?: string;
  clientEmail: string;
  clientUid?: string;
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
  qrStandLimit?: number;
  gbpSettings?: GbpReplySettings;
  weeklyReportConfig?: WeeklyReportConfig;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicProfile {
  businessId: string;
  ownerId: string;
  clientUid?: string;
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BusinessStats {
  businessId: string;
  ownerId: string;
  clientEmail: string;
  slug: string;
  scans: number;
  formsStarted?: number;
  generated: number;
  redirects: number;
  styleShort: number;
  styleDetailed: number;
  styleProfessional: number;
  updatedAt?: unknown;
}

export type ReviewEventType = 'scan' | 'form_start' | 'generate' | 'copy_redirect';

export interface ReviewEvent {
  id: string;
  businessId: string;
  ownerId: string;
  clientUid?: string;
  slug: string;
  eventType: ReviewEventType;
  reviewStyle: string;
  sentiment: string;
  language?: ReviewLanguage;
  selectedHighlights: string[];
  standId?: string;
  standCode?: string;
  standName?: string;
  sessionId?: string;
  createdAt?: unknown;
}

export interface QrStand {
  id: string;
  businessId: string;
  ownerId: string;
  clientUid?: string;
  clientEmail: string;
  slug: string;
  slotNumber: number;
  standCode: string;
  name: string;
  placement: string;
  isActive: boolean;
  fgColor: string;
  bgColor: string;
  includeLogo: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type QrStandRequestStatus = 'pending' | 'approved' | 'rejected';

export interface QrStandRequest {
  id: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  clientUid?: string;
  clientEmail: string;
  requestedAdditionalStands: number;
  currentLimit: number;
  reason: string;
  status: QrStandRequestStatus;
  reviewedByUid?: string;
  reviewedByEmail?: string;
  adminNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type GbpConnectionStatus = 'disconnected' | 'connected' | 'pending_api_approval';

export interface GbpConnection {
  businessId: string;
  ownerId: string;
  clientEmail: string;
  connectionStatus: GbpConnectionStatus;
  connectedEmail: string;
  accountName: string;
  locationName: string;
  locationTitle: string;
  placeId: string;
  lastSyncedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type GbpReplyStatus =
  | 'pending_generation'
  | 'awaiting_approval'
  | 'auto_published'
  | 'manually_approved'
  | 'published'
  | 'failed'
  | 'ignored';

export interface GbpReview {
  id: string;
  businessId: string;
  ownerId: string;
  clientEmail: string;
  externalReviewId: string;
  reviewerName: string;
  starRating: number;
  comment: string;
  reviewDate: string;
  source: 'google_gbp_api' | 'pubsub_webhook' | 'manual_sync';
  aiReplyText: string;
  replyStatus: GbpReplyStatus;
  aiProvider: string;
  aiModelId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  errorMessage?: string;
  publishedAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AiOperationType = 'review_draft' | 'gbp_auto_reply' | 'seo_keywords';

export interface AiUsageLog {
  id?: string;
  requestId: string;
  businessId: string;
  ownerId: string;
  clientEmail?: string;
  provider?: string;
  operationType?: AiOperationType;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  status: 'success' | 'failed';
  errorCode: string;
  createdAt?: unknown;
}

export interface WeeklyModelUsageItem {
  provider: string;
  modelId: string;
  count: number;
  successCount: number;
  failedCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface WeeklyReport {
  id: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  clientEmail: string;
  weekStart: string;
  weekEnd: string;
  reviewGenMetrics: {
    totalScans: number;
    uniqueSessions: number;
    formsStarted: number;
    draftsGenerated: number;
    googleRedirects: number;
    confirmedGoogleReviews: number;
    averageGoogleRating: number;
    bestStandName: string;
    bestStandScans: number;
    lowestStandName: string;
    lowestStandScans: number;
  };
  autoReplyMetrics: {
    totalNewReviews: number;
    aiRepliesGenerated: number;
    autoPublished: number;
    waitingApproval: number;
    manuallyApproved: number;
    failedReplies: number;
    ignoredReviews: number;
  };
  aiUsageMetrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    estimatedCostUsd: number;
    byModel: WeeklyModelUsageItem[];
  };
  dispatchedToEmails: string[];
  dispatchedAt?: string;
  generatedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminUser {
  uid: string;
  email: string;
  addedBy: string;
  createdAt?: unknown;
}

export interface AdminEmail {
  email: string;
  addedBy: string;
  createdAt?: unknown;
}

export type QualityIssueType =
  | 'invented_claim'
  | 'contradiction'
  | 'repetition'
  | 'script_mismatch'
  | 'ai_cliche'
  | 'empty_output';

export interface QualityIssue {
  type: QualityIssueType;
  severity: 'error' | 'warning';
  message: string;
  evidence?: string;
}

export interface ReviewQualityReport {
  score: number;
  passed: boolean;
  language: ReviewLanguage;
  inventedClaimCount: number;
  contradictionCount: number;
  repetitionCount: number;
  scriptCompliant: boolean;
  clicheCount: number;
  groundedFactCount: number;
  autoRepaired: boolean;
  issues: QualityIssue[];
}

export interface ReviewEvaluation {
  id: string;
  evalId: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  clientUid?: string;
  slug: string;
  category: BusinessCategory;
  language: ReviewLanguage;
  reviewStyle: ReviewStyle;
  draftId?: string;
  source: 'live_customer' | 'admin_benchmark';
  modelId: string;
  score: number;
  passed: boolean;
  inventedClaimCount: number;
  contradictionCount: number;
  repetitionCount: number;
  scriptCompliant: boolean;
  clicheCount: number;
  groundedFactCount: number;
  autoRepaired: boolean;
  issues: QualityIssue[];
  responsesSummary: string;
  generatedReview: string;
  createdAt?: unknown;
}

export type CurationStatus = 'pending' | 'approved' | 'archived';

export interface ConsentedExample {
  id: string;
  exampleId: string;
  businessId: string;
  ownerId: string;
  slug: string;
  category: BusinessCategory;
  language: ReviewLanguage;
  reviewStyle: ReviewStyle;
  responsesSummary: string;
  additionalComments: string;
  generatedReview: string;
  finalReview: string;
  qualityScore: number;
  consentGiven: boolean;
  curationStatus: CurationStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}


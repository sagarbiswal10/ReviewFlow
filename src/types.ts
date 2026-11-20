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

export interface AdminEmail {
  email: string;
  addedBy: string;
  createdAt?: unknown;
}

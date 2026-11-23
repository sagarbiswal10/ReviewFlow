import {
  FORM_TEMPLATE_IDS,
  type ClientAccessLevel,
  type EnabledFeatures,
  type FormTemplateId,
  type GbpReplySettings,
  type ReviewEventType,
  type WeeklyReportConfig,
} from '../types';

export const VISITOR_QUOTA_MAX_GENERATIONS = 5;
export const VISITOR_QUOTA_WINDOW_MS = 5 * 60 * 1000;

export const DEFAULT_ENABLED_FEATURES_SAFE: EnabledFeatures = {
  aiReviewDrafts: true,
  customQuestions: true,
  pdfPosterExport: true,
  analyticsView: true,
  inStoreQrStands: true,
  gbpAutoReply: true,
  weeklyReports: true,
};

export function clampString(val: unknown, max: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase().slice(0, 120);
}

export function sanitizeSlug(raw: string): string {
  const cleaned = String(raw || '')
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

export function sanitizeFormTemplate(val?: unknown): FormTemplateId {
  if (typeof val === 'string' && (FORM_TEMPLATE_IDS as readonly string[]).includes(val)) {
    return val as FormTemplateId;
  }
  return 'classic_cards';
}

export function resolveVisitorQuotaState(
  rawCount: unknown,
  rawResetAt: unknown,
  nowMs = Date.now(),
  maxGenerations = VISITOR_QUOTA_MAX_GENERATIONS,
  windowMs = VISITOR_QUOTA_WINDOW_MS,
): { generationCount: number; quotaResetAt: number; expired: boolean } {
  const numericCount =
    typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? Math.max(0, Math.min(maxGenerations, Math.floor(rawCount)))
      : 0;
  const numericResetAt =
    typeof rawResetAt === 'number' && Number.isFinite(rawResetAt) && rawResetAt > 0
      ? Math.floor(rawResetAt)
      : 0;

  if (numericCount === 0) {
    return { generationCount: 0, quotaResetAt: 0, expired: false };
  }

  // Legacy persisted state without reset timestamp should start a clean window or expire
  if (!numericResetAt) {
    return {
      generationCount: numericCount,
      quotaResetAt: nowMs + windowMs,
      expired: false,
    };
  }

  if (nowMs >= numericResetAt) {
    return { generationCount: 0, quotaResetAt: 0, expired: true };
  }

  return {
    generationCount: numericCount,
    quotaResetAt: Math.min(numericResetAt, nowMs + windowMs),
    expired: false,
  };
}

export function formatQuotaCountdown(resetAtMs: number, nowMs = Date.now()): string {
  const remainingMs = Math.max(0, resetAtMs - nowMs);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function sanitizeEnabledFeatures(features?: Partial<EnabledFeatures>): EnabledFeatures {
  return {
    aiReviewDrafts: features?.aiReviewDrafts ?? DEFAULT_ENABLED_FEATURES_SAFE.aiReviewDrafts,
    customQuestions: features?.customQuestions ?? DEFAULT_ENABLED_FEATURES_SAFE.customQuestions,
    pdfPosterExport: features?.pdfPosterExport ?? DEFAULT_ENABLED_FEATURES_SAFE.pdfPosterExport,
    analyticsView: features?.analyticsView ?? DEFAULT_ENABLED_FEATURES_SAFE.analyticsView,
    inStoreQrStands: features?.inStoreQrStands ?? DEFAULT_ENABLED_FEATURES_SAFE.inStoreQrStands,
    gbpAutoReply: features?.gbpAutoReply ?? DEFAULT_ENABLED_FEATURES_SAFE.gbpAutoReply,
    weeklyReports: features?.weeklyReports ?? DEFAULT_ENABLED_FEATURES_SAFE.weeklyReports,
  };
}

export function sanitizeGbpSettings(settings?: Partial<GbpReplySettings>): GbpReplySettings {
  return {
    fiveStarMode:
      settings?.fiveStarMode === 'approval_required' ? 'approval_required' : 'auto_publish',
    midStarMode:
      settings?.midStarMode === 'auto_publish' ? 'auto_publish' : 'approval_required',
    // Security & reputation safeguard: 1–2 star reviews always require manual approval.
    lowStarMode: 'manual_approval_only',
    brandVoice: clampString(settings?.brandVoice ?? '', 400),
    autoSyncEnabled: settings?.autoSyncEnabled ?? true,
  };
}

export function sanitizeWeeklyReportConfig(
  config?: Partial<WeeklyReportConfig>,
  fallbackEmail = '',
): WeeklyReportConfig {
  const cleanFallback = normalizeEmail(fallbackEmail);
  const recipients = Array.isArray(config?.recipients)
    ? config.recipients
        .map((r) => normalizeEmail(String(r || '')))
        .filter((r) => Boolean(r) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))
        .slice(0, 10)
    : cleanFallback && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanFallback)
      ? [cleanFallback]
      : [];
  return {
    enabled: config?.enabled ?? true,
    recipients,
    autoMondayEnabled: config?.autoMondayEnabled ?? true,
    ...(config?.lastGeneratedWeekKey
      ? { lastGeneratedWeekKey: clampString(config.lastGeneratedWeekKey, 24) }
      : {}),
  };
}

export function sanitizeAccessLevel(level?: unknown): ClientAccessLevel {
  if (level === 'read_only' || level === 'qr_and_questions' || level === 'full') {
    return level;
  }
  return 'full';
}

export function getTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === 'object' && value !== null) {
    const candidate = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: unknown;
      _seconds?: unknown;
    };
    if (typeof candidate.toMillis === 'function') {
      try {
        const ms = candidate.toMillis();
        if (Number.isFinite(ms)) return ms;
      } catch {
        // Fallback below
      }
    }
    if (typeof candidate.toDate === 'function') {
      try {
        const ms = candidate.toDate().getTime();
        if (Number.isFinite(ms)) return ms;
      } catch {
        // Fallback below
      }
    }
    const rawSec = candidate.seconds ?? candidate._seconds;
    if (rawSecondsOrUnknown(rawSec) !== null) {
      const sec = Number(rawSec);
      if (Number.isFinite(sec)) return sec * 1000;
    }
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function rawSecondsOrUnknown(v: unknown): unknown {
  return v !== undefined && v !== null ? v : null;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getMondaySundayWindow(
  weekOffset = 0,
  referenceDate = new Date(),
): {
  weekStart: string;
  weekEnd: string;
  startMs: number;
  endMs: number;
} {
  const day = referenceDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() + diffToMonday + weekOffset * 7,
  );
  const sunday = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 6,
    23,
    59,
    59,
    999,
  );
  return {
    weekStart: toIsoDate(monday),
    weekEnd: toIsoDate(sunday),
    startMs: monday.getTime(),
    endMs: sunday.getTime(),
  };
}

export function isMondayToday(referenceDate = new Date()): boolean {
  return referenceDate.getDay() === 1;
}

export function formatReviewEventActionLabel(eventType: ReviewEventType | string): string {
  if (eventType === 'scan') return 'QR Scan';
  if (eventType === 'form_start') return 'Started Form';
  if (eventType === 'generate') return 'AI Draft Created';
  return 'Opened Google Review';
}

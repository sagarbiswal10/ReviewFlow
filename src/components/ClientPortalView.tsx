import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileBarChart2,
  FileText,
  HelpCircle,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  LogOut,
  Mail,
  Menu,
  MoreVertical,
  Palette,
  PauseCircle,
  Plus,
  QrCode,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import type {
  Business,
  BusinessStats,
  PublicProfile,
  ReviewDraft,
  ReviewEvent,
  ReviewEventType,
} from '../types';
import {
  claimBusinessClientUid,
  subscribeToBusinessEvents,
  subscribeToBusinessReviewDrafts,
  subscribeToBusinessStats,
} from '../services/businessService';
import { getPublicAppUrl } from '../utils/apiClient';
import { downloadQrPdf, downloadQrPng, renderQrToCanvas } from '../utils/qrAndPdf';
import { hasPasswordProvider, sanitizeExternalUrl } from '../utils/urlAndAuth';
import { AccountSecurityModal } from './AccountSecurityModal';
import { BusinessLogo } from './BusinessLogo';
import { QrStudioTab } from './QrStudioTab';
import { QuestionBuilderTab } from './QuestionBuilderTab';
import { BrandingTab } from './BrandingTab';
import { CustomerReviewFlow } from './CustomerReviewFlow';
import { QrStandsTab } from './QrStandsTab';
import { GbpAutoReplyTab } from './GbpAutoReplyTab';
import { WeeklyReportsTab } from './WeeklyReportsTab';
import { TemplatesTab } from './TemplatesTab';

type PortalTab =
  | 'qr_features'
  | 'qr_stands'
  | 'gbp_reply'
  | 'weekly_reports'
  | 'templates'
  | 'qr_editor'
  | 'questions'
  | 'branding'
  | 'preview';
type EventFilter = 'all' | ReviewEventType;
type ReportPeriod = 'daily' | '7d' | '1m' | 'date' | 'all';

interface ClientPortalViewProps {
  user: User;
  isAdmin: boolean;
  businesses: Business[];
  activeBusiness: Business | null;
  onSelectBusiness: (id: string) => void;
  onOpenNewBusiness: () => void;
  onViewLanding: () => void;
  onSwitchToAdmin?: () => void;
  onLinkEmailPassword?: (password: string) => Promise<void>;
  onSignOut: () => void;
}

const ACCESS_LABELS = {
  read_only: 'View & Download Only',
  qr_and_questions: 'QR Studio & Questions',
  full: 'Full Self-Service',
} as const;

const TAB_TITLES: Record<PortalTab, string> = {
  qr_features: 'Overview',
  qr_stands: 'QR Stands',
  gbp_reply: 'GBP Auto Reply',
  weekly_reports: 'Weekly Reports',
  templates: 'Templates',
  qr_editor: 'QR Studio',
  questions: 'Question Builder',
  branding: 'Branding & Profile',
  preview: 'Customer Form Preview',
};

function parseEventMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') {
    return Number.isFinite(ts) ? ts : 0;
  }
  if (ts instanceof Date) {
    const ms = ts.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof ts === 'object' && ts !== null) {
    const candidate = ts as {
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
        // Fallback to seconds fields below
      }
    }
    if (typeof candidate.toDate === 'function') {
      try {
        const ms = candidate.toDate().getTime();
        if (Number.isFinite(ms)) return ms;
      } catch {
        // Fallback to seconds fields below
      }
    }
    const rawSeconds = candidate.seconds ?? candidate._seconds;
    if (rawSeconds !== undefined && rawSeconds !== null) {
      const sec = Number(rawSeconds);
      if (Number.isFinite(sec)) return sec * 1000;
    }
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatRelativeTime(ts: unknown): string {
  const ms = parseEventMs(ts);
  if (!ms) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString();
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEventDateTime(ts: unknown): string {
  const ms = parseEventMs(ts);
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Smooth cubic bezier SVG path builder for calm, clean analytics curves
function buildSmoothSeriesPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX.toFixed(1)},${p0.y.toFixed(1)} ${midX.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

export function ClientPortalView({
  user,
  isAdmin,
  businesses,
  activeBusiness,
  onSelectBusiness,
  onOpenNewBusiness,
  onViewLanding,
  onSwitchToAdmin,
  onLinkEmailPassword,
  onSignOut,
}: ClientPortalViewProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('qr_features');
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDraft[]>([]);
  const [eventsAccessError, setEventsAccessError] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('7d');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateStr(new Date()));
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false);
  const [showDetailsStrip, setShowDetailsStrip] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const claimedAttemptRef = useRef<Set<string>>(new Set());
  const claimingInFlightRef = useRef<Set<string>>(new Set());
  const hasPasswordAuth = hasPasswordProvider(user.providerData);

  useEffect(() => {
    if (!switcherOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [switcherOpen]);

  const activeBizId = activeBusiness?.id ?? '';
  const activeBizOwnerId = activeBusiness?.ownerId ?? '';
  const activeBizClientEmail = activeBusiness?.clientEmail ?? '';
  const activeBizClientUid = activeBusiness?.clientUid ?? '';
  const isClientUidLinked = activeBizClientUid === user.uid;

  useEffect(() => {
    if (
      !activeBusiness ||
      isAdmin ||
      activeBizOwnerId === user.uid ||
      isClientUidLinked
    ) {
      return;
    }
    const normalizedEmail = (user.email || '').trim().toLowerCase();
    const attemptKey = `${activeBizId}:${user.uid}`;
    if (
      normalizedEmail &&
      activeBizClientEmail === normalizedEmail &&
      !claimedAttemptRef.current.has(attemptKey) &&
      !claimingInFlightRef.current.has(attemptKey)
    ) {
      claimingInFlightRef.current.add(attemptKey);
      claimBusinessClientUid(activeBusiness, user.uid)
        .then((res) => {
          claimedAttemptRef.current.add(attemptKey);
          if (!res.ok && res.error) {
            setEventsAccessError(res.error);
          }
        })
        .catch((err) => {
          claimedAttemptRef.current.add(attemptKey);
          setEventsAccessError(
            err instanceof Error ? err.message : 'Unable to link client account.',
          );
        })
        .finally(() => {
          claimingInFlightRef.current.delete(attemptKey);
        });
    }
  }, [
    activeBizId,
    activeBizOwnerId,
    activeBizClientEmail,
    isClientUidLinked,
    user.uid,
    user.email,
    isAdmin,
  ]);

  useEffect(() => {
    setShowAllActivity(false);
  }, [activeBusiness?.id, reportPeriod, selectedDate, eventFilter]);

  useEffect(() => {
    if (!activeBizId) {
      setStats(null);
      setEvents([]);
      setReviewDrafts([]);
      setEventsAccessError(null);
      return;
    }
    setEventsAccessError(null);
    setPdfExportError(null);
    const unsubStats = subscribeToBusinessStats(
      activeBizId,
      (next) => {
        setStats(next);
      },
      (err) => {
        setStats(null);
        setEventsAccessError((prev) => prev || err?.message || 'Unable to load analytics stats.');
      },
    );
    const unsubEvents = subscribeToBusinessEvents(
      activeBizId,
      activeBizOwnerId,
      user.uid,
      isAdmin,
      (nextEvents) => {
        setEvents(nextEvents);
        setEventsAccessError(null);
      },
      (err) => {
        setEvents([]);
        setEventsAccessError(err?.message || 'Unable to load event history from Firestore.');
      },
      activeBizClientUid,
    );
    const unsubDrafts = subscribeToBusinessReviewDrafts(
      activeBizId,
      activeBizOwnerId,
      user.uid,
      isAdmin,
      (nextDrafts) => {
        setReviewDrafts(nextDrafts);
      },
      () => {
        setReviewDrafts([]);
      },
      activeBizClientUid,
    );
    return () => {
      unsubStats();
      unsubEvents();
      unsubDrafts();
    };
  }, [activeBizId, activeBizOwnerId, isClientUidLinked, user.uid, isAdmin]);

  useEffect(() => {
    if (!activeBusiness) return;
    const f = activeBusiness.enabledFeatures;
    const isTabDisabledByFeature =
      (activeTab === 'templates' && f.formTemplates === false) ||
      (activeTab === 'qr_editor' && f.qrStudio === false) ||
      (activeTab === 'questions' && !f.customQuestions) ||
      (activeTab === 'branding' && f.brandingSettings === false) ||
      (activeTab === 'qr_stands' && f.inStoreQrStands === false) ||
      (activeTab === 'gbp_reply' && f.gbpAutoReply === false) ||
      (activeTab === 'weekly_reports' && f.weeklyReports === false);

    if (isTabDisabledByFeature) {
      setActiveTab('qr_features');
      return;
    }

    if (isAdmin) return;
    const allowedReadOnly: PortalTab[] = [
      'qr_features',
      'qr_stands',
      'gbp_reply',
      'weekly_reports',
      'templates',
      'preview',
    ];
    if (
      activeBusiness.clientAccessLevel === 'read_only' &&
      !allowedReadOnly.includes(activeTab)
    ) {
      setActiveTab('qr_features');
    } else if (
      activeBusiness.clientAccessLevel === 'qr_and_questions' &&
      activeTab === 'branding'
    ) {
      setActiveTab('qr_features');
    }
  }, [
    activeBusiness?.id,
    activeBusiness?.clientAccessLevel,
    activeBusiness?.enabledFeatures,
    activeTab,
    isAdmin,
  ]);

  const publicBaseUrl = getPublicAppUrl();
  const reviewUrl = activeBusiness
    ? `${publicBaseUrl}/review/${activeBusiness.slug}?v=${activeBusiness.qrConfig.token}`
    : '';
  const displayReviewUrl = reviewUrl.replace(/^https?:\/\//, '');

  const qrFgColor = activeBusiness?.qrConfig.fgColor || '#0F172A';
  const qrBgColor = activeBusiness?.qrConfig.bgColor || '#FFFFFF';
  const qrIncludeLogo = Boolean(activeBusiness?.qrConfig.includeLogo);
  const qrLogoSrc = activeBusiness?.logoDataUrl || '';

  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !activeBusiness?.id || activeTab !== 'qr_features') return;
    renderQrToCanvas({
      canvas,
      url: reviewUrl,
      fgColor: qrFgColor,
      bgColor: qrBgColor,
      size: 280,
      includeLogo: qrIncludeLogo,
      logoSrc: qrLogoSrc,
    });
  }, [
    activeBusiness?.id,
    reviewUrl,
    qrFgColor,
    qrBgColor,
    qrIncludeLogo,
    qrLogoSrc,
    activeTab,
  ]);

  const accessLevel = activeBusiness?.clientAccessLevel ?? 'read_only';
  const canEditQrOrQuestions =
    isAdmin || accessLevel === 'qr_and_questions' || accessLevel === 'full';
  const canEditBranding = isAdmin || accessLevel === 'full';

  const handleCopyLink = async () => {
    if (!reviewUrl) return;
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadPng = () => {
    if (!qrCanvasRef.current || !activeBusiness) return;
    downloadQrPng(qrCanvasRef.current, activeBusiness.slug);
  };

  const handleDownloadPdf = async () => {
    if (!activeBusiness) return;
    setIsExportingPdf(true);
    setPdfExportError(null);
    try {
      await downloadQrPdf({
        businessName: activeBusiness.name,
        category: activeBusiness.category,
        welcomeMessage: activeBusiness.branding.welcomeMessage,
        reviewUrl,
        fgColor: activeBusiness.qrConfig.fgColor,
        bgColor: activeBusiness.qrConfig.bgColor,
        primaryColor: activeBusiness.branding.primaryColor,
        includeLogo: activeBusiness.qrConfig.includeLogo,
        logoSrc: activeBusiness.logoDataUrl,
        slug: activeBusiness.slug,
      });
    } catch (err) {
      setPdfExportError(
        err instanceof Error ? err.message : 'Unable to generate PDF poster. Please try again.',
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const previewProfile: PublicProfile | null = activeBusiness
    ? {
        businessId: activeBusiness.id,
        ownerId: activeBusiness.ownerId,
        slug: activeBusiness.slug,
        name: activeBusiness.name,
        category: activeBusiness.category,
        googleReviewUrl: activeBusiness.googleReviewUrl,
        logoDataUrl: activeBusiness.logoDataUrl,
        enabledFeatures: activeBusiness.enabledFeatures,
        branding: activeBusiness.branding,
        qrConfig: activeBusiness.qrConfig,
        questions: activeBusiness.questions,
        formTemplate: activeBusiness.formTemplate,
        seoKeywords: activeBusiness.seoKeywords,
      }
    : null;

  const canReadEventHistory =
    Boolean(activeBusiness) &&
    (isAdmin ||
      activeBusiness?.ownerId === user.uid ||
      activeBusiness?.clientUid === user.uid);

  const todayIso = useMemo(() => toLocalDateStr(new Date()), []);

  const reportWindowMeta = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (reportPeriod === 'daily') {
      return {
        label: `Daily Report · ${formatDateLabel(todayIso)}`,
        shortLabel: 'Today',
        startMs: startOfToday,
        endMs: startOfToday + 86400000 - 1,
      };
    }
    if (reportPeriod === '7d') {
      const start7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
      return {
        label: '7-Day Report · Last 7 days',
        shortLabel: 'Last 7 days',
        startMs: start7,
        endMs: startOfToday + 86400000 - 1,
      };
    }
    if (reportPeriod === '1m') {
      const start30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
      return {
        label: '1-Month Report · Last 30 days',
        shortLabel: 'Last 30 days',
        startMs: start30,
        endMs: startOfToday + 86400000 - 1,
      };
    }
    if (reportPeriod === 'date') {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const startDate =
        y && m && d ? new Date(y, m - 1, d).getTime() : startOfToday;
      return {
        label: `Date Report · ${formatDateLabel(selectedDate)}`,
        shortLabel: formatDateLabel(selectedDate),
        startMs: startDate,
        endMs: startDate + 86400000 - 1,
      };
    }
    return {
      label: 'All-Time Report · Lifetime totals',
      shortLabel: 'All time',
      startMs: 0,
      endMs: Number.MAX_SAFE_INTEGER,
    };
  }, [reportPeriod, selectedDate, todayIso]);

  const periodEvents = useMemo(() => {
    if (reportPeriod === 'all') return events;
    return events.filter((ev) => {
      const ms = parseEventMs(ev.createdAt);
      if (!ms) return false;
      if (reportPeriod === 'daily') {
        return toLocalDateStr(new Date(ms)) === todayIso;
      }
      if (reportPeriod === 'date') {
        return toLocalDateStr(new Date(ms)) === selectedDate;
      }
      return ms >= reportWindowMeta.startMs && ms <= reportWindowMeta.endMs;
    });
  }, [events, reportPeriod, selectedDate, todayIso, reportWindowMeta.startMs, reportWindowMeta.endMs]);

  const useLifetimeStats = reportPeriod === 'all' || !canReadEventHistory;
  const scansCount = useLifetimeStats
    ? (stats?.scans ?? 0)
    : periodEvents.filter((e) => e.eventType === 'scan').length;
  const generatedCount = useLifetimeStats
    ? (stats?.generated ?? 0)
    : periodEvents.filter((e) => e.eventType === 'generate').length;
  const redirectsCount = useLifetimeStats
    ? (stats?.redirects ?? 0)
    : periodEvents.filter((e) => e.eventType === 'copy_redirect').length;
  const conversionRate = scansCount > 0 ? Math.round((redirectsCount / scansCount) * 100) : 0;
  const draftCompletionRate = scansCount > 0 ? Math.round((generatedCount / scansCount) * 100) : 0;

  const styleShort = useLifetimeStats
    ? (stats?.styleShort ?? 0)
    : periodEvents.filter((e) => e.eventType === 'generate' && e.reviewStyle === 'short').length;
  const styleDetailed = useLifetimeStats
    ? (stats?.styleDetailed ?? 0)
    : periodEvents.filter((e) => e.eventType === 'generate' && e.reviewStyle === 'detailed').length;
  const styleProfessional = useLifetimeStats
    ? (stats?.styleProfessional ?? 0)
    : periodEvents.filter((e) => e.eventType === 'generate' && e.reviewStyle === 'professional').length;
  const styleTotal = styleShort + styleDetailed + styleProfessional;
  const pctShort = styleTotal > 0 ? Math.round((styleShort / styleTotal) * 100) : 0;
  const pctDetailed = styleTotal > 0 ? Math.round((styleDetailed / styleTotal) * 100) : 0;
  const pctProfessional =
    styleTotal > 0 ? Math.max(0, 100 - pctShort - pctDetailed) : 0;

  const chartSeries = useMemo(() => {
    if (reportPeriod === 'daily' || reportPeriod === 'date') {
      const slots: { label: string; key: string; scans: number; generated: number; redirects: number }[] = [];
      for (let h = 0; h < 24; h += 2) {
        const hour12 = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
        slots.push({
          label: hour12,
          key: String(h),
          scans: 0,
          generated: 0,
          redirects: 0,
        });
      }
      for (const ev of periodEvents) {
        const ms = parseEventMs(ev.createdAt);
        if (!ms) continue;
        const slotIdx = Math.floor(new Date(ms).getHours() / 2);
        const bucket = slots[slotIdx];
        if (!bucket) continue;
        if (ev.eventType === 'scan') bucket.scans += 1;
        else if (ev.eventType === 'generate') bucket.generated += 1;
        else if (ev.eventType === 'copy_redirect') bucket.redirects += 1;
      }
      return slots;
    }

    const numDays = reportPeriod === '7d' ? 7 : 30;
    const days: { label: string; key: string; scans: number; generated: number; redirects: number }[] = [];
    const now = new Date();
    for (let i = numDays - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = toLocalDateStr(d);
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      days.push({ label, key, scans: 0, generated: 0, redirects: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));
    for (const ev of periodEvents) {
      const ms = parseEventMs(ev.createdAt);
      if (!ms) continue;
      const key = toLocalDateStr(new Date(ms));
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      if (ev.eventType === 'scan') bucket.scans += 1;
      else if (ev.eventType === 'generate') bucket.generated += 1;
      else if (ev.eventType === 'copy_redirect') bucket.redirects += 1;
    }
    return days;
  }, [periodEvents, reportPeriod]);

  const chartAxisLabels = useMemo(() => {
    if (chartSeries.length <= 12) return chartSeries.map((d) => d.label);
    const idxs = [0, 7, 14, 21, chartSeries.length - 1];
    return idxs.map((i) => chartSeries[i]?.label || '');
  }, [chartSeries]);

  const maxDailyValue = useMemo(() => {
    let maxVal = 1;
    for (const d of chartSeries) {
      maxVal = Math.max(maxVal, d.scans, d.generated, d.redirects);
    }
    return maxVal;
  }, [chartSeries]);

  const scanPoints = useMemo(
    () =>
      chartSeries.map((d, idx) => ({
        x: 24 + (idx / Math.max(1, chartSeries.length - 1)) * 652,
        y: 196 - (d.scans / maxDailyValue) * 160,
      })),
    [chartSeries, maxDailyValue],
  );
  const redirectPoints = useMemo(
    () =>
      chartSeries.map((d, idx) => ({
        x: 24 + (idx / Math.max(1, chartSeries.length - 1)) * 652,
        y: 196 - (d.redirects / maxDailyValue) * 160,
      })),
    [chartSeries, maxDailyValue],
  );
  const draftPoints = useMemo(
    () =>
      chartSeries.map((d, idx) => ({
        x: 8 + (idx / Math.max(1, chartSeries.length - 1)) * 184,
        y: 34 - (d.generated / maxDailyValue) * 26,
      })),
    [chartSeries, maxDailyValue],
  );
  const miniRedirectPoints = useMemo(
    () =>
      chartSeries.map((d, idx) => ({
        x: 8 + (idx / Math.max(1, chartSeries.length - 1)) * 184,
        y: 34 - (d.redirects / maxDailyValue) * 26,
      })),
    [chartSeries, maxDailyValue],
  );

  const scanLinePath = buildSmoothSeriesPath(scanPoints);
  const redirectLinePath = buildSmoothSeriesPath(redirectPoints);
  const scanAreaPath = scanLinePath ? `${scanLinePath} L 676,198 L 24,198 Z` : '';
  const redirectAreaPath = redirectLinePath ? `${redirectLinePath} L 676,198 L 24,198 Z` : '';
  const draftSparkPath = buildSmoothSeriesPath(draftPoints);
  const redirectSparkPath = buildSmoothSeriesPath(miniRedirectPoints);

  const topHighlights = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of periodEvents) {
      if (!Array.isArray(ev.selectedHighlights)) continue;
      for (const h of ev.selectedHighlights) {
        const label = h.trim();
        if (!label) continue;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [periodEvents]);

  const matchingStageEvents = useMemo(() => {
    if (eventFilter === 'all') return periodEvents;
    return periodEvents.filter((e) => e.eventType === eventFilter);
  }, [periodEvents, eventFilter]);

  const visibleEvents = useMemo(
    () => (showAllActivity ? matchingStageEvents : matchingStageEvents.slice(0, 8)),
    [matchingStageEvents, showAllActivity],
  );

  const scanEventCount = periodEvents.filter((e) => e.eventType === 'scan').length;
  const generateEventCount = periodEvents.filter((e) => e.eventType === 'generate').length;
  const redirectEventCount = periodEvents.filter((e) => e.eventType === 'copy_redirect').length;

  const handleExportReportCsv = () => {
    if (!activeBusiness) return;
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows: string[] = [];
    rows.push(['Report Period', reportWindowMeta.label].map(escapeCsv).join(','));
    rows.push(['Business', activeBusiness.name].map(escapeCsv).join(','));
    rows.push(['QR Scans', scansCount].map(escapeCsv).join(','));
    rows.push(['AI Drafts Generated', generatedCount].map(escapeCsv).join(','));
    rows.push(['Google Redirects', redirectsCount].map(escapeCsv).join(','));
    rows.push(['Scan-to-Google Rate (%)', conversionRate].map(escapeCsv).join(','));
    rows.push('');
    rows.push(['Bucket', 'Scans', 'AI Drafts', 'Google Redirects'].map(escapeCsv).join(','));
    for (const bucket of chartSeries) {
      rows.push(
        [bucket.label, bucket.scans, bucket.generated, bucket.redirects].map(escapeCsv).join(','),
      );
    }
    if (periodEvents.length > 0) {
      rows.push('');
      rows.push(
        ['Timestamp', 'Event Type', 'Tone', 'Sentiment', 'Selected Highlights']
          .map(escapeCsv)
          .join(','),
      );
      for (const ev of periodEvents) {
        rows.push(
          [
            formatEventDateTime(ev.createdAt),
            ev.eventType,
            ev.reviewStyle || '',
            ev.sentiment || '',
            (ev.selectedHighlights || []).join(' | '),
          ]
            .map(escapeCsv)
            .join(','),
        );
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBusiness.slug}-${reportPeriod}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectTab = (tab: PortalTab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  const jumpToOverviewSection = (sectionId: string) => {
    setActiveTab('qr_features');
    setMobileSidebarOpen(false);
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const primarySidebarLinks: {
    id: PortalTab;
    label: string;
    icon: typeof LayoutDashboard;
    visible: boolean;
  }[] = [
    { id: 'qr_features', label: 'Overview', icon: LayoutDashboard, visible: true },
    {
      id: 'qr_stands',
      label: 'QR Stands',
      icon: Layers,
      visible: activeBusiness?.enabledFeatures.inStoreQrStands !== false,
    },
    {
      id: 'qr_editor',
      label: 'QR Studio',
      icon: QrCode,
      visible: canEditQrOrQuestions && activeBusiness?.enabledFeatures.qrStudio !== false,
    },
    {
      id: 'questions',
      label: 'Question Builder',
      icon: FileText,
      visible: canEditQrOrQuestions && (activeBusiness?.enabledFeatures.customQuestions ?? true),
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: LayoutGrid,
      visible: activeBusiness?.enabledFeatures.formTemplates !== false,
    },
    {
      id: 'gbp_reply',
      label: 'GBP Auto Reply',
      icon: Bot,
      visible: activeBusiness?.enabledFeatures.gbpAutoReply !== false,
    },
    {
      id: 'weekly_reports',
      label: 'Weekly Reports',
      icon: FileBarChart2,
      visible: activeBusiness?.enabledFeatures.weeklyReports !== false,
    },
  ];

  const sanitizeGoogleDest = activeBusiness
    ? sanitizeExternalUrl(activeBusiness.googleReviewUrl, 'https://www.google.com/maps')
    : 'https://www.google.com/maps';

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between gap-4">
      <div className="space-y-4">
        {/* Business Lockup & Switcher */}
        {activeBusiness ? (
          <div className="relative" ref={switcherRef}>
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <BusinessLogo
                  src={activeBusiness.logoDataUrl}
                  name={activeBusiness.name}
                  primaryColor="#0F172A"
                  sizeClass="w-8 h-8 rounded-full"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                    {activeBusiness.name}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate leading-tight">
                    {activeBusiness.category}
                  </p>
                </div>
              </div>

              {businesses.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSwitcherOpen((p) => !p)}
                  aria-label="Switch business"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              )}
            </div>

            {switcherOpen && businesses.length > 1 && (
              <div className="absolute left-0 right-0 mt-1 rounded-2xl border border-slate-200 bg-white shadow-lg p-1.5 space-y-1 z-50">
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => {
                      onSelectBusiness(biz.id);
                      setSwitcherOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center gap-2 text-left text-xs transition-colors cursor-pointer ${
                      biz.id === activeBusiness.id
                        ? 'bg-emerald-50 text-emerald-800 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <BusinessLogo
                      src={biz.logoDataUrl}
                      name={biz.name}
                      primaryColor={biz.branding.primaryColor}
                      sizeClass="w-6 h-6"
                    />
                    <span className="truncate flex-1">{biz.name}</span>
                    {biz.id === activeBusiness.id && (
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">
            Pending Assignment
          </div>
        )}

        {/* Primary Workspace Links */}
        {activeBusiness && (
          <nav className="space-y-0.5">
            {primarySidebarLinks
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#E6F7EE] text-[#047857] font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[#059669]' : 'text-slate-500'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
          </nav>
        )}

        {/* Insights Section */}
        {activeBusiness && (
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <p className="px-3 text-[11px] font-medium text-slate-400 mb-1">Insights</p>
            <button
              type="button"
              onClick={() => jumpToOverviewSection('portal-analytics')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Analytics</span>
            </button>
            <button
              type="button"
              onClick={() => jumpToOverviewSection('portal-kpis')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-slate-500 shrink-0" />
              <span>AI Drafts</span>
            </button>
            <button
              type="button"
              onClick={() => jumpToOverviewSection('portal-activity')}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Activity</span>
            </button>
          </div>
        )}

        {/* Engage Section */}
        {activeBusiness && (
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <p className="px-3 text-[11px] font-medium text-slate-400 mb-1">Engage</p>
            <button
              type="button"
              onClick={() => jumpToOverviewSection('portal-highlights')}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Trophy className="w-4 h-4 text-slate-500 shrink-0" />
                <span>Highlights</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-semibold tabular-nums">
                {topHighlights.length || activeBusiness.questions.length}
              </span>
            </button>

            {canEditBranding && activeBusiness.enabledFeatures.brandingSettings !== false && (
              <button
                type="button"
                onClick={() => selectTab('branding')}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
                  activeTab === 'branding'
                    ? 'bg-[#E6F7EE] text-[#047857] font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <Palette
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'branding' ? 'text-[#059669]' : 'text-slate-500'
                  }`}
                />
                <span>Branding &amp; Profile</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => selectTab('preview')}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-[#E6F7EE] text-[#047857] font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <Eye
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'preview' ? 'text-[#059669]' : 'text-slate-500'
                }`}
              />
              <span>Customer Form Preview</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Support & Management Block */}
      <div className="pt-3 border-t border-slate-100 space-y-1">
        <p className="px-3 text-[11px] font-semibold text-slate-700 mb-1">ReviewFlow Support</p>

        {onLinkEmailPassword && (
          <button
            type="button"
            onClick={() => {
              setMobileSidebarOpen(false);
              setAccountSecurityOpen(true);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>{hasPasswordAuth ? 'Account & Sign-In' : 'Set Email Password'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onViewLanding}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
        >
          <Home className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>Landing Page</span>
        </button>

        {isAdmin && onSwitchToAdmin && (
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Business Management</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen portal-aurora-canvas text-slate-900 antialiased flex">
      {/* Far-Left Compact Icon Rail (Desktop) */}
      <aside className="hidden lg:flex flex-col items-center justify-between w-[62px] py-4 px-2 shrink-0">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onViewLanding}
            title="ReviewFlow Home"
            className="w-10 h-10 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer"
          >
            <QrCode className="w-5 h-5" />
          </button>

          {activeBusiness && (
            <div className="flex flex-col items-center gap-1.5 pt-2">
              {primarySidebarLinks
                .filter((i) => i.visible)
                .slice(0, 5)
                .map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      onClick={() => selectTab(item.id)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                        active
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          {onLinkEmailPassword && (
            <button
              type="button"
              onClick={() => setAccountSecurityOpen(true)}
              title="Account & Sign-In Settings"
              className="w-8 h-8 rounded-full text-slate-500 hover:text-slate-900 hover:bg-white/70 flex items-center justify-center transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
          <div
            title={user.email || 'Client Account'}
            className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold shadow-xs select-none"
          >
            {(user.email || 'U').slice(0, 1).toUpperCase()}
          </div>
        </div>
      </aside>

      {/* Floating Rounded Sidebar Card (Desktop) */}
      <aside className="hidden lg:block w-[236px] py-4 pr-2 shrink-0">
        <div className="sticky top-4 h-[calc(100vh-2rem)] rounded-3xl bg-white/85 backdrop-blur-md border border-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.05)] p-4 overflow-y-auto">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/35 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] bg-white h-full p-5 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#10B981] text-white flex items-center justify-center">
                  <QrCode className="w-4 h-4" />
                </div>
                <span className="font-display font-bold text-sm text-slate-900">ReviewFlow</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col p-3 sm:p-4 lg:py-4 lg:pr-5 lg:pl-2">
        {/* Top Floating Utility Header Bar */}
        <header className="sticky top-3 z-30 rounded-2xl bg-white/85 backdrop-blur-md border border-white/95 shadow-[0_4px_20px_rgba(15,23,42,0.04)] px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-semibold text-slate-900 truncate">
              {activeBusiness ? TAB_TITLES[activeTab] : 'Client Portal'}
            </h1>
            {activeBusiness && (
              <span
                title={`Access: ${ACCESS_LABELS[accessLevel]} · Token: ${activeBusiness.qrConfig.token}`}
                className="hidden sm:inline-flex text-slate-400"
              >
                <HelpCircle className="w-4 h-4" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {activeBusiness && (
              <>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    activeBusiness.qrConfig.isActive
                      ? 'bg-[#DCFCE7] text-[#15803D]'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {activeBusiness.qrConfig.isActive ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>QR Active</span>
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>QR Paused</span>
                    </>
                  )}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    window.history.pushState(
                      { internalReviewNav: true },
                      '',
                      `/review/${activeBusiness.slug}?v=${activeBusiness.qrConfig.token}`,
                    );
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span className="hidden sm:inline">Open Live Review Page</span>
                  <span className="sm:hidden">Live Page</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </button>

                {activeTab === 'qr_features' && (
                  <button
                    type="button"
                    onClick={() => setShowDetailsStrip((v) => !v)}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{showDetailsStrip ? 'Hide details' : 'Report filters'}</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign Out"
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 w-full">
          {!activeBusiness ? (
            <div className="rounded-3xl bg-white/90 border border-white p-10 text-center space-y-5 max-w-xl mx-auto mt-8 shadow-sm">
              <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-bold text-slate-900">
                  {isAdmin ? 'No Business Selected Yet' : 'Client Portal Access Not Assigned'}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {isAdmin ? (
                    <>
                      Signed in as <span className="font-mono text-slate-900">{user.email}</span>.
                      Create a new business profile or switch back to Business Management.
                    </>
                  ) : (
                    <>
                      You are signed in as{' '}
                      <span className="font-mono text-slate-900">{user.email}</span>, which is not
                      assigned to any business yet. Ask your business manager to add this Gmail
                      account in Business Management to unlock Client Portal access.
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={onOpenNewBusiness}
                    className="px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register Business</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onViewLanding}
                    className="px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Home className="w-4 h-4" />
                    <span>Go to Landing Page</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'qr_features' && (
                <div className="space-y-5 pb-8">
                  {/* Optional Report Filters & CSV Export Bar */}
                  {showDetailsStrip && activeBusiness.enabledFeatures.analyticsView && (
                    <div className="rounded-2xl bg-white/90 border border-white p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {reportWindowMeta.label}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            Access: {ACCESS_LABELS[accessLevel]} · Token: {activeBusiness.qrConfig.token}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100">
                          {(
                            [
                              { id: 'daily', label: 'Daily' },
                              { id: '7d', label: '7 Days' },
                              { id: '1m', label: '1 Month' },
                              { id: 'date', label: 'Date' },
                              { id: 'all', label: 'All Time' },
                            ] as { id: ReportPeriod; label: string }[]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setReportPeriod(opt.id)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                reportPeriod === opt.id
                                  ? 'bg-[#0F172A] text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {reportPeriod === 'date' && (
                          <input
                            type="date"
                            value={selectedDate}
                            max={todayIso}
                            onChange={(e) => {
                              if (e.target.value) setSelectedDate(e.target.value);
                            }}
                            aria-label="Choose report date"
                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                          />
                        )}

                        <button
                          type="button"
                          onClick={handleExportReportCsv}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export CSV</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {pdfExportError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
                      {pdfExportError}
                    </div>
                  )}

                  {/* ROW 1: Customer Review Link Hero Card (matches Screenshot 1) */}
                  <div className="rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                    <div className="lg:col-span-7 p-6 sm:p-7 space-y-5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 mb-3">
                          Customer review link
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                          <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200/80 font-mono text-xs text-slate-700 truncate">
                            {displayReviewUrl}
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            className="px-4 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                          >
                            {copiedLink ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy link</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-2.5">
                          What&apos;s included
                        </p>
                        <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-3.5 space-y-2.5 text-xs">
                          <div className="flex items-center gap-2.5 text-slate-700">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              AI Review Drafts —{' '}
                              <strong className="font-semibold text-slate-900">
                                Short, Detailed &amp; Professional
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-slate-700">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              Dynamic feedback form ·{' '}
                              <strong className="font-semibold text-slate-900">
                                {activeBusiness.questions.length} questions
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 text-slate-700">
                            <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              Printable poster kit ·{' '}
                              <strong className="font-semibold text-slate-900">PDF &amp; PNG</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Pastel Showcase Badge (matches Screenshot 1) */}
                    <div
                      className="lg:col-span-5 p-8 flex items-center justify-center min-h-[220px]"
                      style={{
                        background:
                          'linear-gradient(135deg, #f3e8ff 0%, #fef3c7 52%, #d1fae5 100%)',
                      }}
                    >
                      <div className="w-40 h-40 rounded-3xl bg-white/95 border border-white shadow-[0_14px_32px_rgba(15,23,42,0.08)] flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full bg-[#0F172A] text-white flex flex-col items-center justify-center p-2 text-center shadow-md">
                          <QrCode className="w-6 h-6 text-white mb-1" />
                          <span className="text-[11px] font-medium text-white/90 truncate max-w-[72px]">
                            {activeBusiness.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ROW 2: QR Scans Area Chart (8 cols) + Google Review Destination (4 cols) */}
                  {activeBusiness.enabledFeatures.analyticsView && (
                    <div
                      id="portal-analytics"
                      className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
                    >
                      {/* QR Scans Chart */}
                      <div className="lg:col-span-8 rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">QR Scans</p>
                              <div className="flex items-baseline gap-2 mt-1">
                                <span className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                                  {scansCount}
                                </span>
                                <span className="text-xs text-slate-500 tabular-nums">
                                  All-time: {stats?.scans ?? scansCount}
                                </span>
                              </div>
                            </div>

                            <div className="relative">
                              <select
                                aria-label="Select analytics period"
                                value={reportPeriod}
                                onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                                className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-slate-400"
                              >
                                <option value="daily">Today</option>
                                <option value="7d">Last 7 days</option>
                                <option value="1m">Last 30 days</option>
                                <option value="all">All time</option>
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-600 mb-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#7C3AED]" />
                              <span>Scans</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                              <span>Google Redirects</span>
                            </span>
                          </div>
                        </div>

                        {canReadEventHistory && periodEvents.length > 0 ? (
                          <div>
                            <div className="relative h-52 w-full">
                              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                <div className="border-b border-slate-100" />
                                <div className="border-b border-slate-100" />
                                <div className="border-b border-slate-100" />
                              </div>

                              <svg
                                className="w-full h-full"
                                preserveAspectRatio="none"
                                viewBox="0 0 700 205"
                                aria-label="QR Scans and Google Redirects trend"
                              >
                                <defs>
                                  <linearGradient id="cleanScanGrad" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.22" />
                                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.01" />
                                  </linearGradient>
                                  <linearGradient id="cleanRedirGrad" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.18" />
                                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path d={scanAreaPath} fill="url(#cleanScanGrad)" />
                                <path
                                  d={scanLinePath}
                                  fill="none"
                                  stroke="#7C3AED"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                                <path d={redirectAreaPath} fill="url(#cleanRedirGrad)" />
                                <path
                                  d={redirectLinePath}
                                  fill="none"
                                  stroke="#10B981"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 font-mono tabular-nums">
                              {chartAxisLabels.map((lbl, idx) => (
                                <span key={`${lbl}-${idx}`}>{lbl}</span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 p-8 text-center my-2">
                            <BarChart3 className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                            <p className="text-xs font-semibold text-slate-800">
                              {canReadEventHistory
                                ? `No scan events found for ${reportWindowMeta.shortLabel}`
                                : 'Connecting event analytics'}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              Scan your QR stand or switch to All time to view historical activity.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Google Review Destination */}
                      <div className="lg:col-span-4 rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between gap-5">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-slate-900">
                              Google Review Destination
                            </h2>
                            {canEditBranding &&
                              activeBusiness.enabledFeatures.brandingSettings !== false && (
                                <button
                                  type="button"
                                  onClick={() => selectTab('branding')}
                                  className="text-xs font-semibold text-[#059669] hover:underline cursor-pointer"
                                >
                                  Edit
                                </button>
                              )}
                          </div>

                          <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-slate-600 truncate">
                              {sanitizeGoogleDest.replace(/^https?:\/\//, '')}
                            </span>
                            <a
                              href={sanitizeGoogleDest}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-[#059669] hover:underline shrink-0"
                            >
                              Test
                            </a>
                          </div>

                          {activeBusiness.seoKeywords && activeBusiness.seoKeywords.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 mb-2">
                                AI Google Search Keywords
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {activeBusiness.seoKeywords.map((kw) => (
                                  <span
                                    key={kw}
                                    className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium"
                                  >
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center text-xs font-bold tabular-nums shrink-0">
                            {conversionRate}%
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900">
                              Scan-to-Google Rate
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              Equal access · No star gating
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ROW 3: 3 KPI Mini Cards (AI Drafts, Draft Tone Mix, Google Redirects) */}
                  {activeBusiness.enabledFeatures.analyticsView && (
                    <div id="portal-kpis" className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      {/* Card 1: AI Drafts */}
                      <div className="rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">AI Drafts</p>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                              {generatedCount}
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {draftCompletionRate}% started AI draft
                            </span>
                          </div>
                        </div>

                        <div>
                          <svg viewBox="0 0 200 40" className="w-full h-10 overflow-visible">
                            <path
                              d={draftSparkPath || 'M 8,34 L 192,34'}
                              fill="none"
                              stroke="#EC4899"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                            <span>{chartAxisLabels[0] || ''}</span>
                            <span>{chartAxisLabels[chartAxisLabels.length - 1] || ''}</span>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: Draft Tone Mix */}
                      <div className="rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Draft Tone Mix</p>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                              {styleTotal}
                            </span>
                            <span className="text-xs text-slate-500">Style selections</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div
                            className="w-full h-2 rounded-full overflow-hidden"
                            style={{
                              background:
                                'linear-gradient(90deg, #8B5CF6 0%, #34D399 100%)',
                            }}
                          />
                          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                            <span>Short {pctShort}%</span>
                            <span>Detail {pctDetailed}%</span>
                            <span>Pro {pctProfessional}%</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                          <span className="text-slate-600">3 customer tones</span>
                          <span className="font-semibold text-[#059669]">Policy safe</span>
                        </div>
                      </div>

                      {/* Card 3: Google Redirects */}
                      <div className="rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Google Redirects</p>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                              {redirectsCount}
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              All-time: {stats?.redirects ?? redirectsCount}
                            </span>
                          </div>
                        </div>

                        <svg viewBox="0 0 200 40" className="w-full h-10 overflow-visible">
                          <path
                            d={redirectSparkPath || 'M 8,34 L 192,34'}
                            fill="none"
                            stroke="#EC4899"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                          <span className="inline-flex items-center gap-1 font-semibold text-[#059669]">
                            <Lock className="w-3 h-3" />
                            <span>Google Compliant</span>
                          </span>
                          <span className="text-slate-500 tabular-nums">
                            {activeBusiness.questions.length} prompts
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ROW 4: Highlights & Features (7 cols) + Business QR Stand (5 cols) */}
                  <div
                    id="portal-highlights"
                    className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
                  >
                    <div className="lg:col-span-7 rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-900">
                            {topHighlights.length > 0
                              ? 'Top Customer-Selected Highlights'
                              : 'Active Business Features & Form Summary'}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {topHighlights.length > 0
                              ? `Most tapped tags across ${periodEvents.length} recorded sessions · ${reportWindowMeta.shortLabel}`
                              : `Capabilities and feedback questions configured for ${activeBusiness.name}`}
                          </p>
                        </div>

                        {canEditQrOrQuestions && activeBusiness.enabledFeatures.customQuestions && (
                          <button
                            type="button"
                            onClick={() => selectTab('questions')}
                            className="text-xs font-semibold text-[#059669] hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <span>Edit Form</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {topHighlights.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {topHighlights.map(([label, count]) => {
                            const maxCount = topHighlights[0][1] || 1;
                            const pct = Math.max(14, Math.round((count / maxCount) * 100));
                            return (
                              <div
                                key={label}
                                className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/60 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-slate-900 truncate">
                                    {label}
                                  </span>
                                  <span className="font-mono text-slate-500 tabular-nums shrink-0">
                                    {count}x
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${pct}%`,
                                      background:
                                        'linear-gradient(90deg, #8B5CF6 0%, #10B981 100%)',
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="divide-y divide-slate-100 pt-1">
                        <div className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <Sparkles className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-slate-900">
                                AI Review Draft Generator
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Short, Detailed and Professional drafts tailored to{' '}
                                {activeBusiness.category}.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-[#059669] whitespace-nowrap">
                            {activeBusiness.enabledFeatures.aiReviewDrafts ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>

                        <div className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <SlidersHorizontal className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-slate-900">
                                Dynamic Feedback Form ({activeBusiness.questions.length} questions)
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Single-select, multi-select, and optional comments.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {canEditQrOrQuestions ? 'Editable' : 'Managed'}
                          </span>
                        </div>

                        <div className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <FileText className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-slate-900">
                                Printable Counter Poster PDF &amp; PNG
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Print-ready QR standee kit with your branding.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                            {activeBusiness.enabledFeatures.pdfPosterExport ? 'Included' : 'Locked'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Business QR Stand */}
                    <div className="lg:col-span-5 rounded-3xl bg-white/90 border border-white shadow-[0_6px_24px_rgba(15,23,42,0.04)] p-6 flex flex-col items-center text-center">
                      <div className="w-full flex items-center justify-between text-xs mb-4">
                        <span className="font-semibold text-slate-900">Business QR Stand</span>
                        <span className="font-mono text-slate-400">
                          Rev {activeBusiness.qrConfig.token}
                        </span>
                      </div>

                      <div
                        className="p-3.5 rounded-2xl border border-slate-200/80 shadow-xs"
                        style={{ backgroundColor: activeBusiness.qrConfig.bgColor }}
                      >
                        <canvas ref={qrCanvasRef} className="w-44 h-44 block" />
                      </div>

                      <p className="mt-3.5 font-mono text-[11px] text-slate-400 break-all px-2">
                        {displayReviewUrl}
                      </p>

                      <div className="mt-4 w-full grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={handleDownloadPng}
                          className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PNG</span>
                        </button>

                        {activeBusiness.enabledFeatures.pdfPosterExport && (
                          <button
                            type="button"
                            disabled={isExportingPdf}
                            onClick={handleDownloadPdf}
                            className="min-h-[38px] px-3 py-2 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{isExportingPdf ? 'Exporting...' : 'Printable PDF'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="min-h-[38px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        {canEditQrOrQuestions && activeBusiness.enabledFeatures.qrStudio !== false && (
                          <button
                            type="button"
                            onClick={() => selectTab('qr_editor')}
                            className="min-h-[38px] px-3 py-2 rounded-xl bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#15803D] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Customize</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ROW 5: Customer Review Flow Activity (2-column grid matching Screenshot 4) */}
                  <div id="portal-activity" className="space-y-4 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="font-display text-lg font-semibold text-slate-900">
                            Customer Review Flow Activity
                          </h2>
                          <span className="text-xs font-semibold text-[#059669] tabular-nums">
                            {periodEvents.length} events · {reportWindowMeta.shortLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Real-time QR scans, generated drafts, and Google review handoffs for{' '}
                          {activeBusiness.name}
                        </p>
                      </div>

                      {canReadEventHistory && periodEvents.length > 0 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                          {(
                            [
                              { id: 'all', label: `All (${periodEvents.length})` },
                              { id: 'scan', label: `Scans (${scanEventCount})` },
                              { id: 'generate', label: `Drafts (${generateEventCount})` },
                              { id: 'copy_redirect', label: `Google (${redirectEventCount})` },
                            ] as { id: EventFilter; label: string }[]
                          ).map((pill) => (
                            <button
                              key={pill.id}
                              type="button"
                              onClick={() => setEventFilter(pill.id)}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                                eventFilter === pill.id
                                  ? 'bg-[#0F172A] text-white'
                                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {pill.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {reviewDrafts.length > 0 && (
                      <div className="px-4 py-3 rounded-2xl bg-white/85 border border-white flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-slate-800">Draft Statuses:</span>
                          <span className="text-slate-600 tabular-nums">
                            Generated:{' '}
                            <strong className="text-slate-900">
                              {reviewDrafts.filter((d) => d.status === 'Generated').length}
                            </strong>
                          </span>
                          <span className="text-slate-600 tabular-nums">
                            Edited:{' '}
                            <strong className="text-slate-900">
                              {reviewDrafts.filter((d) => d.status === 'Edited').length}
                            </strong>
                          </span>
                          <span className="text-slate-600 tabular-nums">
                            Copied:{' '}
                            <strong className="text-emerald-700">
                              {reviewDrafts.filter((d) => d.status === 'Copied').length}
                            </strong>
                          </span>
                          <span className="text-slate-600 tabular-nums">
                            Deleted:{' '}
                            <strong className="text-slate-500">
                              {reviewDrafts.filter((d) => d.status === 'Deleted').length}
                            </strong>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-slate-600 tabular-nums">
                          <span className="font-semibold text-slate-800">Languages:</span>
                          <span>
                            English ({reviewDrafts.filter((d) => d.language === 'en').length})
                          </span>
                          <span lang="hi">
                            हिंदी ({reviewDrafts.filter((d) => d.language === 'hi').length})
                          </span>
                          <span lang="mr">
                            मराठी ({reviewDrafts.filter((d) => d.language === 'mr').length})
                          </span>
                          <span>
                            Hinglish ({reviewDrafts.filter((d) => d.language === 'hinglish').length})
                          </span>
                        </div>
                      </div>
                    )}

                    {eventsAccessError ? (
                      <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-3">
                        <Shield className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold">
                            Customer Review Flow Activity is blocked by Firebase Firestore Rules
                          </p>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            Publish the latest <span className="font-mono">firestore.rules</span>{' '}
                            file in your Firebase Console so client accounts can link{' '}
                            <span className="font-mono">clientUid</span> and read{' '}
                            <span className="font-mono">reviewEvents</span>.
                          </p>
                        </div>
                      </div>
                    ) : !canReadEventHistory ? (
                      <div className="p-5 rounded-2xl bg-white/85 border border-white text-sm text-slate-600 flex items-center gap-3">
                        <Store className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>
                          Linking detailed Customer Review Flow Activity for your client account.
                          Aggregate scan, draft, and Google redirect totals above are already live.
                        </span>
                      </div>
                    ) : visibleEvents.length === 0 ? (
                      <div className="p-8 rounded-2xl bg-white/85 border border-white text-center space-y-2">
                        <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                        <p className="text-sm font-semibold text-slate-900">
                          No matching customer activity in {reportWindowMeta.shortLabel}
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Select another period or scan your QR standee to see live activity cards
                          here.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {visibleEvents.map((ev) => {
                            const actionLabel =
                              ev.eventType === 'copy_redirect'
                                ? 'COPIED & OPENED GOOGLE'
                                : ev.eventType === 'generate'
                                ? 'GENERATED AI DRAFT'
                                : ev.eventType === 'form_start'
                                ? 'STARTED FEEDBACK FORM'
                                : 'QR CODE SCANNED';
                            const actionColor =
                              ev.eventType === 'copy_redirect'
                                ? 'text-[#059669]'
                                : ev.eventType === 'generate'
                                ? 'text-[#2563EB]'
                                : ev.eventType === 'form_start'
                                ? 'text-amber-600'
                                : 'text-[#7C3AED]';

                            return (
                              <div
                                key={ev.id}
                                className="rounded-2xl bg-white/90 border border-white shadow-[0_4px_16px_rgba(15,23,42,0.03)] p-5 flex flex-col justify-between gap-3"
                              >
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`font-mono text-[11px] font-bold uppercase tracking-wide ${actionColor}`}
                                    >
                                      {actionLabel}
                                    </span>
                                    <span className="text-[11px] text-slate-400 tabular-nums">
                                      {formatRelativeTime(ev.createdAt)}
                                    </span>
                                  </div>

                                  <p className="text-[11px] text-slate-500">
                                    {formatEventDateTime(ev.createdAt)}
                                    {(ev.standName || ev.standCode) && (
                                      <span className="ml-2 font-mono text-slate-700">
                                        · Stand: {ev.standName || ev.standCode}
                                      </span>
                                    )}
                                  </p>

                                  {(ev.language || ev.reviewStyle || ev.sentiment) && (
                                    <p className="text-xs text-slate-700">
                                      {ev.language && (
                                        <span lang={ev.language} className="font-semibold">
                                          {ev.language === 'hi'
                                            ? 'हिंदी'
                                            : ev.language === 'mr'
                                            ? 'मराठी'
                                            : ev.language === 'hinglish'
                                            ? 'Hinglish'
                                            : 'English'}
                                          {(ev.reviewStyle || ev.sentiment) && ' · '}
                                        </span>
                                      )}
                                      {ev.reviewStyle && (
                                        <span className="capitalize">
                                          <strong className="font-semibold">Tone:</strong>{' '}
                                          {ev.reviewStyle}
                                          {ev.sentiment && ' · '}
                                        </span>
                                      )}
                                      {ev.sentiment && <span>Sentiment: {ev.sentiment}</span>}
                                    </p>
                                  )}

                                  {Array.isArray(ev.selectedHighlights) &&
                                    ev.selectedHighlights.length > 0 && (
                                      <p className="text-xs text-slate-500 leading-relaxed">
                                        {ev.selectedHighlights.join(' · ')}
                                      </p>
                                    )}
                                </div>

                                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                                  <span className="font-mono text-slate-400">/{ev.slug}</span>
                                  <span className="inline-flex items-center gap-1 text-[#059669] font-semibold">
                                    <Check className="w-3 h-3" />
                                    <span>Recorded</span>
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {matchingStageEvents.length > 8 && (
                          <div className="flex justify-center pt-1">
                            <button
                              type="button"
                              onClick={() => setShowAllActivity((prev) => !prev)}
                              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              {showAllActivity
                                ? 'Show Fewer Events'
                                : `Show All ${matchingStageEvents.length} Events`}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'qr_stands' &&
                activeBusiness.enabledFeatures.inStoreQrStands !== false && (
                  <QrStandsTab
                    business={activeBusiness}
                    userUid={user.uid}
                    userEmail={user.email || ''}
                    isAdmin={isAdmin}
                    events={events}
                    canEdit={canEditQrOrQuestions}
                  />
                )}

              {activeTab === 'gbp_reply' &&
                activeBusiness.enabledFeatures.gbpAutoReply !== false && (
                  <GbpAutoReplyTab
                    business={activeBusiness}
                    userUid={user.uid}
                    userEmail={user.email || ''}
                    isAdmin={isAdmin}
                    canEdit={canEditBranding || isAdmin}
                    allowOAuthConnection={false}
                  />
                )}

              {activeTab === 'weekly_reports' &&
                activeBusiness.enabledFeatures.weeklyReports !== false && (
                  <WeeklyReportsTab
                    business={activeBusiness}
                    userUid={user.uid}
                    userEmail={user.email || ''}
                    isAdmin={isAdmin}
                    events={events}
                    canEdit={canEditBranding || isAdmin}
                  />
                )}

              {activeTab === 'templates' &&
                activeBusiness.enabledFeatures.formTemplates !== false && (
                  <TemplatesTab
                    business={activeBusiness}
                    isAdmin={isAdmin}
                    canEdit={canEditQrOrQuestions}
                    onOpenPreview={() => selectTab('preview')}
                  />
                )}

              {activeTab === 'qr_editor' &&
                canEditQrOrQuestions &&
                activeBusiness.enabledFeatures.qrStudio !== false && (
                  <QrStudioTab business={activeBusiness} isAdmin={isAdmin} />
                )}

              {activeTab === 'questions' &&
                canEditQrOrQuestions &&
                activeBusiness.enabledFeatures.customQuestions && (
                  <QuestionBuilderTab
                    business={activeBusiness}
                    isAdmin={isAdmin}
                    canEdit={canEditQrOrQuestions && activeBusiness.enabledFeatures.customQuestions}
                    onOpenPreview={() => selectTab('preview')}
                  />
                )}

              {activeTab === 'branding' &&
                canEditBranding &&
                activeBusiness.enabledFeatures.brandingSettings !== false && (
                  <BrandingTab
                    business={activeBusiness}
                    isAdmin={isAdmin}
                    onDeleted={() => selectTab('qr_features')}
                  />
                )}

              {activeTab === 'preview' && previewProfile && (
                <div className="rounded-3xl border border-white overflow-hidden bg-white shadow-sm">
                  <CustomerReviewFlow profile={previewProfile} isPreview />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {accountSecurityOpen && onLinkEmailPassword && (
        <AccountSecurityModal
          user={user}
          onClose={() => setAccountSecurityOpen(false)}
          onLinkEmailPassword={onLinkEmailPassword}
        />
      )}
    </div>
  );
}

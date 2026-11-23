import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  ArrowUpRight,
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
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  LogOut,
  Palette,
  PauseCircle,
  Plus,
  QrCode,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingUp,
} from 'lucide-react';
import type { Business, BusinessStats, PublicProfile, ReviewDraft, ReviewEvent, ReviewEventType } from '../types';
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
    if (!activeBusiness || isAdmin) return;
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
  }, [activeBusiness?.id, activeBusiness?.clientAccessLevel, activeTab, isAdmin]);

  const publicBaseUrl = getPublicAppUrl();
  const reviewUrl = activeBusiness
    ? `${publicBaseUrl}/review/${activeBusiness.slug}?v=${activeBusiness.qrConfig.token}`
    : '';

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

  const navItems: { id: PortalTab; label: string; icon: typeof QrCode; visible: boolean }[] = [
    { id: 'qr_features', label: 'Overview & QR', icon: LayoutDashboard, visible: true },
    {
      id: 'qr_stands',
      label: 'QR Stands',
      icon: Layers,
      visible: activeBusiness?.enabledFeatures.inStoreQrStands !== false,
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
    { id: 'templates', label: 'Templates', icon: LayoutGrid, visible: true },
    {
      id: 'qr_editor',
      label: 'QR Studio',
      icon: SlidersHorizontal,
      visible: canEditQrOrQuestions,
    },
    {
      id: 'questions',
      label: 'Question Builder',
      icon: FileText,
      visible: canEditQrOrQuestions && (activeBusiness?.enabledFeatures.customQuestions ?? true),
    },
    { id: 'branding', label: 'Branding & Profile', icon: Palette, visible: canEditBranding },
    { id: 'preview', label: 'Customer Form Preview', icon: Eye, visible: true },
  ];

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

  // Derived Real Analytics Metrics (period-specific when viewing Daily/7D/1M/Date, lifetime for All Time)
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

  // Dynamic Trend Series computed from real reviewEvents (hourly 2h slots for single day, daily buckets for 7d / 1m / all)
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

  const buildSeriesPath = (values: number[]) => {
    if (values.length === 0) return '';
    return values
      .map((v, idx) => {
        const x = 20 + (idx / Math.max(1, values.length - 1)) * 660;
        const y = 200 - (v / maxDailyValue) * 165;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const scanLinePath = buildSeriesPath(chartSeries.map((d) => d.scans));
  const redirectLinePath = buildSeriesPath(chartSeries.map((d) => d.redirects));
  const scanAreaPath = scanLinePath ? `${scanLinePath} L 680,210 L 20,210 Z` : '';
  const redirectAreaPath = redirectLinePath ? `${redirectLinePath} L 680,210 L 20,210 Z` : '';

  // Highlight tags frequency computed from periodEvents
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
    () => (showAllActivity ? matchingStageEvents : matchingStageEvents.slice(0, 9)),
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
      rows.push([bucket.label, bucket.scans, bucket.generated, bucket.redirects].map(escapeCsv).join(','));
    }
    if (periodEvents.length > 0) {
      rows.push('');
      rows.push(['Timestamp', 'Event Type', 'Tone', 'Sentiment', 'Selected Highlights'].map(escapeCsv).join(','));
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

  return (
    <div className="min-h-screen spatial-canvas text-slate-900 flex flex-col antialiased relative">
      {/* Two-Tier Executive Portal Header */}
      <header className="sticky top-0 z-40 liquid-glass-nav border-b border-white/75">
        {/* Top Utility Row */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            {/* Brand Lockup */}
            <button
              type="button"
              onClick={onViewLanding}
              className="flex items-center gap-2.5 text-left cursor-pointer shrink-0 group"
            >
              <div className="w-9 h-9 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm group-hover:bg-[#005c55] transition-colors">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="font-display text-base font-bold text-slate-900 leading-tight">
                  ReviewFlow
                </span>
                <span className="text-[11px] font-semibold text-slate-500 leading-tight">
                  Client Portal
                </span>
              </div>
            </button>

            <div className="h-6 w-px bg-slate-200 hidden sm:block shrink-0" />

            {/* Assigned Business Switcher */}
            {activeBusiness ? (
              <div className="relative min-w-0" ref={switcherRef}>
                {businesses.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setSwitcherOpen((p) => !p)}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-[#f0fdfa] transition-colors text-left cursor-pointer max-w-[230px] sm:max-w-xs"
                  >
                    <BusinessLogo
                      src={activeBusiness.logoDataUrl}
                      name={activeBusiness.name}
                      primaryColor={activeBusiness.branding.primaryColor}
                      sizeClass="w-7 h-7"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                        {activeBusiness.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate leading-tight">
                        {businesses.length} locations assigned
                      </p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl bg-slate-100 max-w-[230px] sm:max-w-xs">
                    <BusinessLogo
                      src={activeBusiness.logoDataUrl}
                      name={activeBusiness.name}
                      primaryColor={activeBusiness.branding.primaryColor}
                      sizeClass="w-7 h-7"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                        {activeBusiness.name}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate leading-tight">
                        {activeBusiness.category}
                      </p>
                    </div>
                  </div>
                )}

                {switcherOpen && businesses.length > 1 && (
                  <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5 space-y-1 z-50">
                    {businesses.map((biz) => (
                      <button
                        key={biz.id}
                        type="button"
                        onClick={() => {
                          onSelectBusiness(biz.id);
                          setSwitcherOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl flex items-center gap-2.5 text-left text-xs transition-colors cursor-pointer ${
                          biz.id === activeBusiness.id
                            ? 'bg-[#f0fdfa] text-[#005c55] font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <BusinessLogo
                          src={biz.logoDataUrl}
                          name={biz.name}
                          primaryColor={biz.branding.primaryColor}
                          sizeClass="w-7 h-7"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{biz.name}</p>
                          <p className="text-[11px] font-normal text-slate-500 truncate">
                            {biz.category}
                          </p>
                        </div>
                        {biz.id === activeBusiness.id && (
                          <Check className="w-3.5 h-3.5 text-[#005c55] shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-500 truncate">
                Pending Assignment
              </span>
            )}
          </div>

          {/* Right Actions & Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {activeBusiness && (
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
                className="px-3.5 py-2 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                <span className="hidden sm:inline">Open Live Review Page</span>
                <span className="sm:hidden">Live Page</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}

            {isAdmin && onSwitchToAdmin ? (
              <button
                type="button"
                onClick={onSwitchToAdmin}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-[#005c55]" />
                <span>Business Management</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onViewLanding}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Home</span>
              </button>
            )}

            <div className="hidden lg:flex items-center gap-2.5 pl-1">
              <div className="w-8 h-8 rounded-full bg-[#005c55] text-white flex items-center justify-center text-xs font-bold">
                {(user.email || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="text-left max-w-[160px]">
                <p className="text-xs font-semibold text-slate-900 truncate leading-tight">
                  {user.displayName || user.email?.split('@')[0] || 'Client'}
                </p>
                <p className="text-[11px] font-medium text-[#005c55] truncate leading-tight">
                  {activeBusiness ? ACCESS_LABELS[accessLevel] : 'Client Account'}
                </p>
              </div>
            </div>

            {onLinkEmailPassword && (
              <button
                type="button"
                onClick={() => setAccountSecurityOpen(true)}
                title={hasPasswordAuth ? 'Manage Sign-In Methods' : 'Set Password for Email Sign-In'}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  hasPasswordAuth
                    ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    : 'border-teal-200 bg-[#f0fdfa] hover:bg-[#ccfbf1]/60 text-[#005c55]'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {hasPasswordAuth ? 'Sign-In' : 'Set Password'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onSignOut}
              title="Sign Out"
              aria-label="Sign Out"
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Horizontal Tab Navigation Bar */}
        {activeBusiness && (
          <div className="border-t border-white/60 bg-white/45 backdrop-blur-md">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 overflow-x-auto">
              <nav className="flex items-center gap-1 min-w-max">
                {navItems
                  .filter((item) => item.visible)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className={`px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'border-[#0f766e] text-[#005c55] bg-[#f0fdfa]/60'
                            : 'border-transparent text-slate-600 hover:text-[#005c55] hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
              </nav>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-8">
        {!activeBusiness ? (
          <div className="liquid-glass spatial-card-3d rounded-2xl p-10 text-center space-y-5 max-w-xl mx-auto mt-8">
            <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-bold text-slate-900">
                {isAdmin ? 'No Business Selected Yet' : 'Client Portal Access Not Assigned'}
              </h1>
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
                  className="px-5 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register Business</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onViewLanding}
                  className="px-5 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
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
              <div className="flex flex-col space-y-6 pb-8">
                {/* Executive Business Header Bar */}
                <div className="liquid-glass spatial-card-3d rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    <BusinessLogo
                      src={activeBusiness.logoDataUrl}
                      name={activeBusiness.name}
                      primaryColor={activeBusiness.branding.primaryColor}
                      sizeClass="w-14 h-14"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight truncate">
                          {activeBusiness.name}
                        </h1>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#005c55] bg-[#f0fdfa] px-2.5 py-1 rounded-full">
                          {activeBusiness.qrConfig.isActive ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>QR Active</span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span className="text-amber-700">QR Paused</span>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{activeBusiness.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>Access: {ACCESS_LABELS[accessLevel]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-xs text-slate-600">
                          Token: {activeBusiness.qrConfig.token}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#005c55]" />
                      <span>Preview Form</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#f0fdfa] text-xs font-semibold text-slate-800 hover:text-[#005c55] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Link Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#005c55]" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                    {activeBusiness.enabledFeatures.pdfPosterExport && (
                      <button
                        type="button"
                        disabled={isExportingPdf}
                        onClick={handleDownloadPdf}
                        className="px-4 py-2 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isExportingPdf ? 'Exporting...' : 'PDF Poster Kit'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {pdfExportError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
                    {pdfExportError}
                  </div>
                )}

                {/* Report Period Selector + 4 KPI Telemetry Scorecards */}
                {activeBusiness.enabledFeatures.analyticsView && (
                  <div className="space-y-4">
                    <div className="liquid-glass rounded-2xl p-3.5 sm:px-5 sm:py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-[#f0fdfa] text-[#005c55] shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {reportWindowMeta.label}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            Filter metrics, trend chart, highlights, and Customer Review Flow Activity
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
                              { id: 'date', label: 'Specific Date' },
                              { id: 'all', label: 'All Time' },
                            ] as { id: ReportPeriod; label: string }[]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setReportPeriod(opt.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                reportPeriod === opt.id
                                  ? 'bg-[#0f766e] text-white shadow-sm'
                                  : 'text-slate-600 hover:text-[#005c55] hover:bg-white/70'
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
                            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20 focus:border-[#0f766e]"
                          />
                        )}

                        <button
                          type="button"
                          onClick={handleExportReportCsv}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#f0fdfa] text-xs font-semibold text-slate-700 hover:text-[#005c55] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export CSV</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Card 1: QR Scans */}
                      <div className="p-5 sm:p-6 rounded-2xl liquid-glass spatial-card-3d flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              QR Scans ({reportWindowMeta.shortLabel})
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                                {scansCount}
                              </span>
                              <span className="text-xs text-slate-500">
                                {reportPeriod === 'all'
                                  ? 'Total visits'
                                  : `All-time: ${stats?.scans ?? 0}`}
                              </span>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#f0fdfa] text-[#005c55]">
                            <QrCode className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="my-3">
                          <svg className="w-full h-9 overflow-visible" viewBox="0 0 160 36" aria-hidden="true">
                            <path
                              d="M0,32 Q25,28 50,22 T105,16 T160,6"
                              fill="none"
                              stroke="#0f766e"
                              strokeLinecap="round"
                              strokeWidth="2.5"
                            />
                            <path
                              d="M0,32 Q25,28 50,22 T105,16 T160,6 L160,36 L0,36 Z"
                              fill="rgba(15,118,110,0.08)"
                            />
                            <circle cx="160" cy="6" fill="#0f766e" r="3" />
                          </svg>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="font-semibold text-[#005c55] tabular-nums">
                            {draftCompletionRate}% started AI draft
                          </span>
                          <span className="text-slate-500 font-mono">Rev {activeBusiness.qrConfig.token}</span>
                        </div>
                      </div>

                      {/* Card 2: AI Drafts Generated */}
                      <div className="p-5 sm:p-6 rounded-2xl liquid-glass spatial-card-3d flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              AI Drafts ({reportWindowMeta.shortLabel})
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                                {generatedCount}
                              </span>
                              <span className="text-xs text-slate-500">
                                {reportPeriod === 'all'
                                  ? 'Personalized drafts'
                                  : `All-time: ${stats?.generated ?? 0}`}
                              </span>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#f0fdfa] text-[#005c55]">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="my-3">
                          <svg className="w-full h-9 overflow-visible" viewBox="0 0 160 36" aria-hidden="true">
                            <path
                              d="M0,30 Q30,26 60,18 T115,14 T160,5"
                              fill="none"
                              stroke="#006b5f"
                              strokeLinecap="round"
                              strokeWidth="2.5"
                            />
                            <path
                              d="M0,30 Q30,26 60,18 T115,14 T160,5 L160,36 L0,36 Z"
                              fill="rgba(0,107,95,0.08)"
                            />
                            <circle cx="160" cy="5" fill="#006b5f" r="3" />
                          </svg>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="font-semibold text-[#005c55]">
                            {activeBusiness.enabledFeatures.aiReviewDrafts ? 'AI Active' : 'Manual Mode'}
                          </span>
                          <span className="text-slate-500 capitalize">
                            Default: {activeBusiness.branding.defaultReviewStyle}
                          </span>
                        </div>
                      </div>

                      {/* Card 3: Review Style Breakdown */}
                      <div className="p-5 sm:p-6 rounded-2xl liquid-glass spatial-card-3d flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Draft Tone Mix
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                                {styleTotal}
                              </span>
                              <span className="text-xs text-slate-500">Style selections</span>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#f0fdfa] text-[#005c55]">
                            <BarChart3 className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="my-3">
                          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex gap-0.5">
                            <div
                              className="h-full bg-[#0f766e] transition-all"
                              style={{ width: `${styleTotal > 0 ? pctShort : 34}%` }}
                              title={`Short: ${pctShort}%`}
                            />
                            <div
                              className="h-full bg-[#006b5f] transition-all"
                              style={{ width: `${styleTotal > 0 ? pctDetailed : 33}%` }}
                              title={`Detailed: ${pctDetailed}%`}
                            />
                            <div
                              className="h-full bg-[#8bd6b6] transition-all"
                              style={{ width: `${styleTotal > 0 ? pctProfessional : 33}%` }}
                              title={`Professional: ${pctProfessional}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 font-mono tabular-nums">
                            <span>Short {pctShort}%</span>
                            <span>Detail {pctDetailed}%</span>
                            <span>Pro {pctProfessional}%</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="font-semibold text-slate-700">3 customer tones</span>
                          <span className="text-[#005c55] font-semibold">Policy safe</span>
                        </div>
                      </div>

                      {/* Card 4: Google Redirects */}
                      <div className="p-5 sm:p-6 rounded-2xl liquid-glass spatial-card-3d flex flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Google Redirects ({reportWindowMeta.shortLabel})
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                                {redirectsCount}
                              </span>
                              <span className="text-xs text-slate-500">
                                {reportPeriod === 'all'
                                  ? 'Copied & opened'
                                  : `All-time: ${stats?.redirects ?? 0}`}
                              </span>
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#f0fdfa] text-[#005c55]">
                            <TrendingUp className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="my-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#f0fdfa] text-[#005c55] flex items-center justify-center font-bold text-xs tabular-nums shrink-0">
                            {conversionRate}%
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">Scan-to-Google Rate</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              Equal access · No star gating
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span className="inline-flex items-center gap-1 font-semibold text-[#005c55]">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Google Compliant</span>
                          </span>
                          <span className="text-slate-500 tabular-nums">
                            {activeBusiness.questions.length} prompts
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Central Two-Column Analytics & QR Workspace */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Major Column (7 cols) */}
                  <div className="lg:col-span-7 flex flex-col space-y-6">
                    {/* Period Activity Velocity Chart */}
                    {activeBusiness.enabledFeatures.analyticsView && (
                      <div className="p-5 sm:p-6 rounded-2xl liquid-glass spatial-card-3d flex flex-col">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4">
                          <div>
                            <h2 className="font-display text-lg font-bold text-slate-900">
                              {reportPeriod === 'daily'
                                ? 'Hourly Scan & Google Redirect Report (Today)'
                                : reportPeriod === 'date'
                                  ? `Hourly Scan & Google Redirect Report (${formatDateLabel(selectedDate)})`
                                  : reportPeriod === '7d'
                                    ? '7-Day Scan & Google Redirect Report'
                                    : reportPeriod === '1m'
                                      ? '1-Month (30-Day) Scan & Google Redirect Report'
                                      : '30-Day Scan & Google Redirect Trend'}
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Live scan volume compared with Google Review copy &amp; handoff events
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-semibold">
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              <span className="w-2.5 h-2.5 rounded-sm bg-[#4fdbc8]" />
                              Scans
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              <span className="w-2.5 h-2.5 rounded-sm bg-[#0f766e]" />
                              Google Redirects
                            </span>
                          </div>
                        </div>

                        {canReadEventHistory && periodEvents.length > 0 ? (
                          <>
                            <div className="relative w-full h-56 mt-2">
                              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-40">
                                <div className="w-full border-b border-slate-200" />
                                <div className="w-full border-b border-slate-200" />
                                <div className="w-full border-b border-slate-200" />
                                <div className="w-full border-b border-slate-200" />
                              </div>

                              <svg
                                className="w-full h-full"
                                preserveAspectRatio="none"
                                viewBox="0 0 700 220"
                                aria-label="Customer scan and redirect report chart"
                              >
                                <defs>
                                  <linearGradient id="portalScanGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                                    <stop offset="0%" stopColor="#4fdbc8" stopOpacity="0.32" />
                                    <stop offset="100%" stopColor="#4fdbc8" stopOpacity="0" />
                                  </linearGradient>
                                  <linearGradient id="portalRedirGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                                    <stop offset="0%" stopColor="#0f766e" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path d={scanAreaPath} fill="url(#portalScanGrad)" />
                                <path
                                  d={scanLinePath}
                                  fill="none"
                                  stroke="#4fdbc8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="3"
                                />
                                <path d={redirectAreaPath} fill="url(#portalRedirGrad)" />
                                <path
                                  d={redirectLinePath}
                                  fill="none"
                                  stroke="#0f766e"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="3"
                                />
                              </svg>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-3 font-mono tabular-nums">
                              {chartAxisLabels.map((lbl, idx) => (
                                <span key={`${lbl}-${idx}`}>{lbl}</span>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-8 text-center my-2">
                            <BarChart3 className="w-8 h-8 text-slate-400 mx-auto mb-2.5" />
                            <p className="text-sm font-semibold text-slate-800">
                              {canReadEventHistory
                                ? `No scan events found for ${reportWindowMeta.shortLabel}`
                                : 'Linking your client report view'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                              {canReadEventHistory
                                ? 'Switch to 7 Days, 1 Month, or All Time—or scan your QR code—to populate hourly and daily trend curves.'
                                : 'Aggregate totals above update live while detailed event access connects for your account.'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Top Customer Highlights OR Active Form Questions & Keywords */}
                    <div className="p-5 sm:p-6 rounded-2xl liquid-glass spatial-card-3d space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="font-display text-lg font-bold text-slate-900">
                            {topHighlights.length > 0
                              ? `Top Customer-Selected Highlights (${reportWindowMeta.shortLabel})`
                              : 'Active Business Features & Form Summary'}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {topHighlights.length > 0
                              ? `Most frequently tapped tags across ${periodEvents.length} recorded customer sessions`
                              : `Capabilities and feedback questions configured for ${activeBusiness.name}`}
                          </p>
                        </div>
                        {canEditQrOrQuestions && activeBusiness.enabledFeatures.customQuestions && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('questions')}
                            className="text-xs font-semibold text-[#005c55] hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <span>Edit Form</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {topHighlights.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {topHighlights.map(([label, count]) => {
                            const maxCount = topHighlights[0][1] || 1;
                            const pct = Math.max(12, Math.round((count / maxCount) * 100));
                            return (
                              <div
                                key={label}
                                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-bold text-slate-900 truncate">{label}</span>
                                  <span className="font-mono font-bold text-[#005c55] tabular-nums shrink-0">
                                    {count}x
                                  </span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-white overflow-hidden">
                                  <div
                                    className="h-full bg-[#0f766e] rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="divide-y divide-slate-100">
                        <div className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <Sparkles className="w-4 h-4 text-[#005c55] mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                AI Review Draft Generator
                              </p>
                              <p className="text-xs text-slate-500">
                                Generates Short, Detailed, and Professional drafts tailored to{' '}
                                {activeBusiness.category}.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-[#005c55] whitespace-nowrap">
                            {activeBusiness.enabledFeatures.aiReviewDrafts ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>

                        <div className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <SlidersHorizontal className="w-4 h-4 text-[#005c55] mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Dynamic Feedback Form ({activeBusiness.questions.length} questions)
                              </p>
                              <p className="text-xs text-slate-500">
                                Single-select, multi-select, and optional customer comments.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                            {canEditQrOrQuestions ? 'Editable' : 'Managed'}
                          </span>
                        </div>

                        <div className="py-3 flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <FileText className="w-4 h-4 text-[#005c55] mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                Printable Counter Poster PDF &amp; PNG
                              </p>
                              <p className="text-xs text-slate-500">
                                Print-ready QR standee kit with your business logo and branding.
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                            {activeBusiness.enabledFeatures.pdfPosterExport ? 'Included' : 'Locked'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Minor Column (5 cols): QR Stand & Destination */}
                  <div className="lg:col-span-5 flex flex-col space-y-6">
                    {/* Your Business QR Stand Card */}
                    <div className="p-6 rounded-2xl liquid-glass spatial-card-3d flex flex-col items-center text-center">
                      <div className="w-full flex items-center justify-between text-xs mb-4">
                        <span className="font-bold text-slate-900 inline-flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 text-[#005c55]" />
                          <span>Business QR Stand</span>
                        </span>
                        <span className="font-mono text-slate-500">
                          Rev {activeBusiness.qrConfig.token}
                        </span>
                      </div>

                      <div
                        className="p-4 rounded-2xl border border-slate-200 shadow-inner"
                        style={{ backgroundColor: activeBusiness.qrConfig.bgColor }}
                      >
                        <canvas ref={qrCanvasRef} className="w-52 h-52 block" />
                      </div>

                      <p className="mt-4 font-mono text-[11px] text-slate-500 break-all px-2">
                        {reviewUrl}
                      </p>

                      <div className="mt-5 w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={handleDownloadPng}
                          className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download PNG</span>
                        </button>

                        {activeBusiness.enabledFeatures.pdfPosterExport && (
                          <button
                            type="button"
                            disabled={isExportingPdf}
                            onClick={handleDownloadPdf}
                            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{isExportingPdf ? 'Exporting...' : 'Printable PDF'}</span>
                          </button>
                        )}
                      </div>

                      <div className="mt-2.5 w-full flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-[#005c55] hover:bg-[#f0fdfa] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied Link</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Customer Link</span>
                            </>
                          )}
                        </button>
                        {canEditQrOrQuestions && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('qr_editor')}
                            className="flex-1 min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold text-[#005c55] bg-[#f0fdfa] hover:bg-[#ccfbf1]/60 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Customize QR</span>
                          </button>
                        )}
                      </div>

                      {(publicBaseUrl.includes('localhost') ||
                        publicBaseUrl.includes('127.0.0.1')) && (
                        <p className="mt-4 text-[11px] text-slate-600 leading-relaxed text-left bg-slate-50 border border-slate-200 rounded-xl p-3">
                          Local environment detected. Deploy to your live domain or set{' '}
                          <span className="font-mono">VITE_PUBLIC_APP_URL</span> so printed QR codes
                          resolve on customer phones.
                        </p>
                      )}
                    </div>

                    {/* Connected Google Review Destination & SEO Keywords */}
                    <div className="p-6 rounded-2xl liquid-glass spatial-card-3d space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-display text-base font-bold text-slate-900">
                          Google Review Destination
                        </h3>
                        {canEditBranding && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('branding')}
                            className="text-xs font-semibold text-[#005c55] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Edit Branding
                          </button>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2">
                        <p className="font-mono text-xs text-slate-700 truncate">
                          {sanitizeExternalUrl(activeBusiness.googleReviewUrl, 'https://www.google.com/maps')}
                        </p>
                        <a
                          href={sanitizeExternalUrl(activeBusiness.googleReviewUrl, 'https://www.google.com/maps')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[#005c55] hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Test</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {activeBusiness.seoKeywords && activeBusiness.seoKeywords.length > 0 && (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-xs font-semibold text-slate-500 mb-2">
                            AI Google Search Keywords
                          </p>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {activeBusiness.seoKeywords.join(' · ')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Customer Interaction Stream */}
                <div className="flex flex-col space-y-4 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="font-display text-xl font-bold text-slate-900">
                          Customer Review Flow Activity
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full bg-[#f0fdfa] text-[#005c55] text-xs font-bold tabular-nums">
                          {periodEvents.length} Events ({reportWindowMeta.shortLabel})
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Real-time QR scans, generated drafts, and Google review handoffs for{' '}
                        {activeBusiness.name} ({reportWindowMeta.label})
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
                                ? 'bg-[#0f766e] text-white shadow-sm'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-[#f0fdfa] hover:text-[#005c55]'
                            }`}
                          >
                            {pill.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {reviewDrafts.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-white/80 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-slate-800">Draft Statuses:</span>
                        <span className="text-slate-600 tabular-nums">
                          Generated: <strong className="text-slate-900">{reviewDrafts.filter((d) => d.status === 'Generated').length}</strong>
                        </span>
                        <span className="text-slate-600 tabular-nums">
                          Edited: <strong className="text-slate-900">{reviewDrafts.filter((d) => d.status === 'Edited').length}</strong>
                        </span>
                        <span className="text-slate-600 tabular-nums">
                          Copied: <strong className="text-emerald-700">{reviewDrafts.filter((d) => d.status === 'Copied').length}</strong>
                        </span>
                        <span className="text-slate-600 tabular-nums">
                          Deleted: <strong className="text-slate-500">{reviewDrafts.filter((d) => d.status === 'Deleted').length}</strong>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 text-slate-600 tabular-nums">
                        <span className="font-semibold text-slate-800">Languages:</span>
                        <span>English ({reviewDrafts.filter((d) => d.language === 'en').length})</span>
                        <span lang="hi">हिंदी ({reviewDrafts.filter((d) => d.language === 'hi').length})</span>
                        <span lang="mr">मराठी ({reviewDrafts.filter((d) => d.language === 'mr').length})</span>
                        <span>Hinglish ({reviewDrafts.filter((d) => d.language === 'hinglish').length})</span>
                      </div>
                    </div>
                  )}

                  {eventsAccessError ? (
                    <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-3 shadow-sm">
                      <Shield className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold">
                          Customer Review Flow Activity is blocked by Firebase Firestore Rules
                        </p>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          Publish the latest <span className="font-mono">firestore.rules</span> file in your
                          Firebase Console (Firestore Database → Rules) so client accounts can link{' '}
                          <span className="font-mono">clientUid</span> and read{' '}
                          <span className="font-mono">reviewEvents</span>. Aggregate scan totals above remain live.
                        </p>
                      </div>
                    </div>
                  ) : !canReadEventHistory ? (
                    <div className="p-6 rounded-2xl liquid-glass text-sm text-slate-600 flex items-center gap-3">
                      <Store className="w-5 h-5 text-[#005c55] shrink-0" />
                      <span>
                        Linking detailed Customer Review Flow Activity for your client account.
                        Aggregate scan, draft, and Google redirect totals above are already live.
                      </span>
                    </div>
                  ) : visibleEvents.length === 0 ? (
                    <div className="p-8 rounded-2xl liquid-glass text-center space-y-2">
                      <Clock className="w-7 h-7 text-slate-400 mx-auto" />
                      <p className="text-sm font-semibold text-slate-900">
                        No matching customer activity in {reportWindowMeta.shortLabel}
                      </p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        {events.length === 0 && (stats?.scans ?? 0) > 0 && !isAdmin && activeBusiness.ownerId !== user.uid
                          ? 'Older scans recorded before client UID linking are already included in your lifetime totals. New QR scans and AI drafts will appear here in real time.'
                          : 'Select another report window (Daily, 7 Days, 1 Month, Specific Date, or All Time) or scan your QR standee to see live activity cards here.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {visibleEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className="p-5 rounded-2xl liquid-glass spatial-card-3d flex flex-col justify-between space-y-3"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[#005c55] uppercase tracking-wide">
                                  {ev.eventType === 'copy_redirect'
                                    ? 'Copied & Opened Google'
                                    : ev.eventType === 'generate'
                                      ? 'Generated AI Draft'
                                      : ev.eventType === 'form_start'
                                        ? 'Started Feedback Form'
                                        : 'QR Code Scanned'}
                                </span>
                                <span className="text-xs text-slate-400 tabular-nums">
                                  {formatRelativeTime(ev.createdAt)}
                                </span>
                              </div>

                              <p className="text-[11px] font-medium text-slate-500">
                                {formatEventDateTime(ev.createdAt)}
                                {(ev.standName || ev.standCode) && (
                                  <span className="ml-2 font-mono text-[#005c55]">
                                    · Stand: {ev.standName || ev.standCode}
                                  </span>
                                )}
                              </p>

                              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {ev.language && (
                                  <span lang={ev.language} className="font-semibold text-slate-800">
                                    Language: {ev.language === 'hi' ? 'हिंदी' : ev.language === 'mr' ? 'मराठी' : ev.language === 'hinglish' ? 'Hinglish' : 'English'}
                                  </span>
                                )}
                                {ev.reviewStyle && (
                                  <>
                                    {ev.language && <span aria-hidden="true">·</span>}
                                    <span className="capitalize font-semibold text-slate-800">
                                      Tone: {ev.reviewStyle}
                                    </span>
                                  </>
                                )}
                                {ev.sentiment && (
                                  <>
                                    {(ev.language || ev.reviewStyle) && <span aria-hidden="true">·</span>}
                                    <span>Sentiment: {ev.sentiment}</span>
                                  </>
                                )}
                              </div>

                              {Array.isArray(ev.selectedHighlights) &&
                                ev.selectedHighlights.length > 0 && (
                                  <p className="text-xs text-slate-600 leading-relaxed">
                                    {ev.selectedHighlights.join(' · ')}
                                  </p>
                                )}
                            </div>

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                              <span className="font-mono">/{ev.slug}</span>
                              <span className="inline-flex items-center gap-1 text-[#005c55] font-semibold">
                                <Check className="w-3 h-3" />
                                Recorded
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {matchingStageEvents.length > 9 && (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAllActivity((prev) => !prev)}
                            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#f0fdfa] text-xs font-semibold text-slate-700 hover:text-[#005c55] cursor-pointer transition-colors"
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

            {activeTab === 'templates' && (
              <TemplatesTab
                business={activeBusiness}
                isAdmin={isAdmin}
                canEdit={canEditQrOrQuestions}
                onOpenPreview={() => setActiveTab('preview')}
              />
            )}

            {activeTab === 'qr_editor' && canEditQrOrQuestions && (
              <QrStudioTab business={activeBusiness} isAdmin={isAdmin} />
            )}

            {activeTab === 'questions' &&
              canEditQrOrQuestions &&
              activeBusiness.enabledFeatures.customQuestions && (
                <QuestionBuilderTab
                  business={activeBusiness}
                  isAdmin={isAdmin}
                  onOpenPreview={() => setActiveTab('preview')}
                />
              )}

            {activeTab === 'branding' && canEditBranding && (
              <BrandingTab
                business={activeBusiness}
                isAdmin={isAdmin}
                onDeleted={() => setActiveTab('qr_features')}
              />
            )}

            {activeTab === 'preview' && previewProfile && (
              <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shadow-sm">
                <CustomerReviewFlow profile={previewProfile} isPreview />
              </div>
            )}
          </>
        )}
      </main>

      {/* Quiet Workspace Footer */}
      <footer className="w-full liquid-glass-nav border-t border-white/75 py-4 mt-auto">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>ReviewFlow Client Portal · Multi-Business Google Review Workflow</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('qr_features')}
              className="hover:text-[#005c55] transition-colors cursor-pointer"
            >
              Overview
            </button>
            {activeBusiness && (
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className="hover:text-[#005c55] transition-colors cursor-pointer"
              >
                Preview Form
              </button>
            )}
            <button
              type="button"
              onClick={onViewLanding}
              className="hover:text-[#005c55] transition-colors cursor-pointer"
            >
              Landing Page
            </button>
          </div>
        </div>
      </footer>
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

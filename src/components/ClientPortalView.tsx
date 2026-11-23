import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  Calendar,
  Check,
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
  LogOut,
  Menu,
  Moon,
  Palette,
  PauseCircle,
  Plus,
  QrCode,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  X,
} from 'lucide-react';
import type {
  Business,
  BusinessStats,
  PublicProfile,
  ReviewDraft,
  ReviewEvent,
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
import { getFormTemplateById } from '../data/formTemplates';
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
  | 'analytics'
  | 'qr_stands'
  | 'gbp_reply'
  | 'weekly_reports'
  | 'templates'
  | 'qr_editor'
  | 'questions'
  | 'branding'
  | 'preview';
type ReportPeriod = 'daily' | '7d' | '1m' | 'date' | 'all';
type PortalTheme = 'dark' | 'light';

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
  const [theme, setTheme] = useState<PortalTheme>(() => {
    try {
      const saved = localStorage.getItem('reviewflow_portal_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [activeTab, setActiveTab] = useState<PortalTab>('qr_features');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredBucketIdx, setHoveredBucketIdx] = useState<number | null>(null);
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDraft[]>([]);
  const [eventsAccessError, setEventsAccessError] = useState<string | null>(null);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('7d');
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateStr(new Date()));
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportError, setPdfExportError] = useState<string | null>(null);
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const claimedAttemptRef = useRef<Set<string>>(new Set());
  const claimingInFlightRef = useRef<Set<string>>(new Set());
  const hasPasswordAuth = hasPasswordProvider(user.providerData);

  const isDark = theme === 'dark';

  const handleThemeChange = (next: PortalTheme) => {
    setTheme(next);
    try {
      localStorage.setItem('reviewflow_portal_theme', next);
    } catch {
      // ignore storage failures
    }
  };

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
      (activeTab === 'analytics' && !f.analyticsView) ||
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
      'analytics',
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
      size: 200,
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

  // Stacked 7-column activity chart buckets (used on Overview segmented block chart)
  const chartSeries = useMemo(() => {
    const numDays = 7;
    const days: { label: string; key: string; scans: number; generated: number; redirects: number }[] = [];
    const now = new Date();
    for (let i = numDays - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = toLocalDateStr(d);
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      days.push({ label, key, scans: 0, generated: 0, redirects: 0 });
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));
    for (const ev of events) {
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
  }, [events]);

  const maxStackedTotal = useMemo(() => {
    let m = 1;
    for (const d of chartSeries) {
      m = Math.max(m, d.scans + d.generated + d.redirects);
    }
    return m;
  }, [chartSeries]);

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

  const filteredPeriodEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return periodEvents;
    return periodEvents.filter((ev) => {
      const hay = [
        ev.eventType,
        ev.reviewStyle,
        ev.sentiment,
        ev.language,
        ev.standName,
        ev.standCode,
        ...(ev.selectedHighlights || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [periodEvents, searchQuery]);

  const funnelColumns = useMemo(
    () => [
      {
        id: 'scan' as const,
        title: 'QR Scanned',
        badgeClass: isDark ? 'bg-[#818CF8]/20 text-[#A5B4FC]' : 'bg-indigo-50 text-indigo-700',
        items: filteredPeriodEvents.filter((e) => e.eventType === 'scan').slice(0, 6),
        total: filteredPeriodEvents.filter((e) => e.eventType === 'scan').length,
      },
      {
        id: 'form_start' as const,
        title: 'Form Started',
        badgeClass: isDark ? 'bg-[#FBBF24]/20 text-[#FDE68A]' : 'bg-amber-50 text-amber-700',
        items: filteredPeriodEvents.filter((e) => e.eventType === 'form_start').slice(0, 6),
        total: filteredPeriodEvents.filter((e) => e.eventType === 'form_start').length,
      },
      {
        id: 'generate' as const,
        title: 'AI Drafted',
        badgeClass: isDark ? 'bg-[#F472B6]/20 text-[#F9A8D4]' : 'bg-pink-50 text-pink-700',
        items: filteredPeriodEvents.filter((e) => e.eventType === 'generate').slice(0, 6),
        total: filteredPeriodEvents.filter((e) => e.eventType === 'generate').length,
      },
      {
        id: 'copy_redirect' as const,
        title: 'Google Redirect',
        badgeClass: isDark ? 'bg-[#34D399]/20 text-[#6EE7B7]' : 'bg-emerald-50 text-emerald-700',
        items: filteredPeriodEvents.filter((e) => e.eventType === 'copy_redirect').slice(0, 6),
        total: filteredPeriodEvents.filter((e) => e.eventType === 'copy_redirect').length,
      },
    ],
    [filteredPeriodEvents, isDark],
  );

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
    rows.push(['Timestamp', 'Event Type', 'Tone', 'Language', 'Stand', 'Selected Highlights'].map(escapeCsv).join(','));
    for (const ev of periodEvents) {
      rows.push(
        [
          formatEventDateTime(ev.createdAt),
          ev.eventType,
          ev.reviewStyle || '',
          ev.language || '',
          ev.standName || ev.standCode || '',
          (ev.selectedHighlights || []).join(' | '),
        ]
          .map(escapeCsv)
          .join(','),
      );
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

  const primarySidebarLinks: {
    id: PortalTab;
    label: string;
    icon: typeof LayoutDashboard;
    visible: boolean;
  }[] = [
    { id: 'qr_features', label: 'Overview', icon: LayoutDashboard, visible: true },
    {
      id: 'analytics',
      label: 'Analytics & Activity',
      icon: BarChart3,
      visible: activeBusiness?.enabledFeatures.analyticsView !== false,
    },
    {
      id: 'qr_stands',
      label: 'QR Stands',
      icon: Layers,
      visible: activeBusiness?.enabledFeatures.inStoreQrStands !== false,
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: LayoutGrid,
      visible: activeBusiness?.enabledFeatures.formTemplates !== false,
    },
  ];

  const toolSidebarLinks: {
    id: PortalTab;
    label: string;
    icon: typeof QrCode;
    visible: boolean;
  }[] = [
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
    {
      id: 'branding',
      label: 'Branding & Profile',
      icon: Palette,
      visible: canEditBranding && activeBusiness?.enabledFeatures.brandingSettings !== false,
    },
    {
      id: 'preview',
      label: 'Form Preview',
      icon: Eye,
      visible: true,
    },
  ];

  const sanitizeGoogleDest = activeBusiness
    ? sanitizeExternalUrl(activeBusiness.googleReviewUrl, 'https://www.google.com/maps')
    : 'https://www.google.com/maps';
  const activeTemplateDef = getFormTemplateById(activeBusiness?.formTemplate);

  // Theme-aware styling helpers
  const borderHairline = isDark ? 'border-white/[0.07]' : 'border-slate-200/85';
  const surfaceCard = isDark
    ? 'bg-[#181820] border border-white/[0.08]'
    : 'bg-white border border-slate-200/85 shadow-[0_1px_3px_rgba(15,23,42,0.04)]';
  const surfaceMuted = isDark ? 'text-[#8E8EA0]' : 'text-slate-500';
  const textPrimary = isDark ? 'text-[#F4F4F7]' : 'text-slate-900';
  const navActiveClass = isDark
    ? 'bg-[#252532] text-white font-semibold'
    : 'bg-slate-900 text-white font-semibold';
  const navIdleClass = isDark
    ? 'text-[#9B9BAE] hover:text-white hover:bg-white/[0.04]'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';

  const sidebarBody = (
    <div className="flex flex-col h-full justify-between gap-5">
      <div className="space-y-5">
        {/* Top Wordmark */}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={onViewLanding}
            className="flex items-center gap-2.5 cursor-pointer text-left"
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isDark ? 'bg-white text-[#101015]' : 'bg-slate-900 text-white'
              }`}
            >
              <QrCode className="w-4 h-4" />
            </div>
            <span className={`font-display text-base font-bold tracking-tight ${textPrimary}`}>
              ReviewFlow
            </span>
          </button>
        </div>

        {/* Active Business Switcher */}
        {activeBusiness && (
          <div className="relative" ref={switcherRef}>
            <button
              type="button"
              onClick={() => businesses.length > 1 && setSwitcherOpen((p) => !p)}
              className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl border transition-colors text-left ${
                businesses.length > 1 ? 'cursor-pointer' : 'cursor-default'
              } ${
                isDark
                  ? 'bg-[#16161E] border-white/[0.07] hover:border-white/15'
                  : 'bg-slate-50 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <BusinessLogo
                  src={activeBusiness.logoDataUrl}
                  name={activeBusiness.name}
                  primaryColor={activeBusiness.branding.primaryColor}
                  sizeClass="w-7 h-7 rounded-lg"
                />
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${textPrimary}`}>
                    {activeBusiness.name}
                  </p>
                  <p className={`text-[10px] truncate ${surfaceMuted}`}>
                    {activeBusiness.category}
                  </p>
                </div>
              </div>
              {businesses.length > 1 && (
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${surfaceMuted}`} />
              )}
            </button>

            {switcherOpen && businesses.length > 1 && (
              <div
                className={`absolute left-0 right-0 mt-1.5 rounded-xl border p-1.5 space-y-1 z-50 shadow-xl ${
                  isDark ? 'bg-[#1E1E28] border-white/10' : 'bg-white border-slate-200'
                }`}
              >
                {businesses.map((biz) => (
                  <button
                    key={biz.id}
                    type="button"
                    onClick={() => {
                      onSelectBusiness(biz.id);
                      setSwitcherOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-2 text-left text-xs transition-colors cursor-pointer ${
                      biz.id === activeBusiness.id
                        ? navActiveClass
                        : navIdleClass
                    }`}
                  >
                    <BusinessLogo
                      src={biz.logoDataUrl}
                      name={biz.name}
                      primaryColor={biz.branding.primaryColor}
                      sizeClass="w-6 h-6"
                    />
                    <span className="truncate flex-1">{biz.name}</span>
                    {biz.id === activeBusiness.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Primary Pages */}
        {activeBusiness && (
          <nav className="space-y-1">
            {primarySidebarLinks
              .filter((i) => i.visible)
              .map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                      active ? navActiveClass : navIdleClass
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
          </nav>
        )}

        {/* Workspace Feature Pages */}
        {activeBusiness && (
          <div className={`pt-4 border-t ${borderHairline} space-y-1`}>
            <p className={`px-3 text-[11px] font-medium mb-1.5 ${surfaceMuted}`}>
              Workspace Tools
            </p>
            {toolSidebarLinks
              .filter((i) => i.visible)
              .map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer ${
                      active ? navActiveClass : navIdleClass
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Bottom User & Account Footer */}
      <div className={`pt-4 border-t ${borderHairline} space-y-2.5`}>
        <div className="flex items-center gap-2.5 px-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              isDark ? 'bg-[#818CF8]/25 text-[#C7D2FE]' : 'bg-slate-900 text-white'
            }`}
          >
            {(user.email || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-semibold truncate ${textPrimary}`}>
              {user.displayName || user.email?.split('@')[0] || 'Client'}
            </p>
            <p className={`text-[10px] truncate ${surfaceMuted}`}>
              {activeBusiness ? ACCESS_LABELS[accessLevel] : 'Client Account'}
            </p>
          </div>
        </div>

        <div className="space-y-0.5">
          {onLinkEmailPassword && (
            <button
              type="button"
              onClick={() => {
                setMobileSidebarOpen(false);
                setAccountSecurityOpen(true);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${navIdleClass}`}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>{hasPasswordAuth ? 'Account & Sign-In' : 'Set Email Password'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onViewLanding}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${navIdleClass}`}
          >
            <Home className="w-3.5 h-3.5 shrink-0" />
            <span>Landing Page</span>
          </button>

          {isAdmin && onSwitchToAdmin && (
            <button
              type="button"
              onClick={onSwitchToAdmin}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${navIdleClass}`}
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>Business Management</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign Out"
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer ${navIdleClass}`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`min-h-screen flex transition-colors duration-200 ${
        isDark ? 'portal-dark' : 'portal-light'
      }`}
    >
      {/* Desktop Left Sidebar */}
      <aside
        className={`hidden lg:flex flex-col w-[240px] shrink-0 border-r ${borderHairline} p-4 sticky top-0 h-screen overflow-y-auto`}
      >
        {sidebarBody}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div
            className={`relative z-10 w-72 max-w-[85vw] h-full p-5 overflow-y-auto border-r ${borderHairline} ${
              isDark ? 'bg-[#14141B]' : 'bg-white'
            }`}
          >
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className={`p-1.5 rounded-lg cursor-pointer ${navIdleClass}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarBody}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Search & Controls Header */}
        <header
          className={`sticky top-0 z-30 border-b ${borderHairline} px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 ${
            isDark ? 'bg-[#101015]/90 backdrop-blur-md' : 'bg-[#F4F5F9]/90 backdrop-blur-md'
          }`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0 max-w-md">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileSidebarOpen(true)}
              className={`lg:hidden p-2 rounded-xl border ${borderHairline} cursor-pointer ${
                isDark ? 'bg-[#181820] text-white' : 'bg-white text-slate-800'
              }`}
            >
              <Menu className="w-4 h-4" />
            </button>

            <div className="relative flex-1 min-w-0">
              <Search
                className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${surfaceMuted}`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim() && activeTab === 'qr_features') {
                    setActiveTab('analytics');
                  }
                }}
                placeholder="Search customer activity, stands, or tone..."
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs sm:text-sm focus:outline-none border transition-colors ${
                  isDark
                    ? 'bg-[#181820] border-white/[0.08] text-white placeholder:text-[#737388] focus:border-white/25'
                    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {activeBusiness && (
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  activeBusiness.qrConfig.isActive
                    ? isDark
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : isDark
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeBusiness.qrConfig.isActive ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>{activeBusiness.qrConfig.isActive ? 'QR Active' : 'QR Paused'}</span>
              </span>
            )}

            {/* Dark / Light Mode Segmented Toggle */}
            <div
              role="group"
              aria-label="Theme mode"
              className={`inline-flex items-center p-0.5 rounded-xl border ${borderHairline} ${
                isDark ? 'bg-[#181820]' : 'bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                title="Dark mode"
                aria-label="Dark mode"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#272734] text-white'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                title="Light mode"
                aria-label="Light mode"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  !isDark
                    ? 'bg-slate-900 text-white'
                    : 'text-[#8E8EA0] hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
            </div>

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
                className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  isDark
                    ? 'bg-white text-[#101015] hover:bg-slate-100'
                    : 'bg-[#101015] text-white hover:bg-slate-800'
                }`}
              >
                <span className="hidden sm:inline">Open Live Review Page</span>
                <span className="sm:hidden">Live Page</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
          </div>
        </header>

        {/* Page Stage */}
        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {!activeBusiness ? (
            <div className={`${surfaceCard} rounded-2xl p-10 text-center space-y-5 max-w-xl mx-auto mt-8`}>
              <QrCode className={`w-10 h-10 mx-auto ${surfaceMuted}`} />
              <div className="space-y-2">
                <h1 className={`font-display text-2xl font-bold ${textPrimary}`}>
                  {isAdmin ? 'No Business Selected Yet' : 'Client Portal Access Not Assigned'}
                </h1>
                <p className={`text-sm leading-relaxed ${surfaceMuted}`}>
                  {isAdmin ? (
                    <>
                      Signed in as <span className={`font-mono ${textPrimary}`}>{user.email}</span>.
                      Create a new business profile or switch back to Business Management.
                    </>
                  ) : (
                    <>
                      You are signed in as{' '}
                      <span className={`font-mono ${textPrimary}`}>{user.email}</span>, which is not
                      assigned to any business yet. Ask your business manager to grant access.
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={onOpenNewBusiness}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 cursor-pointer ${
                      isDark ? 'bg-white text-[#101015]' : 'bg-slate-900 text-white'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register Business</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onViewLanding}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 cursor-pointer ${
                      isDark ? 'bg-white text-[#101015]' : 'bg-slate-900 text-white'
                    }`}
                  >
                    <Home className="w-4 h-4" />
                    <span>Go to Landing Page</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ==========================================
                  PAGE 1: OVERVIEW (CONCISE, CLEAN EXECUTIVE HUB)
                 ========================================== */}
              {activeTab === 'qr_features' && (
                <div className="space-y-6">
                  {pdfExportError && (
                    <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-medium">
                      {pdfExportError}
                    </div>
                  )}

                  {/* Top Row: Segmented Stacked Activity Chart + 2 Summary Metric Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left 8 cols: Segmented Block Chart (FlowDesk style, real ReviewFlow data) */}
                    <div className={`lg:col-span-8 ${surfaceCard} rounded-2xl p-6 flex flex-col justify-between`}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                        <div>
                          <h1 className={`font-display text-lg font-semibold ${textPrimary}`}>
                            Scan &amp; Review Flow
                          </h1>
                          <p className={`text-xs mt-0.5 ${surfaceMuted}`}>
                            7-day QR scans, AI drafts, and Google redirects
                          </p>
                        </div>

                        <div className="flex items-center gap-4 text-[11px]">
                          <span className={`inline-flex items-center gap-1.5 ${surfaceMuted}`}>
                            <span className="w-2.5 h-2.5 rounded-xs bg-[#818CF8]" />
                            <span>Scans</span>
                          </span>
                          <span className={`inline-flex items-center gap-1.5 ${surfaceMuted}`}>
                            <span className="w-2.5 h-2.5 rounded-xs bg-[#F472B6]" />
                            <span>Drafts</span>
                          </span>
                          <span className={`inline-flex items-center gap-1.5 ${surfaceMuted}`}>
                            <span className="w-2.5 h-2.5 rounded-xs bg-[#FBBF24]" />
                            <span>Google</span>
                          </span>
                        </div>
                      </div>

                      {/* Segmented Rounded Block Bars */}
                      <div className="relative grid grid-cols-7 gap-2 sm:gap-3 items-end h-44 pt-4">
                        {chartSeries.map((bucket, idx) => {
                          const total = bucket.scans + bucket.generated + bucket.redirects;
                          const scanH = Math.round((bucket.scans / maxStackedTotal) * 116);
                          const draftH = Math.round((bucket.generated / maxStackedTotal) * 116);
                          const redirH = Math.round((bucket.redirects / maxStackedTotal) * 116);
                          const isHovered = hoveredBucketIdx === idx;
                          return (
                            <div
                              key={bucket.key}
                              onMouseEnter={() => setHoveredBucketIdx(idx)}
                              onMouseLeave={() => setHoveredBucketIdx(null)}
                              className="relative flex flex-col items-center justify-end h-full group cursor-default"
                            >
                              {isHovered && (
                                <div
                                  className={`absolute -top-2 z-20 px-2.5 py-1.5 rounded-lg text-[10px] font-mono whitespace-nowrap shadow-lg border pointer-events-none ${
                                    isDark
                                      ? 'bg-white text-[#101015] border-black/10'
                                      : 'bg-slate-900 text-white border-slate-800'
                                  }`}
                                >
                                  <p className="font-bold">{bucket.label}</p>
                                  <p>Scans: {bucket.scans} · Drafts: {bucket.generated} · Google: {bucket.redirects}</p>
                                </div>
                              )}

                              <div className="w-full max-w-[68px] flex flex-col-reverse gap-1 items-stretch">
                                {total === 0 ? (
                                  <div
                                    className={`h-2.5 rounded-md ${
                                      isDark ? 'bg-white/[0.06]' : 'bg-slate-200/80'
                                    }`}
                                  />
                                ) : (
                                  <>
                                    {bucket.scans > 0 && (
                                      <div
                                        className="rounded-md bg-[#818CF8]/85 transition-opacity group-hover:opacity-100"
                                        style={{ height: `${Math.max(8, scanH)}px` }}
                                      />
                                    )}
                                    {bucket.generated > 0 && (
                                      <div
                                        className="rounded-md bg-[#F472B6]/85 transition-opacity group-hover:opacity-100"
                                        style={{ height: `${Math.max(8, draftH)}px` }}
                                      />
                                    )}
                                    {bucket.redirects > 0 && (
                                      <div
                                        className="rounded-md bg-[#FBBF24]/85 transition-opacity group-hover:opacity-100"
                                        style={{ height: `${Math.max(8, redirH)}px` }}
                                      />
                                    )}
                                  </>
                                )}
                              </div>

                              <span className={`mt-2.5 text-[11px] font-mono ${surfaceMuted}`}>
                                {bucket.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right 4 cols: 2 Stacked KPI Cards */}
                    <div className="lg:col-span-4 flex flex-col gap-5 justify-between">
                      <div className={`${surfaceCard} rounded-2xl p-6 flex-1 flex flex-col justify-between`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium ${textPrimary}`}>
                            Scan-to-Google Rate
                          </span>
                          <button
                            type="button"
                            onClick={() => selectTab('analytics')}
                            className={`text-xs font-medium hover:underline cursor-pointer ${
                              isDark ? 'text-[#A5B4FC]' : 'text-indigo-600'
                            }`}
                          >
                            Details →
                          </button>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-4">
                          <span className={`font-display text-3xl sm:text-4xl font-semibold tabular-nums ${textPrimary}`}>
                            {conversionRate}%
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold tabular-nums ${
                              isDark
                                ? 'bg-[#818CF8]/20 text-[#C7D2FE]'
                                : 'bg-indigo-50 text-indigo-700'
                            }`}
                          >
                            {redirectsCount} redirects
                          </span>
                        </div>
                      </div>

                      <div className={`${surfaceCard} rounded-2xl p-6 flex-1 flex flex-col justify-between`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-medium ${textPrimary}`}>
                            AI Draft Completion
                          </span>
                          <span className={`text-xs font-mono tabular-nums ${surfaceMuted}`}>
                            {scansCount} total scans
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-4">
                          <span className={`font-display text-3xl sm:text-4xl font-semibold tabular-nums ${textPrimary}`}>
                            {draftCompletionRate}%
                          </span>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold tabular-nums ${
                              isDark
                                ? 'bg-[#F472B6]/20 text-[#FBCFE8]'
                                : 'bg-pink-50 text-pink-700'
                            }`}
                          >
                            {generatedCount} drafts
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom 4-Column Structural Grid (Clean Shortcut Cards to Specific Pages) */}
                  <div
                    className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 border-t ${borderHairline} pt-6 gap-5`}
                  >
                    {/* Column 1: Share & QR Link */}
                    <div className={`${surfaceCard} rounded-2xl p-5 flex flex-col justify-between gap-4`}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isDark ? 'bg-[#F472B6]/20 text-[#F9A8D4]' : 'bg-pink-50 text-pink-700'
                            }`}
                          >
                            Live Link
                          </span>
                          <span className={`font-mono text-[10px] ${surfaceMuted}`}>
                            Rev {activeBusiness.qrConfig.token}
                          </span>
                        </div>

                        <h2 className={`font-display text-base font-semibold ${textPrimary}`}>
                          Customer Review Link
                        </h2>
                        <p className={`font-mono text-[11px] break-all ${surfaceMuted}`}>
                          {displayReviewUrl}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            isDark
                              ? 'bg-[#252532] hover:bg-[#2F2F40] text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                        >
                          {copiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied Link</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Customer Link</span>
                            </>
                          )}
                        </button>
                        {canEditQrOrQuestions && activeBusiness.enabledFeatures.qrStudio !== false && (
                          <button
                            type="button"
                            onClick={() => selectTab('qr_editor')}
                            className={`w-full py-1.5 text-xs font-medium inline-flex items-center justify-center gap-1 cursor-pointer ${
                              isDark ? 'text-[#A5B4FC] hover:text-white' : 'text-indigo-600 hover:underline'
                            }`}
                          >
                            <span>Open QR Studio</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Featured Standee Kit (Warm Sunset Gradient Highlight Card) */}
                    <div
                      className="rounded-2xl p-5 text-[#101015] flex flex-col justify-between gap-4 shadow-md"
                      style={{
                        background:
                          'linear-gradient(145deg, #F6B985 0%, #E78FB3 52%, #B983E5 100%)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#101015] text-white text-[10px] font-semibold">
                          Standee Kit
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-[#101015]/70">
                          PDF &amp; PNG
                        </span>
                      </div>

                      <div className="flex items-center gap-3.5">
                        <div
                          className="p-2 rounded-xl bg-white shadow-xs shrink-0"
                          style={{ backgroundColor: activeBusiness.qrConfig.bgColor }}
                        >
                          <canvas ref={qrCanvasRef} className="w-20 h-20 block" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-display text-base font-bold text-[#101015] leading-tight">
                            Business QR Stand
                          </h2>
                          <p className="text-[11px] text-[#101015]/75 mt-1 leading-snug">
                            Export print-ready tabletop posters or create up to 4 placement stands.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadPng}
                          className="py-2 px-2.5 rounded-xl bg-white/90 hover:bg-white text-[#101015] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PNG</span>
                        </button>

                        {activeBusiness.enabledFeatures.pdfPosterExport && (
                          <button
                            type="button"
                            disabled={isExportingPdf}
                            onClick={handleDownloadPdf}
                            className="py-2 px-2.5 rounded-xl bg-[#101015] hover:bg-black/85 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{isExportingPdf ? 'Exporting' : 'A4 PDF'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Column 3: Google Destination & Keywords */}
                    <div className={`${surfaceCard} rounded-2xl p-5 flex flex-col justify-between gap-4`}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isDark ? 'bg-[#818CF8]/20 text-[#C7D2FE]' : 'bg-indigo-50 text-indigo-700'
                            }`}
                          >
                            Google Maps
                          </span>
                          <a
                            href={sanitizeGoogleDest}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`text-xs font-medium inline-flex items-center gap-1 ${
                              isDark ? 'text-emerald-300 hover:underline' : 'text-emerald-700 hover:underline'
                            }`}
                          >
                            <span>Test</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </div>

                        <h2 className={`font-display text-base font-semibold ${textPrimary}`}>
                          Google Destination
                        </h2>
                        <p className={`font-mono text-[11px] truncate ${surfaceMuted}`}>
                          {sanitizeGoogleDest.replace(/^https?:\/\//, '')}
                        </p>

                        {activeBusiness.seoKeywords && activeBusiness.seoKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {activeBusiness.seoKeywords.slice(0, 4).map((kw) => (
                              <span
                                key={kw}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                                  isDark ? 'bg-white/[0.06] text-[#C4C4D4]' : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {canEditBranding && activeBusiness.enabledFeatures.brandingSettings !== false && (
                        <button
                          type="button"
                          onClick={() => selectTab('branding')}
                          className={`text-left text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${
                            isDark ? 'text-[#A5B4FC] hover:text-white' : 'text-indigo-600 hover:underline'
                          }`}
                        >
                          <span>Manage Branding &amp; Link</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Column 4: Form, Templates & Languages */}
                    <div className={`${surfaceCard} rounded-2xl p-5 flex flex-col justify-between gap-4`}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {activeTemplateDef.toneTag} Template
                          </span>
                          <span className={`font-mono text-[10px] ${surfaceMuted}`}>
                            {activeBusiness.questions.length} prompts
                          </span>
                        </div>

                        <h2 className={`font-display text-base font-semibold ${textPrimary}`}>
                          {activeTemplateDef.name.split('·')[0].trim()}
                        </h2>
                        <p className={`text-xs leading-relaxed ${surfaceMuted}`}>
                          Supports English, हिंदी, मराठी &amp; Hinglish across Short, Detailed, and
                          Professional tones.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {activeBusiness.enabledFeatures.formTemplates !== false && (
                          <button
                            type="button"
                            onClick={() => selectTab('templates')}
                            className={`text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${
                              isDark ? 'text-[#A5B4FC] hover:text-white' : 'text-indigo-600 hover:underline'
                            }`}
                          >
                            <span>Templates</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        {canEditQrOrQuestions && activeBusiness.enabledFeatures.customQuestions && (
                          <button
                            type="button"
                            onClick={() => selectTab('questions')}
                            className={`text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${
                              isDark ? 'text-[#F9A8D4] hover:text-white' : 'text-pink-600 hover:underline'
                            }`}
                          >
                            <span>Edit Questions</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ==========================================
                  PAGE 2: DEDICATED ANALYTICS & ACTIVITY BOARD
                 ========================================== */}
              {activeTab === 'analytics' && activeBusiness.enabledFeatures.analyticsView && (
                <div className="space-y-6">
                  {/* Period Filter Bar + CSV Export */}
                  <div className={`${surfaceCard} rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Calendar className={`w-4 h-4 shrink-0 ${isDark ? 'text-[#A5B4FC]' : 'text-indigo-600'}`} />
                      <div className="min-w-0">
                        <h1 className={`text-sm font-semibold truncate ${textPrimary}`}>
                          {reportWindowMeta.label}
                        </h1>
                        <p className={`text-xs truncate ${surfaceMuted}`}>
                          Review funnel events, tone mix, multilingual drafts, and customer highlights
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-xl ${
                          isDark ? 'bg-[#121218]' : 'bg-slate-100'
                        }`}
                      >
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
                              reportPeriod === opt.id ? navActiveClass : navIdleClass
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
                          className={`px-2.5 py-1 rounded-lg border text-xs ${
                            isDark
                              ? 'bg-[#121218] border-white/15 text-white'
                              : 'bg-white border-slate-200 text-slate-900'
                          }`}
                        />
                      )}

                      <button
                        type="button"
                        onClick={handleExportReportCsv}
                        className={`px-3 py-1.5 rounded-xl border ${borderHairline} text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          isDark
                            ? 'bg-[#252532] hover:bg-[#2E2E3E] text-white'
                            : 'bg-white hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`${surfaceCard} rounded-2xl p-5`}>
                      <p className={`text-xs font-medium ${surfaceMuted}`}>QR Scans</p>
                      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${textPrimary}`}>
                        {scansCount}
                      </p>
                      <p className={`mt-1 text-xs ${surfaceMuted}`}>
                        All-time: {stats?.scans ?? scansCount}
                      </p>
                    </div>

                    <div className={`${surfaceCard} rounded-2xl p-5`}>
                      <p className={`text-xs font-medium ${surfaceMuted}`}>AI Drafts Generated</p>
                      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${textPrimary}`}>
                        {generatedCount}
                      </p>
                      <p className={`mt-1 text-xs ${surfaceMuted}`}>
                        {draftCompletionRate}% started draft
                      </p>
                    </div>

                    <div className={`${surfaceCard} rounded-2xl p-5`}>
                      <p className={`text-xs font-medium ${surfaceMuted}`}>Draft Tone Mix</p>
                      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${textPrimary}`}>
                        {styleTotal}
                      </p>
                      <p className={`mt-1 text-[11px] font-mono ${surfaceMuted}`}>
                        Short {pctShort}% · Detail {pctDetailed}% · Pro {pctProfessional}%
                      </p>
                    </div>

                    <div className={`${surfaceCard} rounded-2xl p-5`}>
                      <p className={`text-xs font-medium ${surfaceMuted}`}>Google Redirects</p>
                      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${textPrimary}`}>
                        {redirectsCount}
                      </p>
                      <p className={`mt-1 text-xs ${surfaceMuted}`}>
                        {conversionRate}% scan-to-Google
                      </p>
                    </div>
                  </div>

                  {/* Highlights + Multilingual Draft Breakdown */}
                  {(topHighlights.length > 0 || reviewDrafts.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                      {topHighlights.length > 0 && (
                        <div className={`lg:col-span-7 ${surfaceCard} rounded-2xl p-5 space-y-3`}>
                          <h2 className={`text-sm font-semibold ${textPrimary}`}>
                            Top Customer-Selected Highlights ({reportWindowMeta.shortLabel})
                          </h2>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {topHighlights.map(([label, count]) => {
                              const maxCount = topHighlights[0][1] || 1;
                              const pct = Math.max(14, Math.round((count / maxCount) * 100));
                              return (
                                <div
                                  key={label}
                                  className={`p-3 rounded-xl border ${borderHairline} space-y-1.5 ${
                                    isDark ? 'bg-[#121218]' : 'bg-slate-50'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-xs">
                                    <span className={`font-medium truncate ${textPrimary}`}>
                                      {label}
                                    </span>
                                    <span className={`font-mono ${surfaceMuted}`}>{count}x</span>
                                  </div>
                                  <div
                                    className={`h-1.5 rounded-full overflow-hidden ${
                                      isDark ? 'bg-white/10' : 'bg-slate-200'
                                    }`}
                                  >
                                    <div
                                      className="h-full rounded-full bg-[#818CF8]"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {reviewDrafts.length > 0 && (
                        <div className={`lg:col-span-5 ${surfaceCard} rounded-2xl p-5 space-y-3`}>
                          <h2 className={`text-sm font-semibold ${textPrimary}`}>
                            Multilingual Drafts &amp; Statuses
                          </h2>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className={`p-2.5 rounded-xl border ${borderHairline}`}>
                              <span className={surfaceMuted}>English</span>
                              <p className={`font-display text-lg font-bold ${textPrimary}`}>
                                {reviewDrafts.filter((d) => d.language === 'en').length}
                              </p>
                            </div>
                            <div className={`p-2.5 rounded-xl border ${borderHairline}`}>
                              <span lang="hi" className={surfaceMuted}>
                                हिंदी (Hindi)
                              </span>
                              <p className={`font-display text-lg font-bold ${textPrimary}`}>
                                {reviewDrafts.filter((d) => d.language === 'hi').length}
                              </p>
                            </div>
                            <div className={`p-2.5 rounded-xl border ${borderHairline}`}>
                              <span lang="mr" className={surfaceMuted}>
                                मराठी (Marathi)
                              </span>
                              <p className={`font-display text-lg font-bold ${textPrimary}`}>
                                {reviewDrafts.filter((d) => d.language === 'mr').length}
                              </p>
                            </div>
                            <div className={`p-2.5 rounded-xl border ${borderHairline}`}>
                              <span className={surfaceMuted}>Hinglish</span>
                              <p className={`font-display text-lg font-bold ${textPrimary}`}>
                                {reviewDrafts.filter((d) => d.language === 'hinglish').length}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4-Column Funnel Activity Board (FlowDesk column layout with real ReviewFlow events) */}
                  {eventsAccessError ? (
                    <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-sm text-amber-300 flex items-start gap-3">
                      <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          Customer Review Flow Activity is blocked by Firestore Rules
                        </p>
                        <p className="text-xs opacity-85 mt-1">
                          Publish the latest <span className="font-mono">firestore.rules</span> so
                          client accounts can read <span className="font-mono">reviewEvents</span>.
                        </p>
                      </div>
                    </div>
                  ) : !canReadEventHistory ? (
                    <div className={`${surfaceCard} rounded-2xl p-6 text-sm ${surfaceMuted} flex items-center gap-3`}>
                      <Store className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span>
                        Linking detailed Customer Review Flow Activity for your client account.
                      </span>
                    </div>
                  ) : (
                    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 border-t ${borderHairline} pt-5 gap-4`}>
                      {funnelColumns.map((col) => (
                        <div key={col.id} className="space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <h3 className={`font-display text-base font-semibold ${textPrimary}`}>
                              {col.title}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${col.badgeClass}`}
                            >
                              {col.total}
                            </span>
                          </div>

                          {col.items.length === 0 ? (
                            <div
                              className={`${surfaceCard} rounded-2xl p-5 text-center text-xs ${surfaceMuted}`}
                            >
                              <Clock className="w-5 h-5 mx-auto mb-1.5 opacity-60" />
                              <span>No events in {reportWindowMeta.shortLabel}</span>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {col.items.map((ev) => (
                                <div
                                  key={ev.id}
                                  className={`${surfaceCard} rounded-2xl p-4 space-y-2.5`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${col.badgeClass}`}
                                    >
                                      {ev.language
                                        ? ev.language === 'hi'
                                          ? 'हिंदी'
                                          : ev.language === 'mr'
                                          ? 'मराठी'
                                          : ev.language === 'hinglish'
                                          ? 'Hinglish'
                                          : 'English'
                                        : col.title}
                                    </span>
                                    <span className={`text-[11px] font-mono ${surfaceMuted}`}>
                                      {formatRelativeTime(ev.createdAt)}
                                    </span>
                                  </div>

                                  <div>
                                    <p className={`text-xs font-semibold ${textPrimary}`}>
                                      {ev.standName || ev.standCode || `/${ev.slug}`}
                                    </p>
                                    {ev.reviewStyle && (
                                      <p className={`text-[11px] capitalize mt-0.5 ${surfaceMuted}`}>
                                        Tone: {ev.reviewStyle}
                                        {ev.sentiment ? ` · ${ev.sentiment}` : ''}
                                      </p>
                                    )}
                                  </div>

                                  {Array.isArray(ev.selectedHighlights) &&
                                    ev.selectedHighlights.length > 0 && (
                                      <p className={`text-[11px] leading-snug ${surfaceMuted}`}>
                                        {ev.selectedHighlights.slice(0, 3).join(' · ')}
                                      </p>
                                    )}

                                  <div className={`pt-2 border-t ${borderHairline} flex items-center justify-between text-[10px] font-mono ${surfaceMuted}`}>
                                    <span>{formatEventDateTime(ev.createdAt)}</span>
                                    <span className="text-emerald-400">✓ Recorded</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ==========================================
                  DEDICATED FEATURE PAGES (ONE PER SIDEBAR TAB)
                 ========================================== */}
              <div className="portal-embedded-stage">
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
              </div>

              {activeTab === 'preview' && previewProfile && (
                <div className={`rounded-2xl border ${borderHairline} overflow-hidden bg-white`}>
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

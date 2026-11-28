import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Bell,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Coins,
  Download,
  Eye,
  FileBarChart2,
  FlaskConical,
  KeyRound,
  Layers,
  LayoutGrid,
  ListFilter,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreVertical,
  Palette,
  PauseCircle,
  Plus,
  QrCode,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AdminEmail,
  AdminUser,
  AiUsageLog,
  Business,
  BusinessStats,
  ClientAccessLevel,
  ConsentedExample,
  EnabledFeatures,
  PackageTier,
  PublicProfile,
  QrStandRequest,
  ReviewDraft,
  ReviewEvaluation,
  ReviewEvent,
  ReviewFlowMode,
  WeeklyReport,
} from '../types';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  grantAdminByEmail,
  grantAdminByUid,
  normalizeEmail,
  revokeAdmin,
  revokeAdminByEmail,
  subscribeToAdminEmails,
  subscribeToAdmins,
  subscribeToBusinessReviewDrafts,
  updateBusiness,
} from '../services/businessService';
import {
  fetchBusinessReportInputs,
  generateAndSaveWeeklyReport,
  getMondaySundayWindow,
  isMondayToday,
  reviewQrStandRequest,
  subscribeToAllAiUsage,
  subscribeToAllConsentedExamples,
  subscribeToAllQrStandRequests,
  subscribeToAllReviewEvaluations,
  subscribeToAllWeeklyReports,
} from '../services/platformFeaturesService';
import { downloadWeeklyReportPdf } from '../utils/qrAndPdf';
import { hasPasswordProvider } from '../utils/urlAndAuth';
import { AccountSecurityModal } from './AccountSecurityModal';
import { AiEvaluationDashboard } from './AiEvaluationDashboard';
import { BusinessLogo } from './BusinessLogo';
import { OverviewTab } from './OverviewTab';
import { QrStudioTab } from './QrStudioTab';
import { QuestionBuilderTab } from './QuestionBuilderTab';
import { BrandingTab } from './BrandingTab';
import { CustomerReviewFlow } from './CustomerReviewFlow';
import { QrStandsTab } from './QrStandsTab';
import { GbpAutoReplyTab } from './GbpAutoReplyTab';
import { WeeklyReportsTab } from './WeeklyReportsTab';
import { TemplatesTab } from './TemplatesTab';
import { FullActivityPage } from './FullActivityPage';

type AdminSection =
  | 'directory'
  | 'stand_requests'
  | 'ai_usage'
  | 'ai_eval'
  | 'weekly_reports'
  | 'clients'
  | 'activity'
  | 'team';
type BusinessDetailTab =
  | 'access'
  | 'seo_ai'
  | 'overview'
  | 'full_activity'
  | 'stands'
  | 'gbp_reply'
  | 'weekly'
  | 'templates'
  | 'qr'
  | 'questions'
  | 'branding'
  | 'preview';

interface ManagementConsoleViewProps {
  user: User;
  businesses: Business[];
  statsMap: Record<string, BusinessStats>;
  events: ReviewEvent[];
  onOpenNewBusiness: () => void;
  onSwitchToPortal: () => void;
  onLinkEmailPassword?: (password: string) => Promise<void>;
  onSignOut: () => void;
}

function formatTime(createdAt: unknown): string {
  if (!createdAt) return 'Just now';
  if (typeof createdAt === 'object' && createdAt !== null && 'toDate' in createdAt) {
    const dt = (createdAt as { toDate: () => Date }).toDate();
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return 'Recent';
}

function getEventTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (ts instanceof Date) return Number.isFinite(ts.getTime()) ? ts.getTime() : 0;
  if (typeof ts === 'object' && ts !== null) {
    const c = ts as { toMillis?: () => number; toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof c.toMillis === 'function') {
      try {
        return c.toMillis();
      } catch {
        // ignore
      }
    }
    if (typeof c.toDate === 'function') {
      try {
        return c.toDate().getTime();
      } catch {
        // ignore
      }
    }
    const sec = c.seconds ?? c._seconds;
    if (sec !== undefined && sec !== null && Number.isFinite(Number(sec))) {
      return Number(sec) * 1000;
    }
  }
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

export function ManagementConsoleView({
  user,
  businesses,
  statsMap,
  events,
  onOpenNewBusiness,
  onSwitchToPortal,
  onLinkEmailPassword,
  onSignOut,
}: ManagementConsoleViewProps) {
  const [section, setSection] = useState<AdminSection>('directory');
  const [selectedBizId, setSelectedBizId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gbp_oauth') && params.get('businessId')) {
        return params.get('businessId');
      }
    }
    return null;
  });
  const [detailTab, setDetailTab] = useState<BusinessDetailTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gbp_oauth')) return 'gbp_reply';
    }
    return 'access';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [directoryView, setDirectoryView] = useState<'board' | 'table'>('table');
  const [sortBy, setSortBy] = useState<'scans' | 'name' | 'redirects'>('scans');
  const [featuredBizId, setFeaturedBizId] = useState<string | null>(null);
  const [velocityRangeDays, setVelocityRangeDays] = useState<5 | 7 | 14>(5);
  const [velocityBizId, setVelocityBizId] = useState<string>('all');
  const [showScansLine, setShowScansLine] = useState<boolean>(true);
  const [showRedirectsLine, setShowRedirectsLine] = useState<boolean>(true);
  const [activeVelocityIdx, setActiveVelocityIdx] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('reviewflow_admin_theme') === 'dark';
  });
  const toggleAdminTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('reviewflow_admin_theme', next ? 'dark' : 'light');
      }
      return next;
    });
  };
  const directoryTableRef = useRef<HTMLDivElement>(null);
  const hasPasswordAuth = hasPasswordProvider(user.providerData);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Client assignment & feature governance state for selected business
  const selectedBiz = useMemo(
    () => businesses.find((b) => b.id === selectedBizId) ?? null,
    [businesses, selectedBizId],
  );
  const [selectedBizDrafts, setSelectedBizDrafts] = useState<ReviewDraft[]>([]);

  useEffect(() => {
    if (!selectedBiz?.id || detailTab !== 'full_activity') {
      setSelectedBizDrafts([]);
      return;
    }
    return subscribeToBusinessReviewDrafts(
      selectedBiz.id,
      selectedBiz.ownerId,
      user.uid,
      true,
      (drafts) => {
        setSelectedBizDrafts(drafts);
      },
      undefined,
      selectedBiz.clientUid,
    );
  }, [selectedBiz?.id, selectedBiz?.ownerId, selectedBiz?.clientUid, detailTab, user.uid]);

  const [clientEmailInput, setClientEmailInput] = useState('');
  const [accessLevelInput, setAccessLevelInput] = useState<ClientAccessLevel>('full');
  const [packageTierInput, setPackageTierInput] = useState<PackageTier>('standard_plus');
  const [reviewFlowModeInput, setReviewFlowModeInput] =
    useState<ReviewFlowMode>('guided_questions');
  const [allowClientFlowModeSwitchInput, setAllowClientFlowModeSwitchInput] =
    useState<boolean>(true);
  const [qrStandLimitInput, setQrStandLimitInput] = useState<number>(4);
  const [featuresInput, setFeaturesInput] = useState<EnabledFeatures>({
    aiReviewDrafts: true,
    customQuestions: true,
    pdfPosterExport: true,
    analyticsView: true,
    inStoreQrStands: true,
    gbpAutoReply: true,
    weeklyReports: true,
    formTemplates: true,
    qrStudio: true,
    brandingSettings: true,
  });
  const [isSavingGovernance, setIsSavingGovernance] = useState(false);
  const [governanceNotice, setGovernanceNotice] = useState<string | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);

  const [standRequests, setStandRequests] = useState<QrStandRequest[]>([]);
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [requestNoteMap, setRequestNoteMap] = useState<Record<string, string>>({});
  const [requestBanner, setRequestBanner] = useState<string | null>(null);

  const [globalAiLogs, setGlobalAiLogs] = useState<AiUsageLog[]>([]);
  const [globalEvaluations, setGlobalEvaluations] = useState<ReviewEvaluation[]>([]);
  const [globalConsentedExamples, setGlobalConsentedExamples] = useState<ConsentedExample[]>([]);
  const [globalReports, setGlobalReports] = useState<WeeklyReport[]>([]);
  const [isBatchGeneratingReports, setIsBatchGeneratingReports] = useState(false);
  const [batchReportNotice, setBatchReportNotice] = useState<string | null>(null);

  // Client Portal Access (Gmail) quick-assign state
  const [assignBizId, setAssignBizId] = useState<string>('');
  const [assignEmail, setAssignEmail] = useState('');
  const [assignTier, setAssignTier] = useState<ClientAccessLevel>('full');
  const [isSavingAssign, setIsSavingAssign] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Team Admins state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminEmails, setAdminEmails] = useState<AdminEmail[]>([]);
  const [newAdminGmail, setNewAdminGmail] = useState('');
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    const unsubUids = subscribeToAdmins(
      (items) => setAdmins(items),
      (err) => setAdminError(err?.message || 'Unable to load UID-based team admins.'),
    );
    const unsubEmails = subscribeToAdminEmails(
      (items) => setAdminEmails(items),
      (err) => setAdminError(err?.message || 'Unable to load admin email grants.'),
    );
    const unsubStandReqs = subscribeToAllQrStandRequests(
      (items) => setStandRequests(items),
      (err) => setRequestBanner(err?.message || 'Unable to load QR stand requests.'),
    );
    const unsubAiLogs = subscribeToAllAiUsage(
      (items) => setGlobalAiLogs(items),
      (err) => console.error('AI usage subscription error:', err),
    );
    const unsubEvaluations = subscribeToAllReviewEvaluations(
      (items) => setGlobalEvaluations(items),
      (err) => console.error('AI evaluation subscription error:', err),
    );
    const unsubConsented = subscribeToAllConsentedExamples(
      (items) => setGlobalConsentedExamples(items),
      (err) => console.error('Consented examples subscription error:', err),
    );
    const unsubWeekly = subscribeToAllWeeklyReports(
      (items) => setGlobalReports(items),
      (err) => setBatchReportNotice(err?.message || 'Unable to load weekly reports.'),
    );
    return () => {
      unsubUids();
      unsubEmails();
      unsubStandReqs();
      unsubAiLogs();
      unsubEvaluations();
      unsubConsented();
      unsubWeekly();
    };
  }, []);

  useEffect(() => {
    if (businesses.length === 0) {
      setAssignBizId('');
      return;
    }
    if (!assignBizId || !businesses.some((b) => b.id === assignBizId)) {
      const first = businesses[0];
      setAssignBizId(first.id);
      setAssignEmail(first.clientEmail || '');
      setAssignTier(first.clientAccessLevel || 'full');
    }
  }, [businesses, assignBizId]);

  const selectedBizFeaturesSig = selectedBiz ? JSON.stringify(selectedBiz.enabledFeatures) : '';
  useEffect(() => {
    if (!selectedBiz) return;
    setClientEmailInput(selectedBiz.clientEmail || '');
    setAccessLevelInput(selectedBiz.clientAccessLevel || 'full');
    setPackageTierInput(selectedBiz.packageTier === 'standard' ? 'standard' : 'standard_plus');
    setReviewFlowModeInput(
      selectedBiz.reviewFlowMode === 'ai_drafted_instant'
        ? 'ai_drafted_instant'
        : 'guided_questions',
    );
    setAllowClientFlowModeSwitchInput(selectedBiz.allowClientFlowModeSwitch !== false);
    setQrStandLimitInput(selectedBiz.qrStandLimit ?? 4);
    setFeaturesInput({
      aiReviewDrafts: selectedBiz.enabledFeatures.aiReviewDrafts,
      customQuestions: selectedBiz.enabledFeatures.customQuestions,
      pdfPosterExport: selectedBiz.enabledFeatures.pdfPosterExport,
      analyticsView: selectedBiz.enabledFeatures.analyticsView,
      inStoreQrStands: selectedBiz.enabledFeatures.inStoreQrStands ?? true,
      gbpAutoReply: selectedBiz.enabledFeatures.gbpAutoReply ?? true,
      weeklyReports: selectedBiz.enabledFeatures.weeklyReports ?? true,
      formTemplates: selectedBiz.enabledFeatures.formTemplates ?? true,
      qrStudio: selectedBiz.enabledFeatures.qrStudio ?? true,
      brandingSettings: selectedBiz.enabledFeatures.brandingSettings ?? true,
    });
  }, [
    selectedBiz?.id,
    selectedBiz?.clientEmail,
    selectedBiz?.clientAccessLevel,
    selectedBiz?.packageTier,
    selectedBiz?.reviewFlowMode,
    selectedBiz?.allowClientFlowModeSwitch,
    selectedBiz?.qrStandLimit,
    selectedBizFeaturesSig,
  ]);

  useEffect(() => {
    setGovernanceNotice(null);
    setGovernanceError(null);
  }, [selectedBiz?.id]);

  const aggregateStats = useMemo(() => {
    let totalScans = 0;
    let totalDrafts = 0;
    let totalRedirects = 0;
    let activeQrCount = 0;

    for (const biz of businesses) {
      if (biz.qrConfig.isActive) activeQrCount += 1;
      const st = statsMap[biz.id];
      if (st) {
        totalScans += st.scans || 0;
        totalDrafts += st.generated || 0;
        totalRedirects += st.redirects || 0;
      }
    }

    return {
      totalBusinesses: businesses.length,
      activeQrCount,
      totalScans,
      totalDrafts,
      totalRedirects,
    };
  }, [businesses, statsMap]);

  const filteredBusinesses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = businesses.filter((biz) => {
      if (statusFilter === 'active' && !biz.qrConfig.isActive) return false;
      if (statusFilter === 'paused' && biz.qrConfig.isActive) return false;
      if (!q) return true;
      return (
        biz.name.toLowerCase().includes(q) ||
        biz.slug.toLowerCase().includes(q) ||
        biz.category.toLowerCase().includes(q) ||
        biz.clientEmail.toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const sa = statsMap[a.id];
      const sb = statsMap[b.id];
      if (sortBy === 'redirects') {
        return (sb?.redirects ?? 0) - (sa?.redirects ?? 0);
      }
      return (sb?.scans ?? 0) - (sa?.scans ?? 0);
    });
  }, [businesses, searchQuery, statusFilter, sortBy, statsMap]);

  const platformConversionRate = useMemo(() => {
    if (aggregateStats.totalScans <= 0) return 0;
    return Math.min(
      100,
      Math.round((aggregateStats.totalRedirects / aggregateStats.totalScans) * 100),
    );
  }, [aggregateStats.totalScans, aggregateStats.totalRedirects]);

  const velocitySeries = useMemo(() => {
    const days: {
      key: string;
      label: string;
      fullDate: string;
      scans: number;
      redirects: number;
      conversionPct: number;
    }[] = [];
    const now = new Date();
    for (let i = velocityRangeDays - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label =
        velocityRangeDays <= 7
          ? d.toLocaleDateString(undefined, { weekday: 'short' })
          : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const fullDate = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      days.push({ key, label, fullDate, scans: 0, redirects: 0, conversionPct: 0 });
    }
    const map = new Map(days.map((d) => [d.key, d]));
    for (const ev of events) {
      if (velocityBizId !== 'all' && ev.businessId !== velocityBizId) continue;
      const ms = getEventTimestampMs(ev.createdAt);
      if (!ms) continue;
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bucket = map.get(key);
      if (!bucket) continue;
      if (ev.eventType === 'scan') bucket.scans += 1;
      else if (ev.eventType === 'copy_redirect') bucket.redirects += 1;
    }
    for (const day of days) {
      day.conversionPct =
        day.scans > 0 ? Math.min(100, Math.round((day.redirects / day.scans) * 100)) : 0;
    }
    return days;
  }, [events, velocityRangeDays, velocityBizId]);

  const maxVelocityVal = useMemo(() => {
    let m = 1;
    for (const d of velocitySeries) {
      if (showScansLine) m = Math.max(m, d.scans);
      if (showRedirectsLine) m = Math.max(m, d.redirects);
    }
    return m;
  }, [velocitySeries, showScansLine, showRedirectsLine]);

  const topBusinesses = useMemo(() => {
    return [...businesses]
      .sort((a, b) => (statsMap[b.id]?.scans ?? 0) - (statsMap[a.id]?.scans ?? 0))
      .slice(0, 5);
  }, [businesses, statsMap]);

  const toneMixStats = useMemo(() => {
    const counts = { short: 0, detailed: 0, professional: 0 };
    for (const ev of events) {
      if (ev.eventType !== 'generate' && ev.eventType !== 'copy_redirect') continue;
      if (ev.reviewStyle === 'detailed') counts.detailed += 1;
      else if (ev.reviewStyle === 'professional') counts.professional += 1;
      else counts.short += 1;
    }
    let total = counts.short + counts.detailed + counts.professional;
    if (total === 0) {
      for (const b of businesses) {
        const s = b.branding?.defaultReviewStyle || 'short';
        if (s === 'detailed') counts.detailed += 1;
        else if (s === 'professional') counts.professional += 1;
        else counts.short += 1;
      }
      total = counts.short + counts.detailed + counts.professional;
    }
    const safeTotal = Math.max(1, total);
    const items = [
      { key: 'short', label: 'Short & Punchy', count: counts.short, pct: Math.round((counts.short / safeTotal) * 100), color: '#4F46E5' },
      { key: 'detailed', label: 'Detailed Story', count: counts.detailed, pct: Math.round((counts.detailed / safeTotal) * 100), color: '#0EA5E9' },
      { key: 'professional', label: 'Professional', count: counts.professional, pct: Math.round((counts.professional / safeTotal) * 100), color: '#EC4899' },
    ];
    return { items, total };
  }, [events, businesses]);

  const boardColumns = useMemo(() => {
    const fullSelf: Business[] = [];
    const qrAndQuestions: Business[] = [];
    const readOnly: Business[] = [];
    const pausedOrUnassigned: Business[] = [];

    for (const biz of filteredBusinesses) {
      if (!biz.qrConfig.isActive || !biz.clientEmail) {
        pausedOrUnassigned.push(biz);
      } else if (biz.clientAccessLevel === 'full') {
        fullSelf.push(biz);
      } else if (biz.clientAccessLevel === 'qr_and_questions') {
        qrAndQuestions.push(biz);
      } else {
        readOnly.push(biz);
      }
    }

    return [
      { id: 'full', title: 'Full Self-Service', items: fullSelf },
      { id: 'qr_questions', title: 'QR & Questions', items: qrAndQuestions },
      { id: 'read_only', title: 'Read-Only', items: readOnly },
      { id: 'paused', title: 'Paused / Unassigned', items: pausedOrUnassigned },
    ];
  }, [filteredBusinesses]);

  const bizNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of businesses) map[b.id] = b.name;
    return map;
  }, [businesses]);

  const filteredClientBusinesses = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.slug.toLowerCase().includes(q) ||
        b.clientEmail.toLowerCase().includes(q),
    );
  }, [businesses, clientSearchQuery]);

  const pendingStandRequestsCount = useMemo(
    () => standRequests.filter((r) => r.status === 'pending').length,
    [standRequests],
  );

  const aiGlobalSummary = useMemo(() => {
    let totalTokens = 0;
    let totalCostUsd = 0;
    let successCount = 0;
    let failedCount = 0;
    const byModel = new Map<
      string,
      {
        provider: string;
        modelName: string;
        count: number;
        success: number;
        failed: number;
        tokens: number;
        costUsd: number;
      }
    >();
    const byBusiness = new Map<
      string,
      { businessName: string; count: number; tokens: number; costUsd: number }
    >();

    for (const log of globalAiLogs) {
      const tokens = log.totalTokens || 0;
      const cost = log.estimatedCostUsd || 0;
      totalTokens += tokens;
      totalCostUsd += cost;
      if (log.status === 'failed') failedCount += 1;
      else successCount += 1;

      const provider = log.provider || 'gemini';
      const modelName = log.modelName || 'gemini-3.1-flash-lite';
      const mKey = `${provider}::${modelName}`;
      const mEntry = byModel.get(mKey) || {
        provider,
        modelName,
        count: 0,
        success: 0,
        failed: 0,
        tokens: 0,
        costUsd: 0,
      };
      mEntry.count += 1;
      if (log.status === 'failed') mEntry.failed += 1;
      else mEntry.success += 1;
      mEntry.tokens += tokens;
      mEntry.costUsd += cost;
      byModel.set(mKey, mEntry);

      const bEntry = byBusiness.get(log.businessId) || {
        businessName: bizNameMap[log.businessId] || log.businessId,
        count: 0,
        tokens: 0,
        costUsd: 0,
      };
      bEntry.count += 1;
      bEntry.tokens += tokens;
      bEntry.costUsd += cost;
      byBusiness.set(log.businessId, bEntry);
    }

    return {
      totalRequests: globalAiLogs.length,
      successCount,
      failedCount,
      totalTokens,
      totalCostUsd,
      models: Array.from(byModel.values()).sort((a, b) => b.count - a.count),
      businesses: Array.from(byBusiness.entries())
        .map(([businessId, val]) => ({ businessId, ...val }))
        .sort((a, b) => b.tokens - a.tokens),
    };
  }, [globalAiLogs, bizNameMap]);

  const handleReviewStandRequest = async (
    req: QrStandRequest,
    decision: 'approved' | 'rejected',
  ) => {
    setProcessingReqId(req.id);
    setRequestBanner(null);
    try {
      await reviewQrStandRequest({
        request: req,
        decision,
        adminUser: user,
        adminNote: requestNoteMap[req.id] || '',
      });
      setRequestBanner(
        decision === 'approved'
          ? `Approved +${req.requestedAdditionalStands} QR stands for ${req.businessName}. New quota: ${req.currentLimit + req.requestedAdditionalStands}.`
          : `Rejected expansion request for ${req.businessName}.`,
      );
      setTimeout(() => setRequestBanner(null), 4000);
    } catch (err) {
      setRequestBanner(err instanceof Error ? err.message : 'Unable to process stand request.');
    } finally {
      setProcessingReqId(null);
    }
  };

  const handleBatchGenerateWeeklyReports = async (choice: 'previous' | 'current') => {
    setIsBatchGeneratingReports(true);
    setBatchReportNotice(null);
    try {
      const win = getMondaySundayWindow(choice === 'previous' ? -1 : 0);
      let generated = 0;
      for (const biz of businesses) {
        if (biz.enabledFeatures.weeklyReports === false) continue;
        const existing = globalReports.find(
          (r) => r.businessId === biz.id && r.weekStart === win.weekStart,
        );
        const bizLogs = globalAiLogs.filter((l) => l.businessId === biz.id);
        const { qrStands, gbpReviews } = await fetchBusinessReportInputs(biz.id);
        await generateAndSaveWeeklyReport({
          business: biz,
          events,
          qrStands,
          gbpReviews,
          aiUsageLogs: bizLogs,
          generatedBy: user.email || user.uid,
          weekStart: win.weekStart,
          weekEnd: win.weekEnd,
          startMs: win.startMs,
          endMs: win.endMs,
          existingReport: existing,
        });
        generated += 1;
      }
      if (!mountedRef.current) return;
      setBatchReportNotice(
        `Compiled ${generated} Weekly Business Report(s) for ${win.weekStart} – ${win.weekEnd}.`,
      );
      setTimeout(() => {
        if (mountedRef.current) setBatchReportNotice(null);
      }, 5000);
    } catch (err) {
      if (mountedRef.current) {
        setBatchReportNotice(
          err instanceof Error ? err.message : 'Unable to compile weekly reports.',
        );
      }
    } finally {
      if (mountedRef.current) {
        setIsBatchGeneratingReports(false);
      }
    }
  };

  const handleSaveGovernance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBiz) return;
    setIsSavingGovernance(true);
    setGovernanceError(null);
    setGovernanceNotice(null);
    const cleanedEmail = normalizeEmail(clientEmailInput);
    if (cleanedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)) {
      setGovernanceError('Please enter a valid Client Gmail / email address (or leave it blank).');
      setIsSavingGovernance(false);
      return;
    }
    try {
      await updateBusiness(
        selectedBiz,
        {
          clientEmail: cleanedEmail,
          clientAccessLevel: accessLevelInput,
          packageTier: packageTierInput,
          reviewFlowMode: reviewFlowModeInput,
          allowClientFlowModeSwitch: allowClientFlowModeSwitchInput,
          qrStandLimit: Math.min(100, Math.max(1, Math.round(qrStandLimitInput) || 4)),
          enabledFeatures: featuresInput,
        },
        { isAdmin: true },
      );
      setClientEmailInput(cleanedEmail);
      setGovernanceNotice(
        `Saved! ${packageTierInput === 'standard' ? '₹3,000 Standard (English Only)' : '₹4,000 Standard Plus (All 4 Languages)'} & ${reviewFlowModeInput === 'ai_drafted_instant' ? '5+ Ready AI Reviews' : 'Guided Questions'} permissions updated.`,
      );
      setTimeout(() => setGovernanceNotice(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update permissions.';
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('insufficient')) {
        setGovernanceError(
          `Blocked by Firebase Firestore Rules: please copy & publish the latest firestore.rules file (from GitHub main) in Firebase Console → Firestore Database → Rules. Details: ${msg}`,
        );
      } else {
        setGovernanceError(msg);
      }
    } finally {
      setIsSavingGovernance(false);
    }
  };

  const handleSelectAssignBusiness = (bizId: string) => {
    setAssignBizId(bizId);
    const target = businesses.find((b) => b.id === bizId);
    if (target) {
      setAssignEmail(target.clientEmail || '');
      setAssignTier(target.clientAccessLevel || 'full');
    }
    setAssignError(null);
    setAssignNotice(null);
  };

  const handleSaveClientAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = businesses.find((b) => b.id === assignBizId);
    if (!target) {
      setAssignError('Please select a business first.');
      return;
    }
    const cleanEmail = normalizeEmail(assignEmail);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAssignError('Please enter a valid customer Gmail or email address.');
      return;
    }

    setIsSavingAssign(true);
    setAssignError(null);
    setAssignNotice(null);
    try {
      await updateBusiness(
        target,
        {
          clientEmail: cleanEmail,
          clientAccessLevel: assignTier,
        },
        { isAdmin: true },
      );
      setAssignNotice(
        `${cleanEmail} now has Client Portal access for ${target.name} when they sign in.`,
      );
      setTimeout(() => setAssignNotice(null), 4000);
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Unable to save customer Gmail access.',
      );
    } finally {
      setIsSavingAssign(false);
    }
  };

  const handleRemoveClientAccess = async (biz: Business) => {
    setAssignError(null);
    setAssignNotice(null);
    try {
      await updateBusiness(biz, { clientEmail: '' }, { isAdmin: true });
      if (assignBizId === biz.id) {
        setAssignEmail('');
      }
      setAssignNotice(`Removed Client Portal Gmail assignment from ${biz.name}.`);
      setTimeout(() => setAssignNotice(null), 3500);
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Unable to remove customer Gmail access.',
      );
    }
  };

  const handleAddAdminByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminStatus(null);
    setAdminError(null);
    const cleanEmail = normalizeEmail(newAdminGmail);
    if (!cleanEmail) return;
    try {
      await grantAdminByEmail(cleanEmail, user.uid);
      setNewAdminGmail('');
      setAdminStatus(
        `${cleanEmail} will open Business Management automatically the next time they sign in.`,
      );
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to add manager email.');
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminStatus(null);
    setAdminError(null);
    if (!newAdminUid.trim() || !newAdminEmail.trim()) return;
    try {
      await grantAdminByUid(newAdminUid.trim(), newAdminEmail.trim(), user.uid);
      setNewAdminUid('');
      setNewAdminEmail('');
      setAdminStatus('Manager granted Business Management access.');
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to add manager.');
    }
  };

  const previewProfile: PublicProfile | null = selectedBiz
    ? {
        businessId: selectedBiz.id,
        ownerId: selectedBiz.ownerId,
        ownerName: selectedBiz.ownerName,
        packageTier: selectedBiz.packageTier,
        reviewFlowMode: selectedBiz.reviewFlowMode,
        allowClientFlowModeSwitch: selectedBiz.allowClientFlowModeSwitch,
        slug: selectedBiz.slug,
        name: selectedBiz.name,
        category: selectedBiz.category,
        address: selectedBiz.address,
        locality: selectedBiz.locality,
        city: selectedBiz.city,
        servicesOffered: selectedBiz.servicesOffered,
        productsOffered: selectedBiz.productsOffered,
        businessHighlights: selectedBiz.businessHighlights,
        googleReviewUrl: selectedBiz.googleReviewUrl,
        logoDataUrl: selectedBiz.logoDataUrl,
        enabledFeatures: selectedBiz.enabledFeatures,
        branding: selectedBiz.branding,
        qrConfig: selectedBiz.qrConfig,
        questions: selectedBiz.questions,
        formTemplate: selectedBiz.formTemplate,
        seoKeywords: selectedBiz.seoKeywords,
        seoKeywordsByLanguage: selectedBiz.seoKeywordsByLanguage,
        referenceReviews: selectedBiz.referenceReviews,
      }
    : null;

  const sidebarActiveClass = isDark
    ? 'bg-[#23263E] text-[#A5B4FC] font-semibold'
    : 'bg-[#EEF2FF] text-[#4F46E5] font-semibold';
  const sidebarIdleClass = isDark
    ? 'text-slate-400 hover:text-white hover:bg-[#1C2030]'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50';

  const sidebarContent = (
    <div
      className={`flex flex-col h-full border-r justify-between transition-colors ${
        isDark ? 'bg-[#111420] border-[#23273A]' : 'bg-white border-slate-200/80'
      }`}
    >
      <div>
        <div className="h-16 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/reviewflow-logo.png"
              alt="ReviewFlow"
              className="w-8 h-8 rounded-xl object-cover shadow-xs shrink-0 bg-[#0E0A26]"
            />
            <div className="leading-tight">
              <span
                className={`font-display text-base font-bold tracking-tight block ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                ReviewFlow
              </span>
              <span className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Admin Console
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className={`lg:hidden p-1.5 rounded-lg ${
              isDark ? 'text-slate-400 hover:bg-[#1C2030]' : 'text-slate-500 hover:bg-slate-100'
            }`}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 pt-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              setSection('directory');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'directory' && !selectedBiz ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <span className="inline-flex items-center gap-3">
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Admin Dashboard</span>
            </span>
            <span
              className={`text-[11px] font-mono tabular-nums ${
                section === 'directory' && !selectedBiz
                  ? isDark
                    ? 'text-indigo-300'
                    : 'text-[#4F46E5]'
                  : 'text-slate-400'
              }`}
            >
              {businesses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSection('stand_requests');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'stand_requests' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <span className="inline-flex items-center gap-3">
              <Layers className="w-4 h-4 shrink-0" />
              <span>QR Stand Requests</span>
            </span>
            {pendingStandRequestsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#4F46E5] text-white tabular-nums">
                {pendingStandRequestsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSection('activity');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium flex items-center justify-between gap-2 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'activity' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <span className="inline-flex items-center gap-3">
              <Activity className="w-4 h-4 shrink-0" />
              <span>Full Activity</span>
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              {events.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSection('clients');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium flex items-center gap-3 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'clients' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <Mail className="w-4 h-4 shrink-0" />
            <span>Client Portal Access</span>
          </button>
        </nav>

        <div
          className={`px-3 pt-5 mt-5 border-t space-y-1 ${
            isDark ? 'border-[#23273A]' : 'border-slate-100'
          }`}
        >
          <p className="px-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Governance &amp; AI
          </p>

          <button
            type="button"
            onClick={() => {
              setSection('ai_usage');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2 rounded-xl text-[13px] font-medium flex items-center gap-3 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'ai_usage' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <Coins className="w-4 h-4 shrink-0" />
            <span>AI Usage &amp; Costs</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSection('ai_eval');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2 rounded-xl text-[13px] font-medium flex items-center gap-3 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'ai_eval' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>AI Quality &amp; Eval</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSection('weekly_reports');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2 rounded-xl text-[13px] font-medium flex items-center gap-3 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'weekly_reports' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <FileBarChart2 className="w-4 h-4 shrink-0" />
            <span>Weekly Reports</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSection('team');
              setSelectedBizId(null);
              setMobileMenuOpen(false);
            }}
            className={`w-full px-3.5 py-2 rounded-xl text-[13px] font-medium flex items-center gap-3 whitespace-nowrap cursor-pointer transition-colors ${
              section === 'team' ? sidebarActiveClass : sidebarIdleClass
            }`}
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span>Team Admins</span>
          </button>
        </div>
      </div>

      {/* Bottom Workspace & Account Section */}
      <div className={`p-4 border-t space-y-3 ${isDark ? 'border-[#23273A]' : 'border-slate-100'}`}>
        <div
          className={`rounded-xl p-3 border space-y-2 ${
            isDark
              ? 'bg-[#181C2C] border-[#262B3D]'
              : 'bg-[#F8FAFC] border-slate-200/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Client Workspace
            </span>
            <Eye className="w-3.5 h-3.5 text-[#4F46E5]" />
          </div>
          <button
            type="button"
            onClick={onSwitchToPortal}
            className="w-full py-1.5 px-2.5 rounded-lg bg-[#4F46E5] hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer transition-colors"
          >
            Open Client Portal
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {(user.email || 'M').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {user.displayName || 'Manager'}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign Out"
            aria-label="Sign Out"
            className={`p-1.5 rounded-lg cursor-pointer shrink-0 ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-[#1C2030]'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {onLinkEmailPassword && (
          <button
            type="button"
            onClick={() => setAccountSecurityOpen(true)}
            className={`w-full px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
              isDark
                ? 'border-[#262B3D] bg-[#181C2C] hover:bg-[#1F2438] text-slate-200'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            <KeyRound className="w-3 h-3" />
            <span>{hasPasswordAuth ? 'Sign-In Methods' : 'Set Password'}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex transition-colors ${isDark ? 'admin-panel-dark' : 'admin-panel-light'}`}>
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen overflow-y-auto">
        {sidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className={`sticky top-0 z-30 h-16 backdrop-blur-md border-b px-4 sm:px-7 flex items-center justify-between gap-4 transition-colors ${
            isDark ? 'bg-[#111420]/90 border-[#23273A]' : 'bg-white/95 border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`lg:hidden p-2 -ml-2 rounded-lg ${
                isDark ? 'text-slate-300 hover:bg-[#1C2030]' : 'text-slate-600 hover:bg-slate-100'
              }`}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {selectedBiz || section !== 'directory' ? (
              <div className="flex items-center gap-2 text-sm min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setSection('directory');
                    setSelectedBizId(null);
                  }}
                  className={`truncate cursor-pointer ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Admin Dashboard
                </button>
                <span className="text-slate-400" aria-hidden="true">/</span>
                <span className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {selectedBiz
                    ? selectedBiz.name
                    : section === 'stand_requests'
                      ? 'QR Stand Requests'
                      : section === 'ai_usage'
                        ? 'AI Usage & Costs'
                        : section === 'ai_eval'
                          ? 'AI Quality & Eval'
                          : section === 'weekly_reports'
                            ? 'Weekly Reports'
                            : section === 'clients'
                              ? 'Client Portal Access'
                              : section === 'activity'
                                ? 'Full Activity'
                                : 'Team Admins'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <h1
                  className={`font-display text-lg font-bold tracking-tight hidden sm:block shrink-0 ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Admin Dashboard
                </h1>
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    aria-label="Search business, slug, or client email"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search business, slug, or client email..."
                    className={`w-full h-9 pl-9 pr-3 rounded-xl border text-xs focus:outline-none ${
                      isDark
                        ? 'bg-[#181C2C] border-[#262B3D] text-white placeholder:text-slate-500 focus:border-indigo-500'
                        : 'bg-slate-50 border-slate-200/80 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-300'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {!selectedBiz && section === 'directory' && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setSortBy((prev) =>
                      prev === 'scans' ? 'name' : prev === 'name' ? 'redirects' : 'scans',
                    )
                  }
                  className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    isDark
                      ? 'text-slate-300 hover:text-white hover:bg-[#1C2030]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>
                    Sort: {sortBy === 'scans' ? 'Scans' : sortBy === 'name' ? 'Name' : 'Redirects'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter((prev) =>
                      prev === 'all' ? 'active' : prev === 'active' ? 'paused' : 'all',
                    )
                  }
                  className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    isDark
                      ? 'text-slate-300 hover:text-white hover:bg-[#1C2030]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span className="capitalize">Filter: {statusFilter}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleAdminTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`p-2 rounded-xl border cursor-pointer transition-colors ${
                isDark
                  ? 'border-[#262B3D] bg-[#181C2C] text-amber-300 hover:bg-[#1F2438]'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setSection('stand_requests');
                setSelectedBizId(null);
              }}
              title="QR Stand Requests"
              aria-label="View QR stand requests"
              className={`relative p-2 rounded-xl border cursor-pointer transition-colors ${
                isDark
                  ? 'border-[#262B3D] bg-[#181C2C] text-slate-300 hover:bg-[#1F2438]'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bell className="w-4 h-4" />
              {pendingStandRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {pendingStandRequestsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenNewBusiness}
              className="px-3.5 py-2 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Business</span>
            </button>
          </div>
        </header>

        <main className="admin-embedded-stage flex-1 p-4 sm:p-7 max-w-[1440px] w-full mx-auto space-y-6">
          {/* Selected Business Management Workspace */}
          {selectedBiz ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedBizId(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    <span>Back to All Businesses</span>
                  </button>
                  <span className="text-xs font-medium text-slate-500 hidden sm:inline truncate">
                    Managing <strong className="text-slate-800">{selectedBiz.name}</strong>
                  </span>
                </div>

                <div className="w-full overflow-x-auto pb-1">
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-200/75 rounded-xl min-w-max">
                    {(
                      [
                        { id: 'access', label: 'Client Access & Features', icon: UserCheck },
                        { id: 'seo_ai', label: 'SEO & Writing Library', icon: Sparkles },
                        { id: 'overview', label: 'Analytics', icon: Activity },
                        { id: 'full_activity', label: 'Full Activity', icon: ListFilter },
                        { id: 'stands', label: 'QR Stands', icon: Layers },
                        { id: 'gbp_reply', label: 'GBP Auto Reply', icon: Bot },
                        { id: 'weekly', label: 'Weekly Reports', icon: FileBarChart2 },
                        { id: 'templates', label: 'Templates', icon: LayoutGrid },
                        { id: 'qr', label: 'QR Studio', icon: QrCode },
                        { id: 'questions', label: 'Questions', icon: SlidersHorizontal },
                        { id: 'branding', label: 'Branding', icon: Palette },
                        { id: 'preview', label: 'Preview', icon: Eye },
                      ] as const
                    ).map((t) => {
                      const active = detailTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setDetailTab(t.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                            active
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {detailTab === 'access' && (
                <form
                  onSubmit={handleSaveGovernance}
                  noValidate
                  className="liquid-glass rounded-2xl p-6 sm:p-8 space-y-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">
                        Client Portal Assignment &amp; Feature Governance
                      </h2>
                      <p className="text-sm text-slate-600 mt-1">
                        Assign {selectedBiz.name} to a client&apos;s Google email and control what they can see or edit in /portal.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={isSavingGovernance}
                      className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      {isSavingGovernance && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>Save Permissions</span>
                    </button>
                  </div>

                  {governanceError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2.5">
                      <p>{governanceError}</p>
                      {(governanceError.includes('firestore.rules') ||
                        governanceError.toLowerCase().includes('permission')) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href="https://raw.githubusercontent.com/sagarbiswal10/ReviewFlow/main/firestore.rules"
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
                          >
                            1. Open Raw firestore.rules (Ctrl+A → Copy)
                          </a>
                          <a
                            href="https://console.firebase.google.com/project/review-generator-1a999/firestore/rules"
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-white border border-red-300 hover:bg-red-100 text-red-800 text-xs font-semibold"
                          >
                            2. Open Firebase Console Rules (Paste &amp; Publish)
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                  {governanceNotice && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {governanceNotice}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <label htmlFor="admin-client-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Assigned Business Client Email
                      </label>
                      <input
                        id="admin-client-email"
                        type="email"
                        value={clientEmailInput}
                        onChange={(e) => setClientEmailInput(e.target.value)}
                        placeholder="owner@business.com"
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        When this client signs in with Google, /portal automatically loads only this business.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="admin-client-access-level" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Client Portal Access Level
                      </label>
                      <select
                        id="admin-client-access-level"
                        value={accessLevelInput}
                        onChange={(e) =>
                          setAccessLevelInput(e.target.value as ClientAccessLevel)
                        }
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                      >
                        <option value="read_only">
                          Read-Only (View QR, Download PNG/PDF, View Features &amp; Stats)
                        </option>
                        <option value="qr_and_questions">
                          QR + Question Editor (Can customize QR &amp; edit form questions)
                        </option>
                        <option value="full">
                          Full Self-Service (QR, Questions, Branding &amp; Google Link)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="admin-qr-stand-limit" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Active QR Stand Limit (Default: 4)
                      </label>
                      <input
                        id="admin-qr-stand-limit"
                        type="number"
                        min={1}
                        max={100}
                        value={qrStandLimitInput}
                        onChange={(e) => setQrStandLimitInput(Number(e.target.value) || 4)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-mono font-semibold"
                      />
                      <p className="mt-1.5 text-xs text-slate-500">
                        Strictly enforced by backend API &amp; Firestore Security Rules.
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-5">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-2">
                        Plan Permissions (In-Person Payment Activated — Zero Online Checkout)
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setPackageTierInput('standard');
                            setReviewFlowModeInput('ai_drafted_instant');
                            setAllowClientFlowModeSwitchInput(false);
                          }}
                          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                            packageTierInput === 'standard'
                              ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              ₹3,000 Plan · Standard
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              English Only
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                            English AI-drafted reviews only (at least 5+ ready drafts tailored to business name, optional owner, address &amp; English SEO keywords) → Direct post to Google.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPackageTierInput('standard_plus');
                            setReviewFlowModeInput('ai_drafted_instant');
                          }}
                          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                            packageTierInput === 'standard_plus'
                              ? 'border-teal-700 bg-teal-50/70 ring-1 ring-teal-700'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              ₹4,000 Plan · Standard Plus
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                              All 4 Languages
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                            English, Hindi, Marathi &amp; Hinglish AI-drafted reviews (at least 5+ ready drafts per language using contextual SEO) → Direct post to Google.
                          </p>
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <label className="block text-xs font-medium text-slate-700">
                        Active Customer QR Experience Mode
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setReviewFlowModeInput('ai_drafted_instant')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            reviewFlowModeInput === 'ai_drafted_instant'
                              ? 'border-teal-700 bg-teal-50/70 ring-1 ring-teal-700'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900">
                            1. Ready AI-Drafted Reviews (5+ Options → Google)
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {packageTierInput === 'standard'
                              ? 'Customers scan QR → pick/edit from 5+ English AI drafts → directly post to Google.'
                              : 'Customers scan QR → pick English / Hindi / Marathi / Hinglish → 5+ AI drafts → post to Google.'}
                          </p>
                        </button>

                        <button
                          type="button"
                          disabled={packageTierInput === 'standard'}
                          onClick={() => setReviewFlowModeInput('guided_questions')}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            reviewFlowModeInput === 'guided_questions'
                              ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900">
                            2. Guided Questions Mode (Questions → AI Draft)
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {packageTierInput === 'standard'
                              ? 'Available on ₹4,000 Standard Plus plan only.'
                              : 'Customers answer quick store feedback questions first, then generate a custom review.'}
                          </p>
                        </button>
                      </div>

                      <label
                        className={`p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 ${
                          packageTierInput === 'standard' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            Allow Business Client to Switch Mode (AI Drafts ↔ Questions)
                          </p>
                          <p className="text-[11px] text-slate-600">
                            {packageTierInput === 'standard'
                              ? 'Disabled on ₹3,000 Standard Plan (locked to English Ready AI Drafts only).'
                              : 'When enabled, the client can switch their QR scan experience between 5+ Ready AI Drafts and Questions mode in their Client Portal.'}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          disabled={packageTierInput === 'standard'}
                          checked={packageTierInput === 'standard' ? false : allowClientFlowModeSwitchInput}
                          onChange={(e) => setAllowClientFlowModeSwitchInput(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-700 shrink-0 disabled:cursor-not-allowed"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Enabled Features for This Business
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        {
                          key: 'formTemplates' as const,
                          title: 'Customer Form Templates',
                          desc: 'Allow switching and previewing feedback form UI templates in the client portal.',
                        },
                        {
                          key: 'customQuestions' as const,
                          title: 'Custom Question Builder',
                          desc: 'Allow tailored question configuration in the client portal.',
                        },
                        {
                          key: 'qrStudio' as const,
                          title: 'QR Studio & Styling',
                          desc: 'Allow customizing QR colors, logo overlay, pause/resume status, and token rotation.',
                        },
                        {
                          key: 'brandingSettings' as const,
                          title: 'Branding, Profile & Google Link',
                          desc: 'Allow editing business details, brand colors, SEO keywords, and Google review URL.',
                        },
                        {
                          key: 'aiReviewDrafts' as const,
                          title: 'AI Review Drafts',
                          desc: 'Allow walk-in guests to generate Short, Detailed, and Professional drafts.',
                        },
                        {
                          key: 'pdfPosterExport' as const,
                          title: 'Printable A4 PDF Posters',
                          desc: 'Show one-click print-ready PDF tabletop poster export.',
                        },
                        {
                          key: 'analyticsView' as const,
                          title: 'Client Analytics View',
                          desc: 'Display live scan, draft, and Google redirect counts in /portal.',
                        },
                        {
                          key: 'inStoreQrStands' as const,
                          title: 'In-Store QR Stand Management',
                          desc: 'Enable multi-stand QR provisioning & per-stand conversion tracking.',
                        },
                        {
                          key: 'gbpAutoReply' as const,
                          title: 'Google Business Profile AI Auto Reply',
                          desc: 'Enable GBP OAuth sync, rating-based rules, and AI reply queue.',
                        },
                        {
                          key: 'weeklyReports' as const,
                          title: 'Weekly Business Reports (Mon–Sun)',
                          desc: 'Enable automated weekly summaries, PDF downloads, and contact dispatch.',
                        },
                      ].map((feat) => (
                        <label
                          key={feat.key}
                          className="p-4 rounded-xl border border-slate-200 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{feat.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{feat.desc}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(featuresInput[feat.key])}
                            onChange={(e) =>
                              setFeaturesInput((prev) => ({
                                ...prev,
                                [feat.key]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 mt-1 rounded border-slate-300 text-teal-700"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </form>
              )}

              {detailTab === 'overview' && (
                <OverviewTab
                  business={selectedBiz}
                  events={events}
                  onNavigateTab={(t) => {
                    if (t === 'full_activity') setDetailTab('full_activity');
                    else if (t === 'qr') setDetailTab('qr');
                    else if (t === 'questions') setDetailTab('questions');
                    else if (t === 'branding') setDetailTab('branding');
                    else if (t === 'preview') setDetailTab('preview');
                  }}
                />
              )}
              {detailTab === 'full_activity' && (
                <FullActivityPage
                  title={`${selectedBiz.name} · Full Activity`}
                  subtitle="All AI drafted reviews, generated draft text, Google redirects, and QR scan events"
                  events={events.filter((ev) => ev.businessId === selectedBiz.id)}
                  reviewDrafts={selectedBizDrafts}
                  isDark={false}
                  initialPeriod="all"
                  onBack={() => setDetailTab('overview')}
                  backLabel="Back to Analytics"
                />
              )}
              {detailTab === 'stands' && (
                <QrStandsTab
                  business={selectedBiz}
                  userUid={user.uid}
                  userEmail={user.email || ''}
                  isAdmin
                  events={events}
                  canEdit
                />
              )}
              {detailTab === 'gbp_reply' && (
                <GbpAutoReplyTab
                  business={selectedBiz}
                  userUid={user.uid}
                  userEmail={user.email || ''}
                  isAdmin
                  canEdit
                  allowOAuthConnection
                />
              )}
              {detailTab === 'weekly' && (
                <WeeklyReportsTab
                  business={selectedBiz}
                  userUid={user.uid}
                  userEmail={user.email || ''}
                  isAdmin
                  events={events}
                  canEdit
                />
              )}
              {detailTab === 'templates' && (
                <TemplatesTab
                  business={selectedBiz}
                  isAdmin
                  canEdit
                  onOpenPreview={() => setDetailTab('preview')}
                />
              )}
              {detailTab === 'qr' && <QrStudioTab business={selectedBiz} isAdmin />}
              {detailTab === 'questions' && (
                <QuestionBuilderTab
                  business={selectedBiz}
                  isAdmin
                  onOpenPreview={() => setDetailTab('preview')}
                />
              )}
              {detailTab === 'seo_ai' && (
                <BrandingTab
                  business={selectedBiz}
                  isAdmin
                  sectionMode="seo_library"
                  onDeleted={() => setSelectedBizId(null)}
                />
              )}
              {detailTab === 'branding' && (
                <BrandingTab
                  business={selectedBiz}
                  isAdmin
                  onDeleted={() => setSelectedBizId(null)}
                />
              )}
              {detailTab === 'preview' && previewProfile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setDetailTab('access')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer shadow-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Manage</span>
                    </button>
                    <span className="text-xs font-medium text-slate-500">
                      Customer Form Preview · {selectedBiz.name}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                    <CustomerReviewFlow
                      profile={previewProfile}
                      isPreview
                      onExit={() => setDetailTab('access')}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : section === 'directory' ? (
            <div className="space-y-6">
              {/* Row 1: 4 Crisp KPI Stat Cards (Screenshot 3 Admin Dashboard Style) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
                {[
                  {
                    label: 'Total Businesses',
                    value: aggregateStats.totalBusinesses,
                    badge: `${aggregateStats.activeQrCount} Active QR`,
                    positive: true,
                    icon: Building2,
                    onClick: () => setSection('clients'),
                  },
                  {
                    label: 'Platform QR Scans',
                    value: aggregateStats.totalScans,
                    badge: `${platformConversionRate}% Conv.`,
                    positive: platformConversionRate >= 0,
                    icon: QrCode,
                    onClick: () => directoryTableRef.current?.scrollIntoView({ behavior: 'smooth' }),
                  },
                  {
                    label: 'AI Drafts Generated',
                    value: aggregateStats.totalDrafts,
                    badge: `${globalAiLogs.length} Calls`,
                    positive: true,
                    icon: Sparkles,
                    onClick: () => setSection('ai_usage'),
                  },
                  {
                    label: 'Google Redirects',
                    value: aggregateStats.totalRedirects,
                    badge:
                      pendingStandRequestsCount > 0
                        ? `${pendingStandRequestsCount} Stand Req`
                        : 'Live Sync',
                    positive: pendingStandRequestsCount === 0,
                    icon: TrendingUp,
                    onClick: () =>
                      pendingStandRequestsCount > 0
                        ? setSection('stand_requests')
                        : setSection('activity'),
                  },
                ].map((kpi) => {
                  const KpiIcon = kpi.icon;
                  return (
                    <button
                      key={kpi.label}
                      type="button"
                      onClick={kpi.onClick}
                      className={`text-left rounded-2xl p-5 border transition-colors cursor-pointer ${
                        isDark
                          ? 'bg-[#151824] border-[#262B3D] hover:border-indigo-500/50'
                          : 'bg-white border-slate-200/80 shadow-xs hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`text-xs font-medium ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          {kpi.label}
                        </span>
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            isDark ? 'bg-indigo-500/15 text-indigo-300' : 'bg-[#EEF2FF] text-[#4F46E5]'
                          }`}
                        >
                          <KpiIcon className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`font-display text-2xl sm:text-3xl font-bold tabular-nums tracking-tight ${
                            isDark ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {kpi.value}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                            kpi.positive
                              ? isDark
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-emerald-50 text-emerald-700'
                              : isDark
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {kpi.badge}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Row 2: 8-Col Smooth Dual-Curve Velocity Chart + 4-Col Top Businesses */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* 8-Col Live Interactive Scan Velocity Dual Curve Chart */}
                <div
                  className={`lg:col-span-8 rounded-2xl p-5 sm:p-6 border flex flex-col justify-between ${
                    isDark ? 'bg-[#151824] border-[#262B3D]' : 'bg-white border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2
                          className={`font-display text-base font-bold ${
                            isDark ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          Scan Velocity
                        </h2>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isDark
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Live</span>
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Hover or tap points to inspect QR scans vs Google review redirects
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Business filter */}
                      <select
                        aria-label="Filter Scan Velocity by business"
                        value={velocityBizId}
                        onChange={(e) => {
                          setVelocityBizId(e.target.value);
                          setActiveVelocityIdx(null);
                        }}
                        className={`text-[11px] font-medium rounded-lg px-2 py-1 border cursor-pointer max-w-[140px] truncate ${
                          isDark
                            ? 'bg-[#0F121C] border-[#262B3D] text-slate-200'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="all">All Locations</option>
                        {businesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>

                      {/* Window selector */}
                      <div
                        className={`inline-flex items-center p-0.5 rounded-lg border text-[11px] font-semibold ${
                          isDark ? 'bg-[#0F121C] border-[#262B3D]' : 'bg-slate-100 border-slate-200/80'
                        }`}
                      >
                        {([5, 7, 14] as const).map((daysOpt) => (
                          <button
                            key={daysOpt}
                            type="button"
                            onClick={() => {
                              setVelocityRangeDays(daysOpt);
                              setActiveVelocityIdx(null);
                            }}
                            className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                              velocityRangeDays === daysOpt
                                ? isDark
                                  ? 'bg-[#252B42] text-white'
                                  : 'bg-white text-slate-900 shadow-xs'
                                : isDark
                                  ? 'text-slate-400 hover:text-white'
                                  : 'text-slate-500 hover:text-slate-900'
                            }`}
                          >
                            {daysOpt}D
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSection('activity');
                          setSelectedBizId(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                          isDark
                            ? 'bg-[#4F46E5]/20 text-indigo-200 hover:bg-[#4F46E5]/35 border border-[#4F46E5]/40'
                            : 'bg-indigo-50 text-[#4F46E5] hover:bg-indigo-100 border border-indigo-200/80'
                        }`}
                      >
                        <span>See Full Activity</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Interactive Line Toggles + Window Totals */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (showScansLine && !showRedirectsLine) {
                            setShowRedirectsLine(true);
                          } else {
                            setShowScansLine((prev) => !prev);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          showScansLine
                            ? isDark
                              ? 'bg-[#4F46E5]/15 border-[#4F46E5]/40 text-indigo-200'
                              : 'bg-indigo-50/90 border-indigo-200 text-indigo-900'
                            : isDark
                              ? 'bg-transparent border-[#262B3D] text-slate-500 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-400 opacity-65'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#4F46E5]" />
                        <span>QR Scans</span>
                        <span className="font-mono tabular-nums font-bold">
                          {velocitySeries.reduce((s, d) => s + d.scans, 0)}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (showRedirectsLine && !showScansLine) {
                            setShowScansLine(true);
                          } else {
                            setShowRedirectsLine((prev) => !prev);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          showRedirectsLine
                            ? isDark
                              ? 'bg-[#EC4899]/15 border-[#EC4899]/40 text-pink-200'
                              : 'bg-pink-50/90 border-pink-200 text-pink-900'
                            : isDark
                              ? 'bg-transparent border-[#262B3D] text-slate-500 opacity-60'
                              : 'bg-slate-50 border-slate-200 text-slate-400 opacity-65'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#EC4899]" />
                        <span>Google Redirects</span>
                        <span className="font-mono tabular-nums font-bold">
                          {velocitySeries.reduce((s, d) => s + d.redirects, 0)}
                        </span>
                      </button>
                    </div>

                    {(() => {
                      const wScans = velocitySeries.reduce((s, d) => s + d.scans, 0);
                      const wRedirs = velocitySeries.reduce((s, d) => s + d.redirects, 0);
                      const wConv = wScans > 0 ? Math.min(100, Math.round((wRedirs / wScans) * 100)) : 0;
                      return (
                        <span className={`text-[11px] font-mono tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {velocityRangeDays}D Rate: <strong className={isDark ? 'text-white' : 'text-slate-800'}>{wConv}%</strong>
                        </span>
                      );
                    })()}
                  </div>

                  {(() => {
                    const pts = velocitySeries;
                    const W = 600;
                    const H = 196;
                    const padLeft = 34;
                    const padRight = 18;
                    const padTop = 22;
                    const padBottom = 18;
                    const usableW = W - padLeft - padRight;
                    const usableH = H - padTop - padBottom;
                    const safeMax = Math.max(1, maxVelocityVal);

                    const toCoords = (vals: number[]) =>
                      vals.map((v, i) => ({
                        x: padLeft + (pts.length > 1 ? (i / (pts.length - 1)) * usableW : usableW / 2),
                        y: padTop + usableH - (v / safeMax) * usableH,
                        v,
                      }));

                    const buildSmoothPath = (coords: { x: number; y: number }[]) => {
                      if (coords.length === 0) return '';
                      if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
                      let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
                      for (let i = 0; i < coords.length - 1; i += 1) {
                        const p0 = coords[i];
                        const p1 = coords[i + 1];
                        const cx = ((p0.x + p1.x) / 2).toFixed(1);
                        d += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
                      }
                      return d;
                    };

                    const scanCoords = toCoords(pts.map((p) => p.scans));
                    const redirCoords = toCoords(pts.map((p) => p.redirects));
                    const scanPath = buildSmoothPath(scanCoords);
                    const scanAreaPath = `${scanPath} L ${scanCoords[scanCoords.length - 1].x.toFixed(1)} ${(H - padBottom).toFixed(1)} L ${scanCoords[0].x.toFixed(1)} ${(H - padBottom).toFixed(1)} Z`;
                    const redirPath = buildSmoothPath(redirCoords);
                    const redirAreaPath = `${redirPath} L ${redirCoords[redirCoords.length - 1].x.toFixed(1)} ${(H - padBottom).toFixed(1)} L ${redirCoords[0].x.toFixed(1)} ${(H - padBottom).toFixed(1)} Z`;

                    const peakIdx = pts.reduce((best, cur, idx) => {
                      const curScore = showScansLine ? cur.scans : cur.redirects;
                      const bestScore = showScansLine ? pts[best].scans : pts[best].redirects;
                      return curScore > bestScore ? idx : best;
                    }, 0);
                    const inspectedIdx =
                      activeVelocityIdx !== null && activeVelocityIdx >= 0 && activeVelocityIdx < pts.length
                        ? activeVelocityIdx
                        : peakIdx;
                    const inspectedPoint = pts[inspectedIdx];
                    const inspectedX = scanCoords[inspectedIdx]?.x ?? padLeft;
                    const tooltipLeftPct = Math.min(82, Math.max(18, (inspectedX / W) * 100));

                    return (
                      <div className="space-y-2" onMouseLeave={() => setActiveVelocityIdx(null)}>
                        <div className="relative w-full">
                          {/* Live Floating Inspection Tooltip */}
                          {inspectedPoint && (
                            <div
                              style={{ left: `${tooltipLeftPct.toFixed(1)}%` }}
                              className={`pointer-events-none absolute -top-1 -translate-x-1/2 z-10 rounded-xl px-3 py-1.5 shadow-lg border text-[11px] whitespace-nowrap transition-all duration-150 ${
                                isDark
                                  ? 'bg-[#1D2235]/95 border-[#323A56] text-white'
                                  : 'bg-slate-900/95 border-slate-700 text-white'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-slate-300">
                                  {inspectedPoint.fullDate}
                                </span>
                                {showScansLine && (
                                  <span className="inline-flex items-center gap-1 font-mono tabular-nums font-bold text-indigo-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#4F46E5]" />
                                    {inspectedPoint.scans} scans
                                  </span>
                                )}
                                {showRedirectsLine && (
                                  <span className="inline-flex items-center gap-1 font-mono tabular-nums font-bold text-pink-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899]" />
                                    {inspectedPoint.redirects} redirects
                                  </span>
                                )}
                                <span className="font-mono tabular-nums text-emerald-300">
                                  {inspectedPoint.conversionPct}%
                                </span>
                              </div>
                            </div>
                          )}

                          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-52 overflow-visible select-none">
                            <defs>
                              <linearGradient id="rfAdminScanFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#4F46E5" stopOpacity={isDark ? '0.32' : '0.18'} />
                                <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                              </linearGradient>
                              <linearGradient id="rfAdminRedirFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#EC4899" stopOpacity={isDark ? '0.26' : '0.16'} />
                                <stop offset="100%" stopColor="#EC4899" stopOpacity="0" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal Grid + Y-axis scale labels */}
                            {[0, 0.5, 1].map((frac) => {
                              const gy = padTop + usableH * (1 - frac);
                              const tickVal = Math.round(safeMax * frac);
                              return (
                                <g key={frac}>
                                  <line
                                    x1={padLeft}
                                    y1={gy}
                                    x2={W - padRight}
                                    y2={gy}
                                    stroke={isDark ? '#262B3D' : '#F1F5F9'}
                                    strokeDasharray={frac === 0 ? undefined : '4 4'}
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={padLeft - 6}
                                    y={gy + 3}
                                    textAnchor="end"
                                    fontSize="9"
                                    fill={isDark ? '#64748B' : '#94A3B8'}
                                  >
                                    {tickVal}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Vertical crosshair line on inspected day */}
                            <line
                              x1={inspectedX}
                              y1={padTop}
                              x2={inspectedX}
                              y2={H - padBottom}
                              stroke={isDark ? '#475569' : '#CBD5E1'}
                              strokeDasharray="3 3"
                              strokeWidth="1.2"
                            />

                            {showScansLine && (
                              <>
                                <path d={scanAreaPath} fill="url(#rfAdminScanFill)" />
                                <path
                                  d={scanPath}
                                  fill="none"
                                  stroke="#4F46E5"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                />
                              </>
                            )}

                            {showRedirectsLine && (
                              <>
                                <path d={redirAreaPath} fill="url(#rfAdminRedirFill)" />
                                <path
                                  d={redirPath}
                                  fill="none"
                                  stroke="#EC4899"
                                  strokeWidth="2.75"
                                  strokeLinecap="round"
                                />
                              </>
                            )}

                            {showScansLine &&
                              scanCoords.map((c, idx) => {
                                const isActive = idx === inspectedIdx;
                                return (
                                  <circle
                                    key={`s-${pts[idx].key}`}
                                    cx={c.x}
                                    cy={c.y}
                                    r={isActive ? 5.5 : 3.2}
                                    fill={isActive ? '#FFFFFF' : '#4F46E5'}
                                    stroke="#4F46E5"
                                    strokeWidth={isActive ? 3 : 0}
                                  />
                                );
                              })}

                            {showRedirectsLine &&
                              redirCoords.map((c, idx) => {
                                const isActive = idx === inspectedIdx;
                                return (
                                  <circle
                                    key={`r-${pts[idx].key}`}
                                    cx={c.x}
                                    cy={c.y}
                                    r={isActive ? 5.5 : 3.2}
                                    fill={isActive ? '#FFFFFF' : '#EC4899'}
                                    stroke="#EC4899"
                                    strokeWidth={isActive ? 3 : 0}
                                  />
                                );
                              })}

                            {/* Interactive column hit zones for smooth hover & touch */}
                            {pts.map((pt, idx) => {
                              const colW = pts.length > 1 ? usableW / (pts.length - 1) : usableW;
                              const cx = scanCoords[idx]?.x ?? padLeft;
                              return (
                                <rect
                                  key={`hit-${pt.key}`}
                                  x={Math.max(padLeft - 10, cx - colW / 2)}
                                  y={padTop - 8}
                                  width={colW}
                                  height={usableH + 16}
                                  fill="transparent"
                                  className="cursor-crosshair"
                                  onMouseEnter={() => setActiveVelocityIdx(idx)}
                                  onClick={() => setActiveVelocityIdx(idx)}
                                />
                              );
                            })}
                          </svg>
                        </div>

                        <div className="flex items-center justify-between pl-6 pr-2 gap-1 overflow-x-auto">
                          {pts.map((d, idx) => {
                            const isActive = idx === inspectedIdx;
                            return (
                              <button
                                key={d.key}
                                type="button"
                                onMouseEnter={() => setActiveVelocityIdx(idx)}
                                onClick={() => setActiveVelocityIdx(idx)}
                                className={`text-center px-1.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                                  isActive
                                    ? isDark
                                      ? 'bg-[#252B42]/70'
                                      : 'bg-indigo-50/80'
                                    : ''
                                }`}
                              >
                                <p
                                  className={`text-[10px] sm:text-[11px] font-medium ${
                                    isActive
                                      ? isDark
                                        ? 'text-white font-semibold'
                                        : 'text-indigo-700 font-semibold'
                                      : isDark
                                        ? 'text-slate-400'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {d.label}
                                </p>
                                <p
                                  className={`text-[10px] tabular-nums ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                >
                                  {d.scans}/{d.redirects}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 4-Col Top Businesses List */}
                <div
                  className={`lg:col-span-4 rounded-2xl p-5 sm:p-6 border flex flex-col justify-between ${
                    isDark ? 'bg-[#151824] border-[#262B3D]' : 'bg-white border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h2
                      className={`font-display text-base font-bold ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Top Businesses
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setDirectoryView('table');
                        directoryTableRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`text-xs font-semibold cursor-pointer ${
                        isDark ? 'text-indigo-300 hover:text-indigo-200' : 'text-[#4F46E5] hover:underline'
                      }`}
                    >
                      See all
                    </button>
                  </div>

                  {topBusinesses.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400">
                      No businesses yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topBusinesses.map((biz, idx) => {
                        const st = statsMap[biz.id];
                        return (
                          <button
                            key={biz.id}
                            type="button"
                            onClick={() => {
                              setSelectedBizId(biz.id);
                              setDetailTab('access');
                            }}
                            className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors text-left cursor-pointer ${
                              isDark
                                ? 'border-transparent hover:bg-[#1C2030]'
                                : 'border-transparent hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`w-5 text-xs font-bold tabular-nums shrink-0 ${
                                  isDark ? 'text-slate-500' : 'text-slate-400'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <BusinessLogo
                                src={biz.logoDataUrl}
                                name={biz.name}
                                primaryColor={biz.branding.primaryColor}
                                sizeClass="w-9 h-9 rounded-xl"
                              />
                              <div className="min-w-0">
                                <p
                                  className={`text-xs font-semibold truncate ${
                                    isDark ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  {biz.name}
                                </p>
                                <p
                                  className={`text-[11px] truncate ${
                                    isDark ? 'text-slate-400' : 'text-slate-500'
                                  }`}
                                >
                                  {biz.category}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p
                                className={`text-xs font-bold tabular-nums ${
                                  isDark ? 'text-white' : 'text-slate-900'
                                }`}
                              >
                                {st?.scans ?? 0} scans
                              </p>
                              <p
                                className={`text-[10px] tabular-nums ${
                                  isDark ? 'text-emerald-300' : 'text-emerald-600'
                                }`}
                              >
                                {st?.redirects ?? 0} posts
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: 7-Col Businesses List / Board + 5-Col Draft Tone Mix Donut */}
              <div ref={directoryTableRef} className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* 7-Col Businesses Directory */}
                <div
                  className={`xl:col-span-8 rounded-2xl border overflow-hidden ${
                    isDark ? 'bg-[#151824] border-[#262B3D]' : 'bg-white border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div
                    className={`px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3 ${
                      isDark ? 'border-[#262B3D]' : 'border-slate-100'
                    }`}
                  >
                    <div>
                      <h2
                        className={`font-display text-base font-bold ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        Businesses Directory
                      </h2>
                      <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Showing {filteredBusinesses.length} of {businesses.length} locations
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={`inline-flex items-center gap-1 p-1 rounded-xl ${
                          isDark ? 'bg-[#0F121C]' : 'bg-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setDirectoryView('table')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            directoryView === 'table' || directoryView === 'board'
                              ? directoryView === 'table'
                                ? isDark
                                  ? 'bg-[#252B42] text-white'
                                  : 'bg-white text-slate-900 shadow-xs'
                                : isDark
                                  ? 'text-slate-400 hover:text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              : ''
                          }`}
                        >
                          Table
                        </button>
                        <button
                          type="button"
                          onClick={() => setDirectoryView('board')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                            directoryView === 'board'
                              ? isDark
                                ? 'bg-[#252B42] text-white'
                                : 'bg-white text-slate-900 shadow-xs'
                              : isDark
                                ? 'text-slate-400 hover:text-white'
                                : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Board
                        </button>
                      </div>
                    </div>
                  </div>

                  {filteredBusinesses.length === 0 ? (
                    <div className="p-10 text-center space-y-3">
                      <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {businesses.length === 0
                          ? 'No businesses registered yet'
                          : 'No businesses match your search filter'}
                      </p>
                      {businesses.length === 0 && (
                        <button
                          type="button"
                          onClick={onOpenNewBusiness}
                          className="px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Create First Business
                        </button>
                      )}
                    </div>
                  ) : directoryView === 'board' ? (
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {boardColumns.map((col) => (
                        <div key={col.id} className="space-y-2.5">
                          <div className="flex items-center justify-between px-1">
                            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {col.title}
                            </h3>
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold ${isDark ? 'bg-[#1C2030] text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                              {col.items.length}
                            </span>
                          </div>
                          {col.items.length === 0 ? (
                            <div className={`rounded-xl border border-dashed p-4 text-center text-xs ${isDark ? 'border-[#262B3D] text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                              No businesses in this tier
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {col.items.map((biz) => {
                                const st = statsMap[biz.id];
                                return (
                                  <button
                                    key={biz.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedBizId(biz.id);
                                      setDetailTab('access');
                                    }}
                                    className={`w-full text-left rounded-xl p-3.5 border transition-colors cursor-pointer space-y-2 ${
                                      isDark
                                        ? 'bg-[#1C2030] border-[#262B3D] hover:border-indigo-500/50'
                                        : 'bg-slate-50/70 border-slate-200/80 hover:border-indigo-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <BusinessLogo
                                          src={biz.logoDataUrl}
                                          name={biz.name}
                                          primaryColor={biz.branding.primaryColor}
                                          sizeClass="w-8 h-8 rounded-lg"
                                        />
                                        <div className="min-w-0">
                                          <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {biz.name}
                                          </p>
                                          <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {biz.clientEmail || 'Unassigned'}
                                          </p>
                                        </div>
                                      </div>
                                      <span className={`text-[11px] font-mono tabular-nums shrink-0 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>
                                        {st?.scans ?? 0} scans
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr
                            className={`border-b text-[11px] font-semibold uppercase tracking-wider ${
                              isDark
                                ? 'border-[#262B3D] bg-[#1A1E2E] text-slate-400'
                                : 'border-slate-100 bg-slate-50/80 text-slate-500'
                            }`}
                          >
                            <th className="py-3 pl-4 pr-2.5 whitespace-nowrap">Business</th>
                            <th className="py-3 px-2.5 whitespace-nowrap">Client Access</th>
                            <th className="py-3 px-2.5 whitespace-nowrap">QR Status</th>
                            <th className="py-3 px-2.5 text-right whitespace-nowrap">Scans / Posts</th>
                            <th className="py-3 pl-2.5 pr-4 text-right whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y text-xs ${isDark ? 'divide-[#262B3D]' : 'divide-slate-100'}`}>
                          {filteredBusinesses.map((biz) => {
                            const st = statsMap[biz.id];
                            return (
                              <tr
                                key={biz.id}
                                className={isDark ? 'hover:bg-[#1C2030]/70' : 'hover:bg-slate-50/80'}
                              >
                                <td className="py-3.5 pl-4 pr-2.5 max-w-[175px] xl:max-w-[200px]">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <BusinessLogo
                                      src={biz.logoDataUrl}
                                      name={biz.name}
                                      primaryColor={biz.branding.primaryColor}
                                      sizeClass="w-8 h-8 shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        {biz.name}
                                      </p>
                                      <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {biz.category} · <span className="font-mono">/review/{biz.slug}</span>
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-2.5 max-w-[145px] xl:max-w-[170px]">
                                  <p
                                    title={biz.clientEmail || 'Unassigned'}
                                    className={`font-mono text-[11px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                                  >
                                    {biz.clientEmail || 'Unassigned'}
                                  </p>
                                  <p className={`text-[10px] truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {biz.clientAccessLevel === 'read_only'
                                      ? 'Read-Only'
                                      : biz.clientAccessLevel === 'qr_and_questions'
                                        ? 'QR & Questions'
                                        : 'Full Self-Service'}
                                  </p>
                                </td>
                                <td className="py-3.5 px-2.5 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      biz.qrConfig.isActive
                                        ? isDark
                                          ? 'bg-emerald-500/15 text-emerald-300'
                                          : 'bg-emerald-50 text-emerald-700'
                                        : isDark
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {biz.qrConfig.isActive ? (
                                      <>
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Active</span>
                                      </>
                                    ) : (
                                      <>
                                        <PauseCircle className="w-3 h-3" />
                                        <span>Paused</span>
                                      </>
                                    )}
                                  </span>
                                </td>
                                <td className={`py-3.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                                  {st?.scans ?? 0} <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>/</span> {st?.redirects ?? 0}
                                </td>
                                <td className="py-3.5 pl-2.5 pr-4 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedBizId(biz.id);
                                      setDetailTab('access');
                                    }}
                                    className={`px-3 py-1.5 rounded-xl font-semibold text-xs cursor-pointer whitespace-nowrap border transition-colors ${
                                      isDark
                                        ? 'border-[#2C334A] bg-[#1C2030] hover:bg-[#252B42] text-white'
                                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                                    }`}
                                  >
                                    Manage
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 5-Col Audience / Draft Tone Mix Donut Chart (Screenshot 3 Bottom Right) */}
                <div
                  className={`xl:col-span-4 rounded-2xl p-5 sm:p-6 border space-y-5 ${
                    isDark ? 'bg-[#151824] border-[#262B3D]' : 'bg-white border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2
                        className={`font-display text-base font-bold ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        Draft Tone Mix
                      </h2>
                      <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        AI output style share
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        isDark ? 'bg-[#1C2030] text-indigo-300' : 'bg-[#EEF2FF] text-[#4F46E5]'
                      }`}
                    >
                      Live
                    </span>
                  </div>

                  {/* SVG Ring Donut Chart */}
                  <div className="flex items-center justify-center py-2">
                    <div className="relative w-44 h-44 flex items-center justify-center">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle
                          cx="60"
                          cy="60"
                          r="44"
                          fill="none"
                          stroke={isDark ? '#22273A' : '#F1F5F9'}
                          strokeWidth="14"
                        />
                        {(() => {
                          const C = 2 * Math.PI * 44;
                          let offset = 0;
                          const safeTotal = Math.max(1, toneMixStats.total);
                          return toneMixStats.items.map((item) => {
                            const frac = item.count / safeTotal;
                            const len = frac * C;
                            const dashArray = `${Math.max(0, len - 2)} ${C}`;
                            const dashOffset = -offset;
                            offset += len;
                            return (
                              <circle
                                key={item.key}
                                cx="60"
                                cy="60"
                                r="44"
                                fill="none"
                                stroke={item.color}
                                strokeWidth="14"
                                strokeDasharray={dashArray}
                                strokeDashoffset={dashOffset}
                                strokeLinecap="round"
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span
                          className={`font-display text-2xl font-bold tabular-nums ${
                            isDark ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {aggregateStats.totalDrafts}
                        </span>
                        <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          Total Drafts
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {toneMixStats.items.map((item) => (
                      <div key={item.key} className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                            {item.label}
                          </span>
                        </span>
                        <span
                          className={`font-semibold tabular-nums ${
                            isDark ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {item.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : section === 'stand_requests' ? (
            <div className="space-y-6">
              <div className="liquid-glass rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Additional QR Stand Approval Queue
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Approving a request atomically raises the business&apos;s maximum active QR stand limit in Firestore &amp; backend checks.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-bold tabular-nums">
                    {pendingStandRequestsCount} Pending
                  </span>
                </div>

                {requestBanner && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                    {requestBanner}
                  </div>
                )}

                {standRequests.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">
                    No QR stand expansion requests have been submitted yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {standRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">
                              {req.businessName}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-mono font-bold text-slate-700">
                              +{req.requestedAdditionalStands} stands (Current max {req.currentLimit})
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                req.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : req.status === 'rejected'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{req.reason}</p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Client: {req.clientEmail || 'Unassigned'} · Submitted{' '}
                            {formatTime(req.createdAt)}
                          </p>
                        </div>

                        {req.status === 'pending' ? (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <input
                              type="text"
                              value={requestNoteMap[req.id] || ''}
                              onChange={(e) =>
                                setRequestNoteMap((prev) => ({ ...prev, [req.id]: e.target.value }))
                              }
                              placeholder="Optional admin note..."
                              className="h-9 px-3 rounded-lg border border-slate-200 text-xs w-48"
                            />
                            <button
                              type="button"
                              disabled={processingReqId === req.id}
                              onClick={() => handleReviewStandRequest(req, 'approved')}
                              className="px-3.5 py-2 rounded-lg bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              Approve (+{req.requestedAdditionalStands})
                            </button>
                            <button
                              type="button"
                              disabled={processingReqId === req.id}
                              onClick={() => handleReviewStandRequest(req, 'rejected')}
                              className="px-3.5 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 text-right shrink-0">
                            Reviewed by <span className="font-mono">{req.reviewedByEmail || 'Admin'}</span>
                            {req.adminNote && <p className="text-[11px]">Note: {req.adminNote}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : section === 'ai_usage' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
                  <p className="text-xs font-medium text-slate-500">Total AI Requests</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aiGlobalSummary.totalRequests}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {aiGlobalSummary.successCount} succeeded · {aiGlobalSummary.failedCount} failed
                  </p>
                </div>
                <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
                  <p className="text-xs font-medium text-slate-500">Total Tokens Processed</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aiGlobalSummary.totalTokens.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Drafts + GBP auto replies</p>
                </div>
                <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
                  <p className="text-xs font-medium text-slate-500">Estimated Platform AI Cost</p>
                  <p className="mt-2 font-display text-3xl font-bold text-[#005c55] tabular-nums">
                    ${aiGlobalSummary.totalCostUsd.toFixed(4)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Recorded per Gemini generation</p>
                </div>
                <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
                  <p className="text-xs font-medium text-slate-500">Active AI Models</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aiGlobalSummary.models.length}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Tracked providers &amp; model IDs</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="liquid-glass rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Model Breakdown (Provider &amp; Model ID)
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <th className="py-2.5 px-4">Provider / Model</th>
                          <th className="py-2.5 px-4 text-right">Requests</th>
                          <th className="py-2.5 px-4 text-right">Tokens</th>
                          <th className="py-2.5 px-4 text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {aiGlobalSummary.models.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-500">
                              No AI generation telemetry recorded yet.
                            </td>
                          </tr>
                        ) : (
                          aiGlobalSummary.models.map((m) => (
                            <tr key={`${m.provider}-${m.modelName}`}>
                              <td className="py-2.5 px-4">
                                <span className="font-bold uppercase text-slate-600 mr-1.5">
                                  {m.provider}
                                </span>
                                <span className="font-mono text-slate-900">{m.modelName}</span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {m.success}/{m.count}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {m.tokens.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-[#005c55] tabular-nums">
                                ${m.costUsd.toFixed(5)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="liquid-glass rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Usage by Business Account
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <th className="py-2.5 px-4">Business</th>
                          <th className="py-2.5 px-4 text-right">AI Calls</th>
                          <th className="py-2.5 px-4 text-right">Tokens</th>
                          <th className="py-2.5 px-4 text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {aiGlobalSummary.businesses.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-500">
                              No per-business AI usage logged yet.
                            </td>
                          </tr>
                        ) : (
                          aiGlobalSummary.businesses.map((b) => (
                            <tr key={b.businessId}>
                              <td className="py-2.5 px-4 font-semibold text-slate-900">
                                {b.businessName}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {b.count}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {b.tokens.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-[#005c55] tabular-nums">
                                ${b.costUsd.toFixed(5)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : section === 'ai_eval' ? (
            <AiEvaluationDashboard
              evaluations={globalEvaluations}
              consentedExamples={globalConsentedExamples}
              businesses={businesses}
              adminUid={user.uid}
            />
          ) : section === 'weekly_reports' ? (
            <div className="space-y-6">
              <div className="liquid-glass rounded-2xl p-6 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-xl font-bold text-slate-900">
                        Weekly Business Reports (Monday–Sunday)
                      </h2>
                      {isMondayToday() && (
                        <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 text-xs font-bold">
                          Monday Weekly Cycle Ready
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      Generate and download automated Monday–Sunday executive PDF reports across all client businesses.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isBatchGeneratingReports || businesses.length === 0}
                      onClick={() => handleBatchGenerateWeeklyReports('current')}
                      className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#0f766e]" />
                      <span>Compile Current Week</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBatchGeneratingReports || businesses.length === 0}
                      onClick={() => handleBatchGenerateWeeklyReports('previous')}
                      className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      {isBatchGeneratingReports ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FileBarChart2 className="w-3.5 h-3.5" />
                      )}
                      <span>Run Monday Mon–Sun Batch</span>
                    </button>
                  </div>
                </div>

                {batchReportNotice && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                    {batchReportNotice}
                  </div>
                )}
              </div>

              <div className="liquid-glass rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Stored Business Weekly Snapshots ({globalReports.length})
                  </h3>
                </div>
                {globalReports.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No weekly reports generated yet. Use the batch actions above or open a business to generate its weekly snapshot.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <th className="py-3 px-6">Business</th>
                          <th className="py-3 px-4">Week Window</th>
                          <th className="py-3 px-4 text-right">Scans / Google</th>
                          <th className="py-3 px-4 text-right">GBP AI Replies</th>
                          <th className="py-3 px-4 text-right">Tokens / Cost</th>
                          <th className="py-3 px-6 text-right">Export</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {globalReports.map((rep) => (
                          <tr key={rep.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-6 font-semibold text-slate-900 whitespace-nowrap">
                              {rep.businessName}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                              {rep.weekStart} – {rep.weekEnd}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {rep.reviewGenMetrics.totalScans} / {rep.reviewGenMetrics.googleRedirects}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {rep.autoReplyMetrics.aiRepliesGenerated} ({rep.autoReplyMetrics.autoPublished} auto)
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {rep.aiUsageMetrics.totalTokens.toLocaleString()} · $
                              {rep.aiUsageMetrics.estimatedCostUsd.toFixed(4)}
                            </td>
                            <td className="py-3 px-6 text-right">
                              <button
                                type="button"
                                onClick={() => downloadWeeklyReportPdf(rep)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-800 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : section === 'clients' ? (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveClientAccess}
                className="liquid-glass rounded-2xl p-6 sm:p-8 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      Assign Customer Gmail for Client Portal
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Add a customer&apos;s Gmail address to any business so signing in with that account shows both the Landing Page and their scoped Client Portal.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingAssign || businesses.length === 0}
                    className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    {isSavingAssign ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    <span>Save Client Gmail Access</span>
                  </button>
                </div>

                {assignError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {assignError}
                  </div>
                )}
                {assignNotice && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{assignNotice}</span>
                  </div>
                )}

                {businesses.length === 0 ? (
                  <div className="py-6 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      Add a business first before assigning a customer Gmail address.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenNewBusiness}
                      className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Add First Business
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="assign-business-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Select Business
                      </label>
                      <select
                        id="assign-business-select"
                        value={assignBizId}
                        onChange={(e) => handleSelectAssignBusiness(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                      >
                        {businesses.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} (/review/{b.slug})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="assign-customer-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Customer Gmail ID
                      </label>
                      <input
                        id="assign-customer-email"
                        type="email"
                        required
                        value={assignEmail}
                        onChange={(e) => setAssignEmail(e.target.value)}
                        placeholder="customer@gmail.com"
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                      />
                    </div>

                    <div>
                      <label htmlFor="assign-access-tier" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Portal Access Tier
                      </label>
                      <select
                        id="assign-access-tier"
                        value={assignTier}
                        onChange={(e) => setAssignTier(e.target.value as ClientAccessLevel)}
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
                      >
                        <option value="full">Full Self-Service</option>
                        <option value="qr_and_questions">QR + Question Editor</option>
                        <option value="read_only">Read-Only (QR &amp; Stats)</option>
                      </select>
                    </div>
                  </div>
                )}
              </form>

              <div className="liquid-glass rounded-2xl overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Customer Gmail Access Directory
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {businesses.filter((b) => Boolean(b.clientEmail)).length} of {businesses.length} businesses linked to a customer Gmail
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      aria-label="Filter customer directory by business or Gmail"
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      placeholder="Filter by business or Gmail..."
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                    />
                  </div>
                </div>

                {filteredClientBusinesses.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No matching businesses found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-6">Business</th>
                          <th className="py-3 px-4">Customer Gmail</th>
                          <th className="py-3 px-4">Portal Tier</th>
                          <th className="py-3 px-4">QR Status</th>
                          <th className="py-3 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredClientBusinesses.map((biz) => (
                          <tr key={biz.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-6">
                              <div className="flex items-center gap-3">
                                <BusinessLogo
                                  src={biz.logoDataUrl}
                                  name={biz.name}
                                  primaryColor={biz.branding.primaryColor}
                                  sizeClass="w-8 h-8"
                                />
                                <div>
                                  <p className="font-semibold text-slate-900">{biz.name}</p>
                                  <p className="text-slate-500 font-mono">/review/{biz.slug}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-800">
                              {biz.clientEmail ? (
                                biz.clientEmail
                              ) : (
                                <span className="text-slate-400 font-sans">Unassigned</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                              {biz.clientAccessLevel === 'read_only'
                                ? 'Read-Only'
                                : biz.clientAccessLevel === 'qr_and_questions'
                                  ? 'QR & Questions'
                                  : 'Full Self-Service'}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-slate-800">
                              {biz.qrConfig.isActive ? 'Active' : 'Paused'}
                            </td>
                            <td className="py-3.5 px-6 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAssignBusiness(biz.id)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  Edit Gmail
                                </button>
                                {biz.clientEmail && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveClientAccess(biz)}
                                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 font-semibold text-red-700 cursor-pointer whitespace-nowrap shrink-0"
                                  >
                                    Remove Access
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBizId(biz.id);
                                    setDetailTab('access');
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  Features
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : section === 'activity' ? (
            <FullActivityPage
              title="Cross-Business Full Activity & AI Drafts"
              subtitle="All AI drafted reviews, Ready AI drafts, Google redirects, and QR scan activity across businesses"
              events={events}
              businessMap={bizNameMap}
              businessOptions={businesses.map((b) => ({ id: b.id, name: b.name }))}
              isDark={isDark}
              initialPeriod="7d"
              onBack={() => setSection('directory')}
              backLabel="Back to Admin Dashboard"
            />
          ) : (
            <div className="space-y-6 max-w-3xl">
              <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Business Management Access (By Gmail)
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {BOOTSTRAPPED_ADMIN_EMAIL ? (
                      <>
                        Primary owner account:{' '}
                        <span className="font-mono">{BOOTSTRAPPED_ADMIN_EMAIL}</span>.{' '}
                      </>
                    ) : null}
                    Add team Gmail addresses below so they automatically see Business Management when they sign in.
                  </p>
                </div>

                <form
                  onSubmit={handleAddAdminByEmail}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    type="email"
                    required
                    value={newAdminGmail}
                    onChange={(e) => setNewAdminGmail(e.target.value)}
                    placeholder="manager@gmail.com"
                    className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm"
                  />
                  <button
                    type="submit"
                    className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Grant Business Management Access
                  </button>
                </form>

                {adminError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-medium">
                    {adminError}
                  </p>
                )}
                {adminStatus && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-medium">
                    {adminStatus}
                  </p>
                )}

                <div className="divide-y divide-slate-100 border-t border-slate-200">
                  {adminEmails.length === 0 ? (
                    <p className="py-4 text-xs text-slate-500">
                      No additional Business Management Gmail accounts configured yet.
                    </p>
                  ) : (
                    adminEmails.map((adm) => {
                      const isSelf =
                        normalizeEmail(user.email || '') === normalizeEmail(adm.email);
                      return (
                        <div
                          key={adm.email}
                          className="py-3 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900 font-mono">{adm.email}</p>
                            <p className="text-slate-500">
                              Opens Business Management on sign-in
                            </p>
                          </div>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => revokeAdminByEmail(adm.email)}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                              aria-label="Revoke Gmail admin access"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="liquid-glass rounded-2xl p-6 sm:p-8 space-y-5">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    UID-Based Manager Grants (Legacy)
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    Optionally grant Business Management access directly by Firebase Auth UID.
                  </p>
                </div>

                <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={newAdminUid}
                    onChange={(e) => setNewAdminUid(e.target.value)}
                    placeholder="Firebase Auth UID"
                    className="h-10 px-3 rounded-lg border border-slate-200 font-mono text-xs"
                  />
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="manager@company.com"
                    className="h-10 px-3 rounded-lg border border-slate-200 text-xs"
                  />
                  <button
                    type="submit"
                    className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Grant by UID
                  </button>
                </form>

                <div className="divide-y divide-slate-100 border-t border-slate-200">
                  {admins.length === 0 ? (
                    <p className="py-4 text-xs text-slate-500">
                      No UID-based team admins configured beyond the primary owner account.
                    </p>
                  ) : (
                    admins.map((adm) => (
                      <div
                        key={adm.uid}
                        className="py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{adm.email}</p>
                          <p className="font-mono text-slate-500">{adm.uid}</p>
                        </div>
                        {adm.uid !== user.uid && (
                          <button
                            type="button"
                            onClick={() => revokeAdmin(adm.uid)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                            aria-label="Revoke access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
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

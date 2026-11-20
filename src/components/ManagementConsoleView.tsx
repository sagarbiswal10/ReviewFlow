import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Palette,
  PauseCircle,
  Plus,
  QrCode,
  Search,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AdminEmail,
  AdminUser,
  Business,
  BusinessStats,
  ClientAccessLevel,
  EnabledFeatures,
  PublicProfile,
  ReviewEvent,
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
  updateBusiness,
} from '../services/businessService';
import { BusinessLogo } from './BusinessLogo';
import { OverviewTab } from './OverviewTab';
import { QrStudioTab } from './QrStudioTab';
import { QuestionBuilderTab } from './QuestionBuilderTab';
import { BrandingTab } from './BrandingTab';
import { CustomerReviewFlow } from './CustomerReviewFlow';

type AdminSection = 'directory' | 'clients' | 'activity' | 'team';
type BusinessDetailTab =
  | 'access'
  | 'overview'
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

export function ManagementConsoleView({
  user,
  businesses,
  statsMap,
  events,
  onOpenNewBusiness,
  onSwitchToPortal,
  onSignOut,
}: ManagementConsoleViewProps) {
  const [section, setSection] = useState<AdminSection>('directory');
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<BusinessDetailTab>('access');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Client assignment & feature governance state for selected business
  const selectedBiz = useMemo(
    () => businesses.find((b) => b.id === selectedBizId) ?? null,
    [businesses, selectedBizId],
  );
  const [clientEmailInput, setClientEmailInput] = useState('');
  const [accessLevelInput, setAccessLevelInput] = useState<ClientAccessLevel>('full');
  const [featuresInput, setFeaturesInput] = useState<EnabledFeatures>({
    aiReviewDrafts: true,
    customQuestions: true,
    pdfPosterExport: true,
    analyticsView: true,
  });
  const [isSavingGovernance, setIsSavingGovernance] = useState(false);
  const [governanceNotice, setGovernanceNotice] = useState<string | null>(null);
  const [governanceError, setGovernanceError] = useState<string | null>(null);

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
    const unsubUids = subscribeToAdmins((items) => setAdmins(items));
    const unsubEmails = subscribeToAdminEmails((items) => setAdminEmails(items));
    return () => {
      unsubUids();
      unsubEmails();
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

  useEffect(() => {
    if (!selectedBiz) return;
    setClientEmailInput(selectedBiz.clientEmail || '');
    setAccessLevelInput(selectedBiz.clientAccessLevel || 'full');
    setFeaturesInput(selectedBiz.enabledFeatures);
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
    return businesses.filter((biz) => {
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
  }, [businesses, searchQuery, statusFilter]);

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

  const handleSaveGovernance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBiz) return;
    setIsSavingGovernance(true);
    setGovernanceError(null);
    setGovernanceNotice(null);
    try {
      await updateBusiness(
        selectedBiz,
        {
          clientEmail: normalizeEmail(clientEmailInput),
          clientAccessLevel: accessLevelInput,
          enabledFeatures: featuresInput,
        },
        { isAdmin: true },
      );
      setGovernanceNotice('Customer Gmail access and portal permissions saved.');
      setTimeout(() => setGovernanceNotice(null), 3000);
    } catch (err) {
      setGovernanceError(err instanceof Error ? err.message : 'Failed to update permissions.');
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
        slug: selectedBiz.slug,
        name: selectedBiz.name,
        category: selectedBiz.category,
        googleReviewUrl: selectedBiz.googleReviewUrl,
        logoDataUrl: selectedBiz.logoDataUrl,
        enabledFeatures: selectedBiz.enabledFeatures,
        branding: selectedBiz.branding,
        qrConfig: selectedBiz.qrConfig,
        questions: selectedBiz.questions,
        seoKeywords: selectedBiz.seoKeywords,
      }
    : null;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900">
          ReviewFlow
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <p className="text-[11px] font-semibold text-teal-800">Business Management</p>
        <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
          {businesses.length} {businesses.length === 1 ? 'business' : 'businesses'} managed
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <button
          type="button"
          onClick={() => {
            setSection('directory');
            setSelectedBizId(null);
            setMobileMenuOpen(false);
          }}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer ${
            section === 'directory'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span>All Businesses</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSection('clients');
            setSelectedBizId(null);
            setMobileMenuOpen(false);
          }}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer ${
            section === 'clients'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" />
          <span>Client Portal Access</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSection('activity');
            setSelectedBizId(null);
            setMobileMenuOpen(false);
          }}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer ${
            section === 'activity'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span>Global Activity</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSection('team');
            setSelectedBizId(null);
            setMobileMenuOpen(false);
          }}
          className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 whitespace-nowrap shrink-0 cursor-pointer ${
            section === 'team'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4 shrink-0" />
          <span>Team Admins</span>
        </button>
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-2.5">
        <button
          type="button"
          onClick={onSwitchToPortal}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>View Client Portal</span>
        </button>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">
            {user.displayName || 'Manager'}
          </p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 truncate">Business Management</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              {selectedBiz ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedBizId(null)}
                    className="text-slate-500 hover:text-slate-900 truncate cursor-pointer"
                  >
                    All Businesses
                  </button>
                  <span className="text-slate-300" aria-hidden="true">/</span>
                  <span className="font-semibold text-slate-900 truncate">{selectedBiz.name}</span>
                </>
              ) : (
                <span className="font-semibold text-slate-900 truncate">
                  {section === 'directory'
                    ? 'All Businesses'
                    : section === 'clients'
                      ? 'Client Portal Access'
                      : section === 'activity'
                        ? 'Global Activity'
                        : 'Team Admins'}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenNewBusiness}
            className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Business</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Selected Business Management Workspace */}
          {selectedBiz ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedBizId(null)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to All Businesses</span>
                </button>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                  {(
                    [
                      { id: 'access', label: 'Client Access & Features', icon: UserCheck },
                      { id: 'overview', label: 'Analytics', icon: Activity },
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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

              {detailTab === 'access' && (
                <form
                  onSubmit={handleSaveGovernance}
                  className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6"
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
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {governanceError}
                    </div>
                  )}
                  {governanceNotice && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {governanceNotice}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Assigned Business Client Email
                      </label>
                      <input
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
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Client Portal Access Level
                      </label>
                      <select
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

                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Enabled Features for This Business
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        {
                          key: 'aiReviewDrafts' as const,
                          title: 'AI Review Drafts',
                          desc: 'Allow walk-in guests to generate Short, Detailed, and Professional drafts.',
                        },
                        {
                          key: 'customQuestions' as const,
                          title: 'Custom Question Builder',
                          desc: 'Allow tailored question configuration in the client portal.',
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
                            checked={featuresInput[feat.key]}
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
                    if (t === 'qr') setDetailTab('qr');
                    else if (t === 'questions') setDetailTab('questions');
                    else if (t === 'branding') setDetailTab('branding');
                    else if (t === 'preview') setDetailTab('preview');
                  }}
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
              {detailTab === 'branding' && (
                <BrandingTab
                  business={selectedBiz}
                  isAdmin
                  onDeleted={() => setSelectedBizId(null)}
                />
              )}
              {detailTab === 'preview' && previewProfile && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                  <CustomerReviewFlow profile={previewProfile} isPreview />
                </div>
              )}
            </div>
          ) : section === 'directory' ? (
            <>
              {/* Cross-Business Aggregate KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Total Businesses</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aggregateStats.totalBusinesses}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {aggregateStats.activeQrCount} active QR codes
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Platform QR Scans</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aggregateStats.totalScans}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Across all client storefronts</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">AI Drafts Generated</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aggregateStats.totalDrafts}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Personalized customer drafts</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-medium text-slate-500">Google Redirects</p>
                  <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {aggregateStats.totalRedirects}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Completed copy &amp; handoff</p>
                </div>
              </div>

              {/* Filter Toolbar & All-Businesses Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search business, slug, or client email..."
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                    />
                  </div>

                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
                    {(['all', 'active', 'paused'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setStatusFilter(f)}
                        className={`px-3 py-1 rounded-md text-xs font-medium capitalize cursor-pointer ${
                          statusFilter === f
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredBusinesses.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {businesses.length === 0
                        ? 'No businesses registered yet'
                        : 'No businesses match your search filter'}
                    </p>
                    {businesses.length === 0 && (
                      <button
                        type="button"
                        onClick={onOpenNewBusiness}
                        className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Create First Business
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="py-3 px-6">Business</th>
                          <th className="py-3 px-4">Assigned Client Email</th>
                          <th className="py-3 px-4">Client Tier</th>
                          <th className="py-3 px-4">QR Status</th>
                          <th className="py-3 px-4 text-right">Scans</th>
                          <th className="py-3 px-4 text-right">Redirects</th>
                          <th className="py-3 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredBusinesses.map((biz) => {
                          const st = statsMap[biz.id];
                          return (
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
                                    <p className="text-slate-500">
                                      {biz.category} · <span className="font-mono">/review/{biz.slug}</span>
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-700">
                                {biz.clientEmail || 'Unassigned'}
                              </td>
                              <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                                {biz.clientAccessLevel === 'read_only'
                                  ? 'Read-Only'
                                  : biz.clientAccessLevel === 'qr_and_questions'
                                    ? 'QR & Questions'
                                    : 'Full Self-Service'}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                                  {biz.qrConfig.isActive ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Active</span>
                                    </>
                                  ) : (
                                    <>
                                      <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Paused</span>
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                {st?.scans ?? 0}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900">
                                {st?.redirects ?? 0}
                              </td>
                              <td className="py-3.5 px-6 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedBizId(biz.id);
                                    setDetailTab('access');
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
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
            </>
          ) : section === 'clients' ? (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveClientAccess}
                className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5"
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
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Select Business
                      </label>
                      <select
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
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Customer Gmail ID
                      </label>
                      <input
                        type="email"
                        required
                        value={assignEmail}
                        onChange={(e) => setAssignEmail(e.target.value)}
                        placeholder="customer@gmail.com"
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Portal Access Tier
                      </label>
                      <select
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

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
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
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Cross-Business Activity Feed
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  {events.length} recent events
                </span>
              </div>
              {events.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No customer QR events recorded across businesses yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-6">Business</th>
                        <th className="py-3 px-4">Event</th>
                        <th className="py-3 px-4">Style</th>
                        <th className="py-3 px-4">Highlights</th>
                        <th className="py-3 px-6 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {events.slice(0, 50).map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-6 font-semibold text-slate-900 whitespace-nowrap">
                            {bizNameMap[ev.businessId] || ev.slug}
                          </td>
                          <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                            {ev.eventType === 'scan'
                              ? 'QR Scan'
                              : ev.eventType === 'generate'
                                ? 'AI Draft Created'
                                : 'Opened Google Review'}
                          </td>
                          <td className="py-3 px-4 text-slate-600 capitalize whitespace-nowrap">
                            {ev.reviewStyle || '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                            {ev.selectedHighlights?.length
                              ? ev.selectedHighlights.join(', ')
                              : ev.sentiment || '—'}
                          </td>
                          <td className="py-3 px-6 text-right font-mono text-slate-500 tabular-nums whitespace-nowrap">
                            {formatTime(ev.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
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

              <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
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
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  LogOut,
  Menu,
  Palette,
  PauseCircle,
  Plus,
  QrCode,
  Shield,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { Business, BusinessStats, PublicProfile } from '../types';
import { subscribeToBusinessStats } from '../services/businessService';
import { getPublicAppUrl } from '../utils/apiClient';
import { downloadQrPdf, downloadQrPng, renderQrToCanvas } from '../utils/qrAndPdf';
import { BusinessLogo } from './BusinessLogo';
import { QrStudioTab } from './QrStudioTab';
import { QuestionBuilderTab } from './QuestionBuilderTab';
import { BrandingTab } from './BrandingTab';
import { CustomerReviewFlow } from './CustomerReviewFlow';

type PortalTab = 'qr_features' | 'qr_editor' | 'questions' | 'branding' | 'preview';

interface ClientPortalViewProps {
  user: User;
  isAdmin: boolean;
  businesses: Business[];
  activeBusiness: Business | null;
  onSelectBusiness: (id: string) => void;
  onOpenNewBusiness: () => void;
  onSwitchToAdmin?: () => void;
  onSignOut: () => void;
}

const ACCESS_LABELS = {
  read_only: 'View & Download Only',
  qr_and_questions: 'QR Studio & Questions',
  full: 'Full Self-Service',
} as const;

export function ClientPortalView({
  user,
  isAdmin,
  businesses,
  activeBusiness,
  onSelectBusiness,
  onOpenNewBusiness,
  onSwitchToAdmin,
  onSignOut,
}: ClientPortalViewProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('qr_features');
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!activeBusiness) {
      setStats(null);
      return;
    }
    return subscribeToBusinessStats(activeBusiness.id, (next) => {
      setStats(next);
    });
  }, [activeBusiness?.id]);

  // Reset tab if permission level restricts current tab
  useEffect(() => {
    if (!activeBusiness) return;
    if (activeBusiness.clientAccessLevel === 'read_only' && activeTab !== 'qr_features' && activeTab !== 'preview') {
      setActiveTab('qr_features');
    } else if (
      activeBusiness.clientAccessLevel === 'qr_and_questions' &&
      activeTab === 'branding'
    ) {
      setActiveTab('qr_features');
    }
  }, [activeBusiness?.id, activeBusiness?.clientAccessLevel, activeTab]);

  const publicBaseUrl = getPublicAppUrl();
  const reviewUrl = activeBusiness
    ? `${publicBaseUrl}/review/${activeBusiness.slug}?v=${activeBusiness.qrConfig.token}`
    : '';

  useEffect(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas || !activeBusiness || activeTab !== 'qr_features') return;
    renderQrToCanvas({
      canvas,
      url: reviewUrl,
      fgColor: activeBusiness.qrConfig.fgColor,
      bgColor: activeBusiness.qrConfig.bgColor,
      size: 280,
      includeLogo: activeBusiness.qrConfig.includeLogo,
      logoSrc: activeBusiness.logoDataUrl,
    });
  }, [activeBusiness, reviewUrl, activeTab]);

  const accessLevel = activeBusiness?.clientAccessLevel ?? 'read_only';
  const canEditQrOrQuestions = accessLevel === 'qr_and_questions' || accessLevel === 'full';
  const canEditBranding = accessLevel === 'full';

  const navItems: { id: PortalTab; label: string; icon: typeof QrCode; visible: boolean }[] = [
    { id: 'qr_features', label: 'My QR & Features', icon: QrCode, visible: true },
    {
      id: 'qr_editor',
      label: 'QR Customizer',
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
        seoKeywords: activeBusiness.seoKeywords,
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

      {/* Business Selector (scoped strictly to client's assigned businesses) */}
      <div className="p-4 border-b border-slate-200 relative">
        <p className="text-[11px] font-medium text-slate-500 mb-2">Your Business</p>
        {activeBusiness ? (
          businesses.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => setSwitcherOpen((p) => !p)}
                className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-between gap-2.5 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BusinessLogo
                    src={activeBusiness.logoDataUrl}
                    name={activeBusiness.name}
                    primaryColor={activeBusiness.branding.primaryColor}
                    sizeClass="w-8 h-8"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {activeBusiness.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {activeBusiness.category}
                    </p>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {switcherOpen && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 space-y-1 z-30">
                  {businesses.map((biz) => (
                    <button
                      key={biz.id}
                      type="button"
                      onClick={() => {
                        onSelectBusiness(biz.id);
                        setSwitcherOpen(false);
                      }}
                      className={`w-full px-2.5 py-2 rounded-lg flex items-center gap-2.5 text-left text-xs cursor-pointer ${
                        biz.id === activeBusiness.id
                          ? 'bg-teal-50 text-teal-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <BusinessLogo
                        src={biz.logoDataUrl}
                        name={biz.name}
                        primaryColor={biz.branding.primaryColor}
                        sizeClass="w-6 h-6"
                      />
                      <span className="truncate">{biz.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2.5">
              <BusinessLogo
                src={activeBusiness.logoDataUrl}
                name={activeBusiness.name}
                primaryColor={activeBusiness.branding.primaryColor}
                sizeClass="w-8 h-8"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {activeBusiness.name}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{activeBusiness.category}</p>
              </div>
            </div>
          )
        ) : (
          <p className="text-xs text-slate-500">No business assigned yet</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!activeBusiness}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 space-y-2.5">
        {isAdmin && onSwitchToAdmin && (
          <button
            type="button"
            onClick={onSwitchToAdmin}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Management Console</span>
          </button>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">Client Portal</p>
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
              <span className="text-slate-500 truncate">Client Portal</span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {activeBusiness ? activeBusiness.name : 'Pending Assignment'}
              </span>
            </div>
          </div>

          {activeBusiness && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  window.history.pushState(
                    {},
                    '',
                    `/review/${activeBusiness.slug}?v=${activeBusiness.qrConfig.token}`,
                  );
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span>Open Live Review Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          {!activeBusiness ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-5 max-w-xl mx-auto mt-8">
              <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold text-slate-900">
                  No Business Assigned Yet
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  You are signed in as <span className="font-mono text-slate-900">{user.email}</span>. Ask your account manager to assign your business to this email address, or register your own storefront below.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onOpenNewBusiness}
                  className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register My Business</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'qr_features' && (
                <div className="space-y-6">
                  {/* Top Summary Strip */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <BusinessLogo
                        src={activeBusiness.logoDataUrl}
                        name={activeBusiness.name}
                        primaryColor={activeBusiness.branding.primaryColor}
                        sizeClass="w-14 h-14"
                      />
                      <div className="min-w-0">
                        <h1 className="font-display text-2xl font-bold text-slate-900 truncate">
                          {activeBusiness.name}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{activeBusiness.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                            {activeBusiness.qrConfig.isActive ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>QR Active</span>
                              </>
                            ) : (
                              <>
                                <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                                <span>QR Paused</span>
                              </>
                            )}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Access: {ACCESS_LABELS[accessLevel]}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Customer Form</span>
                      </button>
                    </div>
                  </div>

                  {/* Stats Strip (if analyticsView enabled) */}
                  {activeBusiness.enabledFeatures.analyticsView && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <p className="text-xs font-medium text-slate-500">Total QR Scans</p>
                        <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                          {stats?.scans ?? 0}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <p className="text-xs font-medium text-slate-500">AI Drafts Generated</p>
                        <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                          {stats?.generated ?? 0}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <p className="text-xs font-medium text-slate-500">Google Redirects</p>
                        <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                          {stats?.redirects ?? 0}
                        </p>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200 p-5">
                        <p className="text-xs font-medium text-slate-500">Scan-to-Google Rate</p>
                        <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                          {stats && stats.scans > 0
                            ? Math.round((stats.redirects / stats.scans) * 100)
                            : 0}
                          %
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Two-Column: QR Card & Active Business Features */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left: Business QR Code */}
                    <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center text-center">
                      <div className="w-full flex items-center justify-between text-xs text-slate-500 mb-4">
                        <span className="font-semibold text-slate-800">Your Business QR</span>
                        <span className="font-mono">Rev {activeBusiness.qrConfig.token}</span>
                      </div>

                      <div
                        className="p-4 rounded-2xl border border-slate-200"
                        style={{ backgroundColor: activeBusiness.qrConfig.bgColor }}
                      >
                        <canvas ref={qrCanvasRef} className="w-56 h-56 block" />
                      </div>

                      <p className="mt-4 font-mono text-xs text-slate-500 break-all">
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
                            className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{isExportingPdf ? 'Exporting...' : 'Printable PDF'}</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="mt-2.5 w-full min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied Review Link</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Customer Review Link</span>
                          </>
                        )}
                      </button>

                      {publicBaseUrl.startsWith('https://ais-dev-') && (
                        <p className="mt-4 text-[11px] text-slate-500 leading-relaxed text-left bg-slate-50 border border-slate-200 rounded-xl p-3">
                          Note: You are viewing a private AI Studio dev preview (<span className="font-mono">ais-dev-...</span>). Customers scanning QR codes on phones need the published Shared App URL (<span className="font-mono">ais-pre-...</span>) or your custom domain (<span className="font-mono">VITE_PUBLIC_APP_URL</span>).
                        </p>
                      )}
                    </div>

                    {/* Right: Enabled Features & Business Details */}
                    <div className="lg:col-span-7 space-y-6">
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="font-display text-lg font-bold text-slate-900">
                              Active Business Features
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Capabilities and customer workflow enabled for {activeBusiness.name}.
                            </p>
                          </div>
                          {accessLevel === 'read_only' && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Managed by Admin</span>
                            </span>
                          )}
                        </div>

                        <div className="divide-y divide-slate-100">
                          <div className="py-3.5 flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <Sparkles className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  AI Review Draft Generator
                                </p>
                                <p className="text-xs text-slate-500">
                                  Generates Short &amp; Simple, Natural &amp; Detailed, and Professional drafts from customer taps.
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                              {activeBusiness.enabledFeatures.aiReviewDrafts ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>

                          <div className="py-3.5 flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <SlidersHorizontal className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Dynamic Feedback Form ({activeBusiness.questions.length} questions)
                                </p>
                                <p className="text-xs text-slate-500">
                                  Tailored for {activeBusiness.category} with direct Google Review link handoff.
                                </p>
                              </div>
                            </div>
                            {canEditQrOrQuestions && activeBusiness.enabledFeatures.customQuestions ? (
                              <button
                                type="button"
                                onClick={() => setActiveTab('questions')}
                                className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                              >
                                <span>Edit Form</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="py-3.5 flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <FileText className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Printable A4 Counter Poster PDF
                                </p>
                                <p className="text-xs text-slate-500">
                                  Print-ready PDF standee with your logo, welcome message, and scannable QR.
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                              {activeBusiness.enabledFeatures.pdfPosterExport ? 'Included' : 'Locked'}
                            </span>
                          </div>

                          <div className="py-3.5 flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <BarChart3 className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  Live QR Scan &amp; Google Redirect Tracking
                                </p>
                                <p className="text-xs text-slate-500">
                                  Real-time tracking across scans, AI drafts, and Google review clicks.
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                              {activeBusiness.enabledFeatures.analyticsView ? 'Active' : 'Hidden'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Google Link & Target SEO Keywords Snapshot */}
                      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">
                            Connected Google Review Destination
                          </h3>
                          {canEditBranding && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('branding')}
                              className="text-xs font-semibold text-teal-700 hover:text-teal-800 cursor-pointer"
                            >
                              Edit Branding &amp; Keywords
                            </button>
                          )}
                        </div>
                        <p className="font-mono text-xs text-slate-600 break-all">
                          {activeBusiness.googleReviewUrl || 'https://www.google.com/maps'}
                        </p>
                        {activeBusiness.seoKeywords && activeBusiness.seoKeywords.length > 0 && (
                          <div className="pt-3 border-t border-slate-100">
                            <p className="text-xs font-medium text-slate-500 mb-1.5">
                              AI Google Ranking Keywords
                            </p>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {activeBusiness.seoKeywords.join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'qr_editor' && canEditQrOrQuestions && (
                <QrStudioTab business={activeBusiness} />
              )}

              {activeTab === 'questions' &&
                canEditQrOrQuestions &&
                activeBusiness.enabledFeatures.customQuestions && (
                  <QuestionBuilderTab
                    business={activeBusiness}
                    onOpenPreview={() => setActiveTab('preview')}
                  />
                )}

              {activeTab === 'branding' && canEditBranding && (
                <BrandingTab
                  business={activeBusiness}
                  onDeleted={() => setActiveTab('qr_features')}
                />
              )}

              {activeTab === 'preview' && previewProfile && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50">
                  <CustomerReviewFlow profile={previewProfile} isPreview />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

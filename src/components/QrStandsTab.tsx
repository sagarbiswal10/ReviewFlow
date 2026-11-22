import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Loader2,
  PauseCircle,
  Plus,
  QrCode,
  Send,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import type { Business, QrStand, QrStandRequest, ReviewEvent } from '../types';
import {
  STAND_PLACEMENT_PRESETS,
  createQrStand,
  deleteQrStand,
  submitQrStandRequest,
  subscribeToBusinessQrStandRequests,
  subscribeToBusinessQrStands,
  updateQrStand,
} from '../services/platformFeaturesService';
import { getPublicAppUrl } from '../utils/apiClient';
import { downloadQrPdf, downloadQrPng, renderQrToCanvas } from '../utils/qrAndPdf';

interface QrStandsTabProps {
  business: Business;
  userUid: string;
  userEmail: string;
  isAdmin?: boolean;
  events: ReviewEvent[];
  canEdit: boolean;
}

interface StandCardCanvasProps {
  url: string;
  fgColor: string;
  bgColor: string;
  includeLogo: boolean;
  logoSrc?: string;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;
}

function StandQrCanvas({
  url,
  fgColor,
  bgColor,
  includeLogo,
  logoSrc,
  onCanvasReady,
}: StandCardCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const onCanvasReadyRef = useRef(onCanvasReady);
  onCanvasReadyRef.current = onCanvasReady;

  useEffect(() => {
    const el = ref.current;
    onCanvasReadyRef.current(el);
    if (!el) return;
    renderQrToCanvas({
      canvas: el,
      url,
      fgColor,
      bgColor,
      size: 200,
      includeLogo,
      logoSrc,
    });
  }, [url, fgColor, bgColor, includeLogo, logoSrc]);

  return <canvas ref={ref} className="w-36 h-36 block" />;
}

export function QrStandsTab({
  business,
  userUid,
  userEmail,
  isAdmin = false,
  events,
  canEdit,
}: QrStandsTabProps) {
  const [stands, setStands] = useState<QrStand[]>([]);
  const [requests, setRequests] = useState<QrStandRequest[]>([]);
  const [newName, setNewName] = useState('');
  const [newPlacement, setNewPlacement] = useState<string>(STAND_PLACEMENT_PRESETS[0]);
  const [customPlacement, setCustomPlacement] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [standError, setStandError] = useState<string | null>(null);
  const [standNotice, setStandNotice] = useState<string | null>(null);
  const [copiedStandId, setCopiedStandId] = useState<string | null>(null);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const [reqCount, setReqCount] = useState(2);
  const [reqReason, setReqReason] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqNotice, setReqNotice] = useState<string | null>(null);

  const canvasMapRef = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(() => {
    const unsubStands = subscribeToBusinessQrStands(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      (list) => setStands(list),
      (err) => setStandError(err?.message || 'Unable to load QR stands.'),
    );
    const unsubReqs = subscribeToBusinessQrStandRequests(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      (list) => setRequests(list),
      (err) => setReqError(err?.message || 'Unable to load stand expansion requests.'),
    );
    return () => {
      unsubStands();
      unsubReqs();
    };
  }, [business.id, userUid, userEmail, isAdmin]);

  const standLimit = Math.max(1, business.qrStandLimit ?? 4);
  const remainingSlots = Math.max(0, standLimit - stands.length);
  const publicBaseUrl = getPublicAppUrl();

  const buildStandUrl = (stand: QrStand) => {
    const params = new URLSearchParams({
      v: business.qrConfig.token,
      stand: stand.standCode,
      sid: stand.id,
      sname: stand.name,
    });
    return `${publicBaseUrl}/review/${business.slug}?${params.toString()}`;
  };

  const standMetrics = useMemo(() => {
    const bizEvents = events.filter((e) => e.businessId === business.id);
    const perStand: Record<
      string,
      {
        scans: number;
        sessions: Set<string>;
        formsStarted: number;
        drafts: number;
        redirects: number;
      }
    > = {};

    for (const st of stands) {
      perStand[st.id] = {
        scans: 0,
        sessions: new Set<string>(),
        formsStarted: 0,
        drafts: 0,
        redirects: 0,
      };
    }

    const totalSessions = new Set<string>();
    let totalScans = 0;
    let totalFormsStarted = 0;
    let totalDrafts = 0;
    let totalRedirects = 0;

    for (const ev of bizEvents) {
      const sid = ev.sessionId || ev.id;
      totalSessions.add(sid);
      if (ev.eventType === 'scan') totalScans += 1;
      else if (ev.eventType === 'form_start') totalFormsStarted += 1;
      else if (ev.eventType === 'generate') totalDrafts += 1;
      else if (ev.eventType === 'copy_redirect') totalRedirects += 1;

      const matchedStand = stands.find(
        (st) => st.id === ev.standId || (ev.standCode && st.standCode === ev.standCode),
      );
      if (!matchedStand) continue;
      const bucket = perStand[matchedStand.id];
      bucket.sessions.add(sid);
      if (ev.eventType === 'scan') bucket.scans += 1;
      else if (ev.eventType === 'form_start') bucket.formsStarted += 1;
      else if (ev.eventType === 'generate') bucket.drafts += 1;
      else if (ev.eventType === 'copy_redirect') bucket.redirects += 1;
    }

    const ranked = stands
      .map((st) => ({
        stand: st,
        scans: perStand[st.id]?.scans || 0,
        uniqueSessions: perStand[st.id]?.sessions.size || 0,
        formsStarted: perStand[st.id]?.formsStarted || 0,
        drafts: perStand[st.id]?.drafts || 0,
        redirects: perStand[st.id]?.redirects || 0,
      }))
      .sort((a, b) => b.scans - a.scans);

    return {
      totalScans,
      uniqueSessions: totalSessions.size,
      totalFormsStarted,
      totalDrafts,
      totalRedirects,
      ranked,
      best: ranked[0] || null,
      lowest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    };
  }, [events, business.id, stands]);

  const handleCreateStand = async (e: React.FormEvent) => {
    e.preventDefault();
    setStandError(null);
    setStandNotice(null);
    const placementVal =
      newPlacement === 'Custom' ? customPlacement.trim() : newPlacement.trim();
    const labelVal = newName.trim() || placementVal || `QR Stand #${stands.length + 1}`;
    if (!placementVal) {
      setStandError('Please choose or type a stand placement location.');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createQrStand({
        business,
        name: labelVal,
        placement: placementVal,
        existingStands: stands,
      });
      setNewName('');
      setCustomPlacement('');
      setStandNotice(`Created "${created.name}" in Slot ${created.slotNumber} of ${standLimit}.`);
      setTimeout(() => setStandNotice(null), 3500);
    } catch (err) {
      setStandError(err instanceof Error ? err.message : 'Unable to create QR stand.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStandActive = async (stand: QrStand) => {
    setStandError(null);
    try {
      await updateQrStand(stand, { isActive: !stand.isActive });
    } catch (err) {
      setStandError(err instanceof Error ? err.message : 'Failed to update stand status.');
    }
  };

  const handleDeleteStand = async (stand: QrStand) => {
    setStandError(null);
    try {
      await deleteQrStand(stand.id);
      setStandNotice(`Removed "${stand.name}". Slot ${stand.slotNumber} is now available.`);
      setTimeout(() => setStandNotice(null), 3000);
    } catch (err) {
      setStandError(err instanceof Error ? err.message : 'Failed to remove stand.');
    }
  };

  const handleCopyStandUrl = async (stand: QrStand) => {
    try {
      await navigator.clipboard.writeText(buildStandUrl(stand));
      setCopiedStandId(stand.id);
      setTimeout(() => setCopiedStandId(null), 2000);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const handleDownloadStandPdf = async (stand: QrStand) => {
    setExportingPdfId(stand.id);
    setStandError(null);
    try {
      await downloadQrPdf({
        businessName: business.name,
        category: business.category,
        welcomeMessage: business.branding.welcomeMessage,
        reviewUrl: buildStandUrl(stand),
        fgColor: stand.fgColor,
        bgColor: stand.bgColor,
        primaryColor: business.branding.primaryColor,
        includeLogo: stand.includeLogo,
        logoSrc: business.logoDataUrl,
        slug: business.slug,
        standLabel: `${stand.name} (${stand.placement})`,
      });
    } catch (err) {
      setStandError(
        err instanceof Error ? err.message : 'Unable to generate PDF poster for this stand.',
      );
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleSubmitExtraRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError(null);
    setReqNotice(null);
    setIsSubmittingReq(true);
    try {
      await submitQrStandRequest({
        business,
        requestedAdditionalStands: reqCount,
        reason: reqReason,
      });
      setReqReason('');
      setReqNotice(
        'Additional QR stand request submitted. Business Management will review and expand your slot quota upon approval.',
      );
      setTimeout(() => setReqNotice(null), 5000);
    } catch (err) {
      setReqError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setIsSubmittingReq(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top Limit & Funnel Performance Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Active Stand Quota
          </p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-slate-900 tabular-nums">
            {stands.length} / {standLimit}
          </p>
          <div className="mt-2.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-[#0f766e] rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.round((stands.length / standLimit) * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
            {remainingSlots} slot{remainingSlots === 1 ? '' : 's'} remaining
          </p>
        </div>

        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Unique Sessions
          </p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-slate-900 tabular-nums">
            {standMetrics.uniqueSessions}
          </p>
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {standMetrics.totalScans} total QR scans
          </p>
        </div>

        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Forms Started
          </p>
          <p className="mt-1.5 font-display text-2xl font-extrabold text-slate-900 tabular-nums">
            {standMetrics.totalFormsStarted}
          </p>
          <p className="mt-2 text-xs text-slate-500 tabular-nums">
            {standMetrics.totalDrafts} AI drafts · {standMetrics.totalRedirects} Google clicks
          </p>
        </div>

        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Top Stand
            </p>
            <Award className="w-4 h-4 text-[#0f766e]" />
          </div>
          <p className="mt-1.5 font-display text-base font-bold text-slate-900 truncate">
            {standMetrics.best ? standMetrics.best.stand.name : 'No stands yet'}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#005c55] tabular-nums">
            {standMetrics.best
              ? `${standMetrics.best.scans} scans · ${standMetrics.best.redirects} Google`
              : 'Create a stand below'}
          </p>
        </div>

        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Lowest Stand
            </p>
            <TrendingDown className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-1.5 font-display text-base font-bold text-slate-900 truncate">
            {standMetrics.lowest ? standMetrics.lowest.stand.name : 'N/A'}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {standMetrics.lowest
              ? `${standMetrics.lowest.scans} scans · Needs placement boost`
              : 'Add 2+ stands to compare'}
          </p>
        </div>
      </div>

      {/* Create New QR Stand Card */}
      {canEdit && (
        <form
          onSubmit={handleCreateStand}
          className="liquid-glass rounded-2xl p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                In-Store QR Stand Provisioning
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Every business starts with 4 tracked stand slots (Entrance, Cash Counter, Dining Table, Reception). Each stand encodes a unique identifier for conversion tracking.
              </p>
            </div>
            <button
              type="submit"
              disabled={isCreating || remainingSlots === 0}
              className="px-4 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>
                {remainingSlots === 0
                  ? `Limit Reached (${standLimit}/${standLimit})`
                  : 'Create Tracked QR Stand'}
              </span>
            </button>
          </div>

          {standError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{standError}</span>
            </div>
          )}
          {standNotice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{standNotice}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Stand Placement Preset
              </label>
              <select
                value={newPlacement}
                onChange={(e) => setNewPlacement(e.target.value)}
                disabled={remainingSlots === 0}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
              >
                {STAND_PLACEMENT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
                <option value="Custom">Custom Placement...</option>
              </select>
            </div>

            {newPlacement === 'Custom' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Custom Placement Location
                </label>
                <input
                  type="text"
                  value={customPlacement}
                  onChange={(e) => setCustomPlacement(e.target.value)}
                  placeholder="e.g., Patio Bar Stand"
                  disabled={remainingSlots === 0}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Display Label (Optional)
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`e.g., ${newPlacement} #${stands.length + 1}`}
                  disabled={remainingSlots === 0}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
                />
              </div>
            )}

            <div className="flex items-end">
              <div className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">Backend &amp; Rules Enforced:</span>{' '}
                Slot {Math.min(standLimit, stands.length + 1)} of {standLimit} max active stands.
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Active QR Stands Grid */}
      {stands.length === 0 ? (
        <div className="liquid-glass rounded-2xl p-10 text-center space-y-3">
          <QrCode className="w-9 h-9 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            No Dedicated QR Stands Created Yet
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            Create up to {standLimit} individual stand QR codes above (such as Entrance, Cash Counter, Dining Table, and Reception) to track which physical spot generates the most reviews.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {stands.map((stand) => {
            const url = buildStandUrl(stand);
            const rowStat = standMetrics.ranked.find((r) => r.stand.id === stand.id);
            const isBest = standMetrics.best?.stand.id === stand.id && (rowStat?.scans || 0) > 0;
            return (
              <div
                key={stand.id}
                className="liquid-glass spatial-card-3d rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                  <div
                    className="p-3 rounded-2xl border border-slate-200 shadow-inner shrink-0"
                    style={{ backgroundColor: stand.bgColor }}
                  >
                    <StandQrCanvas
                      url={url}
                      fgColor={stand.fgColor}
                      bgColor={stand.bgColor}
                      includeLogo={stand.includeLogo}
                      logoSrc={business.logoDataUrl}
                      onCanvasReady={(el) => {
                        canvasMapRef.current[stand.id] = el;
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="text-[11px] font-mono font-bold text-[#005c55] bg-[#f0fdfa] px-2 py-0.5 rounded-md">
                        Slot #{stand.slotNumber}
                      </span>
                      {isBest && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                          <Award className="w-3 h-3" />
                          Top Stand
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => handleToggleStandActive(stand)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 cursor-pointer disabled:cursor-default"
                      >
                        {stand.isActive ? (
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
                      </button>
                    </div>

                    <div>
                      <h3 className="font-display text-base font-bold text-slate-900 truncate">
                        {stand.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Placement: <span className="font-medium text-slate-700">{stand.placement}</span> · Code:{' '}
                        <span className="font-mono">{stand.standCode}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                        <p className="text-[10px] text-slate-500">Scans</p>
                        <p className="text-xs font-bold text-slate-900 tabular-nums">
                          {rowStat?.scans ?? 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                        <p className="text-[10px] text-slate-500">Sessions</p>
                        <p className="text-xs font-bold text-slate-900 tabular-nums">
                          {rowStat?.uniqueSessions ?? 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                        <p className="text-[10px] text-slate-500">Drafts</p>
                        <p className="text-xs font-bold text-slate-900 tabular-nums">
                          {rowStat?.drafts ?? 0}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/70">
                        <p className="text-[10px] text-slate-500">Google</p>
                        <p className="text-xs font-bold text-[#005c55] tabular-nums">
                          {rowStat?.redirects ?? 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = canvasMapRef.current[stand.id];
                        if (canvas) downloadQrPng(canvas, `${business.slug}-${stand.standCode}`);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PNG</span>
                    </button>

                    {business.enabledFeatures.pdfPosterExport && (
                      <button
                        type="button"
                        disabled={exportingPdfId === stand.id}
                        onClick={() => handleDownloadStandPdf(stand)}
                        className="px-3 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{exportingPdfId === stand.id ? 'PDF...' : 'Poster PDF'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopyStandUrl(stand)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-[#f0fdfa] text-xs font-semibold text-slate-700 hover:text-[#005c55] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      {copiedStandId === stand.id ? (
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

                    <button
                      type="button"
                      onClick={() => {
                        window.history.pushState(
                          { internalReviewNav: true },
                          '',
                          `/review/${business.slug}?v=${business.qrConfig.token}&stand=${encodeURIComponent(stand.standCode)}&sid=${encodeURIComponent(stand.id)}&sname=${encodeURIComponent(stand.name)}`,
                        );
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <span>Test Scan</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStand(stand)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                      aria-label={`Delete stand ${stand.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-Stand Comparison Table */}
      {stands.length > 0 && (
        <div className="liquid-glass rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Per-Stand Conversion Funnel
              </h3>
              <p className="text-xs text-slate-500">
                Scans, unique sessions, forms started, AI drafts, and Google review handoffs per physical location
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Stand Name</th>
                  <th className="py-3 px-4">Placement</th>
                  <th className="py-3 px-4 text-right">Scans</th>
                  <th className="py-3 px-4 text-right">Unique Sessions</th>
                  <th className="py-3 px-4 text-right">Forms Started</th>
                  <th className="py-3 px-4 text-right">AI Drafts</th>
                  <th className="py-3 px-6 text-right">Google Clicks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {standMetrics.ranked.map((row) => (
                  <tr key={row.stand.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-semibold text-slate-900 whitespace-nowrap">
                      {row.stand.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {row.stand.placement}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {row.scans}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.uniqueSessions}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.formsStarted}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.drafts}
                    </td>
                    <td className="py-3 px-6 text-right font-mono font-bold tabular-nums text-[#005c55]">
                      {row.redirects}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Request Additional QR Stands Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmitExtraRequest}
          className="lg:col-span-6 liquid-glass rounded-2xl p-6 space-y-4"
        >
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Request Additional QR Stands
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Need more than {standLimit} stands? Submit a request to Platform Management to unlock extra QR stand slots.
            </p>
          </div>

          {reqError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {reqError}
            </div>
          )}
          {reqNotice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
              {reqNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Stands
              </label>
              <input
                type="number"
                min={1}
                max={25}
                value={reqCount}
                onChange={(e) => setReqCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Placement Reason
              </label>
              <input
                type="text"
                required
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="e.g., Expanding patio seating with 4 new tables"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingReq}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {isSubmittingReq ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>Submit Stand Limit Request</span>
          </button>
        </form>

        <div className="lg:col-span-6 liquid-glass rounded-2xl p-6 space-y-3">
          <h3 className="font-display text-base font-bold text-slate-900">
            Stand Expansion Requests ({requests.length})
          </h3>
          {requests.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No additional stand requests submitted yet. Current limit is {standLimit} stands.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {requests.map((req) => (
                <div key={req.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      +{req.requestedAdditionalStands} Stand{req.requestedAdditionalStands === 1 ? '' : 's'} requested
                    </p>
                    <p className="text-slate-600 mt-0.5">{req.reason}</p>
                    {req.adminNote && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Admin Note: {req.adminNote}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase whitespace-nowrap shrink-0 ${
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

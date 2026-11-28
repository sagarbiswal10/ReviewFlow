import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PauseCircle,
  RefreshCw,
} from 'lucide-react';
import type { Business } from '../types';
import { generateRandomToken, updateBusiness } from '../services/businessService';
import { getPublicAppUrl } from '../utils/apiClient';
import { copyToClipboard } from '../utils/clipboard';
import { downloadQrPdf, downloadQrPng, renderQrToCanvas } from '../utils/qrAndPdf';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import { TypedConfirmModal } from './TypedConfirmModal';

interface QrStudioTabProps {
  business: Business;
  isAdmin?: boolean;
}

export function QrStudioTab({ business, isAdmin = false }: QrStudioTabProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fgColor, setFgColor] = useState(business.qrConfig.fgColor);
  const [bgColor, setBgColor] = useState(business.qrConfig.bgColor);
  const [includeLogo, setIncludeLogo] = useState(business.qrConfig.includeLogo);
  const [isActive, setIsActive] = useState(business.qrConfig.isActive);
  const [token, setToken] = useState(business.qrConfig.token);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<'toggle_pause' | 'regenerate' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(statusMessage, () => setStatusMessage(null));
  useAutoDismiss(error, () => setError(null));
  const isDirtyRef = useRef(false);
  const lastSyncedRef = useRef<{ id: string; sig: string }>({
    id: business.id,
    sig: JSON.stringify(business.qrConfig),
  });
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const incomingSig = JSON.stringify(business.qrConfig);
    if (lastSyncedRef.current.id !== business.id) {
      isDirtyRef.current = false;
      lastSyncedRef.current = { id: business.id, sig: incomingSig };
      setFgColor(business.qrConfig.fgColor);
      setBgColor(business.qrConfig.bgColor);
      setIncludeLogo(business.qrConfig.includeLogo);
      setIsActive(business.qrConfig.isActive);
      setToken(business.qrConfig.token);
      setError(null);
      setStatusMessage(null);
      return;
    }
    if (!isDirtyRef.current && incomingSig !== lastSyncedRef.current.sig) {
      lastSyncedRef.current = { id: business.id, sig: incomingSig };
      setFgColor(business.qrConfig.fgColor);
      setBgColor(business.qrConfig.bgColor);
      setIncludeLogo(business.qrConfig.includeLogo);
      setIsActive(business.qrConfig.isActive);
      setToken(business.qrConfig.token);
    }
  }, [business.id, business.qrConfig]);

  const publicBaseUrl = getPublicAppUrl();
  const reviewUrl = `${publicBaseUrl}/review/${business.slug}?v=${token}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderQrToCanvas({
      canvas,
      url: reviewUrl,
      fgColor,
      bgColor,
      size: 320,
      includeLogo,
      logoSrc: business.logoDataUrl,
    });
  }, [reviewUrl, fgColor, bgColor, includeLogo, business.logoDataUrl]);

  const persistQrConfig = async (
    nextConfig: Partial<Business['qrConfig']>,
    feedbackText: string,
  ): Promise<boolean> => {
    setIsSaving(true);
    setStatusMessage(null);
    setError(null);
    const mergedQrConfig = {
      isActive: nextConfig.isActive ?? isActive,
      fgColor: nextConfig.fgColor ?? fgColor,
      bgColor: nextConfig.bgColor ?? bgColor,
      token: nextConfig.token ?? token,
      includeLogo: nextConfig.includeLogo ?? includeLogo,
    };
    try {
      await updateBusiness(
        business,
        { qrConfig: mergedQrConfig },
        { isAdmin },
      );
      isDirtyRef.current = false;
      lastSyncedRef.current = {
        id: business.id,
        sig: JSON.stringify(mergedQrConfig),
      };
      setStatusMessage(feedbackText);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save QR styling.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    const prevActive = isActive;
    const nextActive = !prevActive;
    setIsActive(nextActive);
    const ok = await persistQrConfig(
      { isActive: nextActive },
      nextActive ? 'QR code activated for customer scans.' : 'QR code paused.',
    );
    if (!ok) {
      setIsActive(prevActive);
    }
    if (mountedRef.current) {
      setPendingAction(null);
    }
  };

  const handleRegenerateToken = async () => {
    const prevToken = token;
    const nextToken = generateRandomToken();
    setToken(nextToken);
    const ok = await persistQrConfig(
      { token: nextToken },
      'Generated a fresh QR code revision token.',
    );
    if (!ok) {
      setToken(prevToken);
    }
    if (mountedRef.current) {
      setPendingAction(null);
    }
  };

  const handleSaveColors = async () => {
    await persistQrConfig(
      { fgColor, bgColor, includeLogo },
      'QR appearance saved.',
    );
  };

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    downloadQrPng(canvasRef.current, business.slug);
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    setError(null);
    try {
      await downloadQrPdf({
        businessName: business.name,
        category: business.category,
        welcomeMessage: business.branding.welcomeMessage,
        reviewUrl,
        fgColor,
        bgColor,
        primaryColor: business.branding.primaryColor,
        includeLogo,
        logoSrc: business.logoDataUrl,
        slug: business.slug,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate PDF poster.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopyUrl = async () => {
    setError(null);
    const ok = await copyToClipboard(reviewUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 2000);
    } else {
      setError('Unable to copy QR link automatically. Please copy it from the URL box.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Live QR Preview & Downloads */}
      <div className="lg:col-span-5 liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center">
        <div className="w-full flex items-center justify-between text-xs mb-6">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            {isActive ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Active</span>
              </>
            ) : (
              <>
                <PauseCircle className="w-4 h-4 text-amber-600" />
                <span>Paused</span>
              </>
            )}
          </span>
          <span className="font-mono text-slate-500">Rev {token}</span>
        </div>

        <div
          className={`p-5 rounded-2xl border border-slate-200 transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-50'
          }`}
          style={{ backgroundColor: bgColor }}
        >
          <canvas ref={canvasRef} className="w-60 h-60 sm:w-64 sm:h-64 block" />
        </div>

        <div className="mt-5 space-y-1 max-w-full">
          <p className="font-semibold text-slate-900">{business.name}</p>
          <p className="font-mono text-xs text-slate-500 break-all">{reviewUrl}</p>
        </div>

        {isAdmin && (
          <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>Printable PDF</span>
            </button>
          </div>
        )}

        <div className="mt-4 w-full grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleCopyUrl}
            className="min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Link'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.pushState(
                { internalReviewNav: true },
                '',
                `/review/${business.slug}?v=${token}`,
              );
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Open Link</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {(publicBaseUrl.includes('localhost') || publicBaseUrl.includes('127.0.0.1')) && (
          <p className="mt-4 text-[11px] text-slate-500 leading-relaxed text-left bg-slate-50 border border-slate-200 rounded-xl p-3">
            Local environment detected. Set <span className="font-mono">VITE_PUBLIC_APP_URL</span> to your live domain so printed QR codes resolve on customer phones.
          </p>
        )}
      </div>

      {/* Right: Customization & Lifecycle Controls */}
      <div className="lg:col-span-7 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-900">
              QR Appearance &amp; Branding
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Customize your code colors and center emblem before exporting PNG or A4 tabletop PDFs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="qr-fg-color-hex" className="block text-xs font-medium text-slate-700 mb-2">
                QR Foreground Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="QR Foreground Color Picker"
                  value={/^#[0-9a-fA-F]{6}$/.test(fgColor) ? fgColor : '#0F172A'}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setFgColor(e.target.value);
                  }}
                  className="w-11 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
                />
                <input
                  id="qr-fg-color-hex"
                  type="text"
                  aria-label="QR Foreground Color Hex Code"
                  value={fgColor}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setFgColor(e.target.value);
                  }}
                  className="flex-1 h-10 px-3 rounded-lg border border-slate-200 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="qr-bg-color-hex" className="block text-xs font-medium text-slate-700 mb-2">
                Background Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="QR Background Color Picker"
                  value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : '#FFFFFF'}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setBgColor(e.target.value);
                  }}
                  className="w-11 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
                />
                <input
                  id="qr-bg-color-hex"
                  type="text"
                  aria-label="QR Background Color Hex Code"
                  value={bgColor}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setBgColor(e.target.value);
                  }}
                  className="flex-1 h-10 px-3 rounded-lg border border-slate-200 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-sm font-medium text-slate-900">Embed Business Logo in QR</p>
              <p className="text-xs text-slate-500">
                Places your uploaded logo in the center using high error-correction encoding.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Embed Business Logo in QR"
              aria-checked={includeLogo}
              disabled={!business.logoDataUrl}
              onClick={() => {
                isDirtyRef.current = true;
                setIncludeLogo((prev) => !prev);
              }}
              className={`w-12 h-7 rounded-full transition-colors p-1 cursor-pointer disabled:opacity-40 ${
                includeLogo && business.logoDataUrl ? 'bg-teal-700' : 'bg-slate-200'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                  includeLogo && business.logoDataUrl ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-2 flex items-center justify-between gap-4">
            <span className="text-xs text-emerald-700 font-medium">{statusMessage ?? ''}</span>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveColors}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save QR Styling</span>
            </button>
          </div>
        </div>

        {/* Lifecycle Controls (Business Management Only) */}
        {isAdmin && (
          <div className="liquid-glass spatial-card-3d rounded-2xl p-6 sm:p-8 space-y-5">
            <h2 className="text-lg font-display font-bold text-slate-900">QR Status &amp; Replacement</h2>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {isActive ? 'QR Code is Active' : 'QR Code is Paused'}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isActive
                    ? 'Customers scanning this code can complete your form and open Google Reviews.'
                    : 'Scanning is temporarily disabled and visitors see a paused notice.'}
                </p>
              </div>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setPendingAction('toggle_pause')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                {isActive ? 'Pause QR Code' : 'Activate QR Code'}
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Regenerate Damaged QR Code</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Rotates the QR revision token when replacing worn, scratched, or tampered printouts.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setPendingAction('regenerate')}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate QR</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <TypedConfirmModal
        open={pendingAction === 'toggle_pause'}
        title={isActive ? 'Pause QR Code?' : 'Activate QR Code?'}
        description={
          isActive
            ? `Pausing the QR code will immediately show a paused notice to all customers scanning ${business.name}'s QR code.`
            : `Activating the QR code will re-enable customer reviews for ${business.name}.`
        }
        requiredKeyword={isActive ? 'PAUSE' : 'ACTIVATE'}
        confirmLabel={isActive ? 'Pause QR Code' : 'Activate QR Code'}
        tone="warning"
        isBusy={isSaving}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleToggleActive}
      />

      <TypedConfirmModal
        open={pendingAction === 'regenerate'}
        title="Regenerate QR Token?"
        description="Rotating the QR token invalidates older printed QR stickers with a stale-token notice and updates new downloads."
        requiredKeyword="REGENERATE"
        confirmLabel="Regenerate QR"
        tone="danger"
        isBusy={isSaving}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleRegenerateToken}
      />
    </div>
  );
}

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
import { downloadQrPdf, downloadQrPng, renderQrToCanvas } from '../utils/qrAndPdf';

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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setFgColor(business.qrConfig.fgColor);
    setBgColor(business.qrConfig.bgColor);
    setIncludeLogo(business.qrConfig.includeLogo);
    setIsActive(business.qrConfig.isActive);
    setToken(business.qrConfig.token);
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
  ) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await updateBusiness(
        business,
        {
          qrConfig: {
            isActive: nextConfig.isActive ?? isActive,
            fgColor: nextConfig.fgColor ?? fgColor,
            bgColor: nextConfig.bgColor ?? bgColor,
            token: nextConfig.token ?? token,
            includeLogo: nextConfig.includeLogo ?? includeLogo,
          },
        },
        { isAdmin },
      );
      setStatusMessage(feedbackText);
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    const nextActive = !isActive;
    setIsActive(nextActive);
    await persistQrConfig(
      { isActive: nextActive },
      nextActive ? 'QR code activated for customer scans.' : 'QR code paused.',
    );
  };

  const handleRegenerateToken = async () => {
    const nextToken = generateRandomToken();
    setToken(nextToken);
    await persistQrConfig(
      { token: nextToken },
      'Generated a fresh QR code revision token.',
    );
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
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Live QR Preview & Downloads */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col items-center text-center">
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

        <div className="mt-3 w-full grid grid-cols-2 gap-3">
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
              window.history.pushState({}, '', `/review/${business.slug}?v=${token}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Open Link</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        {publicBaseUrl.startsWith('https://ais-dev-') && (
          <p className="mt-4 text-[11px] text-slate-500 leading-relaxed text-left bg-slate-50 border border-slate-200 rounded-xl p-3">
            Note: You are viewing a private AI Studio dev preview (<span className="font-mono">ais-dev-...</span>). Customers scanning QR codes on phones need the published Shared App URL (<span className="font-mono">ais-pre-...</span>) or your custom domain (<span className="font-mono">VITE_PUBLIC_APP_URL</span>).
          </p>
        )}
      </div>

      {/* Right: Customization & Lifecycle Controls */}
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
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
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Foreground Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-11 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
                />
                <input
                  type="text"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-lg border border-slate-200 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Background Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-11 h-10 rounded-lg border border-slate-200 p-1 bg-white cursor-pointer"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
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
              aria-checked={includeLogo}
              disabled={!business.logoDataUrl}
              onClick={() => setIncludeLogo((prev) => !prev)}
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

        {/* Lifecycle Controls */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-5">
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
              onClick={handleToggleActive}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
              }`}
            >
              {isActive ? 'Pause QR Code' : 'Activate QR Code'}
            </button>
          </div>

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
              onClick={handleRegenerateToken}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate QR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

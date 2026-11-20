import { useMemo } from 'react';
import { Check, Copy, ExternalLink, QrCode, CheckCircle2, PauseCircle } from 'lucide-react';
import { useState } from 'react';
import type { Business, ReviewEvent } from '../types';

interface OverviewTabProps {
  business: Business;
  events: ReviewEvent[];
  onNavigateTab: (tab: 'overview' | 'qr' | 'questions' | 'branding' | 'preview') => void;
}

function formatEventTime(createdAt: unknown): string {
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

export function OverviewTab({ business, events, onNavigateTab }: OverviewTabProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const businessEvents = useMemo(
    () => events.filter((ev) => ev.businessId === business.id),
    [events, business.id],
  );

  const stats = useMemo(() => {
    const scans = businessEvents.filter((e) => e.eventType === 'scan').length;
    const generated = businessEvents.filter((e) => e.eventType === 'generate').length;
    const redirects = businessEvents.filter((e) => e.eventType === 'copy_redirect').length;
    const conversion = scans > 0 ? Math.round((redirects / scans) * 100) : 0;

    const styleCounts = {
      short: 0,
      detailed: 0,
      professional: 0,
    };
    const sentimentCounts: Record<string, number> = {};

    for (const ev of businessEvents) {
      if (ev.eventType === 'generate') {
        if (ev.reviewStyle === 'short' || ev.reviewStyle === 'detailed' || ev.reviewStyle === 'professional') {
          styleCounts[ev.reviewStyle] += 1;
        }
        if (ev.sentiment) {
          sentimentCounts[ev.sentiment] = (sentimentCounts[ev.sentiment] || 0) + 1;
        }
      }
    }

    return {
      scans,
      generated,
      redirects,
      conversion,
      styleCounts,
      sentimentCounts,
    };
  }, [businessEvents]);

  const liveUrl = `${window.location.origin}/review/${business.slug}?v=${business.qrConfig.token}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Quick Share Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
              {business.qrConfig.isActive ? (
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
            <span>{business.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{business.questions.length} questions</span>
          </div>
          <p className="font-mono text-sm text-slate-700 truncate">{liveUrl}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyUrl}
            className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied URL' : 'Copy Review Link'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.history.pushState(
                { internalReviewNav: true },
                '',
                `/review/${business.slug}?v=${business.qrConfig.token}`,
              );
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>Open Customer Page</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4-Column Tabular KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Total QR Scans</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.scans}
          </p>
          <p className="mt-1 text-xs text-slate-500">Live customer form visits</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">AI Drafts Generated</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.generated}
          </p>
          <p className="mt-1 text-xs text-slate-500">Personalized review drafts</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Google Redirects</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.redirects}
          </p>
          <p className="mt-1 text-xs text-slate-500">Copied &amp; opened Google</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-medium text-slate-500">Scan-to-Google Rate</p>
          <p className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
            {stats.conversion}%
          </p>
          <p className="mt-1 text-xs text-slate-500">Completed redirect funnel</p>
        </div>
      </div>

      {/* Breakdown & Recent Activity */}
      {businessEvents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
          <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">No QR scans recorded yet</h3>
            <p className="text-sm text-slate-600">
              Download your printable PDF poster from the QR Studio or open your live customer page to test the complete review flow.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigateTab('qr')}
              className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold cursor-pointer"
            >
              Open QR Studio
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('preview')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium cursor-pointer"
            >
              Preview Customer Form
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Preferred Review Styles</h3>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Short & Simple', count: stats.styleCounts.short },
                  { label: 'Natural & Detailed', count: stats.styleCounts.detailed },
                  { label: 'Professional', count: stats.styleCounts.professional },
                ].map((row) => {
                  const total = Math.max(1, stats.generated);
                  const pct = Math.round((row.count / total) * 100);
                  return (
                    <div key={row.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{row.label}</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {row.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-teal-700 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {Object.keys(stats.sentimentCounts).length > 0 && (
              <div className="pt-5 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Experience Ratings</h3>
                <div className="mt-3 space-y-2">
                  {Object.entries(stats.sentimentCounts).map(([label, count]) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{label}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Recent Customer Activity</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                Last {Math.min(15, businessEvents.length)} events
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                    <th className="py-2.5 px-6">Action</th>
                    <th className="py-2.5 px-4">Style</th>
                    <th className="py-2.5 px-4">Highlights</th>
                    <th className="py-2.5 px-6 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {businessEvents.slice(0, 15).map((ev) => {
                    const actionLabel =
                      ev.eventType === 'scan'
                        ? 'QR Scan'
                        : ev.eventType === 'generate'
                          ? 'AI Draft Created'
                          : 'Opened Google Review';
                    return (
                      <tr key={ev.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-6 font-medium text-slate-900 whitespace-nowrap">
                          {actionLabel}
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
                          {formatEventTime(ev.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

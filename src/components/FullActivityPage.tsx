import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  QrCode,
  Search,
  Sparkles,
} from 'lucide-react';
import type { ReviewDraft, ReviewEvent, ReviewEventType } from '../types';
import { getTimestampMs } from '../utils/domainHelpers';

export type ActivityPeriod = 'daily' | '7d' | '1m' | 'date' | 'all';
export type ActivityFilterTab = 'all' | 'ai_drafted' | 'copy_redirect' | 'scan' | 'form_start';

interface FullActivityPageProps {
  title?: string;
  subtitle?: string;
  events: ReviewEvent[];
  reviewDrafts?: ReviewDraft[];
  businessMap?: Record<string, string>;
  businessOptions?: Array<{ id: string; name: string }>;
  isDark?: boolean;
  initialFilter?: ActivityFilterTab;
  initialPeriod?: ActivityPeriod;
  onBack?: () => void;
  backLabel?: string;
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateTime(ts: unknown): string {
  const ms = getTimestampMs(ts);
  if (!ms) return 'Recent';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(ts: unknown): string {
  const ms = getTimestampMs(ts);
  if (!ms) return 'Just now';
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function formatLangBadge(lang?: string): string {
  if (lang === 'hi') return 'हिंदी';
  if (lang === 'mr') return 'मराठी';
  if (lang === 'hinglish') return 'Hinglish';
  if (lang === 'en') return 'English';
  return '—';
}

function isInstantHighlight(highlights?: string[]): boolean {
  return (
    Array.isArray(highlights) &&
    (highlights.includes('instant-ai-draft') || highlights.includes('Mode: Ready AI Drafts'))
  );
}

function getEventBadgeMeta(type: ReviewEventType, isDark: boolean) {
  switch (type) {
    case 'scan':
      return {
        label: 'QR Scanned',
        cls: isDark ? 'bg-[#818CF8]/20 text-[#A5B4FC]' : 'bg-indigo-50 text-indigo-700',
      };
    case 'form_start':
      return {
        label: 'Form Started',
        cls: isDark ? 'bg-[#FBBF24]/20 text-[#FDE68A]' : 'bg-amber-50 text-amber-700',
      };
    case 'generate':
      return {
        label: 'AI Drafted',
        cls: isDark ? 'bg-[#F472B6]/20 text-[#F9A8D4]' : 'bg-pink-50 text-pink-700',
      };
    case 'copy_redirect':
      return {
        label: 'Google Redirect',
        cls: isDark ? 'bg-[#34D399]/20 text-[#6EE7B7]' : 'bg-emerald-50 text-emerald-700',
      };
  }
}

export function FullActivityPage({
  title = 'Full Activity & AI Draft History',
  subtitle = 'Complete history of generated reviews, Ready AI drafts, Google redirects, and QR scans',
  events,
  reviewDrafts = [],
  businessMap,
  businessOptions,
  isDark = false,
  initialFilter = 'all',
  initialPeriod = '7d',
  onBack,
  backLabel = 'Back to Analytics',
}: FullActivityPageProps) {
  const todayIso = useMemo(() => toLocalDateStr(new Date()), []);
  const [period, setPeriod] = useState<ActivityPeriod>(initialPeriod);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [filterTab, setFilterTab] = useState<ActivityFilterTab>(initialFilter);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const periodWindow = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (period === 'daily') {
      return { startMs: startOfToday, endMs: startOfToday + 86400000 - 1, label: 'Today' };
    }
    if (period === '7d') {
      const start7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
      return { startMs: start7, endMs: startOfToday + 86400000 - 1, label: 'Last 7 days' };
    }
    if (period === '1m') {
      const start30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
      return { startMs: start30, endMs: startOfToday + 86400000 - 1, label: 'Last 30 days' };
    }
    if (period === 'date') {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const s = y && m && d ? new Date(y, m - 1, d).getTime() : startOfToday;
      return { startMs: s, endMs: s + 86400000 - 1, label: selectedDate };
    }
    return { startMs: 0, endMs: Number.MAX_SAFE_INTEGER, label: 'All time' };
  }, [period, selectedDate]);

  const inPeriodAndBusinessEvents = useMemo(() => {
    return events.filter((ev) => {
      if (selectedBusinessId !== 'all' && ev.businessId !== selectedBusinessId) {
        return false;
      }
      if (period === 'all') return true;
      const ms = getTimestampMs(ev.createdAt);
      if (!ms) return false;
      if (period === 'daily') return toLocalDateStr(new Date(ms)) === todayIso;
      if (period === 'date') return toLocalDateStr(new Date(ms)) === selectedDate;
      return ms >= periodWindow.startMs && ms <= periodWindow.endMs;
    });
  }, [events, selectedBusinessId, period, selectedDate, todayIso, periodWindow]);

  const inPeriodAndBusinessDrafts = useMemo(() => {
    return reviewDrafts.filter((d) => {
      if (selectedBusinessId !== 'all' && d.businessId !== selectedBusinessId) {
        return false;
      }
      if (period === 'all') return true;
      const ms = getTimestampMs(d.createdAt);
      if (!ms) return true;
      if (period === 'daily') return toLocalDateStr(new Date(ms)) === todayIso;
      if (period === 'date') return toLocalDateStr(new Date(ms)) === selectedDate;
      return ms >= periodWindow.startMs && ms <= periodWindow.endMs;
    });
  }, [reviewDrafts, selectedBusinessId, period, selectedDate, todayIso, periodWindow]);

  const tabCounts = useMemo(() => {
    const scanCount = inPeriodAndBusinessEvents.filter((e) => e.eventType === 'scan').length;
    const formCount = inPeriodAndBusinessEvents.filter((e) => e.eventType === 'form_start').length;
    const aiEventCount = inPeriodAndBusinessEvents.filter((e) => e.eventType === 'generate').length;
    const redirectCount = inPeriodAndBusinessEvents.filter(
      (e) => e.eventType === 'copy_redirect',
    ).length;
    return {
      all: inPeriodAndBusinessEvents.length,
      ai_drafted: aiEventCount,
      copy_redirect: redirectCount,
      scan: scanCount,
      form_start: formCount,
    };
  }, [inPeriodAndBusinessEvents]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inPeriodAndBusinessEvents.filter((ev) => {
      if (filterTab === 'ai_drafted' && ev.eventType !== 'generate') return false;
      if (
        (filterTab === 'copy_redirect' || filterTab === 'scan' || filterTab === 'form_start') &&
        ev.eventType !== filterTab
      ) {
        return false;
      }
      if (!q) return true;
      const bizName = businessMap?.[ev.businessId] ?? '';
      const hay = [
        bizName,
        ev.slug,
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
  }, [inPeriodAndBusinessEvents, filterTab, searchQuery, businessMap]);

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inPeriodAndBusinessDrafts.filter((d) => {
      if (!q) return true;
      const bizName = businessMap?.[d.businessId] ?? '';
      const hay = [bizName, d.slug, d.reviewText, d.language, d.reviewStyle, d.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [inPeriodAndBusinessDrafts, searchQuery, businessMap]);

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows: string[] = [];
    rows.push(
      ['Timestamp', 'Business', 'Event Type', 'Flow Mode', 'Tone', 'Language', 'Stand', 'Highlights']
        .map(escapeCsv)
        .join(','),
    );
    for (const ev of filteredEvents) {
      rows.push(
        [
          formatDateTime(ev.createdAt),
          businessMap?.[ev.businessId] || ev.slug,
          ev.eventType,
          isInstantHighlight(ev.selectedHighlights) ? 'Ready AI Drafts' : 'Guided Questions',
          ev.reviewStyle || '',
          ev.language || '',
          ev.standName || ev.standCode || 'Direct QR',
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
    a.download = `reviewflow-full-activity-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardCls = isDark
    ? 'bg-[#181820] border border-white/[0.08]'
    : 'bg-white border border-slate-200/85 shadow-xs';
  const subCardCls = isDark ? 'bg-[#121218] border border-white/[0.07]' : 'bg-slate-50 border border-slate-200/80';
  const borderHairline = isDark ? 'border-white/[0.07]' : 'border-slate-200';
  const textPrimary = isDark ? 'text-[#F4F4F7]' : 'text-slate-900';
  const textMuted = isDark ? 'text-[#8E8EA0]' : 'text-slate-500';
  const pillActive = isDark ? 'bg-[#252532] text-white font-semibold' : 'bg-slate-900 text-white font-semibold';
  const pillIdle = isDark
    ? 'text-[#8E8EA0] hover:text-white hover:bg-white/[0.05]'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';

  const showGeneratedDraftsList =
    (filterTab === 'ai_drafted' || filterTab === 'all') && filteredDrafts.length > 0;

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className={`${cardCls} rounded-2xl p-4 sm:p-5 space-y-4`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className={`mt-0.5 px-3 py-1.5 rounded-xl border ${borderHairline} text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  isDark
                    ? 'bg-[#121218] hover:bg-[#252532] text-white'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{backLabel}</span>
              </button>
            )}
            <div className="min-w-0">
              <h1 className={`font-display text-base sm:text-lg font-bold truncate ${textPrimary}`}>
                {title}
              </h1>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                {subtitle} · {periodWindow.label}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className={`inline-flex flex-wrap items-center gap-1 p-1 rounded-xl ${isDark ? 'bg-[#121218]' : 'bg-slate-100'}`}>
              <Calendar className={`w-3.5 h-3.5 ml-1.5 mr-0.5 ${textMuted}`} />
              {(
                [
                  { id: 'daily', label: 'Daily' },
                  { id: '7d', label: '7D' },
                  { id: '1m', label: '1M' },
                  { id: 'date', label: 'Date' },
                  { id: 'all', label: 'All' },
                ] as { id: ActivityPeriod; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPeriod(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    period === opt.id ? pillActive : pillIdle
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {period === 'date' && (
              <input
                type="date"
                value={selectedDate}
                max={todayIso}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                aria-label="Filter full activity date"
                className={`px-2.5 py-1.5 rounded-xl border text-xs ${
                  isDark ? 'bg-[#121218] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              className={`px-3 py-1.5 rounded-xl border ${borderHairline} text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                isDark ? 'bg-[#252532] hover:bg-[#2E2E3E] text-white' : 'bg-white hover:bg-slate-50 text-slate-800'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs + Search + Business Filter */}
        <div className={`pt-3 border-t ${borderHairline} flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All Activity', count: tabCounts.all, icon: FileText },
                { id: 'ai_drafted', label: 'AI Drafted & Generated', count: tabCounts.ai_drafted, icon: Sparkles },
                { id: 'copy_redirect', label: 'Google Redirect', count: tabCounts.copy_redirect, icon: ExternalLink },
                { id: 'scan', label: 'QR Scanned', count: tabCounts.scan, icon: QrCode },
                { id: 'form_start', label: 'Form Started', count: tabCounts.form_start, icon: FileText },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    active ? pillActive : `${subCardCls} ${textPrimary}`
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  <span className="font-mono text-[11px] opacity-80 tabular-nums">({tab.count})</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {businessOptions && businessOptions.length > 1 && (
              <select
                value={selectedBusinessId}
                onChange={(e) => setSelectedBusinessId(e.target.value)}
                aria-label="Filter by business"
                className={`h-9 px-3 rounded-xl border text-xs font-medium ${
                  isDark
                    ? 'bg-[#121218] border-white/10 text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <option value="all">All Businesses ({businessOptions.length})</option>
                {businessOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <div className="relative min-w-[210px] flex-1 sm:flex-initial">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stand, text, language..."
                className={`w-full h-9 pl-8 pr-3 rounded-xl border text-xs ${
                  isDark
                    ? 'bg-[#121218] border-white/10 text-white placeholder:text-slate-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Generated Review Drafts Text History (from Guided Questions) */}
      {showGeneratedDraftsList && (
        <div className={`${cardCls} rounded-2xl overflow-hidden`}>
          <div className={`px-5 py-3.5 border-b ${borderHairline} flex items-center justify-between gap-2`}>
            <div>
              <h2 className={`font-display text-sm font-bold ${textPrimary}`}>
                Generated AI Review Drafts ({filteredDrafts.length})
              </h2>
              <p className={`text-xs ${textMuted}`}>
                Full review text generated from customer answers, with status &amp; language.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-200/10 max-h-[380px] overflow-y-auto rf-scrollbar-hidden">
            {filteredDrafts.slice(0, 60).map((draft) => (
              <div
                key={draft.id}
                className={`p-4 sm:px-5 space-y-2 border-b last:border-b-0 ${borderHairline}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    {businessMap?.[draft.businessId] && (
                      <span className={`font-semibold ${textPrimary}`}>
                        {businessMap[draft.businessId]}
                      </span>
                    )}
                    <span
                      lang={draft.language}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        isDark ? 'bg-[#F472B6]/20 text-[#F9A8D4]' : 'bg-pink-50 text-pink-700'
                      }`}
                    >
                      {formatLangBadge(draft.language)}
                    </span>
                    <span className={`capitalize text-[11px] ${textMuted}`}>
                      Tone: {draft.reviewStyle}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        draft.status === 'Copied'
                          ? isDark
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-emerald-50 text-emerald-700'
                          : isDark
                            ? 'bg-white/10 text-slate-300'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {draft.status}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono ${textMuted}`}>
                    {formatDateTime(draft.createdAt)} · {formatRelative(draft.createdAt)}
                  </span>
                </div>
                <p
                  lang={draft.language}
                  className={`text-xs sm:text-sm leading-relaxed review-text-multilingual ${
                    isDark ? 'text-slate-200' : 'text-slate-700'
                  }`}
                >
                  {draft.reviewText}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Activity Event Table (Ready AI Drafts, Guided AI Drafted, Google Redirect, QR Scans) */}
      <div className={`${cardCls} rounded-2xl overflow-hidden`}>
        <div className={`px-5 py-3.5 border-b ${borderHairline} flex items-center justify-between gap-2`}>
          <h2 className={`font-display text-sm font-bold ${textPrimary}`}>
            Live Activity Feed ({filteredEvents.length})
          </h2>
          <span className={`text-xs font-mono ${textMuted}`}>
            Showing latest {Math.min(200, filteredEvents.length)} events
          </span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className={`p-10 text-center text-sm ${textMuted}`}>
            No matching activity recorded in {periodWindow.label}.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[540px] overflow-y-auto rf-scrollbar-hidden">
            <table className="w-full text-left border-collapse">
              <thead
                className={`sticky top-0 z-10 ${
                  isDark ? 'bg-[#121218] text-[#8E8EA0]' : 'bg-slate-50 text-slate-500'
                }`}
              >
                <tr className={`border-b ${borderHairline} text-[11px] font-semibold uppercase tracking-wider`}>
                  <th className="py-3 px-5">Event</th>
                  {businessMap && <th className="py-3 px-4">Business</th>}
                  <th className="py-3 px-4">Source / Stand</th>
                  <th className="py-3 px-4">Mode &amp; Tone</th>
                  <th className="py-3 px-4">Language</th>
                  <th className="py-3 px-4">Details / Highlights</th>
                  <th className="py-3 px-5 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {filteredEvents.slice(0, 200).map((ev) => {
                  const badge = getEventBadgeMeta(ev.eventType, isDark);
                  const instant = isInstantHighlight(ev.selectedHighlights);
                  return (
                    <tr
                      key={ev.id}
                      className={`border-b last:border-b-0 ${borderHairline} ${
                        isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3 px-5 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      {businessMap && (
                        <td className={`py-3 px-4 font-semibold whitespace-nowrap ${textPrimary}`}>
                          {businessMap[ev.businessId] || ev.slug}
                        </td>
                      )}
                      <td className={`py-3 px-4 font-medium whitespace-nowrap ${textPrimary}`}>
                        {ev.standName || ev.standCode || `/${ev.slug}`}
                      </td>
                      <td className={`py-3 px-4 whitespace-nowrap ${textMuted}`}>
                        {ev.eventType === 'generate' || ev.eventType === 'copy_redirect' ? (
                          <span>
                            {instant ? 'Ready AI Drafts' : 'Guided Form'}
                            {ev.reviewStyle ? ` · ${ev.reviewStyle}` : ''}
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span lang={ev.language} className={`font-medium ${textPrimary}`}>
                          {formatLangBadge(ev.language)}
                        </span>
                      </td>
                      <td className={`py-3 px-4 max-w-xs truncate ${textMuted}`}>
                        {ev.selectedHighlights?.length
                          ? ev.selectedHighlights.slice(0, 3).join(' · ')
                          : ev.sentiment || '—'}
                      </td>
                      <td className={`py-3 px-5 text-right font-mono tabular-nums whitespace-nowrap ${textMuted}`}>
                        <span>{formatDateTime(ev.createdAt)}</span>
                        <span className="ml-1.5 opacity-70">({formatRelative(ev.createdAt)})</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

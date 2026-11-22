import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileBarChart2,
  Loader2,
  Mail,
  Send,
  Sparkles,
} from 'lucide-react';
import type {
  AiUsageLog,
  Business,
  GbpReview,
  QrStand,
  ReviewEvent,
  WeeklyReport,
} from '../types';
import { updateBusiness } from '../services/businessService';
import {
  generateAndSaveWeeklyReport,
  getMondaySundayWindow,
  isMondayToday,
  markWeeklyReportDispatched,
  subscribeToBusinessAiUsage,
  subscribeToBusinessGbpReviews,
  subscribeToBusinessQrStands,
  subscribeToBusinessWeeklyReports,
} from '../services/platformFeaturesService';
import { downloadWeeklyReportPdf } from '../utils/qrAndPdf';

interface WeeklyReportsTabProps {
  business: Business;
  userUid: string;
  userEmail: string;
  isAdmin?: boolean;
  events: ReviewEvent[];
  canEdit: boolean;
}

export function WeeklyReportsTab({
  business,
  userUid,
  userEmail,
  isAdmin = false,
  events,
  canEdit,
}: WeeklyReportsTabProps) {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>('');
  const [qrStands, setQrStands] = useState<QrStand[]>([]);
  const [gbpReviews, setGbpReviews] = useState<GbpReview[]>([]);
  const [aiLogs, setAiLogs] = useState<AiUsageLog[]>([]);
  const [weekChoice, setWeekChoice] = useState<'previous' | 'current'>('current');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [recipientInput, setRecipientInput] = useState(
    (business.weeklyReportConfig?.recipients || [business.clientEmail]).filter(Boolean).join(', '),
  );
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setRecipientInput(
      (business.weeklyReportConfig?.recipients || [business.clientEmail]).filter(Boolean).join(', '),
    );
  }, [business.id, business.clientEmail, business.weeklyReportConfig?.recipients]);

  useEffect(() => {
    const u1 = subscribeToBusinessWeeklyReports(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      (items) => {
        setReports(items);
        if (items.length > 0 && !items.some((r) => r.id === selectedReportId)) {
          setSelectedReportId(items[0].id);
        }
      },
    );
    const u2 = subscribeToBusinessQrStands(business.id, userUid, userEmail, isAdmin, setQrStands);
    const u3 = subscribeToBusinessGbpReviews(business.id, userUid, userEmail, isAdmin, setGbpReviews);
    const u4 = subscribeToBusinessAiUsage(business.id, userUid, userEmail, isAdmin, setAiLogs);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [business.id, userUid, userEmail, isAdmin]);

  const activeReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null,
    [reports, selectedReportId],
  );

  const mondayToday = isMondayToday();

  const handleGenerateReport = async (choice: 'previous' | 'current') => {
    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const win = getMondaySundayWindow(choice === 'previous' ? -1 : 0);
      const existing = reports.find((r) => r.weekStart === win.weekStart);
      const saved = await generateAndSaveWeeklyReport({
        business,
        events,
        qrStands,
        gbpReviews,
        aiUsageLogs: aiLogs,
        generatedBy: userEmail || userUid,
        weekStart: win.weekStart,
        weekEnd: win.weekEnd,
        startMs: win.startMs,
        endMs: win.endMs,
        existingReport: existing,
      });
      setSelectedReportId(saved.id);
      setStatusMessage(
        `Weekly Business Report generated for ${win.weekStart} – ${win.weekEnd} (Monday–Sunday).`,
      );
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to generate weekly report.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveRecipientsAndDispatch = async () => {
    if (!activeReport) return;
    setIsDispatching(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const parsed = recipientInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
      if (parsed.length === 0) {
        throw new Error('Enter at least one valid contact email separated by commas.');
      }
      if (canEdit) {
        await updateBusiness(
          business,
          {
            weeklyReportConfig: {
              enabled: true,
              recipients: parsed,
              autoMondayEnabled: true,
              lastGeneratedWeekKey: activeReport.weekStart,
            },
          },
          { isAdmin },
        );
      }
      await markWeeklyReportDispatched(activeReport, parsed);
      setStatusMessage(`Weekly report archived & dispatched to: ${parsed.join(', ')}`);
      setTimeout(() => setStatusMessage(null), 4500);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to dispatch report.');
    } finally {
      setIsDispatching(false);
    }
  };

  const handleCopyPlainSummary = async () => {
    if (!activeReport) return;
    const rg = activeReport.reviewGenMetrics;
    const ar = activeReport.autoReplyMetrics;
    const ai = activeReport.aiUsageMetrics;
    const text = [
      `ReviewFlow Weekly Report — ${activeReport.businessName}`,
      `Week (Mon–Sun): ${activeReport.weekStart} to ${activeReport.weekEnd}`,
      '',
      '1. Review Generation Metrics:',
      `- Total QR Scans: ${rg.totalScans} (Unique Sessions: ${rg.uniqueSessions})`,
      `- Review Forms Started: ${rg.formsStarted}`,
      `- AI Drafts Generated: ${rg.draftsGenerated}`,
      `- Google Review Link Clicks: ${rg.googleRedirects}`,
      `- Confirmed Google Reviews: ${rg.confirmedGoogleReviews} (Avg Rating: ${rg.averageGoogleRating})`,
      `- Best QR Stand: ${rg.bestStandName} (${rg.bestStandScans} scans)`,
      `- Lowest QR Stand: ${rg.lowestStandName} (${rg.lowestStandScans} scans)`,
      '',
      '2. Google Business Profile AI Auto-Reply:',
      `- New Reviews: ${ar.totalNewReviews}`,
      `- AI Replies Generated: ${ar.aiRepliesGenerated}`,
      `- Auto-Published (5★): ${ar.autoPublished}`,
      `- Manually Approved: ${ar.manuallyApproved}`,
      `- Waiting Approval: ${ar.waitingApproval}`,
      `- Failed / Ignored: ${ar.failedReplies} failed, ${ar.ignoredReviews} ignored`,
      '',
      '3. AI Model Usage & Cost:',
      `- Requests: ${ai.totalRequests} (${ai.successfulRequests} ok / ${ai.failedRequests} failed)`,
      `- Total Tokens: ${ai.totalTokens.toLocaleString()}`,
      `- Estimated Cost: $${ai.estimatedCostUsd.toFixed(4)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Control Header */}
      <div className="liquid-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Automated Weekly Business Reports (Mon–Sun)
              </h2>
              {mondayToday && (
                <span className="px-2.5 py-0.5 rounded-md bg-[#f0fdfa] text-[#005c55] text-[11px] font-bold">
                  Monday Schedule Due
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Generates stored Monday–Sunday snapshots covering QR stand funnel analytics, GBP AI replies, and exact AI token &amp; cost totals with PDF download.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100">
              <button
                type="button"
                onClick={() => setWeekChoice('current')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  weekChoice === 'current'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Current Week
              </button>
              <button
                type="button"
                onClick={() => setWeekChoice('previous')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  weekChoice === 'previous'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Last Mon–Sun
              </button>
            </div>

            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleGenerateReport(weekChoice)}
              className="px-4 py-2 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Generate Report Snapshot</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {errorMessage}
          </div>
        )}
        {statusMessage && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {reports.length > 0 && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-[#005c55]" />
              <span className="text-xs font-semibold text-slate-700">Stored Weekly Snapshots:</span>
              <select
                value={activeReport?.id || ''}
                onChange={(e) => setSelectedReportId(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-900"
              >
                {reports.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.weekStart} to {rep.weekEnd}
                  </option>
                ))}
              </select>
            </div>

            {activeReport && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPlainSummary}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {copiedSummary ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Summary Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Text Summary</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadWeeklyReportPdf(activeReport)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF Report</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!activeReport ? (
        <div className="liquid-glass rounded-2xl p-10 text-center space-y-3">
          <FileBarChart2 className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            No Weekly Report Snapshots Stored Yet
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            Click &ldquo;Generate Report Snapshot&rdquo; above to compile real scan, QR stand, GBP reply, and AI token cost analytics for {business.name}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 7.1 Review Generation Report */}
          <div className="liquid-glass spatial-card-3d rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  1. Review Generation &amp; QR Stand Performance
                </h3>
                <p className="text-xs text-slate-500">
                  Window: {activeReport.weekStart} to {activeReport.weekEnd}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[#005c55] tabular-nums">
                Best: {activeReport.reviewGenMetrics.bestStandName} ({activeReport.reviewGenMetrics.bestStandScans})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {[
                { label: 'Total QR Scans', value: activeReport.reviewGenMetrics.totalScans },
                { label: 'Unique Sessions', value: activeReport.reviewGenMetrics.uniqueSessions },
                { label: 'Forms Started', value: activeReport.reviewGenMetrics.formsStarted },
                { label: 'AI Drafts Created', value: activeReport.reviewGenMetrics.draftsGenerated },
                { label: 'Google Link Clicks', value: activeReport.reviewGenMetrics.googleRedirects },
                {
                  label: 'Confirmed GBP Reviews',
                  value: activeReport.reviewGenMetrics.confirmedGoogleReviews,
                },
                {
                  label: 'Avg Google Rating',
                  value: `${activeReport.reviewGenMetrics.averageGoogleRating.toFixed(1)} ★`,
                },
                {
                  label: 'Lowest Stand',
                  value: `${activeReport.reviewGenMetrics.lowestStandName} (${activeReport.reviewGenMetrics.lowestStandScans})`,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70"
                >
                  <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums truncate">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 7.2 AI Auto Reply Report */}
          <div className="liquid-glass spatial-card-3d rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
              2. Google Business Profile AI Auto-Reply Report
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: 'New Reviews', value: activeReport.autoReplyMetrics.totalNewReviews },
                { label: 'AI Generated', value: activeReport.autoReplyMetrics.aiRepliesGenerated },
                { label: 'Auto-Published', value: activeReport.autoReplyMetrics.autoPublished },
                { label: 'Approved', value: activeReport.autoReplyMetrics.manuallyApproved },
                { label: 'Awaiting Review', value: activeReport.autoReplyMetrics.waitingApproval },
                { label: 'Failed', value: activeReport.autoReplyMetrics.failedReplies },
                { label: 'Ignored', value: activeReport.autoReplyMetrics.ignoredReviews },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/70"
                >
                  <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 7.3 AI Model Usage Report */}
          <div className="liquid-glass spatial-card-3d rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h3 className="font-display text-base font-bold text-slate-900">
                3. AI Model Usage &amp; Estimated Cost Report
              </h3>
              <span className="font-mono text-xs font-bold text-[#005c55] tabular-nums">
                {activeReport.aiUsageMetrics.totalTokens.toLocaleString()} tokens · $
                {activeReport.aiUsageMetrics.estimatedCostUsd.toFixed(4)}
              </span>
            </div>

            {activeReport.aiUsageMetrics.byModel.length === 0 ? (
              <p className="text-xs text-slate-500">
                No AI generation calls recorded within {activeReport.weekStart} – {activeReport.weekEnd}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-4">Provider</th>
                      <th className="py-2.5 px-4">Exact Model ID</th>
                      <th className="py-2.5 px-4 text-right">Requests</th>
                      <th className="py-2.5 px-4 text-right">Succeeded / Failed</th>
                      <th className="py-2.5 px-4 text-right">Tokens Used</th>
                      <th className="py-2.5 px-4 text-right">Estimated Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {activeReport.aiUsageMetrics.byModel.map((row) => (
                      <tr key={`${row.provider}-${row.modelId}`}>
                        <td className="py-2.5 px-4 font-semibold uppercase text-slate-700">
                          {row.provider}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-900">{row.modelId}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.count}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.successCount} / {row.failedCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                          {row.totalTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-[#005c55] tabular-nums">
                          ${row.estimatedCostUsd.toFixed(5)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 7.4 Contact Dispatch Log */}
          <div className="liquid-glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#005c55]" />
                  <span>Send Report to Authorized Business Contacts</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure Monday recipient contacts and record weekly report delivery in Firestore.
                </p>
              </div>
              {activeReport.dispatchedAt && (
                <span className="text-xs font-semibold text-emerald-700">
                  Last Dispatched: {new Date(activeReport.dispatchedAt).toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="owner@business.com, manager@business.com"
                className="flex-1 h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
              />
              <button
                type="button"
                disabled={isDispatching}
                onClick={handleSaveRecipientsAndDispatch}
                className="h-10 px-5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {isDispatching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Record &amp; Dispatch Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
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
import { apiFetch, formatApiError } from '../utils/apiClient';
import { copyToClipboard } from '../utils/clipboard';
import { parseAndValidateRecipientEmails } from '../utils/domainHelpers';
import { downloadWeeklyReportPdf } from '../utils/qrAndPdf';
import { useAutoDismiss } from '../hooks/useAutoDismiss';

interface WeeklyReportsTabProps {
  business: Business;
  userUid: string;
  userEmail: string;
  isAdmin?: boolean;
  showTokenUsage?: boolean;
  events: ReviewEvent[];
  canEdit: boolean;
}

export function WeeklyReportsTab({
  business,
  userUid,
  userEmail,
  isAdmin = false,
  showTokenUsage = false,
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
  const [pendingOverwriteChoice, setPendingOverwriteChoice] = useState<'previous' | 'current' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailNotConfiguredHint, setEmailNotConfiguredHint] = useState<string | null>(null);
  useAutoDismiss(statusMessage, () => setStatusMessage(null));
  useAutoDismiss(errorMessage, () => setErrorMessage(null));
  useAutoDismiss(emailNotConfiguredHint, () => setEmailNotConfiguredHint(null));
  const isRecipientsDirtyRef = useRef(false);
  const lastRecipientsSigRef = useRef<string>(
    JSON.stringify({
      id: business.id,
      val: (business.weeklyReportConfig?.recipients || [business.clientEmail])
        .filter(Boolean)
        .join(', '),
    }),
  );
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextVal = (business.weeklyReportConfig?.recipients || [business.clientEmail])
      .filter(Boolean)
      .join(', ');
    const prev = JSON.parse(lastRecipientsSigRef.current) as { id: string; val: string };
    if (prev.id !== business.id) {
      isRecipientsDirtyRef.current = false;
      lastRecipientsSigRef.current = JSON.stringify({ id: business.id, val: nextVal });
      setRecipientInput(nextVal);
      return;
    }
    if (!isRecipientsDirtyRef.current && prev.val !== nextVal) {
      lastRecipientsSigRef.current = JSON.stringify({ id: business.id, val: nextVal });
      setRecipientInput(nextVal);
    }
  }, [business.id, business.clientEmail, business.weeklyReportConfig?.recipients]);

  useEffect(() => {
    const handleSubError = (err: Error) => {
      setErrorMessage((prev) => prev || err?.message || 'Unable to load weekly report data.');
    };
    const u1 = subscribeToBusinessWeeklyReports(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      (items) => {
        setReports(items);
        setSelectedReportId((prev) =>
          prev && items.some((r) => r.id === prev) ? prev : items[0]?.id || '',
        );
      },
      handleSubError,
    );
    const u2 = subscribeToBusinessQrStands(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      setQrStands,
      handleSubError,
    );
    const u3 = subscribeToBusinessGbpReviews(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      setGbpReviews,
      handleSubError,
    );
    const u4 = subscribeToBusinessAiUsage(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      setAiLogs,
      handleSubError,
    );
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

  const handleGenerateReport = async (
    choice: 'previous' | 'current',
    overwriteConfirmed = false,
  ) => {
    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setPendingOverwriteChoice(null);
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
        overwriteConfirmed,
      });
      setSelectedReportId(saved.id);
      setStatusMessage(
        `Weekly Business Report generated for ${win.weekStart} – ${win.weekEnd} (Monday–Sunday).`,
      );
      setTimeout(() => {
        if (mountedRef.current) setStatusMessage(null);
      }, 4000);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Unable to generate weekly report.';
      if (rawMsg.startsWith('DISPATCHED_REPORT_EXISTS:')) {
        setPendingOverwriteChoice(choice);
        setErrorMessage(rawMsg.replace('DISPATCHED_REPORT_EXISTS:', ''));
      } else {
        setErrorMessage(rawMsg);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const buildPlainSummaryText = (report: WeeklyReport, includeTokens: boolean) => {
    const rg = report.reviewGenMetrics;
    const ar = report.autoReplyMetrics;
    const ai = report.aiUsageMetrics;
    const lines = [
      `ReviewFlow Weekly Report — ${report.businessName}`,
      `Week (Mon–Sun): ${report.weekStart} to ${report.weekEnd}`,
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
    ];
    if (includeTokens) {
      lines.push(
        '',
        '3. AI Model Usage & Cost:',
        `- Requests: ${ai.totalRequests} (${ai.successfulRequests} ok / ${ai.failedRequests} failed)`,
        `- Total Tokens: ${ai.totalTokens.toLocaleString()}`,
        `- Estimated Cost: $${ai.estimatedCostUsd.toFixed(4)}`,
      );
    }
    return lines.join('\n');
  };

  const buildMailtoHref = (report: WeeklyReport, rawRecipients: string) => {
    const parsed = rawRecipients
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    const to = parsed.join(',');
    const subject = encodeURIComponent(
      `ReviewFlow Weekly Report — ${report.businessName} (${report.weekStart} to ${report.weekEnd})`,
    );
    const body = encodeURIComponent(buildPlainSummaryText(report, showTokenUsage));
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const recipientValidation = useMemo(
    () => parseAndValidateRecipientEmails(recipientInput),
    [recipientInput],
  );

  const handleSaveRecipientsAndDispatch = async () => {
    if (!activeReport) return;
    setIsDispatching(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setEmailNotConfiguredHint(null);
    try {
      if (!recipientValidation.ok) {
        throw new Error(recipientValidation.error);
      }
      const parsed = recipientValidation.emails;
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

      const dispatchRes = await apiFetch('/api/weekly-report-dispatch', {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          businessId: business.id,
          recipients: parsed,
          includeAiUsage: showTokenUsage,
          report: activeReport,
        }),
      });
      const dispatchData = (await dispatchRes.json().catch(() => ({}))) as {
        emailSent?: boolean;
        configured?: boolean;
        provider?: string;
        message?: string;
        error?: string;
      };

      if (!dispatchRes.ok) {
        throw new Error(
          dispatchData.error ||
            formatApiError(null, `Failed to send weekly report email (HTTP ${dispatchRes.status}).`),
        );
      }

      isRecipientsDirtyRef.current = false;
      lastRecipientsSigRef.current = JSON.stringify({
        id: business.id,
        val: parsed.join(', '),
      });

      if (dispatchData.emailSent) {
        await markWeeklyReportDispatched(activeReport, parsed);
        setStatusMessage(
          `Weekly report emailed successfully to ${parsed.join(', ')}${dispatchData.provider ? ` via ${dispatchData.provider.toUpperCase()}` : ''}.`,
        );
        setTimeout(() => {
          if (mountedRef.current) setStatusMessage(null);
        }, 5000);
      } else {
        setEmailNotConfiguredHint(
          dispatchData.message ||
            'Recipient list saved, but no email provider (RESEND_API_KEY or SMTP) is configured on the server yet.',
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to send report email.');
    } finally {
      setIsDispatching(false);
    }
  };

  const handleCopyPlainSummary = async () => {
    if (!activeReport) return;
    setErrorMessage(null);
    const text = buildPlainSummaryText(activeReport, showTokenUsage);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSummary(true);
      setTimeout(() => {
        if (mountedRef.current) setCopiedSummary(false);
      }, 2500);
    } else {
      setErrorMessage('Unable to copy summary to clipboard in this browser context.');
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
              {showTokenUsage
                ? 'Generates stored Monday–Sunday snapshots covering QR stand funnel analytics, GBP AI replies, and exact AI token & cost totals with PDF download.'
                : 'Generates stored Monday–Sunday snapshots covering QR stand funnel analytics and Google Business Profile AI replies with PDF download.'}
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
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex flex-wrap items-center justify-between gap-2">
            <span>{errorMessage}</span>
            {pendingOverwriteChoice && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateReport(pendingOverwriteChoice, true)}
                  className="px-3 py-1 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer"
                >
                  Confirm Overwrite &amp; Regenerate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingOverwriteChoice(null);
                    setErrorMessage(null);
                  }}
                  className="px-2.5 py-1 rounded-lg border border-red-300 bg-white text-red-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
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
              <label htmlFor="weekly-report-snapshot-select" className="text-xs font-semibold text-slate-700">
                Stored Weekly Snapshots:
              </label>
              <select
                id="weekly-report-snapshot-select"
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
                  onClick={() => {
                    setErrorMessage(null);
                    try {
                      Promise.resolve(
                        downloadWeeklyReportPdf(activeReport, { includeAiUsage: showTokenUsage }),
                      ).catch((err) =>
                        setErrorMessage(
                          err instanceof Error
                            ? err.message
                            : 'Unable to download weekly PDF report.',
                        ),
                      );
                    } catch (err) {
                      setErrorMessage(
                        err instanceof Error
                          ? err.message
                          : 'Unable to download weekly PDF report.',
                      );
                    }
                  }}
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
            {showTokenUsage
              ? `Click "Generate Report Snapshot" above to compile real scan, QR stand, GBP reply, and AI token cost analytics for ${business.name}.`
              : `Click "Generate Report Snapshot" above to compile real scan, QR stand, and GBP reply analytics for ${business.name}.`}
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

          {/* 7.3 AI Model Usage Report (Business Management Portal Only) */}
          {showTokenUsage && (
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
          )}

          {/* 7.4 Contact Dispatch Log */}
          <div className="liquid-glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#005c55]" />
                  <span>Send Report to Authorized Business Contacts</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Send this weekly report directly to the specified email address(es) and save recipient settings.
                </p>
              </div>
              {activeReport.dispatchedAt && (
                <span className="text-xs font-semibold text-emerald-700">
                  Last Dispatched
                  {activeReport.dispatchedToEmails?.length
                    ? ` (${activeReport.dispatchedToEmails.join(', ')})`
                    : ''}
                  : {new Date(activeReport.dispatchedAt).toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                aria-label="Report recipient email addresses"
                value={recipientInput}
                onChange={(e) => {
                  isRecipientsDirtyRef.current = true;
                  setRecipientInput(e.target.value);
                  setEmailNotConfiguredHint(null);
                  setErrorMessage(null);
                }}
                placeholder="owner@business.com, manager@business.com"
                className={`flex-1 h-10 px-3 rounded-xl border bg-white text-xs text-slate-900 ${
                  recipientInput.trim() && !recipientValidation.ok
                    ? 'border-red-300 focus:outline-red-500'
                    : 'border-slate-200'
                }`}
              />
              <button
                type="button"
                disabled={isDispatching || !recipientValidation.ok}
                onClick={handleSaveRecipientsAndDispatch}
                className="h-10 px-5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {isDispatching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send Report Email</span>
              </button>
            </div>

            {recipientInput.trim() && !recipientValidation.ok && (
              <div className="rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700 flex flex-wrap items-center justify-between gap-2">
                <span>{recipientValidation.error}</span>
                {recipientValidation.suggestion && (
                  <button
                    type="button"
                    onClick={() => {
                      const { badEmail, fixedEmail } = recipientValidation.suggestion!;
                      isRecipientsDirtyRef.current = true;
                      setRecipientInput((prev) =>
                        prev.replace(
                          new RegExp(badEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                          fixedEmail,
                        ),
                      );
                      setErrorMessage(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold cursor-pointer"
                  >
                    Fix to {recipientValidation.suggestion.fixedEmail}
                  </button>
                )}
              </div>
            )}

            {emailNotConfiguredHint && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-950 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{emailNotConfiguredHint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <a
                    href={buildMailtoHref(activeReport, recipientInput)}
                    className="px-3 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 text-white font-semibold inline-flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Email App</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

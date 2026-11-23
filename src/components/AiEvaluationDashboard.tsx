import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Database,
  Download,
  FlaskConical,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import type {
  Business,
  ConsentedExample,
  CurationStatus,
  QualityIssueType,
  ReviewEvaluation,
  ReviewLanguage,
  ReviewQualityReport,
} from '../types';
import {
  saveReviewEvaluation,
  updateConsentedExampleStatus,
} from '../services/platformFeaturesService';
import { apiFetch, formatApiError } from '../utils/apiClient';
import {
  formatConsentedDatasetAsJsonl,
  validateReviewQuality,
} from '../utils/reviewQuality';

interface AiEvaluationDashboardProps {
  evaluations: ReviewEvaluation[];
  consentedExamples: ConsentedExample[];
  businesses: Business[];
  adminUid: string;
}

const LANGUAGE_META: Array<{
  id: ReviewLanguage;
  label: string;
  scriptRule: string;
}> = [
  { id: 'en', label: 'English', scriptRule: 'Everyday English (Roman)' },
  { id: 'hi', label: 'हिंदी (Hindi)', scriptRule: 'Spoken Hindi (Devanagari)' },
  { id: 'mr', label: 'मराठी (Marathi)', scriptRule: 'Spoken Marathi (Devanagari)' },
  { id: 'hinglish', label: 'Hinglish', scriptRule: 'Conversational Roman Hindi + Eng' },
];

interface BenchmarkCase {
  id: string;
  language: ReviewLanguage;
  title: string;
  businessName: string;
  category: Business['category'];
  responses: Array<{ question: string; answers: string[] }>;
  additionalComments: string;
}

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'bench-hinglish',
    language: 'hinglish',
    title: 'Hinglish Mixed Dining Feedback',
    businessName: 'Spice Garden Kitchen',
    category: 'Restaurants',
    responses: [
      { question: 'Food', answers: ['Good'] },
      { question: 'Service', answers: ['Quick'] },
      { question: 'Ambience', answers: ['Average'] },
      { question: 'Would you visit again?', answers: ['Yes'] },
    ],
    additionalComments: '',
  },
  {
    id: 'bench-en',
    language: 'en',
    title: 'English Honest Mixed Feedback',
    businessName: 'Spice Garden Kitchen',
    category: 'Restaurants',
    responses: [
      { question: 'Food & taste', answers: ['Good'] },
      { question: 'Staff', answers: ['Friendly Staff'] },
      { question: 'Service speed', answers: ['Service Was Slightly Slow'] },
      { question: 'Would you visit again?', answers: ['Yes'] },
    ],
    additionalComments: '',
  },
  {
    id: 'bench-hi',
    language: 'hi',
    title: 'Hindi Spoken Salon Feedback',
    businessName: 'Studio Nine Hair',
    category: 'Hair Salons',
    responses: [
      { question: 'Service', answers: ['Haircut', 'Beard Styling'] },
      { question: 'Experience', answers: ['Good'] },
      { question: 'Wait time & staff', answers: ['Skilled Stylist', 'Wait Was Slightly Long'] },
      { question: 'Would you visit us again?', answers: ['Yes'] },
    ],
    additionalComments: '',
  },
  {
    id: 'bench-mr',
    language: 'mr',
    title: 'Marathi Spoken Clinic Feedback',
    businessName: 'CarePlus Clinic',
    category: 'Healthcare',
    responses: [
      { question: 'Visit type', answers: ['Doctor Consultation'] },
      { question: 'Care quality', answers: ['Very Good'] },
      { question: 'Team', answers: ['Clear Explanation', 'Polite Front-Desk Staff'] },
      { question: 'Would you visit again?', answers: ['Yes'] },
    ],
    additionalComments: '',
  },
];

function pct(part: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((part / total) * 100)}%`;
}

function issueLabel(type: QualityIssueType): string {
  switch (type) {
    case 'invented_claim':
      return 'Invented Claim';
    case 'contradiction':
      return 'Contradiction';
    case 'repetition':
      return 'Repetition';
    case 'script_mismatch':
      return 'Script Mismatch';
    case 'ai_cliche':
      return 'AI Cliché';
    case 'empty_output':
      return 'Empty Output';
    default:
      return type;
  }
}

export function AiEvaluationDashboard({
  evaluations,
  consentedExamples,
  businesses,
  adminUid,
}: AiEvaluationDashboardProps) {
  const [langFilter, setLangFilter] = useState<'all' | ReviewLanguage>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issues' | 'passed' | 'repaired'>('all');
  const [curationLangFilter, setCurationLangFilter] = useState<'all' | ReviewLanguage>('all');

  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [benchmarkProgress, setBenchmarkProgress] = useState<string | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<
    Array<{
      testCase: BenchmarkCase;
      reviewText: string;
      report: ReviewQualityReport;
      modelId: string;
    }>
  >([]);

  const [editingReviewMap, setEditingReviewMap] = useState<Record<string, string>>({});
  const [savingExampleId, setSavingExampleId] = useState<string | null>(null);
  const [datasetNotice, setDatasetNotice] = useState<string | null>(null);

  const languageMetrics = useMemo(() => {
    return LANGUAGE_META.map((meta) => {
      const rows = evaluations.filter((e) => e.language === meta.id);
      const count = rows.length;
      const avgScore = count
        ? Math.round(rows.reduce((sum, r) => sum + (r.score || 0), 0) / count)
        : 0;
      const passedCount = rows.filter((r) => r.passed).length;
      const noInvented = rows.filter((r) => (r.inventedClaimCount || 0) === 0).length;
      const noContradictions = rows.filter((r) => (r.contradictionCount || 0) === 0).length;
      const noRepetition = rows.filter((r) => (r.repetitionCount || 0) === 0).length;
      const scriptOk = rows.filter((r) => r.scriptCompliant !== false).length;
      const autoRepairedCount = rows.filter((r) => r.autoRepaired).length;

      return {
        ...meta,
        count,
        avgScore,
        passedCount,
        noInvented,
        noContradictions,
        noRepetition,
        scriptOk,
        autoRepairedCount,
      };
    });
  }, [evaluations]);

  const overallSummary = useMemo(() => {
    const total = evaluations.length;
    const passed = evaluations.filter((e) => e.passed).length;
    const repaired = evaluations.filter((e) => e.autoRepaired).length;
    const avgScore = total
      ? Math.round(evaluations.reduce((sum, e) => sum + (e.score || 0), 0) / total)
      : 0;
    const approvedExemplars = consentedExamples.filter(
      (ex) => ex.curationStatus === 'approved',
    ).length;

    return { total, passed, repaired, avgScore, approvedExemplars };
  }, [evaluations, consentedExamples]);

  const filteredEvaluations = useMemo(() => {
    return evaluations.filter((ev) => {
      if (langFilter !== 'all' && ev.language !== langFilter) return false;
      if (statusFilter === 'issues' && ev.passed && (ev.issues?.length || 0) === 0) return false;
      if (statusFilter === 'passed' && !ev.passed) return false;
      if (statusFilter === 'repaired' && !ev.autoRepaired) return false;
      return true;
    });
  }, [evaluations, langFilter, statusFilter]);

  const filteredConsentedExamples = useMemo(() => {
    return consentedExamples.filter((ex) => {
      if (curationLangFilter !== 'all' && ex.language !== curationLangFilter) return false;
      return true;
    });
  }, [consentedExamples, curationLangFilter]);

  const approvedByLanguage = useMemo(() => {
    const counts: Record<ReviewLanguage, number> = { en: 0, hi: 0, mr: 0, hinglish: 0 };
    for (const ex of consentedExamples) {
      if (ex.curationStatus === 'approved') {
        counts[ex.language] = (counts[ex.language] || 0) + 1;
      }
    }
    return counts;
  }, [consentedExamples]);

  const handleRunBenchmarks = async () => {
    setIsRunningBenchmark(true);
    setBenchmarkError(null);
    setBenchmarkResults([]);
    const targetBiz = businesses[0];

    try {
      const results: Array<{
        testCase: BenchmarkCase;
        reviewText: string;
        report: ReviewQualityReport;
        modelId: string;
      }> = [];

      for (let i = 0; i < BENCHMARK_CASES.length; i += 1) {
        const tc = BENCHMARK_CASES[i];
        setBenchmarkProgress(`Running ${i + 1}/${BENCHMARK_CASES.length}: ${tc.title}...`);

        const res = await apiFetch('/api/generate-review', {
          method: 'POST',
          body: JSON.stringify({
            businessName: tc.businessName,
            category: tc.category,
            responses: tc.responses,
            additionalComments: tc.additionalComments,
            style: 'short',
            language: tc.language,
            variationSeed: 1,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          review?: string;
          qualityReport?: ReviewQualityReport;
          aiTelemetry?: { modelId?: string };
          error?: string;
        };

        if (!res.ok || !data.review) {
          throw new Error(data.error || `Benchmark failed on ${tc.title} (HTTP ${res.status}).`);
        }

        const report =
          data.qualityReport ||
          validateReviewQuality({
            reviewText: data.review,
            language: tc.language,
            businessName: tc.businessName,
            category: tc.category,
            responses: tc.responses,
            additionalComments: tc.additionalComments,
          });
        const modelId = data.aiTelemetry?.modelId || 'gemini-3.1-flash-lite';

        results.push({ testCase: tc, reviewText: data.review, report, modelId });

        if (targetBiz) {
          await saveReviewEvaluation({
            businessId: targetBiz.id,
            businessName: targetBiz.name,
            ownerId: targetBiz.ownerId || adminUid,
            slug: targetBiz.slug,
            category: tc.category,
            language: tc.language,
            reviewStyle: 'short',
            source: 'admin_benchmark',
            modelId,
            qualityReport: report,
            responsesSummary: tc.responses
              .map((r) => `${r.question}: ${r.answers.join(', ')}`)
              .join(' | '),
            generatedReview: data.review,
          });
        }
      }

      setBenchmarkResults(results);
      setBenchmarkProgress('4-language benchmark complete & logged.');
    } catch (err) {
      setBenchmarkError(formatApiError(err, 'Unable to run benchmark suite.'));
      setBenchmarkProgress(null);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleUpdateCuration = async (
    example: ConsentedExample,
    nextStatus: CurationStatus,
  ) => {
    setSavingExampleId(example.id);
    setDatasetNotice(null);
    try {
      const nextText = (editingReviewMap[example.id] ?? example.finalReview).trim();
      await updateConsentedExampleStatus({
        exampleId: example.id,
        curationStatus: nextStatus,
        finalReview: nextText || example.finalReview,
      });
      setDatasetNotice(
        `Updated example to "${nextStatus}" (${example.language.toUpperCase()}). Approved items immediately calibrate live generation prompts.`,
      );
      setTimeout(() => setDatasetNotice(null), 4000);
    } catch (err) {
      setDatasetNotice(err instanceof Error ? err.message : 'Failed to update example.');
    } finally {
      setSavingExampleId(null);
    }
  };

  const handleExportJsonl = () => {
    const approved = consentedExamples.filter((ex) => ex.curationStatus === 'approved');
    if (approved.length === 0) {
      setDatasetNotice('Approve at least one consented example before exporting JSONL.');
      return;
    }
    const jsonl = formatConsentedDatasetAsJsonl(approved);
    const blob = new Blob([jsonl], { type: 'application/jsonl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reviewflow-tuning-dataset-${new Date().toISOString().slice(0, 10)}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDatasetNotice(`Exported ${approved.length} approved exemplar(s) as Gemini JSONL.`);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Evaluated Review Drafts</p>
          <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
            {overallSummary.total}
          </p>
        </div>
        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Overall Quality Pass Rate</p>
          <p className="text-3xl font-bold text-teal-700 mt-1 tabular-nums">
            {pct(overallSummary.passed, overallSummary.total)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Avg Score: {overallSummary.total ? `${overallSummary.avgScore}/100` : '—'}
          </p>
        </div>
        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Auto-Repaired Before Delivery</p>
          <p className="text-3xl font-bold text-amber-700 mt-1 tabular-nums">
            {overallSummary.repaired}
          </p>
        </div>
        <div className="liquid-glass spatial-card-3d rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">Curated Calibration Exemplars</p>
          <p className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">
            {overallSummary.approvedExemplars}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {consentedExamples.length} total consented
          </p>
        </div>
      </div>

      {/* Phase 4: Per-Language Evaluation Scorecard */}
      <section className="liquid-glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              AI Quality Evaluation by Language
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Separate evaluation tracking for English, Hindi, Marathi, and Hinglish (invented claims, contradictions, repetition &amp; script compliance).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-6 border-b border-slate-200 bg-slate-50/50">
          {languageMetrics.map((m) => (
            <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-slate-900">{m.label}</span>
                <span className="text-xs font-mono font-bold text-teal-700 tabular-nums">
                  {m.count ? `${m.avgScore}/100` : 'No runs'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">{m.scriptRule}</p>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Pass Rate</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {pct(m.passedCount, m.count)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Script OK</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {pct(m.scriptOk, m.count)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">No Invented Claims</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {pct(m.noInvented, m.count)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">No Contradictions</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {pct(m.noContradictions, m.count)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <th className="py-3 px-6">Language</th>
                <th className="py-3 px-4 text-right">Samples</th>
                <th className="py-3 px-4 text-right">Avg Score</th>
                <th className="py-3 px-4 text-right">Pass Rate</th>
                <th className="py-3 px-4 text-right">No Invented</th>
                <th className="py-3 px-4 text-right">No Contradictions</th>
                <th className="py-3 px-4 text-right">No Repetition</th>
                <th className="py-3 px-6 text-right">Script Valid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {languageMetrics.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-6 font-semibold text-slate-900 whitespace-nowrap">
                    {m.label}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{m.count}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-teal-700">
                    {m.count ? `${m.avgScore}/100` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {pct(m.passedCount, m.count)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {pct(m.noInvented, m.count)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {pct(m.noContradictions, m.count)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {pct(m.noRepetition, m.count)}
                  </td>
                  <td className="py-3 px-6 text-right font-mono tabular-nums">
                    {pct(m.scriptOk, m.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Live 4-Language Benchmark Suite */}
      <section className="liquid-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-teal-700" />
              <span>Live Multilingual Benchmark Suite</span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Runs standardized feedback scenarios across English, Hindi, Marathi, and Hinglish through the live review generator &amp; quality validator.
            </p>
          </div>
          <button
            type="button"
            disabled={isRunningBenchmark}
            onClick={handleRunBenchmarks}
            className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {isRunningBenchmark ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>Run 4-Language Benchmark</span>
          </button>
        </div>

        {benchmarkProgress && (
          <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 font-medium">
            {benchmarkProgress}
          </p>
        )}
        {benchmarkError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 font-medium">
            {benchmarkError}
          </p>
        )}

        {benchmarkResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {benchmarkResults.map((item) => (
              <div
                key={item.testCase.id}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {item.testCase.title}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      item.report.passed
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    Score {item.report.score}/100
                    {item.report.autoRepaired ? ' · Auto-Repaired' : ''}
                  </span>
                </div>
                <p lang={item.testCase.language} className="text-sm text-slate-800 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
                  {item.reviewText}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span>Script OK: {item.report.scriptCompliant ? 'Yes' : 'No'}</span>
                  <span>Invented: {item.report.inventedClaimCount}</span>
                  <span>Contradictions: {item.report.contradictionCount}</span>
                  <span>Model: {item.modelId}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quality Inspection Log */}
      <section className="liquid-glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Quality &amp; Hallucination Inspector ({filteredEvaluations.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect live customer drafts and benchmark evaluations for invented claims, contradictions, repetition, or script drift.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value as 'all' | ReviewLanguage)}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
            >
              <option value="all">All Languages</option>
              <option value="en">English</option>
              <option value="hi">हिंदी (Hindi)</option>
              <option value="mr">मराठी (Marathi)</option>
              <option value="hinglish">Hinglish</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'issues' | 'passed' | 'repaired')
              }
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
            >
              <option value="all">All Outcomes</option>
              <option value="issues">With Flagged Issues</option>
              <option value="repaired">Auto-Repaired</option>
              <option value="passed">Passed Cleanly</option>
            </select>
          </div>
        </div>

        {filteredEvaluations.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No evaluations match the selected filters yet. Run the 4-language benchmark above or generate drafts in the customer flow.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEvaluations.slice(0, 30).map((ev) => (
              <div key={ev.id} className="p-5 space-y-2 hover:bg-slate-50/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-900">{ev.businessName}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-slate-700 uppercase">
                      {ev.language}
                    </span>
                    <span className="text-slate-500">
                      {ev.source === 'admin_benchmark' ? 'Benchmark' : 'Live Customer'}
                    </span>
                    {ev.autoRepaired && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-medium">
                        Auto-Repaired
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    {ev.passed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{ev.score}/100</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{ev.score}/100</span>
                      </span>
                    )}
                  </div>
                </div>
                <p lang={ev.language} className="text-sm text-slate-800">
                  {ev.generatedReview}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  Inputs: {ev.responsesSummary || 'Comment-only submission'}
                </p>
                {ev.issues && ev.issues.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ev.issues.map((issue, idx) => (
                      <span
                        key={`${ev.id}-iss-${idx}`}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          issue.severity === 'error'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {issueLabel(issue.type)}: {issue.message}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Phase 5: Model Customization & Curated Consented Dataset */}
      <section className="liquid-glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-teal-700" />
              <span>Model Customization &amp; Curated Dataset (Phase 5)</span>
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Approved anonymized examples automatically calibrate live prompts via few-shot exemplars, and export as Gemini JSONL when preparing supervised fine-tuning.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={curationLangFilter}
              onChange={(e) => setCurationLangFilter(e.target.value as 'all' | ReviewLanguage)}
              className="h-9 px-3 rounded-lg border border-slate-200 text-xs bg-white"
            >
              <option value="all">All Languages</option>
              <option value="en">English</option>
              <option value="hi">हिंदी (Hindi)</option>
              <option value="mr">मराठी (Marathi)</option>
              <option value="hinglish">Hinglish</option>
            </select>
            <button
              type="button"
              onClick={handleExportJsonl}
              className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Approved JSONL</span>
            </button>
          </div>
        </div>

        {/* Fine-Tuning Readiness Bar per Language */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center gap-4 text-xs">
          <span className="font-semibold text-slate-700 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            <span>Fine-Tuning Dataset Readiness (100+ approved recommended):</span>
          </span>
          {LANGUAGE_META.map((m) => (
            <span key={m.id} className="font-mono text-slate-700 tabular-nums">
              {m.id.toUpperCase()}: <strong>{approvedByLanguage[m.id] || 0}</strong>/100
            </span>
          ))}
        </div>

        {datasetNotice && (
          <div className="mx-6 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 font-medium">
            {datasetNotice}
          </div>
        )}

        {filteredConsentedExamples.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No consented examples collected yet. Customers can opt in cleanly on Step 2 after generating or editing a draft.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredConsentedExamples.slice(0, 40).map((ex) => {
              const draftEdit = editingReviewMap[ex.id] ?? ex.finalReview;
              const isSavingThis = savingExampleId === ex.id;
              return (
                <div key={ex.id} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono uppercase text-slate-700">
                        {ex.language}
                      </span>
                      <span className="font-semibold text-slate-800">{ex.category}</span>
                      <span className="text-slate-500">Score: {ex.qualityScore}/100</span>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-semibold ${
                        ex.curationStatus === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : ex.curationStatus === 'archived'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {ex.curationStatus}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    <strong>Feedback:</strong> {ex.responsesSummary || '(None)'}
                    {ex.additionalComments ? ` | Note: "${ex.additionalComments}"` : ''}
                  </p>

                  <textarea
                    rows={2}
                    lang={ex.language}
                    value={draftEdit}
                    onChange={(e) =>
                      setEditingReviewMap((prev) => ({ ...prev, [ex.id]: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isSavingThis}
                      onClick={() => handleUpdateCuration(ex, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve Exemplar</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSavingThis}
                      onClick={() => handleUpdateCuration(ex, 'archived')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archive</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { PublicProfile, ReviewStyle } from '../types';
import { recordReviewEvent } from '../services/businessService';
import { apiFetch } from '../utils/apiClient';
import { BusinessLogo } from './BusinessLogo';

interface CustomerReviewFlowProps {
  profile: PublicProfile;
  isPreview?: boolean;
  tokenMismatch?: boolean;
  onExit?: () => void;
}

type FlowStep = 'feedback' | 'draft' | 'thankyou';

const REVIEW_STYLE_OPTIONS: { id: ReviewStyle; label: string; hint: string }[] = [
  { id: 'short', label: 'Short & Simple', hint: '2–3 quick sentences' },
  { id: 'detailed', label: 'Natural & Detailed', hint: 'Conversational story' },
  { id: 'professional', label: 'Professional', hint: 'Polished & balanced' },
];

export function CustomerReviewFlow({
  profile,
  isPreview = false,
  tokenMismatch = false,
  onExit,
}: CustomerReviewFlowProps) {
  const [step, setStep] = useState<FlowStep>('feedback');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [selectedStyle, setSelectedStyle] = useState<ReviewStyle>(
    profile.branding?.defaultReviewStyle || 'short',
  );
  const [draftText, setDraftText] = useState('');
  const [draftsByStyle, setDraftsByStyle] = useState<Partial<Record<ReviewStyle, string>>>({});
  const [keywordsUsed, setKeywordsUsed] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [variationSeed, setVariationSeed] = useState(1);

  const scanLoggedRef = useRef(false);
  const primaryColor = profile.branding?.primaryColor || '#0F766E';
  const secondaryColor = profile.branding?.secondaryColor || '#0F172A';

  useEffect(() => {
    setSelectedStyle(profile.branding?.defaultReviewStyle || 'short');
  }, [profile.branding?.defaultReviewStyle]);

  useEffect(() => {
    if (!isPreview && !scanLoggedRef.current && profile.qrConfig?.isActive) {
      scanLoggedRef.current = true;
      recordReviewEvent(profile, 'scan');
    }
  }, [isPreview, profile]);

  const sentimentValue = useMemo(() => {
    const expQuestion = profile.questions.find(
      (q) =>
        q.id === 'q-experience' ||
        q.prompt.toLowerCase().includes('experience') ||
        q.prompt.toLowerCase().includes('stay') ||
        q.prompt.toLowerCase().includes('care') ||
        q.prompt.toLowerCase().includes('session'),
    );
    if (!expQuestion) return '';
    return answers[expQuestion.id]?.[0] ?? '';
  }, [answers, profile.questions]);

  const selectedHighlights = useMemo(() => {
    const list: string[] = [];
    for (const q of profile.questions) {
      if (q.type !== 'text' && answers[q.id]?.length) {
        list.push(...answers[q.id]);
      }
    }
    return list.slice(0, 15);
  }, [answers, profile.questions]);

  const toggleOption = (questionId: string, option: string, mode: 'single' | 'multiple') => {
    setValidationError(null);
    setAnswers((prev) => {
      const existing = prev[questionId] ?? [];
      if (mode === 'single') {
        return { ...prev, [questionId]: existing.includes(option) ? [] : [option] };
      }
      const next = existing.includes(option)
        ? existing.filter((item) => item !== option)
        : [...existing, option];
      return { ...prev, [questionId]: next };
    });
  };

  const requestAiDraft = async (styleToUse: ReviewStyle, seed: number) => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const structuredResponses = profile.questions
        .filter((q) => q.type !== 'text')
        .map((q) => ({
          question: q.prompt,
          answers: answers[q.id] ?? [],
        }))
        .filter((item) => item.answers.length > 0);

      const additionalComments = profile.questions
        .filter((q) => q.type === 'text')
        .map((q) => (textInputs[q.id] ?? '').trim())
        .filter(Boolean)
        .join(' ');

      const res = await apiFetch('/api/generate-review', {
        method: 'POST',
        body: JSON.stringify({
          businessName: profile.name,
          category: profile.category,
          seoKeywords: profile.seoKeywords ?? [],
          responses: structuredResponses,
          additionalComments,
          style: styleToUse,
          variationSeed: seed,
        }),
      });

      const data = (await res.json()) as {
        review?: string;
        drafts?: Partial<Record<ReviewStyle, string>>;
        keywordsUsed?: string[];
        error?: string;
      };
      if (!res.ok || !data.review) {
        throw new Error(data.error || 'Could not generate review draft.');
      }

      const nextDrafts: Partial<Record<ReviewStyle, string>> = {
        short: data.drafts?.short || (styleToUse === 'short' ? data.review : undefined),
        detailed: data.drafts?.detailed || (styleToUse === 'detailed' ? data.review : undefined),
        professional:
          data.drafts?.professional || (styleToUse === 'professional' ? data.review : undefined),
      };
      setDraftsByStyle(nextDrafts);
      setKeywordsUsed(Array.isArray(data.keywordsUsed) ? data.keywordsUsed : []);
      setDraftText(nextDrafts[styleToUse] || data.review);
      setStep('draft');

      if (!isPreview) {
        recordReviewEvent(profile, 'generate', {
          reviewStyle: styleToUse,
          sentiment: sentimentValue,
          selectedHighlights,
        });
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Unable to generate review draft.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    for (const q of profile.questions) {
      if (!q.required) continue;
      if (q.type === 'text') {
        if (!(textInputs[q.id] ?? '').trim()) {
          setValidationError(`Please fill in "${q.prompt}" before continuing.`);
          return;
        }
      } else if (!(answers[q.id] && answers[q.id].length > 0)) {
        setValidationError(`Please answer "${q.prompt}" before continuing.`);
        return;
      }
    }

    const hasAnyResponse =
      Object.values(answers).some((arr) => arr.length > 0) ||
      Object.values(textInputs).some((txt) => txt.trim().length > 0);

    if (!hasAnyResponse) {
      setValidationError('Please select at least one option or add a comment to draft your review.');
      return;
    }

    if (profile.enabledFeatures && !profile.enabledFeatures.aiReviewDrafts) {
      const commentPart = profile.questions
        .filter((q) => q.type === 'text')
        .map((q) => (textInputs[q.id] ?? '').trim())
        .filter(Boolean)
        .join(' ');
      const highlightPart = selectedHighlights.join(', ');
      const fallback = commentPart || (highlightPart ? `I visited ${profile.name} (${highlightPart}).` : `I visited ${profile.name}.`);
      setDraftText(fallback);
      setStep('draft');
      return;
    }

    await requestAiDraft(selectedStyle, variationSeed);
  };

  const handleStyleSwitch = async (nextStyle: ReviewStyle) => {
    setSelectedStyle(nextStyle);
    const cached = draftsByStyle[nextStyle];
    if (cached && cached.trim()) {
      setDraftText(cached);
      return;
    }
    await requestAiDraft(nextStyle, variationSeed);
  };

  const handleRegenerate = async () => {
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    await requestAiDraft(selectedStyle, nextSeed);
  };

  const handleCopyReview = async () => {
    if (!draftText.trim()) return;
    try {
      await navigator.clipboard.writeText(draftText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback selection copy
      const el = document.getElementById('review-draft-textarea') as HTMLTextAreaElement | null;
      if (el) {
        el.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    }
  };

  const handleGoogleRedirectClick = async () => {
    await handleCopyReview();
    if (!isPreview) {
      recordReviewEvent(profile, 'copy_redirect', {
        reviewStyle: selectedStyle,
        sentiment: sentimentValue,
        selectedHighlights,
      });
    }
    setStep('thankyou');
  };

  const handleStartOver = () => {
    setAnswers({});
    setTextInputs({});
    setDraftText('');
    setDraftsByStyle({});
    setKeywordsUsed([]);
    setCopied(false);
    setGenerateError(null);
    setValidationError(null);
    setStep('feedback');
  };

  const googleUrl = profile.googleReviewUrl?.trim() || 'https://www.google.com/maps';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Compact top navigation bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="min-h-[40px] min-w-[40px] -ml-2 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <BusinessLogo
              src={profile.logoDataUrl}
              name={profile.name}
              primaryColor={primaryColor}
              sizeClass="w-8 h-8"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{profile.name}</p>
              <p className="text-xs text-slate-500 truncate">{profile.category}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
            {isPreview && (
              <span className="font-medium text-amber-700 whitespace-nowrap">Preview Mode</span>
            )}
            <span className="tabular-nums whitespace-nowrap">
              {step === 'feedback' ? 'Step 1 of 2' : step === 'draft' ? 'Step 2 of 2' : 'Complete'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28">
        {tokenMismatch && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Notice: This printed QR code revision has been superseded by an updated code, though you can still share your feedback below.
          </div>
        )}

        {step === 'feedback' && (
          <form onSubmit={handleGenerateSubmit} className="space-y-8">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <BusinessLogo
                  src={profile.logoDataUrl}
                  name={profile.name}
                  primaryColor={primaryColor}
                  sizeClass="w-14 h-14"
                />
                <div className="min-w-0">
                  <h1
                    className="text-2xl sm:text-3xl font-display font-bold tracking-tight"
                    style={{ color: secondaryColor }}
                  >
                    {profile.name}
                  </h1>
                  <p className="mt-1.5 text-sm sm:text-base text-slate-600 leading-relaxed">
                    {profile.branding?.welcomeMessage ||
                      'Tap a few options below and we will generate a personalized review draft you can edit and post on Google.'}
                  </p>
                </div>
              </div>
            </div>

            {profile.questions.map((question, qIndex) => (
              <section
                key={question.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7"
              >
                <div className="flex items-baseline justify-between gap-4 mb-4">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900">
                    {qIndex + 1}. {question.prompt}
                  </h2>
                  <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                    {question.required ? 'Required' : 'Optional'}
                    {question.type === 'multiple' ? ' · Select multiple' : ''}
                  </span>
                </div>

                {question.type === 'text' ? (
                  <textarea
                    rows={3}
                    value={textInputs[question.id] ?? ''}
                    onChange={(e) => {
                      setValidationError(null);
                      setTextInputs((prev) => ({ ...prev, [question.id]: e.target.value }));
                    }}
                    placeholder={
                      question.placeholder ||
                      'Add any specific highlights or details you would like included...'
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {question.options.map((option) => {
                      const isSelected = (answers[question.id] ?? []).includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            toggleOption(
                              question.id,
                              option,
                              question.type === 'single' ? 'single' : 'multiple',
                            )
                          }
                          style={
                            isSelected
                              ? {
                                  backgroundColor: primaryColor,
                                  borderColor: primaryColor,
                                  color: '#FFFFFF',
                                }
                              : undefined
                          }
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected && <Check className="w-4 h-4 shrink-0" />}
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}

            {(validationError || generateError) && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {validationError || generateError}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 text-xs text-slate-500 px-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  ReviewFlow drafts a suggestion from your exact answers. You edit and submit manually on Google.
                </span>
              </div>
            </div>

            <div className="sticky bottom-4 z-20">
              <button
                type="submit"
                disabled={isGenerating}
                style={{ backgroundColor: primaryColor }}
                className="w-full min-h-[48px] px-6 py-3.5 rounded-xl text-white font-semibold text-sm sm:text-base shadow-lg shadow-slate-900/10 hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Drafting your personalized review...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Review Draft</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {step === 'draft' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900">
                    Your Personalized Review Draft
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Switch tone, edit any word, then copy and paste it on {profile.name}&apos;s Google review page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('feedback')}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer whitespace-nowrap"
                >
                  Edit answers
                </button>
              </div>

              {/* 3 Review Styles Segmented Control */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Review Style</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {REVIEW_STYLE_OPTIONS.map((opt) => {
                    const active = selectedStyle === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => handleStyleSwitch(opt.id)}
                        style={
                          active
                            ? {
                                borderColor: primaryColor,
                                backgroundColor: `${primaryColor}10`,
                                color: secondaryColor,
                              }
                            : undefined
                        }
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'font-semibold'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-sm leading-tight">{opt.label}</div>
                        <div className="text-xs text-slate-500 font-normal mt-0.5">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editable Review Textarea */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="review-draft-textarea" className="text-xs font-medium text-slate-500">
                    Editable Draft
                  </label>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleRegenerate}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </button>
                </div>
                <textarea
                  id="review-draft-textarea"
                  rows={5}
                  value={draftText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraftText(val);
                    setDraftsByStyle((prev) => ({ ...prev, [selectedStyle]: val }));
                  }}
                  disabled={isGenerating}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:text-base text-slate-900 leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
                {keywordsUsed.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Google search terms included:{' '}
                    <span className="text-slate-700 font-medium">
                      {keywordsUsed.join(' · ')}
                    </span>
                  </p>
                )}
              </div>

              {generateError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {generateError}
                </div>
              )}

              {/* Actions: Copy + Open Google Review Page */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCopyReview}
                  className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 cursor-pointer sm:w-48 shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Review</span>
                    </>
                  )}
                </button>

                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleGoogleRedirectClick}
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 min-h-[48px] px-6 py-3 rounded-xl text-white font-semibold text-sm sm:text-base hover:opacity-95 transition-opacity flex items-center justify-center gap-2 text-center"
                >
                  <span>Copy & Open Google Review Page</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </a>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Clicking &ldquo;Copy &amp; Open Google Review Page&rdquo; copies your edited text to your clipboard and opens {profile.name}&apos;s Google Business Profile so you can paste and submit directly.
              </p>
            </div>
          </div>
        )}

        {step === 'thankyou' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center space-y-5">
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <Check className="w-7 h-7" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h1 className="text-2xl font-display font-bold text-slate-900">
                Ready to Post on Google
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                {profile.branding?.thankYouMessage ||
                  `Your review text has been copied. Paste it into Google to complete your review for ${profile.name}.`}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundColor: primaryColor }}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl text-white font-semibold text-sm inline-flex items-center justify-center gap-2"
              >
                <span>Open Google Again</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={handleStartOver}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Write Another Draft</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

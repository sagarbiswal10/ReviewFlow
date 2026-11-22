import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  FeedbackSubmissionResponse,
  PublicProfile,
  ReviewDraftStatus,
  ReviewLanguage,
  ReviewStyle,
} from '../types';
import {
  createReviewDraftRecord,
  logAiUsage,
  recordReviewEvent,
  saveFeedbackSubmission,
  updateReviewDraftLifecycle,
} from '../services/businessService';
import { apiFetch } from '../utils/apiClient';
import { BusinessLogo } from './BusinessLogo';

interface CustomerReviewFlowProps {
  profile: PublicProfile;
  isPreview?: boolean;
  tokenMismatch?: boolean;
  onExit?: () => void;
}

type FlowStep = 'feedback' | 'draft';

const LANGUAGE_OPTIONS: {
  id: ReviewLanguage;
  nativeLabel: string;
  englishLabel: string;
}[] = [
  { id: 'en', nativeLabel: 'English', englishLabel: 'English' },
  { id: 'hi', nativeLabel: 'हिंदी', englishLabel: 'Hindi' },
  { id: 'mr', nativeLabel: 'मराठी', englishLabel: 'Marathi' },
];

function getLanguageDisplayName(lang: ReviewLanguage): string {
  if (lang === 'hi') return 'हिंदी (Hindi)';
  if (lang === 'mr') return 'मराठी (Marathi)';
  return 'English';
}

function normalizeExternalUrl(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 'https://www.google.com/maps';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return 'https://www.google.com/maps';
}

export function CustomerReviewFlow({
  profile,
  isPreview = false,
  tokenMismatch = false,
  onExit,
}: CustomerReviewFlowProps) {
  const [step, setStep] = useState<FlowStep>('feedback');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [selectedLanguage, setSelectedLanguage] = useState<ReviewLanguage>('en');
  const [selectedStyle] = useState<ReviewStyle>(
    profile.branding?.defaultReviewStyle || 'short',
  );

  const [draftText, setDraftText] = useState('');
  const [currentDraftId, setCurrentDraftId] = useState('');
  const [feedbackSubmissionId, setFeedbackSubmissionId] = useState('');
  const [draftStatus, setDraftStatus] = useState<ReviewDraftStatus>('Generated');
  const [isEditing, setIsEditing] = useState(false);
  const [draftDeleted, setDraftDeleted] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openedGoogle, setOpenedGoogle] = useState(false);
  const [variationSeed, setVariationSeed] = useState(1);

  const scanLoggedRef = useRef(false);
  const formStartedLoggedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const primaryColor = profile.branding?.primaryColor || '#0F766E';
  const secondaryColor = profile.branding?.secondaryColor || '#0F172A';

  const standContext = useMemo(() => {
    if (typeof window === 'undefined' || isPreview) {
      return { standId: '', standCode: '', standName: '', sessionId: 'preview-session' };
    }
    const params = new URLSearchParams(window.location.search);
    const standCode = (params.get('stand') || '').trim().slice(0, 64);
    const standId = (params.get('sid') || '').trim().slice(0, 128);
    const standName = (params.get('sname') || '').trim().slice(0, 120);
    const storageKey = `reviewflow_sid_${profile.businessId}`;
    let sessionId = '';
    try {
      sessionId = window.sessionStorage.getItem(storageKey) || '';
      if (!sessionId) {
        sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        window.sessionStorage.setItem(storageKey, sessionId);
      }
    } catch {
      sessionId = `sess_${Date.now().toString(36)}`;
    }
    return { standId, standCode, standName, sessionId };
  }, [isPreview, profile.businessId]);

  useEffect(() => {
    if (!isPreview && !scanLoggedRef.current && profile.qrConfig?.isActive) {
      scanLoggedRef.current = true;
      recordReviewEvent(profile, 'scan', {
        standId: standContext.standId,
        standCode: standContext.standCode,
        standName: standContext.standName,
        sessionId: standContext.sessionId,
      });
    }
  }, [isPreview, profile, standContext]);

  useEffect(() => {
    return () => {
      if (editPersistTimeoutRef.current) {
        clearTimeout(editPersistTimeoutRef.current);
      }
    };
  }, []);

  const markFormStarted = () => {
    if (isPreview || formStartedLoggedRef.current || !profile.qrConfig?.isActive) return;
    formStartedLoggedRef.current = true;
    recordReviewEvent(profile, 'form_start', {
      standId: standContext.standId,
      standCode: standContext.standCode,
      standName: standContext.standName,
      sessionId: standContext.sessionId,
    });
  };

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

  const buildStructuredPayload = (): {
    responses: FeedbackSubmissionResponse[];
    additionalComments: string;
  } => {
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

    return { responses: structuredResponses, additionalComments };
  };

  const toggleOption = (questionId: string, option: string, mode: 'single' | 'multiple') => {
    markFormStarted();
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

  const ensureFeedbackSubmission = async (): Promise<string> => {
    if (feedbackSubmissionId) return feedbackSubmissionId;
    const { responses, additionalComments } = buildStructuredPayload();
    if (isPreview) {
      const previewSubId = `preview_fb_${Date.now()}`;
      setFeedbackSubmissionId(previewSubId);
      return previewSubId;
    }
    const createdSubId = await saveFeedbackSubmission({
      profile,
      responses,
      additionalComments,
      sentiment: sentimentValue,
      selectedHighlights,
      standId: standContext.standId,
      standCode: standContext.standCode,
      standName: standContext.standName,
      sessionId: standContext.sessionId,
    });
    setFeedbackSubmissionId(createdSubId);
    return createdSubId;
  };

  const requestAiDraft = async (
    languageToUse: ReviewLanguage,
    seed: number,
    submissionIdOverride?: string,
  ) => {
    setIsGenerating(true);
    setGenerateError(null);
    setCopied(false);
    setOpenedGoogle(false);
    setIsEditing(false);

    try {
      const { responses, additionalComments } = buildStructuredPayload();
      const activeSubmissionId = submissionIdOverride || (await ensureFeedbackSubmission());

      if (profile.enabledFeatures && !profile.enabledFeatures.aiReviewDrafts) {
        const highlightPart = selectedHighlights.join(', ');
        const fallback =
          additionalComments ||
          (highlightPart
            ? `Visited ${profile.name} (${highlightPart}).`
            : `Visited ${profile.name}.`);
        setDraftText(fallback);
        setDraftStatus('Generated');
        setDraftDeleted(false);
        setStep('draft');
        if (!isPreview) {
          const newDraftId = await createReviewDraftRecord({
            profile,
            feedbackSubmissionId: activeSubmissionId,
            reviewText: fallback,
            language: languageToUse,
            reviewStyle: selectedStyle,
            variationSeed: seed,
            sessionId: standContext.sessionId,
          });
          setCurrentDraftId(newDraftId);
        }
        return;
      }

      const res = await apiFetch('/api/generate-review', {
        method: 'POST',
        body: JSON.stringify({
          businessName: profile.name,
          category: profile.category,
          responses,
          additionalComments,
          style: selectedStyle,
          language: languageToUse,
          variationSeed: seed,
        }),
      });

      const rawBody = await res.text();
      let data: {
        review?: string;
        language?: ReviewLanguage;
        aiTelemetry?: {
          provider?: string;
          modelId?: string;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          estimatedCostUsd?: number;
        };
        error?: string;
      } = {};
      try {
        data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
      } catch {
        throw new Error(
          `Review draft service returned a non-JSON response (HTTP ${res.status}).`,
        );
      }

      if (!res.ok || !data.review) {
        if (!isPreview) {
          logAiUsage({
            businessId: profile.businessId,
            ownerId: profile.ownerId,
            provider: data.aiTelemetry?.provider || 'gemini',
            operationType: 'review_draft',
            modelName: data.aiTelemetry?.modelId || 'gemini-3.1-flash-lite',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            status: 'failed',
            errorCode: `HTTP_${res.status}`,
          });
        }
        throw new Error(data.error || 'Could not generate review draft.');
      }

      const generatedText = data.review.trim();
      setDraftText(generatedText);
      setDraftStatus('Generated');
      setDraftDeleted(false);
      setStep('draft');

      if (!isPreview) {
        const newDraftId = await createReviewDraftRecord({
          profile,
          feedbackSubmissionId: activeSubmissionId,
          reviewText: generatedText,
          language: languageToUse,
          reviewStyle: selectedStyle,
          variationSeed: seed,
          sessionId: standContext.sessionId,
        });
        setCurrentDraftId(newDraftId);

        recordReviewEvent(profile, 'generate', {
          reviewStyle: selectedStyle,
          sentiment: sentimentValue,
          language: languageToUse,
          selectedHighlights,
          standId: standContext.standId,
          standCode: standContext.standCode,
          standName: standContext.standName,
          sessionId: standContext.sessionId,
        });

        if (data.aiTelemetry) {
          logAiUsage({
            businessId: profile.businessId,
            ownerId: profile.ownerId,
            provider: data.aiTelemetry.provider || 'gemini',
            operationType: 'review_draft',
            modelName: data.aiTelemetry.modelId || 'gemini-3.1-flash-lite',
            inputTokens: data.aiTelemetry.inputTokens || 0,
            outputTokens: data.aiTelemetry.outputTokens || 0,
            totalTokens: data.aiTelemetry.totalTokens || 0,
            estimatedCostUsd: data.aiTelemetry.estimatedCostUsd || 0,
            status: 'success',
          });
        }
      } else {
        setCurrentDraftId(`preview_dr_${Date.now()}`);
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
      setValidationError('Please select at least one option or add a comment before generating.');
      return;
    }

    const { responses, additionalComments } = buildStructuredPayload();
    let submissionId = '';
    if (!isPreview) {
      submissionId = await saveFeedbackSubmission({
        profile,
        responses,
        additionalComments,
        sentiment: sentimentValue,
        selectedHighlights,
        standId: standContext.standId,
        standCode: standContext.standCode,
        standName: standContext.standName,
        sessionId: standContext.sessionId,
      });
    } else {
      submissionId = `preview_fb_${Date.now()}`;
    }
    setFeedbackSubmissionId(submissionId);

    const nextSeed = variationSeed;
    await requestAiDraft(selectedLanguage, nextSeed, submissionId);
  };

  const handleLanguageChangeOnPreview = async (nextLang: ReviewLanguage) => {
    if (isGenerating) return;
    if (nextLang === selectedLanguage && !draftDeleted && draftText) return;
    setSelectedLanguage(nextLang);
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    await requestAiDraft(nextLang, nextSeed, feedbackSubmissionId);
  };

  const handleRegenerate = async () => {
    if (isGenerating) return;
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    await requestAiDraft(selectedLanguage, nextSeed, feedbackSubmissionId);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      setIsEditing(false);
      if (editPersistTimeoutRef.current) {
        clearTimeout(editPersistTimeoutRef.current);
      }
      if (!isPreview && currentDraftId && draftText.trim() && draftStatus === 'Edited') {
        updateReviewDraftLifecycle({
          profile,
          draftId: currentDraftId,
          status: 'Edited',
          reviewText: draftText,
        });
      }
    } else {
      setIsEditing(true);
      setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }, 20);
    }
  };

  const handleDraftTextChange = (nextVal: string) => {
    setDraftText(nextVal);
    setDraftStatus('Edited');
    setCopied(false);

    if (editPersistTimeoutRef.current) {
      clearTimeout(editPersistTimeoutRef.current);
    }
    if (!isPreview && currentDraftId && nextVal.trim()) {
      editPersistTimeoutRef.current = setTimeout(() => {
        updateReviewDraftLifecycle({
          profile,
          draftId: currentDraftId,
          status: 'Edited',
          reviewText: nextVal,
        });
      }, 650);
    }
  };

  const handleCopyReview = async () => {
    if (!draftText.trim()) return;
    if (editPersistTimeoutRef.current) {
      clearTimeout(editPersistTimeoutRef.current);
    }
    setIsEditing(false);

    try {
      await navigator.clipboard.writeText(draftText);
    } catch {
      const el = textareaRef.current;
      if (el) {
        el.select();
        document.execCommand('copy');
      }
    }

    setCopied(true);
    setDraftStatus('Copied');

    if (!isPreview && currentDraftId) {
      updateReviewDraftLifecycle({
        profile,
        draftId: currentDraftId,
        status: 'Copied',
        reviewText: draftText,
      });
    }
  };

  const handleOpenGoogleReview = () => {
    setOpenedGoogle(true);
    if (!isPreview) {
      recordReviewEvent(profile, 'copy_redirect', {
        reviewStyle: selectedStyle,
        sentiment: sentimentValue,
        language: selectedLanguage,
        selectedHighlights,
        standId: standContext.standId,
        standCode: standContext.standCode,
        standName: standContext.standName,
        sessionId: standContext.sessionId,
      });
    }
  };

  const handleConfirmDeleteDraft = async () => {
    setIsDeleting(true);
    if (editPersistTimeoutRef.current) {
      clearTimeout(editPersistTimeoutRef.current);
    }
    try {
      if (!isPreview && currentDraftId) {
        await updateReviewDraftLifecycle({
          profile,
          draftId: currentDraftId,
          status: 'Deleted',
        });
      }
      setDraftText('');
      setCurrentDraftId('');
      setDraftStatus('Deleted');
      setCopied(false);
      setOpenedGoogle(false);
      setIsEditing(false);
      setDraftDeleted(true);
      setShowDeleteModal(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGenerateAfterDelete = async () => {
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    await requestAiDraft(selectedLanguage, nextSeed, feedbackSubmissionId);
  };

  const handleStartNewFeedback = () => {
    setAnswers({});
    setTextInputs({});
    setDraftText('');
    setCurrentDraftId('');
    setFeedbackSubmissionId('');
    setDraftDeleted(false);
    setCopied(false);
    setOpenedGoogle(false);
    setIsEditing(false);
    setGenerateError(null);
    setValidationError(null);
    setStep('feedback');
  };

  const googleUrl = normalizeExternalUrl(profile.googleReviewUrl);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col relative overflow-x-hidden">
      {/* Minimal Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
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

          <div className="flex items-center gap-2.5 shrink-0 text-xs text-slate-500">
            {isPreview && (
              <span className="font-medium text-amber-700 whitespace-nowrap">Preview</span>
            )}
            <span className="tabular-nums whitespace-nowrap font-medium">
              {step === 'feedback' ? 'Step 1 of 2' : 'Step 2 of 2'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-20">
        {tokenMismatch && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Notice: This printed QR code revision has been updated, though you can still share your feedback below.
          </div>
        )}

        {step === 'feedback' && (
          <form onSubmit={handleGenerateSubmit} className="space-y-6">
            {/* Business Welcome Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-7">
              <div className="flex items-start gap-4">
                <BusinessLogo
                  src={profile.logoDataUrl}
                  name={profile.name}
                  primaryColor={primaryColor}
                  sizeClass="w-12 h-12 sm:w-14 sm:h-14"
                />
                <div className="min-w-0">
                  <h1
                    className="text-xl sm:text-2xl font-display font-bold tracking-tight"
                    style={{ color: secondaryColor }}
                  >
                    {profile.name}
                  </h1>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    {profile.branding?.welcomeMessage ||
                      'Share quick feedback below and generate a natural review draft in your preferred language.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Feedback Questions */}
            {profile.questions.map((question, qIndex) => (
              <section
                key={question.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6"
              >
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <h2 className="text-base font-semibold text-slate-900">
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
                      markFormStarted();
                      setValidationError(null);
                      setTextInputs((prev) => ({ ...prev, [question.id]: e.target.value }));
                    }}
                    placeholder={
                      question.placeholder ||
                      'Share any specific details from your visit...'
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15 review-text-multilingual"
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
                          className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'shadow-xs'
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

            {/* Language Selector Before Generating */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Choose Review Language
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your review will be written naturally in the language you pick.
                </p>
              </div>

              <div
                role="radiogroup"
                aria-label="Review Language"
                className="grid grid-cols-3 gap-2.5"
              >
                {LANGUAGE_OPTIONS.map((lang) => {
                  const active = selectedLanguage === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedLanguage(lang.id)}
                      style={
                        active
                          ? {
                              borderColor: primaryColor,
                              backgroundColor: `${primaryColor}10`,
                              color: secondaryColor,
                            }
                          : undefined
                      }
                      className={`min-h-[54px] px-3 py-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                        active
                          ? 'font-semibold ring-1'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        lang={lang.id}
                        className="text-sm sm:text-base font-semibold leading-snug"
                      >
                        {lang.nativeLabel}
                      </span>
                      {lang.id !== 'en' && (
                        <span className="text-[11px] text-slate-500 font-normal mt-0.5">
                          {lang.englishLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {(validationError || generateError) && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {validationError || generateError}
              </div>
            )}

            <div className="pt-1">
              <button
                type="submit"
                disabled={isGenerating}
                style={{ backgroundColor: primaryColor }}
                className="w-full min-h-[50px] px-6 py-3.5 rounded-xl text-white font-semibold text-base shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating review in {getLanguageDisplayName(selectedLanguage)}...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Review</span>
                  </>
                )}
              </button>
              <p className="text-center text-xs text-slate-500 mt-3">
                You can edit, switch languages, or discard your draft before posting manually on Google.
              </p>
            </div>
          </form>
        )}

        {step === 'draft' && (
          <div className="space-y-5">
            {/* Top context bar */}
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900">
                  {draftDeleted ? 'Review Draft Deleted' : 'Your Review Draft'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {draftDeleted
                    ? 'Your feedback answers are still saved below.'
                    : 'Review, edit, or switch language before copying.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setStep('feedback');
                }}
                className="text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer whitespace-nowrap"
              >
                Edit answers
              </button>
            </div>

            {draftDeleted ? (
              /* Clean Post-Deletion State — Allows instant regeneration without refilling form */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div className="space-y-1.5">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    You deleted that draft. Pick a language below to generate a fresh review using your saved feedback.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2.5">Select Language</p>
                  <div className="grid grid-cols-3 gap-2">
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const active = selectedLanguage === lang.id;
                      return (
                        <button
                          key={lang.id}
                          type="button"
                          disabled={isGenerating}
                          onClick={() => setSelectedLanguage(lang.id)}
                          style={
                            active
                              ? {
                                  borderColor: primaryColor,
                                  backgroundColor: `${primaryColor}10`,
                                  color: secondaryColor,
                                }
                              : undefined
                          }
                          className={`min-h-[46px] px-3 py-2 rounded-xl border text-center transition-colors cursor-pointer ${
                            active
                              ? 'font-semibold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span lang={lang.id} className="text-sm font-semibold">
                            {lang.nativeLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {generateError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {generateError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleGenerateAfterDelete}
                    style={{ backgroundColor: primaryColor }}
                    className="flex-1 min-h-[48px] px-5 py-3 rounded-xl text-white font-semibold text-sm sm:text-base hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating new review...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Generate New Review</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('feedback')}
                    className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Back to Feedback Form
                  </button>
                </div>
              </div>
            ) : (
              /* Main Review Preview Card (Clean White, Minimal, Mobile-First) */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-5">
                {/* Language Switcher */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">Change Language</span>
                    <span className="text-xs font-medium text-slate-700">
                      Selected:{' '}
                      <span lang={selectedLanguage} className="font-semibold text-slate-900">
                        {getLanguageDisplayName(selectedLanguage)}
                      </span>
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Change Review Language"
                    className="grid grid-cols-3 gap-2 bg-slate-100/80 p-1 rounded-xl"
                  >
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const active = selectedLanguage === lang.id;
                      return (
                        <button
                          key={lang.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={isGenerating}
                          onClick={() => handleLanguageChangeOnPreview(lang.id)}
                          className={`min-h-[40px] px-3 py-2 rounded-lg text-sm transition-all cursor-pointer disabled:opacity-60 ${
                            active
                              ? 'bg-white text-slate-900 font-semibold shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span lang={lang.id}>{lang.nativeLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Review Textarea — Primary Focus */}
                <div className="relative">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label
                      htmlFor="review-draft-textarea"
                      className="text-xs font-medium text-slate-500"
                    >
                      {isEditing ? 'Editing Review' : 'Review Preview'}
                    </label>
                    <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums">
                      <span>{draftText.length} characters</span>
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      ref={textareaRef}
                      id="review-draft-textarea"
                      lang={selectedLanguage}
                      rows={5}
                      readOnly={!isEditing}
                      disabled={isGenerating}
                      value={draftText}
                      onChange={(e) => handleDraftTextChange(e.target.value)}
                      className={`w-full rounded-xl p-4 sm:p-5 text-base sm:text-[17px] text-slate-900 review-text-multilingual transition-all resize-y min-h-[152px] ${
                        isEditing
                          ? 'bg-white border-2 border-slate-900 focus:outline-none shadow-xs'
                          : 'bg-slate-50/70 border border-slate-200 focus:outline-none'
                      }`}
                    />
                    {isGenerating && (
                      <div className="absolute inset-0 rounded-xl bg-white/85 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-sm text-slate-700">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-700" />
                        <span lang={selectedLanguage}>
                          Writing natural review in {getLanguageDisplayName(selectedLanguage)}...
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {generateError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  >
                    {generateError}
                  </div>
                )}

                {/* Copy Confirmation + Post on Google Workflow */}
                {copied && (
                  <div
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Review copied successfully!</span>
                    </div>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      {openedGoogle
                        ? `Paste your copied text into ${profile.name}'s Google review box, review it, and submit when you are ready.`
                        : `Open ${profile.name}'s Google page below, then paste, review, and submit it manually.`}
                    </p>
                    <a
                      href={googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={handleOpenGoogleReview}
                      style={{ backgroundColor: primaryColor }}
                      className="w-full min-h-[46px] px-5 py-2.5 rounded-xl text-white font-semibold text-sm sm:text-base hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
                    >
                      <span>Post on Google</span>
                      <ExternalLink className="w-4 h-4 shrink-0" />
                    </a>
                  </div>
                )}

                {/* Primary Copy Action */}
                <button
                  type="button"
                  disabled={isGenerating || !draftText.trim()}
                  onClick={handleCopyReview}
                  style={{ backgroundColor: copied ? '#0F172A' : primaryColor }}
                  className="w-full min-h-[50px] px-6 py-3 rounded-xl text-white font-semibold text-base shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied to Clipboard</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Review</span>
                    </>
                  )}
                </button>

                {/* Secondary Actions: Edit, Regenerate, Delete */}
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleToggleEdit}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      isEditing
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>Done</span>
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                        <span>Edit Review</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleRegenerate}
                    className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>Regenerate</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setShowDeleteModal(true)}
                    className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-red-600 text-xs sm:text-sm font-medium hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Delete</span>
                  </button>
                </div>

                {openedGoogle && (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>Need to write a different review?</span>
                    <button
                      type="button"
                      onClick={handleStartNewFeedback}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Start Fresh</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-draft-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-5">
            <div className="space-y-2">
              <h2 id="delete-draft-title" className="text-base font-semibold text-slate-900">
                Are you sure you want to delete this generated review?
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                This only removes the draft. Your feedback answers will remain saved so you can generate a new review anytime.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteDraft}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

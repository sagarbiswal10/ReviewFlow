import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  FeedbackQuestion,
  FeedbackSubmissionResponse,
  FormTemplateId,
  PublicProfile,
  ReviewDraftStatus,
  ReviewLanguage,
  ReviewQualityReport,
  ReviewStyle,
} from '../types';
import {
  createReviewDraftRecord,
  logAiUsage,
  recordReviewEvent,
  saveFeedbackSubmission,
  updateReviewDraftLifecycle,
} from '../services/businessService';
import {
  fetchApprovedExamplesForPrompt,
  saveConsentedExample,
  saveReviewEvaluation,
} from '../services/platformFeaturesService';
import { apiFetch, formatApiError } from '../utils/apiClient';
import { composeGroundedFallbackReview, validateReviewQuality } from '../utils/reviewQuality';
import { sanitizeExternalUrl } from '../utils/urlAndAuth';
import {
  formatQuotaCountdown,
  resolveVisitorQuotaState,
  sanitizeFormTemplate,
  VISITOR_QUOTA_WINDOW_MS,
} from '../utils/domainHelpers';
import {
  classifyQuestionsForTemplate,
  mapOptionsToFiveFaces,
} from '../data/formTemplates';
import { BusinessLogo } from './BusinessLogo';

interface CustomerReviewFlowProps {
  profile: PublicProfile;
  isPreview?: boolean;
  tokenMismatch?: boolean;
  onExit?: () => void;
}

type FlowStep = 'feedback' | 'draft';

const MAX_USER_REVIEW_GENERATIONS = 5;

const LANGUAGE_OPTIONS: {
  id: ReviewLanguage;
  nativeLabel: string;
  englishLabel: string;
}[] = [
  { id: 'en', nativeLabel: 'English', englishLabel: 'English' },
  { id: 'hi', nativeLabel: 'हिंदी', englishLabel: 'Hindi' },
  { id: 'mr', nativeLabel: 'मराठी', englishLabel: 'Marathi' },
  { id: 'hinglish', nativeLabel: 'Hinglish', englishLabel: '' },
];

function getLanguageDisplayName(lang: ReviewLanguage): string {
  if (lang === 'hi') return 'हिंदी (Hindi)';
  if (lang === 'mr') return 'मराठी (Marathi)';
  if (lang === 'hinglish') return 'Hinglish';
  return 'English';
}

interface PersistedCustomerFlowState {
  step: FlowStep;
  generationCount: number;
  quotaResetAt: number;
  draftText: string;
  currentDraftId: string;
  feedbackSubmissionId: string;
  selectedLanguage: ReviewLanguage;
  draftDeleted: boolean;
  copied: boolean;
  openedGoogle: boolean;
  variationSeed: number;
  previousDrafts: string[];
  initialGeneratedText: string;
  savedResponses: FeedbackSubmissionResponse[];
  savedAdditionalComments: string;
}

function getFlowStorageKey(businessId: string): string {
  return `reviewflow_user_flow_v1_${businessId}`;
}

function getOrCreateVisitorId(isPreview: boolean): string {
  if (typeof window === 'undefined' || isPreview) {
    return `preview_${Math.random().toString(36).slice(2, 10)}`;
  }
  const key = 'reviewflow_visitor_id_v1';
  try {
    let existing = window.localStorage.getItem(key) || '';
    if (!existing) {
      existing = `vis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(key, existing);
    }
    return existing;
  } catch {
    return `vis_${Date.now().toString(36)}`;
  }
}

function readPersistedFlowState(businessId: string): PersistedCustomerFlowState | null {
  if (typeof window === 'undefined' || !businessId) return null;
  try {
    const raw = window.localStorage.getItem(getFlowStorageKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCustomerFlowState>;
    const resolvedQuota = resolveVisitorQuotaState(
      parsed.generationCount,
      parsed.quotaResetAt,
      Date.now(),
      MAX_USER_REVIEW_GENERATIONS,
      VISITOR_QUOTA_WINDOW_MS,
    );
    const lang: ReviewLanguage =
      parsed.selectedLanguage === 'hi' ||
      parsed.selectedLanguage === 'mr' ||
      parsed.selectedLanguage === 'hinglish'
        ? parsed.selectedLanguage
        : 'en';
    return {
      step: parsed.step === 'draft' ? 'draft' : 'feedback',
      generationCount: resolvedQuota.generationCount,
      quotaResetAt: resolvedQuota.quotaResetAt,
      draftText: typeof parsed.draftText === 'string' ? parsed.draftText : '',
      currentDraftId: typeof parsed.currentDraftId === 'string' ? parsed.currentDraftId : '',
      feedbackSubmissionId:
        typeof parsed.feedbackSubmissionId === 'string' ? parsed.feedbackSubmissionId : '',
      selectedLanguage: lang,
      draftDeleted: Boolean(parsed.draftDeleted),
      copied: Boolean(parsed.copied),
      openedGoogle: Boolean(parsed.openedGoogle),
      variationSeed:
        typeof parsed.variationSeed === 'number' && Number.isFinite(parsed.variationSeed)
          ? Math.max(1, Math.round(parsed.variationSeed))
          : 1,
      previousDrafts: Array.isArray(parsed.previousDrafts)
        ? parsed.previousDrafts.filter((d): d is string => typeof d === 'string').slice(-5)
        : [],
      initialGeneratedText:
        typeof parsed.initialGeneratedText === 'string' ? parsed.initialGeneratedText : '',
      savedResponses: Array.isArray(parsed.savedResponses) ? parsed.savedResponses : [],
      savedAdditionalComments:
        typeof parsed.savedAdditionalComments === 'string' ? parsed.savedAdditionalComments : '',
    };
  } catch {
    return null;
  }
}

export function CustomerReviewFlow({
  profile,
  isPreview = false,
  tokenMismatch = false,
  onExit,
}: CustomerReviewFlowProps) {
  const persistedInitial = useMemo(
    () => (isPreview ? null : readPersistedFlowState(profile.businessId)),
    [isPreview, profile.businessId],
  );
  const visitorId = useMemo(() => getOrCreateVisitorId(isPreview), [isPreview]);

  const activeTemplate: FormTemplateId = sanitizeFormTemplate(profile.formTemplate);
  const isDarkTemplate = activeTemplate === 'emoji_checklist_dark';
  const isEmojiChecklist =
    activeTemplate === 'emoji_checklist_light' || activeTemplate === 'emoji_checklist_dark';

  const [step, setStep] = useState<FlowStep>(persistedInitial?.step || 'feedback');
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [savedResponses, setSavedResponses] = useState<FeedbackSubmissionResponse[]>(
    persistedInitial?.savedResponses || [],
  );
  const [savedAdditionalComments, setSavedAdditionalComments] = useState<string>(
    persistedInitial?.savedAdditionalComments || '',
  );
  const [generationCount, setGenerationCount] = useState<number>(
    persistedInitial?.generationCount || 0,
  );
  const [quotaResetAt, setQuotaResetAt] = useState<number>(
    persistedInitial?.quotaResetAt || 0,
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [selectedLanguage, setSelectedLanguage] = useState<ReviewLanguage>(
    persistedInitial?.selectedLanguage || 'en',
  );
  const [selectedStyle] = useState<ReviewStyle>(
    profile.branding?.defaultReviewStyle || 'short',
  );

  const [draftText, setDraftText] = useState(persistedInitial?.draftText || '');
  const [currentDraftId, setCurrentDraftId] = useState(persistedInitial?.currentDraftId || '');
  const [feedbackSubmissionId, setFeedbackSubmissionId] = useState(
    persistedInitial?.feedbackSubmissionId || '',
  );
  const [draftStatus, setDraftStatus] = useState<ReviewDraftStatus>(
    persistedInitial?.draftDeleted ? 'Deleted' : persistedInitial?.copied ? 'Copied' : 'Generated',
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draftDeleted, setDraftDeleted] = useState(Boolean(persistedInitial?.draftDeleted));
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(Boolean(persistedInitial?.copied));
  const [openedGoogle, setOpenedGoogle] = useState(Boolean(persistedInitial?.openedGoogle));
  const [variationSeed, setVariationSeed] = useState(persistedInitial?.variationSeed || 1);
  const [previousDrafts, setPreviousDrafts] = useState<string[]>(
    persistedInitial?.previousDrafts || [],
  );
  const [initialGeneratedText, setInitialGeneratedText] = useState(
    persistedInitial?.initialGeneratedText || '',
  );
  const [lastQualityReport, setLastQualityReport] = useState<ReviewQualityReport | null>(null);
  const [consentOptIn, setConsentOptIn] = useState(false);
  const [consentSaved, setConsentSaved] = useState(false);

  const scanLoggedRef = useRef(false);
  const formStartedLoggedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consentedDraftIdsRef = useRef<Set<string>>(new Set());

  const remainingGenerations = Math.max(0, MAX_USER_REVIEW_GENERATIONS - generationCount);
  const hasReachedGenerationLimit = generationCount >= MAX_USER_REVIEW_GENERATIONS;
  const countdownText =
    quotaResetAt > nowMs ? formatQuotaCountdown(quotaResetAt, nowMs) : '0:00';

  const primaryColor = profile.branding?.primaryColor || '#0F766E';
  const secondaryColor = profile.branding?.secondaryColor || '#0F172A';
  const templateAccentColor = isEmojiChecklist
    ? primaryColor === '#0F766E' && isPreview === false
      ? primaryColor
      : primaryColor || '#2563EB'
    : primaryColor;

  const classifiedQuestions = useMemo(
    () => classifyQuestionsForTemplate(profile.questions),
    [profile.questions],
  );

  // Live 1-second timer to auto-refresh the 5-generation quota after 5 minutes
  useEffect(() => {
    if (isPreview || !quotaResetAt || generationCount === 0) return;

    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (current >= quotaResetAt) {
        setGenerationCount(0);
        setQuotaResetAt(0);
        setGenerateError(null);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [isPreview, quotaResetAt, generationCount]);

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
    if (isPreview || typeof window === 'undefined') return;
    try {
      const payload: PersistedCustomerFlowState = {
        step,
        generationCount,
        quotaResetAt,
        draftText,
        currentDraftId,
        feedbackSubmissionId,
        selectedLanguage,
        draftDeleted,
        copied,
        openedGoogle,
        variationSeed,
        previousDrafts,
        initialGeneratedText,
        savedResponses,
        savedAdditionalComments,
      };
      window.localStorage.setItem(getFlowStorageKey(profile.businessId), JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    copied,
    currentDraftId,
    draftDeleted,
    draftText,
    feedbackSubmissionId,
    generationCount,
    initialGeneratedText,
    isPreview,
    openedGoogle,
    previousDrafts,
    profile.businessId,
    quotaResetAt,
    savedAdditionalComments,
    savedResponses,
    selectedLanguage,
    step,
    variationSeed,
  ]);

  useEffect(() => {
    if (isPreview || typeof window === 'undefined') return;
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key !== getFlowStorageKey(profile.businessId) || !e.newValue) return;
      const updated = readPersistedFlowState(profile.businessId);
      if (!updated) return;
      setGenerationCount(updated.generationCount);
      setQuotaResetAt(updated.quotaResetAt);
      if (updated.step === 'draft') {
        setStep('draft');
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, [isPreview, profile.businessId]);

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

    if (
      structuredResponses.length === 0 &&
      !additionalComments &&
      (savedResponses.length > 0 || savedAdditionalComments)
    ) {
      return { responses: savedResponses, additionalComments: savedAdditionalComments };
    }
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
    try {
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
    } catch {
      const localSubId = `local_fb_${Date.now()}`;
      setFeedbackSubmissionId(localSubId);
      return localSubId;
    }
  };

  const applyGenerationQuotaUpdate = (serverResetAt?: number, serverRemaining?: number) => {
    const now = Date.now();
    if (typeof serverResetAt === 'number' && Number.isFinite(serverResetAt) && serverResetAt > now) {
      setQuotaResetAt(serverResetAt);
    } else if (!quotaResetAt || quotaResetAt <= now) {
      setQuotaResetAt(now + VISITOR_QUOTA_WINDOW_MS);
    }
    if (typeof serverRemaining === 'number' && Number.isFinite(serverRemaining)) {
      const nextUsed = Math.max(
        0,
        Math.min(MAX_USER_REVIEW_GENERATIONS, MAX_USER_REVIEW_GENERATIONS - Math.floor(serverRemaining)),
      );
      setGenerationCount(nextUsed);
    } else {
      setGenerationCount((prev) => Math.min(MAX_USER_REVIEW_GENERATIONS, prev + 1));
    }
  };

  const requestAiDraft = async (
    languageToUse: ReviewLanguage,
    seed: number,
    submissionIdOverride?: string,
  ) => {
    const currentNow = Date.now();
    const isWindowActive = !quotaResetAt || currentNow < quotaResetAt;
    if (generationCount >= MAX_USER_REVIEW_GENERATIONS && isWindowActive) {
      const countdown = quotaResetAt > currentNow ? formatQuotaCountdown(quotaResetAt, currentNow) : '5:00';
      setGenerateError(
        `You have reached the limit of ${MAX_USER_REVIEW_GENERATIONS} review generations. Your limit will refresh automatically in ${countdown}.`,
      );
      return;
    }

    if (quotaResetAt > 0 && currentNow >= quotaResetAt) {
      setGenerationCount(0);
      setQuotaResetAt(0);
    }

    setIsGenerating(true);
    setGenerateError(null);
    setCopied(false);
    setOpenedGoogle(false);
    setIsEditing(false);

    try {
      const { responses, additionalComments } = buildStructuredPayload();
      setSavedResponses(responses);
      setSavedAdditionalComments(additionalComments);
      const activeSubmissionId = submissionIdOverride || (await ensureFeedbackSubmission());

      const buildLocalFallback = () =>
        composeGroundedFallbackReview({
          businessName: profile.name,
          category: profile.category,
          responses,
          additionalComments,
          style: selectedStyle,
          language: languageToUse,
          variationSeed: seed,
        });

      const persistDraftSafely = async (
        textToSave: string,
        computedQuality: ReviewQualityReport,
        telemetry?: {
          provider?: string;
          modelId?: string;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          estimatedCostUsd?: number;
        },
      ) => {
        if (isPreview) {
          setCurrentDraftId(`preview_dr_${Date.now()}`);
          return;
        }
        try {
          const canPersistRemoteSub = Boolean(activeSubmissionId) && !activeSubmissionId.startsWith('local_fb_');
          let newDraftId = `local_dr_${Date.now()}`;
          if (canPersistRemoteSub) {
            newDraftId = await createReviewDraftRecord({
              profile,
              feedbackSubmissionId: activeSubmissionId,
              reviewText: textToSave,
              language: languageToUse,
              reviewStyle: selectedStyle,
              variationSeed: seed,
              sessionId: standContext.sessionId,
            });
          }
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

          const responsesSummary = responses
            .map((r) => `${r.question}: ${r.answers.join(', ')}`)
            .join(' | ');

          saveReviewEvaluation({
            businessId: profile.businessId,
            businessName: profile.name,
            ownerId: profile.ownerId,
            clientUid: profile.clientUid,
            slug: profile.slug,
            category: profile.category,
            language: languageToUse,
            reviewStyle: selectedStyle,
            draftId: newDraftId,
            source: 'live_customer',
            modelId: telemetry?.modelId || 'grounded-composer-v1',
            qualityReport: computedQuality,
            responsesSummary,
            generatedReview: textToSave,
          });

          if (telemetry) {
            logAiUsage({
              businessId: profile.businessId,
              ownerId: profile.ownerId,
              provider: telemetry.provider || 'gemini',
              operationType: 'review_draft',
              modelName: telemetry.modelId || 'gemini-3.1-flash-lite',
              inputTokens: telemetry.inputTokens || 0,
              outputTokens: telemetry.outputTokens || 0,
              totalTokens: telemetry.totalTokens || 0,
              estimatedCostUsd: telemetry.estimatedCostUsd || 0,
              status: 'success',
            });
          }
        } catch {
          // Non-fatal: keep generated review usable even if remote analytics/draft persistence fails
          setCurrentDraftId(`local_dr_${Date.now()}`);
        }
      };

      const applyFinalDraft = async (
        generatedText: string,
        qualityReportOverride?: ReviewQualityReport,
        quotaResetOverride?: number,
        quotaRemainingOverride?: number,
        telemetry?: {
          provider?: string;
          modelId?: string;
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          estimatedCostUsd?: number;
        },
      ) => {
        const computedQuality =
          qualityReportOverride ||
          validateReviewQuality({
            reviewText: generatedText,
            language: languageToUse,
            businessName: profile.name,
            category: profile.category,
            responses,
            additionalComments,
            previousDrafts: previousDrafts.slice(-4),
          });

        setDraftText(generatedText);
        setInitialGeneratedText(generatedText);
        setLastQualityReport(computedQuality);
        setConsentSaved(false);
        setPreviousDrafts((prev) => [...prev, generatedText].slice(-5));
        applyGenerationQuotaUpdate(quotaResetOverride, quotaRemainingOverride);
        setDraftStatus('Generated');
        setDraftDeleted(false);
        setStep('draft');
        await persistDraftSafely(generatedText, computedQuality, telemetry);
      };

      if (profile.enabledFeatures && !profile.enabledFeatures.aiReviewDrafts) {
        const composed = buildLocalFallback();
        await applyFinalDraft(composed.reviewText, undefined, undefined, undefined, {
          provider: 'grounded-fallback',
          modelId: 'grounded-composer-v1',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        });
        return;
      }

      let fewShotExamples: Array<{ responsesSummary: string; finalReview: string }> = [];
      if (!isPreview) {
        try {
          fewShotExamples = await fetchApprovedExamplesForPrompt(languageToUse, profile.category);
        } catch {
          fewShotExamples = [];
        }
      }

      const res = await apiFetch('/api/generate-review', {
        method: 'POST',
        body: JSON.stringify({
          businessId: profile.businessId,
          visitorId,
          businessName: profile.name,
          category: profile.category,
          responses,
          additionalComments,
          style: selectedStyle,
          language: languageToUse,
          variationSeed: seed,
          previousDrafts: previousDrafts.slice(-4),
          fewShotExamples,
        }),
      });

      const rawBody = await res.text();
      let data: {
        review?: string;
        language?: ReviewLanguage;
        qualityReport?: ReviewQualityReport;
        quotaRemaining?: number;
        quotaResetAt?: number;
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
        data = {};
      }

      if (res.status === 429) {
        setGenerationCount(MAX_USER_REVIEW_GENERATIONS);
        setQuotaResetAt(
          typeof data.quotaResetAt === 'number' && data.quotaResetAt > Date.now()
            ? data.quotaResetAt
            : Date.now() + VISITOR_QUOTA_WINDOW_MS,
        );
        throw new Error(
          data.error ||
            `You have reached the limit of ${MAX_USER_REVIEW_GENERATIONS} review generations. Your limit will refresh in 5 minutes.`,
        );
      }

      if (!res.ok || !data.review) {
        const composed = buildLocalFallback();
        await applyFinalDraft(
          composed.reviewText,
          undefined,
          data.quotaResetAt,
          data.quotaRemaining,
          {
            provider: 'grounded-fallback',
            modelId: 'grounded-composer-v1',
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
          },
        );
        return;
      }

      await applyFinalDraft(
        data.review.trim(),
        data.qualityReport,
        data.quotaResetAt,
        data.quotaRemaining,
        data.aiTelemetry,
      );
    } catch (err) {
      const msg = formatApiError(err, 'Unable to generate review draft.');
      if (msg.toLowerCase().includes('limit of')) {
        setGenerateError(msg);
      } else {
        const { responses, additionalComments } = buildStructuredPayload();
        const composed = composeGroundedFallbackReview({
          businessName: profile.name,
          category: profile.category,
          responses,
          additionalComments,
          style: selectedStyle,
          language: languageToUse,
          variationSeed: seed,
        });
        const fallbackQuality = validateReviewQuality({
          reviewText: composed.reviewText,
          language: languageToUse,
          businessName: profile.name,
          category: profile.category,
          responses,
          additionalComments,
          previousDrafts: previousDrafts.slice(-4),
        });
        setDraftText(composed.reviewText);
        setInitialGeneratedText(composed.reviewText);
        setLastQualityReport(fallbackQuality);
        setConsentSaved(false);
        setPreviousDrafts((prev) => [...prev, composed.reviewText].slice(-5));
        applyGenerationQuotaUpdate();
        setDraftStatus('Generated');
        setDraftDeleted(false);
        setStep('draft');
        setCurrentDraftId(isPreview ? `preview_dr_${Date.now()}` : `local_dr_${Date.now()}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    if (hasReachedGenerationLimit && quotaResetAt > Date.now()) {
      setGenerateError(
        `You have reached the limit of ${MAX_USER_REVIEW_GENERATIONS} review generations. Your limit refreshes automatically in ${countdownText}.`,
      );
      return;
    }
    setValidationError(null);
    setGenerateError(null);

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

    setIsGenerating(true);
    try {
      const { responses, additionalComments } = buildStructuredPayload();
      setSavedResponses(responses);
      setSavedAdditionalComments(additionalComments);
      let submissionId = '';
      if (!isPreview) {
        try {
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
        } catch {
          submissionId = `local_fb_${Date.now()}`;
        }
      } else {
        submissionId = `preview_fb_${Date.now()}`;
      }
      setFeedbackSubmissionId(submissionId);

      const nextSeed = variationSeed;
      await requestAiDraft(selectedLanguage, nextSeed, submissionId);
    } catch (err) {
      setGenerateError(formatApiError(err, 'Unable to save feedback or generate review draft.'));
      setIsGenerating(false);
    }
  };

  const handleLanguageChangeOnPreview = async (nextLang: ReviewLanguage) => {
    if (isGenerating || hasReachedGenerationLimit) return;
    if (nextLang === selectedLanguage && !draftDeleted && draftText) return;
    setSelectedLanguage(nextLang);
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    await requestAiDraft(nextLang, nextSeed, feedbackSubmissionId);
  };

  const handleRegenerate = async () => {
    if (isGenerating || hasReachedGenerationLimit) return;
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
      const isRemoteDraftId =
        Boolean(currentDraftId) &&
        !currentDraftId.startsWith('local_dr_') &&
        !currentDraftId.startsWith('preview_dr_');
      if (!isPreview && isRemoteDraftId && draftText.trim() && draftStatus === 'Edited') {
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
    const isRemoteDraftId =
      Boolean(currentDraftId) &&
      !currentDraftId.startsWith('local_dr_') &&
      !currentDraftId.startsWith('preview_dr_');
    if (!isPreview && isRemoteDraftId && nextVal.trim()) {
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

  const persistConsentedExampleIfOptedIn = async (finalReviewText: string) => {
    if (isPreview || !consentOptIn || !currentDraftId || !finalReviewText.trim()) return;
    if (consentedDraftIdsRef.current.has(currentDraftId)) return;
    consentedDraftIdsRef.current.add(currentDraftId);
    const { responses, additionalComments } = buildStructuredPayload();
    const responsesSummary = responses
      .map((r) => `${r.question}: ${r.answers.join(', ')}`)
      .join(' | ');
    await saveConsentedExample({
      businessId: profile.businessId,
      ownerId: profile.ownerId,
      slug: profile.slug,
      category: profile.category,
      language: selectedLanguage,
      reviewStyle: selectedStyle,
      responsesSummary,
      additionalComments,
      generatedReview: initialGeneratedText || finalReviewText,
      finalReview: finalReviewText.trim(),
      qualityScore: lastQualityReport?.score ?? 90,
    });
    setConsentSaved(true);
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

    const isRemoteDraftId =
      Boolean(currentDraftId) &&
      !currentDraftId.startsWith('local_dr_') &&
      !currentDraftId.startsWith('preview_dr_');
    if (!isPreview && isRemoteDraftId) {
      updateReviewDraftLifecycle({
        profile,
        draftId: currentDraftId,
        status: 'Copied',
        reviewText: draftText,
      });
      await persistConsentedExampleIfOptedIn(draftText);
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
      const isRemoteDraftId =
        Boolean(currentDraftId) &&
        !currentDraftId.startsWith('local_dr_') &&
        !currentDraftId.startsWith('preview_dr_');
      if (!isPreview && isRemoteDraftId) {
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
    if (isGenerating || hasReachedGenerationLimit) return;
    const nextSeed = variationSeed + 1;
    setVariationSeed(nextSeed);
    await requestAiDraft(selectedLanguage, nextSeed, feedbackSubmissionId);
  };

  const googleUrl = sanitizeExternalUrl(profile.googleReviewUrl, 'https://www.google.com/maps');

  const outerShellClass =
    activeTemplate === 'emoji_checklist_dark'
      ? 'min-h-screen bg-[#0B1221] text-slate-100 flex flex-col relative overflow-x-hidden'
      : activeTemplate === 'warm_editorial'
        ? 'min-h-screen bg-[#FAF7F2] text-stone-900 flex flex-col relative overflow-x-hidden'
        : activeTemplate === 'quick_tap_express'
          ? 'min-h-screen bg-[#F0FDFA] text-slate-900 flex flex-col relative overflow-x-hidden'
          : 'min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col relative overflow-x-hidden';

  const headerClass = isDarkTemplate
    ? 'sticky top-0 z-30 bg-[#0B1221]/95 backdrop-blur-md border-b border-slate-800/80'
    : activeTemplate === 'warm_editorial'
      ? 'sticky top-0 z-30 bg-[#FAF7F2]/95 backdrop-blur-md border-b border-stone-200/80'
      : 'sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80';

  const renderLanguageSelectorBlock = (compact = false) => {
    if (isDarkTemplate) {
      return (
        <section className={compact ? 'pt-3' : 'bg-[#131C31] rounded-2xl border border-slate-800 p-5 sm:p-6'}>
          <div className="mb-3">
            <h2 className="text-sm sm:text-base font-semibold text-white">
              Choose Review Language
            </h2>
            {!compact && (
              <p className="text-xs text-slate-400 mt-0.5">
                Your review will be written naturally in the language you pick.
              </p>
            )}
          </div>
          <div
            role="radiogroup"
            aria-label="Review Language"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
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
                          borderColor: templateAccentColor,
                          backgroundColor: `${templateAccentColor}26`,
                        }
                      : undefined
                  }
                  className={`min-h-[48px] px-3 py-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                    active
                      ? 'text-white font-semibold ring-1 ring-blue-400/50'
                      : 'bg-[#0F172A] border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  <span lang={lang.id} className="text-sm font-semibold leading-snug">
                    {lang.nativeLabel}
                  </span>
                  {!compact && lang.id !== 'en' && lang.id !== 'hinglish' && lang.englishLabel && (
                    <span className="text-[11px] text-slate-400 font-normal mt-0.5">
                      {lang.englishLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      );
    }

    return (
      <section
        className={
          compact
            ? 'pt-2'
            : activeTemplate === 'warm_editorial'
              ? 'bg-[#FFFDF9] rounded-2xl border border-stone-200/90 shadow-xs p-5 sm:p-6'
              : 'bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6'
        }
      >
        <div className="mb-3">
          <h2 className="text-sm sm:text-base font-semibold text-slate-900">
            Choose Review Language
          </h2>
          {!compact && (
            <p className="text-xs text-slate-500 mt-0.5">
              Your review will be written naturally in the language you pick.
            </p>
          )}
        </div>

        <div
          role="radiogroup"
          aria-label="Review Language"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
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
                        borderColor: templateAccentColor,
                        backgroundColor: `${templateAccentColor}12`,
                        color: secondaryColor,
                      }
                    : undefined
                }
                className={`min-h-[48px] px-3 py-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                  active
                    ? 'font-semibold ring-1'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span lang={lang.id} className="text-sm font-semibold leading-snug">
                  {lang.nativeLabel}
                </span>
                {!compact && lang.id !== 'en' && lang.id !== 'hinglish' && lang.englishLabel && (
                  <span className="text-[11px] text-slate-500 font-normal mt-0.5">
                    {lang.englishLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderEmojiRatingSection = (question: FeedbackQuestion) => {
    const faces = mapOptionsToFiveFaces(question.options);
    const currentSelection = answers[question.id]?.[0] || '';
    const activeFace = faces.find((f) => f.optionValue === currentSelection) ?? null;

    return (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            className={`text-base sm:text-lg font-semibold ${
              isDarkTemplate ? 'text-white' : 'text-slate-900'
            }`}
          >
            {question.prompt}
          </h2>
          {question.required && (
            <span
              className={`text-[11px] font-medium shrink-0 ${
                isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Required
            </span>
          )}
        </div>

        <div className="grid grid-cols-5 gap-2 sm:gap-3 pt-1">
          {faces.map((face) => {
            const isSelected = currentSelection === face.optionValue;
            return (
              <div key={`${face.sentimentRank}-${face.optionValue}`} className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleOption(question.id, face.optionValue, 'single')}
                  aria-label={`${face.optionValue}`}
                  aria-pressed={isSelected}
                  style={
                    isSelected
                      ? {
                          backgroundColor: templateAccentColor,
                          boxShadow: `0 8px 20px -6px ${templateAccentColor}80`,
                        }
                      : undefined
                  }
                  className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-2xl sm:text-[28px] transition-all cursor-pointer select-none ${
                    isSelected
                      ? 'scale-105 text-white'
                      : isDarkTemplate
                        ? 'bg-[#1B2742] hover:bg-[#233254] border border-slate-700/70'
                        : 'bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/70'
                  }`}
                >
                  <span role="img" aria-hidden="true" className="leading-none">
                    {face.emoji}
                  </span>
                  {isSelected && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center shadow-xs ${
                        isDarkTemplate
                          ? 'bg-white text-blue-600'
                          : 'bg-white text-blue-600 border border-blue-100'
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </button>
                <span
                  className={`text-[11px] sm:text-xs font-semibold text-center leading-tight min-h-[16px] transition-opacity ${
                    isSelected ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={isSelected ? { color: isDarkTemplate ? '#60A5FA' : templateAccentColor } : undefined}
                >
                  {face.shortLabel}
                </span>
              </div>
            );
          })}
        </div>
        {!activeFace && (
          <p className={`text-xs ${isDarkTemplate ? 'text-slate-400' : 'text-slate-500'}`}>
            Tap an expression to rate
          </p>
        )}
      </div>
    );
  };

  const renderChecklistQuestionSection = (question: FeedbackQuestion) => {
    const selectedValues = answers[question.id] ?? [];
    const mode = question.type === 'single' ? 'single' : 'multiple';

    return (
      <div key={question.id} className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2
            className={`text-base font-semibold ${
              isDarkTemplate ? 'text-white' : 'text-slate-900'
            }`}
          >
            {question.prompt}
          </h2>
          <span
            className={`text-[11px] whitespace-nowrap shrink-0 ${
              isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {question.required ? 'Required' : 'Optional'}
            {question.type === 'multiple' ? ' · Select multiple' : ''}
          </span>
        </div>

        <div
          className={`divide-y ${
            isDarkTemplate ? 'divide-slate-800/90 border-t border-b border-slate-800/90' : 'divide-slate-200/80 border-t border-b border-slate-200/80'
          }`}
        >
          {question.options.map((option) => {
            const isSelected = selectedValues.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleOption(question.id, option, mode)}
                aria-pressed={isSelected}
                className={`w-full min-h-[48px] py-3 px-1 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                  isDarkTemplate
                    ? 'hover:bg-white/[0.03]'
                    : 'hover:bg-slate-50/80'
                }`}
              >
                <span
                  className={`text-sm sm:text-[15px] leading-snug ${
                    isSelected
                      ? isDarkTemplate
                        ? 'text-white font-medium'
                        : 'text-slate-950 font-medium'
                      : isDarkTemplate
                        ? 'text-slate-300'
                        : 'text-slate-600'
                  }`}
                >
                  {option}
                </span>

                <span
                  className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-[#22C55E] text-white shadow-xs'
                      : isDarkTemplate
                        ? 'border-2 border-slate-600 bg-transparent'
                        : 'border-2 border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFeedbackFormBody = () => {
    // 1. Pulse Light OR Midnight Dark (Emoji + Checklist template modeled faithfully on user design)
    if (isEmojiChecklist) {
      const { ratingQuestion, checklistQuestions, textQuestions } = classifiedQuestions;
      return (
        <form onSubmit={handleGenerateSubmit} className="space-y-5">
          <div
            className={`rounded-3xl p-5 sm:p-8 space-y-6 ${
              isDarkTemplate
                ? 'bg-[#131C31] border border-slate-800/90 shadow-2xl'
                : 'bg-white border border-slate-200/90 shadow-sm'
            }`}
          >
            {/* Top card headline */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className={isDarkTemplate ? 'text-slate-400' : 'text-slate-500'}>
                  {profile.name}
                </span>
                <span aria-hidden="true" className={isDarkTemplate ? 'text-slate-600' : 'text-slate-300'}>
                  ·
                </span>
                <span className={isDarkTemplate ? 'text-slate-400' : 'text-slate-500'}>
                  {profile.category}
                </span>
              </div>
              <h1
                className={`text-2xl sm:text-[28px] font-display font-bold tracking-tight ${
                  isDarkTemplate ? 'text-white' : 'text-slate-950'
                }`}
              >
                Share your feedback
              </h1>
              {profile.branding?.welcomeMessage && (
                <p
                  className={`text-xs sm:text-sm leading-relaxed ${
                    isDarkTemplate ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {profile.branding.welcomeMessage}
                </p>
              )}
            </div>

            {/* Rating question rendered as 5 circular face emojis */}
            {ratingQuestion && renderEmojiRatingSection(ratingQuestion)}

            {/* All remaining selection / highlight questions rendered as clean checklist rows */}
            {checklistQuestions.map((question) => renderChecklistQuestionSection(question))}

            {/* All text questions rendered as bordered optional comment box */}
            {textQuestions.map((question) => (
              <div key={question.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`comment-${question.id}`}
                    className={`text-base font-semibold ${
                      isDarkTemplate ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {question.prompt}
                  </label>
                  {question.required && (
                    <span
                      className={`text-[11px] ${
                        isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Required
                    </span>
                  )}
                </div>
                <textarea
                  id={`comment-${question.id}`}
                  rows={3}
                  value={textInputs[question.id] ?? ''}
                  onChange={(e) => {
                    markFormStarted();
                    setValidationError(null);
                    setTextInputs((prev) => ({ ...prev, [question.id]: e.target.value }));
                  }}
                  placeholder={question.placeholder || 'Describe your experience here'}
                  className={`w-full rounded-xl px-4 py-3 text-sm sm:text-base focus:outline-none focus:ring-2 review-text-multilingual ${
                    isDarkTemplate
                      ? 'bg-[#0F172A] border border-slate-700/80 text-white placeholder:text-slate-500 focus:ring-blue-500/40'
                      : 'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-blue-500/20'
                  }`}
                />
              </div>
            ))}

            {/* Compact Language Selector */}
            {renderLanguageSelectorBlock(true)}

            {(validationError || generateError) && (
              <div
                role="alert"
                className={`rounded-xl px-4 py-3 text-sm ${
                  isDarkTemplate
                    ? 'border border-red-500/40 bg-red-950/50 text-red-200'
                    : 'border border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {validationError || generateError}
              </div>
            )}

            {/* Primary CTA + Refresh Countdown */}
            <div className="pt-1 space-y-2.5">
              {hasReachedGenerationLimit && quotaResetAt > nowMs && (
                <div
                  className={`rounded-xl px-4 py-3 text-xs sm:text-sm flex items-center justify-between gap-2 ${
                    isDarkTemplate
                      ? 'bg-amber-950/40 border border-amber-500/30 text-amber-200'
                      : 'bg-amber-50 border border-amber-200 text-amber-900'
                  }`}
                >
                  <span>5/5 review drafts generated</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
                    <Clock className="w-3.5 h-3.5" />
                    Refreshes in {countdownText}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
                style={{ backgroundColor: templateAccentColor }}
                className="w-full min-h-[52px] px-6 py-3.5 rounded-2xl text-white font-semibold text-base shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating review in {getLanguageDisplayName(selectedLanguage)}...</span>
                  </>
                ) : hasReachedGenerationLimit && quotaResetAt > nowMs ? (
                  <span>Limit Reached · Refreshes in {countdownText}</span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Review</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      );
    }

    // 2. Warm Hospitality · Editorial
    if (activeTemplate === 'warm_editorial') {
      return (
        <form onSubmit={handleGenerateSubmit} className="space-y-6">
          <div className="bg-[#FFFDF9] rounded-2xl border border-stone-200/90 shadow-xs p-6 sm:p-8 text-center space-y-3">
            <div className="flex justify-center">
              <BusinessLogo
                src={profile.logoDataUrl}
                name={profile.name}
                primaryColor={primaryColor}
                sizeClass="w-14 h-14"
              />
            </div>
            <p className="text-xs font-medium tracking-wide uppercase text-stone-500">
              {profile.category}
            </p>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-stone-900 tracking-tight">
              {profile.name}
            </h1>
            <p className="text-sm text-stone-600 max-w-lg mx-auto leading-relaxed">
              {profile.branding?.welcomeMessage ||
                'Tell us how your visit felt in a few thoughtful taps.'}
            </p>
          </div>

          {profile.questions.map((question, qIndex) => (
            <section
              key={question.id}
              className="bg-[#FFFDF9] rounded-2xl border border-stone-200/90 shadow-xs p-5 sm:p-7"
            >
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-stone-900 flex items-baseline gap-2.5">
                  <span className="font-mono text-xs text-amber-700 font-bold">
                    {String(qIndex + 1).padStart(2, '0')}
                  </span>
                  <span>{question.prompt}</span>
                </h2>
                <span className="text-xs text-stone-500 whitespace-nowrap shrink-0">
                  {question.required ? 'Required' : 'Optional'}
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
                  placeholder={question.placeholder || 'Share any warm highlights or notes...'}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-700/20 review-text-multilingual"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'shadow-xs'
                            : 'bg-white border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        <span>{option}</span>
                        {isSelected && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}

          {renderLanguageSelectorBlock(false)}

          {(validationError || generateError) && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validationError || generateError}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
              style={{ backgroundColor: primaryColor }}
              className="w-full min-h-[52px] px-6 py-3.5 rounded-xl text-white font-semibold text-base shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating review in {getLanguageDisplayName(selectedLanguage)}...</span>
                </>
              ) : hasReachedGenerationLimit && quotaResetAt > nowMs ? (
                <span>Limit Reached · Refreshes in {countdownText}</span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Review</span>
                </>
              )}
            </button>
          </div>
        </form>
      );
    }

    // 3. Split Executive · Structured Grid
    if (activeTemplate === 'split_executive') {
      return (
        <form onSubmit={handleGenerateSubmit} className="space-y-4">
          <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-7 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
                {profile.category}
              </p>
              <h1 className="text-xl sm:text-2xl font-display font-bold mt-1 truncate">
                {profile.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                {profile.branding?.welcomeMessage ||
                  'Select your responses below to generate a concise review.'}
              </p>
            </div>
            <BusinessLogo
              src={profile.logoDataUrl}
              name={profile.name}
              primaryColor={primaryColor}
              sizeClass="w-14 h-14 shrink-0"
            />
          </div>

          {profile.questions.map((question, qIndex) => (
            <section
              key={question.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6"
            >
              <div className="flex items-baseline justify-between gap-2 mb-3.5 pb-2.5 border-b border-slate-100">
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  {qIndex + 1}. {question.prompt}
                </h2>
                <span className="text-[11px] font-medium text-slate-500 shrink-0">
                  {question.required ? 'Required' : 'Optional'}
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
                  placeholder={question.placeholder || 'Add additional notes (optional)'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15 review-text-multilingual"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                                backgroundColor: '#0F172A',
                                borderColor: '#0F172A',
                                color: '#FFFFFF',
                              }
                            : undefined
                        }
                        className={`min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-medium border text-left transition-colors cursor-pointer flex items-center gap-2.5 ${
                          isSelected
                            ? ''
                            : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            isSelected ? 'bg-teal-500 border-teal-500 text-white' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                        <span className="truncate">{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ))}

          {renderLanguageSelectorBlock(false)}

          {(validationError || generateError) && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validationError || generateError}
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
            style={{ backgroundColor: primaryColor }}
            className="w-full min-h-[50px] px-6 py-3.5 rounded-xl text-white font-semibold text-base shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating review in {getLanguageDisplayName(selectedLanguage)}...</span>
              </>
            ) : hasReachedGenerationLimit && quotaResetAt > nowMs ? (
              <span>Limit Reached · Refreshes in {countdownText}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Review</span>
              </>
            )}
          </button>
        </form>
      );
    }

    // 4. Express Check-In · 15-Sec Tap
    if (activeTemplate === 'quick_tap_express') {
      return (
        <form onSubmit={handleGenerateSubmit} className="bg-white rounded-3xl border border-teal-100 shadow-sm p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <BusinessLogo
              src={profile.logoDataUrl}
              name={profile.name}
              primaryColor={primaryColor}
              sizeClass="w-11 h-11"
            />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-display font-bold text-slate-900 truncate">
                {profile.name}
              </h1>
              <p className="text-xs text-slate-500">
                15-Second Quick Check-In · {profile.category}
              </p>
            </div>
          </div>

          {profile.questions.map((question) => (
            <div key={question.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                  {question.prompt}
                </h2>
                {question.required && (
                  <span className="text-[11px] font-medium text-teal-700 shrink-0">Required</span>
                )}
              </div>

              {question.type === 'text' ? (
                <textarea
                  rows={2}
                  value={textInputs[question.id] ?? ''}
                  onChange={(e) => {
                    markFormStarted();
                    setValidationError(null);
                    setTextInputs((prev) => ({ ...prev, [question.id]: e.target.value }));
                  }}
                  placeholder={question.placeholder || 'Optional quick note...'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-700/15 review-text-multilingual"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
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
                        className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {renderLanguageSelectorBlock(true)}

          {(validationError || generateError) && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {validationError || generateError}
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
            style={{ backgroundColor: primaryColor }}
            className="w-full min-h-[50px] px-6 py-3.5 rounded-2xl text-white font-semibold text-base shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating review in {getLanguageDisplayName(selectedLanguage)}...</span>
              </>
            ) : hasReachedGenerationLimit && quotaResetAt > nowMs ? (
              <span>Limit Reached · Refreshes in {countdownText}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Review</span>
              </>
            )}
          </button>
        </form>
      );
    }

    // 5. Classic Clean Cards (default backward-compatible template)
    return (
      <form onSubmit={handleGenerateSubmit} className="space-y-6">
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

        {renderLanguageSelectorBlock(false)}

        {(validationError || generateError) && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {validationError || generateError}
          </div>
        )}

        <div className="pt-1 space-y-2.5">
          {hasReachedGenerationLimit && quotaResetAt > nowMs && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900 flex items-center justify-between gap-2">
              <span>5/5 review generations used.</span>
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
                <Clock className="w-3.5 h-3.5" />
                Refreshes in {countdownText}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
            style={{ backgroundColor: primaryColor }}
            className="w-full min-h-[50px] px-6 py-3.5 rounded-xl text-white font-semibold text-base shadow-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating review in {getLanguageDisplayName(selectedLanguage)}...</span>
              </>
            ) : hasReachedGenerationLimit && quotaResetAt > nowMs ? (
              <span>Limit Reached · Refreshes in {countdownText}</span>
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
    );
  };

  return (
    <div className={outerShellClass}>
      {/* Minimal Header */}
      <header className={headerClass}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className={`min-h-[40px] min-w-[40px] -ml-2 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                  isDarkTemplate
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
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
              <p
                className={`text-sm font-semibold truncate ${
                  isDarkTemplate ? 'text-white' : 'text-slate-900'
                }`}
              >
                {profile.name}
              </p>
              <p
                className={`text-xs truncate ${
                  isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {profile.category}
              </p>
            </div>
          </div>

          <div
            className={`flex items-center gap-2.5 shrink-0 text-xs ${
              isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {isPreview && (
              <span
                className={`font-medium whitespace-nowrap ${
                  isDarkTemplate ? 'text-amber-400' : 'text-amber-700'
                }`}
              >
                Preview
              </span>
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

        {step === 'feedback' && renderFeedbackFormBody()}

        {step === 'draft' && (
          <div className="space-y-5">
            {/* Top context bar */}
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h1
                  className={`text-xl sm:text-2xl font-display font-bold ${
                    isDarkTemplate ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {draftDeleted ? 'Review Draft Deleted' : 'Your Review Draft'}
                </h1>
                <p
                  className={`text-xs sm:text-sm mt-0.5 ${
                    isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {draftDeleted
                    ? 'Your feedback answers are saved for regenerating within your refresh window.'
                    : 'Review, edit, or switch language before copying.'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-xs font-medium tabular-nums whitespace-nowrap block ${
                    isDarkTemplate ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {generationCount} / {MAX_USER_REVIEW_GENERATIONS} used
                </span>
                {quotaResetAt > nowMs && (
                  <span
                    className={`text-[11px] tabular-nums whitespace-nowrap inline-flex items-center gap-1 mt-0.5 ${
                      isDarkTemplate ? 'text-blue-400' : 'text-slate-500'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    Resets in {countdownText}
                  </span>
                )}
              </div>
            </div>

            {draftDeleted ? (
              <div
                className={`rounded-2xl shadow-sm p-6 sm:p-8 space-y-6 ${
                  isDarkTemplate
                    ? 'bg-[#131C31] border border-slate-800'
                    : 'bg-white border border-slate-200'
                }`}
              >
                <div className="space-y-1.5">
                  <p
                    className={`text-sm leading-relaxed ${
                      isDarkTemplate ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    {hasReachedGenerationLimit && quotaResetAt > nowMs
                      ? `You have reached ${MAX_USER_REVIEW_GENERATIONS} generations. Your limit will automatically refresh in ${countdownText}.`
                      : 'You deleted that draft. Pick a language below to generate a fresh review using your submitted feedback.'}
                  </p>
                </div>

                <div>
                  <p
                    className={`text-xs font-medium mb-2.5 ${
                      isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Select Language
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const active = selectedLanguage === lang.id;
                      return (
                        <button
                          key={lang.id}
                          type="button"
                          disabled={isGenerating || hasReachedGenerationLimit}
                          onClick={() => setSelectedLanguage(lang.id)}
                          style={
                            active
                              ? {
                                  borderColor: templateAccentColor,
                                  backgroundColor: isDarkTemplate
                                    ? `${templateAccentColor}26`
                                    : `${templateAccentColor}12`,
                                  color: isDarkTemplate ? '#FFFFFF' : secondaryColor,
                                }
                              : undefined
                          }
                          className={`min-h-[46px] px-3 py-2 rounded-xl border text-center transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                            active
                              ? 'font-semibold'
                              : isDarkTemplate
                                ? 'bg-[#0F172A] border-slate-700 text-slate-300 hover:border-slate-500'
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
                    disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
                    onClick={handleGenerateAfterDelete}
                    style={{ backgroundColor: templateAccentColor }}
                    className="flex-1 min-h-[48px] px-5 py-3 rounded-xl text-white font-semibold text-sm sm:text-base hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating new review...</span>
                      </>
                    ) : hasReachedGenerationLimit && quotaResetAt > nowMs ? (
                      <span>Limit Reached · Refreshes in {countdownText}</span>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Generate New Review ({remainingGenerations} left)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={`rounded-2xl shadow-sm p-5 sm:p-7 space-y-5 ${
                  isDarkTemplate
                    ? 'bg-[#131C31] border border-slate-800'
                    : 'bg-white border border-slate-200'
                }`}
              >
                {/* Language Switcher */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-medium ${
                        isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Change Language
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        isDarkTemplate ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      Selected:{' '}
                      <span
                        lang={selectedLanguage}
                        className={`font-semibold ${isDarkTemplate ? 'text-white' : 'text-slate-900'}`}
                      >
                        {getLanguageDisplayName(selectedLanguage)}
                      </span>
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Change Review Language"
                    className={`grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 rounded-xl ${
                      isDarkTemplate ? 'bg-[#0F172A]' : 'bg-slate-100/80'
                    }`}
                  >
                    {LANGUAGE_OPTIONS.map((lang) => {
                      const active = selectedLanguage === lang.id;
                      const disabledBtn =
                        isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs && !active);
                      return (
                        <button
                          key={lang.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={disabledBtn}
                          onClick={() => handleLanguageChangeOnPreview(lang.id)}
                          className={`min-h-[40px] px-3 py-2 rounded-lg text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            active
                              ? isDarkTemplate
                                ? 'bg-[#1E293B] text-white font-semibold shadow-xs'
                                : 'bg-white text-slate-900 font-semibold shadow-xs'
                              : isDarkTemplate
                                ? 'text-slate-400 hover:text-white'
                                : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span lang={lang.id}>{lang.nativeLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Review Textarea */}
                <div className="relative">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label
                      htmlFor="review-draft-textarea"
                      className={`text-xs font-medium ${
                        isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      {isEditing ? 'Editing Review' : 'Review Preview'}
                    </label>
                    <div
                      className={`flex items-center gap-3 text-xs tabular-nums ${
                        isDarkTemplate ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
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
                      className={`w-full rounded-xl p-4 sm:p-5 text-base sm:text-[17px] review-text-multilingual transition-all resize-y min-h-[152px] ${
                        isDarkTemplate
                          ? isEditing
                            ? 'bg-[#0F172A] text-white border-2 border-blue-400 focus:outline-none'
                            : 'bg-[#0F172A]/80 text-slate-100 border border-slate-700/80 focus:outline-none'
                          : isEditing
                            ? 'bg-white text-slate-900 border-2 border-slate-900 focus:outline-none shadow-xs'
                            : 'bg-slate-50/70 text-slate-900 border border-slate-200 focus:outline-none'
                      }`}
                    />
                    {isGenerating && (
                      <div
                        className={`absolute inset-0 rounded-xl backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-sm ${
                          isDarkTemplate
                            ? 'bg-[#0B1221]/85 text-slate-200'
                            : 'bg-white/85 text-slate-700'
                        }`}
                      >
                        <Loader2 className="w-5 h-5 animate-spin" />
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

                {copied && (
                  <div
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50/95 p-4 space-y-3"
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

                <button
                  type="button"
                  disabled={isGenerating || !draftText.trim()}
                  onClick={handleCopyReview}
                  style={{ backgroundColor: copied ? '#0F172A' : templateAccentColor }}
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

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={handleToggleEdit}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      isEditing
                        ? isDarkTemplate
                          ? 'border-blue-400 bg-blue-600 text-white'
                          : 'border-slate-900 bg-slate-900 text-white'
                        : isDarkTemplate
                          ? 'border-slate-700 bg-[#0F172A] text-slate-200 hover:bg-slate-800'
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
                    disabled={isGenerating || (hasReachedGenerationLimit && quotaResetAt > nowMs)}
                    onClick={handleRegenerate}
                    title={
                      hasReachedGenerationLimit && quotaResetAt > nowMs
                        ? `Refreshes in ${countdownText}`
                        : `${remainingGenerations} generation(s) remaining`
                    }
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      isDarkTemplate
                        ? 'border-slate-700 bg-[#0F172A] text-slate-200 hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span className="tabular-nums">
                      {hasReachedGenerationLimit && quotaResetAt > nowMs
                        ? countdownText
                        : 'Regenerate'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setShowDeleteModal(true)}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      isDarkTemplate
                        ? 'border-slate-700 bg-[#0F172A] text-red-400 hover:bg-red-950/40'
                        : 'border-slate-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-200'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Delete</span>
                  </button>
                </div>

                {hasReachedGenerationLimit && quotaResetAt > nowMs && (
                  <div
                    className={`rounded-xl px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
                      isDarkTemplate
                        ? 'border border-amber-500/30 bg-amber-950/40 text-amber-200'
                        : 'border border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span>
                      5/5 review drafts reached. You can still edit, copy, and post on Google.
                    </span>
                    <span className="font-semibold tabular-nums whitespace-nowrap">
                      Refreshes in {countdownText}
                    </span>
                  </div>
                )}

                <label
                  className={`pt-2 border-t flex items-start gap-2.5 text-xs cursor-pointer select-none ${
                    isDarkTemplate ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={consentOptIn}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setConsentOptIn(next);
                      if (next && copied && draftText.trim()) {
                        await persistConsentedExampleIfOptedIn(draftText);
                      }
                    }}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-700 shrink-0"
                  />
                  <span>
                    Allow anonymized feedback &amp; this final phrasing to help improve review quality
                    {consentSaved ? ' — Saved, thank you!' : ' (optional, no personal info stored).'}
                  </span>
                </label>
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
                {hasReachedGenerationLimit && quotaResetAt > nowMs
                  ? `You have used all ${MAX_USER_REVIEW_GENERATIONS} review generations. Your limit refreshes automatically in ${countdownText}.`
                  : 'This only removes the draft. Your feedback answers remain saved so you can regenerate within your visit limit.'}
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

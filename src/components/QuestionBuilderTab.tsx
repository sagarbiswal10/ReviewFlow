import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Languages,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Business, FeedbackQuestion, QuestionType, ReviewLanguage } from '../types';
import { createCategoryQuestions } from '../data/categoryPresets';
import {
  PHONETIC_HINDI_VOCAB_CHIPS,
  PHONETIC_MARATHI_VOCAB_CHIPS,
  buildAutoTranslatedQuestionContent,
  transliterateRomanToDevanagari,
} from '../data/localizedQuestions';
import { updateBusiness } from '../services/businessService';

interface QuestionBuilderTabProps {
  business: Business;
  isAdmin?: boolean;
  canEdit?: boolean;
  onOpenPreview: () => void;
}

const QUESTION_LANGUAGE_TABS: Array<{ id: ReviewLanguage; label: string; shortLabel: string }> = [
  { id: 'en', label: 'English (Base)', shortLabel: 'English' },
  { id: 'mr', label: 'मराठी (Marathi)', shortLabel: 'मराठी' },
  { id: 'hi', label: 'हिंदी (Hindi)', shortLabel: 'हिंदी' },
  { id: 'hinglish', label: 'Hinglish', shortLabel: 'Hinglish' },
];

export function QuestionBuilderTab({
  business,
  isAdmin = false,
  canEdit = true,
  onOpenPreview,
}: QuestionBuilderTabProps) {
  const [questions, setQuestions] = useState<FeedbackQuestion[]>(business.questions);
  const [newOptionDrafts, setNewOptionDrafts] = useState<Record<string, string>>({});
  const [editingLanguage, setEditingLanguage] = useState<ReviewLanguage>('en');
  const [phoneticInput, setPhoneticInput] = useState('');
  const [copiedPhonetic, setCopiedPhonetic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDirtyRef = useRef(false);
  const lastSyncedRef = useRef<{ id: string; sig: string }>({
    id: business.id,
    sig: JSON.stringify(business.questions),
  });
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phoneticDevanagariPreview = useMemo(
    () => transliterateRomanToDevanagari(phoneticInput),
    [phoneticInput],
  );

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const incomingSig = JSON.stringify(business.questions);
    if (lastSyncedRef.current.id !== business.id) {
      isDirtyRef.current = false;
      lastSyncedRef.current = { id: business.id, sig: incomingSig };
      setQuestions(business.questions);
      setNewOptionDrafts({});
      setError(null);
      setSavedNotice(null);
      return;
    }
    if (!isDirtyRef.current && incomingSig !== lastSyncedRef.current.sig) {
      lastSyncedRef.current = { id: business.id, sig: incomingSig };
      setQuestions(business.questions);
    }
  }, [business.id, business.questions]);

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    isDirtyRef.current = true;
    const copy = [...questions];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    setQuestions(copy);
  };

  const updateQuestionField = <K extends keyof FeedbackQuestion>(
    id: string,
    field: K,
    value: FeedbackQuestion[K],
  ) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    );
  };

  const updateTranslatedPrompt = (id: string, lang: Exclude<ReviewLanguage, 'en'>, nextPrompt: string) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const currentLang = q.translations?.[lang] ?? {
          prompt: '',
          options: q.options.map(() => ''),
        };
        return {
          ...q,
          translations: {
            ...(q.translations ?? {}),
            [lang]: {
              ...currentLang,
              prompt: nextPrompt,
            },
          },
        };
      }),
    );
  };

  const updateTranslatedPlaceholder = (
    id: string,
    lang: Exclude<ReviewLanguage, 'en'>,
    nextPlaceholder: string,
  ) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const currentLang = q.translations?.[lang] ?? {
          prompt: '',
          options: [],
        };
        return {
          ...q,
          translations: {
            ...(q.translations ?? {}),
            [lang]: {
              ...currentLang,
              placeholder: nextPlaceholder,
            },
          },
        };
      }),
    );
  };

  const updateTranslatedOption = (
    id: string,
    lang: Exclude<ReviewLanguage, 'en'>,
    optIdx: number,
    nextVal: string,
  ) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const currentLang = q.translations?.[lang] ?? {
          prompt: '',
          options: q.options.map(() => ''),
        };
        const nextOpts = q.options.map((_, idx) =>
          idx === optIdx ? nextVal : currentLang.options?.[idx] ?? '',
        );
        return {
          ...q,
          translations: {
            ...(q.translations ?? {}),
            [lang]: {
              ...currentLang,
              options: nextOpts,
            },
          },
        };
      }),
    );
  };

  const autoTranslateAllQuestions = (lang: Exclude<ReviewLanguage, 'en'>) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        translations: {
          ...(q.translations ?? {}),
          [lang]: buildAutoTranslatedQuestionContent(q, lang),
        },
      })),
    );
    const label = QUESTION_LANGUAGE_TABS.find((t) => t.id === lang)?.label ?? lang;
    setSavedNotice(`Auto-filled ${label} questions & options. Click Save Form to publish.`);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 3500);
  };

  const handleTypeChange = (id: string, nextType: QuestionType) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        return {
          ...q,
          type: nextType,
          options:
            nextType === 'text'
              ? []
              : q.options.length > 0
                ? q.options
                : ['Option 1', 'Option 2'],
        };
      }),
    );
  };

  const addOption = (questionId: string) => {
    const text = (newOptionDrafts[questionId] ?? '').trim();
    if (!text) return;
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId && !q.options.includes(text)
          ? { ...q, options: [...q.options, text] }
          : q,
      ),
    );
    setNewOptionDrafts((prev) => ({ ...prev, [questionId]: '' }));
  };

  const updateOptionText = (questionId: string, optIdx: number, nextValue: string) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const copy = [...q.options];
        copy[optIdx] = nextValue;
        return { ...q, options: copy };
      }),
    );
  };

  const removeOption = (questionId: string, optIdx: number) => {
    isDirtyRef.current = true;
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) return q;
        const nextTranslations = q.translations
          ? Object.fromEntries(
              Object.entries(q.translations).map(([langKey, val]) => [
                langKey,
                val
                  ? {
                      ...val,
                      options: (val.options ?? []).filter((_, idx) => idx !== optIdx),
                    }
                  : val,
              ]),
            )
          : undefined;
        return {
          ...q,
          options: q.options.filter((_, idx) => idx !== optIdx),
          ...(nextTranslations ? { translations: nextTranslations } : {}),
        };
      }),
    );
  };

  const addQuestion = () => {
    if (questions.length >= 25) {
      setError('Maximum of 25 questions reached.');
      return;
    }
    isDirtyRef.current = true;
    const id = `q-${Date.now().toString(36)}`;
    setQuestions((prev) => [
      ...prev,
      {
        id,
        prompt: 'New Question',
        type: 'multiple',
        options: ['Great Quality', 'Friendly Service'],
        required: false,
      },
    ]);
  };

  const deleteQuestion = (id: string) => {
    isDirtyRef.current = true;
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const resetToCategoryDefaults = () => {
    isDirtyRef.current = true;
    setQuestions(createCategoryQuestions(business.category));
    setError(null);
    setSavedNotice('Loaded category defaults. Click Save Form to publish.');
  };

  const handleSave = async () => {
    if (!canEdit) {
      setError('Editing custom questions is disabled for this workspace.');
      return;
    }
    setError(null);
    setSavedNotice(null);

    const sanitized = questions.map((q) => {
      const pendingOpt = (newOptionDrafts[q.id] ?? '').trim();
      const baseOpts = q.type === 'text' ? [] : q.options.map((o) => o.trim()).filter(Boolean);
      const mergedOpts =
        q.type !== 'text' && pendingOpt && !baseOpts.includes(pendingOpt)
          ? [...baseOpts, pendingOpt]
          : baseOpts;
      return {
        ...q,
        prompt: q.prompt.trim() || 'Untitled Question',
        options: mergedOpts,
      };
    });

    for (const q of sanitized) {
      if (q.type !== 'text' && q.options.length === 0) {
        setError(`Question "${q.prompt}" needs at least one choice option.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      await updateBusiness(business, { questions: sanitized }, { isAdmin });
      isDirtyRef.current = false;
      lastSyncedRef.current = {
        id: business.id,
        sig: JSON.stringify(sanitized),
      };
      setQuestions(sanitized);
      setNewOptionDrafts({});
      setSavedNotice('Customer feedback form & translations saved.');
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save questions.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyPhoneticText = async () => {
    if (!phoneticDevanagariPreview) return;
    try {
      await navigator.clipboard.writeText(phoneticDevanagariPreview);
      setCopiedPhonetic(true);
      setTimeout(() => setCopiedPhonetic(false), 1800);
    } catch {
      setCopiedPhonetic(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="liquid-glass spatial-card-3d rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Custom Question Builder
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Tailor prompts, options, and Marathi / Hindi / Hinglish translations customers see after scanning.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={resetToCategoryDefaults}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to {business.category} Defaults</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenPreview}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer whitespace-nowrap"
            >
              Preview Customer Form
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Form</span>
              </button>
            )}
          </div>
        </div>

        {/* Language Editing Tabs */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 mr-1">
              <Languages className="w-4 h-4 text-teal-700" />
              Editing Language:
            </span>
            {QUESTION_LANGUAGE_TABS.map((tab) => {
              const active = editingLanguage === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEditingLanguage(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {editingLanguage !== 'en' && canEdit && (
            <button
              type="button"
              onClick={() => autoTranslateAllQuestions(editingLanguage)}
              className="px-3.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start lg:self-auto"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Auto-Translate All to{' '}
                {QUESTION_LANGUAGE_TABS.find((t) => t.id === editingLanguage)?.shortLabel}
              </span>
            </button>
          )}
        </div>

        {/* Phonetic Roman -> Marathi/Hindi Keyboard Helper */}
        {(editingLanguage === 'mr' || editingLanguage === 'hi') && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  No {editingLanguage === 'mr' ? 'Marathi' : 'Hindi'} Keyboard? Type in English Letters → Instant{' '}
                  {editingLanguage === 'mr' ? 'मराठी' : 'हिंदी'}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Example: type &ldquo;tumhala seva kashi vatli?&rdquo; → &ldquo;तुम्हाला सेवा कशी वाटली?&rdquo;, or click Convert inside any question below.
                </p>
              </div>
              {phoneticDevanagariPreview && (
                <button
                  type="button"
                  onClick={handleCopyPhoneticText}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/60 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedPhonetic ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedPhonetic ? 'Copied!' : 'Copy Devanagari'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={phoneticInput}
                onChange={(e) => setPhoneticInput(e.target.value)}
                placeholder={
                  editingLanguage === 'mr'
                    ? 'Type in English (e.g. tumhala aajchi seva kashi vatli?)'
                    : 'Type in English (e.g. aapko humari seva kaisi lagi?)'
                }
                className="h-9 px-3 rounded-lg border border-amber-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <div className="min-h-9 px-3 py-1.5 rounded-lg border border-amber-200/80 bg-white/90 text-xs font-semibold text-slate-900 flex items-center review-text-multilingual">
                {phoneticDevanagariPreview || (
                  <span className="text-slate-400 font-normal">
                    Devanagari output appears here live...
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-600 mr-1">Quick phrases:</span>
              {(editingLanguage === 'mr' ? PHONETIC_MARATHI_VOCAB_CHIPS : PHONETIC_HINDI_VOCAB_CHIPS).map(
                (chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setPhoneticInput(chip.roman)}
                    className="px-2.5 py-1 rounded-md border border-amber-200 bg-white hover:bg-amber-100 text-[11px] font-medium text-slate-800 cursor-pointer review-text-multilingual"
                  >
                    {chip.label}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {savedNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {savedNotice}
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, index) => {
          const isLocalizedMode = editingLanguage !== 'en';
          const autoSuggestion =
            isLocalizedMode ? buildAutoTranslatedQuestionContent(q, editingLanguage) : null;
          const currentTranslatedPrompt = isLocalizedMode
            ? q.translations?.[editingLanguage]?.prompt ?? ''
            : '';
          const currentTranslatedPlaceholder = isLocalizedMode
            ? q.translations?.[editingLanguage]?.placeholder ?? ''
            : '';

          return (
            <div
              key={q.id}
              className="liquid-glass spatial-card-3d rounded-2xl p-5 sm:p-6 space-y-4"
            >
              {isLocalizedMode ? (
                <div className="space-y-4">
                  <div className="pb-3 border-b border-slate-100 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                          Q{index + 1}
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          English: <strong className="text-slate-700 font-medium">{q.prompt}</strong>
                        </span>
                      </div>
                      {autoSuggestion &&
                        !currentTranslatedPrompt.trim() &&
                        autoSuggestion.prompt !== q.prompt &&
                        canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              updateTranslatedPrompt(q.id, editingLanguage, autoSuggestion.prompt)
                            }
                            className="px-2.5 py-1 rounded-md border border-teal-200 bg-teal-50 hover:bg-teal-100 text-[11px] font-semibold text-teal-800 cursor-pointer review-text-multilingual"
                          >
                            Use Suggested
                          </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={currentTranslatedPrompt}
                        onChange={(e) =>
                          updateTranslatedPrompt(q.id, editingLanguage, e.target.value)
                        }
                        placeholder={
                          autoSuggestion?.prompt ||
                          (editingLanguage === 'mr'
                            ? 'येथे मराठीत प्रश्न लिहा (किंवा इंग्रजीत टाईप करून Aa → अ दाबा)'
                            : editingLanguage === 'hi'
                              ? 'यहाँ हिंदी में प्रश्न लिखें (या अंग्रेज़ी में टाइप कर Aa → अ दबाएं)'
                              : 'Hinglish mein question likhein...')
                        }
                        className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 review-text-multilingual disabled:bg-slate-50"
                      />
                      {(editingLanguage === 'mr' || editingLanguage === 'hi') && canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            updateTranslatedPrompt(
                              q.id,
                              editingLanguage,
                              transliterateRomanToDevanagari(currentTranslatedPrompt),
                            )
                          }
                          disabled={!currentTranslatedPrompt.trim()}
                          title="Convert English letters in this box to Devanagari"
                          className="h-10 px-3 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-900 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                        >
                          Aa → अ
                        </button>
                      )}
                    </div>
                  </div>

                  {q.type === 'text' ? (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-500">
                        Placeholder Translation ({QUESTION_LANGUAGE_TABS.find((t) => t.id === editingLanguage)?.shortLabel})
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={currentTranslatedPlaceholder}
                          onChange={(e) =>
                            updateTranslatedPlaceholder(q.id, editingLanguage, e.target.value)
                          }
                          placeholder={autoSuggestion?.placeholder || 'Optional translated placeholder...'}
                          className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 review-text-multilingual disabled:bg-slate-50"
                        />
                        {(editingLanguage === 'mr' || editingLanguage === 'hi') && canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              updateTranslatedPlaceholder(
                                q.id,
                                editingLanguage,
                                transliterateRomanToDevanagari(currentTranslatedPlaceholder),
                              )
                            }
                            disabled={!currentTranslatedPlaceholder.trim()}
                            title="Convert English letters in this box to Devanagari"
                            className="h-9 px-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[11px] font-bold text-amber-900 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                          >
                            Aa → अ
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-slate-500">
                        Translated Options ({QUESTION_LANGUAGE_TABS.find((t) => t.id === editingLanguage)?.shortLabel})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt, optIdx) => {
                          const optVal = q.translations?.[editingLanguage]?.options?.[optIdx] ?? '';
                          const suggestedOpt = autoSuggestion?.options?.[optIdx] ?? opt;
                          return (
                            <div
                              key={`${q.id}-${editingLanguage}-opt-${optIdx}`}
                              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 space-y-1.5"
                            >
                              <p className="text-[11px] font-medium text-slate-500 truncate">
                                English: <span className="text-slate-700">{opt}</span>
                              </p>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  disabled={!canEdit}
                                  value={optVal}
                                  onChange={(e) =>
                                    updateTranslatedOption(
                                      q.id,
                                      editingLanguage,
                                      optIdx,
                                      e.target.value,
                                    )
                                  }
                                  placeholder={suggestedOpt}
                                  className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 review-text-multilingual disabled:bg-slate-100"
                                />
                                {(editingLanguage === 'mr' || editingLanguage === 'hi') && canEdit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateTranslatedOption(
                                        q.id,
                                        editingLanguage,
                                        optIdx,
                                        transliterateRomanToDevanagari(optVal),
                                      )
                                    }
                                    disabled={!optVal.trim()}
                                    title="Convert English letters to Devanagari"
                                    className="h-8 px-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[10px] font-bold text-amber-900 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                                  >
                                    Aa→अ
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                        Q{index + 1}
                      </span>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={q.prompt}
                        onChange={(e) => updateQuestionField(q.id, 'prompt', e.target.value)}
                        className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 disabled:bg-slate-50"
                      />
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, -1)}
                          disabled={index === 0}
                          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                          aria-label="Move question up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(index, 1)}
                          disabled={index === questions.length - 1}
                          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                          aria-label="Move question down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteQuestion(q.id)}
                          className="p-2 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 cursor-pointer"
                          aria-label="Delete question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-5">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate-500">Input Type</label>
                      <select
                        disabled={!canEdit}
                        value={q.type}
                        onChange={(e) => handleTypeChange(q.id, e.target.value as QuestionType)}
                        className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium bg-white disabled:bg-slate-50"
                      >
                        <option value="multiple">Multiple Choice (Multi-Select)</option>
                        <option value="single">Single Choice</option>
                        <option value="text">Optional Text Input</option>
                      </select>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={q.required}
                        onChange={(e) => updateQuestionField(q.id, 'required', e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-teal-700"
                      />
                      <span>Required question</span>
                    </label>
                  </div>

                  {q.type === 'text' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">
                        Placeholder Text
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={q.placeholder ?? ''}
                        onChange={(e) => updateQuestionField(q.id, 'placeholder', e.target.value)}
                        placeholder="Share any additional feedback..."
                        className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700 disabled:bg-slate-50"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-slate-500">Options</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, optIdx) => (
                          <div key={`${q.id}-opt-${optIdx}`} className="flex items-center gap-2">
                            <input
                              type="text"
                              disabled={!canEdit}
                              value={opt}
                              onChange={(e) => updateOptionText(q.id, optIdx, e.target.value)}
                              className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 disabled:bg-slate-50"
                            />
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removeOption(q.id, optIdx)}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                aria-label="Remove option"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {canEdit && (
                        <div className="flex items-center gap-2 pt-1 max-w-sm">
                          <input
                            type="text"
                            value={newOptionDrafts[q.id] ?? ''}
                            onChange={(e) =>
                              setNewOptionDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addOption(q.id);
                              }
                            }}
                            placeholder="Add new option..."
                            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => addOption(q.id)}
                            className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {editingLanguage === 'en' && canEdit && (
        <button
          type="button"
          onClick={addQuestion}
          className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Question</span>
        </button>
      )}
    </div>
  );
}

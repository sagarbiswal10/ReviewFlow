import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { Business, FeedbackQuestion, QuestionType } from '../types';
import { createCategoryQuestions } from '../data/categoryPresets';
import { updateBusiness } from '../services/businessService';

interface QuestionBuilderTabProps {
  business: Business;
  isAdmin?: boolean;
  canEdit?: boolean;
  onOpenPreview: () => void;
}

export function QuestionBuilderTab({
  business,
  isAdmin = false,
  canEdit = true,
  onOpenPreview,
}: QuestionBuilderTabProps) {
  const [questions, setQuestions] = useState<FeedbackQuestion[]>(business.questions);
  const [newOptionDrafts, setNewOptionDrafts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDirtyRef = useRef(false);
  const lastSyncedRef = useRef<{ id: string; sig: string }>({
    id: business.id,
    sig: JSON.stringify(business.questions),
  });
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.filter((_, idx) => idx !== optIdx) }
          : q,
      ),
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
      setSavedNotice('Customer feedback form saved.');
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save questions.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="liquid-glass spatial-card-3d rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Custom Question Builder
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Tailor the prompts, multiple-choice chips, and optional text inputs customers see after scanning.
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
        {questions.map((q, index) => (
          <div
            key={q.id}
            className="liquid-glass spatial-card-3d rounded-2xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="font-mono text-xs text-slate-400 tabular-nums shrink-0">
                  Q{index + 1}
                </span>
                <input
                  type="text"
                  value={q.prompt}
                  onChange={(e) => updateQuestionField(q.id, 'prompt', e.target.value)}
                  className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
              </div>

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
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-500">Input Type</label>
                <select
                  value={q.type}
                  onChange={(e) => handleTypeChange(q.id, e.target.value as QuestionType)}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                >
                  <option value="multiple">Multiple Choice (Multi-Select)</option>
                  <option value="single">Single Choice</option>
                  <option value="text">Optional Text Input</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
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
                  value={q.placeholder ?? ''}
                  onChange={(e) => updateQuestionField(q.id, 'placeholder', e.target.value)}
                  placeholder="Share any additional feedback..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-700"
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
                        value={opt}
                        onChange={(e) => updateOptionText(q.id, optIdx, e.target.value)}
                        className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(q.id, optIdx)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        aria-label="Remove option"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

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
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="w-full py-3.5 rounded-2xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 inline-flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        <span>Add Custom Question</span>
      </button>
    </div>
  );
}

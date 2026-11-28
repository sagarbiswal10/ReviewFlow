import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, Loader2, Lock } from 'lucide-react';
import type { Business, FormTemplateId } from '../types';
import { updateBusiness } from '../services/businessService';
import { sanitizeFormTemplate } from '../utils/domainHelpers';
import { useAutoDismiss } from '../hooks/useAutoDismiss';
import {
  classifyQuestionsForTemplate,
  FORM_TEMPLATES,
  mapOptionsToFiveFaces,
  type FormTemplateDefinition,
  type TemplateCategoryFilter,
} from '../data/formTemplates';

interface TemplatesTabProps {
  business: Business;
  isAdmin?: boolean;
  canEdit: boolean;
  onOpenPreview: () => void;
}

const FILTER_OPTIONS: { id: TemplateCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All Templates' },
  { id: '3d', label: '3D Spatial' },
  { id: 'new', label: 'New' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'compact', label: 'Compact & Editorial' },
];

export function TemplatesTab({
  business,
  isAdmin = false,
  canEdit,
  onOpenPreview,
}: TemplatesTabProps) {
  const persistedTemplate = sanitizeFormTemplate(business.formTemplate);
  const [optimisticTemplate, setOptimisticTemplate] = useState<FormTemplateId | null>(null);
  const activeTemplate = optimisticTemplate ?? persistedTemplate;
  const [filter, setFilter] = useState<TemplateCategoryFilter>('all');
  const [savingId, setSavingId] = useState<FormTemplateId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useAutoDismiss(notice, () => setNotice(null));
  useAutoDismiss(error, () => setError(null));

  useEffect(() => {
    setOptimisticTemplate(null);
    setError(null);
    setNotice(null);
  }, [business.id]);

  useEffect(() => {
    if (optimisticTemplate && persistedTemplate === optimisticTemplate) {
      setOptimisticTemplate(null);
    }
  }, [persistedTemplate, optimisticTemplate]);

  const classified = useMemo(
    () => classifyQuestionsForTemplate(business.questions),
    [business.questions],
  );

  const sampleRatingPrompt = classified.ratingQuestion?.prompt || 'Rate your experience';
  const sampleFaces = useMemo(
    () => mapOptionsToFiveFaces(classified.ratingQuestion?.options ?? []),
    [classified.ratingQuestion],
  );

  const sampleChecklistPrompt =
    classified.checklistQuestions[0]?.prompt || 'What did you like?';
  const sampleChecklistOptions = useMemo(() => {
    const raw = classified.checklistQuestions.flatMap((q) => q.options).filter(Boolean);
    if (raw.length > 0) return raw.slice(0, 4);
    return ['Quality', 'Staff Behaviour', 'Cleanliness', 'Overall Service'];
  }, [classified.checklistQuestions]);

  const sampleCommentLabel =
    classified.textQuestions[0]?.prompt || 'Your comment (optional)';

  const visibleTemplates = useMemo(() => {
    return FORM_TEMPLATES.filter((tpl) => {
      if (filter === 'all') return true;
      if (filter === '3d') return tpl.toneTag === '3D';
      if (filter === 'new') return tpl.isNew;
      if (filter === 'light') return tpl.toneTag === 'Light';
      if (filter === 'dark') return tpl.toneTag === 'Dark';
      return tpl.toneTag === 'Compact' || tpl.toneTag === 'Editorial';
    });
  }, [filter]);

  const handleApplyTemplate = async (template: FormTemplateDefinition) => {
    if (!canEdit || savingId) return;
    setSavingId(template.id);
    setError(null);
    setNotice(null);
    try {
      await updateBusiness(
        business,
        { formTemplate: template.id },
        { isAdmin },
      );
      setOptimisticTemplate(template.id);
      setNotice(`Applied "${template.name}" to ${business.name}. Your existing questions remain unchanged.`);
    } catch (err) {
      setOptimisticTemplate(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to apply template right now. Please try again.',
      );
    } finally {
      setSavingId(null);
    }
  };

  const renderLiveMiniMockup = (tpl: FormTemplateDefinition) => {
    const brandAccent = business.branding?.primaryColor || tpl.accentHex;
    const isEmoji =
      tpl.id === 'emoji_checklist_light' || tpl.id === 'emoji_checklist_dark';
    const isDark = tpl.id === 'emoji_checklist_dark';

    if (isEmoji) {
      return (
        <div
          className={`rounded-2xl p-3.5 border transition-colors ${
            isDark
              ? 'bg-[#0B1221] border-slate-800 text-slate-100'
              : 'bg-slate-50 border-slate-200/80 text-slate-900'
          }`}
        >
          <div
            className={`rounded-xl p-3.5 space-y-3 ${
              isDark
                ? 'bg-[#131C31] border border-slate-800/80'
                : 'bg-white border border-slate-200/70 shadow-xs'
            }`}
          >
            <div className="space-y-0.5">
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                &lt; Feedback · {business.name}
              </p>
              <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Share your feedback
              </p>
            </div>

            <div className="space-y-1.5">
              <p className={`text-[10px] font-medium truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {sampleRatingPrompt}
              </p>
              <div className="grid grid-cols-5 gap-1.5 items-center">
                {sampleFaces.map((face, idx) => {
                  const selected = idx === 4;
                  return (
                    <div key={face.sentimentRank} className="flex flex-col items-center gap-0.5">
                      <div
                        style={selected ? { backgroundColor: brandAccent } : undefined}
                        className={`relative w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                          selected
                            ? 'text-white'
                            : isDark
                              ? 'bg-[#1B2742]'
                              : 'bg-slate-100'
                        }`}
                      >
                        <span>{face.emoji}</span>
                        {selected && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-white text-blue-600 flex items-center justify-center">
                            <Check className="w-2 h-2 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span
                        className="text-[8px] font-semibold truncate max-w-full"
                        style={selected ? { color: isDark ? '#60A5FA' : brandAccent } : { opacity: 0 }}
                      >
                        {face.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <p className={`text-[10px] font-medium truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {sampleChecklistPrompt}
              </p>
              <div
                className={`divide-y ${
                  isDark ? 'divide-slate-800' : 'divide-slate-100'
                }`}
              >
                {sampleChecklistOptions.slice(0, 3).map((opt, idx) => {
                  const checked = idx < 2;
                  return (
                    <div key={opt} className="py-1 flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] truncate ${
                          isDark ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {opt}
                      </span>
                      <span
                        className={`w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center ${
                          checked
                            ? 'bg-[#22C55E] text-white'
                            : isDark
                              ? 'border border-slate-600'
                              : 'border border-slate-300'
                        }`}
                      >
                        {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <p className={`text-[9px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {sampleCommentLabel}
              </p>
              <div
                className={`h-7 rounded-lg px-2 flex items-center text-[9px] ${
                  isDark
                    ? 'bg-[#0F172A] border border-slate-700 text-slate-500'
                    : 'bg-white border border-slate-200 text-slate-400'
                }`}
              >
                Describe your experience here
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'warm_editorial') {
      return (
        <div className="rounded-2xl p-3.5 bg-[#FAF7F2] border border-stone-200 text-stone-900 space-y-2.5">
          <div className="bg-[#FFFDF9] rounded-xl border border-stone-200/80 p-3 text-center space-y-0.5">
            <p className="text-[9px] uppercase tracking-wider text-stone-500">
              {business.category}
            </p>
            <p className="text-xs font-bold text-stone-900 truncate">{business.name}</p>
          </div>
          <div className="bg-[#FFFDF9] rounded-xl border border-stone-200/80 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-stone-800 truncate">
              <span className="font-mono text-amber-700 mr-1.5">01</span>
              {sampleChecklistPrompt}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {sampleChecklistOptions.slice(0, 4).map((opt, idx) => (
                <div
                  key={opt}
                  style={idx === 0 ? { backgroundColor: brandAccent, borderColor: brandAccent } : undefined}
                  className={`px-2 py-1 rounded-lg text-[9px] truncate border ${
                    idx === 0
                      ? 'text-white font-medium'
                      : 'bg-white border-stone-200 text-stone-600'
                  }`}
                >
                  {opt}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'split_executive') {
      return (
        <div className="rounded-2xl p-3.5 bg-slate-100 border border-slate-200 space-y-2.5">
          <div className="rounded-xl bg-slate-900 text-white p-3">
            <p className="text-[8px] font-mono uppercase text-slate-400">
              {business.category}
            </p>
            <p className="text-xs font-bold truncate">{business.name}</p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1.5">
            <p className="text-[10px] font-bold text-slate-900 truncate">
              1. {sampleChecklistPrompt}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {sampleChecklistOptions.slice(0, 4).map((opt, idx) => (
                <div
                  key={opt}
                  className={`px-2 py-1 rounded text-[9px] truncate border flex items-center gap-1 ${
                    idx < 2
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="w-2 h-2 rounded-xs bg-teal-400 shrink-0" />
                  <span className="truncate">{opt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'quick_tap_express') {
      return (
        <div className="rounded-2xl p-3.5 bg-[#F0FDFA] border border-teal-100 space-y-2">
          <div className="rounded-xl bg-white border border-teal-100 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
              <p className="text-xs font-bold text-slate-900 truncate">{business.name}</p>
              <span className="text-[9px] text-teal-700 font-medium shrink-0">15-Sec Tap</span>
            </div>
            <p className="text-[10px] font-semibold text-slate-800 truncate">
              {sampleChecklistPrompt}
            </p>
            <div className="flex flex-wrap gap-1">
              {sampleChecklistOptions.slice(0, 3).map((opt, idx) => (
                <span
                  key={opt}
                  style={idx === 0 ? { backgroundColor: brandAccent, borderColor: brandAccent } : undefined}
                  className={`px-2 py-0.5 rounded-lg text-[9px] border truncate max-w-[110px] ${
                    idx === 0
                      ? 'text-white font-medium'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {opt}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'spatial_glass_3d') {
      return (
        <div
          className="rounded-2xl p-3.5 relative overflow-hidden border border-indigo-200/80 space-y-2"
          style={{
            background:
              'radial-gradient(circle at 18% 15%, rgba(99,102,241,0.22), transparent 55%), radial-gradient(circle at 85% 80%, rgba(56,189,248,0.24), transparent 55%), linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 100%)',
          }}
        >
          <div className="rounded-xl bg-white/80 backdrop-blur-md border border-white shadow-[0_12px_24px_-10px_rgba(79,70,229,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-900 truncate">{business.name}</p>
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-600/10 text-indigo-700 text-[8px] font-bold uppercase tracking-wider shrink-0">
                3D Prism
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-800 truncate">
              {sampleChecklistPrompt}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {sampleChecklistOptions.slice(0, 4).map((opt, idx) => (
                <div
                  key={opt}
                  style={
                    idx === 0
                      ? {
                          background: `linear-gradient(135deg, ${brandAccent}, #6366F1)`,
                          boxShadow: '0 6px 12px -4px rgba(79,70,229,0.4)',
                        }
                      : undefined
                  }
                  className={`px-2 py-1 rounded-lg text-[9px] truncate border ${
                    idx === 0
                      ? 'text-white font-semibold border-transparent'
                      : 'bg-white/90 border-indigo-100 text-slate-700 shadow-xs'
                  }`}
                >
                  {opt}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'neo_brutal_3d') {
      return (
        <div className="rounded-2xl p-3.5 bg-[#FFFBEB] border-2 border-slate-900 space-y-2">
          <div className="rounded-xl bg-white border-2 border-slate-900 shadow-[4px_4px_0px_#0F172A] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-slate-900 truncate uppercase tracking-tight">
                {business.name}
              </p>
              <span className="px-1.5 py-0.5 bg-[#FDE047] border border-slate-900 text-[8px] font-black text-slate-900 shrink-0 shadow-[2px_2px_0px_#0F172A]">
                3D BLOCK
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-800 truncate">
              {sampleChecklistPrompt}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sampleChecklistOptions.slice(0, 3).map((opt, idx) => (
                <span
                  key={opt}
                  className={`px-2 py-0.5 text-[9px] font-bold border-2 border-slate-900 truncate max-w-[115px] ${
                    idx === 0
                      ? 'bg-[#FB923C] text-slate-950 shadow-[2px_2px_0px_#0F172A]'
                      : 'bg-white text-slate-800 shadow-[2px_2px_0px_#0F172A]'
                  }`}
                >
                  {opt}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'obsidian_cyber_3d') {
      return (
        <div
          className="rounded-2xl p-3.5 bg-[#070913] border border-cyan-500/30 text-slate-100 space-y-2 relative overflow-hidden"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 15%, rgba(34,211,238,0.18), transparent 55%), radial-gradient(circle at 15% 85%, rgba(168,85,247,0.2), transparent 55%)',
          }}
        >
          <div className="rounded-xl bg-[#0F172A]/90 border border-cyan-400/30 shadow-[0_10px_25px_-8px_rgba(34,211,238,0.35)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-white truncate">{business.name}</p>
              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-[8px] font-bold shrink-0">
                CYBER 3D
              </span>
            </div>
            <p className="text-[10px] font-medium text-cyan-100/90 truncate">
              {sampleChecklistPrompt}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {sampleChecklistOptions.slice(0, 4).map((opt, idx) => (
                <div
                  key={opt}
                  className={`px-2 py-1 rounded-lg text-[9px] truncate border ${
                    idx === 0
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                      : 'bg-slate-900/90 border-slate-700/80 text-slate-300'
                  }`}
                >
                  {opt}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (tpl.id === 'clay_soft_3d') {
      return (
        <div className="rounded-2xl p-3.5 bg-[#FFF1EE] border border-rose-200/70 space-y-2">
          <div
            className="rounded-2xl bg-white p-3 space-y-2 border border-rose-100"
            style={{
              boxShadow:
                '10px 10px 20px rgba(244,63,94,0.12), -6px -6px 14px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(244,63,94,0.08)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-rose-950 truncate">{business.name}</p>
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[8px] font-bold shrink-0">
                3D Clay
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-700 truncate">
              {sampleChecklistPrompt}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sampleChecklistOptions.slice(0, 3).map((opt, idx) => (
                <span
                  key={opt}
                  style={
                    idx === 0
                      ? {
                          backgroundColor: '#F43F5E',
                          boxShadow:
                            '0 6px 12px -2px rgba(244,63,94,0.4), inset 0 -2px 4px rgba(0,0,0,0.15)',
                        }
                      : {
                          boxShadow:
                            '4px 4px 8px rgba(15,23,42,0.06), inset 0 -2px 4px rgba(15,23,42,0.04)',
                        }
                  }
                  className={`px-2.5 py-1 rounded-xl text-[9px] font-semibold truncate max-w-[110px] ${
                    idx === 0 ? 'text-white' : 'bg-[#FFF7F5] text-slate-700'
                  }`}
                >
                  {opt}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Classic Clean Cards
    return (
      <div className="rounded-2xl p-3.5 bg-slate-50 border border-slate-200 space-y-2">
        <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-0.5">
          <p className="text-xs font-bold text-slate-900 truncate">{business.name}</p>
          <p className="text-[9px] text-slate-500 truncate">
            {business.branding?.welcomeMessage || 'Share quick feedback below.'}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-900 truncate">
            1. {sampleChecklistPrompt}
          </p>
          <div className="flex flex-wrap gap-1">
            {sampleChecklistOptions.slice(0, 3).map((opt, idx) => (
              <span
                key={opt}
                style={idx === 0 ? { backgroundColor: brandAccent, borderColor: brandAccent } : undefined}
                className={`px-2 py-0.5 rounded-lg text-[9px] border truncate max-w-[110px] ${
                  idx === 0
                    ? 'text-white font-medium'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {opt}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="liquid-glass rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Customer Form Templates
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
            Pick any feedback UI layout for <span className="font-semibold text-slate-900">{business.name}</span>. Switching templates automatically maps your {business.questions.length} existing questions and brand colors with zero data loss.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenPreview}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800 inline-flex items-center gap-2 cursor-pointer"
          >
            <Eye className="w-4 h-4 text-[#005c55]" />
            <span>Preview Live Form</span>
          </button>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:text-sm text-slate-700 flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            You can browse new templates here. Ask your ReviewFlow account manager to activate a different template or upgrade your workspace tier.
          </span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between gap-3">
          <span>{notice}</span>
          <button
            type="button"
            onClick={onOpenPreview}
            className="text-xs font-semibold text-emerald-900 underline cursor-pointer shrink-0"
          >
            Preview Now
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl w-fit">
        {FILTER_OPTIONS.map((item) => {
          const isCurrentFilter = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isCurrentFilter
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Templates Gallery Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleTemplates.map((tpl) => {
          const isActive = activeTemplate === tpl.id;
          const isSavingThis = savingId === tpl.id;
          return (
            <article
              key={tpl.id}
              className={`liquid-glass rounded-2xl p-5 flex flex-col justify-between gap-4 border transition-all ${
                isActive
                  ? 'ring-2 ring-[#005c55] border-[#005c55]/40 shadow-md'
                  : 'border-slate-200/90 hover:border-slate-300'
              }`}
            >
              <div className="space-y-4">
                {renderLiveMiniMockup(tpl)}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-500">
                      {tpl.toneTag}
                      {tpl.isNew ? ' · New' : ''}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#005c55]">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        Active Template
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {tpl.name}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {tpl.description}
                  </p>
                  <p className="text-[11px] text-slate-500 pt-0.5">
                    Best for: {tpl.bestFor}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200/70 flex items-center gap-2">
                {isActive ? (
                  <button
                    type="button"
                    onClick={onOpenPreview}
                    className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Active Form</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canEdit || Boolean(savingId)}
                    onClick={() => handleApplyTemplate(tpl)}
                    className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-[#005c55] hover:bg-[#004843] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingThis ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying...</span>
                      </>
                    ) : (
                      <span>Use This Template</span>
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

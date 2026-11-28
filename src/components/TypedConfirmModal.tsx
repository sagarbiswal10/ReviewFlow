import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface TypedConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  requiredKeyword: string;
  confirmLabel: string;
  tone?: 'danger' | 'warning';
  isBusy?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function TypedConfirmModal({
  open,
  title,
  description,
  requiredKeyword,
  confirmLabel,
  tone = 'warning',
  isBusy = false,
  onConfirm,
  onCancel,
}: TypedConfirmModalProps) {
  const [typedValue, setTypedValue] = useState('');

  useEffect(() => {
    if (open) {
      setTypedValue('');
    }
  }, [open, requiredKeyword]);

  if (!open) return null;

  const isMatched = typedValue.trim().toUpperCase() === requiredKeyword.trim().toUpperCase();
  const isDanger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="typed-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </span>
            <h3 id="typed-confirm-title" className="font-display text-base font-bold text-slate-900">
              {title}
            </h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            aria-label="Close confirmation dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{description}</p>

        <div className="space-y-1.5">
          <label htmlFor="typed-confirm-input" className="block text-xs font-medium text-slate-700">
            Type <span className="font-mono font-bold text-slate-900">{requiredKeyword}</span> to
            confirm
          </label>
          <input
            id="typed-confirm-input"
            type="text"
            autoFocus
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={requiredKeyword}
            className="w-full h-10 px-3 rounded-xl border border-slate-300 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isMatched || isBusy}
            onClick={() => void onConfirm()}
            className={`px-4 py-2 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
              isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-700 hover:bg-amber-800'
            }`}
          >
            {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

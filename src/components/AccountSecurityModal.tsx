import { useState } from 'react';
import type { User } from 'firebase/auth';
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import { hasGoogleProvider, hasPasswordProvider } from '../utils/urlAndAuth';
import { useAutoDismiss } from '../hooks/useAutoDismiss';

interface AccountSecurityModalProps {
  user: User;
  onLinkEmailPassword: (password: string) => Promise<void>;
  onClose: () => void;
}

export function AccountSecurityModal({
  user,
  onLinkEmailPassword,
  onClose,
}: AccountSecurityModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  useAutoDismiss(error, () => setError(null));
  useAutoDismiss(successNotice, () => setSuccessNotice(null));

  const googleLinked = hasGoogleProvider(user.providerData);
  const passwordLinked = hasPasswordProvider(user.providerData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      await onLinkEmailPassword(password);
      setPassword('');
      setConfirmPassword('');
      setSuccessNotice(
        `Password added for ${user.email}. You can now sign in with either Google or Email & Password.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to link password.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl border border-white/80 w-full max-w-md p-6 sm:p-7 space-y-5 shadow-[0_28px_60px_-15px_rgba(15,23,42,0.3)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#f0fdfa] border border-[#0f766e]/20 text-[#005c55] flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Sign-In Methods
              </h2>
              <p className="text-xs text-slate-500 font-mono truncate max-w-[240px]">
                {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Close sign-in methods dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Google Sign-In</span>
            <span
              className={`px-2 py-0.5 rounded-md font-bold ${
                googleLinked
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-200/70 text-slate-600'
              }`}
            >
              {googleLinked ? 'Connected' : 'Not Connected'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">Email &amp; Password</span>
            <span
              className={`px-2 py-0.5 rounded-md font-bold ${
                passwordLinked
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-800'
              }`}
            >
              {passwordLinked ? 'Enabled' : 'Not Set Yet'}
            </span>
          </div>
        </div>

        {passwordLinked ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              Your account supports both Google Sign-In and Email &amp; Password login using{' '}
              <span className="font-mono font-semibold">{user.email}</span>.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              You signed in with Google. Set a password below so you can also sign in with your email and password without seeing duplicate-account errors.
            </p>

            <div>
              <label
                htmlFor="link-account-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                New Password
              </label>
              <input
                id="link-account-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20 focus:border-[#0f766e]"
              />
            </div>

            <div>
              <label
                htmlFor="link-account-password-confirm"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Confirm Password
              </label>
              <input
                id="link-account-password-confirm"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20 focus:border-[#0f766e]"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            {successNotice && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successNotice}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Enable Email &amp; Password Login</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

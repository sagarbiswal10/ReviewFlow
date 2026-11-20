import { useState } from 'react';
import {
  ArrowRight,
  Loader2,
  Mail,
  QrCode,
  SlidersHorizontal,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { BUSINESS_CATEGORIES } from '../types';
import { HERO_TABLETOP_IMAGE } from '../data/categoryPresets';

interface LandingPageProps {
  onGoogleSignIn: () => Promise<void> | void;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onTryDemo: () => void;
  isSigningIn: boolean;
  authError: string | null;
}

type AuthTab = 'signin' | 'signup' | 'reset';

export function LandingPage({
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onResetPassword,
  onTryDemo,
  isSigningIn,
  authError,
}: LandingPageProps) {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const openAuthModal = (initialTab: AuthTab = 'signin') => {
    setAuthTab(initialTab);
    setLocalError(null);
    setInfoMessage(null);
    setAuthModalOpen(true);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setInfoMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (authTab === 'reset') {
      try {
        await onResetPassword(cleanEmail);
        setInfoMessage('Password reset email sent. Check your inbox and spam folder.');
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Unable to send password reset email.');
      }
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    try {
      if (authTab === 'signup') {
        await onEmailSignUp(cleanEmail, password);
      } else {
        await onEmailSignIn(cleanEmail, password);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  const combinedError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Three-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ReviewFlow
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#how-it-works"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#capabilities"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#industries"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Industries
            </a>
            <button
              type="button"
              onClick={onTryDemo}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Live Demo
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => openAuthModal('signin')}
              disabled={isSigningIn}
              className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              Sign In
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split */}
        <section className="max-w-6xl mx-auto px-6 pt-12 pb-16 lg:pt-16 lg:pb-20">
          {authError && !authModalOpen && (
            <div
              role="alert"
              className="mb-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {authError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-medium text-teal-800 tracking-wide mb-4">
                Multi-Business Google Review Platform
              </p>
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.08] [text-wrap:balance]">
                Turn everyday customer visits into authentic Google reviews.
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Customers often skip leaving reviews because staring at a blank text box feels like work. With ReviewFlow, they scan your custom QR code, tap a few quick responses, and receive a personalized draft ready to edit and post on Google.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => openAuthModal('signup')}
                  disabled={isSigningIn}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold text-sm sm:text-base transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <span>Create Business Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onTryDemo}
                  className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm sm:text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Try Live Customer Form
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>10 industry question templates</span>
                <span aria-hidden="true">·</span>
                <span>Printable PDF &amp; PNG QR codes</span>
                <span aria-hidden="true">·</span>
                <span>Equal access for all feedback</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[320px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-200">
                <img
                  src={HERO_TABLETOP_IMAGE}
                  alt="Matte charcoal QR review standee on a hospitality reception counter"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-column Mechanism-to-Outcome Strip */}
          <div
            id="how-it-works"
            className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200"
          >
            <div className="bg-white p-6">
              <p className="font-mono text-xs text-slate-400 tabular-nums">01</p>
              <h2 className="mt-2 font-semibold text-slate-900">Connect Google Link</h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Register one or multiple locations, upload your logo, and link your Google Business Profile review URL.
              </p>
            </div>
            <div className="bg-white p-6">
              <p className="font-mono text-xs text-slate-400 tabular-nums">02</p>
              <h2 className="mt-2 font-semibold text-slate-900">Print Branded QR</h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Customize QR colors with your logo center mark, toggle active status anytime, and export PNG or printable A4 PDF.
              </p>
            </div>
            <div className="bg-white p-6">
              <p className="font-mono text-xs text-slate-400 tabular-nums">03</p>
              <h2 className="mt-2 font-semibold text-slate-900">Customer Taps &amp; Drafts</h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Guests answer tailored questions and generate Short, Detailed, or Professional drafts grounded in their answers.
              </p>
            </div>
            <div className="bg-white p-6">
              <p className="font-mono text-xs text-slate-400 tabular-nums">04</p>
              <h2 className="mt-2 font-semibold text-slate-900">Edit &amp; Post on Google</h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Every customer edits freely, copies in one tap, and opens your Google review page directly to publish manually.
              </p>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="border-t border-slate-200 bg-white py-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                Built for multi-location operators and independent studios.
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Manage every storefront from one account with per-location analytics, custom question builders, and brand controls.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-slate-200 p-6">
                <QrCode className="w-6 h-6 text-teal-700" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">QR Studio &amp; Token Control</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Track real-time QR scans, regenerate damaged codes with revision tokens, pause links instantly, and export print-ready tabletop PDF posters.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-6">
                <SlidersHorizontal className="w-6 h-6 text-teal-700" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">Dynamic Question Builder</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Start from industry defaults or build custom single-select, multi-select, and optional comment fields with full drag-free reordering.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-6">
                <Sparkles className="w-6 h-6 text-teal-700" />
                <h3 className="mt-4 text-lg font-semibold text-slate-900">Authentic AI Review Drafts</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Generates natural first-person drafts in 3 tones without inventing unexperienced details or filtering out critical feedback.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Industries */}
        <section id="industries" className="border-t border-slate-200 py-16">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Pre-configured forms across 10 service categories
                </h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600">
                  Each category loads tailored service options and staff questions automatically on onboarding.
                </p>
              </div>
              <button
                type="button"
                onClick={onTryDemo}
                className="text-sm font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span>Preview Hair Salon Demo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {BUSINESS_CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-center gap-2.5"
                >
                  <Store className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate">{category}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>ReviewFlow — Google Review Collection &amp; QR Feedback Platform</span>
          <span>Equal-access review drafts · Manual Google submission</span>
        </div>
      </footer>

      {/* Authentication Modal: Google Sign-In + Email/Password */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {authTab === 'signin'
                    ? 'Sign in to ReviewFlow'
                    : authTab === 'signup'
                    ? 'Create your workspace'
                    : 'Reset your password'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Access your business portal, QR codes, and review analytics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close sign in dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              disabled={isSigningIn}
              onClick={onGoogleSignIn}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {isSigningIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-3 text-xs text-slate-400">or use email</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signin');
                  setLocalError(null);
                  setInfoMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === 'signin'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Email Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signup');
                  setLocalError(null);
                  setInfoMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  authTab === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Work or Business Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@business.com"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
              </div>

              {authTab !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-password" className="text-xs font-medium text-slate-700">
                      Password
                    </label>
                    {authTab === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('reset');
                          setLocalError(null);
                          setInfoMessage(null);
                        }}
                        className="text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                  />
                </div>
              )}

              {combinedError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
                >
                  {combinedError}
                </div>
              )}

              {infoMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
                  {infoMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSigningIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                <span>
                  {authTab === 'signin'
                    ? 'Sign In with Email'
                    : authTab === 'signup'
                    ? 'Create Verified Account'
                    : 'Send Reset Link'}
                </span>
              </button>

              {authTab === 'reset' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setLocalError(null);
                  }}
                  className="w-full text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Back to sign in
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

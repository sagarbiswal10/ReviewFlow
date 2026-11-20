import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { AlertCircle, Loader2, MailCheck, PauseCircle, SearchX } from 'lucide-react';
import { auth, googleProvider } from './firebase';
import type { Business, BusinessStats, PublicProfile, ReviewEvent } from './types';
import { BUILTIN_DEMO_PROFILE } from './data/categoryPresets';
import {
  checkIsAdmin,
  getPublicProfileBySlug,
  subscribeToAllBusinesses,
  subscribeToAllBusinessStats,
  subscribeToAllEvents,
  subscribeToClientBusinesses,
} from './services/businessService';
import { LandingPage } from './components/LandingPage';
import { ManagementConsoleView } from './components/ManagementConsoleView';
import { ClientPortalView } from './components/ClientPortalView';
import { OnboardingModal } from './components/OnboardingModal';
import { CustomerReviewFlow } from './components/CustomerReviewFlow';

type AppRoute =
  | { kind: 'home' }
  | { kind: 'admin' }
  | { kind: 'portal' }
  | { kind: 'review'; slug: string; tokenParam: string | null };

function parseRoute(pathname: string, search: string): AppRoute {
  const reviewMatch = pathname.match(/^\/review\/([a-z0-9-]+)\/?$/i);
  const params = new URLSearchParams(search);
  if (reviewMatch) {
    return {
      kind: 'review',
      slug: reviewMatch[1].toLowerCase(),
      tokenParam: params.get('v'),
    };
  }
  const querySlug = params.get('review');
  if (querySlug) {
    return {
      kind: 'review',
      slug: querySlug.toLowerCase(),
      tokenParam: params.get('v'),
    };
  }
  if (/^\/admin\/?$/i.test(pathname)) {
    return { kind: 'admin' };
  }
  if (/^\/portal\/?$/i.test(pathname)) {
    return { kind: 'portal' };
  }
  return { kind: 'home' };
}

function routesEqual(a: AppRoute, b: AppRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'review' && b.kind === 'review') {
    return a.slug === b.slug && a.tokenParam === b.tokenParam;
  }
  return true;
}

function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not enabled in Firebase Authentication yet. Enable it under Authentication > Sign-in method in Firebase Console, or sign in with Google.';
  }
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account already exists for this email address. Please sign in instead.';
  }
  if (raw.includes('auth/weak-password')) {
    return 'Password should be at least 6 characters long.';
  }
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'Sign-in popup was closed before finishing.';
  }
  return raw;
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseRoute(window.location.pathname, window.location.search),
  );

  // Public customer route state
  const [publicState, setPublicState] = useState<{
    loading: boolean;
    status: 'found' | 'paused' | 'not_found';
    profile: PublicProfile | null;
    isBuiltinDemo: boolean;
  }>({
    loading: false,
    status: 'not_found',
    profile: null,
    isBuiltinDemo: false,
  });

  // Auth & Role state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [isRefreshingVerification, setIsRefreshingVerification] = useState(false);

  // Scoped Data State
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessesLoaded, setBusinessesLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [statsMap, setStatsMap] = useState<Record<string, BusinessStats>>({});
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('reviewflow_active_business_id');
    } catch {
      return null;
    }
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [navigatedInternally, setNavigatedInternally] = useState(false);
  const [redirectAfterLogin, setRedirectAfterLogin] = useState(false);

  const authIdentityRef = useRef<{ uid: string; emailVerified: boolean; email: string } | null>(null);
  const loadedUidRef = useRef<string | null>(null);

  const navigateTo = (path: string, replace = false) => {
    if (path.startsWith('/review/')) {
      setNavigatedInternally(true);
    }
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    const nextRoute = parseRoute(window.location.pathname, window.location.search);
    setRoute((prev) => (routesEqual(prev, nextRoute) ? prev : nextRoute));
  };

  useEffect(() => {
    const onPopState = () => {
      const state = window.history.state as { internalReviewNav?: boolean } | null;
      if (state?.internalReviewNav) {
        setNavigatedInternally(true);
      }
      const nextRoute = parseRoute(window.location.pathname, window.location.search);
      setRoute((prev) => (routesEqual(prev, nextRoute) ? prev : nextRoute));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Load public profile when on /review/:slug
  const reviewSlug = route.kind === 'review' ? route.slug : '';
  useEffect(() => {
    if (route.kind !== 'review' || !reviewSlug) return;
    let cancelled = false;

    const loadProfile = async () => {
      setPublicState({
        loading: true,
        status: 'not_found',
        profile: null,
        isBuiltinDemo: false,
      });

      const res = await getPublicProfileBySlug(reviewSlug);
      if (cancelled) return;

      if (res.status === 'found' && res.profile) {
        setPublicState({
          loading: false,
          status: 'found',
          profile: res.profile,
          isBuiltinDemo: false,
        });
        return;
      }

      if (res.status === 'paused') {
        setPublicState({
          loading: false,
          status: 'paused',
          profile: null,
          isBuiltinDemo: false,
        });
        return;
      }

      if (reviewSlug === BUILTIN_DEMO_PROFILE.slug) {
        setPublicState({
          loading: false,
          status: 'found',
          profile: BUILTIN_DEMO_PROFILE,
          isBuiltinDemo: true,
        });
        return;
      }

      setPublicState({
        loading: false,
        status: 'not_found',
        profile: null,
        isBuiltinDemo: false,
      });
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [route.kind, reviewSlug]);

  // Auth & Role Resolution
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;

      if (!nextUser || !nextUser.emailVerified) {
        authIdentityRef.current = nextUser
          ? { uid: nextUser.uid, emailVerified: false, email: nextUser.email || '' }
          : null;
        loadedUidRef.current = null;
        setUser(nextUser);
        setAuthReady(true);
        setIsAdmin(false);
        setRoleReady(true);
        setBusinesses([]);
        setStatsMap({});
        setEvents([]);
        setBusinessesLoaded(false);
        return;
      }

      const normalizedEmail = (nextUser.email || '').trim().toLowerCase();
      const prev = authIdentityRef.current;
      const sameVerifiedIdentity =
        Boolean(prev) &&
        prev?.uid === nextUser.uid &&
        prev?.emailVerified === true &&
        prev?.email === normalizedEmail;

      authIdentityRef.current = {
        uid: nextUser.uid,
        emailVerified: true,
        email: normalizedEmail,
      };
      setUser(nextUser);
      setAuthReady(true);

      if (sameVerifiedIdentity) {
        // Avoid blanking the UI or tearing down listeners when Firebase refreshes user metadata/tokens
        return;
      }

      setRoleReady(false);
      const adminStatus = await checkIsAdmin(nextUser);
      if (!active) return;
      setIsAdmin(adminStatus);
      setRoleReady(true);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const userUid = user?.uid ?? '';
  const userEmail = user?.email ?? '';
  const userEmailVerified = Boolean(user?.emailVerified);
  const streamScope: 'admin' | 'client' =
    isAdmin && (route.kind === 'admin' || route.kind === 'home') ? 'admin' : 'client';

  // Role-based routing:
  // - Business Management admins on '/' or after login -> '/admin'
  // - Non-admin on '/admin' -> '/portal' (if client access) or '/'
  // - Client Portal users on login from '/' -> '/portal', while still allowing '/' Landing Page
  useEffect(() => {
    if (!authReady || !roleReady || !userUid || !userEmailVerified) return;
    if (route.kind === 'review') return;

    if (isAdmin) {
      if (route.kind === 'home') {
        setRedirectAfterLogin(false);
        navigateTo('/admin', true);
      }
      return;
    }

    if (route.kind === 'admin') {
      if (!businessesLoaded) return;
      navigateTo(businesses.length > 0 ? '/portal' : '/', true);
      return;
    }

    if (redirectAfterLogin && businessesLoaded) {
      setRedirectAfterLogin(false);
      if (businesses.length > 0) {
        navigateTo('/portal', true);
      }
    }
  }, [authReady, roleReady, userUid, userEmailVerified, isAdmin, route.kind, businessesLoaded, businesses.length, redirectAfterLogin]);

  // Subscribe to role-appropriate Firestore streams without wiping loaded UI on route switches
  useEffect(() => {
    if (!authReady || !roleReady || !userUid || !userEmailVerified) return;

    let settled = false;
    const isInitialLoadForUser = loadedUidRef.current !== userUid || reloadSeq > 0;
    if (isInitialLoadForUser) {
      setBusinessesLoaded(false);
    }
    setLoadError(null);

    const handleStreamError = (err: Error) => {
      settled = true;
      const msg = err?.message || 'Unable to load workspace data from Firestore.';
      const lower = msg.toLowerCase();
      if (lower.includes('permission') || lower.includes('insufficient')) {
        setLoadError(
          'Firestore denied read access. Open Firebase Console → Firestore Database → Rules and publish your firestore.rules file.',
        );
      } else if (lower.includes('not-found') || lower.includes('database')) {
        setLoadError(
          'Firestore database was not found. Make sure you created the (default) Firestore database in Firebase Console and set VITE_FIREBASE_DATABASE_ID cleanly.',
        );
      } else {
        setLoadError(msg);
      }
      setBusinessesLoaded(true);
    };

    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        setLoadError(
          'Connecting to Firestore timed out. Check that your Firestore (default) database is created, firestore.rules are published, and browser privacy shields are not blocking firestore.googleapis.com.',
        );
        setBusinessesLoaded(true);
      }
    }, 12000);

    if (streamScope === 'admin') {
      const unsubBiz = subscribeToAllBusinesses(
        (items) => {
          settled = true;
          loadedUidRef.current = userUid;
          window.clearTimeout(timeoutId);
          setBusinesses(items);
          setLoadError(null);
          setBusinessesLoaded(true);
        },
        handleStreamError,
      );
      const unsubStats = subscribeToAllBusinessStats((map) => {
        setStatsMap(map);
      });
      const unsubEvents = subscribeToAllEvents((items) => {
        setEvents(items);
      });
      return () => {
        window.clearTimeout(timeoutId);
        unsubBiz();
        unsubStats();
        unsubEvents();
      };
    }

    const unsubClientBiz = subscribeToClientBusinesses(
      userUid,
      userEmail,
      (items) => {
        settled = true;
        loadedUidRef.current = userUid;
        window.clearTimeout(timeoutId);
        setBusinesses(items);
        setLoadError(null);
        setBusinessesLoaded(true);
      },
      handleStreamError,
    );

    return () => {
      window.clearTimeout(timeoutId);
      unsubClientBiz();
    };
  }, [authReady, roleReady, userUid, userEmail, userEmailVerified, streamScope, reloadSeq]);

  const activeBusiness = useMemo(() => {
    if (businesses.length === 0) return null;
    if (selectedBusinessId) {
      const match = businesses.find((b) => b.id === selectedBusinessId);
      if (match) return match;
    }
    return businesses[0];
  }, [businesses, selectedBusinessId]);

  const handleSelectBusiness = (businessId: string) => {
    setSelectedBusinessId(businessId);
    try {
      localStorage.setItem('reviewflow_active_business_id', businessId);
    } catch {
      // ignore
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    setRedirectAfterLogin(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setRedirectAfterLogin(false);
      setAuthError(formatAuthError(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailSignIn = async (email: string, password: string) => {
    setIsSigningIn(true);
    setAuthError(null);
    setRedirectAfterLogin(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setRedirectAfterLogin(false);
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailSignUp = async (email: string, password: string) => {
    setIsSigningIn(true);
    setAuthError(null);
    setRedirectAfterLogin(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      setVerificationNotice(`Verification email sent to ${email}.`);
    } catch (err) {
      setRedirectAfterLogin(false);
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const msg = formatAuthError(err);
      throw new Error(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setVerificationNotice(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationNotice(`Verification email resent to ${auth.currentUser.email}.`);
    } catch (err) {
      setVerificationNotice(formatAuthError(err));
    }
  };

  const handleRefreshVerification = async () => {
    if (!auth.currentUser) return;
    setIsRefreshingVerification(true);
    setVerificationNotice(null);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const refreshed = auth.currentUser;
      setUser(refreshed);
      if (refreshed.emailVerified) {
        const adminStatus = await checkIsAdmin(refreshed);
        setIsAdmin(adminStatus);
        setRoleReady(true);
      } else {
        setVerificationNotice('Email is still unverified. Click the link in your inbox, then refresh.');
      }
    } finally {
      setIsRefreshingVerification(false);
    }
  };

  const handleSignOut = async () => {
    setRedirectAfterLogin(false);
    await signOut(auth);
    setVerificationNotice(null);
    navigateTo('/', true);
  };

  // 1. Walk-in Guest Public Review Route (/review/:slug)
  if (route.kind === 'review') {
    if (publicState.loading) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-600 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
          <p className="text-sm font-medium">Loading feedback form...</p>
        </div>
      );
    }

    if (publicState.status === 'paused') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-8 text-center space-y-4">
            <PauseCircle className="w-10 h-10 text-amber-600 mx-auto" />
            <h1 className="font-display text-xl font-bold text-slate-900">
              QR Code Temporarily Paused
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              This business has temporarily paused feedback collection for this QR code. Please check with a staff member or try again later.
            </p>
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Return to ReviewFlow
            </button>
          </div>
        </div>
      );
    }

    if (publicState.status === 'not_found' || !publicState.profile) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-8 text-center space-y-4">
            <SearchX className="w-10 h-10 text-slate-400 mx-auto" />
            <h1 className="font-display text-xl font-bold text-slate-900">
              Review Page Not Found
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              We could not find an active business profile at{' '}
              <span className="font-mono">/review/{route.slug}</span>.
            </p>
            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 cursor-pointer"
            >
              Go to ReviewFlow Home
            </button>
          </div>
        </div>
      );
    }

    const tokenMismatch =
      Boolean(route.tokenParam) &&
      !publicState.isBuiltinDemo &&
      route.tokenParam !== publicState.profile.qrConfig.token;

    return (
      <CustomerReviewFlow
        profile={publicState.profile}
        isPreview={publicState.isBuiltinDemo}
        tokenMismatch={tokenMismatch}
        onExit={
          publicState.isBuiltinDemo || navigatedInternally
            ? () => {
                if (navigatedInternally && window.history.length > 1) {
                  window.history.back();
                } else {
                  navigateTo('/');
                }
              }
            : undefined
        }
      />
    );
  }

  // 2. Auth / Role Loading
  if (!authReady || !roleReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
      </div>
    );
  }

  // 3. Signed-out Landing Page (for /, /admin, /portal when unauthenticated)
  if (!user) {
    return (
      <LandingPage
        onGoogleSignIn={handleGoogleSignIn}
        onEmailSignIn={handleEmailSignIn}
        onEmailSignUp={handleEmailSignUp}
        onResetPassword={handleResetPassword}
        onTryDemo={() => navigateTo(`/review/${BUILTIN_DEMO_PROFILE.slug}`)}
        isSigningIn={isSigningIn}
        authError={authError}
      />
    );
  }

  // 3b. Email Verification Gate for Email/Password Signups
  if (!user.emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-8 text-center space-y-5">
          <MailCheck className="w-10 h-10 text-teal-700 mx-auto" />
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-slate-900">
              Verify Your Email Address
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              We sent a verification link to{' '}
              <span className="font-mono text-slate-900">{user.email}</span>. Open that link to verify your account, then refresh below to enter your portal.
            </p>
          </div>
          {verificationNotice && (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-2.5">
              {verificationNotice}
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={isRefreshingVerification}
              onClick={handleRefreshVerification}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isRefreshingVerification && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>I&apos;ve Verified — Continue</span>
            </button>
            <button
              type="button"
              onClick={handleResendVerification}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Waiting for role-scoped data load
  if (!businessesLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin text-teal-700" />
        <p className="text-sm font-medium">
          {isAdmin ? 'Loading management console...' : 'Loading your business portal...'}
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold text-slate-900">
            Unable to Connect to Database
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">{loadError}</p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setReloadSeq((n) => n + 1)}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold cursor-pointer"
            >
              Retry Connection
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Landing Page ('/' for signed-in Client Portal or unassigned accounts), Business Management (/admin), vs Client Portal (/portal)
  const hasClientAccess = businesses.length > 0;
  const showingAdminConsole = isAdmin && route.kind === 'admin';
  const showingLandingPage = !isAdmin && route.kind === 'home';

  return (
    <>
      {showingAdminConsole ? (
        <ManagementConsoleView
          user={user}
          businesses={businesses}
          statsMap={statsMap}
          events={events}
          onOpenNewBusiness={() => setShowOnboarding(true)}
          onSwitchToPortal={() => navigateTo('/portal')}
          onSignOut={handleSignOut}
        />
      ) : showingLandingPage ? (
        <LandingPage
          user={user}
          hasClientAccess={hasClientAccess}
          isAdmin={isAdmin}
          onGoogleSignIn={handleGoogleSignIn}
          onEmailSignIn={handleEmailSignIn}
          onEmailSignUp={handleEmailSignUp}
          onResetPassword={handleResetPassword}
          onTryDemo={() => navigateTo(`/review/${BUILTIN_DEMO_PROFILE.slug}`)}
          onOpenPortal={() => navigateTo('/portal')}
          onOpenAdmin={() => navigateTo('/admin')}
          onSignOut={handleSignOut}
          isSigningIn={isSigningIn}
          authError={authError}
        />
      ) : (
        <ClientPortalView
          user={user}
          isAdmin={isAdmin}
          businesses={businesses}
          activeBusiness={activeBusiness}
          onSelectBusiness={handleSelectBusiness}
          onOpenNewBusiness={() => setShowOnboarding(true)}
          onViewLanding={() => navigateTo('/')}
          onSwitchToAdmin={isAdmin ? () => navigateTo('/admin') : undefined}
          onSignOut={handleSignOut}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          ownerId={user.uid}
          userEmail={user.email || ''}
          isAdmin={showingAdminConsole}
          canClose
          onClose={() => setShowOnboarding(false)}
          onCreated={(newId) => {
            handleSelectBusiness(newId);
            setShowOnboarding(false);
          }}
        />
      )}
    </>
  );
}

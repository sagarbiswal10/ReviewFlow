export function sanitizeExternalUrl(
  raw?: string | null,
  fallback = 'https://www.google.com/maps',
): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return fallback;

  // Explicitly block dangerous or non-web schemes before normalization
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return fallback;
  }

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    // Allow bare domains like g.page/r/abc/review or example.com/review
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(candidate)) {
      candidate = `https://${candidate}`;
    } else {
      return fallback;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export function sanitizeLogoDataUrl(raw?: string | null): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return '';

  // Allow safe bundled static image assets (e.g. /src/assets/... or /assets/...)
  if (
    /^\/(?:src\/)?assets\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif)(?:\?[a-zA-Z0-9_=&.-]+)?$/i.test(
      trimmed,
    ) &&
    !trimmed.includes('..')
  ) {
    return trimmed;
  }

  // Allow strictly validated raster base64 image data URLs (blocks SVG/HTML payloads)
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed.slice(0, 350000);
  }

  // Otherwise only permit normalized https:// or http:// URLs
  return sanitizeExternalUrl(trimmed, '');
}

export interface ProviderSummary {
  providerId?: string | null;
}

export function hasPasswordProvider(providerData?: ReadonlyArray<ProviderSummary> | null): boolean {
  if (!Array.isArray(providerData)) return false;
  return providerData.some((p) => p?.providerId === 'password');
}

export function hasGoogleProvider(providerData?: ReadonlyArray<ProviderSummary> | null): boolean {
  if (!Array.isArray(providerData)) return false;
  return providerData.some((p) => p?.providerId === 'google.com');
}

export function getProviderSignature(providerData?: ReadonlyArray<ProviderSummary> | null): string {
  if (!Array.isArray(providerData)) return '';
  return providerData
    .map((p) => (p?.providerId || '').trim())
    .filter(Boolean)
    .sort()
    .join(',');
}

export type AuthErrorKind =
  | 'email_exists'
  | 'invalid_credential'
  | 'operation_not_allowed'
  | 'unauthorized_domain'
  | 'popup_blocked'
  | 'popup_closed'
  | 'weak_password'
  | 'requires_recent_login'
  | 'network'
  | 'generic';

export interface AuthActionableError {
  kind: AuthErrorKind;
  message: string;
  email?: string;
  suggestGoogleSignIn?: boolean;
  suggestPasswordReset?: boolean;
}

export function classifyAuthError(
  err: unknown,
  context: {
    mode?: 'signin' | 'signup' | 'reset' | 'link';
    email?: string;
    methods?: string[];
  } = {},
): AuthActionableError {
  const raw = err instanceof Error ? err.message : String(err);
  const cleanEmail = (context.email || '').trim().toLowerCase();
  const methods = Array.isArray(context.methods) ? context.methods : [];
  const hasGoogleOnlyHint = methods.includes('google.com') && !methods.includes('password');

  if (raw.includes('auth/operation-not-allowed')) {
    return {
      kind: 'operation_not_allowed',
      email: cleanEmail || undefined,
      message:
        'Email/Password sign-in is not enabled in Firebase Authentication yet. Enable it under Authentication -> Sign-in method in Firebase Console, or sign in with Google.',
      suggestGoogleSignIn: true,
    };
  }

  if (raw.includes('auth/unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return {
      kind: 'unauthorized_domain',
      email: cleanEmail || undefined,
      message: `This domain (${host}) is not listed in Firebase Authentication -> Settings -> Authorized domains. Add it in Firebase Console or sign in from an authorized domain.`,
    };
  }

  if (raw.includes('auth/popup-blocked')) {
    return {
      kind: 'popup_blocked',
      email: cleanEmail || undefined,
      message:
        'Google Sign-In popup was blocked by your browser. Allow popups for this site or sign in with Email & Password below.',
    };
  }

  if (raw.includes('auth/cancelled-popup-request') || raw.includes('auth/popup-closed-by-user')) {
    return {
      kind: 'popup_closed',
      email: cleanEmail || undefined,
      message: raw.includes('cancelled-popup-request')
        ? 'Previous sign-in popup was cancelled. Please try signing in again.'
        : 'Sign-in popup was closed before finishing.',
    };
  }

  if (raw.includes('auth/network-request-failed')) {
    return {
      kind: 'network',
      email: cleanEmail || undefined,
      message: 'Network error while contacting Google/Firebase sign-in. Check your connection and try again.',
    };
  }

  if (raw.includes('auth/email-already-in-use')) {
    return {
      kind: 'email_exists',
      email: cleanEmail || undefined,
      suggestGoogleSignIn: true,
      suggestPasswordReset: true,
      message: hasGoogleOnlyHint
        ? 'This email already uses Google Sign-In. Click "Continue with Google" below (you can also set an account password inside your portal), or send a Password Setup link to add email & password login.'
        : 'An account already exists for this email. If you previously signed in with Google, use "Continue with Google" below or click "Send Password Setup Link" to enable Email & Password login on the same account.',
    };
  }

  if (
    raw.includes('auth/invalid-credential') ||
    raw.includes('auth/wrong-password') ||
    raw.includes('auth/user-not-found')
  ) {
    return {
      kind: 'invalid_credential',
      email: cleanEmail || undefined,
      suggestGoogleSignIn: true,
      suggestPasswordReset: true,
      message: hasGoogleOnlyHint
        ? 'This email is linked to Google Sign-In and does not have a password yet. Click "Continue with Google" below, or click "Send Password Setup Link" to create a password.'
        : 'Incorrect email or password — or if you originally signed in with Google, your account may not have a password set yet. Try "Continue with Google" or "Send Password Setup Link" below.',
    };
  }

  if (raw.includes('auth/weak-password')) {
    return {
      kind: 'weak_password',
      email: cleanEmail || undefined,
      message: 'Password should be at least 6 characters long.',
    };
  }

  if (raw.includes('auth/requires-recent-login')) {
    return {
      kind: 'requires_recent_login',
      email: cleanEmail || undefined,
      message:
        'For security, please confirm your Google sign-in once more to finish linking your password.',
    };
  }

  if (raw.includes('auth/credential-already-in-use') || raw.includes('auth/provider-already-linked')) {
    return {
      kind: 'generic',
      email: cleanEmail || undefined,
      message: 'Email & password sign-in is already enabled on this account.',
    };
  }

  return {
    kind: 'generic',
    email: cleanEmail || undefined,
    message: raw,
  };
}

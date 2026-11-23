import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAuthError,
  getProviderSignature,
  hasGoogleProvider,
  hasPasswordProvider,
  sanitizeExternalUrl,
  sanitizeLogoDataUrl,
} from '../src/utils/urlAndAuth.ts';

test('TC-SEC-01: sanitizeExternalUrl blocks javascript:, data:, vbscript:, file:, and blob: URLs', () => {
  const fallback = 'https://www.google.com/maps';
  assert.equal(sanitizeExternalUrl('javascript:alert(1)', fallback), fallback);
  assert.equal(sanitizeExternalUrl('  JAVASCRIPT:void(0) ', fallback), fallback);
  assert.equal(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>', fallback), fallback);
  assert.equal(sanitizeExternalUrl('vbscript:msgbox(1)', fallback), fallback);
  assert.equal(sanitizeExternalUrl('file:///etc/passwd', fallback), fallback);
  assert.equal(sanitizeExternalUrl('blob:https://example.com/123', fallback), fallback);
});

test('TC-SEC-02: sanitizeExternalUrl normalizes valid http/https and bare domains safely', () => {
  assert.equal(
    sanitizeExternalUrl('https://search.google.com/local/writereview?placeid=123'),
    'https://search.google.com/local/writereview?placeid=123',
  );
  assert.equal(
    sanitizeExternalUrl('g.page/r/demo-salon/review'),
    'https://g.page/r/demo-salon/review',
  );
  assert.equal(sanitizeExternalUrl('', ''), '');
  assert.equal(sanitizeExternalUrl(null, 'https://www.google.com/maps'), 'https://www.google.com/maps');
});

test('TC-SEC-03: sanitizeLogoDataUrl blocks SVG/HTML/javascript URIs and allows safe raster images & bundled assets', () => {
  assert.equal(sanitizeLogoDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), '');
  assert.equal(sanitizeLogoDataUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(sanitizeLogoDataUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeLogoDataUrl('/src/assets/../../etc/passwd'), '');

  assert.equal(sanitizeLogoDataUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(sanitizeLogoDataUrl('/src/assets/images/demo-salon.jpg'), '/src/assets/images/demo-salon.jpg');
  assert.equal(sanitizeLogoDataUrl('https://cdn.example.com/logo.png'), 'https://cdn.example.com/logo.png');
  assert.equal(sanitizeLogoDataUrl(''), '');
});

test('TC-AUTH-01: provider inspection helpers detect Google and Email/Password providers consistently', () => {
  const googleOnly = [{ providerId: 'google.com' }];
  const linkedBothA = [{ providerId: 'google.com' }, { providerId: 'password' }];
  const linkedBothB = [{ providerId: 'password' }, { providerId: 'google.com' }];

  assert.equal(hasGoogleProvider(googleOnly), true);
  assert.equal(hasPasswordProvider(googleOnly), false);
  assert.equal(hasGoogleProvider(linkedBothA), true);
  assert.equal(hasPasswordProvider(linkedBothA), true);
  assert.equal(getProviderSignature(linkedBothA), getProviderSignature(linkedBothB));
  assert.equal(getProviderSignature(null), '');
});

test('TC-AUTH-02: classifyAuthError guides Google-only user hitting Create Account (email-already-in-use)', () => {
  const err = new Error('Firebase: Error (auth/email-already-in-use).');
  const classified = classifyAuthError(err, {
    mode: 'signup',
    email: 'Rohan@Example.com ',
    methods: ['google.com'],
  });

  assert.equal(classified.kind, 'email_exists');
  assert.equal(classified.email, 'rohan@example.com');
  assert.equal(classified.suggestGoogleSignIn, true);
  assert.equal(classified.suggestPasswordReset, true);
  assert.match(classified.message, /Google Sign-In/i);
});

test('TC-AUTH-03: classifyAuthError guides Google user trying Email+Password sign-in without password set', () => {
  const err = new Error('Firebase: Error (auth/invalid-credential).');
  const classifiedWithEnumeration = classifyAuthError(err, {
    mode: 'signin',
    email: 'owner@salon.com',
    methods: ['google.com'],
  });
  assert.equal(classifiedWithEnumeration.kind, 'invalid_credential');
  assert.equal(classifiedWithEnumeration.suggestGoogleSignIn, true);
  assert.equal(classifiedWithEnumeration.suggestPasswordReset, true);
  assert.match(classifiedWithEnumeration.message, /does not have a password yet/i);

  // Also test when Firebase Email Enumeration Protection returns empty methods []
  const classifiedWithoutEnumeration = classifyAuthError(err, {
    mode: 'signin',
    email: 'owner@salon.com',
    methods: [],
  });
  assert.equal(classifiedWithoutEnumeration.kind, 'invalid_credential');
  assert.equal(classifiedWithoutEnumeration.suggestGoogleSignIn, true);
  assert.equal(classifiedWithoutEnumeration.suggestPasswordReset, true);
});

test('TC-AUTH-04: classifyAuthError handles weak-password and requires-recent-login cleanly', () => {
  const weak = classifyAuthError(new Error('auth/weak-password'), { mode: 'link' });
  assert.equal(weak.kind, 'weak_password');
  assert.equal(weak.suggestGoogleSignIn, undefined);

  const reauth = classifyAuthError(new Error('auth/requires-recent-login'), { mode: 'link' });
  assert.equal(reauth.kind, 'requires_recent_login');
  assert.match(reauth.message, /confirm your Google sign-in/i);
});

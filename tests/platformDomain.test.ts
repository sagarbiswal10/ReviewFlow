import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatReviewEventActionLabel,
  getMondaySundayWindow,
  getTimestampMs,
  isMondayToday,
  normalizeEmail,
  sanitizeAccessLevel,
  sanitizeEnabledFeatures,
  sanitizeGbpSettings,
  sanitizeSlug,
  sanitizeWeeklyReportConfig,
} from '../src/utils/domainHelpers.ts';

test('TC-DOM-01: sanitizeSlug normalizes symbols, whitespace, and short strings deterministically', () => {
  assert.equal(sanitizeSlug('  Bella Bistro & Cafe! '), 'bella-bistro-cafe');
  assert.equal(sanitizeSlug('Lumina--Studio'), 'lumina-studio');
  assert.match(sanitizeSlug('a'), /^biz-[a-z0-9]{5}$/);
});

test('TC-DOM-02: sanitizeGbpSettings always locks 1-2 star reviews to manual_approval_only', () => {
  const forced = sanitizeGbpSettings({
    fiveStarMode: 'auto_publish',
    midStarMode: 'auto_publish',
    lowStarMode: 'auto_publish' as never,
    brandVoice: '  Warm and welcoming  ',
  });
  assert.equal(forced.fiveStarMode, 'auto_publish');
  assert.equal(forced.midStarMode, 'auto_publish');
  assert.equal(forced.lowStarMode, 'manual_approval_only');
  assert.equal(forced.brandVoice, 'Warm and welcoming');
});

test('TC-DOM-03: sanitizeWeeklyReportConfig validates emails, normalizes case, and falls back to clientEmail', () => {
  const fallbackOnly = sanitizeWeeklyReportConfig(undefined, '  OWNER@Bistro.COM ');
  assert.deepEqual(fallbackOnly.recipients, ['owner@bistro.com']);

  const filtered = sanitizeWeeklyReportConfig({
    recipients: ['Admin@Test.COM', 'not-an-email', 'Second@Test.org'],
  });
  assert.deepEqual(filtered.recipients, ['admin@test.com', 'second@test.org']);
});

test('TC-DOM-04: getMondaySundayWindow computes exact Monday-Sunday ISO spans and respects weekOffset', () => {
  // Wednesday, Nov 18, 2026
  const wednesday = new Date(2026, 10, 18, 14, 30, 0);
  const current = getMondaySundayWindow(0, wednesday);
  assert.equal(current.weekStart, '2026-11-16'); // Monday
  assert.equal(current.weekEnd, '2026-11-22'); // Sunday
  assert.ok(current.endMs > current.startMs);

  const previous = getMondaySundayWindow(-1, wednesday);
  assert.equal(previous.weekStart, '2026-11-09');
  assert.equal(previous.weekEnd, '2026-11-15');

  // Sunday edge case: Sunday Nov 22, 2026 belongs to week 2026-11-16..2026-11-22
  const sunday = new Date(2026, 10, 22, 20, 0, 0);
  const sundayWindow = getMondaySundayWindow(0, sunday);
  assert.equal(sundayWindow.weekStart, '2026-11-16');
  assert.equal(sundayWindow.weekEnd, '2026-11-22');

  assert.equal(isMondayToday(new Date(2026, 10, 16, 9, 0, 0)), true);
  assert.equal(isMondayToday(wednesday), false);
});

test('TC-DOM-05: getTimestampMs parses Firestore Timestamp-like objects, Dates, numbers, and ISO strings', () => {
  const sampleMs = Date.UTC(2026, 10, 20, 10, 0, 0);
  assert.equal(getTimestampMs(sampleMs), sampleMs);
  assert.equal(getTimestampMs(new Date(sampleMs)), sampleMs);
  assert.equal(getTimestampMs({ toMillis: () => sampleMs }), sampleMs);
  assert.equal(getTimestampMs({ toDate: () => new Date(sampleMs) }), sampleMs);
  assert.equal(getTimestampMs({ seconds: Math.floor(sampleMs / 1000) }), sampleMs);
  assert.equal(getTimestampMs('2026-11-20T10:00:00.000Z'), sampleMs);
  assert.equal(getTimestampMs(null), 0);
});

test('TC-DOM-06: formatReviewEventActionLabel handles all 4 lifecycle stages including form_start', () => {
  assert.equal(formatReviewEventActionLabel('scan'), 'QR Scan');
  assert.equal(formatReviewEventActionLabel('form_start'), 'Started Form');
  assert.equal(formatReviewEventActionLabel('generate'), 'AI Draft Created');
  assert.equal(formatReviewEventActionLabel('copy_redirect'), 'Opened Google Review');
});

test('TC-DOM-07: normalizeEmail, sanitizeAccessLevel, and sanitizeEnabledFeatures apply safe defaults', () => {
  assert.equal(normalizeEmail('  Rohan.Client@GMAIL.com '), 'rohan.client@gmail.com');
  assert.equal(sanitizeAccessLevel('unknown_tier'), 'full');
  assert.equal(sanitizeAccessLevel('read_only'), 'read_only');
  const feats = sanitizeEnabledFeatures({ customQuestions: false });
  assert.equal(feats.customQuestions, false);
  assert.equal(feats.gbpAutoReply, true);
  assert.equal(feats.weeklyReports, true);
});

test('TC-ARCH-01: GBP OAuth connection is strictly restricted to ManagementConsoleView (not ClientPortalView)', () => {
  const clientPortalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf-8',
  );
  const adminConsoleSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ManagementConsoleView.tsx'),
    'utf-8',
  );
  const gbpTabSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/GbpAutoReplyTab.tsx'),
    'utf-8',
  );

  // ClientPortalView passes allowOAuthConnection={false}
  assert.match(clientPortalSrc, /<GbpAutoReplyTab[\s\S]*allowOAuthConnection=\{false\}/);
  // ManagementConsoleView explicitly enables allowOAuthConnection
  assert.match(adminConsoleSrc, /<GbpAutoReplyTab[\s\S]*allowOAuthConnection/);
  // GbpAutoReplyTab defaults allowOAuthConnection to false
  assert.match(gbpTabSrc, /allowOAuthConnection\s*=\s*false/);
});

test('TC-ARCH-02: ClientPortalView guards failed clientUid claims from infinite retry loops', () => {
  const clientPortalSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ClientPortalView.tsx'),
    'utf-8',
  );
  assert.match(clientPortalSrc, /claimedAttemptRef\.current\.add\(attemptKey\)/);
  assert.match(clientPortalSrc, /isClientUidLinked/);
  assert.doesNotMatch(clientPortalSrc, /const todayIso = toLocalDateStr\(new Date\(\)\);/);
});

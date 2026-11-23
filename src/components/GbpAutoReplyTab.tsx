import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Star,
  Unlink,
  X,
} from 'lucide-react';
import type {
  Business,
  GbpConnection,
  GbpReplySettings,
  GbpReview,
} from '../types';
import { updateBusiness } from '../services/businessService';
import {
  approveAndPublishGbpReply,
  disconnectGbpConnection,
  generateAndStoreGbpReviewReply,
  getGoogleOAuthClientId,
  getSavedGbpOAuthClientId,
  ignoreGbpReview,
  isCustomGbpOAuthClientConfigured,
  listGbpLocationsWithToken,
  requestGbpOAuthToken,
  saveGbpConnection,
  saveGbpOAuthClientId,
  subscribeToBusinessGbpReviews,
  subscribeToGbpConnection,
  syncGbpReviewsWithToken,
  updateGbpReviewReplyText,
} from '../services/platformFeaturesService';

interface GbpAutoReplyTabProps {
  business: Business;
  userUid: string;
  userEmail: string;
  isAdmin?: boolean;
  canEdit: boolean;
  allowOAuthConnection?: boolean;
}

type QueueFilter = 'all' | 'awaiting_approval' | 'auto_published' | 'manually_approved' | 'failed';

export function GbpAutoReplyTab({
  business,
  userUid,
  userEmail,
  isAdmin = false,
  canEdit,
  allowOAuthConnection = false,
}: GbpAutoReplyTabProps) {
  const [connection, setConnection] = useState<GbpConnection | null>(null);
  const [reviews, setReviews] = useState<GbpReview[]>([]);
  const [gbpToken, setGbpToken] = useState<string>('');
  const [discoveredLocations, setDiscoveredLocations] = useState<
    Array<{ accountName: string; locationName: string; title: string; placeId: string }>
  >([]);
  const [selectedLocName, setSelectedLocName] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [connNotice, setConnNotice] = useState<string | null>(null);

  const [settings, setSettings] = useState<GbpReplySettings>(
    business.gbpSettings ?? {
      fiveStarMode: 'auto_publish',
      midStarMode: 'approval_required',
      lowStarMode: 'manual_approval_only',
      brandVoice: '',
      autoSyncEnabled: true,
    },
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState('');
  const [previewReview, setPreviewReview] = useState<GbpReview | null>(null);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);

  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [incomingReviewer, setIncomingReviewer] = useState('');
  const [incomingStars, setIncomingStars] = useState<number>(5);
  const [incomingComment, setIncomingComment] = useState('');
  const [isProcessingIncoming, setIsProcessingIncoming] = useState(false);
  const oauthAttemptRef = useRef(0);
  const [customClientInput, setCustomClientInput] = useState<string>(() =>
    getSavedGbpOAuthClientId(),
  );
  const [showOAuthConfig, setShowOAuthConfig] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [oauthConfigVersion, setOauthConfigVersion] = useState(0);
  const hasCustomOAuthClient = useMemo(
    () => isCustomGbpOAuthClientConfigured(),
    [oauthConfigVersion],
  );
  const activeOAuthClientId = useMemo(
    () => getGoogleOAuthClientId(),
    [oauthConfigVersion],
  );
  const envOAuthClientConfigured = Boolean((import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '').trim());
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const isSettingsDirtyRef = useRef(false);
  const defaultGbpSettings = (raw?: GbpReplySettings): GbpReplySettings =>
    raw ?? {
      fiveStarMode: 'auto_publish',
      midStarMode: 'approval_required',
      lowStarMode: 'manual_approval_only',
      brandVoice: '',
      autoSyncEnabled: true,
    };
  const lastSettingsSigRef = useRef<{ id: string; sig: string }>({
    id: business.id,
    sig: JSON.stringify(defaultGbpSettings(business.gbpSettings)),
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const incoming = defaultGbpSettings(business.gbpSettings);
    const incomingSig = JSON.stringify(incoming);
    if (lastSettingsSigRef.current.id !== business.id) {
      isSettingsDirtyRef.current = false;
      lastSettingsSigRef.current = { id: business.id, sig: incomingSig };
      setSettings(incoming);
      setSettingsNotice(null);
      return;
    }
    if (!isSettingsDirtyRef.current && incomingSig !== lastSettingsSigRef.current.sig) {
      lastSettingsSigRef.current = { id: business.id, sig: incomingSig };
      setSettings(incoming);
    }
  }, [business.id, business.gbpSettings]);

  useEffect(() => {
    const unsubConn = subscribeToGbpConnection(
      business.id,
      (c) => setConnection(c),
      (err) => setConnError(err?.message || 'Unable to load Google Business Profile connection.'),
    );
    const unsubRev = subscribeToBusinessGbpReviews(
      business.id,
      userUid,
      userEmail,
      isAdmin,
      (list) => setReviews(list),
      (err) => setQueueError(err?.message || 'Unable to load synced Google reviews.'),
    );
    return () => {
      unsubConn();
      unsubRev();
    };
  }, [business.id, userUid, userEmail, isAdmin]);

  const filteredReviews = useMemo(() => {
    if (queueFilter === 'all') return reviews;
    if (queueFilter === 'manually_approved') {
      return reviews.filter(
        (r) => r.replyStatus === 'manually_approved' || r.replyStatus === 'published',
      );
    }
    if (queueFilter === 'failed') {
      return reviews.filter((r) => r.replyStatus === 'failed' || r.replyStatus === 'ignored');
    }
    return reviews.filter((r) => r.replyStatus === queueFilter);
  }, [reviews, queueFilter]);

  const counts = useMemo(() => {
    return {
      total: reviews.length,
      awaiting: reviews.filter((r) => r.replyStatus === 'awaiting_approval').length,
      autoPublished: reviews.filter((r) => r.replyStatus === 'auto_published').length,
      approved: reviews.filter(
        (r) => r.replyStatus === 'manually_approved' || r.replyStatus === 'published',
      ).length,
      failedOrIgnored: reviews.filter(
        (r) => r.replyStatus === 'failed' || r.replyStatus === 'ignored',
      ).length,
    };
  }, [reviews]);

  const handleCancelOAuthWait = () => {
    oauthAttemptRef.current += 1;
    setIsConnecting(false);
    setIsSyncing(false);
    setConnError(
      'Google authorization was cancelled. You can use "Process Incoming Review" below without OAuth, or configure your OAuth Client ID and try again.',
    );
  };

  const handleSaveCustomOAuthClient = (e: React.FormEvent) => {
    e.preventDefault();
    setConnError(null);
    setConnNotice(null);
    try {
      const saved = saveGbpOAuthClientId(customClientInput);
      setOauthConfigVersion((v) => v + 1);
      setShowOAuthConfig(false);
      setConnNotice(
        saved
          ? 'Saved your Google Cloud Web OAuth Client ID for this browser. Click "Connect Google Business" to authorize.'
          : 'Cleared custom OAuth Client ID override.',
      );
    } catch (err) {
      setConnError(err instanceof Error ? err.message : 'Invalid OAuth Client ID.');
    }
  };

  const handleCopyOrigin = async () => {
    if (!currentOrigin) return;
    try {
      await navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyClientId = async () => {
    if (!activeOAuthClientId) return;
    try {
      await navigator.clipboard.writeText(activeOAuthClientId);
      setCopiedClientId(true);
      setTimeout(() => setCopiedClientId(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleConnectGoogleOAuth = async () => {
    setConnError(null);
    setConnNotice(null);
    if (!hasCustomOAuthClient) {
      setShowOAuthConfig(true);
      setConnError(
        `Please enter your Google Cloud Web OAuth Client ID below first (with ${currentOrigin || 'this site'} in Authorized JavaScript Origins). Using the default Firebase Auth client triggers Google Error 400: origin_mismatch.`,
      );
      return;
    }
    const attemptId = ++oauthAttemptRef.current;
    setIsConnecting(true);
    try {
      const token = await requestGbpOAuthToken();
      if (oauthAttemptRef.current !== attemptId) return;
      setGbpToken(token);
      try {
        const locations = await listGbpLocationsWithToken(token);
        if (oauthAttemptRef.current !== attemptId) return;
        setDiscoveredLocations(locations);
        if (locations.length > 0) {
          setSelectedLocName(locations[0].locationName);
          await saveGbpConnection({
            business,
            connectionStatus: 'connected',
            connectedEmail: '',
            accountName: locations[0].accountName,
            locationName: locations[0].locationName,
            locationTitle: locations[0].title,
            placeId: locations[0].placeId,
            existing: connection,
          });
          setConnNotice(`Connected Google Business Profile location: ${locations[0].title}`);
        } else {
          await saveGbpConnection({
            business,
            connectionStatus: 'connected',
            connectedEmail: '',
            accountName: 'authorized',
            locationName: '',
            locationTitle: 'No GBP locations found on this Google account',
            placeId: '',
            existing: connection,
          });
          setConnNotice('OAuth authorized, but no Google Business Profile locations were returned for this Google account.');
        }
      } catch (apiErr) {
        if (oauthAttemptRef.current !== attemptId) return;
        const msg = apiErr instanceof Error ? apiErr.message : String(apiErr);
        await saveGbpConnection({
          business,
          connectionStatus: 'pending_api_approval',
          connectedEmail: '',
          accountName: 'oauth_authorized',
          locationName: '',
          locationTitle: 'Pending Google GBP API Access Approval',
          placeId: '',
          existing: connection,
        });
        setConnError(
          `Google OAuth succeeded, but Google Business Profile API returned an authorization/quota notice: ${msg}`,
        );
      }
    } catch (err) {
      if (oauthAttemptRef.current !== attemptId) return;
      setShowOAuthConfig(true);
      setConnError(err instanceof Error ? err.message : 'Google Business Profile OAuth failed.');
    } finally {
      if (oauthAttemptRef.current === attemptId) {
        setIsConnecting(false);
      }
    }
  };

  const handleSaveSelectedLocation = async (locationName: string) => {
    const loc = discoveredLocations.find((l) => l.locationName === locationName);
    if (!loc) return;
    setConnError(null);
    setConnNotice(null);
    setSelectedLocName(locationName);
    try {
      await saveGbpConnection({
        business,
        connectionStatus: 'connected',
        connectedEmail: connection?.connectedEmail || '',
        accountName: loc.accountName,
        locationName: loc.locationName,
        locationTitle: loc.title,
        placeId: loc.placeId,
        existing: connection,
      });
      setConnNotice(`Active location switched to ${loc.title}`);
    } catch (err) {
      setConnError(err instanceof Error ? err.message : 'Unable to save selected GBP location.');
    }
  };

  const handleDisconnect = async () => {
    setConnError(null);
    setConnNotice(null);
    try {
      await disconnectGbpConnection(business, connection);
      setGbpToken('');
      setDiscoveredLocations([]);
      setConnNotice('Google Business Profile connection disconnected.');
    } catch (err) {
      setConnError(
        err instanceof Error ? err.message : 'Unable to disconnect Google Business Profile.',
      );
    }
  };

  const handleSyncNow = async () => {
    setConnError(null);
    setConnNotice(null);
    const attemptId = ++oauthAttemptRef.current;
    setIsSyncing(true);
    try {
      let tokenToUse = gbpToken;
      if (!tokenToUse) {
        tokenToUse = await requestGbpOAuthToken();
        if (oauthAttemptRef.current !== attemptId) return;
        setGbpToken(tokenToUse);
      }
      const locName = connection?.locationName || selectedLocName;
      if (!locName) {
        throw new Error('Select a verified Google Business Profile location before syncing reviews.');
      }
      const imported = await syncGbpReviewsWithToken({
        business,
        gbpAccessToken: tokenToUse,
        locationName: locName,
        existingReviews: reviews,
      });
      if (oauthAttemptRef.current !== attemptId) return;
      setConnNotice(
        imported > 0
          ? `Synced ${imported} new Google review(s) and generated AI replies.`
          : 'Sync complete. All latest Google reviews are already in your queue.',
      );
    } catch (err) {
      if (oauthAttemptRef.current !== attemptId) return;
      setConnError(err instanceof Error ? err.message : 'Unable to sync Google reviews.');
    } finally {
      if (oauthAttemptRef.current === attemptId) {
        setIsSyncing(false);
      }
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsNotice(null);
    setQueueError(null);
    const payload = {
      ...settings,
      lowStarMode: 'manual_approval_only' as const,
    };
    try {
      await updateBusiness(
        business,
        {
          gbpSettings: payload,
        },
        { isAdmin },
      );
      if (!mountedRef.current) return;
      isSettingsDirtyRef.current = false;
      lastSettingsSigRef.current = { id: business.id, sig: JSON.stringify(payload) };
      setSettingsNotice('Rating-based AI reply rules saved.');
      setTimeout(() => {
        if (mountedRef.current) setSettingsNotice(null);
      }, 3000);
    } catch (err) {
      if (mountedRef.current) {
        setQueueError(err instanceof Error ? err.message : 'Unable to save reply settings.');
      }
    } finally {
      if (mountedRef.current) {
        setIsSavingSettings(false);
      }
    }
  };

  const handleProcessIncomingReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomingReviewer.trim()) return;
    setIsProcessingIncoming(true);
    setQueueError(null);
    setQueueNotice(null);
    try {
      const created = await generateAndStoreGbpReviewReply({
        business,
        reviewerName: incomingReviewer.trim(),
        starRating: incomingStars,
        comment: incomingComment.trim(),
        source: 'pubsub_webhook',
        gbpAccessToken: gbpToken || undefined,
        locationName: connection?.locationName || undefined,
      });
      setIncomingReviewer('');
      setIncomingComment('');
      setShowWebhookModal(false);
      setQueueNotice(
        created.replyStatus === 'auto_published'
          ? `AI reply generated & auto-published (${created.starRating}★ policy) via ${created.aiModelId}.`
          : `AI reply generated & queued for mandatory review (${created.starRating}★ policy) via ${created.aiModelId}.`,
      );
      setTimeout(() => setQueueNotice(null), 4500);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to process review.');
    } finally {
      setIsProcessingIncoming(false);
    }
  };

  const handleRegenerate = async (rev: GbpReview) => {
    setBusyReviewId(rev.id);
    setQueueError(null);
    try {
      await generateAndStoreGbpReviewReply({
        business,
        reviewerName: rev.reviewerName,
        starRating: rev.starRating,
        comment: rev.comment,
        reviewDate: rev.reviewDate,
        externalReviewId: rev.externalReviewId,
        source: rev.source,
        existingReviewId: rev.id,
        gbpAccessToken: gbpToken || undefined,
        locationName: connection?.locationName || undefined,
      });
      setQueueNotice(`Regenerated AI response for ${rev.reviewerName}.`);
      setTimeout(() => setQueueNotice(null), 3000);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to regenerate AI reply.');
    } finally {
      setBusyReviewId(null);
    }
  };

  const handleApproveAndPublish = async (rev: GbpReview, customText?: string) => {
    setBusyReviewId(rev.id);
    setQueueError(null);
    try {
      await approveAndPublishGbpReply({
        review: rev,
        editedText: customText ?? rev.aiReplyText,
        gbpAccessToken: gbpToken || undefined,
        locationName: connection?.locationName || undefined,
      });
      setEditingReviewId(null);
      setQueueNotice(`Reply approved & published for ${rev.reviewerName}.`);
      setTimeout(() => setQueueNotice(null), 3000);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Unable to publish reply.');
    } finally {
      setBusyReviewId(null);
    }
  };

  const handleSaveInlineEdit = async (rev: GbpReview) => {
    setBusyReviewId(rev.id);
    setQueueError(null);
    try {
      await updateGbpReviewReplyText(rev.id, editDraftText);
      setEditingReviewId(null);
      setQueueNotice(`Updated AI draft reply for ${rev.reviewerName}.`);
      setTimeout(() => setQueueNotice(null), 3000);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Unable to save reply text.');
    } finally {
      setBusyReviewId(null);
    }
  };

  const handleIgnore = async (rev: GbpReview) => {
    setBusyReviewId(rev.id);
    setQueueError(null);
    try {
      await ignoreGbpReview(rev.id);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Unable to ignore review.');
    } finally {
      setBusyReviewId(null);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Section 6.1: Google Business Profile Connection & Sync */}
      <div className="liquid-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Google Business Profile Connection
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                  connection?.connectionStatus === 'connected'
                    ? 'bg-emerald-50 text-emerald-700'
                    : connection?.connectionStatus === 'pending_api_approval'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {connection?.connectionStatus === 'connected'
                  ? 'Connected'
                  : connection?.connectionStatus === 'pending_api_approval'
                    ? 'OAuth Ready · GBP API Access Pending'
                    : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              {connection?.locationTitle
                ? `Location: ${connection.locationTitle}${
                    allowOAuthConnection && connection.connectedEmail
                      ? ` (${connection.connectedEmail})`
                      : ''
                  }`
                : allowOAuthConnection
                  ? 'Connect Google Business Profile via OAuth 2.0 (business.manage scope) to fetch reviews and publish AI owner replies.'
                  : 'Google Business Profile connection is managed centrally by your ReviewFlow Administrator in the Business Management Console. Configure your rating rules, test incoming reviews, and approve AI replies below.'}
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {allowOAuthConnection && (
                <>
                  <button
                    type="button"
                    disabled={isConnecting}
                    onClick={handleConnectGoogleOAuth}
                    className="px-4 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    {isConnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Link2 className="w-4 h-4" />
                    )}
                    <span>
                      {isConnecting
                        ? 'Waiting for Google...'
                        : connection?.connectionStatus === 'connected'
                          ? 'Reconnect Google Account'
                          : 'Connect Google Business'}
                    </span>
                  </button>

                  {(isConnecting || isSyncing) && (
                    <button
                      type="button"
                      onClick={handleCancelOAuthWait}
                      className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  )}

                  {connection?.connectionStatus === 'connected' && (
                    <>
                      <button
                        type="button"
                        disabled={isSyncing}
                        onClick={handleSyncNow}
                        className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>Sync Reviews</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="px-3.5 py-2.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-xs font-semibold text-red-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => setShowWebhookModal((prev) => !prev)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-[#f0fdfa] text-xs font-semibold text-[#005c55] inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Process Incoming Review</span>
              </button>
            </div>
          )}
        </div>

        {allowOAuthConnection && discoveredLocations.length > 1 && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-700">
              Select GBP Location:
            </label>
            <select
              value={selectedLocName || connection?.locationName || ''}
              onChange={(e) => handleSaveSelectedLocation(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800"
            >
              {discoveredLocations.map((loc) => (
                <option key={loc.locationName} value={loc.locationName}>
                  {loc.title} ({loc.locationName})
                </option>
              ))}
            </select>
          </div>
        )}

        {connError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <span>{connError}</span>
          </div>
        )}
        {allowOAuthConnection &&
          (!hasCustomOAuthClient || showOAuthConfig) &&
          connection?.connectionStatus !== 'connected' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3.5 text-xs text-slate-700 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#0f766e]" />
                <span>Google Business Profile OAuth Setup &amp; Troubleshooter</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {currentOrigin && (
                  <button
                    type="button"
                    onClick={handleCopyOrigin}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedOrigin ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedOrigin ? 'Origin Copied' : `Copy ${currentOrigin}`}</span>
                  </button>
                )}
                {activeOAuthClientId && (
                  <button
                    type="button"
                    onClick={handleCopyClientId}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedClientId ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedClientId ? 'Client ID Copied' : 'Copy Client ID'}</span>
                  </button>
                )}
                {showOAuthConfig && hasCustomOAuthClient && (
                  <button
                    type="button"
                    onClick={() => setShowOAuthConfig(false)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-600 cursor-pointer"
                  >
                    Hide
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5 leading-relaxed">
              <p>
                Active OAuth Client ID:{' '}
                <span className="font-mono font-semibold text-slate-900 break-all">
                  {activeOAuthClientId || 'not set'}
                </span>
              </p>
              <p className="font-semibold text-slate-800 pt-1">
                If Google shows &ldquo;Access blocked: Authorisation error&rdquo;, verify all 4 items in Google Cloud Console:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-700">
                <li>
                  <span className="font-semibold">Credentials &rarr; OAuth Client Type:</span> Must be{' '}
                  <span className="font-semibold">Web application</span> matching the Client ID above.
                </li>
                <li>
                  <span className="font-semibold">Authorized JavaScript origins:</span> Add{' '}
                  <span className="font-mono font-semibold text-slate-900">{currentOrigin || 'this URL'}</span>{' '}
                  exact URL with <span className="font-semibold">no trailing slash</span> (do{' '}
                  <span className="italic">not</span> only add it to Redirect URIs).
                </li>
                <li>
                  <span className="font-semibold">Google Auth Platform &rarr; Audience:</span> Keep Publishing Status as{' '}
                  <span className="font-semibold">Testing</span> (unverified Production blocks sensitive scope{' '}
                  <span className="font-mono">business.manage</span>) and add the Google Business Gmail under{' '}
                  <span className="font-semibold">Test users</span>.
                </li>
                <li>
                  <span className="font-semibold">APIs &amp; Services &rarr; Library:</span> Enable{' '}
                  <span className="font-semibold">My Business Account Management API</span> and{' '}
                  <span className="font-semibold">My Business Business Information API</span> in the same project.
                </li>
              </ol>
              <p className="text-slate-600 pt-0.5">
                Or test replies immediately without OAuth using <span className="font-semibold">Process Incoming Review</span>.
              </p>
            </div>

            <form
              onSubmit={handleSaveCustomOAuthClient}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
            >
              <input
                type="text"
                value={customClientInput}
                onChange={(e) => setCustomClientInput(e.target.value)}
                placeholder="Override OAuth Client ID for this browser (e.g. 123456-abc.apps.googleusercontent.com)"
                className="flex-1 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono text-slate-900"
              />
              <button
                type="submit"
                className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Save Client ID
              </button>
              {getSavedGbpOAuthClientId() && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomClientInput('');
                    saveGbpOAuthClientId('');
                    setOauthConfigVersion((v) => v + 1);
                    setConnNotice('Cleared browser override; using environment OAuth Client ID.');
                  }}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Reset Override
                </button>
              )}
            </form>
          </div>
        )}
        {allowOAuthConnection &&
          hasCustomOAuthClient &&
          !showOAuthConfig &&
          connection?.connectionStatus !== 'connected' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
            <span className="break-all">
              Using {getSavedGbpOAuthClientId() ? 'saved override' : envOAuthClientConfigured ? 'Vercel env' : 'custom'} Google OAuth Client ID:{' '}
              <span className="font-mono font-semibold">{activeOAuthClientId}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowOAuthConfig(true)}
              className="text-xs font-semibold text-[#005c55] hover:underline cursor-pointer shrink-0"
            >
              OAuth Setup / Change ID
            </button>
          </div>
        )}
        {connNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{connNotice}</span>
          </div>
        )}

        {/* Incoming Review / PubSub Webhook Event Processor */}
        {showWebhookModal && canEdit && (
          <form
            onSubmit={handleProcessIncomingReview}
            className="mt-2 p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Process Incoming Google Review (Pub/Sub / Sync Pipeline)
                </h3>
                <p className="text-xs text-slate-500">
                  Runs real Gemini AI reply generation, rating-rule routing (5★ auto-publish, 1–2★ locked manual approval), and full token/cost logging.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reviewer Name
                </label>
                <input
                  type="text"
                  required
                  value={incomingReviewer}
                  onChange={(e) => setIncomingReviewer(e.target.value)}
                  placeholder="e.g., Jordan Lee"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Star Rating
                </label>
                <select
                  value={incomingStars}
                  onChange={(e) => setIncomingStars(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value={5}>5 Stars (High)</option>
                  <option value={4}>4 Stars (Medium)</option>
                  <option value={3}>3 Stars (Medium)</option>
                  <option value={2}>2 Stars (Low — Mandatory Approval)</option>
                  <option value={1}>1 Star (Low — Mandatory Approval)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isProcessingIncoming}
                  className="w-full h-9 px-4 rounded-lg bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isProcessingIncoming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Generate AI Reply</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Google Review Comment
              </label>
              <textarea
                rows={2}
                value={incomingComment}
                onChange={(e) => setIncomingComment(e.target.value)}
                placeholder="Paste customer review text here..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
              />
            </div>
          </form>
        )}
      </div>

      {/* Section 6.3: Rating-Based Reply Rules */}
      <form onSubmit={handleSaveSettings} className="liquid-glass rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Rating-Based AI Auto-Reply Rules
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Low-rating reviews (1–2 stars) are strictly locked to manual approval before publishing.
            </p>
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isSavingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Reply Policy</span>
            </button>
          )}
        </div>

        {settingsNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-800">
            {settingsNotice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">5-Star Reviews</span>
              <span className="text-xs font-semibold text-emerald-700">High Rating</span>
            </div>
            <select
              disabled={!canEdit}
              value={settings.fiveStarMode}
              onChange={(e) => {
                isSettingsDirtyRef.current = true;
                setSettings((prev) => ({
                  ...prev,
                  fiveStarMode: e.target.value as 'auto_publish' | 'approval_required',
                }));
              }}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
            >
              <option value="auto_publish">Generate &amp; Auto-Publish</option>
              <option value="approval_required">Generate &amp; Queue Approval</option>
            </select>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">3–4 Star Reviews</span>
              <span className="text-xs font-semibold text-teal-700">Mid Rating</span>
            </div>
            <select
              disabled={!canEdit}
              value={settings.midStarMode}
              onChange={(e) => {
                isSettingsDirtyRef.current = true;
                setSettings((prev) => ({
                  ...prev,
                  midStarMode: e.target.value as 'auto_publish' | 'approval_required',
                }));
              }}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium"
            >
              <option value="approval_required">Generate &amp; Queue Approval</option>
              <option value="auto_publish">Generate &amp; Auto-Publish</option>
            </select>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950">1–2 Star Reviews</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                <Shield className="w-3 h-3" />
                Locked Safe
              </span>
            </div>
            <div className="h-9 px-3 rounded-lg border border-amber-200 bg-white text-xs font-semibold text-amber-900 flex items-center">
              Manual Approval Mandatory
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            AI Reply Brand Voice &amp; Sign-Off Instructions (Optional)
          </label>
          <input
            type="text"
            disabled={!canEdit}
            value={settings.brandVoice}
            onChange={(e) => {
              isSettingsDirtyRef.current = true;
              setSettings((prev) => ({ ...prev, brandVoice: e.target.value }));
            }}
            placeholder="e.g., Warm hospitality tone, sign off as '— Management Team, Bella Bistro'"
            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900"
          />
        </div>
      </form>

      {/* Section 6.4 & 6.5: Reply Management Queue & AI Model Telemetry */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              AI Reply Management Queue ({reviews.length})
            </h2>
            <p className="text-xs text-slate-500">
              Preview, edit, regenerate, approve &amp; publish, or ignore incoming customer reviews with per-reply AI token &amp; cost tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${counts.total})` },
                { id: 'awaiting_approval', label: `Awaiting Approval (${counts.awaiting})` },
                { id: 'auto_published', label: `Auto-Published (${counts.autoPublished})` },
                { id: 'manually_approved', label: `Approved (${counts.approved})` },
                { id: 'failed', label: `Failed/Ignored (${counts.failedOrIgnored})` },
              ] as { id: QueueFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQueueFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  queueFilter === tab.id
                    ? 'bg-[#0f766e] text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-[#f0fdfa]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {queueError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {queueError}
          </div>
        )}
        {queueNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            {queueNotice}
          </div>
        )}

        {filteredReviews.length === 0 ? (
          <div className="liquid-glass rounded-2xl p-10 text-center space-y-2">
            <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">No reviews in this queue filter</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {allowOAuthConnection
                ? 'Connect your Google Business Profile to sync live reviews or click "Process Incoming Review" above to test Gemini AI reply drafting and token tracking.'
                : 'Synced Google reviews will appear here once connected in the Business Management Console, or click "Process Incoming Review" above to test Gemini AI reply drafting.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReviews.map((rev) => {
              const isEditing = editingReviewId === rev.id;
              const isBusy = busyReviewId === rev.id;
              return (
                <div
                  key={rev.id}
                  className="liquid-glass spatial-card-3d rounded-2xl p-5 sm:p-6 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-bold text-slate-900">
                          {rev.reviewerName}
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < rev.starRating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(rev.reviewDate).toLocaleDateString()}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-medium text-slate-600">
                          {rev.source === 'google_gbp_api'
                            ? 'Google GBP API'
                            : rev.source === 'pubsub_webhook'
                              ? 'Pub/Sub Webhook'
                              : 'Manual Sync'}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                        {rev.comment || '(Star rating submitted without written comment)'}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase whitespace-nowrap shrink-0 self-start ${
                        rev.replyStatus === 'auto_published' || rev.replyStatus === 'published'
                          ? 'bg-emerald-50 text-emerald-700'
                          : rev.replyStatus === 'manually_approved'
                            ? 'bg-teal-50 text-teal-800'
                            : rev.replyStatus === 'awaiting_approval'
                              ? 'bg-amber-50 text-amber-800'
                              : rev.replyStatus === 'failed'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {rev.replyStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* AI Reply Body */}
                  <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#005c55]">
                        <Bot className="w-3.5 h-3.5" />
                        <span>AI Response Draft</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {rev.aiProvider} · {rev.aiModelId} · {rev.totalTokens} tokens · $
                        {rev.estimatedCostUsd.toFixed(5)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2.5">
                        <textarea
                          rows={3}
                          value={editDraftText}
                          onChange={(e) => setEditDraftText(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs sm:text-sm text-slate-900"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSaveInlineEdit(rev)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Save Draft
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveAndPublish(rev, editDraftText)}
                            className="px-3 py-1.5 rounded-lg bg-[#0f766e] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            Save, Approve &amp; Publish
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingReviewId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                        {rev.aiReplyText}
                      </p>
                    )}

                    {rev.errorMessage && (
                      <p className="text-xs text-red-700 font-medium">Error: {rev.errorMessage}</p>
                    )}
                  </div>

                  {/* Queue Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewReview(rev)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>

                      {canEdit && !isEditing && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingReviewId(rev.id);
                              setEditDraftText(rev.aiReplyText);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            Edit Response
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRegenerate(rev)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                            <span>Regenerate</span>
                          </button>

                          {rev.replyStatus !== 'ignored' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleApproveAndPublish(rev)}
                              className="px-3 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>
                                {rev.replyStatus === 'auto_published' ||
                                rev.replyStatus === 'manually_approved' ||
                                rev.replyStatus === 'published'
                                  ? 'Republish'
                                  : 'Approve & Publish'}
                              </span>
                            </button>
                          )}

                          {rev.replyStatus !== 'ignored' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleIgnore(rev)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 text-xs font-semibold text-slate-600 cursor-pointer whitespace-nowrap"
                            >
                              Ignore
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {rev.publishedAt && (
                      <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1 font-medium">
                        <Check className="w-3 h-3" />
                        Published {new Date(rev.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Google Owner Response Preview
              </h3>
              <button
                type="button"
                onClick={() => setPreviewReview(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <p className="text-xs font-bold text-slate-900">
                {previewReview.reviewerName} · {previewReview.starRating} Stars
              </p>
              <p className="text-xs text-slate-600">{previewReview.comment}</p>
            </div>
            <div className="p-4 rounded-xl bg-[#f0fdfa] border border-teal-200 space-y-1.5">
              <p className="text-[11px] font-bold uppercase text-[#005c55]">
                Response from {business.name}
              </p>
              <p className="text-sm text-slate-900 leading-relaxed">{previewReview.aiReplyText}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewReview(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

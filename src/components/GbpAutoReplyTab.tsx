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
  disconnectServerGbp,
  fetchServerGbpAccounts,
  fetchServerGbpLocations,
  generateAndStoreGbpReviewReply,
  ignoreGbpReview,
  publishServerGbpReply,
  selectServerGbpLocations,
  startServerGbpOAuth,
  subscribeToBusinessGbpReviews,
  subscribeToGbpConnection,
  syncServerGbpReviews,
  updateGbpReviewReplyText,
  type ServerGbpAccount,
  type ServerGbpLocation,
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
  const [accounts, setAccounts] = useState<ServerGbpAccount[]>([]);
  const [selectedAccountName, setSelectedAccountName] = useState('');
  const [discoveredLocations, setDiscoveredLocations] = useState<ServerGbpLocation[]>([]);
  const [selectedLocationNames, setSelectedLocationNames] = useState<string[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [connNotice, setConnNotice] = useState<string | null>(null);
  const [topicConflict, setTopicConflict] = useState<{
    existingTopic: string;
    sharedTopic: string;
    existingTypes: string[];
  } | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [copiedCallbackUrl, setCopiedCallbackUrl] = useState(false);

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
  const oauthCallbackHandledRef = useRef(false);
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const callbackUrl = currentOrigin ? `${currentOrigin}/api/gbp-oauth/callback` : '/api/gbp-oauth/callback';

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

  const handleLoadLocationsForAccount = async (accountName: string) => {
    if (!accountName) {
      setDiscoveredLocations([]);
      return;
    }
    setIsLoadingLocations(true);
    setConnError(null);
    try {
      const res = await fetchServerGbpLocations(business.id, accountName);
      if (!mountedRef.current) return;
      setDiscoveredLocations(res.locations);
      if (res.emptyMessage) {
        setConnError(res.emptyMessage);
      }
      const existingNames = new Set(
        (connection?.selectedLocations || []).map((l) => l.locationName),
      );
      if (connection?.locationName) existingNames.add(connection.locationName);
      const matched = res.locations
        .filter((l) => existingNames.has(l.locationName))
        .map((l) => l.locationName);
      setSelectedLocationNames(
        matched.length > 0 ? matched : res.locations.length === 1 ? [res.locations[0].locationName] : [],
      );
    } catch (err) {
      if (mountedRef.current) {
        setConnError(
          err instanceof Error ? err.message : 'Unable to fetch Google Business Profile locations.',
        );
      }
    } finally {
      if (mountedRef.current) setIsLoadingLocations(false);
    }
  };

  const handleLoadAccounts = async () => {
    setIsLoadingAccounts(true);
    setConnError(null);
    setTopicConflict(null);
    try {
      const res = await fetchServerGbpAccounts(business.id);
      if (!mountedRef.current) return;
      setAccounts(res.accounts);
      if (res.emptyMessage) {
        setConnError(res.emptyMessage);
      }
      if (res.accounts.length > 0) {
        const preferred =
          (connection?.accountName &&
            res.accounts.some((a) => a.name === connection.accountName) &&
            connection.accountName) ||
          res.accounts[0].name;
        setSelectedAccountName(preferred);
        await handleLoadLocationsForAccount(preferred);
      } else {
        setSelectedAccountName('');
        setDiscoveredLocations([]);
      }
    } catch (err) {
      if (mountedRef.current) {
        setConnError(
          err instanceof Error ? err.message : 'Unable to fetch Google Business Profile accounts.',
        );
      }
    } finally {
      if (mountedRef.current) setIsLoadingAccounts(false);
    }
  };

  // Detect return from Google OAuth callback (?gbp_oauth=connected|pending_api_approval|error)
  useEffect(() => {
    if (typeof window === 'undefined' || oauthCallbackHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const oauthState = params.get('gbp_oauth');
    const bizParam = params.get('businessId');
    if (!oauthState || (bizParam && bizParam !== business.id)) return;

    oauthCallbackHandledRef.current = true;
    const oauthErr = params.get('gbp_error');

    // Clean callback params from URL bar while staying on the portal/admin route
    params.delete('gbp_oauth');
    params.delete('gbp_error');
    params.delete('businessId');
    params.delete('accounts');
    const nextSearch = params.toString();
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
    window.history.replaceState({}, '', cleanUrl);

    if (oauthState === 'connected') {
      setConnNotice(
        'Google account authorized securely. Select your Google Business Profile account and location(s) below to enable review notifications.',
      );
      void handleLoadAccounts();
    } else if (oauthState === 'pending_api_approval') {
      setConnError(
        oauthErr ||
          'Google OAuth completed, but Google Business Profile API access/quota is still pending approval.',
      );
    } else if (oauthState === 'error') {
      setConnError(oauthErr || 'Google Business Profile OAuth did not complete.');
    }
  }, [business.id]);

  // Reset transient account/location picker state when switching between businesses
  useEffect(() => {
    setAccounts([]);
    setSelectedAccountName('');
    setDiscoveredLocations([]);
    setSelectedLocationNames([]);
    setTopicConflict(null);
  }, [business.id]);

  const handleCopyCallbackUrl = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopiedCallbackUrl(true);
      setTimeout(() => setCopiedCallbackUrl(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleConnectGoogleOAuth = async () => {
    setConnError(null);
    setConnNotice(null);
    setTopicConflict(null);
    setIsConnecting(true);
    try {
      const { authUrl } = await startServerGbpOAuth({
        businessId: business.id,
        returnPath: isAdmin ? '/admin' : '/portal',
      });
      window.location.assign(authUrl);
    } catch (err) {
      if (mountedRef.current) {
        setIsConnecting(false);
        setShowSetupGuide(true);
        setConnError(
          err instanceof Error ? err.message : 'Unable to initiate Google Business Profile OAuth.',
        );
      }
    }
  };

  const handleToggleLocation = (locName: string) => {
    setSelectedLocationNames((prev) =>
      prev.includes(locName) ? prev.filter((item) => item !== locName) : [...prev, locName],
    );
  };

  const handleSaveSelectedLocations = async (replaceExistingTopic = false) => {
    if (!selectedAccountName) {
      setConnError('Select a Google Business Profile account first.');
      return;
    }
    const chosen = discoveredLocations.filter((l) =>
      selectedLocationNames.includes(l.locationName),
    );
    if (chosen.length === 0) {
      setConnError('Select at least one business location before saving.');
      return;
    }

    setIsSavingSelection(true);
    setConnError(null);
    setConnNotice(null);
    try {
      const res = await selectServerGbpLocations({
        businessId: business.id,
        accountName: selectedAccountName,
        locations: chosen,
        replaceExistingTopic,
      });
      if (!mountedRef.current) return;

      if (res.notification.status === 'conflict') {
        setTopicConflict({
          existingTopic: res.notification.existingTopic || '',
          sharedTopic: res.notification.pubsubTopic,
          existingTypes: res.notification.existingTypes || [],
        });
        setConnNotice(
          `Saved ${chosen.length} selected location(s). Existing Pub/Sub topic was preserved without overwriting.`,
        );
      } else if (res.notification.status === 'error') {
        setTopicConflict(null);
        setConnNotice(`Saved ${chosen.length} selected location(s).`);
        setConnError(
          res.notification.errorMessage ||
            'Location saved, but enabling Google Pub/Sub notifications returned a warning.',
        );
      } else {
        setTopicConflict(null);
        setConnNotice(
          `Connected ${chosen.length} location(s) and enabled real-time NEW_REVIEW & UPDATED_REVIEW notifications on shared topic (${res.notification.pubsubTopic}).`,
        );
      }
    } catch (err) {
      if (mountedRef.current) {
        setConnError(
          err instanceof Error ? err.message : 'Unable to save selected GBP locations.',
        );
      }
    } finally {
      if (mountedRef.current) setIsSavingSelection(false);
    }
  };

  const handleDisconnect = async () => {
    setConnError(null);
    setConnNotice(null);
    setTopicConflict(null);
    setIsDisconnecting(true);
    try {
      await disconnectServerGbp(business.id);
      if (!mountedRef.current) return;
      setAccounts([]);
      setSelectedAccountName('');
      setDiscoveredLocations([]);
      setSelectedLocationNames([]);
      setConnNotice('Google Business Profile disconnected and OAuth tokens revoked.');
    } catch (err) {
      if (mountedRef.current) {
        setConnError(
          err instanceof Error ? err.message : 'Unable to disconnect Google Business Profile.',
        );
      }
    } finally {
      if (mountedRef.current) setIsDisconnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setConnError(null);
    setConnNotice(null);
    setIsSyncing(true);
    try {
      const res = await syncServerGbpReviews(business.id);
      if (!mountedRef.current) return;
      if (res.warnings && res.warnings.length > 0) {
        setConnError(res.warnings[0]);
      }
      setConnNotice(
        res.imported > 0
          ? `Synced ${res.imported} new Google review(s) and generated AI replies.`
          : 'Sync complete. All latest Google reviews are already in your queue.',
      );
    } catch (err) {
      if (mountedRef.current) {
        setConnError(err instanceof Error ? err.message : 'Unable to sync Google reviews.');
      }
    } finally {
      if (mountedRef.current) setIsSyncing(false);
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
      const replyText = (customText ?? rev.aiReplyText).trim();
      if (connection?.connectionStatus === 'connected' && connection.locationName) {
        await publishServerGbpReply({
          businessId: business.id,
          reviewId: rev.id,
          externalReviewId: rev.externalReviewId,
          replyText,
          locationName: connection.locationName,
        });
      } else {
        await approveAndPublishGbpReply({
          review: rev,
          editedText: replyText,
        });
      }
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
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
              {connection?.notificationStatus === 'enabled' && (
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-teal-50 text-teal-800">
                  Pub/Sub Review Notifications Active
                </span>
              )}
              {connection?.tokenStatus === 'expired_or_revoked' && (
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-700">
                  Authorization Expired · Reconnect Required
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              {connection?.locationTitle
                ? `${connection.locationTitle}${
                    connection.connectedEmail ? ` · Google account: ${connection.connectedEmail}` : ''
                  }`
                : allowOAuthConnection
                  ? 'Connect your Google Business Profile account securely to select business locations, enable real-time review notifications, and sync/reply to reviews.'
                  : 'Google Business Profile connection requires Full Self-Service portal access or Business Management admin authorization.'}
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
                        ? 'Redirecting to Google...'
                        : connection?.connectionStatus === 'connected'
                          ? 'Reconnect Google Account'
                          : 'Connect Google Business Profile'}
                    </span>
                  </button>

                  {connection?.connectionStatus === 'connected' && (
                    <>
                      <button
                        type="button"
                        disabled={isLoadingAccounts}
                        onClick={handleLoadAccounts}
                        className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        {isLoadingAccounts && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{accounts.length > 0 ? 'Refresh Accounts' : 'Select Locations'}</span>
                      </button>

                      {Boolean(connection.locationName || (connection.selectedLocations?.length ?? 0) > 0) && (
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={handleSyncNow}
                          className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                          <span>Sync Reviews</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isDisconnecting}
                        onClick={handleDisconnect}
                        className="px-3.5 py-2.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-xs font-semibold text-red-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        {isDisconnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unlink className="w-3.5 h-3.5" />
                        )}
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

        {/* Saved Locations & Pub/Sub Notification Summary */}
        {connection?.connectionStatus === 'connected' &&
          (connection.selectedLocations?.length || connection.locationName) && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800">
                  Connected Locations ({connection.selectedLocations?.length || 1})
                </span>
                <span className="text-slate-600">
                  Notifications:{' '}
                  <strong className="text-slate-900">
                    {connection.notificationStatus === 'enabled'
                      ? `${(connection.notificationTypes || ['NEW_REVIEW', 'UPDATED_REVIEW']).join(', ')}`
                      : connection.notificationStatus === 'conflict'
                        ? 'Existing external Pub/Sub topic kept'
                        : connection.notificationStatus === 'error'
                          ? 'Needs attention'
                          : 'Not configured yet'}
                  </strong>
                  {connection.notificationTopic ? ` · ${connection.notificationTopic}` : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(connection.selectedLocations && connection.selectedLocations.length > 0
                  ? connection.selectedLocations
                  : [
                      {
                        accountName: connection.accountName,
                        locationName: connection.locationName,
                        title: connection.locationTitle,
                        address: '',
                        storeCode: '',
                        placeId: connection.placeId,
                      },
                    ]
                ).map((loc) => (
                  <div
                    key={loc.locationName}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs space-y-0.5"
                  >
                    <p className="font-semibold text-slate-900">{loc.title}</p>
                    {loc.address && <p className="text-slate-600">{loc.address}</p>}
                    <p className="text-[11px] font-mono text-slate-500">
                      {loc.storeCode ? `Store: ${loc.storeCode} · ` : ''}
                      {loc.locationName}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Paginated Google Account & Location Selector */}
        {allowOAuthConnection && canEdit && accounts.length > 0 && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Choose Google Business Account &amp; Locations
                </h3>
                <p className="text-xs text-slate-600">
                  Select one or more business locations and click Save to enable real-time Google review notifications.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Account:
                </label>
                <select
                  value={selectedAccountName}
                  onChange={(e) => {
                    const nextAcc = e.target.value;
                    setSelectedAccountName(nextAcc);
                    void handleLoadLocationsForAccount(nextAcc);
                  }}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900"
                >
                  {accounts.map((acc) => (
                    <option key={acc.name} value={acc.name}>
                      {acc.accountName} ({acc.type} · {acc.verificationState})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isLoadingLocations ? (
              <div className="flex items-center gap-2 text-xs text-slate-600 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" />
                <span>Loading business locations from Google...</span>
              </div>
            ) : discoveredLocations.length === 0 ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No locations found under this Google Business account. Select another account above or verify your profile in Google Business Profile Manager.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {discoveredLocations.map((loc) => {
                    const checked = selectedLocationNames.includes(loc.locationName);
                    return (
                      <label
                        key={loc.locationName}
                        className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-teal-600 bg-white shadow-xs'
                            : 'border-slate-200 bg-white/80 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleLocation(loc.locationName)}
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-700"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-slate-900">{loc.title}</span>
                            {loc.hasVoiceOfMerchant === false && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                                Verification Pending
                              </span>
                            )}
                          </div>
                          {loc.address && <p className="text-slate-600">{loc.address}</p>}
                          <p className="text-[11px] font-mono text-slate-500">
                            {loc.storeCode ? `Store Code: ${loc.storeCode} · ` : ''}
                            {loc.locationName}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-slate-600">
                    {selectedLocationNames.length} of {discoveredLocations.length} location(s) selected
                  </span>
                  <button
                    type="button"
                    disabled={isSavingSelection || selectedLocationNames.length === 0}
                    onClick={() => handleSaveSelectedLocations(false)}
                    className="px-4 py-2 rounded-xl bg-[#0f766e] hover:bg-[#005c55] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingSelection && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Selected Locations &amp; Enable Review Notifications</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Conflict Protection Banner for Shared Google Account Pub/Sub Setting */}
        {topicConflict && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2.5">
            <p className="font-bold">
              Existing Google Pub/Sub Topic Detected (Preserved Automatically)
            </p>
            <p className="leading-relaxed">
              This Google Business account already publishes notifications to{' '}
              <span className="font-mono font-semibold">{topicConflict.existingTopic}</span>. ReviewFlow did not overwrite it. Would you like to switch notifications to ReviewFlow&apos;s shared topic ({topicConflict.sharedTopic})?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSavingSelection}
                onClick={() => handleSaveSelectedLocations(true)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-950 text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                Switch to ReviewFlow Shared Topic
              </button>
              <button
                type="button"
                onClick={() => setTopicConflict(null)}
                className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-semibold cursor-pointer"
              >
                Keep Existing Topic
              </button>
            </div>
          </div>
        )}

        {connError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>{connError}</span>
            </div>
            {allowOAuthConnection && (
              <button
                type="button"
                onClick={() => setShowSetupGuide((prev) => !prev)}
                className="text-[11px] font-semibold text-amber-950 underline shrink-0 cursor-pointer"
              >
                {showSetupGuide ? 'Hide Setup' : 'OAuth Setup'}
              </button>
            )}
          </div>
        )}

        {allowOAuthConnection && showSetupGuide && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3.5 text-xs text-slate-700 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#0f766e]" />
                <span>Server-Side Google Business Profile OAuth Configuration</span>
              </p>
              <button
                type="button"
                onClick={handleCopyCallbackUrl}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                {copiedCallbackUrl ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedCallbackUrl ? 'Callback URI Copied' : 'Copy Callback URI'}</span>
              </button>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-700 leading-relaxed">
              <li>
                In Google Cloud Console → <span className="font-semibold">Credentials → Web OAuth Client</span> →{' '}
                <span className="font-semibold">Authorized redirect URIs</span>, add:{' '}
                <span className="font-mono font-semibold text-slate-900 break-all">{callbackUrl}</span>
              </li>
              <li>
                In Vercel → <span className="font-semibold">Environment Variables</span> (Server-only, never{' '}
                <span className="font-mono">VITE_</span>), set{' '}
                <span className="font-mono font-semibold">GOOGLE_OAUTH_CLIENT_ID</span>,{' '}
                <span className="font-mono font-semibold">GOOGLE_OAUTH_CLIENT_SECRET</span>,{' '}
                <span className="font-mono font-semibold">GBP_TOKEN_ENCRYPTION_KEY</span>, and{' '}
                <span className="font-mono font-semibold">FIREBASE_SERVICE_ACCOUNT_JSON</span>.
              </li>
              <li>
                Enable <span className="font-semibold">My Business Account Management API</span>,{' '}
                <span className="font-semibold">My Business Business Information API</span>, and{' '}
                <span className="font-semibold">My Business Notifications API</span> in Google Cloud Console.
              </li>
            </ol>
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

            {currentOrigin && (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Webhook / Google Pub/Sub Push Endpoint
                  </p>
                  <p className="text-[11px] font-mono text-teal-800 truncate">
                    {`${currentOrigin}/api/webhooks/google-reviews`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(`${currentOrigin}/api/webhooks/google-reviews`)
                      .then(() => {
                        setQueueNotice('Copied webhook endpoint URL.');
                        setTimeout(() => setQueueNotice(null), 2500);
                      })
                      .catch(() => null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy URL</span>
                </button>
              </div>
            )}

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

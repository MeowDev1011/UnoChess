import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Crown,
  Edit3,
  FileText,
  Flag,
  Gavel,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AppealSanctionType,
  ModerationAppeal,
  ModerationLog,
  ModerationReport,
  PlayerProfile,
  SystemModerationConfig,
} from '../types/game';
import {
  adjustUserElo,
  banUserAccount,
  clearUserWarnings,
  demoteModeratorByUsername,
  forceRenameUser,
  isModerator,
  issueUserWarning,
  lookupPlayerByUsername,
  muteUserChat,
  pardonUserAccount,
  promoteModeratorByUsername,
  replyToModerationAppeal,
  resetUserStats,
  reviewModerationAppeal,
  submitAppealOnBehalfOfUser,
  subscribeAllAppeals,
  subscribeModerationLogs,
  subscribeModerationReports,
  subscribeRegisteredPlayers,
  suspendUserTemp,
  unmuteUserChat,
  updateReportStatus,
  updateSystemModerationConfig,
} from '../services/moderationChatService';
import { sound } from '../utils/audio';

interface ModerationConsoleModalProps {
  isOpen: boolean;
  actor: PlayerProfile | null;
  systemConfig: SystemModerationConfig | null;
  onClose: () => void;
}

type ModTab = 'users' | 'reports' | 'appeals' | 'system' | 'logs';

export const ModerationConsoleModal: React.FC<ModerationConsoleModalProps> = ({
  isOpen,
  actor,
  systemConfig,
  onClose,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ModTab>('users');

  // Real Firestore registered users & search state
  const [registeredPlayers, setRegisteredPlayers] = useState<PlayerProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetUser, setTargetUser] = useState<PlayerProfile | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [renameInput, setRenameInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // Live queues & logs
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [appeals, setAppeals] = useState<ModerationAppeal[]>([]);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [modNoteInput, setModNoteInput] = useState('');

  // Per-appeal response drafts & moderator appeal-for-user form
  const [appealReplyDrafts, setAppealReplyDrafts] = useState<Record<string, string>>({});
  const [appealTargetUid, setAppealTargetUid] = useState('');
  const [appealSanctionType, setAppealSanctionType] = useState<AppealSanctionType>('other');
  const [appealForUserReason, setAppealForUserReason] = useState('');

  // System safety config form
  const [slowModeSec, setSlowModeSec] = useState(0);
  const [wordFilter, setWordFilter] = useState(true);
  const [chatDisabled, setChatDisabled] = useState(false);
  const [bannerText, setBannerText] = useState('');

  useEffect(() => {
    if (!isOpen || !actor || !isModerator(actor)) return;
    const unsubP = subscribeRegisteredPlayers((list) => {
      setRegisteredPlayers(list);
      setTargetUser((prev) => {
        if (!prev) return null;
        return list.find((u) => u.uid === prev.uid) ?? prev;
      });
    });
    const unsubR = subscribeModerationReports(setReports);
    const unsubA = subscribeAllAppeals(setAppeals);
    const unsubL = subscribeModerationLogs(setLogs);
    return () => {
      unsubP();
      unsubR();
      unsubA();
      unsubL();
    };
  }, [actor, isOpen]);

  useEffect(() => {
    if (!systemConfig) return;
    setSlowModeSec(systemConfig.globalSlowModeSec);
    setWordFilter(systemConfig.wordFilterEnabled);
    setChatDisabled(systemConfig.chatDisabledGlobally);
    setBannerText(systemConfig.broadcastBanner);
  }, [systemConfig]);

  const otherRealUsers = useMemo(() => {
    if (!actor) return registeredPlayers;
    return registeredPlayers.filter((u) => u.uid !== actor.uid);
  }, [actor, registeredPlayers]);

  const filteredRealUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return registeredPlayers;
    return registeredPlayers.filter(
      (u) =>
        u.nickname.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        (u.lichessUsername && u.lichessUsername.toLowerCase().includes(q))
    );
  }, [registeredPlayers, searchQuery]);

  // Keep selected appealTargetUid synced to first available real user if unset
  useEffect(() => {
    if (otherRealUsers.length === 0) {
      setAppealTargetUid('');
      return;
    }
    if (!otherRealUsers.some((u) => u.uid === appealTargetUid)) {
      setAppealTargetUid(otherRealUsers[0].uid);
    }
  }, [appealTargetUid, otherRealUsers]);

  if (!isOpen || !actor || !isModerator(actor)) return null;

  const showToast = (msg: string) => {
    setErrMsg('');
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(''), 3000);
  };

  const handleSelectUser = (u: PlayerProfile) => {
    sound.playClick();
    setTargetUser(u);
    setRenameInput(u.nickname);
    setErrMsg('');
  };

  const handleLookup = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;
    sound.playClick();
    setSearching(true);
    setErrMsg('');
    setToastMsg('');
    try {
      const found = await lookupPlayerByUsername(q);
      if (!found) {
        setTargetUser(null);
        setErrMsg(t('modUserNotFound'));
      } else {
        setTargetUser(found);
        setRenameInput(found.nickname);
      }
    } catch {
      setErrMsg(t('modActionError'));
    } finally {
      setSearching(false);
    }
  };

  const runUserAction = async (fn: () => Promise<PlayerProfile>) => {
    if (busyAction) return;
    sound.playClick();
    setBusyAction(true);
    setErrMsg('');
    try {
      const updated = await fn();
      setTargetUser(updated);
      sound.playSpecial();
      showToast(t('modActionSuccess'));
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_NOT_FOUND') {
        setErrMsg(t('modUserNotFound'));
      } else {
        setErrMsg(t('modActionError'));
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handlePromoteInput = async () => {
    const q = (targetUser?.nickname || searchQuery).trim();
    if (!q) return;
    await runUserAction(() => promoteModeratorByUsername(actor, q));
  };

  const handleDemoteInput = async () => {
    const q = (targetUser?.nickname || searchQuery).trim();
    if (!q) return;
    await runUserAction(() => demoteModeratorByUsername(actor, q));
  };

  const handleCreateAppealForUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyAction) return;
    const chosenTarget = otherRealUsers.find((u) => u.uid === appealTargetUid);
    if (!chosenTarget) {
      setErrMsg(t('modNoOtherUsers'));
      return;
    }
    if (appealForUserReason.trim().length < 5) {
      setErrMsg(t('reportErrorShort'));
      return;
    }
    sound.playClick();
    setBusyAction(true);
    setErrMsg('');
    try {
      await submitAppealOnBehalfOfUser(
        actor,
        chosenTarget,
        appealSanctionType,
        appealForUserReason
      );
      sound.playSpecial();
      setAppealForUserReason('');
      showToast(t('modActionSuccess'));
    } catch {
      setErrMsg(t('modActionError'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleAppealDecision = async (
    apl: ModerationAppeal,
    decision: 'approved' | 'rejected'
  ) => {
    if (busyAction) return;
    setBusyAction(true);
    setErrMsg('');
    const noteText = (appealReplyDrafts[apl.id] ?? apl.reviewerNote ?? '').trim();
    try {
      if (decision === 'approved') sound.playSpecial();
      else sound.playClick();
      await reviewModerationAppeal(actor, apl, decision, noteText);
      showToast(t('modActionSuccess'));
    } catch {
      setErrMsg(t('modActionError'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveAppealReply = async (apl: ModerationAppeal) => {
    if (busyAction) return;
    const noteText = (appealReplyDrafts[apl.id] ?? apl.reviewerNote ?? '').trim();
    if (noteText.length < 2) {
      setErrMsg(t('reportErrorShort'));
      return;
    }
    sound.playClick();
    setBusyAction(true);
    setErrMsg('');
    try {
      await replyToModerationAppeal(actor, apl, noteText);
      sound.playSpecial();
      showToast(t('modAppealReplySaved'));
    } catch {
      setErrMsg(t('modActionError'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSystemConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyAction) return;
    sound.playClick();
    setBusyAction(true);
    setErrMsg('');
    try {
      await updateSystemModerationConfig(actor, {
        globalSlowModeSec: slowModeSec,
        wordFilterEnabled: wordFilter,
        chatDisabledGlobally: chatDisabled,
        broadcastBanner: bannerText,
      });
      sound.playSpecial();
      showToast(t('modActionSuccess'));
    } catch {
      setErrMsg(t('modActionError'));
    } finally {
      setBusyAction(false);
    }
  };

  const openReportsCount = reports.filter((r) => r.status === 'open').length;
  const pendingAppealsCount = appeals.filter((a) => a.status === 'pending').length;

  const tabs: { id: ModTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'users', label: t('modTabUsers'), icon: <Users className="h-3.5 w-3.5" /> },
    {
      id: 'reports',
      label: t('modTabReports'),
      icon: <Flag className="h-3.5 w-3.5" />,
      badge: openReportsCount,
    },
    {
      id: 'appeals',
      label: t('modTabAppeals'),
      icon: <Gavel className="h-3.5 w-3.5" />,
      badge: pendingAppealsCount,
    },
    { id: 'system', label: t('modTabSystem'), icon: <Settings className="h-3.5 w-3.5" /> },
    { id: 'logs', label: t('modTabLogs'), icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  const roleBadge = (role: PlayerProfile['role']) => {
    if (role === 'founder') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-950">
          <Crown className="h-3 w-3" />
          {t('modRoleFounder')}
        </span>
      );
    }
    if (role === 'moderator') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-400 px-2 py-0.5 text-[10px] font-extrabold text-slate-950">
          <Shield className="h-3 w-3" />
          {t('modRoleModerator')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-extrabold text-slate-200">
        {t('modRoleUser')}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('modConsoleTitle')}
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-4 border-slate-950 bg-slate-900 shadow-[0_18px_56px_rgba(0,0,0,0.9)]">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-slate-800 bg-slate-950/85 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-extrabold text-white">{t('modConsoleTitle')}</h2>
            {roleBadge(actor.role)}
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-5 border-b-2 border-slate-800 bg-slate-950/50">
          {tabs.map((tb) => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  setTab(tb.id);
                }}
                className={`relative flex min-h-[40px] items-center justify-center gap-1 px-1 text-[11px] font-extrabold transition ${
                  active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tb.icon}
                <span className="truncate">{tb.label}</span>
                {tb.badge !== undefined && tb.badge > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-extrabold text-white tabular-nums">
                    {tb.badge}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Feedback Banner */}
        {(toastMsg || errMsg) && (
          <div
            className={`px-4 py-1.5 text-center text-xs font-extrabold ${
              errMsg
                ? 'bg-rose-950/90 text-rose-200'
                : 'bg-emerald-950/90 text-emerald-200'
            }`}
          >
            {errMsg || toastMsg}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {tab === 'users' && (
            <div className="space-y-3">
              {/* Lookup + Quick Promote by Username */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleLookup();
                    }
                  }}
                  placeholder={t('modSearchPlaceholder')}
                  className="min-h-[40px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-bold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={searching || !searchQuery.trim()}
                  onClick={() => void handleLookup()}
                  className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-3 text-xs font-extrabold text-slate-950 disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>{t('modSearchBtn')}</span>
                </button>
              </div>

              {/* Direct Promote / Demote by Username */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busyAction || !(targetUser?.nickname || searchQuery.trim())}
                  onClick={() => void handlePromoteInput()}
                  className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-sky-500/60 bg-sky-950/70 px-2 text-xs font-extrabold text-sky-200 transition hover:bg-sky-900/70 disabled:opacity-40"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span className="truncate">{t('modPromoteModBtn')}</span>
                </button>
                <button
                  type="button"
                  disabled={busyAction || !(targetUser?.nickname || searchQuery.trim())}
                  onClick={() => void handleDemoteInput()}
                  className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-2 text-xs font-extrabold text-slate-200 transition hover:bg-slate-700 disabled:opacity-40"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  <span className="truncate">{t('modDemoteModBtn')}</span>
                </button>
              </div>

              {/* Real Registered Users Directory (Zero fake data; honest empty state) */}
              <div className="space-y-1.5 rounded-2xl border border-slate-800 bg-slate-950/55 p-2.5">
                <div className="flex items-center justify-between text-[11px] font-extrabold text-amber-300">
                  <span>{t('modUsersListTitle', { count: filteredRealUsers.length })}</span>
                </div>
                {filteredRealUsers.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">
                    {registeredPlayers.length === 0
                      ? t('modNoUsersFound')
                      : t('modUserNotFound')}
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {filteredRealUsers.map((u) => {
                      const isSel = targetUser?.uid === u.uid;
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => handleSelectUser(u)}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition ${
                            isSel
                              ? 'border-amber-400 bg-amber-400/15'
                              : 'border-slate-800 bg-slate-900/80 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-extrabold text-white">
                              {u.nickname}
                            </span>
                            {roleBadge(u.role)}
                            {u.banned && (
                              <span className="rounded bg-rose-500 px-1 py-0.2 text-[9px] font-extrabold text-white">
                                BAN
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] font-bold text-slate-400 tabular-nums">
                            {u.elo} Elo · {u.wins}/{u.losses}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {targetUser && (
                <div className="space-y-3 rounded-2xl border-2 border-slate-800 bg-slate-950/75 p-3">
                  {/* Target User Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-white">
                          {targetUser.nickname}
                        </span>
                        {roleBadge(targetUser.role)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-slate-400 tabular-nums">
                        <span>Elo: {targetUser.elo}</span>
                        <span>W/L: {targetUser.wins}/{targetUser.losses}</span>
                        <span>Warns: {targetUser.warningsCount ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {targetUser.banned && (
                        <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                          BANNED
                        </span>
                      )}
                      {(targetUser.suspendedUntilMs ?? 0) > Date.now() && (
                        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                          SUSPENDED
                        </span>
                      )}
                      {(targetUser.chatMuted || (targetUser.mutedUntilMs ?? 0) > Date.now()) && (
                        <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                          MUTED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reason Input */}
                  <input
                    type="text"
                    maxLength={200}
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    placeholder={t('modReasonPlaceholder')}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />

                  {/* Per-User Moderation Actions Grid */}
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => issueUserWarning(actor, targetUser, reasonInput))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-amber-500/50 bg-amber-950/60 px-2 text-[11px] font-extrabold text-amber-200 hover:bg-amber-900/60"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionWarn')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => clearUserWarnings(actor, targetUser))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 text-[11px] font-extrabold text-slate-200 hover:bg-slate-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionClearWarn')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => muteUserChat(actor, targetUser, 15, reasonInput))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-sky-500/50 bg-sky-950/60 px-2 text-[11px] font-extrabold text-sky-200 hover:bg-sky-900/60"
                    >
                      <VolumeX className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionMute15')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => muteUserChat(actor, targetUser, 1440, reasonInput))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-sky-500/50 bg-sky-950/60 px-2 text-[11px] font-extrabold text-sky-200 hover:bg-sky-900/60"
                    >
                      <VolumeX className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionMute24h')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        void runUserAction(() => muteUserChat(actor, targetUser, 'permanent', reasonInput))
                      }
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-rose-500/50 bg-rose-950/60 px-2 text-[11px] font-extrabold text-rose-200 hover:bg-rose-900/60"
                    >
                      <VolumeX className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionMutePerm')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => unmuteUserChat(actor, targetUser))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-emerald-500/50 bg-emerald-950/60 px-2 text-[11px] font-extrabold text-emerald-200 hover:bg-emerald-900/60"
                    >
                      <Volume2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionUnmute')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => suspendUserTemp(actor, targetUser, 24, reasonInput))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-amber-500/60 bg-amber-950/75 px-2 text-[11px] font-extrabold text-amber-200 hover:bg-amber-900/75"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionSuspend24h')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => banUserAccount(actor, targetUser, reasonInput))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-rose-500 bg-rose-600 px-2 text-[11px] font-extrabold text-white hover:brightness-105"
                    >
                      <Ban className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionBan')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => pardonUserAccount(actor, targetUser))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-emerald-500 bg-emerald-600 px-2 text-[11px] font-extrabold text-white hover:brightness-105"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionPardon')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => adjustUserElo(actor, targetUser, 25))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 text-[11px] font-extrabold text-emerald-300 hover:bg-slate-700"
                    >
                      <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionEloPlus')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => adjustUserElo(actor, targetUser, -25))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 text-[11px] font-extrabold text-rose-300 hover:bg-slate-700"
                    >
                      <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionEloMinus')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void runUserAction(() => resetUserStats(actor, targetUser))}
                      className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 text-[11px] font-extrabold text-amber-200 hover:bg-slate-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('modActionResetStats')}</span>
                    </button>

                    {targetUser.uid !== actor.uid && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => {
                          sound.playClick();
                          setAppealTargetUid(targetUser.uid);
                          setTab('appeals');
                        }}
                        className="col-span-2 flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-sky-400/70 bg-sky-500/20 px-2 text-[11px] font-extrabold text-sky-200 hover:bg-sky-500/30 sm:col-span-3"
                      >
                        <Gavel className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t('modAppealForUserBtn')}</span>
                      </button>
                    )}
                  </div>

                  {/* Force Rename Action */}
                  <div className="flex gap-2 border-t border-slate-800 pt-2">
                    <input
                      type="text"
                      maxLength={20}
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      className="min-h-[36px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-white"
                    />
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        void runUserAction(() => forceRenameUser(actor, targetUser, renameInput))
                      }
                      className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl border border-amber-400/70 bg-amber-400/20 px-3 text-[11px] font-extrabold text-amber-200"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>{t('modActionForceRename')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'reports' && (
            <div className="space-y-2.5">
              <input
                type="text"
                maxLength={200}
                value={modNoteInput}
                onChange={(e) => setModNoteInput(e.target.value)}
                placeholder={t('modReasonPlaceholder')}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white placeholder-slate-500"
              />
              {reports.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">{t('modReportsEmpty')}</p>
              ) : (
                reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/75 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-rose-300">
                        {rep.category}
                      </span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                        {rep.status}
                      </span>
                    </div>
                    <div className="font-bold text-slate-300">
                      {rep.reporterNickname} →{' '}
                      <span className="text-white">{rep.targetNickname || '—'}</span>
                    </div>
                    {rep.messageExcerpt && (
                      <div className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] italic text-slate-400">
                        “{rep.messageExcerpt}”
                      </div>
                    )}
                    <p className="text-slate-200">{rep.description}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(rep.targetNickname || rep.targetUid) && (
                        <button
                          type="button"
                          onClick={() => {
                            const q = rep.targetNickname || rep.targetUid;
                            setSearchQuery(q);
                            setTab('users');
                            void handleLookup(q);
                          }}
                          className="rounded-lg border border-amber-400/60 bg-amber-400/15 px-2 py-1 text-[10px] font-extrabold text-amber-200"
                        >
                          {t('modSearchBtn')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void updateReportStatus(actor, rep.id, 'in_review', modNoteInput)}
                        className="rounded-lg border border-sky-500/50 bg-sky-950/60 px-2 py-1 text-[10px] font-extrabold text-sky-200"
                      >
                        {t('modReportInReview')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateReportStatus(actor, rep.id, 'resolved', modNoteInput)}
                        className="rounded-lg border border-emerald-500/50 bg-emerald-950/60 px-2 py-1 text-[10px] font-extrabold text-emerald-200"
                      >
                        {t('modReportResolve')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateReportStatus(actor, rep.id, 'dismissed', modNoteInput)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-extrabold text-slate-300"
                      >
                        {t('modReportDismiss')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'appeals' && (
            <div className="space-y-3">
              {/* Open an Appeal on Behalf of Another Real User */}
              <form
                onSubmit={handleCreateAppealForUser}
                className="space-y-2 rounded-2xl border border-sky-500/40 bg-slate-950/75 p-3 text-xs"
              >
                <div className="flex items-center gap-1.5 font-extrabold text-sky-300">
                  <Gavel className="h-3.5 w-3.5" />
                  <span>{t('modAppealForUserTitle')}</span>
                </div>
                {otherRealUsers.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-slate-500">
                    {t('modNoOtherUsers')}
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={appealTargetUid}
                        onChange={(e) => setAppealTargetUid(e.target.value)}
                        className="min-h-[36px] rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                      >
                        {otherRealUsers.map((u) => (
                          <option key={u.uid} value={u.uid}>
                            {u.nickname} ({u.elo} Elo)
                          </option>
                        ))}
                      </select>
                      <select
                        value={appealSanctionType}
                        onChange={(e) =>
                          setAppealSanctionType(e.target.value as AppealSanctionType)
                        }
                        className="min-h-[36px] rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
                      >
                        <option value="ban">{t('appealsTypeBan')}</option>
                        <option value="suspension">{t('appealsTypeSuspension')}</option>
                        <option value="mute">{t('appealsTypeMute')}</option>
                        <option value="warning">{t('appealsTypeWarning')}</option>
                        <option value="other">{t('appealsTypeOther')}</option>
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={appealForUserReason}
                      onChange={(e) => setAppealForUserReason(e.target.value)}
                      placeholder={t('modAppealReasonPlaceholder')}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs font-semibold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busyAction}
                      className="flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-sky-400 px-3 text-xs font-extrabold text-slate-950 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{t('modAppealSubmitForUser')}</span>
                    </button>
                  </>
                )}
              </form>

              {/* Appeals Queue + Per-Appeal Written Response */}
              {appeals.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">{t('appealsEmpty')}</p>
              ) : (
                appeals.map((apl) => {
                  const draftValue = appealReplyDrafts[apl.id] ?? apl.reviewerNote ?? '';
                  return (
                    <div
                      key={apl.id}
                      className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/75 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-white">{apl.appellantNickname}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-300">
                          {apl.sanctionType} · {apl.status}
                        </span>
                      </div>
                      <p className="text-slate-200">{apl.reason}</p>

                      {apl.reviewerNote && (
                        <div className="rounded-xl border border-sky-500/40 bg-sky-950/40 px-2.5 py-1.5 text-[11px] text-sky-200">
                          <span className="font-extrabold text-sky-300">
                            {apl.reviewerNickname || t('modRoleModerator')}:{' '}
                          </span>
                          <span>{apl.reviewerNote}</span>
                        </div>
                      )}

                      <div className="flex gap-1.5 pt-1">
                        <input
                          type="text"
                          maxLength={300}
                          value={draftValue}
                          onChange={(e) =>
                            setAppealReplyDrafts((prev) => ({
                              ...prev,
                              [apl.id]: e.target.value,
                            }))
                          }
                          placeholder={t('modReplyPlaceholder')}
                          className="min-h-[34px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleSaveAppealReply(apl)}
                          className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-xl border border-sky-500/60 bg-sky-950/70 px-2.5 text-[11px] font-extrabold text-sky-200 hover:bg-sky-900/70 disabled:opacity-50"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span>{t('modRespondUpdateBtn')}</span>
                        </button>
                      </div>

                      {apl.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleAppealDecision(apl, 'approved')}
                            className="flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-500 bg-emerald-600 px-2 text-[11px] font-extrabold text-white disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{t('modAppealApprove')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleAppealDecision(apl, 'rejected')}
                            className="flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-xl border border-rose-500 bg-rose-600 px-2 text-[11px] font-extrabold text-white disabled:opacity-50"
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                            <span>{t('modAppealReject')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'system' && (
            <form onSubmit={handleSaveSystemConfig} className="space-y-3 text-xs">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                <label className="mb-1 block font-extrabold text-amber-300">
                  {t('modSystemSlowMode')} ({slowModeSec}s)
                </label>
                <input
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={slowModeSec}
                  onChange={(e) => setSlowModeSec(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-400"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3 font-extrabold text-slate-200">
                <span>{t('modSystemWordFilter')}</span>
                <input
                  type="checkbox"
                  checked={wordFilter}
                  onChange={(e) => setWordFilter(e.target.checked)}
                  className="h-4 w-4 accent-amber-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-3 font-extrabold text-rose-200">
                <span>{t('modSystemDisableChat')}</span>
                <input
                  type="checkbox"
                  checked={chatDisabled}
                  onChange={(e) => setChatDisabled(e.target.checked)}
                  className="h-4 w-4 accent-rose-500"
                />
              </label>

              <div>
                <label className="mb-1 block font-extrabold text-amber-300">
                  {t('modSystemBannerLabel')}
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                />
              </div>

              <button
                type="submit"
                disabled={busyAction}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-950 bg-amber-400 px-4 text-xs font-extrabold text-slate-950 shadow-[0_3px_0_#0f172a]"
              >
                <Check className="h-4 w-4" />
                <span>{t('modSystemSaveBtn')}</span>
              </button>
            </form>
          )}

          {tab === 'logs' && (
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">{t('modLogsEmpty')}</p>
              ) : (
                logs.map((lg) => (
                  <div
                    key={lg.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-amber-300">{lg.action}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {new Date(lg.createdAtMs || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="font-bold text-slate-300">
                      {lg.actorNickname} → {lg.targetNickname || lg.targetUid || '—'}
                    </div>
                    {lg.details && <div className="text-slate-400">{lg.details}</div>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

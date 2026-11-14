import React, { useEffect, useRef, useState } from 'react';
import {
  Crown,
  Flag,
  MessageSquare,
  Send,
  Shield,
  ShieldAlert,
  Trash2,
  VolumeX,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  MatchChatMessage,
  PlayerProfile,
  SystemModerationConfig,
} from '../types/game';
import {
  isModerator,
  isPlayerChatMuted,
  lookupPlayerByUsername,
  moderateDeleteChatMessage,
  muteUserChat,
  sendMatchChatMessage,
} from '../services/moderationChatService';
import { sound } from '../utils/audio';

interface MatchChatModalProps {
  isOpen: boolean;
  matchId: string | null;
  profile: PlayerProfile | null;
  opponentName: string;
  messages: MatchChatMessage[];
  systemConfig: SystemModerationConfig | null;
  onClose: () => void;
  onReportMessage: (msg: MatchChatMessage) => void;
  onOpenAppeals: () => void;
}

export const MatchChatModal: React.FC<MatchChatModalProps> = ({
  isOpen,
  matchId,
  profile,
  opponentName,
  messages,
  systemConfig,
  onClose,
  onReportMessage,
  onOpenAppeals,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [slowCooldownLeft, setSlowCooldownLeft] = useState(0);
  const [busyMsgId, setBusyMsgId] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const lastSentAtRef = useRef<number>(0);

  const wordFilterEnabled = systemConfig?.wordFilterEnabled ?? true;
  const chatDisabledGlobally = Boolean(systemConfig?.chatDisabledGlobally) && !isModerator(profile);
  const slowModeSec = isModerator(profile) ? 0 : systemConfig?.globalSlowModeSec ?? 0;
  const muted = isPlayerChatMuted(profile) || Boolean(profile?.banned);

  useEffect(() => {
    if (!isOpen) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (slowCooldownLeft <= 0) return;
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastSentAtRef.current) / 1000);
      const left = Math.max(0, slowModeSec - elapsed);
      setSlowCooldownLeft(left);
    }, 250);
    return () => clearInterval(id);
  }, [slowCooldownLeft, slowModeSec]);

  if (!isOpen || !matchId) return null;

  const canSend =
    Boolean(profile) &&
    !muted &&
    !chatDisabledGlobally &&
    slowCooldownLeft <= 0 &&
    !sending;

  const sendText = async (textToSend: string) => {
    if (!profile || !matchId || !canSend) return;
    const trimmed = textToSend.trim();
    if (!trimmed) return;
    sound.playClick();
    setSending(true);
    setErrorMsg('');
    try {
      await sendMatchChatMessage(matchId, profile, trimmed, { wordFilterEnabled });
      lastSentAtRef.current = Date.now();
      if (slowModeSec > 0) setSlowCooldownLeft(slowModeSec);
      setDraft('');
    } catch (err) {
      if (err instanceof Error && err.message === 'PLAYER_MUTED') {
        setErrorMsg(t('chatMutedNotice'));
      } else {
        setErrorMsg(t('onlineConnectionLost'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendText(draft);
  };

  const handleModDelete = async (msg: MatchChatMessage) => {
    if (!profile || !isModerator(profile) || busyMsgId) return;
    sound.playClick();
    setBusyMsgId(msg.id);
    try {
      await moderateDeleteChatMessage(profile, matchId, msg.id, `[${t('chatModeratedLabel')}]`);
    } catch {
      setErrorMsg(t('modActionError'));
    } finally {
      setBusyMsgId(null);
    }
  };

  const handleQuickMuteSender = async (msg: MatchChatMessage) => {
    if (!profile || !isModerator(profile) || busyMsgId) return;
    if (msg.senderUid === profile.uid) return;
    sound.playClick();
    setBusyMsgId(msg.id);
    try {
      const target = await lookupPlayerByUsername(msg.senderUid);
      if (target) {
        await muteUserChat(profile, target, 15, `Chat ${matchId}`);
      }
    } catch {
      setErrorMsg(t('modActionError'));
    } finally {
      setBusyMsgId(null);
    }
  };

  const quickPhrases = [
    t('chatQuickGoodLuck'),
    t('chatQuickGoodMove'),
    t('chatQuickThanks'),
    t('chatQuickRematch'),
  ];

  const amMod = isModerator(profile);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('chatTitle')}
    >
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border-4 border-slate-950 bg-slate-900 shadow-[0_16px_48px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-slate-800 bg-slate-950/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-5 w-5 shrink-0 text-sky-400" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-extrabold text-white">{t('chatTitle')}</h2>
              <p className="truncate text-[11px] font-semibold text-slate-400">
                vs. {opponentName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            aria-label={t('understood')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 transition hover:border-amber-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status / Sanction Banner */}
        {(muted || chatDisabledGlobally || slowModeSec > 0) && (
          <div className="border-b border-slate-800 bg-slate-950/80 px-3.5 py-2 text-xs">
            {muted && (
              <div className="flex items-center justify-between gap-2 font-bold text-rose-300">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {t('chatMutedNotice')}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAppeals();
                  }}
                  className="shrink-0 rounded-lg border border-amber-400/70 bg-amber-400/20 px-2 py-0.5 text-[11px] font-extrabold text-amber-200"
                >
                  {t('appealsBtn')}
                </button>
              </div>
            )}
            {!muted && chatDisabledGlobally && (
              <div className="font-bold text-amber-300">{t('chatDisabledNotice')}</div>
            )}
            {!muted && !chatDisabledGlobally && slowModeSec > 0 && (
              <div className="font-semibold text-sky-300">
                {t('chatSlowModeHint', { sec: slowCooldownLeft > 0 ? slowCooldownLeft : slowModeSec })}
              </div>
            )}
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 space-y-2 overflow-y-auto px-3.5 py-3">
          {messages.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-center text-xs font-semibold text-slate-500">
              {t('chatEmpty')}
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = profile?.uid === msg.senderUid;
              const timeStr = new Date(msg.createdAtMs || Date.now()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl border px-3 py-2 text-xs shadow-sm ${
                      msg.deleted
                        ? 'border-slate-700 bg-slate-950/60 italic text-slate-400'
                        : isMine
                        ? 'border-sky-500/50 bg-sky-950/75 text-white'
                        : 'border-slate-700 bg-slate-800/90 text-slate-100'
                    }`}
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1 font-extrabold">
                        {msg.senderRole === 'founder' && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-400 px-1 py-0.2 text-[9px] text-slate-950">
                            <Crown className="h-2.5 w-2.5" />
                            {t('modRoleFounder')}
                          </span>
                        )}
                        {msg.senderRole === 'moderator' && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-sky-400 px-1 py-0.2 text-[9px] text-slate-950">
                            <Shield className="h-2.5 w-2.5" />
                            {t('modRoleModerator')}
                          </span>
                        )}
                        <span className={isMine ? 'text-sky-300' : 'text-amber-300'}>
                          {msg.senderNickname}
                        </span>
                      </div>
                      <span className="font-mono text-[9px] text-slate-400">{timeStr}</span>
                    </div>

                    <p className="break-words leading-relaxed">{msg.text}</p>

                    {!msg.deleted && (
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        {!isMine && (
                          <button
                            type="button"
                            onClick={() => {
                              sound.playClick();
                              onReportMessage(msg);
                            }}
                            title={t('chatReportMsgBtn')}
                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-rose-950/70 hover:text-rose-300"
                          >
                            <Flag className="h-2.5 w-2.5" />
                            <span>{t('chatReportMsgBtn')}</span>
                          </button>
                        )}
                        {amMod && (
                          <>
                            <button
                              type="button"
                              disabled={busyMsgId === msg.id}
                              onClick={() => void handleModDelete(msg)}
                              title={t('chatDeleteMsgBtn')}
                              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-rose-300 transition hover:bg-rose-950/80 disabled:opacity-50"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                              <span>{t('chatDeleteMsgBtn')}</span>
                            </button>
                            {!isMine && (
                              <button
                                type="button"
                                disabled={busyMsgId === msg.id}
                                onClick={() => void handleQuickMuteSender(msg)}
                                title={t('modActionMute15')}
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-300 transition hover:bg-amber-950/80 disabled:opacity-50"
                              >
                                <VolumeX className="h-2.5 w-2.5" />
                                <span>15m</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>

        {/* Quick Phrases */}
        <div className="flex flex-wrap gap-1.5 border-t border-slate-800 bg-slate-950/50 px-3 py-2">
          {quickPhrases.map((phrase) => (
            <button
              key={phrase}
              type="button"
              disabled={!canSend}
              onClick={() => void sendText(phrase)}
              className="rounded-xl border border-slate-700 bg-slate-800/90 px-2.5 py-1 text-[11px] font-bold text-amber-200 transition hover:border-amber-400 disabled:opacity-40"
            >
              {phrase}
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="bg-rose-950/90 px-3 py-1.5 text-center text-[11px] font-bold text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t-2 border-slate-800 bg-slate-950/90 p-2.5"
        >
          <input
            type="text"
            maxLength={300}
            value={draft}
            disabled={muted || chatDisabledGlobally}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('chatPlaceholder')}
            className="min-h-[40px] flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend || !draft.trim()}
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-sky-400 px-3.5 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{t('chatSend')}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

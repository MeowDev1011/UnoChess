import React, { useEffect, useState } from 'react';
import { CheckCircle2, Gavel, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppealSanctionType, ModerationAppeal, PlayerProfile } from '../types/game';
import {
  isPlayerChatMuted,
  isPlayerSuspended,
  subscribeMyAppeals,
  submitModerationAppeal,
} from '../services/moderationChatService';
import { sound } from '../utils/audio';

interface AppealsModalProps {
  isOpen: boolean;
  profile: PlayerProfile | null;
  onClose: () => void;
}

export const AppealsModal: React.FC<AppealsModalProps> = ({
  isOpen,
  profile,
  onClose,
}) => {
  const { t } = useTranslation();
  const [sanctionType, setSanctionType] = useState<AppealSanctionType>('ban');
  const [reason, setReason] = useState('');
  const [myAppeals, setMyAppeals] = useState<ModerationAppeal[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen || !profile?.uid) return;
    if (profile.banned) setSanctionType('ban');
    else if (isPlayerSuspended(profile)) setSanctionType('suspension');
    else if (isPlayerChatMuted(profile)) setSanctionType('mute');
    else if ((profile.warningsCount ?? 0) > 0) setSanctionType('warning');
    else setSanctionType('other');

    const unsub = subscribeMyAppeals(profile.uid, setMyAppeals);
    return () => unsub();
  }, [isOpen, profile]);

  if (!isOpen || !profile) return null;

  const isBanned = Boolean(profile.banned);
  const isSuspended = isPlayerSuspended(profile);
  const isMuted = isPlayerChatMuted(profile);
  const warnings = profile.warningsCount ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setErrorMsg(t('reportErrorShort'));
      return;
    }
    sound.playClick();
    setSubmitting(true);
    setErrorMsg('');
    setFeedback('');
    try {
      await submitModerationAppeal(profile, sanctionType, reason);
      sound.playSpecial();
      setReason('');
      setFeedback(t('appealsSubmitted'));
    } catch {
      setErrorMsg(t('modActionError'));
    } finally {
      setSubmitting(false);
    }
  };

  const sanctionOptions: { id: AppealSanctionType; label: string }[] = [
    { id: 'ban', label: t('appealsTypeBan') },
    { id: 'suspension', label: t('appealsTypeSuspension') },
    { id: 'mute', label: t('appealsTypeMute') },
    { id: 'warning', label: t('appealsTypeWarning') },
    { id: 'other', label: t('appealsTypeOther') },
  ];

  const statusBadge = (st: ModerationAppeal['status']) => {
    if (st === 'approved') {
      return 'border-emerald-500/60 bg-emerald-950/80 text-emerald-300';
    }
    if (st === 'rejected') {
      return 'border-rose-500/60 bg-rose-950/80 text-rose-300';
    }
    return 'border-amber-400/60 bg-amber-950/80 text-amber-200';
  };

  const statusLabel = (st: ModerationAppeal['status']) => {
    if (st === 'approved') return t('appealStatusApproved');
    if (st === 'rejected') return t('appealStatusRejected');
    return t('appealStatusPending');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('appealsTitle')}
    >
      <div className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border-4 border-slate-950 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-slate-800 bg-slate-950/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-400" />
            <h2 className="text-sm font-extrabold text-white">{t('appealsTitle')}</h2>
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

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* Active Sanction Banners */}
          {(isBanned || isSuspended || isMuted || warnings > 0) && (
            <div className="space-y-1.5 rounded-2xl border-2 border-rose-500/70 bg-rose-950/60 p-3 text-xs font-bold text-rose-200">
              {isBanned && (
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{t('appealSanctionBannerBanned')}</span>
                </div>
              )}
              {isSuspended && (
                <div className="flex items-center gap-1.5 text-amber-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>{t('appealSanctionBannerSuspended')}</span>
                </div>
              )}
              {isMuted && (
                <div className="flex items-center gap-1.5 text-sky-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-sky-400" />
                  <span>{t('appealSanctionBannerMuted')}</span>
                </div>
              )}
              {warnings > 0 && (
                <div className="text-[11px] text-amber-300">
                  {t('appealSanctionBannerWarned', { count: warnings })}
                </div>
              )}
              {profile.sanctionReason && (
                <div className="text-[11px] font-semibold text-slate-200">
                  “{profile.sanctionReason}”
                </div>
              )}
            </div>
          )}

          <p className="text-xs leading-relaxed text-slate-300">{t('appealsDesc')}</p>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="mb-1 block text-xs font-extrabold text-amber-300">
                {t('appealsSanctionType')}
              </label>
              <select
                value={sanctionType}
                onChange={(e) => setSanctionType(e.target.value as AppealSanctionType)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-amber-400 focus:outline-none"
              >
                {sanctionOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={3}
              maxLength={500}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('appealsReasonPlaceholder')}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs font-semibold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />

            {feedback && (
              <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/60 bg-emerald-950/70 px-3 py-2 text-xs font-bold text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{feedback}</span>
              </div>
            )}
            {errorMsg && <p className="text-xs font-bold text-rose-400">{errorMsg}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-950 bg-amber-400 px-4 text-xs font-extrabold text-slate-950 shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              <Gavel className="h-4 w-4" />
              <span>{t('appealsSubmitBtn')}</span>
            </button>
          </form>

          {/* My Submitted Appeals */}
          <div className="border-t border-slate-800 pt-3">
            <h3 className="mb-2 text-xs font-extrabold text-amber-300">{t('appealsMyList')}</h3>
            {myAppeals.length === 0 ? (
              <p className="text-center text-xs text-slate-500">{t('appealsEmpty')}</p>
            ) : (
              <div className="space-y-2">
                {myAppeals.map((apl) => (
                  <div
                    key={apl.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/70 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-200 uppercase">
                        {apl.sanctionType}
                      </span>
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-[10px] font-extrabold ${statusBadge(
                          apl.status
                        )}`}
                      >
                        {statusLabel(apl.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-300">{apl.reason}</p>
                    {apl.reviewerNote && (
                      <div className="mt-2 rounded-xl border border-sky-500/40 bg-sky-950/50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200">
                        <div className="text-[10px] font-extrabold text-sky-300">
                          {t('appealsModeratorReply', {
                            mod: apl.reviewerNickname || t('modRoleModerator'),
                          })}
                        </div>
                        <p className="mt-0.5 text-slate-100">{apl.reviewerNote}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Bug, CheckCircle2, Flag, MessageSquareWarning, UserX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerProfile, ReportCategory } from '../types/game';
import { submitModerationReport } from '../services/moderationChatService';
import { sound } from '../utils/audio';

export interface ReportContextPrefill {
  category?: ReportCategory;
  targetUid?: string;
  targetNickname?: string;
  matchId?: string;
  messageId?: string;
  messageExcerpt?: string;
}

interface ReportModalProps {
  isOpen: boolean;
  profile: PlayerProfile | null;
  prefill?: ReportContextPrefill | null;
  onClose: () => void;
  onOpenLobbyForAccount?: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  profile,
  prefill,
  onClose,
  onOpenLobbyForAccount,
}) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ReportCategory>('behavior');
  const [targetNickname, setTargetNickname] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategory(prefill?.category ?? 'behavior');
    setTargetNickname(prefill?.targetNickname ?? '');
    setDescription('');
    setErrorMsg('');
    setSubmittedId(null);
  }, [isOpen, prefill]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      setErrorMsg(t('reportNeedAccount'));
      return;
    }
    if (description.trim().length < 5) {
      setErrorMsg(t('reportErrorShort'));
      return;
    }
    sound.playClick();
    setSubmitting(true);
    setErrorMsg('');
    try {
      const id = await submitModerationReport(profile, {
        category,
        targetUid: prefill?.targetUid ?? '',
        targetNickname: targetNickname.trim(),
        matchId: prefill?.matchId ?? '',
        messageId: prefill?.messageId ?? '',
        messageExcerpt: prefill?.messageExcerpt ?? '',
        description,
      });
      sound.playSpecial();
      setSubmittedId(id);
    } catch (err) {
      if (err instanceof Error && err.message === 'DESCRIPTION_TOO_SHORT') {
        setErrorMsg(t('reportErrorShort'));
      } else {
        setErrorMsg(t('modActionError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const categories: { id: ReportCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'behavior', label: t('reportCatBehavior'), icon: <UserX className="h-3.5 w-3.5" /> },
    { id: 'chat', label: t('reportCatChat'), icon: <MessageSquareWarning className="h-3.5 w-3.5" /> },
    { id: 'bug', label: t('reportCatBug'), icon: <Bug className="h-3.5 w-3.5" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('reportTitle')}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border-4 border-slate-950 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-slate-800 bg-slate-950/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-rose-400" />
            <h2 className="text-sm font-extrabold text-white">{t('reportTitle')}</h2>
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

        <div className="p-4">
          {!profile ? (
            <div className="space-y-3 text-center">
              <p className="text-xs font-semibold leading-relaxed text-slate-300">
                {t('reportNeedAccount')}
              </p>
              {onOpenLobbyForAccount && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLobbyForAccount();
                  }}
                  className="min-h-[42px] w-full rounded-2xl border-2 border-slate-950 bg-amber-400 px-4 text-xs font-extrabold text-slate-950"
                >
                  {t('onlineLobbyBtn')}
                </button>
              )}
            </div>
          ) : submittedId ? (
            <div className="space-y-3 py-4 text-center">
              <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-400" />
              <p className="text-sm font-extrabold text-emerald-200">{t('reportSuccess')}</p>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] w-full rounded-2xl border-2 border-slate-950 bg-amber-400 px-4 text-xs font-extrabold text-slate-950"
              >
                {t('understood')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <span className="mb-1.5 block text-xs font-extrabold text-amber-300">
                  {t('reportCategoryLabel')}
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {categories.map((cat) => {
                    const active = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setCategory(cat.id);
                        }}
                        className={`flex min-h-[38px] items-center justify-center gap-1 rounded-xl border-2 px-2 text-xs font-extrabold transition ${
                          active
                            ? 'border-slate-950 bg-rose-500 text-white shadow'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {cat.icon}
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {prefill?.messageExcerpt && (
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5 text-[11px] text-slate-300">
                  <span className="font-bold text-rose-300">Chat: </span>
                  <span>“{prefill.messageExcerpt}”</span>
                </div>
              )}

              {category !== 'bug' && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-300">
                    {t('reportTargetLabel')}
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={targetNickname}
                    onChange={(e) => setTargetNickname(e.target.value)}
                    placeholder={t('reportTargetPlaceholder')}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <textarea
                  rows={4}
                  maxLength={500}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('reportDescPlaceholder')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs font-semibold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {errorMsg && (
                <p className="text-xs font-bold text-rose-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-950 bg-gradient-to-b from-rose-400 to-rose-600 px-4 text-sm font-extrabold text-white shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
              >
                <Flag className="h-4 w-4" />
                <span>{t('reportSubmitBtn')}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

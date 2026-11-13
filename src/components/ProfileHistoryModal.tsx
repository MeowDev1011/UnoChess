import React, { useState } from 'react';
import { Clock, Download, Eye, History, Trophy, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GameMode, PlayerProfile, SavedMatchRecord } from '../types/game';
import { downloadPGNFile } from '../engine/pgn';
import { buildInitialReplayTree, buildPGNFromReplayTree } from '../engine/replay';
import { OfficialLichessLogo } from './OfficialLichessLogo';
import { sound } from '../utils/audio';

interface ProfileHistoryModalProps {
  isOpen: boolean;
  profile: PlayerProfile | null;
  matches: SavedMatchRecord[];
  loading?: boolean;
  onSelectMatch: (record: SavedMatchRecord) => void;
  onClose: () => void;
}

export const ProfileHistoryModal: React.FC<ProfileHistoryModalProps> = ({
  isOpen,
  profile,
  matches,
  loading = false,
  onSelectMatch,
  onClose,
}) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | GameMode>('all');

  if (!isOpen) return null;

  const filteredMatches =
    filter === 'all' ? matches : matches.filter((m) => m.mode === filter);

  const formatDate = (ms: number) => {
    if (!ms) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms));
    } catch {
      return '';
    }
  };

  const handleQuickPgn = (rec: SavedMatchRecord) => {
    sound.playClick();
    const root = rec.replayTree ?? buildInitialReplayTree(rec.moves);
    const pgn = buildPGNFromReplayTree({
      root,
      whiteName: rec.whiteName,
      blackName: rec.blackName,
      result: rec.result,
      timeControlLabel: rec.timeControlLabel,
      date: new Date(rec.createdAtMs || Date.now()),
    });
    downloadPGNFile(pgn);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('profileHistoryTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-md"
    >
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-3xl border-4 border-slate-950 bg-slate-900 p-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-950 bg-amber-400 text-slate-950">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-outline-sm text-lg font-bold text-amber-300">
                {t('profileHistoryTitle')}
              </h2>
              {profile && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                  {profile.authType === 'lichess' && (
                    <span className="inline-flex rounded bg-white p-0.5 text-slate-950">
                      <OfficialLichessLogo className="h-3 w-3" />
                    </span>
                  )}
                  <span>{profile.nickname}</span>
                  <span>·</span>
                  <span className="text-amber-300 tabular-nums">
                    {t('onlineRecordLabel', { wins: profile.wins, losses: profile.losses })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-slate-950 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Filter Line Tabs */}
        <div className="mt-2.5 grid grid-cols-4 border-b-2 border-slate-800">
          {(
            [
              { id: 'all', label: t('profileFilterAll') },
              { id: 'bot', label: t('profileFilterBot') },
              { id: 'local', label: t('profileFilterLocal') },
              { id: 'online', label: t('profileFilterOnline') },
            ] as const
          ).map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  sound.playClick();
                  setFilter(item.id);
                }}
                className={`relative pb-1.5 text-[11px] font-extrabold transition-colors ${
                  active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {active && (
                  <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Match List */}
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {loading ? (
            <div className="py-10 text-center text-xs font-bold text-slate-400">
              {t('onlineConnecting')}
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 p-6 text-center text-xs font-medium text-slate-400">
              {t('profileHistoryEmpty')}
            </div>
          ) : (
            filteredMatches.map((rec) => {
              const outcomeBadge =
                rec.outcome === 'win'
                  ? 'bg-emerald-400 text-slate-950'
                  : rec.outcome === 'loss'
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-600 text-white';
              const outcomeLabel =
                rec.outcome === 'win'
                  ? t('outcomeWin')
                  : rec.outcome === 'loss'
                  ? t('outcomeLoss')
                  : t('outcomeDraw');

              return (
                <div
                  key={rec.id}
                  className="rounded-2xl border-2 border-slate-800 bg-slate-950/75 p-3 transition hover:border-amber-400/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${outcomeBadge}`}
                        >
                          {outcomeLabel}
                        </span>
                        <span className="truncate text-xs font-extrabold text-white">
                          {rec.whiteName} vs {rec.blackName}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-400 tabular-nums">
                        <span className="inline-flex items-center gap-1 text-sky-300">
                          <Clock className="h-3 w-3" />
                          {rec.timeControlLabel}
                        </span>
                        <span>·</span>
                        <span>{t('turnsLabel', { count: rec.turnsPlayed })}</span>
                        <span>·</span>
                        <span>{rec.result}</span>
                        {rec.eloDelta && rec.eloDelta > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-amber-300">
                            <Trophy className="h-2.5 w-2.5" />
                            {rec.outcome === 'win' ? `+${rec.eloDelta}` : `-${rec.eloDelta}`}
                          </span>
                        ) : null}
                      </div>
                      {rec.createdAtMs > 0 && (
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {formatDate(rec.createdAtMs)}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickPgn(rec)}
                        aria-label={t('downloadPgn')}
                        title={t('downloadPgn')}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-sky-300 hover:border-sky-400"
                      >
                        <Download className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          onSelectMatch(rec);
                        }}
                        className="flex min-h-[36px] items-center gap-1 rounded-xl border-2 border-slate-950 bg-amber-400 px-3 py-1 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_#0f172a] hover:brightness-105"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>{t('watchMatch')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

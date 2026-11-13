import React from 'react';
import { Crown, Download, Eye, Flame, Home, RotateCcw, Swords, Trophy, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CardColor, Faction, PieceType, WILD_COLOR_PIECE_MAP } from '../types/game';
import { getColorBaseAsset } from '../engine/deck';
import { ChessPieceGraphic } from './ChessPieceGraphic';

interface WildColorModalProps {
  isOpen: boolean;
  faction: Faction;
  onSelectColor: (color: CardColor) => void;
}

export const WildColorModal: React.FC<WildColorModalProps> = ({
  isOpen,
  faction,
  onSelectColor,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const pieceName = (type: PieceType) => {
    switch (type) {
      case 'queen':
        return t('pieceQueen');
      case 'rook':
        return t('pieceRook');
      case 'bishop':
        return t('pieceBishop');
      case 'knight':
        return t('pieceKnight');
      default:
        return '';
    }
  };

  const colors: { key: CardColor; label: string; piece: PieceType }[] = [
    { key: 'red', label: t('colorRed'), piece: WILD_COLOR_PIECE_MAP.red },
    { key: 'blue', label: t('colorBlue'), piece: WILD_COLOR_PIECE_MAP.blue },
    { key: 'green', label: t('colorGreen'), piece: WILD_COLOR_PIECE_MAP.green },
    { key: 'yellow', label: t('colorYellow'), piece: WILD_COLOR_PIECE_MAP.yellow },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('wildColorTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs rounded-3xl border-4 border-slate-950 bg-slate-900 p-5 text-center shadow-2xl">
        <h2 className="font-display text-outline-sm text-2xl font-bold text-amber-300">
          {t('wildColorTitle')}
        </h2>
        <p className="mt-1 text-xs font-medium text-slate-300">{t('wildColorDesc')}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {colors.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelectColor(c.key)}
              className="group relative flex min-h-[96px] flex-col items-center justify-center overflow-hidden rounded-2xl border-3 border-slate-950 px-2 py-2 shadow-[0_4px_0_#0f172a] transition hover:scale-[1.03] active:translate-y-0.5 active:shadow-none"
            >
              <img
                src={getColorBaseAsset(c.key)}
                alt={c.label}
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="relative z-10 flex flex-col items-center">
                <ChessPieceGraphic
                  piece={{
                    id: `wild-${c.key}`,
                    type: c.piece,
                    faction,
                    pieceNumber: 1,
                    hasMoved: true,
                  }}
                  size="tray"
                />
                <span className="text-outline-sm mt-0.5 text-sm font-extrabold text-white">
                  {c.label}
                </span>
                <span className="rounded-md bg-slate-950/75 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-200">
                  + {pieceName(c.piece)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface WildPlus4ModalProps {
  isOpen: boolean;
  enemyHasTargets: boolean;
  onSelectMode: (mode: 'attack' | 'action') => void;
}

export const WildPlus4Modal: React.FC<WildPlus4ModalProps> = ({
  isOpen,
  enemyHasTargets,
  onSelectMode,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('wildPlus4Title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl border-4 border-slate-950 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-950 bg-amber-400 text-slate-950 shadow">
            <Zap className="h-7 w-7 fill-current" />
          </div>
          <h2 className="font-display text-outline-sm text-2xl font-bold text-amber-300">
            {t('wildPlus4Title')}
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-300">{t('wildPlus4Desc')}</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            disabled={!enemyHasTargets}
            onClick={() => onSelectMode('attack')}
            className="flex w-full items-start gap-3 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-rose-500 to-red-700 p-3.5 text-left text-white shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-45"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-950 bg-white/15">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold">{t('plus4AttackTitle')}</div>
              <p className="mt-0.5 text-xs text-rose-100">
                {enemyHasTargets ? t('plus4AttackDesc') : t('plus4AttackNoTargets')}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('action')}
            className="flex w-full items-start gap-3 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-sky-400 to-blue-600 p-3.5 text-left text-white shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-slate-950 bg-white/15">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-extrabold">{t('plus4ActionTitle')}</div>
              <p className="mt-0.5 text-xs text-sky-100">{t('plus4ActionDesc')}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

interface PromotionModalProps {
  isOpen: boolean;
  faction: Faction;
  pieceNumber: number;
  onSelectPiece: (type: PieceType) => void;
}

export const PromotionModal: React.FC<PromotionModalProps> = ({
  isOpen,
  faction,
  pieceNumber,
  onSelectPiece,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const options: { type: PieceType; label: string }[] = [
    { type: 'queen', label: t('pieceQueen') },
    { type: 'rook', label: t('pieceRook') },
    { type: 'bishop', label: t('pieceBishop') },
    { type: 'knight', label: t('pieceKnight') },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('promoTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs rounded-3xl border-4 border-slate-950 bg-slate-900 p-5 text-center shadow-2xl">
        <h2 className="font-display text-outline-sm text-xl font-bold text-amber-300">
          {t('promoTitle')}
        </h2>
        <p className="mt-1 text-xs text-slate-300">
          {t('promoDesc')}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {options.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => onSelectPiece(opt.type)}
              className="flex flex-col items-center justify-center rounded-2xl border-2 border-slate-950 bg-slate-800 p-3 transition hover:border-amber-400 hover:bg-slate-700"
            >
              <ChessPieceGraphic
                piece={{
                  id: 'promo',
                  type: opt.type,
                  faction,
                  pieceNumber,
                  hasMoved: true,
                }}
                size="tray"
              />
              <span className="mt-1 text-xs font-extrabold text-white">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  isOpen: boolean;
  winnerName: string | null;
  reason: string;
  turnsPlayed: number;
  elapsedSeconds: number;
  isOnline?: boolean;
  eloDelta?: number | null;
  didWinOnline?: boolean;
  onWatchGame: () => void;
  onDownloadPgn: () => void;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  winnerName,
  reason,
  turnsPlayed,
  elapsedSeconds,
  isOnline = false,
  eloDelta = null,
  didWinOnline = false,
  onWatchGame,
  onDownloadPgn,
  onPlayAgain,
  onMainMenu,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('playAgain')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl border-4 border-slate-950 bg-gradient-to-b from-slate-800 to-slate-950 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border-3 border-slate-950 bg-amber-400 text-slate-950 shadow-lg">
          <Crown className="h-9 w-9 fill-current" />
        </div>

        <h2 className="font-display text-outline text-3xl font-bold text-amber-300">
          {winnerName ? t('victoryTitle', { name: winnerName }) : t('drawTitle')}
        </h2>

        <p className="mt-2 text-sm font-semibold text-slate-200">{reason}</p>

        {isOnline && eloDelta !== null && eloDelta > 0 && (
          <div className="mt-3 flex justify-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-950 px-3 py-1 text-xs font-extrabold tabular-nums ${
                didWinOnline ? 'bg-emerald-400 text-slate-950' : 'bg-rose-500 text-white'
              }`}
            >
              <Trophy className="h-3.5 w-3.5" />
              {didWinOnline
                ? t('onlineEloDeltaGain', { delta: eloDelta })
                : t('onlineEloDeltaLoss', { delta: eloDelta })}
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-4 text-xs font-bold text-slate-300 tabular-nums">
          <span>{t('turnsLabel', { count: turnsPlayed })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('durationLabel', { time: formattedTime })}</span>
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={onWatchGame}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-violet-400 to-indigo-600 px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            <Eye className="h-4 w-4" />
            {t('watchMatch')}
          </button>

          <button
            type="button"
            onClick={onDownloadPgn}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            <Download className="h-4 w-4" />
            {t('downloadPgn')}
          </button>

          {!isOnline && (
            <button
              type="button"
              onClick={onPlayAgain}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-3 text-base font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
            >
              <RotateCcw className="h-5 w-5" />
              {t('playAgain')}
            </button>
          )}

          <button
            type="button"
            onClick={onMainMenu}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2.5 text-sm font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            <Home className="h-4 w-4" />
            {isOnline ? t('onlineLobbyTitle') : t('mainMenu')}
          </button>
        </div>
      </div>
    </div>
  );
};

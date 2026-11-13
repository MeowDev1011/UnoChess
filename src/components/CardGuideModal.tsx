import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../types/game';
import { LayeredCard } from './LayeredCard';

interface CardGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_CARDS: { card: Card; titleKey: string; descKey: string; num?: number }[] = [
  { card: { id: 'g-1', color: 'blue', value: '3', pieceNumber: 4 }, titleKey: 'cardNumTitle', descKey: 'cardNumDesc', num: 3 },
  { card: { id: 'g-0', color: 'red', value: '0', pieceNumber: 9 }, titleKey: 'card0Title', descKey: 'card0Desc' },
  { card: { id: 'g-d2', color: 'green', value: 'draw2', pieceNumber: 2 }, titleKey: 'cardDraw2Title', descKey: 'cardDraw2Desc' },
  { card: { id: 'g-rev', color: 'yellow', value: 'revers', pieceNumber: 5 }, titleKey: 'cardReversTitle', descKey: 'cardReversDesc' },
  { card: { id: 'g-int', color: 'red', value: 'interdit', pieceNumber: 7 }, titleKey: 'cardInterditTitle', descKey: 'cardInterditDesc' },
  { card: { id: 'g-wild', color: 'blue', value: 'wild', pieceNumber: 1 }, titleKey: 'cardWildTitle', descKey: 'cardWildDesc' },
  { card: { id: 'g-wd4', color: 'yellow', value: 'wild-draw', pieceNumber: 8 }, titleKey: 'cardWildDrawTitle', descKey: 'cardWildDrawDesc' },
];

export const CardGuideModal: React.FC<CardGuideModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('guideTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-5"
    >
      <div className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border-4 border-slate-950 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-slate-800 bg-gradient-to-r from-red-600 via-amber-500 to-sky-600 px-4 py-3">
          <h2 className="font-display text-outline-sm text-xl font-bold text-white">
            {t('guideTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('understood')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-950 bg-white text-slate-950 shadow transition hover:bg-amber-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {SAMPLE_CARDS.map((item) => (
            <div
              key={item.card.id}
              className="flex items-center gap-3.5 rounded-2xl border-2 border-slate-700/80 bg-slate-800/80 p-3"
            >
              <LayeredCard card={item.card} size="sm" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-extrabold text-amber-300">
                  {t(item.titleKey, { num: item.num })}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-200">
                  {t(item.descKey, { num: item.num })}
                </p>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border-2 border-amber-400/50 bg-amber-950/35 p-3.5">
            <h3 className="text-sm font-extrabold text-amber-300">{t('safetyTitle')}</h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-200">
              <li>{t('safetyRule1')}</li>
              <li>{t('safetyRule2')}</li>
              <li>{t('safetyRule3')}</li>
            </ul>
          </div>
        </div>

        <div className="border-t-2 border-slate-800 bg-slate-950/70 p-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-xl border-2 border-slate-950 bg-amber-400 py-2.5 text-sm font-extrabold text-slate-950 shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            {t('understood')}
          </button>
        </div>
      </div>
    </div>
  );
};

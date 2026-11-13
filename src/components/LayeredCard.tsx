import React from 'react';
import { Card, COLOR_LABELS_ES } from '../types/game';
import { getCardValueAsset, getColorBaseAsset } from '../engine/deck';

interface LayeredCardProps {
  card: Card | null;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-16',
  md: 'w-24 sm:w-28',
  lg: 'w-32 sm:w-36',
};

const COLOR_RING: Record<Card['color'], string> = {
  red: 'ring-red-400 shadow-red-600/50',
  blue: 'ring-sky-400 shadow-sky-600/50',
  green: 'ring-emerald-400 shadow-emerald-600/50',
  yellow: 'ring-amber-300 shadow-amber-500/50',
};

export const LayeredCard: React.FC<LayeredCardProps> = ({
  card,
  faceDown = false,
  size = 'md',
  className = '',
}) => {
  const isWild = card?.value === 'wild' || card?.value === 'wild-draw';

  return (
    <div
      className={`perspective-1000 relative aspect-[116/168] shrink-0 select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      <div
        className={`preserve-3d relative h-full w-full transition-transform duration-500 ease-out ${
          faceDown || !card ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]'
        }`}
      >
        {/* Front Face: 3-Layer Dynamic Assembly */}
        <div
          className={`backface-hidden absolute inset-0 overflow-hidden rounded-xl shadow-xl ${
            card ? `ring-2 ${COLOR_RING[card.color]}` : ''
          }`}
        >
          {card && (
            <>
              {/* Layer 1: Color Base PNG */}
              <img
                src={getColorBaseAsset(card.color)}
                alt={`Base ${COLOR_LABELS_ES[card.color]}`}
                referrerPolicy="no-referrer"
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              />

              {/* Layer 2: Card Value / Action PNG */}
              <img
                src={getCardValueAsset(card.value)}
                alt={`Carta ${card.value}`}
                referrerPolicy="no-referrer"
                className="pointer-events-none absolute inset-0 h-full w-full object-fill"
              />

              {/* Active Color Accent for Wild Cards */}
              {isWild && (
                <div
                  className="pointer-events-none absolute inset-[3px] rounded-[9px] border-[3px]"
                  style={{
                    borderColor:
                      card.color === 'red'
                        ? '#ef4444'
                        : card.color === 'blue'
                        ? '#0ea5e9'
                        : card.color === 'green'
                        ? '#22c55e'
                        : '#facc15',
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Back Face: back.png */}
        <div className="backface-hidden absolute inset-0 overflow-hidden rounded-xl shadow-xl [transform:rotateY(180deg)]">
          <img
            src="/assets/back.png"
            alt="Reverso de carta UnoChess"
            referrerPolicy="no-referrer"
            className="h-full w-full object-fill"
          />
        </div>
      </div>
    </div>
  );
};

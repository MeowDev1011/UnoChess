import React from 'react';
import { ChessPiece, Faction, PieceType, PIECE_LABELS_ES } from '../types/game';

interface ChessPieceGraphicProps {
  piece: ChessPiece;
  isSelected?: boolean;
  isTargetable?: boolean;
  isCheckedKing?: boolean;
  size?: 'board' | 'tray';
}

function renderPieceSvg(type: PieceType, faction: Faction) {
  const isWhite = faction === 'white';
  const fillMain = isWhite ? '#FFFBEB' : '#1E293B';
  const fillAccent = isWhite ? '#FDE68A' : '#475569';
  const stroke = isWhite ? '#0F172A' : '#F8FAFC';
  const innerStroke = isWhite ? '#B45309' : '#94A3B8';

  switch (type) {
    case 'pawn':
      return (
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
          <circle cx="32" cy="18" r="9.5" fill={fillMain} stroke={stroke} strokeWidth="3.5" />
          <path
            d="M24 28 C25 36, 20 44, 17 50 L47 50 C44 44, 39 36, 40 28 Z"
            fill={fillMain}
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect x="14" y="49" width="36" height="7" rx="3" fill={fillAccent} stroke={stroke} strokeWidth="3.5" />
          <circle cx="29" cy="15" r="2.2" fill={innerStroke} opacity="0.55" />
        </svg>
      );
    case 'rook':
      return (
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
          <path
            d="M17 12 L23 12 L23 18 L29 18 L29 12 L35 12 L35 18 L41 18 L41 12 L47 12 L47 24 L42 28 L44 49 L20 49 L22 28 L17 24 Z"
            fill={fillMain}
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect x="14" y="49" width="36" height="7" rx="3" fill={fillAccent} stroke={stroke} strokeWidth="3.5" />
          <line x1="23" y1="28" x2="41" y2="28" stroke={innerStroke} strokeWidth="2.5" />
        </svg>
      );
    case 'knight':
      return (
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
          <path
            d="M21 49 L23 36 C19 34, 16 30, 17 24 L25 14 L29 10 L33 14 C42 15, 48 23, 47 34 L44 49 Z"
            fill={fillMain}
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="26" cy="22" r="2.4" fill={stroke} />
          <path d="M35 20 C39 24, 40 31, 38 40" stroke={innerStroke} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <rect x="14" y="49" width="36" height="7" rx="3" fill={fillAccent} stroke={stroke} strokeWidth="3.5" />
        </svg>
      );
    case 'bishop':
      return (
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
          <circle cx="32" cy="10" r="4" fill={fillAccent} stroke={stroke} strokeWidth="3" />
          <path
            d="M32 14 C21 21, 19 35, 22 49 L42 49 C45 35, 43 21, 32 14 Z"
            fill={fillMain}
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <line x1="27" y1="26" x2="37" y2="36" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <rect x="14" y="49" width="36" height="7" rx="3" fill={fillAccent} stroke={stroke} strokeWidth="3.5" />
        </svg>
      );
    case 'queen':
      return (
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
          <path
            d="M14 22 L23 34 L32 16 L41 34 L50 22 L45 49 L19 49 Z"
            fill={fillMain}
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="14" cy="19" r="3.5" fill={fillAccent} stroke={stroke} strokeWidth="2.5" />
          <circle cx="32" cy="13" r="4" fill={fillAccent} stroke={stroke} strokeWidth="2.5" />
          <circle cx="50" cy="19" r="3.5" fill={fillAccent} stroke={stroke} strokeWidth="2.5" />
          <rect x="15" y="49" width="34" height="7" rx="3" fill={fillAccent} stroke={stroke} strokeWidth="3.5" />
        </svg>
      );
    case 'king':
      return (
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
          <line x1="32" y1="6" x2="32" y2="18" stroke={stroke} strokeWidth="4.5" strokeLinecap="round" />
          <line x1="26" y1="11" x2="38" y2="11" stroke={stroke} strokeWidth="4.5" strokeLinecap="round" />
          <path
            d="M19 25 C19 18, 45 18, 45 25 L43 49 L21 49 Z"
            fill={fillMain}
            stroke={stroke}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect x="15" y="49" width="34" height="7" rx="3" fill={fillAccent} stroke={stroke} strokeWidth="3.5" />
          <path d="M25 32 L39 32" stroke={innerStroke} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
  }
}

export const ChessPieceGraphic: React.FC<ChessPieceGraphicProps> = ({
  piece,
  isSelected = false,
  isTargetable = false,
  isCheckedKing = false,
  size = 'board',
}) => {
  const baseAsset = isCheckedKing
    ? '/assets/red-base.png'
    : isSelected
    ? '/assets/yellow-base.png'
    : isTargetable
    ? '/assets/green-base.png'
    : piece.faction === 'white'
    ? '/assets/blue-base.png'
    : '/assets/red-base.png';

  return (
    <div
      className={`relative flex items-center justify-center ${
        size === 'board' ? 'h-full w-full' : 'h-11 w-11'
      }`}
      title={PIECE_LABELS_ES[piece.type]}
    >
      {/* Circular Colored Pedestal Base */}
      <div
        className={`absolute bottom-[6%] h-[36%] w-[78%] overflow-hidden rounded-full border-2 shadow-md transition-transform duration-150 ${
          isSelected
            ? 'scale-110 border-yellow-200 ring-2 ring-yellow-300'
            : isCheckedKing
            ? 'animate-pulse border-red-200 ring-2 ring-red-400'
            : isTargetable
            ? 'border-emerald-200 ring-2 ring-emerald-400'
            : 'border-slate-900/90'
        }`}
      >
        <img
          src={baseAsset}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </div>

      {/* Stylized Glossy Chess Piece Silhouette (clean, no numbering) */}
      <div
        className={`relative z-10 transition-transform duration-150 ${
          size === 'board'
            ? 'h-[84%] w-[84%] -translate-y-[4%]'
            : 'h-[86%] w-[86%] -translate-y-[4%]'
        } ${isSelected ? '-translate-y-[10%] scale-105' : ''}`}
      >
        {renderPieceSvg(piece.type, piece.faction)}
      </div>
    </div>
  );
};

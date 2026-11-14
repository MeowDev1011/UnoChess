import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { ChessPiece, Coord, Faction, Move } from '../types/game';
import { ChessPieceGraphic } from './ChessPieceGraphic';

interface ChessBoardProps {
  board: (ChessPiece | null)[][];
  boardFlipped: boolean;
  isSpinning: boolean;
  rotatePieces180?: boolean; // For physical tabletop 2-player Black turn orientation
  selectedCoord: Coord | null;
  legalMovesForSelected: Move[];
  highlightCoords: Coord[];
  highlightMode: 'none' | 'place' | 'target-enemy' | 'teleport-dest' | 'select-own';
  checkedFaction: Faction | null;
  lastMove?: { from?: Coord | null; to?: Coord | null } | null;
  disabled?: boolean;
  onSquareClick: (coord: Coord) => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export const ChessBoard: React.FC<ChessBoardProps> = ({
  board,
  boardFlipped,
  isSpinning,
  rotatePieces180 = false,
  selectedCoord,
  legalMovesForSelected,
  highlightCoords,
  highlightMode,
  checkedFaction,
  lastMove = null,
  disabled = false,
  onSquareClick,
}) => {
  const baseRows = [0, 1, 2, 3, 4, 5, 6, 7];
  const displayRows = boardFlipped ? [...baseRows].reverse() : baseRows;
  const displayCols = boardFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  // Suppress piece slide animation for the single frame when board orientation flips
  const prevFlippedRef = useRef(boardFlipped);
  const suppressSlide = prevFlippedRef.current !== boardFlipped;
  useLayoutEffect(() => {
    prevFlippedRef.current = boardFlipped;
  }, [boardFlipped]);

  const isHighlighted = (r: number, c: number) =>
    highlightCoords.some((h) => h.row === r && h.col === c);

  const getMoveTo = (r: number, c: number) =>
    legalMovesForSelected.find((m) => m.to.row === r && m.to.col === c);

  // Collect all pieces sorted deterministically by piece.id so React preserves DOM elements
  // across coordinate changes, enabling smooth GPU-composited sliding transitions.
  const activePieces = useMemo(() => {
    const list: { piece: ChessPiece; row: number; col: number }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece) {
          list.push({ piece, row: r, col: c });
        }
      }
    }
    list.sort((a, b) => a.piece.id.localeCompare(b.piece.id));
    return list;
  }, [board]);

  return (
    <div className="relative mx-auto w-full max-w-[min(94vw,430px)] sm:max-w-[460px]">
      <div className="rounded-2xl border-4 border-slate-950 bg-gradient-to-br from-amber-400 via-red-500 to-sky-500 p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.65)]">
        <div
          className={`relative aspect-square w-full overflow-hidden rounded-xl border-2 border-slate-950 bg-slate-900 ${
            isSpinning
              ? 'rotate-180 scale-95 transition-transform duration-700 ease-in-out'
              : 'rotate-0 scale-100'
          }`}
        >
          {/* 1. Interactive 8x8 Square Grid (squares, coordinates, last-move & legal-move cues) */}
          <div className="grid h-full w-full grid-cols-8 grid-rows-8">
            {displayRows.map((r, visualRowIdx) =>
              displayCols.map((c, visualColIdx) => {
                const piece = board[r][c];
                const isLight = (r + c) % 2 === 0;
                const isSelected = selectedCoord?.row === r && selectedCoord?.col === c;
                const move = getMoveTo(r, c);
                const specialHighlight = isHighlighted(r, c);
                const isLastFrom = Boolean(lastMove?.from && lastMove.from.row === r && lastMove.from.col === c);
                const isLastTo = Boolean(lastMove?.to && lastMove.to.row === r && lastMove.to.col === c);

                const isEnemyTarget =
                  specialHighlight && highlightMode === 'target-enemy';
                const isPlaceTarget =
                  specialHighlight &&
                  (highlightMode === 'place' || highlightMode === 'teleport-dest');
                const isOwnSelectable =
                  specialHighlight && highlightMode === 'select-own';

                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSquareClick({ row: r, col: c })}
                    aria-label={`Casilla ${FILES[c]}${8 - r}`}
                    className={`relative flex items-center justify-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                      isLight ? 'bg-[#FFF5DF]' : 'bg-[#214568]'
                    } ${
                      isSelected
                        ? 'ring-inset ring-4 ring-amber-400 bg-amber-300/45'
                        : isPlaceTarget
                        ? 'ring-inset ring-3 ring-emerald-400 bg-emerald-400/25'
                        : isEnemyTarget
                        ? 'ring-inset ring-3 ring-rose-500 bg-rose-500/30'
                        : isOwnSelectable
                        ? 'ring-inset ring-2 ring-amber-300/80'
                        : isLastTo
                        ? 'bg-amber-400/35 ring-inset ring-2 ring-amber-400/70'
                        : isLastFrom
                        ? 'bg-amber-300/20'
                        : ''
                    }`}
                  >
                    {visualColIdx === 0 && (
                      <span
                        className={`pointer-events-none absolute left-0.5 top-0.5 text-[8px] font-bold leading-none ${
                          isLight ? 'text-slate-600/70' : 'text-sky-200/60'
                        }`}
                      >
                        {8 - r}
                      </span>
                    )}
                    {visualRowIdx === 7 && (
                      <span
                        className={`pointer-events-none absolute bottom-0.5 right-0.5 text-[8px] font-bold leading-none ${
                          isLight ? 'text-slate-600/70' : 'text-sky-200/60'
                        }`}
                      >
                        {FILES[c]}
                      </span>
                    )}

                    {move && !piece && (
                      <div className="pointer-events-none relative z-30 h-4 w-4 overflow-hidden rounded-full border-2 border-slate-950 shadow-md sm:h-5 sm:w-5">
                        <img
                          src="/assets/green-base.png"
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    {move && piece && (
                      <div className="pointer-events-none absolute inset-1 z-30 rounded-lg border-[3px] border-rose-500 ring-2 ring-amber-300/80" />
                    )}

                    {isPlaceTarget && !piece && (
                      <div className="pointer-events-none relative z-30 h-5 w-5 animate-pulse overflow-hidden rounded-full border-2 border-slate-950 shadow-md">
                        <img
                          src={
                            highlightMode === 'teleport-dest'
                              ? '/assets/yellow-base.png'
                              : '/assets/green-base.png'
                          }
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* 2. Smooth Sliding Piece Overlay Layer (GPU-composited translate3d keyed by piece.id) */}
          <div className="pointer-events-none absolute inset-0 z-20">
            {activePieces.map(({ piece, row, col }) => {
              const visualRow = boardFlipped ? 7 - row : row;
              const visualCol = boardFlipped ? 7 - col : col;
              const isSelected = selectedCoord?.row === row && selectedCoord?.col === col;
              const isLastDest = Boolean(
                lastMove?.to && lastMove.to.row === row && lastMove.to.col === col
              );
              const isEnemyTarget =
                highlightMode === 'target-enemy' && isHighlighted(row, col);
              const isCheckedKing =
                piece.type === 'king' && piece.faction === checkedFaction;

              return (
                <div
                  key={piece.id}
                  style={{
                    width: '12.5%',
                    height: '12.5%',
                    transform: `translate3d(${visualCol * 100}%, ${visualRow * 100}%, 0)`,
                    transition: suppressSlide
                      ? 'none'
                      : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
                    willChange: 'transform',
                    zIndex: isSelected || isLastDest ? 25 : 10,
                  }}
                  className="absolute left-0 top-0 flex items-center justify-center"
                >
                  <div
                    className={`h-[92%] w-[92%] transition-transform duration-300 ${
                      isSpinning
                        ? '-rotate-180 duration-700 ease-in-out'
                        : rotatePieces180
                        ? 'rotate-180'
                        : 'rotate-0'
                    }`}
                  >
                    <ChessPieceGraphic
                      piece={piece}
                      isSelected={isSelected}
                      isTargetable={isEnemyTarget}
                      isCheckedKing={isCheckedKing}
                      size="board"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

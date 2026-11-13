import { ChessPiece, Coord, Faction, Move, MoveHistoryEntry, PieceType } from '../types/game';
import { getStandardLegalMoves, isCheckmate, isInCheck } from './chess';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function coordToAlgebraic(coord: Coord): string {
  const file = FILES[coord.col] ?? 'a';
  const rank = 8 - coord.row;
  return `${file}${rank}`;
}

function pieceToSanLetter(type: PieceType): string {
  switch (type) {
    case 'king':
      return 'K';
    case 'queen':
      return 'Q';
    case 'rook':
      return 'R';
    case 'bishop':
      return 'B';
    case 'knight':
      return 'N';
    case 'pawn':
      return '';
  }
}

export function formatMoveToSAN(
  boardBefore: (ChessPiece | null)[][],
  move: Move,
  promoType: PieceType | null,
  boardAfter: (ChessPiece | null)[][],
  enemyFaction: Faction
): string {
  const movingPiece = boardBefore[move.from.row][move.from.col];
  if (!movingPiece) return coordToAlgebraic(move.to);

  let san = '';

  if (move.isCastle === 'king') {
    san = 'O-O';
  } else if (move.isCastle === 'queen') {
    san = 'O-O-O';
  } else if (movingPiece.type === 'pawn') {
    const dest = coordToAlgebraic(move.to);
    if (move.isCapture || move.isEnPassant) {
      san = `${FILES[move.from.col]}x${dest}`;
    } else {
      san = dest;
    }
    const promoRow = movingPiece.faction === 'white' ? 0 : 7;
    if ((move.promotionRequired || move.to.row === promoRow) && promoType && promoType !== 'pawn') {
      san += `=${pieceToSanLetter(promoType)}`;
    }
  } else {
    const letter = pieceToSanLetter(movingPiece.type);
    const dest = coordToAlgebraic(move.to);

    // Check disambiguation among same-type pieces that can legally reach `move.to`
    const allSameSide = getStandardLegalMoves(boardBefore, movingPiece.faction, null);
    const ambiguous = allSameSide.filter((other) => {
      if (other.to.row !== move.to.row || other.to.col !== move.to.col) return false;
      if (other.from.row === move.from.row && other.from.col === move.from.col) return false;
      const otherPiece = boardBefore[other.from.row][other.from.col];
      return otherPiece?.type === movingPiece.type;
    });

    let disambig = '';
    if (ambiguous.length > 0) {
      const sameFile = ambiguous.some((m) => m.from.col === move.from.col);
      const sameRank = ambiguous.some((m) => m.from.row === move.from.row);
      if (!sameFile) {
        disambig = FILES[move.from.col];
      } else if (!sameRank) {
        disambig = String(8 - move.from.row);
      } else {
        disambig = `${FILES[move.from.col]}${8 - move.from.row}`;
      }
    }

    const captureMark = move.isCapture || Boolean(boardBefore[move.to.row][move.to.col]) ? 'x' : '';
    san = `${letter}${disambig}${captureMark}${dest}`;
  }

  // Append check (+) or checkmate (#) suffix
  const enemyKingAlive = boardAfter.some((r) =>
    r.some((p) => p && p.faction === enemyFaction && p.type === 'king')
  );
  if (!enemyKingAlive || isCheckmate(boardAfter, enemyFaction)) {
    san += '#';
  } else if (isInCheck(boardAfter, enemyFaction)) {
    san += '+';
  }

  return san;
}

export function buildPGN(params: {
  entries: MoveHistoryEntry[];
  whiteName: string;
  blackName: string;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  timeControlLabel: string;
  date?: Date;
}): string {
  const d = params.date ?? new Date();
  const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate()
  ).padStart(2, '0')}`;

  const safeWhite = params.whiteName.replace(/"/g, "'") || 'White';
  const safeBlack = params.blackName.replace(/"/g, "'") || 'Black';
  const safeTc = params.timeControlLabel || '-';

  const headers = [
    `[Event "UnoChess Match"]`,
    `[Site "UnoChess"]`,
    `[Date "${dateStr}"]`,
    `[Round "1"]`,
    `[White "${safeWhite}"]`,
    `[Black "${safeBlack}"]`,
    `[TimeControl "${safeTc}"]`,
    `[Variant "UnoChess"]`,
    `[Result "${params.result}"]`,
  ];

  const tokens: string[] = [];
  let moveNumber = 1;

  for (const entry of params.entries) {
    const cleanComment = entry.comment ? entry.comment.replace(/[{}]/g, '') : '';
    if (entry.isChessMove) {
      if (entry.faction === 'white') {
        tokens.push(`${moveNumber}. ${entry.san}`);
      } else {
        if (tokens.length === 0 || !tokens[tokens.length - 1].startsWith(`${moveNumber}.`)) {
          tokens.push(`${moveNumber}... ${entry.san}`);
        } else {
          tokens.push(entry.san);
        }
        moveNumber++;
      }
      if (cleanComment) {
        tokens.push(`{${cleanComment}}`);
      }
    } else {
      const label = cleanComment ? `${entry.san}: ${cleanComment}` : entry.san;
      tokens.push(`{${label.replace(/[{}]/g, '')}}`);
    }
  }

  tokens.push(params.result);

  // Wrap body at ~80 chars for neat standard PGN formatting
  const lines: string[] = [];
  let currentLine = '';
  for (const tok of tokens) {
    if (!currentLine) {
      currentLine = tok;
    } else if (currentLine.length + 1 + tok.length > 80) {
      lines.push(currentLine);
      currentLine = tok;
    } else {
      currentLine += ` ${tok}`;
    }
  }
  if (currentLine) lines.push(currentLine);

  return `${headers.join('\n')}\n\n${lines.join('\n')}\n`;
}

export function downloadPGNFile(pgnText: string, filename?: string): void {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const name = filename ?? `unochess-${stamp}.pgn`;

  const blob = new Blob([pgnText], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

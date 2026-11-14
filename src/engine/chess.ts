import {
  BotLevel,
  CardColor,
  ChessPiece,
  Coord,
  Faction,
  Move,
  PIECE_BASE_COLOR_MAP,
  PieceType,
} from '../types/game';

export function oppositeFaction(f: Faction): Faction {
  return f === 'white' ? 'black' : 'white';
}

export function cloneBoard(board: (ChessPiece | null)[][]): (ChessPiece | null)[][] {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function createInitialBoard(): (ChessPiece | null)[][] {
  const board: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
    Array<ChessPiece | null>(8).fill(null)
  );

  const backRank: PieceType[] = [
    'rook',
    'knight',
    'bishop',
    'queen',
    'king',
    'bishop',
    'knight',
    'rook',
  ];

  // Black pieces at top (rows 0 and 1), numbered #1..#16
  for (let col = 0; col < 8; col++) {
    board[0][col] = {
      id: `b-${col + 1}`,
      type: backRank[col],
      faction: 'black',
      pieceNumber: col + 1,
      hasMoved: false,
    };
    board[1][col] = {
      id: `b-${col + 9}`,
      type: 'pawn',
      faction: 'black',
      pieceNumber: col + 9,
      hasMoved: false,
    };
  }

  // White pieces at bottom (rows 7 and 6), numbered #1..#16
  for (let col = 0; col < 8; col++) {
    board[7][col] = {
      id: `w-${col + 1}`,
      type: backRank[col],
      faction: 'white',
      pieceNumber: col + 1,
      hasMoved: false,
    };
    board[6][col] = {
      id: `w-${col + 9}`,
      type: 'pawn',
      faction: 'white',
      pieceNumber: col + 9,
      hasMoved: false,
    };
  }

  return board;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function findKing(board: (ChessPiece | null)[][], faction: Faction): Coord | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.faction === faction && p.type === 'king') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function isSquareAttacked(
  board: (ChessPiece | null)[][],
  target: Coord,
  byFaction: Faction
): boolean {
  const { row, col } = target;

  // Pawn attacks
  const pawnDir = byFaction === 'white' ? 1 : -1; // Pawns of byFaction sit at row + pawnDir to attack (row, col)
  for (const dc of [-1, 1]) {
    const pr = row + pawnDir;
    const pc = col + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.faction === byFaction && p.type === 'pawn') return true;
    }
  }

  // Knight attacks
  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const nr = row + dr;
    const nc = col + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.faction === byFaction && p.type === 'knight') return true;
    }
  }

  // King attacks
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const kr = row + dr;
      const kc = col + dc;
      if (inBounds(kr, kc)) {
        const p = board[kr][kc];
        if (p && p.faction === byFaction && p.type === 'king') return true;
      }
    }
  }

  // Orthogonal rays (Rook / Queen)
  const ortho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of ortho) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.faction === byFaction && (p.type === 'rook' || p.type === 'queen')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // Diagonal rays (Bishop / Queen)
  const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of diag) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.faction === byFaction && (p.type === 'bishop' || p.type === 'queen')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

export function isInCheck(board: (ChessPiece | null)[][], faction: Faction): boolean {
  const kingPos = findKing(board, faction);
  if (!kingPos) return false;
  return isSquareAttacked(board, kingPos, oppositeFaction(faction));
}

function getPseudoMovesForPiece(
  board: (ChessPiece | null)[][],
  from: Coord,
  enPassantTarget: Coord | null
): Move[] {
  const piece = board[from.row][from.col];
  if (!piece) return [];

  const moves: Move[] = [];
  const { row, col } = from;
  const enemy = oppositeFaction(piece.faction);

  if (piece.type === 'pawn') {
    const dir = piece.faction === 'white' ? -1 : 1;
    const startRow = piece.faction === 'white' ? 6 : 1;
    const promoRow = piece.faction === 'white' ? 0 : 7;

    // 1 step forward
    const r1 = row + dir;
    if (inBounds(r1, col) && !board[r1][col]) {
      moves.push({
        from,
        to: { row: r1, col },
        promotionRequired: r1 === promoRow,
      });
      // 2 steps forward from initial row
      const r2 = row + dir * 2;
      if (row === startRow && inBounds(r2, col) && !board[r2][col]) {
        moves.push({ from, to: { row: r2, col } });
      }
    }

    // Diagonal captures
    for (const dc of [-1, 1]) {
      const cr = row + dir;
      const cc = col + dc;
      if (!inBounds(cr, cc)) continue;
      const target = board[cr][cc];
      if (target && target.faction === enemy) {
        moves.push({
          from,
          to: { row: cr, col: cc },
          isCapture: true,
          promotionRequired: cr === promoRow,
        });
      } else if (
        enPassantTarget &&
        enPassantTarget.row === cr &&
        enPassantTarget.col === cc
      ) {
        moves.push({
          from,
          to: { row: cr, col: cc },
          isCapture: true,
          isEnPassant: true,
        });
      }
    }
  } else if (piece.type === 'knight') {
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of offsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target || target.faction === enemy) {
        moves.push({ from, to: { row: nr, col: nc }, isCapture: Boolean(target) });
      }
    }
  } else if (piece.type === 'bishop' || piece.type === 'rook' || piece.type === 'queen') {
    const dirs: number[][] = [];
    if (piece.type === 'bishop' || piece.type === 'queen') {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (piece.type === 'rook' || piece.type === 'queen') {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const target = board[r][c];
        if (!target) {
          moves.push({ from, to: { row: r, col: c } });
        } else {
          if (target.faction === enemy) {
            moves.push({ from, to: { row: r, col: c }, isCapture: true });
          }
          break;
        }
        r += dr;
        c += dc;
      }
    }
  } else if (piece.type === 'king') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const kr = row + dr;
        const kc = col + dc;
        if (!inBounds(kr, kc)) continue;
        const target = board[kr][kc];
        if (!target || target.faction === enemy) {
          moves.push({ from, to: { row: kr, col: kc }, isCapture: Boolean(target) });
        }
      }
    }

    // Castling
    if (!piece.hasMoved && !isInCheck(board, piece.faction)) {
      const homeRow = piece.faction === 'white' ? 7 : 0;
      if (row === homeRow && col === 4) {
        // Kingside
        const kRook = board[homeRow][7];
        if (
          kRook &&
          kRook.type === 'rook' &&
          kRook.faction === piece.faction &&
          !kRook.hasMoved &&
          !board[homeRow][5] &&
          !board[homeRow][6] &&
          !isSquareAttacked(board, { row: homeRow, col: 5 }, enemy) &&
          !isSquareAttacked(board, { row: homeRow, col: 6 }, enemy)
        ) {
          moves.push({
            from,
            to: { row: homeRow, col: 6 },
            isCastle: 'king',
          });
        }
        // Queenside
        const qRook = board[homeRow][0];
        if (
          qRook &&
          qRook.type === 'rook' &&
          qRook.faction === piece.faction &&
          !qRook.hasMoved &&
          !board[homeRow][1] &&
          !board[homeRow][2] &&
          !board[homeRow][3] &&
          !isSquareAttacked(board, { row: homeRow, col: 3 }, enemy) &&
          !isSquareAttacked(board, { row: homeRow, col: 2 }, enemy)
        ) {
          moves.push({
            from,
            to: { row: homeRow, col: 2 },
            isCastle: 'queen',
          });
        }
      }
    }
  }

  return moves;
}

export function applyMoveToBoard(
  board: (ChessPiece | null)[][],
  move: Move,
  promotionType: PieceType = 'queen'
): {
  nextBoard: (ChessPiece | null)[][];
  capturedPiece: ChessPiece | null;
  nextEnPassant: Coord | null;
} {
  const nextBoard = cloneBoard(board);
  const movingPiece = nextBoard[move.from.row][move.from.col];
  if (!movingPiece) {
    return { nextBoard, capturedPiece: null, nextEnPassant: null };
  }

  let capturedPiece: ChessPiece | null = nextBoard[move.to.row][move.to.col];

  // En passant capture
  if (move.isEnPassant) {
    const capRow = move.from.row;
    const capCol = move.to.col;
    capturedPiece = nextBoard[capRow][capCol];
    nextBoard[capRow][capCol] = null;
  }

  // Move piece
  nextBoard[move.from.row][move.from.col] = null;
  const updatedPiece: ChessPiece = {
    ...movingPiece,
    hasMoved: true,
    type: move.promotionRequired ? promotionType : movingPiece.type,
  };
  nextBoard[move.to.row][move.to.col] = updatedPiece;

  // Castling rook move
  if (move.isCastle === 'king') {
    const r = move.from.row;
    const rook = nextBoard[r][7];
    if (rook) {
      nextBoard[r][7] = null;
      nextBoard[r][5] = { ...rook, hasMoved: true };
    }
  } else if (move.isCastle === 'queen') {
    const r = move.from.row;
    const rook = nextBoard[r][0];
    if (rook) {
      nextBoard[r][0] = null;
      nextBoard[r][3] = { ...rook, hasMoved: true };
    }
  }

  let nextEnPassant: Coord | null = null;
  if (
    movingPiece.type === 'pawn' &&
    Math.abs(move.to.row - move.from.row) === 2
  ) {
    nextEnPassant = {
      row: (move.from.row + move.to.row) / 2,
      col: move.from.col,
    };
  }

  return { nextBoard, capturedPiece, nextEnPassant };
}

export function getStandardLegalMoves(
  board: (ChessPiece | null)[][],
  faction: Faction,
  enPassantTarget: Coord | null
): Move[] {
  const legal: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.faction !== faction) continue;
      const pseudo = getPseudoMovesForPiece(board, { row: r, col: c }, enPassantTarget);
      for (const m of pseudo) {
        const { nextBoard } = applyMoveToBoard(board, m);
        if (!isInCheck(nextBoard, faction)) {
          legal.push(m);
        }
      }
    }
  }
  return legal;
}

export function isCheckmate(board: (ChessPiece | null)[][], faction: Faction): boolean {
  if (!isInCheck(board, faction)) return false;
  return getStandardLegalMoves(board, faction, null).length === 0;
}

/**
 * UnoChess Legal Move Filter:
 * Enforces standard chess legality PLUS Section 4 Multi-Move Checkmate Immunity:
 * When movesRemaining > 1, capturing the enemy King OR putting the enemy in Checkmate
 * is strictly forbidden before the final move!
 */
export function getUnoChessLegalMoves(
  board: (ChessPiece | null)[][],
  faction: Faction,
  enPassantTarget: Coord | null,
  movesRemaining: number
): Move[] {
  const standard = getStandardLegalMoves(board, faction, enPassantTarget);
  const enemy = oppositeFaction(faction);

  if (movesRemaining > 1) {
    const filtered = standard.filter((m) => {
      const target = board[m.to.row][m.to.col];
      if (target && target.type === 'king') return false;
      if (m.promotionRequired) {
        const promoChoices: PieceType[] = ['knight', 'bishop', 'rook', 'queen'];
        return promoChoices.some((pt) => {
          const { nextBoard } = applyMoveToBoard(board, m, pt);
          return !isCheckmate(nextBoard, enemy);
        });
      }
      const { nextBoard } = applyMoveToBoard(board, m);
      if (isCheckmate(nextBoard, enemy)) return false;
      return true;
    });
    return filtered;
  }

  return standard;
}

export function getEmptyHomeRows(
  board: (ChessPiece | null)[][],
  faction: Faction
): Coord[] {
  const rows = faction === 'white' ? [6, 7] : [0, 1];
  const coords: Coord[] = [];
  for (const r of rows) {
    for (let c = 0; c < 8; c++) {
      if (!board[r][c]) {
        coords.push({ row: r, col: c });
      }
    }
  }
  return coords;
}

export function getWildPlacementSquares(
  board: (ChessPiece | null)[][],
  faction: Faction
): Coord[] {
  const home = getEmptyHomeRows(board, faction);
  if (home.length > 0) return home;
  const anyEmpty: Coord[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!board[r][c]) anyEmpty.push({ row: r, col: c });
    }
  }
  return anyEmpty;
}

/**
 * Priority hierarchy for +2 (steal) and +4 (attack):
 * 1. Knights or Bishops
 * 2. Pawns (if no Knights/Bishops)
 * 3. Rook or Queen (if no Knights/Bishops/Pawns)
 * 4. King only remaining -> returns [] (triggers 2 moves fallback on +2)
 */
export function getHighestPriorityEnemyCoords(
  board: (ChessPiece | null)[][],
  enemyFaction: Faction
): { tier: 1 | 2 | 3 | 4; coords: Coord[] } {
  const tier1: Coord[] = [];
  const tier2: Coord[] = [];
  const tier3: Coord[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.faction !== enemyFaction) continue;
      if (p.type === 'knight' || p.type === 'bishop') tier1.push({ row: r, col: c });
      else if (p.type === 'pawn') tier2.push({ row: r, col: c });
      else if (p.type === 'rook' || p.type === 'queen') tier3.push({ row: r, col: c });
    }
  }

  if (tier1.length > 0) return { tier: 1, coords: tier1 };
  if (tier2.length > 0) return { tier: 2, coords: tier2 };
  if (tier3.length > 0) return { tier: 3, coords: tier3 };
  return { tier: 4, coords: [] };
}

// ---------- AI BOT ENGINE ----------

const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
};

function evaluateBoard(board: (ChessPiece | null)[][], faction: Faction): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      let val = PIECE_VALUES[p.type];
      // Center control bonus
      const centerDist = Math.abs(3.5 - r) + Math.abs(3.5 - c);
      val += (7 - centerDist) * 4;
      score += p.faction === faction ? val : -val;
    }
  }
  return score;
}

export interface ColorDuelResult {
  triggered: boolean;
  nextBoard: (ChessPiece | null)[][];
  nextCapW: ChessPiece[];
  nextCapB: ChessPiece[];
  stolenPieceType: PieceType | null;
  lostPieceType: PieceType | null;
}

/**
 * Regla 2: Duelo de Color (Coincidencia en Mesa)
 * 1. Recompensa para el Primer Jugador (attackerFaction): recibe del rival una pieza mediana
 *    (priorizando Caballo o Alfil; si no tiene, una Torre) en una casilla libre de sus 2 primeras filas.
 * 2. Penalización para el Segundo Jugador (defenderFaction): pierde una pieza menor
 *    (un Peón activo del tablero, que pasa a capturados; si no tiene peones, otro Caballo o Alfil).
 */
export function resolveColorDuel(
  board: (ChessPiece | null)[][],
  capW: ChessPiece[],
  capB: ChessPiece[],
  defenderFaction: Faction
): ColorDuelResult {
  const attackerFaction = oppositeFaction(defenderFaction);
  const workBoard = cloneBoard(board);
  const nextCapW = [...capW];
  const nextCapB = [...capB];

  let stolenPieceType: PieceType | null = null;
  let lostPieceType: PieceType | null = null;

  // Step 1: Find medium piece from defender (Knight/Bishop first, else Rook)
  const knightsBishops: { row: number; col: number; piece: ChessPiece }[] = [];
  const rooks: { row: number; col: number; piece: ChessPiece }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = workBoard[r][c];
      if (!p || p.faction !== defenderFaction) continue;
      if (p.type === 'knight' || p.type === 'bishop') {
        knightsBishops.push({ row: r, col: c, piece: p });
      } else if (p.type === 'rook') {
        rooks.push({ row: r, col: c, piece: p });
      }
    }
  }

  const mediumPool = knightsBishops.length > 0 ? knightsBishops : rooks;
  const attackerHomeEmpties = getEmptyHomeRows(workBoard, attackerFaction);

  if (mediumPool.length > 0 && attackerHomeEmpties.length > 0) {
    // Prefer a piece whose removal doesn't needlessly expose defender's king if an alternative exists
    const safeCandidates = mediumPool.filter((cand) => {
      const test = cloneBoard(workBoard);
      test[cand.row][cand.col] = null;
      return !isInCheck(test, defenderFaction);
    });
    const finalMediumPool = safeCandidates.length > 0 ? safeCandidates : mediumPool;
    const chosen = finalMediumPool[Math.floor(Math.random() * finalMediumPool.length)];
    const dest = attackerHomeEmpties[Math.floor(Math.random() * attackerHomeEmpties.length)];

    workBoard[chosen.row][chosen.col] = null;
    workBoard[dest.row][dest.col] = {
      ...chosen.piece,
      faction: attackerFaction,
      hasMoved: true,
    };
    stolenPieceType = chosen.piece.type;
  }

  // Step 2: Defender loses minor piece (Pawn first, else another Knight/Bishop) -> goes to captured zone
  const pawns: { row: number; col: number; piece: ChessPiece }[] = [];
  const otherMinors: { row: number; col: number; piece: ChessPiece }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = workBoard[r][c];
      if (!p || p.faction !== defenderFaction) continue;
      if (p.type === 'pawn') pawns.push({ row: r, col: c, piece: p });
      else if (p.type === 'knight' || p.type === 'bishop') otherMinors.push({ row: r, col: c, piece: p });
    }
  }

  const minorPool = pawns.length > 0 ? pawns : otherMinors;
  if (minorPool.length > 0) {
    const safeMinors = minorPool.filter((cand) => {
      const test = cloneBoard(workBoard);
      test[cand.row][cand.col] = null;
      return !isInCheck(test, defenderFaction);
    });
    const finalMinorPool = safeMinors.length > 0 ? safeMinors : minorPool;
    const victim = finalMinorPool[Math.floor(Math.random() * finalMinorPool.length)];

    workBoard[victim.row][victim.col] = null;
    const capturedCopy: ChessPiece = { ...victim.piece, hasMoved: true };
    if (defenderFaction === 'white') {
      nextCapW.push(capturedCopy);
    } else {
      nextCapB.push(capturedCopy);
    }
    lostPieceType = victim.piece.type;
  }

  return {
    triggered: true,
    nextBoard: workBoard,
    nextCapW,
    nextCapB,
    stolenPieceType,
    lostPieceType,
  };
}

export function chooseBotMove(
  board: (ChessPiece | null)[][],
  faction: Faction,
  enPassantTarget: Coord | null,
  movesRemaining: number,
  botLevel: BotLevel,
  syncCardColor: CardColor | null = null
): Move | null {
  const moves = getUnoChessLegalMoves(board, faction, enPassantTarget, movesRemaining);
  if (moves.length === 0) return null;

  // Low levels (1-3): higher randomness
  const randomChance = Math.max(0, (4 - botLevel) * 0.25);
  if (randomChance > 0 && Math.random() < randomChance) {
    const caps = moves.filter((m) => m.isCapture);
    if (caps.length > 0 && botLevel >= 2 && Math.random() < 0.6) {
      return caps[Math.floor(Math.random() * caps.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const enemy = oppositeFaction(faction);
  let bestScore = -Infinity;
  let bestMoves: Move[] = [];
  const noiseScale = Math.max(2, (10 - botLevel) * 8);

  for (const m of moves) {
    const { nextBoard } = applyMoveToBoard(board, m, 'queen');
    let score = evaluateBoard(nextBoard, faction);

    if (movesRemaining === 1 && isCheckmate(nextBoard, enemy)) {
      return m; // Immediate checkmate!
    }
    if (isInCheck(nextBoard, enemy)) {
      score += botLevel >= 5 ? 55 : 25;
    }
    if (m.isCapture) {
      const cap = board[m.to.row][m.to.col];
      if (cap) score += PIECE_VALUES[cap.type] * (botLevel >= 6 ? 0.35 : 0.2);
    }

    // High levels (7-10): penalize hanging the moved piece on an attacked square
    if (botLevel >= 7) {
      const moved = nextBoard[m.to.row][m.to.col];
      if (moved && isSquareAttacked(nextBoard, m.to, enemy)) {
        const defended = isSquareAttacked(nextBoard, m.to, faction);
        score -= PIECE_VALUES[moved.type] * (defended ? 0.25 : 0.75);
      }
    }

    // Regla 1: Bono de Sincronía de Color (+2 extra moves if first move matches card color)
    if (syncCardColor) {
      const origPiece = board[m.from.row][m.from.col];
      if (origPiece && PIECE_BASE_COLOR_MAP[origPiece.type] === syncCardColor) {
        score += botLevel >= 4 ? 140 : 60;
      }
    }

    score += Math.random() * noiseScale;

    if (score > bestScore) {
      bestScore = score;
      bestMoves = [m];
    } else if (Math.abs(score - bestScore) < 4) {
      bestMoves.push(m);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
}

export function chooseBotPlus4Mode(board: (ChessPiece | null)[][], enemyFaction: Faction): 'attack' | 'action' {
  const { tier } = getHighestPriorityEnemyCoords(board, enemyFaction);
  if (tier <= 3) {
    return Math.random() < 0.55 ? 'attack' : 'action';
  }
  return 'action';
}

export function chooseBotWildColor(): CardColor {
  const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function chooseBotTeleport(
  board: (ChessPiece | null)[][],
  faction: Faction
): { from: Coord; to: Coord } | null {
  const ownCoords: Coord[] = [];
  const emptyCoords: Coord[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) emptyCoords.push({ row: r, col: c });
      else if (p.faction === faction && p.type !== 'king') ownCoords.push({ row: r, col: c });
    }
  }
  if (ownCoords.length === 0 || emptyCoords.length === 0) return null;

  const enemy = oppositeFaction(faction);
  const enemyKing = findKing(board, enemy);

  // Pick a strong non-king piece (prefer queen/rook/knight) and teleport near center or enemy king safely
  ownCoords.sort((a, b) => {
    const pa = board[a.row][a.col]!;
    const pb = board[b.row][b.col]!;
    return PIECE_VALUES[pb.type] - PIECE_VALUES[pa.type];
  });

  const chosenFrom = ownCoords[0];
  let bestTo = emptyCoords[0];
  let bestScore = -Infinity;

  for (const to of emptyCoords) {
    const test = cloneBoard(board);
    test[to.row][to.col] = test[chosenFrom.row][chosenFrom.col];
    test[chosenFrom.row][chosenFrom.col] = null;
    if (isInCheck(test, faction)) continue;

    let s = 0;
    if (isCheckmate(test, enemy)) return { from: chosenFrom, to };
    if (isInCheck(test, enemy)) s += 60;
    if (isSquareAttacked(test, to, enemy)) s -= 90;
    if (enemyKing) {
      const dist = Math.abs(to.row - enemyKing.row) + Math.abs(to.col - enemyKing.col);
      s += (14 - dist) * 4;
    }
    s += Math.random() * 10;
    if (s > bestScore) {
      bestScore = s;
      bestTo = to;
    }
  }

  return { from: chosenFrom, to: bestTo };
}

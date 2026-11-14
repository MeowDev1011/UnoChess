import {
  ChessPiece,
  Coord,
  Faction,
  Move,
  MoveAnnotation,
  MoveHistoryEntry,
  PieceType,
  ReplayNode,
} from '../types/game';
import { applyMoveToBoard, createInitialBoard } from './chess';
import { formatMoveToSAN } from './pgn';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const TYPE_TO_CHAR: Record<PieceType, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
};

const CHAR_TO_TYPE: Record<string, PieceType> = {
  P: 'pawn',
  N: 'knight',
  B: 'bishop',
  R: 'rook',
  Q: 'queen',
  K: 'king',
};

export function coordToSq(c: Coord): string {
  return `${FILES[c.col] ?? 'a'}${8 - c.row}`;
}

export function sqToCoord(sq?: string): Coord | null {
  if (!sq || sq.length < 2) return null;
  const col = FILES.indexOf(sq[0]);
  const rank = parseInt(sq[1], 10);
  if (col < 0 || col > 7 || Number.isNaN(rank) || rank < 1 || rank > 8) return null;
  return { row: 8 - rank, col };
}

export function serializeBoardCompact(board: (ChessPiece | null)[][]): string {
  let out = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) {
        out += '..';
      } else {
        out += (p.faction === 'white' ? 'w' : 'b') + TYPE_TO_CHAR[p.type];
      }
    }
  }
  return out;
}

export function deserializeBoardCompact(str: string): (ChessPiece | null)[][] {
  if (!str || str.length !== 128) {
    return createInitialBoard();
  }
  const board: (ChessPiece | null)[][] = [];
  let idx = 0;
  for (let r = 0; r < 8; r++) {
    const row: (ChessPiece | null)[] = [];
    for (let c = 0; c < 8; c++) {
      const pair = str.slice(idx, idx + 2);
      idx += 2;
      if (pair === '..' || pair.length < 2) {
        row.push(null);
      } else {
        const faction: Faction = pair[0] === 'w' ? 'white' : 'black';
        const type = CHAR_TO_TYPE[pair[1]] ?? 'pawn';
        row.push({
          id: `rep-${r}-${c}-${pair}`,
          type,
          faction,
          pieceNumber: 1,
          hasMoved: true,
        });
      }
    }
    board.push(row);
  }
  return board;
}

export function deriveReplayBoardWithStableIds(pathNodes: ReplayNode[]): (ChessPiece | null)[][] {
  if (pathNodes.length === 0) return createInitialBoard();
  let board =
    pathNodes[0].boardStr && pathNodes[0].boardStr.length === 128
      ? createInitialBoard()
      : createInitialBoard();

  for (let i = 1; i < pathNodes.length; i++) {
    const node = pathNodes[i];
    const target = deserializeBoardCompact(node.boardStr);
    const next: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
      Array<ChessPiece | null>(8).fill(null)
    );
    const usedIds = new Set<string>();

    // 1) Preserve IDs of pieces that stayed on the exact same square with same faction & type
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const tgt = target[r][c];
        const prev = board[r][c];
        if (tgt && prev && prev.faction === tgt.faction && prev.type === tgt.type && !usedIds.has(prev.id)) {
          next[r][c] = { ...tgt, id: prev.id };
          usedIds.add(prev.id);
        }
      }
    }

    // 2) Transfer ID along explicit fromSq -> toSq (even on pawn promotion!)
    const fromC = sqToCoord(node.fromSq);
    const toC = sqToCoord(node.toSq);
    if (fromC && toC) {
      const movedFrom = board[fromC.row][fromC.col];
      const landed = target[toC.row][toC.col];
      if (
        movedFrom &&
        landed &&
        !next[toC.row][toC.col] &&
        movedFrom.faction === landed.faction &&
        !usedIds.has(movedFrom.id)
      ) {
        next[toC.row][toC.col] = { ...landed, id: movedFrom.id };
        usedIds.add(movedFrom.id);
      }
    }

    // 3) Match any remaining pieces (castling rook, teleport, steal) from unused pieces on prev board
    const unusedPrev: ChessPiece[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const prev = board[r][c];
        if (prev && !usedIds.has(prev.id)) unusedPrev.push(prev);
      }
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const tgt = target[r][c];
        if (!tgt || next[r][c]) continue;
        const matchIdx = unusedPrev.findIndex(
          (p) => p.faction === tgt.faction && p.type === tgt.type
        );
        if (matchIdx >= 0) {
          const [matched] = unusedPrev.splice(matchIdx, 1);
          next[r][c] = { ...tgt, id: matched.id };
          usedIds.add(matched.id);
        } else {
          next[r][c] = { ...tgt, id: `rep-${node.id}-${r}-${c}` };
        }
      }
    }

    board = next;
  }

  return board;
}

export function buildInitialReplayTree(moves: MoveHistoryEntry[]): ReplayNode {
  const initialBoardStr = serializeBoardCompact(createInitialBoard());
  const root: ReplayNode = {
    id: 'root',
    ply: 0,
    turnNumber: 0,
    faction: 'white',
    san: '',
    boardStr: initialBoardStr,
    children: [],
  };

  let cursor = root;
  let lastBoardStr = initialBoardStr;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const boardStr = m.boardAfter && m.boardAfter.length === 128 ? m.boardAfter : lastBoardStr;
    lastBoardStr = boardStr;
    const node: ReplayNode = {
      id: `m_${i + 1}`,
      ply: m.ply || i + 1,
      turnNumber: m.turnNumber || Math.floor(i / 2) + 1,
      faction: m.faction,
      san: m.san,
      boardStr,
      fromSq: m.fromSq ?? '',
      toSq: m.toSq ?? '',
      nag: m.nag ?? '',
      comment: m.comment ?? '',
      userComment: m.userComment ?? '',
      cardColor: m.cardColor ?? '',
      cardValue: m.cardValue ?? '',
      syncBonus: Boolean(m.syncBonus),
      duelEvent: Boolean(m.duelEvent),
      isChessMove: Boolean(m.isChessMove),
      children: [],
    };
    cursor.children = [node];
    cursor = node;
  }

  return root;
}

export function findNodePath(root: ReplayNode, targetId: string): ReplayNode[] | null {
  if (root.id === targetId) return [root];
  for (const child of root.children) {
    const sub = findNodePath(child, targetId);
    if (sub) return [root, ...sub];
  }
  return null;
}

export function findNodeById(root: ReplayNode, targetId: string): ReplayNode | null {
  if (root.id === targetId) return root;
  for (const child of root.children) {
    const found = findNodeById(child, targetId);
    if (found) return found;
  }
  return null;
}

export function getActiveBranchNodes(root: ReplayNode, currentId: string): ReplayNode[] {
  const pathToCurrent = findNodePath(root, currentId) ?? [root];
  const result: ReplayNode[] = [...pathToCurrent];
  let tail = pathToCurrent[pathToCurrent.length - 1];
  while (tail.children.length > 0) {
    tail = tail.children[0];
    result.push(tail);
  }
  return result;
}

export function addOrSelectVariationMove(
  root: ReplayNode,
  parentId: string,
  boardBefore: (ChessPiece | null)[][],
  move: Move,
  promoType: PieceType = 'queen'
): { nextRoot: ReplayNode; addedNodeId: string } {
  const parent = findNodeById(root, parentId);
  if (!parent) {
    return { nextRoot: root, addedNodeId: parentId };
  }

  const fromSq = coordToSq(move.from);
  const toSq = coordToSq(move.to);
  const movingPiece = boardBefore[move.from.row][move.from.col];
  if (!movingPiece) {
    return { nextRoot: root, addedNodeId: parentId };
  }

  const enemy: Faction = movingPiece.faction === 'white' ? 'black' : 'white';
  const promoRow = movingPiece.faction === 'white' ? 0 : 7;
  const isPromo =
    movingPiece.type === 'pawn' && (move.promotionRequired || move.to.row === promoRow);

  const { nextBoard } = applyMoveToBoard(
    boardBefore,
    { ...move, promotionRequired: isPromo },
    promoType
  );
  const san = formatMoveToSAN(
    boardBefore,
    { ...move, promotionRequired: isPromo },
    isPromo ? promoType : null,
    nextBoard,
    enemy
  );
  const boardStr = serializeBoardCompact(nextBoard);

  // If an identical child already exists on this node, select it instead of duplicating
  const existing = parent.children.find(
    (c) => c.fromSq === fromSq && c.toSq === toSq && c.san === san
  );
  if (existing) {
    return { nextRoot: root, addedNodeId: existing.id };
  }

  const nextTurnNumber =
    parent.id === 'root'
      ? 1
      : movingPiece.faction === 'white'
      ? parent.turnNumber + (parent.faction === 'black' ? 1 : 0)
      : parent.turnNumber;

  const newNode: ReplayNode = {
    id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ply: parent.ply + 1,
    turnNumber: Math.max(1, nextTurnNumber),
    faction: movingPiece.faction,
    san,
    boardStr,
    fromSq,
    toSq,
    nag: '',
    comment: '',
    userComment: '',
    isChessMove: true,
    children: [],
  };

  const cloneWithInsert = (node: ReplayNode): ReplayNode => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...node.children, newNode],
      };
    }
    return {
      ...node,
      children: node.children.map(cloneWithInsert),
    };
  };

  return {
    nextRoot: cloneWithInsert(root),
    addedNodeId: newNode.id,
  };
}

export function updateReplayNodeAnnotation(
  root: ReplayNode,
  nodeId: string,
  patch: { nag?: MoveAnnotation; userComment?: string }
): ReplayNode {
  const cloneAndUpdate = (node: ReplayNode): ReplayNode => {
    if (node.id === nodeId) {
      return {
        ...node,
        nag: patch.nag !== undefined ? patch.nag : node.nag,
        userComment: patch.userComment !== undefined ? patch.userComment : node.userComment,
      };
    }
    if (node.children.length === 0) return node;
    return {
      ...node,
      children: node.children.map(cloneAndUpdate),
    };
  };
  return cloneAndUpdate(root);
}

export function deleteVariationNode(root: ReplayNode, targetId: string): ReplayNode {
  if (targetId === 'root') return root;
  const cloneAndPrune = (node: ReplayNode): ReplayNode => {
    const filtered = node.children.filter((c, idx) => idx === 0 || c.id !== targetId);
    return {
      ...node,
      children: filtered.map(cloneAndPrune),
    };
  };
  return cloneAndPrune(root);
}

const NAG_TO_PGN: Record<Exclude<MoveAnnotation, ''>, string> = {
  '!': '$1',
  '?': '$2',
  '!!': '$3',
  '??': '$4',
  '!?': '$5',
  '?!': '$6',
};

export function buildPGNFromReplayTree(params: {
  root: ReplayNode;
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

  const emitLine = (startNode: ReplayNode, forceMoveNumber: boolean) => {
    let curr: ReplayNode | null = startNode;
    let needMoveNumber = forceMoveNumber;

    while (curr) {
      const parentChildrenHolder = curr;
      if (parentChildrenHolder.isChessMove !== false) {
        const num = Math.max(1, parentChildrenHolder.turnNumber || 1);
        if (parentChildrenHolder.faction === 'white') {
          tokens.push(`${num}. ${parentChildrenHolder.san}`);
          needMoveNumber = false;
        } else if (needMoveNumber) {
          tokens.push(`${num}... ${parentChildrenHolder.san}`);
          needMoveNumber = false;
        } else {
          tokens.push(parentChildrenHolder.san);
        }
        if (parentChildrenHolder.nag) {
          tokens.push(NAG_TO_PGN[parentChildrenHolder.nag]);
        }
        const combinedComment = [parentChildrenHolder.comment, parentChildrenHolder.userComment]
          .filter(Boolean)
          .join(' · ')
          .replace(/[{}]/g, '');
        if (combinedComment) {
          tokens.push(`{${combinedComment}}`);
        }
      } else {
        const noteText = [
          parentChildrenHolder.san,
          parentChildrenHolder.comment,
          parentChildrenHolder.userComment,
        ]
          .filter(Boolean)
          .join(' · ')
          .replace(/[{}]/g, '');
        if (noteText) tokens.push(`{${noteText}}`);
      }

      // Emit variations branching at curr's children[1..]
      if (curr.children.length > 1) {
        for (let vIdx = 1; vIdx < curr.children.length; vIdx++) {
          tokens.push('(');
          emitLine(curr.children[vIdx], true);
          tokens.push(')');
          needMoveNumber = true;
        }
      }

      curr = curr.children[0] ?? null;
    }
  };

  if (params.root.children.length > 0) {
    emitLine(params.root.children[0], true);
    for (let v = 1; v < params.root.children.length; v++) {
      tokens.push('(');
      emitLine(params.root.children[v], true);
      tokens.push(')');
    }
  }

  tokens.push(params.result);

  const lines: string[] = [];
  let line = '';
  for (const tok of tokens) {
    if (!line) {
      line = tok;
    } else if (line.length + 1 + tok.length > 80) {
      lines.push(line);
      line = tok;
    } else {
      line += ` ${tok}`;
    }
  }
  if (line) lines.push(line);

  return `${headers.join('\n')}\n\n${lines.join('\n')}\n`;
}

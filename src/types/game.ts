export type CardColor = 'red' | 'blue' | 'green' | 'yellow';

export type CardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'draw2'
  | 'interdit'
  | 'revers'
  | 'wild'
  | 'wild-draw';

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
  pieceNumber: number; // 1..16 linking to chess piece identifiers
}

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export type Faction = 'white' | 'black';

export type PlayerId = 'p1' | 'p2';

export type GameMode = 'bot' | 'local' | 'online';

export type LocalPlayStyle = 'tabletop' | 'pass';

export type PreferredColor = 'random' | 'white' | 'black';

export type BotLevel = number; // 1..10 intelligence level

export const WILD_COLOR_PIECE_MAP: Record<CardColor, PieceType> = {
  red: 'queen',
  blue: 'rook',
  green: 'bishop',
  yellow: 'knight',
};

export const PIECE_BASE_COLOR_MAP: Record<PieceType, CardColor> = {
  rook: 'red',
  queen: 'red',
  bishop: 'blue',
  knight: 'blue',
  pawn: 'green',
  king: 'yellow',
};

export type MoveAnnotation = '!!' | '!' | '!?' | '?!' | '?' | '??' | '';

export interface MoveHistoryEntry {
  ply: number;
  turnNumber: number;
  faction: Faction;
  san: string;
  comment?: string;
  isChessMove: boolean;
  cardColor?: CardColor | '';
  cardValue?: CardValue | '';
  syncBonus?: boolean;
  duelEvent?: boolean;
  boardAfter?: string; // 128-char compact board snapshot
  fromSq?: string;
  toSq?: string;
  nag?: MoveAnnotation;
  userComment?: string;
}

export interface ReplayNode {
  id: string;
  ply: number;
  turnNumber: number;
  faction: Faction;
  san: string;
  boardStr: string;
  fromSq?: string;
  toSq?: string;
  nag?: MoveAnnotation;
  comment?: string;
  userComment?: string;
  cardColor?: CardColor | '';
  cardValue?: CardValue | '';
  syncBonus?: boolean;
  duelEvent?: boolean;
  isChessMove?: boolean;
  children: ReplayNode[];
}

export interface SavedMatchRecord {
  id: string;
  ownerUid: string;
  mode: GameMode;
  whiteName: string;
  blackName: string;
  whiteElo?: number | null;
  blackElo?: number | null;
  playerFaction: Faction;
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  outcome: 'win' | 'loss' | 'draw';
  reasonText: string;
  timeControlLabel: string;
  turnsPlayed: number;
  elapsedSeconds: number;
  eloDelta?: number | null;
  createdAtMs: number;
  moves: MoveHistoryEntry[];
  replayTree?: ReplayNode;
}

export type TimeControlCategory = 'unlimited' | 'bullet' | 'blitz' | 'rapid' | 'classical';

export interface TimeControlPreset {
  id: string;
  category: TimeControlCategory;
  label: string;
  minutes: number; // 0 = unlimited
  increment: number; // seconds per turn
}

export const TIME_CONTROL_PRESETS: TimeControlPreset[] = [
  { id: 'unlimited', category: 'unlimited', label: '∞', minutes: 0, increment: 0 },
  { id: '1+0', category: 'bullet', label: '1+0', minutes: 1, increment: 0 },
  { id: '1+1', category: 'bullet', label: '1+1', minutes: 1, increment: 1 },
  { id: '2+1', category: 'bullet', label: '2+1', minutes: 2, increment: 1 },
  { id: '3+0', category: 'blitz', label: '3+0', minutes: 3, increment: 0 },
  { id: '3+2', category: 'blitz', label: '3+2', minutes: 3, increment: 2 },
  { id: '5+0', category: 'blitz', label: '5+0', minutes: 5, increment: 0 },
  { id: '5+3', category: 'blitz', label: '5+3', minutes: 5, increment: 3 },
  { id: '10+0', category: 'rapid', label: '10+0', minutes: 10, increment: 0 },
  { id: '10+5', category: 'rapid', label: '10+5', minutes: 10, increment: 5 },
  { id: '15+10', category: 'rapid', label: '15+10', minutes: 15, increment: 10 },
  { id: '30+0', category: 'classical', label: '30+0', minutes: 30, increment: 0 },
  { id: '30+20', category: 'classical', label: '30+20', minutes: 30, increment: 20 },
];

export interface ChessPiece {
  id: string;
  type: PieceType;
  faction: Faction;
  pieceNumber: number; // 1..16 per faction
  hasMoved: boolean;
}

export interface Coord {
  row: number; // 0..7 (0 is Black's back rank, 7 is White's back rank)
  col: number; // 0..7 (0 is a-file, 7 is h-file)
}

export interface Move {
  from: Coord;
  to: Coord;
  isCapture?: boolean;
  isCastle?: 'king' | 'queen';
  isEnPassant?: boolean;
  promotionRequired?: boolean;
}

export type GamePhase =
  | 'TITLE_MENU'
  | 'DRAW_PHASE'
  | 'CARD_REVEALING'
  | 'MOVE_PHASE'
  | 'WILD_COLOR_CHOICE'
  | 'WILD_PLACE_PIECE_PHASE'
  | 'WILD_TELEPORT_PHASE'
  | 'WILD_PLUS4_CHOICE'
  | 'PLUS2_RECOVER_PHASE'
  | 'PLUS2_STEAL_PHASE'
  | 'PLUS4_ELIMINATE_PHASE'
  | 'PROMOTION_CHOICE'
  | 'REVERSING'
  | 'GAME_OVER';

export interface PendingPromotion {
  coord: Coord;
  faction: Faction;
}

export interface GameSnapshot {
  board: (ChessPiece | null)[][];
  capturedByWhite: ChessPiece[]; // Black pieces captured by White
  capturedByBlack: ChessPiece[]; // White pieces captured by Black
  exiledPieces: ChessPiece[]; // Permanently removed by Wild +4 Attack
  enPassantTarget: Coord | null;
}

export type TimeControlElos = Record<TimeControlCategory, number>;

export interface LichessTimeControlElos {
  bullet: number;
  blitz: number;
  rapid: number;
  classical: number;
}

export interface PlayerProfile {
  uid: string;
  nickname: string;
  elo: number;
  wins: number;
  losses: number;
  authType: 'device' | 'lichess';
  lichessUsername: string;
  lichessElo: number;
  elos: TimeControlElos;
  lichessElos: LichessTimeControlElos;
}

export function getTimeControlCategoryFromMinutes(minutes: number): TimeControlCategory {
  if (minutes <= 0) return 'unlimited';
  if (minutes <= 2) return 'bullet';
  if (minutes <= 5) return 'blitz';
  if (minutes <= 15) return 'rapid';
  return 'classical';
}

export function getProfileEloForCategory(
  profile: PlayerProfile | null | undefined,
  category: TimeControlCategory
): number {
  if (!profile) return 1200;
  const catElo = profile.elos?.[category];
  if (typeof catElo === 'number' && catElo >= 100) {
    return Math.round(catElo);
  }
  return Math.round(profile.elo || 1200);
}

export interface LobbyChallenge {
  id: string;
  creatorUid: string;
  creatorNickname: string;
  creatorElo: number;
  timeControlId: string;
  timeControlLabel: string;
  minutes: number;
  increment: number;
  preferredColor: PreferredColor;
  status: 'open' | 'matched' | 'cancelled';
  matchedMatchId: string;
  opponentUid: string;
}

export interface OnlineMatchDoc {
  id: string;
  inviteType: 'lobby' | 'magic_link';
  status: 'waiting' | 'active' | 'finished';
  hostUid: string;
  hostNickname: string;
  hostElo: number;
  guestUid: string;
  guestNickname: string;
  guestElo: number;
  timeControlId: string;
  timeControlLabel: string;
  minutes: number;
  increment: number;
  p1Uid: string;
  p2Uid: string;
  p1Faction: Faction;
  activePlayer: PlayerId;
  p1TimeMs: number;
  p2TimeMs: number;
  stateVersion: number;
  turnsPlayed: number;
  boardFlat: (ChessPiece | null)[];
  drawPile: Card[];
  discardPile: Card[];
  capturedWhitePieces: ChessPiece[];
  capturedBlackPieces: ChessPiece[];
  exiledPieces: ChessPiece[];
  enPassantTarget: Coord | null;
  currentCard: Card | null;
  cardFaceDown: boolean;
  phase: GamePhase;
  movesRemaining: number;
  skipOpponentTurns: number;
  wildTeleportPending: boolean;
  plus2Remaining: number;
  plus4Remaining: number;
  pendingWildPieceType: string;
  pendingPromotion: PendingPromotion | null;
  bannerKey: string;
  bannerParams?: Record<string, string | number>;
  winnerUid: string;
  winReasonKey: string;
  eloDelta: number;
  lastChainColor: CardColor | '';
  lastChainBy: PlayerId | '';
  isFirstMoveOfTurn: boolean;
  moveHistory: MoveHistoryEntry[];
  lastDuelText: string;
}

export const PIECE_LABELS_ES: Record<PieceType, string> = {
  king: 'Rey',
  queen: 'Dama',
  rook: 'Torre',
  bishop: 'Alfil',
  knight: 'Caballo',
  pawn: 'Peón',
};

export const COLOR_LABELS_ES: Record<CardColor, string> = {
  red: 'Rojo',
  blue: 'Azul',
  green: 'Verde',
  yellow: 'Amarillo',
};

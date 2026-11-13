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

export type GameMode = 'bot' | 'local';

export type LocalPlayStyle = 'tabletop' | 'pass';

export type BotLevel = number; // 1..10 intelligence level

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

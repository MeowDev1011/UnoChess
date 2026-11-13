import { Card, CardColor, CardValue } from '../types/game';

const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];

export function shuffleCards(cards: Card[]): Card[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  let seq = 1;
  let pieceCursor = 0;

  const nextPieceNum = () => {
    const n = (pieceCursor % 16) + 1;
    pieceCursor++;
    return n;
  };

  // Number cards 1-9 across all 4 colors (two copies of 1-4, one copy of 5-9 per color)
  for (const color of COLORS) {
    deck.push({ id: `c-${seq++}`, color, value: '0', pieceNumber: nextPieceNum() });

    const lowNums: CardValue[] = ['1', '2', '3', '4'];
    for (const v of lowNums) {
      deck.push({ id: `c-${seq++}`, color, value: v, pieceNumber: nextPieceNum() });
      deck.push({ id: `c-${seq++}`, color, value: v, pieceNumber: nextPieceNum() });
    }

    const highNums: CardValue[] = ['5', '6', '7', '8', '9'];
    for (const v of highNums) {
      deck.push({ id: `c-${seq++}`, color, value: v, pieceNumber: nextPieceNum() });
    }

    // Action cards (1 of each per color -> 2 of draw2, interdit, revers across deck? Let's put 2 per color for lively action!)
    deck.push({ id: `c-${seq++}`, color, value: 'draw2', pieceNumber: nextPieceNum() });
    deck.push({ id: `c-${seq++}`, color, value: 'interdit', pieceNumber: nextPieceNum() });
    deck.push({ id: `c-${seq++}`, color, value: 'revers', pieceNumber: nextPieceNum() });
  }

  // Wild cards (4 of each, assigned rotating base colors until player selects)
  for (let i = 0; i < 4; i++) {
    deck.push({
      id: `c-${seq++}`,
      color: COLORS[i % 4],
      value: 'wild',
      pieceNumber: nextPieceNum(),
    });
    deck.push({
      id: `c-${seq++}`,
      color: COLORS[(i + 2) % 4],
      value: 'wild-draw',
      pieceNumber: nextPieceNum(),
    });
  }

  return shuffleCards(deck);
}

export function getCardValueAsset(value: CardValue): string {
  if (value === '0') return '/assets/image.png';
  return `/assets/${value}.png`;
}

export function getColorBaseAsset(color: CardColor): string {
  return `/assets/${color}-base.png`;
}

export function getCardTitleEs(value: CardValue): string {
  switch (value) {
    case '0':
      return 'Carta 0 · Pierdes el Turno';
    case 'draw2':
      return 'Carta +2 · Recuperación o Robo';
    case 'interdit':
      return 'Bloqueo · Anula Turno Rival';
    case 'revers':
      return 'Cambio de Ronda · Giro 180°';
    case 'wild':
      return 'Comodín · Movimiento + Teletransporte';
    case 'wild-draw':
      return 'Comodín +4 · Ataque o Asalto';
    default:
      return `Carta ${value} · ${value} ${value === '1' ? 'Movimiento' : 'Movimientos'}`;
  }
}

export function getCardDescriptionEs(value: CardValue): string {
  switch (value) {
    case '0':
      return 'Cero movimientos disponibles. El turno pasa inmediatamente al oponente.';
    case 'draw2':
      return 'Si tienes piezas capturadas, recupera hasta 2 en tus primeras dos filas. Si tienes 0 capturadas, roba piezas del rival según jerarquía.';
    case 'interdit':
      return 'Realiza 1 movimiento normal, anula el siguiente turno rival y roba inmediatamente otra carta.';
    case 'revers':
      return 'El tablero gira 180° y ambos jugadores intercambian de bando de forma permanente.';
    case 'wild':
      return 'Elige color, realiza 1 movimiento normal y teletransporta una de tus piezas a cualquier casilla vacía.';
    case 'wild-draw':
      return 'Elige entre Modo Ataque (elimina 4 piezas rivales por jerarquía) o Modo Acción (4 movimientos + Bloqueo).';
    default:
      return `Realiza exactamente ${value} ${value === '1' ? 'movimiento consecutivo' : 'movimientos consecutivos'} con tus piezas.`;
  }
}

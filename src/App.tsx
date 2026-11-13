import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Clock, Layers, Pause, ShieldAlert, Sparkles, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BotLevel,
  Card,
  CardColor,
  CardValue,
  ChessPiece,
  Coord,
  Faction,
  GameMode,
  GamePhase,
  LocalPlayStyle,
  Move,
  PendingPromotion,
  PieceType,
  PlayerId,
  TIME_CONTROL_PRESETS,
  TimeControlPreset,
} from './types/game';
import {
  applyMoveToBoard,
  chooseBotMove,
  chooseBotPlus4Mode,
  chooseBotTeleport,
  chooseBotWildColor,
  cloneBoard,
  createInitialBoard,
  getEmptyHomeRows,
  getHighestPriorityEnemyCoords,
  getUnoChessLegalMoves,
  isCheckmate,
  isInCheck,
  oppositeFaction,
} from './engine/chess';
import { createDeck, shuffleCards } from './engine/deck';
import { sound } from './utils/audio';
import { OrientationLock } from './components/OrientationLock';
import { StartScreen } from './components/StartScreen';
import { ChessBoard } from './components/ChessBoard';
import { LayeredCard } from './components/LayeredCard';
import { ChessPieceGraphic } from './components/ChessPieceGraphic';
import { PauseModal } from './components/PauseModal';
import { CardGuideModal } from './components/CardGuideModal';
import {
  GameOverModal,
  PromotionModal,
  WildColorModal,
  WildPlus4Modal,
} from './components/SpecialModals';

export default function App() {
  const { t } = useTranslation();

  // Desktop narrow-frame bypass state for OrientationLock
  const [desktopBypassed, setDesktopBypassed] = useState(false);

  // Game setup & mode
  const [mode, setMode] = useState<GameMode>('bot');
  const [botLevel, setBotLevel] = useState<BotLevel>(6);
  const [playerColor, setPlayerColor] = useState<Faction>('white');
  const [localPlayStyle, setLocalPlayStyle] = useState<LocalPlayStyle>('tabletop');
  const [timeControl, setTimeControl] = useState<TimeControlPreset>(TIME_CONTROL_PRESETS[0]);

  // Core game state machine
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [isPaused, setIsPaused] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Board & pieces
  const [board, setBoard] = useState<(ChessPiece | null)[][]>(() => createInitialBoard());
  const [capturedWhitePieces, setCapturedWhitePieces] = useState<ChessPiece[]>([]);
  const [capturedBlackPieces, setCapturedBlackPieces] = useState<ChessPiece[]>([]);
  const [exiledPieces, setExiledPieces] = useState<ChessPiece[]>([]);
  const [enPassantTarget, setEnPassantTarget] = useState<Coord | null>(null);

  // Player / Faction mapping (swaps permanently on Revers!)
  const [p1Faction, setP1Faction] = useState<Faction>('white');
  const [activePlayer, setActivePlayer] = useState<PlayerId>('p1');
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  // Deck & Card state
  const [drawPile, setDrawPile] = useState<Card[]>(() => createDeck());
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [cardFaceDown, setCardFaceDown] = useState(true);

  // Turn execution counters
  const [movesRemaining, setMovesRemaining] = useState(0);
  const [skipOpponentTurns, setSkipOpponentTurns] = useState(0);
  const [wildTeleportPending, setWildTeleportPending] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<Coord | null>(null);

  // +2 & +4 interactive states
  const [plus2Remaining, setPlus2Remaining] = useState(0);
  const [selectedRecoverId, setSelectedRecoverId] = useState<string | null>(null);
  const [selectedStealCoord, setSelectedStealCoord] = useState<Coord | null>(null);
  const [plus4Remaining, setPlus4Remaining] = useState(0);

  // Promotion
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [promotionSavedMovesAfter, setPromotionSavedMovesAfter] = useState(0);

  // Status, Timer, Clocks, Winner
  const [bannerMsg, setBannerMsg] = useState<string>(() => t('bannerDrawStart'));
  const [turnsPlayed, setTurnsPlayed] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [p1TimeMs, setP1TimeMs] = useState(0);
  const [p2TimeMs, setP2TimeMs] = useState(0);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState('');

  // Audio UI state synced from Web Audio engine
  const [audioState, setAudioState] = useState(() => sound.getState());
  const syncAudioState = () => setAudioState({ ...sound.getState() });

  // Derived factions & labels
  const p2Faction = oppositeFaction(p1Faction);
  const activeFaction: Faction = activePlayer === 'p1' ? p1Faction : p2Faction;
  const enemyFaction: Faction = oppositeFaction(activeFaction);

  const playerLabel = useCallback(
    (pid: PlayerId) => {
      if (mode === 'bot') {
        return pid === 'p1' ? t('you') : t('botAi');
      }
      return pid === 'p1' ? t('player1') : t('player2');
    },
    [mode, t]
  );

  const pieceLabel = useCallback(
    (type: PieceType) => {
      switch (type) {
        case 'king':
          return t('pieceKing');
        case 'queen':
          return t('pieceQueen');
        case 'rook':
          return t('pieceRook');
        case 'bishop':
          return t('pieceBishop');
        case 'knight':
          return t('pieceKnight');
        case 'pawn':
          return t('piecePawn');
      }
    },
    [t]
  );

  const cardTitle = useCallback(
    (value: CardValue) => {
      switch (value) {
        case '0':
          return t('card0Title');
        case 'draw2':
          return t('cardDraw2Title');
        case 'interdit':
          return t('cardInterditTitle');
        case 'revers':
          return t('cardReversTitle');
        case 'wild':
          return t('cardWildTitle');
        case 'wild-draw':
          return t('cardWildDrawTitle');
        default:
          return t('cardNumTitle', { num: value });
      }
    },
    [t]
  );

  const cardDesc = useCallback(
    (value: CardValue) => {
      switch (value) {
        case '0':
          return t('card0Desc');
        case 'draw2':
          return t('cardDraw2Desc');
        case 'interdit':
          return t('cardInterditDesc');
        case 'revers':
          return t('cardReversDesc');
        case 'wild':
          return t('cardWildDesc');
        case 'wild-draw':
          return t('cardWildDrawDesc');
        default:
          return t('cardNumDesc', { num: value });
      }
    },
    [t]
  );

  const isHumanTurn = mode === 'local' || activePlayer === 'p1';

  const checkedFaction: Faction | null = useMemo(() => {
    if (isInCheck(board, 'white')) return 'white';
    if (isInCheck(board, 'black')) return 'black';
    return null;
  }, [board]);

  const ownCapturedPieces = useMemo(
    () => (activeFaction === 'white' ? capturedWhitePieces : capturedBlackPieces),
    [activeFaction, capturedWhitePieces, capturedBlackPieces]
  );

  // Elapsed timer
  useEffect(() => {
    if (phase === 'TITLE_MENU' || phase === 'GAME_OVER' || isPaused) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [phase, isPaused]);

  // Dual Chess Clocks (Bullet -> Classical)
  useEffect(() => {
    if (
      timeControl.minutes <= 0 ||
      isPaused ||
      phase === 'TITLE_MENU' ||
      phase === 'GAME_OVER' ||
      phase === 'REVERSING' ||
      phase === 'CARD_REVEALING'
    ) {
      return;
    }

    let lastTick = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;
      if (delta <= 0) return;

      if (activePlayer === 'p1') {
        setP1TimeMs((prev) => Math.max(0, prev - delta));
      } else {
        setP2TimeMs((prev) => Math.max(0, prev - delta));
      }
    }, 100);

    return () => clearInterval(id);
  }, [activePlayer, isPaused, phase, timeControl.minutes]);

  // Detect clock flag / timeout victory
  useEffect(() => {
    if (timeControl.minutes <= 0 || phase === 'TITLE_MENU' || phase === 'GAME_OVER') return;
    if (p1TimeMs <= 0) {
      sound.playCheckmate();
      setWinnerName(playerLabel('p2'));
      setGameOverReason(t('bannerTimeoutWin'));
      setPhase('GAME_OVER');
    } else if (p2TimeMs <= 0) {
      sound.playCheckmate();
      setWinnerName(playerLabel('p1'));
      setGameOverReason(t('bannerTimeoutWin'));
      setPhase('GAME_OVER');
    }
  }, [p1TimeMs, p2TimeMs, phase, playerLabel, t, timeControl.minutes]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatPlayerClock = (ms: number) => {
    if (timeControl.minutes <= 0) return '∞';
    const clamped = Math.max(0, ms);
    if (clamped < 20000) {
      const secs = Math.floor(clamped / 1000);
      const tenths = Math.floor((clamped % 1000) / 100);
      return `00:${String(secs).padStart(2, '0')}.${tenths}`;
    }
    const totalSecs = Math.ceil(clamped / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const startNewGame = useCallback(() => {
    sound.unlock();
    sound.startMusic();
    sound.playShuffle();
    syncAudioState();

    // White always moves first in chess
    const startingPlayer: PlayerId = playerColor === 'white' ? 'p1' : 'p2';
    // In 1P or 2P tabletop: place Player 1's chosen color at the bottom initially
    // In 2P pass-and-play: active player (White on move 1) sits at the bottom
    const initialFlipped =
      mode === 'local' && localPlayStyle === 'pass'
        ? false
        : playerColor === 'black';
    const initialClockMs = timeControl.minutes * 60 * 1000;

    setBoard(createInitialBoard());
    setCapturedWhitePieces([]);
    setCapturedBlackPieces([]);
    setExiledPieces([]);
    setEnPassantTarget(null);
    setP1Faction(playerColor);
    setActivePlayer(startingPlayer);
    setBoardFlipped(initialFlipped);
    setIsSpinning(false);

    setDrawPile(createDeck());
    setDiscardPile([]);
    setCurrentCard(null);
    setCardFaceDown(true);

    setMovesRemaining(0);
    setSkipOpponentTurns(0);
    setWildTeleportPending(false);
    setSelectedCoord(null);
    setPlus2Remaining(0);
    setSelectedRecoverId(null);
    setSelectedStealCoord(null);
    setPlus4Remaining(0);
    setPendingPromotion(null);

    setTurnsPlayed(1);
    setElapsedSeconds(0);
    setP1TimeMs(initialClockMs);
    setP2TimeMs(initialClockMs);
    setWinnerName(null);
    setGameOverReason('');
    setIsPaused(false);
    setPhase('DRAW_PHASE');
    setBannerMsg(
      startingPlayer === 'p1'
        ? t('bannerDrawStart')
        : t('bannerTurnOf', { name: playerLabel(startingPlayer) })
    );
  }, [localPlayStyle, mode, playerColor, playerLabel, t, timeControl.minutes]);

  const endTurn = useCallback(
    (latestBoard: (ChessPiece | null)[][], lastCard: Card | null) => {
      const enemy = oppositeFaction(activeFaction);
      const enemyKingExists = latestBoard.some((r) =>
        r.some((p) => p && p.faction === enemy && p.type === 'king')
      );

      if (!enemyKingExists || isCheckmate(latestBoard, enemy)) {
        sound.playCheckmate();
        setWinnerName(playerLabel(activePlayer));
        setGameOverReason(t('bannerMateWin'));
        setPhase('GAME_OVER');
        return;
      }

      if (lastCard) {
        setDiscardPile((prev) => [...prev, lastCard]);
      }

      if (timeControl.minutes > 0 && timeControl.increment > 0) {
        const incMs = timeControl.increment * 1000;
        if (activePlayer === 'p1') {
          setP1TimeMs((prev) => prev + incMs);
        } else {
          setP2TimeMs((prev) => prev + incMs);
        }
      }

      setSelectedCoord(null);
      setWildTeleportPending(false);
      setCurrentCard(null);
      setCardFaceDown(true);

      if (skipOpponentTurns > 0) {
        setSkipOpponentTurns((s) => s - 1);
        setPhase('DRAW_PHASE');
        setBannerMsg(t('bannerBlockedExtra', { name: playerLabel(activePlayer) }));
      } else {
        const nextPlayer: PlayerId = activePlayer === 'p1' ? 'p2' : 'p1';
        const nextFac = nextPlayer === 'p1' ? p1Faction : oppositeFaction(p1Faction);
        setActivePlayer(nextPlayer);
        setTurnsPlayed((tp) => tp + 1);
        setPhase('DRAW_PHASE');

        // In 2-player pass-device mode, flip board so next player's pieces are at bottom
        if (mode === 'local' && localPlayStyle === 'pass') {
          setBoardFlipped(nextFac === 'black');
        }

        if (isInCheck(latestBoard, nextFac)) {
          setBannerMsg(t('bannerCheckTurn', { name: playerLabel(nextPlayer) }));
        } else {
          setBannerMsg(t('bannerTurnOf', { name: playerLabel(nextPlayer) }));
        }
      }
    },
    [
      activeFaction,
      activePlayer,
      localPlayStyle,
      mode,
      p1Faction,
      playerLabel,
      skipOpponentTurns,
      t,
      timeControl.increment,
      timeControl.minutes,
    ]
  );

  const triggerReversCard = useCallback(
    (card: Card) => {
      sound.playRotate();
      setPhase('REVERSING');
      setIsSpinning(true);
      setBannerMsg(t('bannerRevers'));

      window.setTimeout(() => {
        if (timeControl.minutes > 0 && timeControl.increment > 0) {
          const incMs = timeControl.increment * 1000;
          if (activePlayer === 'p1') {
            setP1TimeMs((prev) => prev + incMs);
          } else {
            setP2TimeMs((prev) => prev + incMs);
          }
        }

        const newP1Faction = oppositeFaction(p1Faction);
        setP1Faction(newP1Faction);
        setIsSpinning(false);

        setDiscardPile((prev) => [...prev, card]);
        setCurrentCard(null);
        setCardFaceDown(true);
        setSelectedCoord(null);

        const nextPlayer: PlayerId = activePlayer === 'p1' ? 'p2' : 'p1';
        const nextFac = nextPlayer === 'p1' ? newP1Faction : oppositeFaction(newP1Faction);

        if (mode === 'local' && localPlayStyle === 'pass') {
          setBoardFlipped(nextFac === 'black');
        } else {
          setBoardFlipped((f) => !f);
        }

        setActivePlayer(nextPlayer);
        setTurnsPlayed((tp) => tp + 1);
        setPhase('DRAW_PHASE');

        if (isInCheck(board, nextFac)) {
          sound.playCheck();
          setBannerMsg(t('bannerReversCheck', { name: playerLabel(nextPlayer) }));
        } else {
          setBannerMsg(t('bannerReversDone', { name: playerLabel(nextPlayer) }));
        }
      }, 750);
    },
    [
      activePlayer,
      board,
      localPlayStyle,
      mode,
      p1Faction,
      playerLabel,
      t,
      timeControl.increment,
      timeControl.minutes,
    ]
  );

  const resolveDrawnCard = useCallback(
    (card: Card) => {
      const val = card.value;

      if (val === '0') {
        setBannerMsg(t('bannerCard0'));
        window.setTimeout(() => {
          endTurn(board, card);
        }, 1150);
        return;
      }

      if (val === 'revers') {
        triggerReversCard(card);
        return;
      }

      if (val === 'interdit') {
        sound.playSpecial();
        setSkipOpponentTurns((s) => s + 1);
        setMovesRemaining(1);
        setPhase('MOVE_PHASE');
        setBannerMsg(t('bannerInterdit'));
        return;
      }

      if (val === 'wild') {
        sound.playSpecial();
        setPhase('WILD_COLOR_CHOICE');
        setBannerMsg(t('bannerWildColor'));
        return;
      }

      if (val === 'wild-draw') {
        sound.playSpecial();
        setPhase('WILD_PLUS4_CHOICE');
        setBannerMsg(t('bannerWildPlus4'));
        return;
      }

      if (val === 'draw2') {
        sound.playSpecial();
        const emptyHome = getEmptyHomeRows(board, activeFaction);

        if (ownCapturedPieces.length > 0) {
          if (emptyHome.length === 0) {
            setMovesRemaining(2);
            setPhase('MOVE_PHASE');
            setBannerMsg(t('bannerPlus2NoSpace'));
          } else {
            const count = Math.min(2, ownCapturedPieces.length, emptyHome.length);
            setPlus2Remaining(count);
            setSelectedRecoverId(null);
            setPhase('PLUS2_RECOVER_PHASE');
            setBannerMsg(t('bannerPlus2Recover', { count }));
          }
          return;
        }

        const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
        if (prio.tier === 4) {
          setMovesRemaining(2);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerPlus2OnlyKing'));
        } else if (emptyHome.length === 0) {
          setMovesRemaining(2);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerPlus2NoSpace'));
        } else {
          const stealQuota = prio.tier === 3 ? 1 : Math.min(2, emptyHome.length);
          setPlus2Remaining(stealQuota);
          setSelectedStealCoord(null);
          setPhase('PLUS2_STEAL_PHASE');
          const tierName =
            prio.tier === 1
              ? t('bannerTier1')
              : prio.tier === 2
              ? t('bannerTier2')
              : t('bannerTier3');
          setBannerMsg(t('bannerPlus2Steal', { tier: tierName }));
        }
        return;
      }

      const num = parseInt(val, 10);
      setMovesRemaining(num);
      setPhase('MOVE_PHASE');
      const legal = getUnoChessLegalMoves(board, activeFaction, enPassantTarget, num);
      if (legal.length === 0) {
        if (isInCheck(board, activeFaction)) {
          sound.playCheckmate();
          setWinnerName(playerLabel(activePlayer === 'p1' ? 'p2' : 'p1'));
          setGameOverReason(t('bannerMateWin'));
          setPhase('GAME_OVER');
        } else {
          setBannerMsg(t('bannerNoMovesEnd'));
          window.setTimeout(() => endTurn(board, card), 900);
        }
        return;
      }
      setBannerMsg(t('bannerMovesRemaining', { count: num }));
    },
    [
      activeFaction,
      activePlayer,
      board,
      enPassantTarget,
      endTurn,
      enemyFaction,
      ownCapturedPieces.length,
      playerLabel,
      t,
      triggerReversCard,
    ]
  );

  const handleDrawCard = useCallback(() => {
    if (phase !== 'DRAW_PHASE' || isPaused) return;
    sound.unlock();

    let workingDeck = [...drawPile];
    let reshuffled = false;
    if (workingDeck.length === 0) {
      if (discardPile.length === 0) {
        workingDeck = createDeck();
      } else {
        workingDeck = shuffleCards(discardPile);
        setDiscardPile([]);
      }
      reshuffled = true;
      sound.playShuffle();
    }

    const [drawn, ...rest] = workingDeck;
    setDrawPile(rest);
    setCurrentCard(drawn);
    setCardFaceDown(true);
    setPhase('CARD_REVEALING');
    if (reshuffled) {
      setBannerMsg(t('bannerReshuffle'));
    } else {
      setBannerMsg(t('bannerDrawing', { name: playerLabel(activePlayer) }));
    }

    sound.playDraw();

    window.setTimeout(() => {
      setCardFaceDown(false);
    }, 90);

    window.setTimeout(() => {
      resolveDrawnCard(drawn);
    }, 620);
  }, [activePlayer, discardPile, drawPile, isPaused, phase, playerLabel, resolveDrawnCard, t]);

  const executeMove = useCallback(
    (move: Move, promoType: PieceType = 'queen', overrideRemaining?: number) => {
      const movingPiece = board[move.from.row][move.from.col];
      if (!movingPiece) return;

      if (move.promotionRequired && isHumanTurn && overrideRemaining === undefined) {
        const { nextBoard, capturedPiece, nextEnPassant } = applyMoveToBoard(
          board,
          move,
          'queen'
        );
        if (capturedPiece) {
          sound.playCapture();
          if (capturedPiece.faction === 'white') {
            setCapturedWhitePieces((prev) => [...prev, capturedPiece]);
          } else {
            setCapturedBlackPieces((prev) => [...prev, capturedPiece]);
          }
        } else {
          sound.playMove();
        }
        setBoard(nextBoard);
        setEnPassantTarget(nextEnPassant);
        setSelectedCoord(null);
        setPendingPromotion({ coord: move.to, faction: movingPiece.faction });
        setPromotionSavedMovesAfter(movesRemaining - 1);
        setPhase('PROMOTION_CHOICE');
        return;
      }

      const { nextBoard, capturedPiece, nextEnPassant } = applyMoveToBoard(
        board,
        move,
        promoType
      );

      if (capturedPiece) {
        sound.playCapture();
        if (capturedPiece.faction === 'white') {
          setCapturedWhitePieces((prev) => [...prev, capturedPiece]);
        } else {
          setCapturedBlackPieces((prev) => [...prev, capturedPiece]);
        }
      } else {
        sound.playMove();
      }

      setBoard(nextBoard);
      setEnPassantTarget(nextEnPassant);
      setSelectedCoord(null);

      const rem = overrideRemaining !== undefined ? overrideRemaining : movesRemaining - 1;
      const enemy = oppositeFaction(movingPiece.faction);
      const enemyKingAlive = nextBoard.some((r) =>
        r.some((p) => p && p.faction === enemy && p.type === 'king')
      );

      if (!enemyKingAlive) {
        sound.playCheckmate();
        setWinnerName(playerLabel(activePlayer));
        setGameOverReason(t('bannerKingCaptured'));
        setPhase('GAME_OVER');
        return;
      }

      if (rem <= 0) {
        if (isCheckmate(nextBoard, enemy)) {
          sound.playCheckmate();
          setWinnerName(playerLabel(activePlayer));
          setGameOverReason(t('bannerMateWin'));
          setPhase('GAME_OVER');
          return;
        }
        if (isInCheck(nextBoard, enemy)) {
          sound.playCheck();
        }

        if (wildTeleportPending) {
          setMovesRemaining(0);
          setPhase('WILD_TELEPORT_PHASE');
          setBannerMsg(t('bannerWildStep2'));
        } else {
          setMovesRemaining(0);
          endTurn(nextBoard, currentCard);
        }
      } else {
        setMovesRemaining(rem);
        const nextLegal = getUnoChessLegalMoves(nextBoard, activeFaction, nextEnPassant, rem);
        if (nextLegal.length === 0) {
          if (wildTeleportPending) {
            setMovesRemaining(0);
            setPhase('WILD_TELEPORT_PHASE');
            setBannerMsg(t('bannerWildStep2'));
          } else {
            endTurn(nextBoard, currentCard);
          }
          return;
        }
        if (isInCheck(nextBoard, enemy)) {
          sound.playCheck();
          setBannerMsg(t('bannerCheckRemaining', { count: rem }));
        } else {
          setBannerMsg(t('bannerMovesRemaining', { count: rem }));
        }
      }
    },
    [
      activeFaction,
      activePlayer,
      board,
      currentCard,
      endTurn,
      isHumanTurn,
      movesRemaining,
      playerLabel,
      t,
      wildTeleportPending,
    ]
  );

  const handleSelectPromotion = (type: PieceType) => {
    if (!pendingPromotion) return;
    sound.playSpecial();
    const nextBoard = cloneBoard(board);
    const piece = nextBoard[pendingPromotion.coord.row][pendingPromotion.coord.col];
    if (piece) {
      nextBoard[pendingPromotion.coord.row][pendingPromotion.coord.col] = {
        ...piece,
        type,
      };
    }
    setBoard(nextBoard);
    setPendingPromotion(null);

    const enemy = oppositeFaction(pendingPromotion.faction);
    if (promotionSavedMovesAfter <= 0) {
      if (isCheckmate(nextBoard, enemy)) {
        sound.playCheckmate();
        setWinnerName(playerLabel(activePlayer));
        setGameOverReason(t('bannerPromoMate'));
        setPhase('GAME_OVER');
        return;
      }
      if (wildTeleportPending) {
        setMovesRemaining(0);
        setPhase('WILD_TELEPORT_PHASE');
        setBannerMsg(t('bannerWildStep2'));
      } else {
        setMovesRemaining(0);
        endTurn(nextBoard, currentCard);
      }
    } else {
      setMovesRemaining(promotionSavedMovesAfter);
      setPhase('MOVE_PHASE');
      setBannerMsg(t('bannerMovesRemaining', { count: promotionSavedMovesAfter }));
    }
  };

  const allLegalMoves = useMemo(() => {
    if (phase !== 'MOVE_PHASE') return [];
    return getUnoChessLegalMoves(board, activeFaction, enPassantTarget, movesRemaining);
  }, [activeFaction, board, enPassantTarget, movesRemaining, phase]);

  const legalMovesForSelected = useMemo(() => {
    if (!selectedCoord || phase !== 'MOVE_PHASE') return [];
    return allLegalMoves.filter(
      (m) => m.from.row === selectedCoord.row && m.from.col === selectedCoord.col
    );
  }, [allLegalMoves, phase, selectedCoord]);

  const { highlightCoords, highlightMode } = useMemo<{
    highlightCoords: Coord[];
    highlightMode: 'none' | 'place' | 'target-enemy' | 'teleport-dest' | 'select-own';
  }>(() => {
    if (phase === 'PLUS2_RECOVER_PHASE') {
      if (selectedRecoverId) {
        return {
          highlightCoords: getEmptyHomeRows(board, activeFaction),
          highlightMode: 'place',
        };
      }
      return { highlightCoords: [], highlightMode: 'none' };
    }

    if (phase === 'PLUS2_STEAL_PHASE') {
      if (!selectedStealCoord) {
        const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
        return { highlightCoords: prio.coords, highlightMode: 'target-enemy' };
      }
      return {
        highlightCoords: getEmptyHomeRows(board, activeFaction),
        highlightMode: 'place',
      };
    }

    if (phase === 'PLUS4_ELIMINATE_PHASE') {
      const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
      return { highlightCoords: prio.coords, highlightMode: 'target-enemy' };
    }

    if (phase === 'WILD_TELEPORT_PHASE') {
      if (!selectedCoord) {
        const own: Coord[] = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (board[r][c]?.faction === activeFaction) own.push({ row: r, col: c });
          }
        }
        return { highlightCoords: own, highlightMode: 'select-own' };
      } else {
        const empties: Coord[] = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (!board[r][c]) {
              const test = cloneBoard(board);
              test[r][c] = test[selectedCoord.row][selectedCoord.col];
              test[selectedCoord.row][selectedCoord.col] = null;
              if (!isInCheck(test, activeFaction)) {
                empties.push({ row: r, col: c });
              }
            }
          }
        }
        return { highlightCoords: empties, highlightMode: 'teleport-dest' };
      }
    }

    return { highlightCoords: [], highlightMode: 'none' };
  }, [
    activeFaction,
    board,
    enemyFaction,
    phase,
    selectedCoord,
    selectedRecoverId,
    selectedStealCoord,
  ]);

  const handleSquareClick = (coord: Coord) => {
    if (!isHumanTurn || isPaused) return;
    const clickedPiece = board[coord.row][coord.col];

    if (phase === 'MOVE_PHASE') {
      if (selectedCoord) {
        const chosenMove = legalMovesForSelected.find(
          (m) => m.to.row === coord.row && m.to.col === coord.col
        );
        if (chosenMove) {
          executeMove(chosenMove);
          return;
        }
      }

      if (clickedPiece && clickedPiece.faction === activeFaction) {
        const hasMoves = allLegalMoves.some(
          (m) => m.from.row === coord.row && m.from.col === coord.col
        );
        if (hasMoves) {
          sound.playClick();
          setSelectedCoord(coord);
        } else {
          setSelectedCoord(null);
          if (isInCheck(board, activeFaction)) {
            setBannerMsg(t('bannerCheckProtect'));
          }
        }
      } else {
        setSelectedCoord(null);
      }
      return;
    }

    if (phase === 'WILD_TELEPORT_PHASE') {
      if (
        selectedCoord &&
        highlightCoords.some((h) => h.row === coord.row && h.col === coord.col)
      ) {
        const nextBoard = cloneBoard(board);
        const moving = nextBoard[selectedCoord.row][selectedCoord.col];
        if (!moving) return;
        nextBoard[selectedCoord.row][selectedCoord.col] = null;
        nextBoard[coord.row][coord.col] = { ...moving, hasMoved: true };
        sound.playSpecial();
        setBoard(nextBoard);
        setSelectedCoord(null);
        setWildTeleportPending(false);
        endTurn(nextBoard, currentCard);
        return;
      }
      if (clickedPiece && clickedPiece.faction === activeFaction) {
        sound.playClick();
        setSelectedCoord(coord);
        setBannerMsg(t('bannerTeleportSelect'));
      }
      return;
    }

    if (phase === 'PLUS2_RECOVER_PHASE') {
      if (
        selectedRecoverId &&
        highlightCoords.some((h) => h.row === coord.row && h.col === coord.col)
      ) {
        const recovered = ownCapturedPieces.find((p) => p.id === selectedRecoverId);
        if (!recovered) return;
        const nextBoard = cloneBoard(board);
        nextBoard[coord.row][coord.col] = { ...recovered, hasMoved: true };
        sound.playSpecial();
        setBoard(nextBoard);

        if (activeFaction === 'white') {
          setCapturedWhitePieces((prev) => prev.filter((p) => p.id !== selectedRecoverId));
        } else {
          setCapturedBlackPieces((prev) => prev.filter((p) => p.id !== selectedRecoverId));
        }

        const rem = plus2Remaining - 1;
        setSelectedRecoverId(null);
        const nextEmpties = getEmptyHomeRows(nextBoard, activeFaction);
        const remainingCapturedCount = ownCapturedPieces.length - 1;
        if (rem <= 0 || nextEmpties.length === 0 || remainingCapturedCount <= 0) {
          setPlus2Remaining(0);
          endTurn(nextBoard, currentCard);
        } else {
          setPlus2Remaining(rem);
          setBannerMsg(t('bannerRecoveredMore', { count: rem }));
        }
      }
      return;
    }

    if (phase === 'PLUS2_STEAL_PHASE') {
      const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
      if (prio.coords.some((c) => c.row === coord.row && c.col === coord.col)) {
        sound.playClick();
        setSelectedStealCoord(coord);
        setBannerMsg(t('bannerStealSquare'));
        return;
      }
      if (
        selectedStealCoord &&
        highlightCoords.some((h) => h.row === coord.row && h.col === coord.col)
      ) {
        const stolen = board[selectedStealCoord.row][selectedStealCoord.col];
        if (!stolen) return;
        const nextBoard = cloneBoard(board);
        nextBoard[selectedStealCoord.row][selectedStealCoord.col] = null;
        nextBoard[coord.row][coord.col] = {
          ...stolen,
          faction: activeFaction,
          hasMoved: true,
        };
        sound.playCapture();
        setBoard(nextBoard);
        setSelectedStealCoord(null);

        const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
        const nextEmpties = getEmptyHomeRows(nextBoard, activeFaction);
        const wasTier3 = stolen.type === 'rook' || stolen.type === 'queen';
        const rem = wasTier3 ? 0 : plus2Remaining - 1;

        if (rem <= 0 || nextPrio.tier === 4 || nextEmpties.length === 0) {
          setPlus2Remaining(0);
          endTurn(nextBoard, currentCard);
        } else {
          const cappedRem = nextPrio.tier === 3 ? 1 : rem;
          setPlus2Remaining(cappedRem);
          setBannerMsg(t('bannerStolenMore', { count: cappedRem }));
        }
      }
      return;
    }

    if (phase === 'PLUS4_ELIMINATE_PHASE') {
      const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
      if (prio.coords.some((c) => c.row === coord.row && c.col === coord.col)) {
        const victim = board[coord.row][coord.col];
        if (!victim) return;
        const nextBoard = cloneBoard(board);
        nextBoard[coord.row][coord.col] = null;
        sound.playCapture();
        setBoard(nextBoard);
        setExiledPieces((prev) => [...prev, victim]);

        const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
        const rem = plus4Remaining - 1;
        if (rem <= 0 || nextPrio.tier === 4) {
          setPlus4Remaining(0);
          endTurn(nextBoard, currentCard);
        } else {
          setPlus4Remaining(rem);
          setBannerMsg(t('bannerEliminatedMore', { count: rem }));
        }
      }
    }
  };

  const handleSelectWildColor = useCallback(
    (color: CardColor) => {
      sound.playSpecial();
      if (currentCard) {
        setCurrentCard({ ...currentCard, color });
      }
      setWildTeleportPending(true);
      setMovesRemaining(1);
      setPhase('MOVE_PHASE');
      setBannerMsg(t('bannerWildStep1'));
    },
    [currentCard, t]
  );

  const handleSelectPlus4Mode = useCallback(
    (selectedMode: 'attack' | 'action') => {
      sound.playSpecial();
      if (selectedMode === 'attack') {
        const nonKingCount = board
          .flat()
          .filter((p) => p && p.faction === enemyFaction && p.type !== 'king').length;
        const quota = Math.min(4, nonKingCount);
        if (quota <= 0) {
          setSkipOpponentTurns((s) => s + 1);
          setMovesRemaining(4);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerPlus4Action'));
          return;
        }
        setPlus4Remaining(quota);
        setPhase('PLUS4_ELIMINATE_PHASE');
        setBannerMsg(t('bannerPlus4Attack', { count: quota }));
      } else {
        setSkipOpponentTurns((s) => s + 1);
        setMovesRemaining(4);
        setPhase('MOVE_PHASE');
        setBannerMsg(t('bannerPlus4Action'));
      }
    },
    [board, enemyFaction, t]
  );

  // ---------- BOT AI TURN LOOP ----------
  const botTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      mode !== 'bot' ||
      activePlayer !== 'p2' ||
      isPaused ||
      phase === 'TITLE_MENU' ||
      phase === 'GAME_OVER' ||
      phase === 'CARD_REVEALING' ||
      phase === 'REVERSING'
    ) {
      return;
    }

    botTimerRef.current = window.setTimeout(() => {
      if (phase === 'DRAW_PHASE') {
        handleDrawCard();
      } else if (phase === 'WILD_COLOR_CHOICE') {
        handleSelectWildColor(chooseBotWildColor());
      } else if (phase === 'WILD_PLUS4_CHOICE') {
        handleSelectPlus4Mode(chooseBotPlus4Mode(board, enemyFaction));
      } else if (phase === 'MOVE_PHASE') {
        const botMove = chooseBotMove(
          board,
          activeFaction,
          enPassantTarget,
          movesRemaining,
          botLevel
        );
        if (botMove) {
          executeMove(botMove, 'queen', movesRemaining - 1);
        } else {
          endTurn(board, currentCard);
        }
      } else if (phase === 'WILD_TELEPORT_PHASE') {
        const tp = chooseBotTeleport(board, activeFaction);
        if (tp) {
          const nextBoard = cloneBoard(board);
          const p = nextBoard[tp.from.row][tp.from.col];
          nextBoard[tp.from.row][tp.from.col] = null;
          nextBoard[tp.to.row][tp.to.col] = p ? { ...p, hasMoved: true } : null;
          sound.playSpecial();
          setBoard(nextBoard);
          setWildTeleportPending(false);
          endTurn(nextBoard, currentCard);
        } else {
          setWildTeleportPending(false);
          endTurn(board, currentCard);
        }
      } else if (phase === 'PLUS2_RECOVER_PHASE') {
        const empties = getEmptyHomeRows(board, activeFaction);
        const recovered = ownCapturedPieces[0];
        if (recovered && empties.length > 0) {
          const dest = empties[Math.floor(Math.random() * empties.length)];
          const nextBoard = cloneBoard(board);
          nextBoard[dest.row][dest.col] = { ...recovered, hasMoved: true };
          sound.playSpecial();
          setBoard(nextBoard);
          if (activeFaction === 'white') {
            setCapturedWhitePieces((prev) => prev.filter((p) => p.id !== recovered.id));
          } else {
            setCapturedBlackPieces((prev) => prev.filter((p) => p.id !== recovered.id));
          }
          const rem = plus2Remaining - 1;
          if (rem <= 0 || empties.length <= 1 || ownCapturedPieces.length <= 1) {
            setPlus2Remaining(0);
            endTurn(nextBoard, currentCard);
          } else {
            setPlus2Remaining(rem);
          }
        } else {
          setPlus2Remaining(0);
          endTurn(board, currentCard);
        }
      } else if (phase === 'PLUS2_STEAL_PHASE') {
        const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
        const empties = getEmptyHomeRows(board, activeFaction);
        if (prio.coords.length > 0 && empties.length > 0 && prio.tier !== 4) {
          const targetCoord = prio.coords[0];
          const dest = empties[Math.floor(Math.random() * empties.length)];
          const stolen = board[targetCoord.row][targetCoord.col];
          if (stolen) {
            const nextBoard = cloneBoard(board);
            nextBoard[targetCoord.row][targetCoord.col] = null;
            nextBoard[dest.row][dest.col] = {
              ...stolen,
              faction: activeFaction,
              hasMoved: true,
            };
            sound.playCapture();
            setBoard(nextBoard);
            const wasTier3 = stolen.type === 'rook' || stolen.type === 'queen';
            const rem = wasTier3 ? 0 : plus2Remaining - 1;
            const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
            if (rem <= 0 || nextPrio.tier === 4 || empties.length <= 1) {
              setPlus2Remaining(0);
              endTurn(nextBoard, currentCard);
            } else {
              setPlus2Remaining(nextPrio.tier === 3 ? 1 : rem);
            }
            return;
          }
        }
        setPlus2Remaining(0);
        endTurn(board, currentCard);
      } else if (phase === 'PLUS4_ELIMINATE_PHASE') {
        const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
        if (prio.coords.length > 0 && prio.tier !== 4) {
          const targetCoord = prio.coords[0];
          const victim = board[targetCoord.row][targetCoord.col];
          const nextBoard = cloneBoard(board);
          nextBoard[targetCoord.row][targetCoord.col] = null;
          sound.playCapture();
          setBoard(nextBoard);
          if (victim) setExiledPieces((prev) => [...prev, victim]);
          const rem = plus4Remaining - 1;
          const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
          if (rem <= 0 || nextPrio.tier === 4) {
            setPlus4Remaining(0);
            endTurn(nextBoard, currentCard);
          } else {
            setPlus4Remaining(rem);
          }
        } else {
          setPlus4Remaining(0);
          endTurn(board, currentCard);
        }
      }
    }, 650);

    return () => {
      if (botTimerRef.current !== null) {
        clearTimeout(botTimerRef.current);
      }
    };
  }, [
    activeFaction,
    activePlayer,
    board,
    botLevel,
    currentCard,
    enPassantTarget,
    endTurn,
    enemyFaction,
    executeMove,
    handleDrawCard,
    handleSelectPlus4Mode,
    handleSelectWildColor,
    isPaused,
    mode,
    movesRemaining,
    ownCapturedPieces,
    phase,
    plus2Remaining,
    plus4Remaining,
  ]);

  const enemyHasAttackTargets = useMemo(() => {
    const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
    return prio.tier <= 3;
  }, [board, enemyFaction]);

  const topFaction: Faction = boardFlipped ? 'white' : 'black';
  const bottomFaction: Faction = boardFlipped ? 'black' : 'white';
  const topPlayerId: PlayerId = p1Faction === topFaction ? 'p1' : 'p2';
  const bottomPlayerId: PlayerId = p1Faction === bottomFaction ? 'p1' : 'p2';
  const topTimeMs = topPlayerId === 'p1' ? p1TimeMs : p2TimeMs;
  const bottomTimeMs = bottomPlayerId === 'p1' ? p1TimeMs : p2TimeMs;

  const topCaptured = topFaction === 'white' ? capturedBlackPieces : capturedWhitePieces;
  const bottomCaptured = bottomFaction === 'white' ? capturedBlackPieces : capturedWhitePieces;

  // In 2-player physical tabletop mode: when it is the top side's turn (Black by default),
  // move the deck console to the TOP (facing the opposite player!) and orient pieces 180°.
  const isTabletopTopTurn =
    mode === 'local' && localPlayStyle === 'tabletop' && activeFaction === topFaction;

  // Reusable Deck & Card Console (moves between Bottom and Top in 2P tabletop mode)
  const renderDeckConsole = (rotated180: boolean) => (
    <div
      className={`flex items-center justify-between gap-2.5 rounded-3xl border-3 border-slate-950 bg-slate-900/90 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.65)] backdrop-blur-md transition-transform duration-300 ${
        rotated180 ? 'rotate-180' : 'rotate-0'
      }`}
    >
      {/* Interactive Draw Deck using deck.png */}
      <button
        type="button"
        disabled={phase !== 'DRAW_PHASE' || !isHumanTurn || isPaused}
        onClick={handleDrawCard}
        aria-label={t('drawBtnPrompt')}
        className={`group relative flex shrink-0 flex-col items-center justify-center rounded-2xl p-1 transition ${
          phase === 'DRAW_PHASE' && isHumanTurn
            ? 'animate-float-slow cursor-pointer drop-shadow-[0_0_12px_rgba(251,191,36,0.75)] hover:scale-105 active:scale-95'
            : 'cursor-default opacity-85'
        }`}
      >
        <img
          src="/assets/deck.png"
          alt={t('deckCount', { count: drawPile.length })}
          referrerPolicy="no-referrer"
          className="h-20 w-auto object-contain drop-shadow-xl sm:h-24"
        />
        <span
          className={`mt-0.5 text-[11px] font-extrabold tabular-nums ${
            phase === 'DRAW_PHASE' && isHumanTurn ? 'text-amber-300' : 'text-slate-300'
          }`}
        >
          {phase === 'DRAW_PHASE' && isHumanTurn
            ? t('drawBtnPrompt')
            : t('deckCount', { count: drawPile.length })}
        </span>
      </button>

      {/* Revealed Card Showcase */}
      <div className="flex flex-1 items-center gap-2.5">
        {currentCard ? (
          <>
            <LayeredCard card={currentCard} faceDown={cardFaceDown} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-amber-300">
                {cardTitle(currentCard.value)}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-200">
                {cardDesc(currentCard.value)}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-extrabold tabular-nums">
                {phase === 'MOVE_PHASE' && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-950 bg-emerald-400 px-2 py-0.5 text-slate-950">
                    <Sparkles className="h-3 w-3" />
                    {t('movesCounter', { count: movesRemaining })}
                  </span>
                )}
                {phase === 'WILD_TELEPORT_PHASE' && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-950 bg-amber-300 px-2 py-0.5 text-slate-950">
                    {t('teleportActive')}
                  </span>
                )}
                {(phase === 'PLUS2_RECOVER_PHASE' || phase === 'PLUS2_STEAL_PHASE') && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-950 bg-sky-400 px-2 py-0.5 text-slate-950">
                    {t('plus2Counter', { count: plus2Remaining })}
                  </span>
                )}
                {phase === 'PLUS4_ELIMINATE_PHASE' && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-950 bg-rose-500 px-2 py-0.5 text-white">
                    {t('plus4ElimCounter', { count: plus4Remaining })}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex w-full items-center gap-2.5 px-1 text-slate-300">
            <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-800/60">
              <Layers className="h-6 w-6 text-slate-500" />
            </div>
            <div className="text-xs leading-relaxed">
              <div className="font-extrabold text-white">{t('drawPhaseTitle')}</div>
              <div className="text-[11px] text-slate-400">
                {isHumanTurn ? t('drawPhaseHumanHint') : t('drawPhaseBotHint')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderRecoveryTray = (rotated180: boolean) =>
    phase === 'PLUS2_RECOVER_PHASE' && isHumanTurn ? (
      <div
        className={`mt-1.5 rounded-2xl border-2 border-emerald-400/70 bg-slate-900/90 p-2 shadow-md ${
          rotated180 ? 'rotate-180' : ''
        }`}
      >
        <div className="mb-1 text-[11px] font-extrabold text-emerald-300">
          {t('recoverPrompt', { count: plus2Remaining })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ownCapturedPieces.map((cp) => (
            <button
              key={cp.id}
              type="button"
              onClick={() => {
                sound.playClick();
                setSelectedRecoverId(cp.id);
                setBannerMsg(
                  t('bannerRecoverPlace', { piece: pieceLabel(cp.type) })
                );
              }}
              className={`flex items-center gap-1 rounded-xl border-2 px-1.5 py-1 transition ${
                selectedRecoverId === cp.id
                  ? 'border-amber-300 bg-amber-400/25 ring-2 ring-amber-300'
                  : 'border-slate-700 bg-slate-800 hover:border-emerald-400'
              }`}
            >
              <ChessPieceGraphic piece={cp} size="tray" />
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="relative min-h-[100dvh] w-full overflow-x-hidden">
      <OrientationLock
        desktopBypassed={desktopBypassed}
        onDesktopBypass={setDesktopBypassed}
      />

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[490px] flex-col">
        {phase === 'TITLE_MENU' ? (
          <StartScreen
            mode={mode}
            botLevel={botLevel}
            playerColor={playerColor}
            localPlayStyle={localPlayStyle}
            timeControl={timeControl}
            onChangeMode={(m) => {
              sound.playClick();
              setMode(m);
            }}
            onChangeBotLevel={(lvl) => {
              sound.playClick();
              setBotLevel(lvl);
            }}
            onChangePlayerColor={(c) => {
              sound.playClick();
              setPlayerColor(c);
            }}
            onChangeLocalPlayStyle={(s) => {
              sound.playClick();
              setLocalPlayStyle(s);
            }}
            onChangeTimeControl={(tc) => {
              sound.playClick();
              setTimeControl(tc);
            }}
            onStartGame={startNewGame}
            onOpenGuide={() => {
              sound.playClick();
              setIsGuideOpen(true);
            }}
          />
        ) : (
          <div className="flex min-h-[100dvh] flex-col justify-between px-2.5 pb-2.5 pt-2 sm:px-3">
            {/* 1. Top Game Header & Fixed Pause Button */}
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <img
                  src="/assets/logo.png"
                  alt="UnoChess"
                  referrerPolicy="no-referrer"
                  className="h-9 w-auto drop-shadow-md sm:h-10"
                />
                <div className="flex items-center gap-1 rounded-xl border-2 border-slate-950 bg-slate-900/85 px-2.5 py-1 text-xs font-bold text-amber-200 shadow tabular-nums">
                  <Timer className="h-3.5 w-3.5 text-amber-400" />
                  <span>
                    {timeControl.minutes > 0
                      ? `${timeControl.label} · ${formatTime(elapsedSeconds)}`
                      : formatTime(elapsedSeconds)}
                  </span>
                </div>
              </div>

              <div
                className={`flex items-center gap-1.5 rounded-xl border-2 border-slate-950 px-3 py-1 text-xs font-extrabold shadow ${
                  activeFaction === 'white'
                    ? 'bg-amber-100 text-slate-950'
                    : 'bg-slate-800 text-white'
                }`}
              >
                <span>
                  {playerLabel(activePlayer)} ·{' '}
                  {activeFaction === 'white' ? t('whitePieces') : t('blackPieces')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  setIsPaused(true);
                }}
                aria-label={t('pauseTitle')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-3 border-slate-950 bg-amber-400 text-slate-950 shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
              >
                <Pause className="h-5 w-5 fill-current" />
              </button>
            </header>

            {/* TOP DECK ZONE (shown when it's Black/Top player's turn in 2-player tabletop mode!) */}
            {isTabletopTopTurn && (
              <div className="mt-1.5">
                {renderDeckConsole(true)}
                {renderRecoveryTray(true)}
              </div>
            )}

            {/* 2. Top Player / Opponent Strip */}
            <div
              className={`mt-1.5 flex items-center justify-between rounded-2xl border-2 border-slate-950 bg-slate-900/85 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm ${
                isTabletopTopTurn ? 'rotate-180' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-3 w-3 rounded-full border ${
                    topFaction === 'white'
                      ? 'border-slate-950 bg-amber-50'
                      : 'border-slate-300 bg-slate-900'
                  }`}
                />
                <span className="font-extrabold text-white">
                  {playerLabel(topPlayerId)}
                </span>
                {activePlayer === topPlayerId && skipOpponentTurns > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
                    <Ban className="h-3 w-3" /> {t('blockActive')}
                  </span>
                )}
                {checkedFaction === topFaction && (
                  <span className="flex items-center gap-1 font-extrabold text-rose-400">
                    <ShieldAlert className="h-3.5 w-3.5" /> {t('checkBadge')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-300 tabular-nums">
                <span>{t('capturedCount', { count: topCaptured.length })}</span>
                {exiledPieces.length > 0 && (
                  <span className="text-rose-300">
                    · {t('exileCount', { count: exiledPieces.length })}
                  </span>
                )}
                <div
                  className={`flex items-center gap-1 rounded-xl border-2 px-2 py-0.5 text-xs font-extrabold tabular-nums ${
                    timeControl.minutes > 0 && activePlayer === topPlayerId && topTimeMs < 15000
                      ? 'border-rose-950 bg-rose-500 text-white'
                      : activePlayer === topPlayerId
                      ? 'border-slate-950 bg-amber-300 text-slate-950'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  <span>{formatPlayerClock(topTimeMs)}</span>
                </div>
              </div>
            </div>

            {/* 3. Status / Action Prompt Banner */}
            <div
              className={`my-1.5 flex min-h-[36px] items-center justify-center rounded-xl border-2 border-slate-950 bg-slate-950/80 px-3 py-1 text-center text-xs font-bold leading-snug text-amber-200 shadow ${
                isTabletopTopTurn ? 'rotate-180' : ''
              }`}
            >
              {bannerMsg}
            </div>

            {/* 4. Central 8x8 UnoChess Board */}
            <ChessBoard
              board={board}
              boardFlipped={boardFlipped}
              isSpinning={isSpinning}
              rotatePieces180={isTabletopTopTurn}
              selectedCoord={selectedCoord}
              legalMovesForSelected={legalMovesForSelected}
              highlightCoords={highlightCoords}
              highlightMode={highlightMode}
              checkedFaction={checkedFaction}
              disabled={
                !isHumanTurn ||
                isPaused ||
                phase === 'REVERSING' ||
                phase === 'CARD_REVEALING'
              }
              onSquareClick={handleSquareClick}
            />

            {/* 5. Bottom Player Strip */}
            <div className="mt-1.5 rounded-2xl border-2 border-slate-950 bg-slate-900/85 px-3 py-1.5 shadow-md backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-3 rounded-full border ${
                      bottomFaction === 'white'
                        ? 'border-slate-950 bg-amber-50'
                        : 'border-slate-300 bg-slate-900'
                    }`}
                  />
                  <span className="font-extrabold text-white">
                    {playerLabel(bottomPlayerId)}
                  </span>
                  {checkedFaction === bottomFaction && (
                    <span className="flex items-center gap-1 font-extrabold text-rose-400">
                      <ShieldAlert className="h-3.5 w-3.5" /> {t('checkBadge')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-300 tabular-nums">
                    {t('capturedCount', { count: bottomCaptured.length })}
                  </span>
                  <div
                    className={`flex items-center gap-1 rounded-xl border-2 px-2 py-0.5 text-xs font-extrabold tabular-nums ${
                      timeControl.minutes > 0 &&
                      activePlayer === bottomPlayerId &&
                      bottomTimeMs < 15000
                        ? 'border-rose-950 bg-rose-500 text-white'
                        : activePlayer === bottomPlayerId
                        ? 'border-slate-950 bg-amber-300 text-slate-950'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span>{formatPlayerClock(bottomTimeMs)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM DECK ZONE (shown when it's White/Bottom player's turn or Bot/Pass mode) */}
            {!isTabletopTopTurn && (
              <div className="mt-1.5">
                {renderRecoveryTray(false)}
                {renderDeckConsole(false)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <PauseModal
        isOpen={isPaused}
        musicVolume={audioState.musicVolume}
        sfxVolume={audioState.sfxVolume}
        musicMuted={audioState.musicMuted}
        sfxMuted={audioState.sfxMuted}
        onResume={() => {
          sound.playClick();
          setIsPaused(false);
        }}
        onChangeMusicVolume={(v) => {
          sound.setMusicVolume(v);
          if (v > 0 && audioState.musicMuted) sound.setMusicMuted(false);
          syncAudioState();
        }}
        onChangeSfxVolume={(v) => {
          sound.setSfxVolume(v);
          if (v > 0 && audioState.sfxMuted) sound.setSfxMuted(false);
          syncAudioState();
        }}
        onToggleMusicMute={() => {
          sound.setMusicMuted(!audioState.musicMuted);
          syncAudioState();
        }}
        onToggleSfxMute={() => {
          sound.setSfxMuted(!audioState.sfxMuted);
          syncAudioState();
        }}
        onOpenGuide={() => {
          sound.playClick();
          setIsGuideOpen(true);
        }}
        onRestart={() => {
          startNewGame();
        }}
        onExitToMenu={() => {
          sound.playClick();
          sound.stopMusic();
          syncAudioState();
          setIsPaused(false);
          setPhase('TITLE_MENU');
        }}
      />

      <CardGuideModal
        isOpen={isGuideOpen}
        onClose={() => {
          sound.playClick();
          setIsGuideOpen(false);
        }}
      />

      <WildColorModal
        isOpen={phase === 'WILD_COLOR_CHOICE' && isHumanTurn}
        onSelectColor={handleSelectWildColor}
      />

      <WildPlus4Modal
        isOpen={phase === 'WILD_PLUS4_CHOICE' && isHumanTurn}
        enemyHasTargets={enemyHasAttackTargets}
        onSelectMode={handleSelectPlus4Mode}
      />

      <PromotionModal
        isOpen={phase === 'PROMOTION_CHOICE' && pendingPromotion !== null}
        faction={pendingPromotion?.faction ?? activeFaction}
        pieceNumber={
          pendingPromotion
            ? board[pendingPromotion.coord.row][pendingPromotion.coord.col]?.pieceNumber ?? 9
            : 9
        }
        onSelectPiece={handleSelectPromotion}
      />

      <GameOverModal
        isOpen={phase === 'GAME_OVER'}
        winnerName={winnerName}
        reason={gameOverReason}
        turnsPlayed={turnsPlayed}
        elapsedSeconds={elapsedSeconds}
        onPlayAgain={startNewGame}
        onMainMenu={() => {
          sound.playClick();
          sound.stopMusic();
          syncAudioState();
          setPhase('TITLE_MENU');
        }}
      />
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Copy,
  Flag,
  Layers,
  MessageSquare,
  Pause,
  ShieldAlert,
  Sparkles,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
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
  MatchChatMessage,
  Move,
  MoveHistoryEntry,
  OnlineMatchDoc,
  PIECE_BASE_COLOR_MAP,
  PendingPromotion,
  PieceType,
  PlayerId,
  PlayerProfile,
  ReplayNode,
  SavedMatchRecord,
  SystemModerationConfig,
  TIME_CONTROL_PRESETS,
  TimeControlPreset,
  WILD_COLOR_PIECE_MAP,
  getTimeControlCategoryFromMinutes,
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
  getWildPlacementSquares,
  isCheckmate,
  isInCheck,
  oppositeFaction,
  resolveColorDuel,
} from './engine/chess';
import { createDeck, shuffleCards } from './engine/deck';
import { buildPGN, coordToAlgebraic, downloadPGNFile, formatMoveToSAN } from './engine/pgn';
import { coordToSq, serializeBoardCompact, sqToCoord } from './engine/replay';
import { sound } from './utils/audio';
import {
  applyMatchEloToMyProfile,
  calculateEloDelta,
  cancelWaitingMatch,
  clearDeviceAccountLocally,
  flattenBoard,
  getMatchFromServer,
  loadActiveOnlineMatchId,
  loadDeviceAccount,
  loadPendingJoinId,
  loginWithLichessProfile,
  pushMatchUpdate,
  saveActiveOnlineMatchId,
  savePendingJoinId,
  saveWaitingMagicMatchId,
  subscribeMatch,
  subscribePlayerProfile,
  syncDeviceAccountWithFirestore,
  unflattenBoard,
} from './services/onlineService';
import {
  loadLocalMatchHistory,
  loadMergedMatchHistory,
  saveMatchRecord,
  updateSavedMatchReplayTree,
} from './services/matchHistoryService';
import {
  LICHESS_AUTH_CHANNEL,
  exchangeLichessCodeForProfile,
} from './services/lichessService';
import {
  fetchMatchChatFromServer,
  subscribeMatchChat,
  subscribeSystemModerationConfig,
} from './services/moderationChatService';
import { OrientationLock } from './components/OrientationLock';
import { StartScreen } from './components/StartScreen';
import { OnlineLobbyView } from './components/OnlineLobbyView';
import { ChessBoard } from './components/ChessBoard';
import { LayeredCard } from './components/LayeredCard';
import { ChessPieceGraphic } from './components/ChessPieceGraphic';
import { MoveHistoryBar } from './components/MoveHistoryBar';
import { PauseModal } from './components/PauseModal';
import { CardGuideModal } from './components/CardGuideModal';
import { GameReplayModal } from './components/GameReplayModal';
import { ProfileHistoryModal } from './components/ProfileHistoryModal';
import { MatchChatModal } from './components/MatchChatModal';
import { ReportContextPrefill, ReportModal } from './components/ReportModal';
import { AppealsModal } from './components/AppealsModal';
import { ModerationConsoleModal } from './components/ModerationConsoleModal';
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

  // Online device mini-account / Lichess profile, lobby, & live match state
  const [myProfile, setMyProfile] = useState<PlayerProfile | null>(() => loadDeviceAccount());
  const [profileLoading, setProfileLoading] = useState(false);
  const [showOnlineLobby, setShowOnlineLobby] = useState(false);
  const [pendingJoinMatchId, setPendingJoinMatchId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId && /^[a-zA-Z0-9_-]{3,128}$/.test(joinId)) {
      savePendingJoinId(joinId);
      return joinId;
    }
    return loadPendingJoinId();
  });
  const [onlineMatchId, setOnlineMatchId] = useState<string | null>(null);
  const [onlineMatch, setOnlineMatch] = useState<OnlineMatchDoc | null>(null);
  const onlineMatchRef = useRef<OnlineMatchDoc | null>(null);
  onlineMatchRef.current = onlineMatch;
  const matchVersionRef = useRef<number>(1);
  const lastSnapshotSigRef = useRef<string>('');
  const applyMatchSnapshotRef = useRef<(match: OnlineMatchDoc | null) => void>(() => {});
  const [joinToastMsg, setJoinToastMsg] = useState<string | null>(null);
  const [onlineSyncWarning, setOnlineSyncWarning] = useState<string | null>(null);
  const [waitingCopied, setWaitingCopied] = useState(false);
  const [onlineEloResult, setOnlineEloResult] = useState<{
    delta: number;
    didWin: boolean;
  } | null>(null);
  const appliedEloMatchesRef = useRef<Set<string>>(new Set());
  const recoveredMatchOnceRef = useRef<string | null>(null);
  const myProfileRef = useRef<PlayerProfile | null>(null);
  myProfileRef.current = myProfile;
  const lastSeenDuelTextRef = useRef<string>('');
  const gameSessionRef = useRef<number>(0);
  const timeoutClaimedMatchRef = useRef<string | null>(null);

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
  const [pendingWildPieceType, setPendingWildPieceType] = useState<PieceType | null>(null);
  const [selectedCoord, setSelectedCoord] = useState<Coord | null>(null);

  // +2 & +4 interactive states
  const [plus2Remaining, setPlus2Remaining] = useState(0);
  const [selectedRecoverId, setSelectedRecoverId] = useState<string | null>(null);
  const [selectedStealCoord, setSelectedStealCoord] = useState<Coord | null>(null);
  const [plus4Remaining, setPlus4Remaining] = useState(0);

  // Promotion
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [promotionSavedMovesAfter, setPromotionSavedMovesAfter] = useState(0);

  // Color Sync (Regla 1), Color Duel (Regla 2), & Move History / PGN
  const [lastChainColor, setLastChainColor] = useState<CardColor | ''>('');
  const [lastChainBy, setLastChainBy] = useState<PlayerId | ''>('');
  const [isFirstMoveOfTurn, setIsFirstMoveOfTurn] = useState(true);
  const [moveHistory, setMoveHistory] = useState<MoveHistoryEntry[]>([]);
  const [duelToastMsg, setDuelToastMsg] = useState<string | null>(null);

  // Status, Timer, Clocks, Winner, Replay & Profile History
  const [bannerMsg, setBannerMsg] = useState<string>(() => t('bannerDrawStart'));
  const [turnsPlayed, setTurnsPlayed] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedSecondsRef = useRef(0);
  elapsedSecondsRef.current = elapsedSeconds;
  const [p1TimeMs, setP1TimeMs] = useState(0);
  const [p2TimeMs, setP2TimeMs] = useState(0);
  const p1TimeMsRef = useRef(0);
  p1TimeMsRef.current = p1TimeMs;
  const p2TimeMsRef = useRef(0);
  p2TimeMsRef.current = p2TimeMs;
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState('');
  const [finalResultToken, setFinalResultToken] = useState<'1-0' | '0-1' | '1/2-1/2' | '*'>('*');

  const currentLocalMatchIdRef = useRef<string>(`local_${Date.now()}`);
  const savedMatchIdsRef = useRef<Set<string>>(new Set());
  const [lastCompletedRecord, setLastCompletedRecord] = useState<SavedMatchRecord | null>(null);
  const [savedMatchHistory, setSavedMatchHistory] = useState<SavedMatchRecord[]>(() =>
    loadLocalMatchHistory()
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isProfileHistoryOpen, setIsProfileHistoryOpen] = useState(false);
  const [replayRecord, setReplayRecord] = useState<SavedMatchRecord | null>(null);

  // Real-time Match Chat, Moderation Config, Reports & Appeals
  const [systemModerationConfig, setSystemModerationConfig] =
    useState<SystemModerationConfig | null>(null);
  const [chatMessages, setChatMessages] = useState<MatchChatMessage[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const isChatOpenRef = useRef(false);
  isChatOpenRef.current = isChatOpen;
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const seenChatCountRef = useRef(0);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportContext, setReportContext] = useState<ReportContextPrefill | null>(null);
  const [isAppealsOpen, setIsAppealsOpen] = useState(false);
  const [isModConsoleOpen, setIsModConsoleOpen] = useState(false);

  const openReportModal = useCallback((ctx?: ReportContextPrefill | null) => {
    sound.playClick();
    setReportContext(ctx ?? null);
    setIsReportOpen(true);
  }, []);

  // Audio UI state synced from Web Audio engine
  const [audioState, setAudioState] = useState(() => sound.getState());
  const syncAudioState = () => setAudioState({ ...sound.getState() });

  // Subscribe to global moderation/chat safety config
  useEffect(() => {
    const unsub = subscribeSystemModerationConfig(setSystemModerationConfig);
    return () => unsub();
  }, []);

  // Subscribe to real-time in-match chat when playing online
  useEffect(() => {
    if (mode !== 'online' || !onlineMatchId) {
      setChatMessages([]);
      setUnreadChatCount(0);
      seenChatCountRef.current = 0;
      setIsChatOpen(false);
      return;
    }
    let active = true;
    const handleChatList = (list: MatchChatMessage[]) => {
      if (!active) return;
      setChatMessages(list);
      if (isChatOpenRef.current) {
        seenChatCountRef.current = list.length;
        setUnreadChatCount(0);
      } else {
        const myUid = myProfileRef.current?.uid ?? '';
        const newFromOther = list
          .slice(seenChatCountRef.current)
          .filter((m) => m.senderUid !== myUid).length;
        setUnreadChatCount((prev) =>
          Math.max(prev, newFromOther, list.length - seenChatCountRef.current > 0 ? newFromOther : 0)
        );
      }
    };

    const unsub = subscribeMatchChat(onlineMatchId, handleChatList);
    void fetchMatchChatFromServer(onlineMatchId).then((list) => {
      if (active && list.length > 0) {
        handleChatList(list);
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, [mode, onlineMatchId]);

  useEffect(() => {
    if (isChatOpen) {
      seenChatCountRef.current = chatMessages.length;
      setUnreadChatCount(0);
    }
  }, [chatMessages.length, isChatOpen]);

  // Open online lobby automatically when arriving via a ?join=<matchId> magic link
  useEffect(() => {
    if (pendingJoinMatchId) {
      setMode('online');
      setShowOnlineLobby(true);
    }
  }, [pendingJoinMatchId]);

  // Handle same-tab Lichess OAuth callback fallback if redirected back to root
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('lichess_code');
    const state = params.get('lichess_state');
    if (!code || !state) return;

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('lichess_code');
    cleanUrl.searchParams.delete('lichess_state');
    cleanUrl.searchParams.delete('lichess_error');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);

    setMode('online');
    setShowOnlineLobby(true);
    setProfileLoading(true);
    void (async () => {
      try {
        const li = await exchangeLichessCodeForProfile(code, state);
        const prof = await loginWithLichessProfile(li);
        setMyProfile(prof);
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel(LICHESS_AUTH_CHANNEL);
            bc.postMessage({ type: 'LICHESS_PROFILE_READY', profile: prof });
            bc.close();
          }
        } catch {
          // ignore broadcast failure
        }
        if (window.name === 'unochess_lichess_oauth') {
          setTimeout(() => {
            try {
              window.close();
            } catch {
              // keep usable inside window if browser blocks close
            }
          }, 150);
        }
      } catch {
        // user can retry inside lobby
      } finally {
        setProfileLoading(false);
      }
    })();
  }, []);

  // Sync device mini-account & Lichess per-time-control Elos on load and every time user enters lobby/menu
  const myProfileUid = myProfile?.uid ?? '';
  useEffect(() => {
    if (!myProfileUid) return;
    let active = true;
    const current = myProfileRef.current;
    if (current) {
      void syncDeviceAccountWithFirestore(current)
        .then((synced) => {
          if (active) setMyProfile(synced);
        })
        .catch(() => {
          // keep local device account usable if offline temporarily
        });
    }
    const unsub = subscribePlayerProfile(myProfileUid, (prof) => {
      if (active && prof) {
        setMyProfile(prof);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [myProfileUid, showOnlineLobby]);

  // Recover an active online match automatically if user reloads or returns from background
  useEffect(() => {
    if (
      !myProfileUid ||
      pendingJoinMatchId ||
      showOnlineLobby ||
      onlineMatchId ||
      phase !== 'TITLE_MENU'
    ) {
      return;
    }
    const savedActiveId = loadActiveOnlineMatchId(myProfileUid);
    if (!savedActiveId || recoveredMatchOnceRef.current === savedActiveId) return;
    recoveredMatchOnceRef.current = savedActiveId;

    let active = true;
    void getMatchFromServer(savedActiveId).then((m) => {
      if (!active || !m) {
        saveActiveOnlineMatchId(myProfileUid, null);
        return;
      }
      if (m.status === 'active' && (m.hostUid === myProfileUid || m.guestUid === myProfileUid)) {
        sound.unlock();
        setMode('online');
        setOnlineMatchId(m.id);
        setPhase(m.phase);
      } else if (m.status === 'waiting' && m.hostUid === myProfileUid) {
        saveWaitingMagicMatchId(myProfileUid, m.id);
        saveActiveOnlineMatchId(myProfileUid, null);
        setMode('online');
        setShowOnlineLobby(true);
      } else {
        saveActiveOnlineMatchId(myProfileUid, null);
      }
    });

    return () => {
      active = false;
    };
  }, [myProfileUid, onlineMatchId, pendingJoinMatchId, phase, showOnlineLobby]);

  const refreshMatchHistory = useCallback(async (uidOverride?: string | null) => {
    const uid = uidOverride !== undefined ? uidOverride : myProfileRef.current?.uid ?? null;
    setHistoryLoading(true);
    try {
      const merged = await loadMergedMatchHistory(uid);
      setSavedMatchHistory(merged);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMatchHistory(myProfileUid || null);
  }, [myProfileUid, refreshMatchHistory]);

  const persistCompletedMatch = useCallback(
    (params: {
      id: string;
      mode: GameMode;
      whiteName: string;
      blackName: string;
      whiteElo: number | null;
      blackElo: number | null;
      playerFaction: Faction;
      result: '1-0' | '0-1' | '1/2-1/2' | '*';
      outcome: 'win' | 'loss' | 'draw';
      reasonText: string;
      timeControlLabel: string;
      turnsPlayed: number;
      elapsedSeconds: number;
      eloDelta: number | null;
      moves: MoveHistoryEntry[];
    }) => {
      const rec: SavedMatchRecord = {
        ...params,
        ownerUid: myProfileRef.current?.uid || 'local',
        createdAtMs: Date.now(),
      };
      setLastCompletedRecord(rec);
      if (savedMatchIdsRef.current.has(rec.id)) return rec;
      savedMatchIdsRef.current.add(rec.id);
      void saveMatchRecord(rec).then((nextList) => {
        setSavedMatchHistory(nextList);
      });
      return rec;
    },
    []
  );

  // Derived factions & labels
  const p2Faction = oppositeFaction(p1Faction);
  const activeFaction: Faction = activePlayer === 'p1' ? p1Faction : p2Faction;
  const enemyFaction: Faction = oppositeFaction(activeFaction);

  const myOnlineRole: PlayerId = useMemo(() => {
    if (!onlineMatch || !myProfileUid) return 'p1';
    return onlineMatch.p1Uid === myProfileUid ? 'p1' : 'p2';
  }, [myProfileUid, onlineMatch]);

  const playerLabel = useCallback(
    (pid: PlayerId) => {
      if (mode === 'online' && onlineMatch) {
        return pid === 'p1' ? onlineMatch.hostNickname : onlineMatch.guestNickname;
      }
      if (mode === 'bot') {
        return pid === 'p1' ? t('you') : t('botAi');
      }
      return pid === 'p1' ? t('player1') : t('player2');
    },
    [mode, onlineMatch, t]
  );

  const playerUidForId = useCallback(
    (pid: PlayerId) => {
      if (!onlineMatch) return '';
      return pid === 'p1' ? onlineMatch.p1Uid : onlineMatch.p2Uid;
    },
    [onlineMatch]
  );

  const playerEloForId = useCallback(
    (pid: PlayerId): number | null => {
      if (mode !== 'online' || !onlineMatch) return null;
      return pid === 'p1' ? onlineMatch.hostElo : onlineMatch.guestElo;
    },
    [mode, onlineMatch]
  );

  const colorLabel = useCallback(
    (c: CardColor) => {
      switch (c) {
        case 'red':
          return t('colorRed');
        case 'blue':
          return t('colorBlue');
        case 'green':
          return t('colorGreen');
        case 'yellow':
          return t('colorYellow');
      }
    },
    [t]
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

  const isHumanTurn =
    mode === 'online'
      ? Boolean(onlineMatch && onlineMatch.status === 'active' && activePlayer === myOnlineRole)
      : mode === 'local' || activePlayer === 'p1';

  const checkedFaction: Faction | null = useMemo(() => {
    if (isInCheck(board, 'white')) return 'white';
    if (isInCheck(board, 'black')) return 'black';
    return null;
  }, [board]);

  const ownCapturedPieces = useMemo(
    () => (activeFaction === 'white' ? capturedWhitePieces : capturedBlackPieces),
    [activeFaction, capturedWhitePieces, capturedBlackPieces]
  );

  // Sync incoming real-time online match snapshots + immediate server fetch, deduplication & watchdog
  const isMatchWaiting = onlineMatch?.status === 'waiting';
  const shouldPollMatch =
    mode === 'online' &&
    Boolean(onlineMatchId) &&
    (isMatchWaiting ||
      (onlineMatch?.status === 'active' && !isHumanTurn) ||
      Boolean(onlineSyncWarning));

  useEffect(() => {
    if (mode !== 'online' || !onlineMatchId) return;
    let active = true;
    const isInitialEnter = lastSnapshotSigRef.current === '';

    const applyMatchSnapshot = (match: OnlineMatchDoc | null) => {
      if (!active || !match) return;
      setOnlineSyncWarning(null);

      const prevMatch = onlineMatchRef.current;
      const isStatusTransition =
        !prevMatch ||
        prevMatch.id !== match.id ||
        prevMatch.status !== match.status ||
        prevMatch.guestUid !== match.guestUid;

      // Reject older out-of-order versions unless it's a terminal/activation state transition
      if (
        !isStatusTransition &&
        match.status === 'active' &&
        (match.stateVersion || 1) < matchVersionRef.current
      ) {
        return;
      }

      const sig = `${match.id}|${match.status}|${match.guestUid}|${match.stateVersion}|${match.phase}|${match.movesRemaining}|${match.activePlayer}|${match.moveHistory?.length ?? 0}`;
      if (sig === lastSnapshotSigRef.current) {
        return;
      }
      lastSnapshotSigRef.current = sig;
      matchVersionRef.current = Math.max(matchVersionRef.current, match.stateVersion || 1);
      setOnlineMatch(match);

      if (match.status === 'waiting') {
        setBannerMsg(t('onlineMagicWaiting'));
        return;
      }

      const activeUid = myProfileRef.current?.uid ?? '';
      const role: PlayerId = activeUid && match.p1Uid === activeUid ? 'p1' : 'p2';
      const myFac: Faction = role === 'p1' ? match.p1Faction : oppositeFaction(match.p1Faction);

      const nextBoard = unflattenBoard(match.boardFlat);
      setBoard(nextBoard);
      setCapturedWhitePieces(match.capturedWhitePieces);
      setCapturedBlackPieces(match.capturedBlackPieces);
      setExiledPieces(match.exiledPieces);
      setEnPassantTarget(match.enPassantTarget ?? null);
      setP1Faction(match.p1Faction);
      setActivePlayer(match.activePlayer);
      setBoardFlipped(myFac === 'black');
      setDrawPile(match.drawPile);
      setDiscardPile(match.discardPile);
      setCurrentCard(match.currentCard ?? null);
      setCardFaceDown(match.cardFaceDown);
      setMovesRemaining(match.movesRemaining);
      setSkipOpponentTurns(match.skipOpponentTurns);
      setWildTeleportPending(match.wildTeleportPending);
      setPlus2Remaining(match.plus2Remaining);
      setPlus4Remaining(match.plus4Remaining);
      setPendingWildPieceType(
        match.pendingWildPieceType ? (match.pendingWildPieceType as PieceType) : null
      );
      setPendingPromotion(match.pendingPromotion ?? null);
      if (match.phase === 'PROMOTION_CHOICE') {
        setPromotionSavedMovesAfter(match.movesRemaining || 0);
      }
      setLastChainColor(match.lastChainColor ?? '');
      setLastChainBy(match.lastChainBy ?? '');
      setIsFirstMoveOfTurn(
        match.isFirstMoveOfTurn !== undefined ? match.isFirstMoveOfTurn : true
      );
      setMoveHistory(match.moveHistory ?? []);
      setTurnsPlayed(match.turnsPlayed);
      setP1TimeMs(match.p1TimeMs);
      setP2TimeMs(match.p2TimeMs);

      if (match.lastDuelText && match.lastDuelText !== lastSeenDuelTextRef.current) {
        lastSeenDuelTextRef.current = match.lastDuelText;
        setDuelToastMsg(match.lastDuelText);
        window.setTimeout(() => setDuelToastMsg(null), 5000);
      }

      setTimeControl({
        id: match.timeControlId,
        category:
          match.minutes === 0
            ? 'unlimited'
            : match.minutes <= 2
            ? 'bullet'
            : match.minutes <= 5
            ? 'blitz'
            : match.minutes <= 15
            ? 'rapid'
            : 'classical',
        label: match.timeControlLabel,
        minutes: match.minutes,
        increment: match.increment,
      });

      if (match.phase === 'REVERSING') {
        setIsSpinning(true);
      } else {
        setIsSpinning(false);
      }

      if (match.bannerKey) {
        const params = { ...(match.bannerParams || {}) };
        if (match.bannerKey === 'bannerOnlineTurn') {
          const turnName =
            match.activePlayer === 'p1' ? match.hostNickname : match.guestNickname;
          params.name = turnName;
        }
        setBannerMsg(t(match.bannerKey, params));
      }

      if (match.status === 'finished') {
        if (activeUid) saveActiveOnlineMatchId(activeUid, null);
        const winnerIsP1 = match.winnerUid === match.p1Uid;
        const wName = match.winnerUid
          ? winnerIsP1
            ? match.hostNickname
            : match.guestNickname
          : null;
        setWinnerName(wName);
        const resTok: '1-0' | '0-1' | '*' = match.winnerUid
          ? (winnerIsP1 ? match.p1Faction : oppositeFaction(match.p1Faction)) === 'white'
            ? '1-0'
            : '0-1'
          : '*';
        setFinalResultToken(resTok);
        const reasonStr = match.winReasonKey ? t(match.winReasonKey) : '';
        setGameOverReason(reasonStr);
        setPhase('GAME_OVER');

        const prof = myProfileRef.current;
        if (prof && match.winnerUid) {
          const didWin = match.winnerUid === prof.uid;
          setOnlineEloResult({ delta: match.eloDelta, didWin });
          if (
            match.eloDelta > 0 &&
            !appliedEloMatchesRef.current.has(match.id)
          ) {
            appliedEloMatchesRef.current.add(match.id);
            const matchCategory = getTimeControlCategoryFromMinutes(match.minutes);
            void applyMatchEloToMyProfile(prof, didWin, match.eloDelta, matchCategory);
          }
        }

        const whiteNameOnline =
          match.p1Faction === 'white' ? match.hostNickname : match.guestNickname;
        const blackNameOnline =
          match.p1Faction === 'black' ? match.hostNickname : match.guestNickname;
        const whiteEloOnline =
          match.p1Faction === 'white' ? match.hostElo : match.guestElo;
        const blackEloOnline =
          match.p1Faction === 'black' ? match.hostElo : match.guestElo;
        const outcomeOnline: 'win' | 'loss' | 'draw' = !match.winnerUid
          ? 'draw'
          : match.winnerUid === activeUid
          ? 'win'
          : 'loss';
        persistCompletedMatch({
          id: match.id,
          mode: 'online',
          whiteName: whiteNameOnline,
          blackName: blackNameOnline,
          whiteElo: whiteEloOnline,
          blackElo: blackEloOnline,
          playerFaction: myFac,
          result: resTok,
          outcome: outcomeOnline,
          reasonText: reasonStr,
          timeControlLabel: match.timeControlLabel || '∞',
          turnsPlayed: match.turnsPlayed || 1,
          elapsedSeconds: elapsedSecondsRef.current,
          eloDelta: match.eloDelta ?? null,
          moves: match.moveHistory ?? [],
        });
      } else {
        setPhase(match.phase);
      }
    };
    applyMatchSnapshotRef.current = applyMatchSnapshot;

    const unsub = subscribeMatch(onlineMatchId, applyMatchSnapshot, () => {
      if (active) {
        setOnlineSyncWarning(t('onlineConnectionLost'));
      }
    });

    const syncFromServer = () => {
      void getMatchFromServer(onlineMatchId).then((m) => {
        if (active && m) applyMatchSnapshot(m);
      });
    };
    if (isInitialEnter) {
      syncFromServer();
    }

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        syncFromServer();
      }
    };
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      active = false;
      applyMatchSnapshotRef.current = () => {};
      unsub();
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [mode, onlineMatchId, persistCompletedMatch, t]);

  // Independent lightweight watchdog poll while waiting for opponent (magic link OR rival's turn OR reconnecting)
  useEffect(() => {
    if (!shouldPollMatch || !onlineMatchId) return;
    let active = true;
    const pollMs = isMatchWaiting ? 2000 : 3000;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void getMatchFromServer(onlineMatchId).then((m) => {
        if (!active || !m) return;
        applyMatchSnapshotRef.current(m);
      });
    }, pollMs);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isMatchWaiting, onlineMatchId, shouldPollMatch]);

  // Helper to push authoritative online updates when playing online (monotonically versioned + serialized)
  const pushOnline = useCallback(
    (patch: Parameters<typeof pushMatchUpdate>[1]) => {
      const current = onlineMatchRef.current;
      if (!current) return;
      matchVersionRef.current = Math.max(matchVersionRef.current, current.stateVersion || 1) + 1;
      const nextVersion = matchVersionRef.current;
      void pushMatchUpdate(current.id, {
        ...patch,
        stateVersion: nextVersion,
      }).catch(() => {
        setOnlineSyncWarning(t('onlineConnectionLost'));
      });
    },
    [t]
  );

  // Enter an online match from Lobby or Magic Link
  const handleEnterOnlineMatch = useCallback((matchId: string, notice?: string) => {
    sound.unlock();
    sound.startMusic();
    syncAudioState();
    gameSessionRef.current += 1;
    lastSeenDuelTextRef.current = '';
    lastSnapshotSigRef.current = '';
    matchVersionRef.current = 1;
    timeoutClaimedMatchRef.current = null;
    if (myProfileRef.current?.uid) {
      saveActiveOnlineMatchId(myProfileRef.current.uid, matchId);
    }
    setMode('online');
    setShowOnlineLobby(false);
    setOnlineSyncWarning(null);
    setOnlineMatch(null);
    setOnlineMatchId(matchId);
    setOnlineEloResult(null);
    setLastCompletedRecord(null);
    setMoveHistory([]);
    setLastChainColor('');
    setLastChainBy('');
    setIsFirstMoveOfTurn(true);
    setDuelToastMsg(null);
    setFinalResultToken('*');
    setSelectedCoord(null);
    setSelectedRecoverId(null);
    setSelectedStealCoord(null);
    setElapsedSeconds(0);
    setIsPaused(false);
    setPhase('DRAW_PHASE');
    if (notice) {
      setJoinToastMsg(notice);
      window.setTimeout(() => setJoinToastMsg(null), 5000);
    }
  }, []);

  const handleClearPendingJoin = useCallback(() => {
    savePendingJoinId(null);
    setPendingJoinMatchId(null);
    if (typeof window !== 'undefined' && window.location.search.includes('join=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('join');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const handleProfileSaved = useCallback((prof: PlayerProfile) => {
    setMyProfile(prof);
  }, []);

  const handleSwitchAccount = useCallback(() => {
    clearDeviceAccountLocally();
    setMyProfile(null);
  }, []);

  const handleLobbyBack = useCallback(() => {
    setShowOnlineLobby(false);
    setPhase('TITLE_MENU');
  }, []);


  // Elapsed timer
  useEffect(() => {
    if (
      phase === 'TITLE_MENU' ||
      phase === 'GAME_OVER' ||
      showOnlineLobby ||
      (isPaused && mode !== 'online')
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isPaused, mode, phase, showOnlineLobby]);

  // Dual Chess Clocks (Bullet -> Classical)
  useEffect(() => {
    if (
      timeControl.minutes <= 0 ||
      showOnlineLobby ||
      (isPaused && mode !== 'online') ||
      (mode === 'online' && onlineMatch?.status !== 'active') ||
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
  }, [activePlayer, isPaused, mode, onlineMatch?.status, phase, showOnlineLobby, timeControl.minutes]);

  // Detect clock flag / timeout victory
  useEffect(() => {
    if (
      timeControl.minutes <= 0 ||
      showOnlineLobby ||
      phase === 'TITLE_MENU' ||
      phase === 'GAME_OVER'
    ) {
      return;
    }

    if (p1TimeMs <= 0 || p2TimeMs <= 0) {
      const winnerPid: PlayerId = p1TimeMs <= 0 ? 'p2' : 'p1';
      if (mode === 'online' && onlineMatch && myProfile) {
        if (onlineMatch.status !== 'active') return;
        const winnerUid = playerUidForId(winnerPid);
        const winnerElo = winnerPid === 'p1' ? onlineMatch.hostElo : onlineMatch.guestElo;
        const loserElo = winnerPid === 'p1' ? onlineMatch.guestElo : onlineMatch.hostElo;
        const delta = calculateEloDelta(winnerElo, loserElo);
        const commitTimeout = () => {
          if (timeoutClaimedMatchRef.current === onlineMatch.id) return;
          timeoutClaimedMatchRef.current = onlineMatch.id;
          pushOnline({
            status: 'finished',
            phase: 'GAME_OVER',
            winnerUid,
            winReasonKey: 'bannerTimeoutWin',
            eloDelta: delta,
            p1TimeMs: Math.round(p1TimeMs),
            p2TimeMs: Math.round(p2TimeMs),
          });
        };

        // Flagged player commits immediately; opponent acts as 1500ms fallback if flagged player disconnected
        if (myProfile.uid === playerUidForId(activePlayer)) {
          commitTimeout();
          return;
        }
        const matchIdSnap = onlineMatch.id;
        const fallbackTid = window.setTimeout(() => {
          const latest = onlineMatchRef.current;
          if (!latest || latest.id !== matchIdSnap || latest.status !== 'active') return;
          commitTimeout();
        }, 1500);
        return () => clearTimeout(fallbackTid);
      }

      sound.playCheckmate();
      const winnerFac = winnerPid === 'p1' ? p1Faction : oppositeFaction(p1Faction);
      const resTok: '1-0' | '0-1' = winnerFac === 'white' ? '1-0' : '0-1';
      setFinalResultToken(resTok);
      setWinnerName(playerLabel(winnerPid));
      setGameOverReason(t('bannerTimeoutWin'));
      setPhase('GAME_OVER');

      const whitePid: PlayerId = p1Faction === 'white' ? 'p1' : 'p2';
      const blackPid: PlayerId = p1Faction === 'black' ? 'p1' : 'p2';
      persistCompletedMatch({
        id: currentLocalMatchIdRef.current || `local_${Date.now()}`,
        mode,
        whiteName: playerLabel(whitePid),
        blackName: playerLabel(blackPid),
        whiteElo: null,
        blackElo: null,
        playerFaction: p1Faction,
        result: resTok,
        outcome: winnerPid === 'p1' ? 'win' : 'loss',
        reasonText: t('bannerTimeoutWin'),
        timeControlLabel: timeControl.label,
        turnsPlayed,
        elapsedSeconds,
        eloDelta: null,
        moves: moveHistory,
      });
    }
  }, [
    activePlayer,
    elapsedSeconds,
    mode,
    moveHistory,
    myProfile,
    onlineMatch,
    p1Faction,
    p1TimeMs,
    p2TimeMs,
    persistCompletedMatch,
    phase,
    playerLabel,
    playerUidForId,
    pushOnline,
    showOnlineLobby,
    t,
    timeControl.label,
    timeControl.minutes,
    turnsPlayed,
  ]);

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
    gameSessionRef.current += 1;

    // White always moves first in chess
    const startingPlayer: PlayerId = playerColor === 'white' ? 'p1' : 'p2';
    const initialFlipped =
      mode === 'local' && localPlayStyle === 'pass' ? false : playerColor === 'black';
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
    setPendingWildPieceType(null);
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
    setFinalResultToken('*');
    setOnlineEloResult(null);
    setLastCompletedRecord(null);
    currentLocalMatchIdRef.current = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setLastChainColor('');
    setLastChainBy('');
    setIsFirstMoveOfTurn(true);
    setMoveHistory([]);
    setDuelToastMsg(null);
    setIsPaused(false);
    setPhase('DRAW_PHASE');
    setBannerMsg(
      startingPlayer === 'p1'
        ? t('bannerDrawStart')
        : t('bannerTurnOf', { name: playerLabel(startingPlayer) })
    );
  }, [localPlayStyle, mode, playerColor, playerLabel, t, timeControl.minutes]);

  const finishWithWin = useCallback(
    (
      winnerPid: PlayerId,
      reasonKey: string,
      latestBoard: (ChessPiece | null)[][],
      extraPatch?: Partial<OnlineMatchDoc>
    ) => {
      sound.playCheckmate();
      const winnerFac = winnerPid === 'p1' ? p1Faction : oppositeFaction(p1Faction);
      const resTok: '1-0' | '0-1' = winnerFac === 'white' ? '1-0' : '0-1';
      setFinalResultToken(resTok);

      if (mode === 'online' && onlineMatch) {
        const winnerUid = playerUidForId(winnerPid);
        const winnerElo = winnerPid === 'p1' ? onlineMatch.hostElo : onlineMatch.guestElo;
        const loserElo = winnerPid === 'p1' ? onlineMatch.guestElo : onlineMatch.hostElo;
        const delta = calculateEloDelta(winnerElo, loserElo);
        pushOnline({
          ...extraPatch,
          boardFlat: flattenBoard(latestBoard),
          status: 'finished',
          phase: 'GAME_OVER',
          winnerUid,
          winReasonKey: reasonKey,
          eloDelta: delta,
          p1TimeMs: Math.round(p1TimeMsRef.current),
          p2TimeMs: Math.round(p2TimeMsRef.current),
        });
        return;
      }

      const movesToSave = extraPatch?.moveHistory ?? moveHistory;
      setWinnerName(playerLabel(winnerPid));
      setGameOverReason(t(reasonKey));
      setPhase('GAME_OVER');

      const whitePid: PlayerId = p1Faction === 'white' ? 'p1' : 'p2';
      const blackPid: PlayerId = p1Faction === 'black' ? 'p1' : 'p2';
      persistCompletedMatch({
        id: currentLocalMatchIdRef.current || `local_${Date.now()}`,
        mode,
        whiteName: playerLabel(whitePid),
        blackName: playerLabel(blackPid),
        whiteElo: null,
        blackElo: null,
        playerFaction: p1Faction,
        result: resTok,
        outcome: winnerPid === 'p1' ? 'win' : 'loss',
        reasonText: t(reasonKey),
        timeControlLabel: timeControl.label,
        turnsPlayed,
        elapsedSeconds: elapsedSecondsRef.current,
        eloDelta: null,
        moves: movesToSave,
      });
    },
    [
      mode,
      moveHistory,
      onlineMatch,
      p1Faction,
      persistCompletedMatch,
      playerLabel,
      playerUidForId,
      pushOnline,
      t,
      timeControl.label,
      turnsPlayed,
    ]
  );

  const handleDownloadPgn = useCallback(() => {
    sound.playClick();
    const whitePid: PlayerId = p1Faction === 'white' ? 'p1' : 'p2';
    const blackPid: PlayerId = p1Faction === 'black' ? 'p1' : 'p2';
    const pgn = buildPGN({
      entries: moveHistory,
      whiteName: playerLabel(whitePid),
      blackName: playerLabel(blackPid),
      result: finalResultToken,
      timeControlLabel: timeControl.label,
    });
    downloadPGNFile(pgn);
  }, [finalResultToken, moveHistory, p1Faction, playerLabel, timeControl.label]);

  const handleWatchCurrentGame = useCallback(() => {
    sound.playClick();
    if (lastCompletedRecord) {
      const fromList = savedMatchHistory.find((m) => m.id === lastCompletedRecord.id);
      setReplayRecord(fromList ?? lastCompletedRecord);
      return;
    }
    const whitePid: PlayerId = p1Faction === 'white' ? 'p1' : 'p2';
    const blackPid: PlayerId = p1Faction === 'black' ? 'p1' : 'p2';
    setReplayRecord({
      id: onlineMatch?.id || currentLocalMatchIdRef.current || `replay_${Date.now()}`,
      ownerUid: myProfileRef.current?.uid || 'local',
      mode,
      whiteName: playerLabel(whitePid),
      blackName: playerLabel(blackPid),
      whiteElo: playerEloForId(whitePid),
      blackElo: playerEloForId(blackPid),
      playerFaction:
        mode === 'online' && myOnlineRole === 'p2' ? oppositeFaction(p1Faction) : p1Faction,
      result: finalResultToken,
      outcome: 'draw',
      reasonText: gameOverReason,
      timeControlLabel: timeControl.label,
      turnsPlayed,
      elapsedSeconds,
      eloDelta: onlineEloResult?.delta ?? null,
      createdAtMs: Date.now(),
      moves: moveHistory,
    });
  }, [
    elapsedSeconds,
    finalResultToken,
    gameOverReason,
    lastCompletedRecord,
    mode,
    moveHistory,
    myOnlineRole,
    onlineEloResult,
    onlineMatch,
    p1Faction,
    playerEloForId,
    playerLabel,
    savedMatchHistory,
    timeControl.label,
    turnsPlayed,
  ]);

  const handleUpdateReplayTree = useCallback((recordId: string, nextTree: ReplayNode) => {
    setReplayRecord((prev) =>
      prev && prev.id === recordId ? { ...prev, replayTree: nextTree } : prev
    );
    setLastCompletedRecord((prev) =>
      prev && prev.id === recordId ? { ...prev, replayTree: nextTree } : prev
    );
    void updateSavedMatchReplayTree(recordId, nextTree, myProfileRef.current?.uid ?? null).then(
      (nextList) => {
        setSavedMatchHistory(nextList);
      }
    );
  }, []);

  const endTurn = useCallback(
    (
      latestBoard: (ChessPiece | null)[][],
      lastCard: Card | null,
      overrideDrawPile?: Card[],
      overrideDiscardPile?: Card[],
      overrideCapW?: ChessPiece[],
      overrideCapB?: ChessPiece[],
      overrideExiled?: ChessPiece[],
      overrideEP?: Coord | null,
      overrideHistory?: MoveHistoryEntry[],
      overrideChain?: { color: CardColor | ''; by: PlayerId | '' }
    ) => {
      const latestHistory = overrideHistory ?? moveHistory;
      const isLastCardWild =
        lastCard?.value === 'wild' || lastCard?.value === 'wild-draw';
      const nextChainColor: CardColor | '' = overrideChain
        ? overrideChain.color
        : lastCard && !isLastCardWild
        ? lastCard.color
        : lastCard && isLastCardWild
        ? ''
        : lastChainColor;
      const nextChainBy: PlayerId | '' = overrideChain
        ? overrideChain.by
        : lastCard && !isLastCardWild
        ? activePlayer
        : lastCard && isLastCardWild
        ? ''
        : lastChainBy;

      const enemy = oppositeFaction(activeFaction);
      const enemyKingExists = latestBoard.some((r) =>
        r.some((p) => p && p.faction === enemy && p.type === 'king')
      );

      if (!enemyKingExists || isCheckmate(latestBoard, enemy)) {
        finishWithWin(
          activePlayer,
          !enemyKingExists ? 'bannerKingCaptured' : 'bannerMateWin',
          latestBoard,
          { moveHistory: latestHistory }
        );
        return;
      }

      const nextDiscard = lastCard
        ? [...(overrideDiscardPile ?? discardPile), lastCard]
        : [...(overrideDiscardPile ?? discardPile)];
      setDiscardPile(nextDiscard);

      let nextP1Ms = p1TimeMsRef.current;
      let nextP2Ms = p2TimeMsRef.current;
      if (timeControl.minutes > 0 && timeControl.increment > 0) {
        const incMs = timeControl.increment * 1000;
        if (activePlayer === 'p1') {
          nextP1Ms = nextP1Ms + incMs;
          p1TimeMsRef.current = nextP1Ms;
          setP1TimeMs(nextP1Ms);
        } else {
          nextP2Ms = nextP2Ms + incMs;
          p2TimeMsRef.current = nextP2Ms;
          setP2TimeMs(nextP2Ms);
        }
      }

      setSelectedCoord(null);
      setWildTeleportPending(false);
      setPendingWildPieceType(null);
      setPendingPromotion(null);
      setCurrentCard(null);
      setCardFaceDown(true);
      setIsFirstMoveOfTurn(true);
      setLastChainColor(nextChainColor);
      setLastChainBy(nextChainBy);

      if (skipOpponentTurns > 0) {
        const nextSkip = skipOpponentTurns - 1;
        setSkipOpponentTurns(nextSkip);
        setPhase('DRAW_PHASE');
        setBannerMsg(t('bannerBlockedExtra', { name: playerLabel(activePlayer) }));

        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(latestBoard),
            drawPile: overrideDrawPile ?? drawPile,
            discardPile: nextDiscard,
            capturedWhitePieces: overrideCapW ?? capturedWhitePieces,
            capturedBlackPieces: overrideCapB ?? capturedBlackPieces,
            exiledPieces: overrideExiled ?? exiledPieces,
            enPassantTarget: overrideEP !== undefined ? overrideEP : enPassantTarget,
            currentCard: null,
            cardFaceDown: true,
            phase: 'DRAW_PHASE',
            movesRemaining: 0,
            skipOpponentTurns: nextSkip,
            wildTeleportPending: false,
            plus2Remaining: 0,
            plus4Remaining: 0,
            pendingWildPieceType: '',
            pendingPromotion: null,
            p1TimeMs: Math.round(nextP1Ms),
            p2TimeMs: Math.round(nextP2Ms),
            bannerKey: 'bannerBlockedExtra',
            bannerParams: { name: playerLabel(activePlayer) },
            lastChainColor: nextChainColor,
            lastChainBy: nextChainBy,
            isFirstMoveOfTurn: true,
            moveHistory: latestHistory,
          });
        }
      } else {
        const nextPlayer: PlayerId = activePlayer === 'p1' ? 'p2' : 'p1';
        const nextFac = nextPlayer === 'p1' ? p1Faction : oppositeFaction(p1Faction);
        const nextTurns = turnsPlayed + 1;
        setActivePlayer(nextPlayer);
        setTurnsPlayed(nextTurns);
        setPhase('DRAW_PHASE');

        if (mode === 'local' && localPlayStyle === 'pass') {
          setBoardFlipped(nextFac === 'black');
        }

        const inChk = isInCheck(latestBoard, nextFac);
        const bannerKey = inChk ? 'bannerCheckTurn' : 'bannerTurnOf';
        setBannerMsg(t(bannerKey, { name: playerLabel(nextPlayer) }));

        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(latestBoard),
            drawPile: overrideDrawPile ?? drawPile,
            discardPile: nextDiscard,
            capturedWhitePieces: overrideCapW ?? capturedWhitePieces,
            capturedBlackPieces: overrideCapB ?? capturedBlackPieces,
            exiledPieces: overrideExiled ?? exiledPieces,
            enPassantTarget: overrideEP !== undefined ? overrideEP : enPassantTarget,
            currentCard: null,
            cardFaceDown: true,
            activePlayer: nextPlayer,
            turnsPlayed: nextTurns,
            phase: 'DRAW_PHASE',
            movesRemaining: 0,
            skipOpponentTurns: 0,
            wildTeleportPending: false,
            plus2Remaining: 0,
            plus4Remaining: 0,
            pendingWildPieceType: '',
            pendingPromotion: null,
            p1TimeMs: Math.round(nextP1Ms),
            p2TimeMs: Math.round(nextP2Ms),
            bannerKey,
            bannerParams: { name: playerLabel(nextPlayer) },
            lastChainColor: nextChainColor,
            lastChainBy: nextChainBy,
            isFirstMoveOfTurn: true,
            moveHistory: latestHistory,
          });
        }
      }
    },
    [
      activeFaction,
      activePlayer,
      capturedBlackPieces,
      capturedWhitePieces,
      discardPile,
      drawPile,
      enPassantTarget,
      exiledPieces,
      finishWithWin,
      lastChainBy,
      lastChainColor,
      localPlayStyle,
      mode,
      moveHistory,
      p1Faction,
      playerLabel,
      pushOnline,
      skipOpponentTurns,
      t,
      timeControl.increment,
      timeControl.minutes,
      turnsPlayed,
    ]
  );

  const triggerReversCard = useCallback(
    (
      card: Card,
      overrideDrawPile?: Card[],
      overrideDiscardPile?: Card[],
      workingBoardParam?: (ChessPiece | null)[][],
      workingCapWParam?: ChessPiece[],
      workingCapBParam?: ChessPiece[],
      overrideHistory?: MoveHistoryEntry[],
      duelMsg = ''
    ) => {
      const latestBoard = workingBoardParam ?? board;
      const latestCapW = workingCapWParam ?? capturedWhitePieces;
      const latestCapB = workingCapBParam ?? capturedBlackPieces;
      const nextHistory = [
        ...(overrideHistory ?? moveHistory),
        {
          ply: (overrideHistory ?? moveHistory).length + 1,
          turnNumber: turnsPlayed,
          faction: activeFaction,
          san: '↺ Revers',
          comment: t('cardReversTitle'),
          isChessMove: false,
          cardColor: card.color,
          cardValue: card.value,
          boardAfter: serializeBoardCompact(latestBoard),
        },
      ];
      setMoveHistory(nextHistory);

      sound.playRotate();
      setPhase('REVERSING');
      setIsSpinning(true);
      setBannerMsg(t('bannerRevers'));

      if (mode === 'online') {
        pushOnline({
          boardFlat: flattenBoard(latestBoard),
          capturedWhitePieces: latestCapW,
          capturedBlackPieces: latestCapB,
          phase: 'REVERSING',
          currentCard: card,
          cardFaceDown: false,
          bannerKey: 'bannerRevers',
          bannerParams: {},
          lastChainColor: card.color,
          lastChainBy: activePlayer,
          isFirstMoveOfTurn: true,
          moveHistory: nextHistory,
          lastDuelText: duelMsg,
        });
      }

      const sessionAtSchedule = gameSessionRef.current;
      window.setTimeout(() => {
        if (gameSessionRef.current !== sessionAtSchedule) return;
        let nextP1Ms = p1TimeMsRef.current;
        let nextP2Ms = p2TimeMsRef.current;
        if (timeControl.minutes > 0 && timeControl.increment > 0) {
          const incMs = timeControl.increment * 1000;
          if (activePlayer === 'p1') {
            nextP1Ms = nextP1Ms + incMs;
            p1TimeMsRef.current = nextP1Ms;
            setP1TimeMs(nextP1Ms);
          } else {
            nextP2Ms = nextP2Ms + incMs;
            p2TimeMsRef.current = nextP2Ms;
            setP2TimeMs(nextP2Ms);
          }
        }

        const newP1Faction = oppositeFaction(p1Faction);
        setP1Faction(newP1Faction);
        setIsSpinning(false);

        const nextDiscard = [...(overrideDiscardPile ?? discardPile), card];
        setDiscardPile(nextDiscard);
        setCurrentCard(null);
        setCardFaceDown(true);
        setSelectedCoord(null);
        setLastChainColor(card.color);
        setLastChainBy(activePlayer);
        setIsFirstMoveOfTurn(true);

        const nextPlayer: PlayerId = activePlayer === 'p1' ? 'p2' : 'p1';
        const nextFac = nextPlayer === 'p1' ? newP1Faction : oppositeFaction(newP1Faction);

        if (mode === 'online') {
          const myNewFac = myOnlineRole === 'p1' ? newP1Faction : oppositeFaction(newP1Faction);
          setBoardFlipped(myNewFac === 'black');
        } else if (mode === 'local' && localPlayStyle === 'pass') {
          setBoardFlipped(nextFac === 'black');
        } else {
          setBoardFlipped((f) => !f);
        }

        const nextTurns = turnsPlayed + 1;
        setActivePlayer(nextPlayer);
        setTurnsPlayed(nextTurns);
        setPhase('DRAW_PHASE');

        const inChk = isInCheck(latestBoard, nextFac);
        if (inChk) sound.playCheck();
        const bannerKey = inChk ? 'bannerReversCheck' : 'bannerReversDone';
        setBannerMsg(t(bannerKey, { name: playerLabel(nextPlayer) }));

        if (mode === 'online') {
          pushOnline({
            p1Faction: newP1Faction,
            activePlayer: nextPlayer,
            turnsPlayed: nextTurns,
            drawPile: overrideDrawPile ?? drawPile,
            discardPile: nextDiscard,
            currentCard: null,
            cardFaceDown: true,
            phase: 'DRAW_PHASE',
            p1TimeMs: Math.round(nextP1Ms),
            p2TimeMs: Math.round(nextP2Ms),
            bannerKey,
            bannerParams: { name: playerLabel(nextPlayer) },
            lastChainColor: card.color,
            lastChainBy: activePlayer,
            isFirstMoveOfTurn: true,
            moveHistory: nextHistory,
          });
        }
      }, 750);
    },
    [
      activeFaction,
      activePlayer,
      board,
      capturedBlackPieces,
      capturedWhitePieces,
      discardPile,
      drawPile,
      localPlayStyle,
      mode,
      moveHistory,
      myOnlineRole,
      p1Faction,
      playerLabel,
      pushOnline,
      t,
      timeControl.increment,
      timeControl.minutes,
      turnsPlayed,
    ]
  );

  const resolveDrawnCard = useCallback(
    (card: Card, nextDrawPile: Card[], nextDiscardPile: Card[]) => {
      const val = card.value;
      const isWildCard = val === 'wild' || val === 'wild-draw';

      let workingBoard = board;
      let workingCapW = capturedWhitePieces;
      let workingCapB = capturedBlackPieces;
      let workingHistory = moveHistory;
      let duelMsg = '';

      // Update chain tracking (black wilds break the chain!)
      const nextChainColor: CardColor | '' = isWildCard ? '' : card.color;
      const nextChainBy: PlayerId | '' = isWildCard ? '' : activePlayer;
      setLastChainColor(nextChainColor);
      setLastChainBy(nextChainBy);
      setIsFirstMoveOfTurn(true);

      // Regla 2: Duelo de Color (Coincidencia en Mesa)
      if (
        !isWildCard &&
        lastChainColor !== '' &&
        lastChainBy !== '' &&
        lastChainBy !== activePlayer &&
        card.color === lastChainColor
      ) {
        const duel = resolveColorDuel(workingBoard, workingCapW, workingCapB, activeFaction);
        workingBoard = duel.nextBoard;
        workingCapW = duel.nextCapW;
        workingCapB = duel.nextCapB;
        setBoard(workingBoard);
        setCapturedWhitePieces(workingCapW);
        setCapturedBlackPieces(workingCapB);
        sound.playCapture();

        const stolenLabel = duel.stolenPieceType ? pieceLabel(duel.stolenPieceType) : t('noneWord');
        const lostLabel = duel.lostPieceType ? pieceLabel(duel.lostPieceType) : t('noneWord');
        duelMsg = t('colorDuelBanner', {
          color: colorLabel(card.color),
          stolen: stolenLabel,
          lost: lostLabel,
        });
        setDuelToastMsg(duelMsg);
        window.setTimeout(() => setDuelToastMsg(null), 5000);

        workingHistory = [
          ...workingHistory,
          {
            ply: workingHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: t('colorDuelBadge', { color: colorLabel(card.color) }),
            comment: duelMsg,
            isChessMove: false,
            cardColor: card.color,
            cardValue: card.value,
            duelEvent: true,
            boardAfter: serializeBoardCompact(workingBoard),
          },
        ];
        setMoveHistory(workingHistory);
      }

      const workingOwnCaptured =
        activeFaction === 'white' ? workingCapW : workingCapB;

      if (val === '0') {
        const zeroHist: MoveHistoryEntry[] = [
          ...workingHistory,
          {
            ply: workingHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `0 ${colorLabel(card.color)}`,
            comment: t('card0Title'),
            isChessMove: false,
            cardColor: card.color,
            cardValue: card.value,
            boardAfter: serializeBoardCompact(workingBoard),
          },
        ];
        setMoveHistory(zeroHist);
        setBannerMsg(duelMsg || t('bannerCard0'));
        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(workingBoard),
            capturedWhitePieces: workingCapW,
            capturedBlackPieces: workingCapB,
            drawPile: nextDrawPile,
            discardPile: nextDiscardPile,
            currentCard: card,
            cardFaceDown: false,
            bannerKey: 'bannerCard0',
            bannerParams: {},
            lastChainColor: nextChainColor,
            lastChainBy: nextChainBy,
            isFirstMoveOfTurn: true,
            moveHistory: zeroHist,
            lastDuelText: duelMsg,
          });
        }
        const sessionAtZero = gameSessionRef.current;
        window.setTimeout(() => {
          if (gameSessionRef.current !== sessionAtZero) return;
          endTurn(
            workingBoard,
            card,
            nextDrawPile,
            nextDiscardPile,
            workingCapW,
            workingCapB,
            undefined,
            undefined,
            zeroHist,
            { color: nextChainColor, by: nextChainBy }
          );
        }, 1150);
        return;
      }

      if (val === 'revers') {
        triggerReversCard(
          card,
          nextDrawPile,
          nextDiscardPile,
          workingBoard,
          workingCapW,
          workingCapB,
          workingHistory,
          duelMsg
        );
        return;
      }

      if (val === 'interdit') {
        sound.playSpecial();
        const nextSkip = skipOpponentTurns + 1;
        setSkipOpponentTurns(nextSkip);
        setMovesRemaining(1);
        setPhase('MOVE_PHASE');
        setBannerMsg(duelMsg ? `${duelMsg} · ${t('bannerInterdit')}` : t('bannerInterdit'));
        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(workingBoard),
            capturedWhitePieces: workingCapW,
            capturedBlackPieces: workingCapB,
            drawPile: nextDrawPile,
            discardPile: nextDiscardPile,
            currentCard: card,
            cardFaceDown: false,
            skipOpponentTurns: nextSkip,
            movesRemaining: 1,
            phase: 'MOVE_PHASE',
            bannerKey: 'bannerInterdit',
            bannerParams: {},
            lastChainColor: nextChainColor,
            lastChainBy: nextChainBy,
            isFirstMoveOfTurn: true,
            moveHistory: workingHistory,
            lastDuelText: duelMsg,
          });
        }
        return;
      }

      if (val === 'wild') {
        sound.playSpecial();
        setPhase('WILD_COLOR_CHOICE');
        setBannerMsg(t('bannerWildColor'));
        if (mode === 'online') {
          pushOnline({
            drawPile: nextDrawPile,
            discardPile: nextDiscardPile,
            currentCard: card,
            cardFaceDown: false,
            phase: 'WILD_COLOR_CHOICE',
            bannerKey: 'bannerWildColor',
            bannerParams: {},
            lastChainColor: '',
            lastChainBy: '',
            isFirstMoveOfTurn: true,
            moveHistory: workingHistory,
            lastDuelText: '',
          });
        }
        return;
      }

      if (val === 'wild-draw') {
        sound.playSpecial();
        setPhase('WILD_PLUS4_CHOICE');
        setBannerMsg(t('bannerWildPlus4'));
        if (mode === 'online') {
          pushOnline({
            drawPile: nextDrawPile,
            discardPile: nextDiscardPile,
            currentCard: card,
            cardFaceDown: false,
            phase: 'WILD_PLUS4_CHOICE',
            bannerKey: 'bannerWildPlus4',
            bannerParams: {},
            lastChainColor: '',
            lastChainBy: '',
            isFirstMoveOfTurn: true,
            moveHistory: workingHistory,
            lastDuelText: '',
          });
        }
        return;
      }

      if (val === 'draw2') {
        sound.playSpecial();
        const emptyHome = getEmptyHomeRows(workingBoard, activeFaction);

        if (workingOwnCaptured.length > 0) {
          if (emptyHome.length === 0) {
            setMovesRemaining(2);
            setPhase('MOVE_PHASE');
            setBannerMsg(t('bannerPlus2NoSpace'));
            if (mode === 'online') {
              pushOnline({
                boardFlat: flattenBoard(workingBoard),
                capturedWhitePieces: workingCapW,
                capturedBlackPieces: workingCapB,
                drawPile: nextDrawPile,
                discardPile: nextDiscardPile,
                currentCard: card,
                cardFaceDown: false,
                movesRemaining: 2,
                phase: 'MOVE_PHASE',
                bannerKey: 'bannerPlus2NoSpace',
                bannerParams: {},
                lastChainColor: nextChainColor,
                lastChainBy: nextChainBy,
                isFirstMoveOfTurn: true,
                moveHistory: workingHistory,
                lastDuelText: duelMsg,
              });
            }
          } else {
            const count = Math.min(2, workingOwnCaptured.length, emptyHome.length);
            setPlus2Remaining(count);
            setSelectedRecoverId(null);
            setPhase('PLUS2_RECOVER_PHASE');
            setBannerMsg(t('bannerPlus2Recover', { count }));
            if (mode === 'online') {
              pushOnline({
                boardFlat: flattenBoard(workingBoard),
                capturedWhitePieces: workingCapW,
                capturedBlackPieces: workingCapB,
                drawPile: nextDrawPile,
                discardPile: nextDiscardPile,
                currentCard: card,
                cardFaceDown: false,
                plus2Remaining: count,
                phase: 'PLUS2_RECOVER_PHASE',
                bannerKey: 'bannerPlus2Recover',
                bannerParams: { count },
                lastChainColor: nextChainColor,
                lastChainBy: nextChainBy,
                isFirstMoveOfTurn: true,
                moveHistory: workingHistory,
                lastDuelText: duelMsg,
              });
            }
          }
          return;
        }

        const prio = getHighestPriorityEnemyCoords(workingBoard, enemyFaction);
        if (prio.tier === 4) {
          setMovesRemaining(2);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerPlus2OnlyKing'));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(workingBoard),
              capturedWhitePieces: workingCapW,
              capturedBlackPieces: workingCapB,
              drawPile: nextDrawPile,
              discardPile: nextDiscardPile,
              currentCard: card,
              cardFaceDown: false,
              movesRemaining: 2,
              phase: 'MOVE_PHASE',
              bannerKey: 'bannerPlus2OnlyKing',
              bannerParams: {},
              lastChainColor: nextChainColor,
              lastChainBy: nextChainBy,
              isFirstMoveOfTurn: true,
              moveHistory: workingHistory,
              lastDuelText: duelMsg,
            });
          }
        } else if (emptyHome.length === 0) {
          setMovesRemaining(2);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerPlus2NoSpace'));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(workingBoard),
              capturedWhitePieces: workingCapW,
              capturedBlackPieces: workingCapB,
              drawPile: nextDrawPile,
              discardPile: nextDiscardPile,
              currentCard: card,
              cardFaceDown: false,
              movesRemaining: 2,
              phase: 'MOVE_PHASE',
              bannerKey: 'bannerPlus2NoSpace',
              bannerParams: {},
              lastChainColor: nextChainColor,
              lastChainBy: nextChainBy,
              isFirstMoveOfTurn: true,
              moveHistory: workingHistory,
              lastDuelText: duelMsg,
            });
          }
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
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(workingBoard),
              capturedWhitePieces: workingCapW,
              capturedBlackPieces: workingCapB,
              drawPile: nextDrawPile,
              discardPile: nextDiscardPile,
              currentCard: card,
              cardFaceDown: false,
              plus2Remaining: stealQuota,
              phase: 'PLUS2_STEAL_PHASE',
              bannerKey: 'bannerPlus2Steal',
              bannerParams: { tier: tierName },
              lastChainColor: nextChainColor,
              lastChainBy: nextChainBy,
              isFirstMoveOfTurn: true,
              moveHistory: workingHistory,
              lastDuelText: duelMsg,
            });
          }
        }
        return;
      }

      const num = parseInt(val, 10);
      setMovesRemaining(num);
      setPhase('MOVE_PHASE');
      const legal = getUnoChessLegalMoves(workingBoard, activeFaction, enPassantTarget, num);
      if (legal.length === 0) {
        if (isInCheck(workingBoard, activeFaction)) {
          finishWithWin(activePlayer === 'p1' ? 'p2' : 'p1', 'bannerMateWin', workingBoard, {
            capturedWhitePieces: workingCapW,
            capturedBlackPieces: workingCapB,
            moveHistory: workingHistory,
          });
        } else {
          setBannerMsg(t('bannerNoMovesEnd'));
          const sessionAtNoMoves = gameSessionRef.current;
          window.setTimeout(
            () => {
              if (gameSessionRef.current !== sessionAtNoMoves) return;
              endTurn(
                workingBoard,
                card,
                nextDrawPile,
                nextDiscardPile,
                workingCapW,
                workingCapB,
                undefined,
                undefined,
                workingHistory,
                { color: nextChainColor, by: nextChainBy }
              );
            },
            900
          );
        }
        return;
      }
      setBannerMsg(
        duelMsg
          ? `${duelMsg} · ${t('bannerMovesRemaining', { count: num })}`
          : t('bannerMovesRemaining', { count: num })
      );
      if (mode === 'online') {
        pushOnline({
          boardFlat: flattenBoard(workingBoard),
          capturedWhitePieces: workingCapW,
          capturedBlackPieces: workingCapB,
          drawPile: nextDrawPile,
          discardPile: nextDiscardPile,
          currentCard: card,
          cardFaceDown: false,
          movesRemaining: num,
          phase: 'MOVE_PHASE',
          bannerKey: 'bannerMovesRemaining',
          bannerParams: { count: num },
          lastChainColor: nextChainColor,
          lastChainBy: nextChainBy,
          isFirstMoveOfTurn: true,
          moveHistory: workingHistory,
          lastDuelText: duelMsg,
        });
      }
    },
    [
      activeFaction,
      activePlayer,
      board,
      capturedBlackPieces,
      capturedWhitePieces,
      colorLabel,
      enPassantTarget,
      endTurn,
      enemyFaction,
      finishWithWin,
      lastChainBy,
      lastChainColor,
      mode,
      moveHistory,
      pieceLabel,
      pushOnline,
      skipOpponentTurns,
      t,
      triggerReversCard,
      turnsPlayed,
    ]
  );

  const handleDrawCard = useCallback(() => {
    if (phase !== 'DRAW_PHASE' || !isHumanTurn || (isPaused && mode !== 'online')) return;
    sound.unlock();

    let workingDeck = [...drawPile];
    let workingDiscard = [...discardPile];
    let reshuffled = false;
    if (workingDeck.length === 0) {
      if (workingDiscard.length === 0) {
        workingDeck = createDeck();
      } else {
        workingDeck = shuffleCards(workingDiscard);
        workingDiscard = [];
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

    if (mode === 'online') {
      pushOnline({
        drawPile: rest,
        discardPile: workingDiscard,
        currentCard: drawn,
        cardFaceDown: false,
        phase: 'CARD_REVEALING',
        bannerKey: reshuffled ? 'bannerReshuffle' : 'bannerDrawing',
        bannerParams: reshuffled ? {} : { name: playerLabel(activePlayer) },
      });
    }

    const sessionAtDraw = gameSessionRef.current;
    window.setTimeout(() => {
      if (gameSessionRef.current !== sessionAtDraw) return;
      setCardFaceDown(false);
    }, 90);

    window.setTimeout(() => {
      if (gameSessionRef.current !== sessionAtDraw) return;
      resolveDrawnCard(drawn, rest, workingDiscard);
    }, 620);
  }, [
    activePlayer,
    discardPile,
    drawPile,
    isHumanTurn,
    isPaused,
    mode,
    phase,
    playerLabel,
    pushOnline,
    resolveDrawnCard,
    t,
  ]);

  const executeMove = useCallback(
    (move: Move, promoType: PieceType = 'queen', overrideRemaining?: number) => {
      const movingPiece = board[move.from.row][move.from.col];
      if (!movingPiece) return;

      // Regla 1: Bono de Sincronía de Color (+2 extra moves if 1st move matches non-wild card color)
      const syncEligible =
        isFirstMoveOfTurn &&
        currentCard !== null &&
        currentCard.value !== 'wild' &&
        currentCard.value !== 'wild-draw' &&
        PIECE_BASE_COLOR_MAP[movingPiece.type] === currentCard.color;
      if (isFirstMoveOfTurn) {
        setIsFirstMoveOfTurn(false);
      }
      const syncBonusMoves = syncEligible ? 2 : 0;

      const promoRow = movingPiece.faction === 'white' ? 0 : 7;
      const isPawnPromotion =
        movingPiece.type === 'pawn' && (move.promotionRequired || move.to.row === promoRow);

      // Human pawn reaching last rank -> keep as pawn and open PromotionModal!
      if (isPawnPromotion && isHumanTurn && overrideRemaining === undefined) {
        const { nextBoard, capturedPiece, nextEnPassant } = applyMoveToBoard(
          board,
          { ...move, promotionRequired: false },
          'pawn'
        );
        let nextCapW = capturedWhitePieces;
        let nextCapB = capturedBlackPieces;
        if (capturedPiece) {
          sound.playCapture();
          if (capturedPiece.faction === 'white') {
            nextCapW = [...capturedWhitePieces, capturedPiece];
            setCapturedWhitePieces(nextCapW);
          } else {
            nextCapB = [...capturedBlackPieces, capturedPiece];
            setCapturedBlackPieces(nextCapB);
          }
        } else {
          sound.playMove();
        }
        if (syncEligible) sound.playSpecial();

        const enemy = oppositeFaction(movingPiece.faction);
        const san = formatMoveToSAN(board, { ...move, promotionRequired: false }, null, nextBoard, enemy);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: movingPiece.faction,
            san,
            comment: syncEligible
              ? `${currentCard?.value} ${colorLabel(currentCard!.color)} · ${t('colorSyncBadge')}`
              : currentCard
              ? `${currentCard.value} ${colorLabel(currentCard.color)}`
              : '',
            isChessMove: true,
            cardColor: currentCard?.color ?? '',
            cardValue: currentCard?.value ?? '',
            syncBonus: syncEligible,
            boardAfter: serializeBoardCompact(nextBoard),
            fromSq: coordToSq(move.from),
            toSq: coordToSq(move.to),
          },
        ];
        setMoveHistory(nextHistory);

        const enemyKingAlive = nextBoard.some((r) =>
          r.some((p) => p && p.faction === enemy && p.type === 'king')
        );
        if (!enemyKingAlive) {
          setBoard(nextBoard);
          finishWithWin(activePlayer, 'bannerKingCaptured', nextBoard, {
            moveHistory: nextHistory,
          });
          return;
        }

        const promoData: PendingPromotion = { coord: move.to, faction: movingPiece.faction };
        setBoard(nextBoard);
        setEnPassantTarget(nextEnPassant);
        setSelectedCoord(null);
        setPendingPromotion(promoData);
        const promoMovesAfter = Math.max(0, movesRemaining - 1 + syncBonusMoves);
        setPromotionSavedMovesAfter(promoMovesAfter);
        setPhase('PROMOTION_CHOICE');

        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(nextBoard),
            capturedWhitePieces: nextCapW,
            capturedBlackPieces: nextCapB,
            enPassantTarget: nextEnPassant,
            pendingPromotion: promoData,
            movesRemaining: promoMovesAfter,
            phase: 'PROMOTION_CHOICE',
            bannerKey: 'promoTitle',
            bannerParams: {},
            isFirstMoveOfTurn: false,
            moveHistory: nextHistory,
          });
        }
        return;
      }

      const { nextBoard, capturedPiece, nextEnPassant } = applyMoveToBoard(
        board,
        { ...move, promotionRequired: isPawnPromotion },
        promoType
      );

      let nextCapW = capturedWhitePieces;
      let nextCapB = capturedBlackPieces;
      if (capturedPiece) {
        sound.playCapture();
        if (capturedPiece.faction === 'white') {
          nextCapW = [...capturedWhitePieces, capturedPiece];
          setCapturedWhitePieces(nextCapW);
        } else {
          nextCapB = [...capturedBlackPieces, capturedPiece];
          setCapturedBlackPieces(nextCapB);
        }
      } else {
        sound.playMove();
      }
      if (syncEligible) sound.playSpecial();

      setBoard(nextBoard);
      setEnPassantTarget(nextEnPassant);
      setSelectedCoord(null);

      const enemy = oppositeFaction(movingPiece.faction);
      const san = formatMoveToSAN(
        board,
        { ...move, promotionRequired: isPawnPromotion },
        isPawnPromotion ? promoType : null,
        nextBoard,
        enemy
      );
      const nextHistory: MoveHistoryEntry[] = [
        ...moveHistory,
        {
          ply: moveHistory.length + 1,
          turnNumber: turnsPlayed,
          faction: movingPiece.faction,
          san,
          comment: syncEligible
            ? `${currentCard?.value} ${colorLabel(currentCard!.color)} · ${t('colorSyncBadge')}`
            : currentCard
            ? `${currentCard.value} ${colorLabel(currentCard.color)}`
            : '',
          isChessMove: true,
          cardColor: currentCard?.color ?? '',
          cardValue: currentCard?.value ?? '',
          syncBonus: syncEligible,
          boardAfter: serializeBoardCompact(nextBoard),
          fromSq: coordToSq(move.from),
          toSq: coordToSq(move.to),
        },
      ];
      setMoveHistory(nextHistory);

      const baseRem = overrideRemaining !== undefined ? overrideRemaining : movesRemaining - 1;
      const enemyKingAlive = nextBoard.some((r) =>
        r.some((p) => p && p.faction === enemy && p.type === 'king')
      );

      if (!enemyKingAlive) {
        finishWithWin(activePlayer, 'bannerKingCaptured', nextBoard, {
          capturedWhitePieces: nextCapW,
          capturedBlackPieces: nextCapB,
          moveHistory: nextHistory,
        });
        return;
      }

      // If the card's base moves reached 0 AND already delivered Checkmate, win immediately
      if (baseRem <= 0 && isCheckmate(nextBoard, enemy)) {
        finishWithWin(activePlayer, 'bannerMateWin', nextBoard, {
          capturedWhitePieces: nextCapW,
          capturedBlackPieces: nextCapB,
          moveHistory: nextHistory,
        });
        return;
      }

      const rem = baseRem + syncBonusMoves;

      if (rem <= 0) {
        if (isCheckmate(nextBoard, enemy)) {
          finishWithWin(activePlayer, 'bannerMateWin', nextBoard, {
            capturedWhitePieces: nextCapW,
            capturedBlackPieces: nextCapB,
            moveHistory: nextHistory,
          });
          return;
        }
        if (isInCheck(nextBoard, enemy)) {
          sound.playCheck();
        }

        if (wildTeleportPending) {
          setMovesRemaining(0);
          setPhase('WILD_TELEPORT_PHASE');
          setBannerMsg(t('bannerWildStep2'));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              capturedWhitePieces: nextCapW,
              capturedBlackPieces: nextCapB,
              enPassantTarget: nextEnPassant,
              movesRemaining: 0,
              phase: 'WILD_TELEPORT_PHASE',
              bannerKey: 'bannerWildStep2',
              bannerParams: {},
              isFirstMoveOfTurn: false,
              moveHistory: nextHistory,
            });
          }
        } else {
          setMovesRemaining(0);
          endTurn(
            nextBoard,
            currentCard,
            undefined,
            undefined,
            nextCapW,
            nextCapB,
            undefined,
            nextEnPassant,
            nextHistory
          );
        }
      } else {
        setMovesRemaining(rem);
        const nextLegal = getUnoChessLegalMoves(nextBoard, activeFaction, nextEnPassant, rem);
        if (nextLegal.length === 0) {
          if (wildTeleportPending) {
            setMovesRemaining(0);
            setPhase('WILD_TELEPORT_PHASE');
            setBannerMsg(t('bannerWildStep2'));
            if (mode === 'online') {
              pushOnline({
                boardFlat: flattenBoard(nextBoard),
                capturedWhitePieces: nextCapW,
                capturedBlackPieces: nextCapB,
                enPassantTarget: nextEnPassant,
                movesRemaining: 0,
                phase: 'WILD_TELEPORT_PHASE',
                bannerKey: 'bannerWildStep2',
                bannerParams: {},
                isFirstMoveOfTurn: false,
                moveHistory: nextHistory,
              });
            }
          } else {
            endTurn(
              nextBoard,
              currentCard,
              undefined,
              undefined,
              nextCapW,
              nextCapB,
              undefined,
              nextEnPassant,
              nextHistory
            );
          }
          return;
        }
        const inChk = isInCheck(nextBoard, enemy);
        if (inChk) sound.playCheck();
        const bannerKey = syncEligible
          ? 'colorSyncBonusBanner'
          : inChk
          ? 'bannerCheckRemaining'
          : 'bannerMovesRemaining';
        const bannerParams: Record<string, string | number> = syncEligible
          ? { color: colorLabel(currentCard!.color), count: rem }
          : { count: rem };
        setBannerMsg(t(bannerKey, bannerParams));
        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(nextBoard),
            capturedWhitePieces: nextCapW,
            capturedBlackPieces: nextCapB,
            enPassantTarget: nextEnPassant,
            movesRemaining: rem,
            phase: 'MOVE_PHASE',
            bannerKey,
            bannerParams,
            isFirstMoveOfTurn: false,
            moveHistory: nextHistory,
          });
        }
      }
    },
    [
      activeFaction,
      activePlayer,
      board,
      capturedBlackPieces,
      capturedWhitePieces,
      colorLabel,
      currentCard,
      endTurn,
      finishWithWin,
      isFirstMoveOfTurn,
      isHumanTurn,
      mode,
      moveHistory,
      movesRemaining,
      pushOnline,
      t,
      turnsPlayed,
      wildTeleportPending,
    ]
  );

  const handleSelectPromotion = (type: PieceType) => {
    if (!pendingPromotion) return;
    if (mode === 'online' && !isHumanTurn) return;
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

    const promoLetter = type === 'queen' ? 'Q' : type === 'rook' ? 'R' : type === 'bishop' ? 'B' : 'N';
    const nextHistory: MoveHistoryEntry[] = [
      ...moveHistory,
      {
        ply: moveHistory.length + 1,
        turnNumber: turnsPlayed,
        faction: pendingPromotion.faction,
        san: `${coordToAlgebraic(pendingPromotion.coord)}=${promoLetter}`,
        comment: pieceLabel(type),
        isChessMove: false,
        boardAfter: serializeBoardCompact(nextBoard),
        fromSq: coordToSq(pendingPromotion.coord),
        toSq: coordToSq(pendingPromotion.coord),
      },
    ];
    setMoveHistory(nextHistory);

    const enemy = oppositeFaction(pendingPromotion.faction);
    if (promotionSavedMovesAfter <= 0) {
      if (isCheckmate(nextBoard, enemy)) {
        finishWithWin(activePlayer, 'bannerPromoMate', nextBoard, {
          pendingPromotion: null,
          moveHistory: nextHistory,
        });
        return;
      }
      if (wildTeleportPending) {
        setMovesRemaining(0);
        setPhase('WILD_TELEPORT_PHASE');
        setBannerMsg(t('bannerWildStep2'));
        if (mode === 'online') {
          pushOnline({
            boardFlat: flattenBoard(nextBoard),
            pendingPromotion: null,
            movesRemaining: 0,
            phase: 'WILD_TELEPORT_PHASE',
            bannerKey: 'bannerWildStep2',
            bannerParams: {},
            moveHistory: nextHistory,
          });
        }
      } else {
        setMovesRemaining(0);
        endTurn(nextBoard, currentCard, undefined, undefined, undefined, undefined, undefined, undefined, nextHistory);
      }
    } else {
      const nextLegal = getUnoChessLegalMoves(
        nextBoard,
        activeFaction,
        enPassantTarget,
        promotionSavedMovesAfter
      );
      if (nextLegal.length === 0) {
        if (wildTeleportPending) {
          setMovesRemaining(0);
          setPhase('WILD_TELEPORT_PHASE');
          setBannerMsg(t('bannerWildStep2'));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              pendingPromotion: null,
              movesRemaining: 0,
              phase: 'WILD_TELEPORT_PHASE',
              bannerKey: 'bannerWildStep2',
              bannerParams: {},
              moveHistory: nextHistory,
            });
          }
        } else {
          setMovesRemaining(0);
          endTurn(nextBoard, currentCard, undefined, undefined, undefined, undefined, undefined, undefined, nextHistory);
        }
        return;
      }
      setMovesRemaining(promotionSavedMovesAfter);
      setPhase('MOVE_PHASE');
      setBannerMsg(t('bannerMovesRemaining', { count: promotionSavedMovesAfter }));
      if (mode === 'online') {
        pushOnline({
          boardFlat: flattenBoard(nextBoard),
          pendingPromotion: null,
          movesRemaining: promotionSavedMovesAfter,
          phase: 'MOVE_PHASE',
          bannerKey: 'bannerMovesRemaining',
          bannerParams: { count: promotionSavedMovesAfter },
          moveHistory: nextHistory,
        });
      }
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
    if (phase === 'WILD_PLACE_PIECE_PHASE') {
      return {
        highlightCoords: getWildPlacementSquares(board, activeFaction),
        highlightMode: 'place',
      };
    }

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
    if (!isHumanTurn || (isPaused && mode !== 'online')) return;
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

    if (phase === 'WILD_PLACE_PIECE_PHASE') {
      if (
        pendingWildPieceType &&
        highlightCoords.some((h) => h.row === coord.row && h.col === coord.col)
      ) {
        const nextBoard = cloneBoard(board);
        nextBoard[coord.row][coord.col] = {
          id: `wild-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: pendingWildPieceType,
          faction: activeFaction,
          pieceNumber: 1,
          hasMoved: true,
        };
        sound.playSpecial();
        setBoard(nextBoard);
        setPendingWildPieceType(null);
        setWildTeleportPending(true);

        const pLetter =
          pendingWildPieceType === 'queen'
            ? 'Q'
            : pendingWildPieceType === 'rook'
            ? 'R'
            : pendingWildPieceType === 'bishop'
            ? 'B'
            : pendingWildPieceType === 'knight'
            ? 'N'
            : 'P';
        const destSq = coordToSq(coord);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+${pLetter}@${destSq}`,
            comment: pieceLabel(pendingWildPieceType),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: 'wild',
            boardAfter: serializeBoardCompact(nextBoard),
            toSq: destSq,
          },
        ];
        setMoveHistory(nextHistory);

        const step1Moves = getUnoChessLegalMoves(nextBoard, activeFaction, enPassantTarget, 1);
        if (step1Moves.length > 0) {
          setMovesRemaining(1);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerWildStep1'));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              pendingWildPieceType: '',
              wildTeleportPending: true,
              movesRemaining: 1,
              phase: 'MOVE_PHASE',
              bannerKey: 'bannerWildStep1',
              bannerParams: {},
              moveHistory: nextHistory,
            });
          }
        } else {
          setMovesRemaining(0);
          setPhase('WILD_TELEPORT_PHASE');
          setBannerMsg(t('bannerWildStep2'));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              pendingWildPieceType: '',
              wildTeleportPending: true,
              movesRemaining: 0,
              phase: 'WILD_TELEPORT_PHASE',
              bannerKey: 'bannerWildStep2',
              bannerParams: {},
              moveHistory: nextHistory,
            });
          }
        }
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

        const fromSq = coordToSq(selectedCoord);
        const toSq = coordToSq(coord);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `⚡${fromSq}→${toSq}`,
            comment: t('teleportActive'),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: currentCard?.value ?? 'wild',
            boardAfter: serializeBoardCompact(nextBoard),
            fromSq,
            toSq,
          },
        ];
        setMoveHistory(nextHistory);

        // If a pawn was teleported onto its promotion rank, trigger Pawn Promotion!
        const promoRow = moving.faction === 'white' ? 0 : 7;
        if (moving.type === 'pawn' && coord.row === promoRow) {
          const promoData: PendingPromotion = { coord, faction: moving.faction };
          setPendingPromotion(promoData);
          setPromotionSavedMovesAfter(0);
          setPhase('PROMOTION_CHOICE');
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              wildTeleportPending: false,
              pendingPromotion: promoData,
              movesRemaining: 0,
              phase: 'PROMOTION_CHOICE',
              bannerKey: 'promoTitle',
              bannerParams: {},
              moveHistory: nextHistory,
            });
          }
          return;
        }

        endTurn(
          nextBoard,
          currentCard,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          nextHistory
        );
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

        let nextCapW = capturedWhitePieces;
        let nextCapB = capturedBlackPieces;
        if (activeFaction === 'white') {
          nextCapW = capturedWhitePieces.filter((p) => p.id !== selectedRecoverId);
          setCapturedWhitePieces(nextCapW);
        } else {
          nextCapB = capturedBlackPieces.filter((p) => p.id !== selectedRecoverId);
          setCapturedBlackPieces(nextCapB);
        }

        const destSq = coordToSq(coord);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+2↑${destSq}`,
            comment: pieceLabel(recovered.type),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: 'draw2',
            boardAfter: serializeBoardCompact(nextBoard),
            toSq: destSq,
          },
        ];
        setMoveHistory(nextHistory);

        const rem = plus2Remaining - 1;
        setSelectedRecoverId(null);
        const nextEmpties = getEmptyHomeRows(nextBoard, activeFaction);
        const remainingCapturedCount = ownCapturedPieces.length - 1;
        if (rem <= 0 || nextEmpties.length === 0 || remainingCapturedCount <= 0) {
          setPlus2Remaining(0);
          endTurn(
            nextBoard,
            currentCard,
            undefined,
            undefined,
            nextCapW,
            nextCapB,
            undefined,
            undefined,
            nextHistory
          );
        } else {
          setPlus2Remaining(rem);
          setBannerMsg(t('bannerRecoveredMore', { count: rem }));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              capturedWhitePieces: nextCapW,
              capturedBlackPieces: nextCapB,
              plus2Remaining: rem,
              bannerKey: 'bannerRecoveredMore',
              bannerParams: { count: rem },
              moveHistory: nextHistory,
            });
          }
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

        const fromSq = coordToSq(selectedStealCoord);
        const toSq = coordToSq(coord);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+2⇄${fromSq}→${toSq}`,
            comment: pieceLabel(stolen.type),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: 'draw2',
            boardAfter: serializeBoardCompact(nextBoard),
            fromSq,
            toSq,
          },
        ];
        setMoveHistory(nextHistory);

        const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
        const nextEmpties = getEmptyHomeRows(nextBoard, activeFaction);
        const wasTier3 = stolen.type === 'rook' || stolen.type === 'queen';
        const rem = wasTier3 ? 0 : plus2Remaining - 1;

        if (rem <= 0 || nextPrio.tier === 4 || nextEmpties.length === 0) {
          setPlus2Remaining(0);
          endTurn(
            nextBoard,
            currentCard,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            nextHistory
          );
        } else {
          const cappedRem = nextPrio.tier === 3 ? 1 : rem;
          setPlus2Remaining(cappedRem);
          setBannerMsg(t('bannerStolenMore', { count: cappedRem }));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              plus2Remaining: cappedRem,
              bannerKey: 'bannerStolenMore',
              bannerParams: { count: cappedRem },
              moveHistory: nextHistory,
            });
          }
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
        const nextExiled = [...exiledPieces, victim];
        setExiledPieces(nextExiled);

        const targetSq = coordToSq(coord);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+4✕${targetSq}`,
            comment: pieceLabel(victim.type),
            isChessMove: false,
            cardColor: '',
            cardValue: 'wild-draw',
            boardAfter: serializeBoardCompact(nextBoard),
            toSq: targetSq,
          },
        ];
        setMoveHistory(nextHistory);

        const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
        const rem = plus4Remaining - 1;
        if (rem <= 0 || nextPrio.tier === 4) {
          setPlus4Remaining(0);
          endTurn(
            nextBoard,
            currentCard,
            undefined,
            undefined,
            undefined,
            undefined,
            nextExiled,
            undefined,
            nextHistory
          );
        } else {
          setPlus4Remaining(rem);
          setBannerMsg(t('bannerEliminatedMore', { count: rem }));
          if (mode === 'online') {
            pushOnline({
              boardFlat: flattenBoard(nextBoard),
              exiledPieces: nextExiled,
              plus4Remaining: rem,
              bannerKey: 'bannerEliminatedMore',
              bannerParams: { count: rem },
              moveHistory: nextHistory,
            });
          }
        }
      }
    }
  };

  const handleSelectWildColor = useCallback(
    (color: CardColor) => {
      if (mode === 'online' && !isHumanTurn) return;
      sound.playSpecial();
      const updatedCard = currentCard ? { ...currentCard, color } : null;
      if (updatedCard) {
        setCurrentCard(updatedCard);
      }

      // Each of the 4 colors grants its corresponding promotion piece!
      const rewardPiece: PieceType = WILD_COLOR_PIECE_MAP[color];
      const placementSquares = getWildPlacementSquares(board, activeFaction);

      if (placementSquares.length > 0) {
        setPendingWildPieceType(rewardPiece);
        setPhase('WILD_PLACE_PIECE_PHASE');
        setBannerMsg(t('bannerWildPlacePiece', { piece: pieceLabel(rewardPiece) }));
        if (mode === 'online') {
          pushOnline({
            currentCard: updatedCard,
            pendingWildPieceType: rewardPiece,
            phase: 'WILD_PLACE_PIECE_PHASE',
            bannerKey: 'bannerWildPlacePiece',
            bannerParams: { piece: pieceLabel(rewardPiece) },
          });
        }
      } else {
        setWildTeleportPending(true);
        setMovesRemaining(1);
        setPhase('MOVE_PHASE');
        setBannerMsg(t('bannerWildStep1'));
        if (mode === 'online') {
          pushOnline({
            currentCard: updatedCard,
            wildTeleportPending: true,
            movesRemaining: 1,
            phase: 'MOVE_PHASE',
            bannerKey: 'bannerWildStep1',
            bannerParams: {},
          });
        }
      }
    },
    [activeFaction, board, currentCard, isHumanTurn, mode, pieceLabel, pushOnline, t]
  );

  const handleSelectPlus4Mode = useCallback(
    (selectedMode: 'attack' | 'action') => {
      if (mode === 'online' && !isHumanTurn) return;
      sound.playSpecial();
      if (selectedMode === 'attack') {
        const nonKingCount = board
          .flat()
          .filter((p) => p && p.faction === enemyFaction && p.type !== 'king').length;
        const quota = Math.min(4, nonKingCount);
        if (quota <= 0) {
          const nextSkip = skipOpponentTurns + 1;
          setSkipOpponentTurns(nextSkip);
          setMovesRemaining(4);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerPlus4Action'));
          if (mode === 'online') {
            pushOnline({
              skipOpponentTurns: nextSkip,
              movesRemaining: 4,
              phase: 'MOVE_PHASE',
              bannerKey: 'bannerPlus4Action',
              bannerParams: {},
            });
          }
          return;
        }
        setPlus4Remaining(quota);
        setPhase('PLUS4_ELIMINATE_PHASE');
        setBannerMsg(t('bannerPlus4Attack', { count: quota }));
        if (mode === 'online') {
          pushOnline({
            plus4Remaining: quota,
            phase: 'PLUS4_ELIMINATE_PHASE',
            bannerKey: 'bannerPlus4Attack',
            bannerParams: { count: quota },
          });
        }
      } else {
        const nextSkip = skipOpponentTurns + 1;
        setSkipOpponentTurns(nextSkip);
        setMovesRemaining(4);
        setPhase('MOVE_PHASE');
        setBannerMsg(t('bannerPlus4Action'));
        if (mode === 'online') {
          pushOnline({
            skipOpponentTurns: nextSkip,
            movesRemaining: 4,
            phase: 'MOVE_PHASE',
            bannerKey: 'bannerPlus4Action',
            bannerParams: {},
          });
        }
      }
    },
    [board, enemyFaction, isHumanTurn, mode, pushOnline, skipOpponentTurns, t]
  );

  const handleOnlineResign = useCallback(() => {
    if (mode !== 'online' || !onlineMatch || !myProfile) return;
    sound.playClick();
    setIsPaused(false);
    saveActiveOnlineMatchId(myProfile.uid, null);
    const winnerPid: PlayerId = myOnlineRole === 'p1' ? 'p2' : 'p1';
    finishWithWin(winnerPid, 'bannerResignWin', board);
  }, [board, finishWithWin, mode, myOnlineRole, myProfile, onlineMatch]);

  // ---------- BOT AI TURN LOOP (Clock-immune ref-backed scheduler) ----------
  const botTimerRef = useRef<number | null>(null);
  const runBotStepRef = useRef<() => void>(() => {});

  runBotStepRef.current = () => {
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

    if (phase === 'DRAW_PHASE') {
      sound.unlock();
      let workingDeck = [...drawPile];
      let workingDiscard = [...discardPile];
      if (workingDeck.length === 0) {
        if (workingDiscard.length === 0) {
          workingDeck = createDeck();
        } else {
          workingDeck = shuffleCards(workingDiscard);
          workingDiscard = [];
          setDiscardPile([]);
        }
        sound.playShuffle();
      }
      const [drawn, ...rest] = workingDeck;
      const sessionAtBotDraw = gameSessionRef.current;
      setDrawPile(rest);
      setCurrentCard(drawn);
      setCardFaceDown(true);
      setPhase('CARD_REVEALING');
      setBannerMsg(t('bannerDrawing', { name: playerLabel('p2') }));
      sound.playDraw();
      window.setTimeout(() => {
        if (gameSessionRef.current !== sessionAtBotDraw) return;
        setCardFaceDown(false);
      }, 90);
      window.setTimeout(() => {
        if (gameSessionRef.current !== sessionAtBotDraw) return;
        resolveDrawnCard(drawn, rest, workingDiscard);
      }, 620);
    } else if (phase === 'WILD_COLOR_CHOICE') {
      handleSelectWildColor(chooseBotWildColor());
    } else if (phase === 'WILD_PLACE_PIECE_PHASE') {
      const squares = getWildPlacementSquares(board, activeFaction);
      if (pendingWildPieceType && squares.length > 0) {
        const dest = squares[Math.floor(Math.random() * squares.length)];
        const nextBoard = cloneBoard(board);
        nextBoard[dest.row][dest.col] = {
          id: `wild-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: pendingWildPieceType,
          faction: activeFaction,
          pieceNumber: 1,
          hasMoved: true,
        };
        sound.playSpecial();
        setBoard(nextBoard);
        setPendingWildPieceType(null);
        setWildTeleportPending(true);

        const pLetter =
          pendingWildPieceType === 'queen'
            ? 'Q'
            : pendingWildPieceType === 'rook'
            ? 'R'
            : pendingWildPieceType === 'bishop'
            ? 'B'
            : pendingWildPieceType === 'knight'
            ? 'N'
            : 'P';
        const destSq = coordToSq(dest);
        setMoveHistory((prev) => [
          ...prev,
          {
            ply: prev.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+${pLetter}@${destSq}`,
            comment: pieceLabel(pendingWildPieceType),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: 'wild',
            boardAfter: serializeBoardCompact(nextBoard),
            toSq: destSq,
          },
        ]);

        const step1Moves = getUnoChessLegalMoves(nextBoard, activeFaction, enPassantTarget, 1);
        if (step1Moves.length > 0) {
          setMovesRemaining(1);
          setPhase('MOVE_PHASE');
          setBannerMsg(t('bannerWildStep1'));
        } else {
          setMovesRemaining(0);
          setPhase('WILD_TELEPORT_PHASE');
          setBannerMsg(t('bannerWildStep2'));
        }
      } else {
        setPendingWildPieceType(null);
        setWildTeleportPending(true);
        setMovesRemaining(1);
        setPhase('MOVE_PHASE');
      }
    } else if (phase === 'WILD_PLUS4_CHOICE') {
      handleSelectPlus4Mode(chooseBotPlus4Mode(board, enemyFaction));
    } else if (phase === 'PROMOTION_CHOICE') {
      handleSelectPromotion('queen');
    } else if (phase === 'MOVE_PHASE') {
      const syncColor: CardColor | null =
        isFirstMoveOfTurn &&
        currentCard &&
        currentCard.value !== 'wild' &&
        currentCard.value !== 'wild-draw'
          ? currentCard.color
          : null;
      const botMove = chooseBotMove(
        board,
        activeFaction,
        enPassantTarget,
        movesRemaining,
        botLevel,
        syncColor
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
        const promoRow = activeFaction === 'white' ? 0 : 7;
        const autoType = p && p.type === 'pawn' && tp.to.row === promoRow ? 'queen' : p?.type;
        nextBoard[tp.to.row][tp.to.col] = p
          ? { ...p, type: autoType ?? p.type, hasMoved: true }
          : null;
        sound.playSpecial();
        setBoard(nextBoard);
        setWildTeleportPending(false);
        const fromSq = coordToSq(tp.from);
        const toSq = coordToSq(tp.to);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `⚡${fromSq}→${toSq}`,
            comment: t('teleportActive'),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: currentCard?.value ?? 'wild',
            boardAfter: serializeBoardCompact(nextBoard),
            fromSq,
            toSq,
          },
        ];
        setMoveHistory(nextHistory);
        endTurn(
          nextBoard,
          currentCard,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          nextHistory
        );
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
        let nextCapW = capturedWhitePieces;
        let nextCapB = capturedBlackPieces;
        if (activeFaction === 'white') {
          nextCapW = capturedWhitePieces.filter((p) => p.id !== recovered.id);
          setCapturedWhitePieces(nextCapW);
        } else {
          nextCapB = capturedBlackPieces.filter((p) => p.id !== recovered.id);
          setCapturedBlackPieces(nextCapB);
        }
        const destSq = coordToSq(dest);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+2↑${destSq}`,
            comment: pieceLabel(recovered.type),
            isChessMove: false,
            cardColor: currentCard?.color ?? '',
            cardValue: 'draw2',
            boardAfter: serializeBoardCompact(nextBoard),
            toSq: destSq,
          },
        ];
        setMoveHistory(nextHistory);
        const rem = plus2Remaining - 1;
        if (rem <= 0 || empties.length <= 1 || ownCapturedPieces.length <= 1) {
          setPlus2Remaining(0);
          endTurn(
            nextBoard,
            currentCard,
            undefined,
            undefined,
            nextCapW,
            nextCapB,
            undefined,
            undefined,
            nextHistory
          );
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
          const fromSq = coordToSq(targetCoord);
          const toSq = coordToSq(dest);
          const nextHistory: MoveHistoryEntry[] = [
            ...moveHistory,
            {
              ply: moveHistory.length + 1,
              turnNumber: turnsPlayed,
              faction: activeFaction,
              san: `+2⇄${fromSq}→${toSq}`,
              comment: pieceLabel(stolen.type),
              isChessMove: false,
              cardColor: currentCard?.color ?? '',
              cardValue: 'draw2',
              boardAfter: serializeBoardCompact(nextBoard),
              fromSq,
              toSq,
            },
          ];
          setMoveHistory(nextHistory);
          const wasTier3 = stolen.type === 'rook' || stolen.type === 'queen';
          const rem = wasTier3 ? 0 : plus2Remaining - 1;
          const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
          if (rem <= 0 || nextPrio.tier === 4 || empties.length <= 1) {
            setPlus2Remaining(0);
            endTurn(
              nextBoard,
              currentCard,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              nextHistory
            );
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
        const nextExiled = victim ? [...exiledPieces, victim] : exiledPieces;
        if (victim) setExiledPieces(nextExiled);
        const targetSq = coordToSq(targetCoord);
        const nextHistory: MoveHistoryEntry[] = [
          ...moveHistory,
          {
            ply: moveHistory.length + 1,
            turnNumber: turnsPlayed,
            faction: activeFaction,
            san: `+4✕${targetSq}`,
            comment: victim ? pieceLabel(victim.type) : '',
            isChessMove: false,
            cardColor: '',
            cardValue: 'wild-draw',
            boardAfter: serializeBoardCompact(nextBoard),
            toSq: targetSq,
          },
        ];
        setMoveHistory(nextHistory);
        const rem = plus4Remaining - 1;
        const nextPrio = getHighestPriorityEnemyCoords(nextBoard, enemyFaction);
        if (rem <= 0 || nextPrio.tier === 4) {
          setPlus4Remaining(0);
          endTurn(
            nextBoard,
            currentCard,
            undefined,
            undefined,
            undefined,
            undefined,
            nextExiled,
            undefined,
            nextHistory
          );
        } else {
          setPlus4Remaining(rem);
        }
      } else {
        setPlus4Remaining(0);
        endTurn(board, currentCard);
      }
    }
  };

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
      runBotStepRef.current();
    }, 650);

    return () => {
      if (botTimerRef.current !== null) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [
    activePlayer,
    isPaused,
    mode,
    movesRemaining,
    pendingWildPieceType,
    phase,
    plus2Remaining,
    plus4Remaining,
  ]);

  const enemyHasAttackTargets = useMemo(() => {
    const prio = getHighestPriorityEnemyCoords(board, enemyFaction);
    return prio.tier <= 3;
  }, [board, enemyFaction]);

  const lastBoardMove = useMemo(() => {
    const last = moveHistory[moveHistory.length - 1];
    if (!last) return null;
    const from = sqToCoord(last.fromSq);
    const to = sqToCoord(last.toSq);
    if (!from && !to) return null;
    return { from, to };
  }, [moveHistory]);

  const isMyActiveTurn =
    (mode === 'bot' && activePlayer === 'p1') ||
    (mode === 'online' && activePlayer === myOnlineRole);

  const topFaction: Faction = boardFlipped ? 'white' : 'black';
  const bottomFaction: Faction = boardFlipped ? 'black' : 'white';
  const topPlayerId: PlayerId = p1Faction === topFaction ? 'p1' : 'p2';
  const bottomPlayerId: PlayerId = p1Faction === bottomFaction ? 'p1' : 'p2';
  const topTimeMs = topPlayerId === 'p1' ? p1TimeMs : p2TimeMs;
  const bottomTimeMs = bottomPlayerId === 'p1' ? p1TimeMs : p2TimeMs;
  const topElo = playerEloForId(topPlayerId);
  const bottomElo = playerEloForId(bottomPlayerId);

  const topCaptured = topFaction === 'white' ? capturedBlackPieces : capturedWhitePieces;
  const bottomCaptured = bottomFaction === 'white' ? capturedBlackPieces : capturedWhitePieces;

  // In 2-player physical tabletop mode: when it is the top side's turn,
  // move the deck console to the TOP and orient pieces 180°.
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
        disabled={phase !== 'DRAW_PHASE' || !isHumanTurn || (isPaused && mode !== 'online')}
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
                {phase === 'WILD_PLACE_PIECE_PHASE' && pendingWildPieceType && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-950 bg-emerald-400 px-2 py-0.5 text-slate-950">
                    + {pieceLabel(pendingWildPieceType)}
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
        {showOnlineLobby ? (
          <OnlineLobbyView
            profile={myProfile}
            profileLoading={profileLoading}
            pendingJoinMatchId={pendingJoinMatchId}
            historyCount={savedMatchHistory.length}
            systemConfig={systemModerationConfig}
            onClearPendingJoin={handleClearPendingJoin}
            onProfileSaved={handleProfileSaved}
            onSwitchAccount={handleSwitchAccount}
            onEnterMatch={handleEnterOnlineMatch}
            onOpenHistory={() => {
              void refreshMatchHistory();
              setIsProfileHistoryOpen(true);
            }}
            onOpenReport={() => openReportModal({ category: 'behavior' })}
            onOpenAppeals={() => {
              sound.playClick();
              setIsAppealsOpen(true);
            }}
            onOpenModeration={() => {
              sound.playClick();
              setIsModConsoleOpen(true);
            }}
            onBack={handleLobbyBack}
          />
        ) : phase === 'TITLE_MENU' ? (
          <StartScreen
            mode={mode}
            botLevel={botLevel}
            playerColor={playerColor}
            localPlayStyle={localPlayStyle}
            timeControl={timeControl}
            profile={myProfile}
            historyCount={savedMatchHistory.length}
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
            onOpenOnlineLobby={() => {
              sound.playClick();
              setMode('online');
              setShowOnlineLobby(true);
            }}
            onOpenHistory={() => {
              sound.playClick();
              void refreshMatchHistory();
              setIsProfileHistoryOpen(true);
            }}
            onOpenGuide={() => {
              sound.playClick();
              setIsGuideOpen(true);
            }}
            onOpenReport={() => openReportModal({ category: 'bug' })}
            onOpenAppeals={() => {
              sound.playClick();
              setIsAppealsOpen(true);
            }}
            onOpenModeration={() => {
              sound.playClick();
              setIsModConsoleOpen(true);
            }}
          />
        ) : (
          <div className="flex min-h-[100dvh] flex-col justify-between px-2.5 pb-2.5 pt-2 sm:px-3">
            {/* 1. Top Game Header & Chat / Report / Pause Buttons */}
            <header className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <img
                  src="/assets/logo.png"
                  alt="UnoChess"
                  referrerPolicy="no-referrer"
                  className="h-9 w-auto drop-shadow-md sm:h-10"
                />
                <div className="flex items-center gap-1 rounded-xl border-2 border-slate-950 bg-slate-900/85 px-2 py-1 text-xs font-bold text-amber-200 shadow tabular-nums">
                  <Timer className="h-3.5 w-3.5 text-amber-400" />
                  <span>
                    {timeControl.minutes > 0
                      ? `${timeControl.label} · ${formatTime(elapsedSeconds)}`
                      : formatTime(elapsedSeconds)}
                  </span>
                </div>
              </div>

              <div
                className={`flex items-center gap-1.5 rounded-xl border-2 px-2.5 py-1 text-xs font-extrabold shadow transition-colors ${
                  isMyActiveTurn
                    ? 'border-emerald-300 bg-emerald-400 text-slate-950'
                    : activeFaction === 'white'
                    ? 'border-slate-950 bg-amber-100 text-slate-950'
                    : 'border-amber-400/70 bg-slate-800 text-amber-200'
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full animate-pulse ${
                    isMyActiveTurn
                      ? 'bg-slate-950'
                      : activeFaction === 'white'
                      ? 'bg-emerald-600'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="max-w-[125px] truncate sm:max-w-[160px]">
                  {isMyActiveTurn
                    ? t('yourTurnBadge')
                    : t('turnOfLabel', { name: playerLabel(activePlayer) })}{' '}
                  · {activeFaction === 'white' ? t('whitePieces') : t('blackPieces')}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {mode === 'online' && onlineMatch && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setIsChatOpen(true);
                    }}
                    aria-label={t('chatBtn')}
                    title={t('chatBtn')}
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-950 bg-sky-400 text-slate-950 shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
                  >
                    <MessageSquare className="h-4 w-4" />
                    {unreadChatCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-slate-950 bg-rose-500 px-1 text-[9px] font-extrabold text-white tabular-nums">
                        {unreadChatCount}
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const oppPid: PlayerId = myOnlineRole === 'p1' ? 'p2' : 'p1';
                    openReportModal(
                      mode === 'online' && onlineMatch
                        ? {
                            category: 'behavior',
                            targetUid: playerUidForId(oppPid),
                            targetNickname: playerLabel(oppPid),
                            matchId: onlineMatch.id,
                          }
                        : { category: 'bug' }
                    );
                  }}
                  aria-label={t('reportBtn')}
                  title={t('reportBtn')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-950 bg-slate-800 text-rose-300 shadow-[0_3px_0_#0f172a] transition hover:border-rose-400 active:translate-y-0.5 active:shadow-none"
                >
                  <Flag className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setIsPaused(true);
                  }}
                  aria-label={t('pauseTitle')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-3 border-slate-950 bg-amber-400 text-slate-950 shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
                >
                  <Pause className="h-4 w-4 fill-current" />
                </button>
              </div>
            </header>

            {onlineSyncWarning && (
              <div className="mt-1.5 flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-950/90 px-3 py-1.5 text-xs font-extrabold text-amber-200 shadow">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                <span>{onlineSyncWarning}</span>
              </div>
            )}

            {mode === 'online' && onlineMatch?.status === 'waiting' && (
              <div className="mt-1.5 space-y-2 rounded-2xl border-2 border-emerald-400 bg-emerald-950/90 p-3 shadow-lg">
                <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-emerald-200">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                  <span>{t('onlineMagicWaiting')}</span>
                </div>
                <div className="break-all rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-[10px] text-amber-200">
                  {`${window.location.origin}${window.location.pathname}?join=${onlineMatch.id}`}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}${window.location.pathname}?join=${onlineMatch.id}`;
                      void navigator.clipboard?.writeText(url);
                      setWaitingCopied(true);
                      window.setTimeout(() => setWaitingCopied(false), 2000);
                    }}
                    className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-3 text-xs font-extrabold text-slate-950"
                  >
                    {waitingCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{waitingCopied ? t('onlineMagicCopied') : t('onlineMagicCopy')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const uid = myProfileRef.current?.uid ?? '';
                      if (uid) {
                        saveActiveOnlineMatchId(uid, null);
                        saveWaitingMagicMatchId(uid, null);
                      }
                      if (onlineMatch.hostUid === uid) {
                        void cancelWaitingMatch(onlineMatch.id);
                      }
                      setOnlineMatchId(null);
                      setOnlineMatch(null);
                      setShowOnlineLobby(true);
                    }}
                    className="flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-rose-500/70 bg-rose-950/70 px-3 text-xs font-bold text-rose-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>{t('onlineCancelChallenge')}</span>
                  </button>
                </div>
              </div>
            )}

            {joinToastMsg && (
              <div className="mt-1.5 flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-400 bg-emerald-950/90 px-3 py-1.5 text-xs font-extrabold text-emerald-200 shadow">
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-300" />
                <span>{joinToastMsg}</span>
              </div>
            )}

            {duelToastMsg && (
              <div className="mt-1.5 flex items-center justify-center gap-2 rounded-xl border-2 border-rose-400 bg-rose-950/90 px-3 py-1.5 text-xs font-extrabold text-rose-100 shadow">
                <Sparkles className="h-4 w-4 shrink-0 text-rose-300" />
                <span>{duelToastMsg}</span>
              </div>
            )}

            {/* TOP DECK ZONE (2-player tabletop mode) */}
            {isTabletopTopTurn && (
              <div className="mt-1.5">
                {renderDeckConsole(true)}
                {renderRecoveryTray(true)}
              </div>
            )}

            {/* 2. Top Player / Opponent Strip */}
            <div
              className={`mt-1.5 flex items-center justify-between rounded-2xl border-2 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm transition-all ${
                activePlayer === topPlayerId
                  ? 'border-amber-400 bg-slate-900/95 ring-2 ring-amber-400/45 shadow-[0_0_14px_rgba(251,191,36,0.28)]'
                  : 'border-slate-900 bg-slate-900/75 opacity-80'
              } ${isTabletopTopTurn ? 'rotate-180' : ''}`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`h-3 w-3 shrink-0 rounded-full border ${
                    topFaction === 'white'
                      ? 'border-slate-950 bg-amber-50'
                      : 'border-slate-300 bg-slate-900'
                  }`}
                />
                <span className="truncate font-extrabold text-white">
                  {playerLabel(topPlayerId)}
                </span>
                {activePlayer === topPlayerId && (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                      (mode === 'online' && topPlayerId === myOnlineRole) ||
                      (mode === 'bot' && topPlayerId === 'p1')
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-amber-300 text-slate-950'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-950 animate-pulse" />
                    {(mode === 'online' && topPlayerId === myOnlineRole) ||
                    (mode === 'bot' && topPlayerId === 'p1')
                      ? t('yourTurnBadge')
                      : t('activeTurnBadge')}
                  </span>
                )}
                {topElo !== null && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300 tabular-nums">
                    <Trophy className="h-2.5 w-2.5" />
                    {topElo}
                  </span>
                )}
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

              <div className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-slate-300 tabular-nums">
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
              lastMove={lastBoardMove}
              disabled={
                !isHumanTurn ||
                (isPaused && mode !== 'online') ||
                phase === 'REVERSING' ||
                phase === 'CARD_REVEALING'
              }
              onSquareClick={handleSquareClick}
            />

            {/* 5. Bottom Player Strip */}
            <div
              className={`mt-1.5 rounded-2xl border-2 px-3 py-1.5 shadow-md backdrop-blur-sm transition-all ${
                activePlayer === bottomPlayerId
                  ? 'border-amber-400 bg-slate-900/95 ring-2 ring-amber-400/45 shadow-[0_0_14px_rgba(251,191,36,0.28)]'
                  : 'border-slate-900 bg-slate-900/75 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full border ${
                      bottomFaction === 'white'
                        ? 'border-slate-950 bg-amber-50'
                        : 'border-slate-300 bg-slate-900'
                    }`}
                  />
                  <span className="truncate font-extrabold text-white">
                    {playerLabel(bottomPlayerId)}
                  </span>
                  {activePlayer === bottomPlayerId && (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                        (mode === 'online' && bottomPlayerId === myOnlineRole) ||
                        (mode === 'bot' && bottomPlayerId === 'p1')
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-amber-300 text-slate-950'
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-950 animate-pulse" />
                      {(mode === 'online' && bottomPlayerId === myOnlineRole) ||
                      (mode === 'bot' && bottomPlayerId === 'p1')
                        ? t('yourTurnBadge')
                        : t('activeTurnBadge')}
                    </span>
                  )}
                  {bottomElo !== null && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300 tabular-nums">
                      <Trophy className="h-2.5 w-2.5" />
                      {bottomElo}
                    </span>
                  )}
                  {checkedFaction === bottomFaction && (
                    <span className="flex items-center gap-1 font-extrabold text-rose-400">
                      <ShieldAlert className="h-3.5 w-3.5" /> {t('checkBadge')}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
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

            {/* BOTTOM DECK ZONE */}
            {!isTabletopTopTurn && (
              <div className="mt-1.5">
                {renderRecoveryTray(false)}
                {renderDeckConsole(false)}
              </div>
            )}

            {/* 6. Bottom Move History & PGN Bar */}
            <MoveHistoryBar entries={moveHistory} onDownloadPgn={handleDownloadPgn} />
          </div>
        )}
      </div>

      {/* Modals */}
      <PauseModal
        isOpen={isPaused}
        isOnline={mode === 'online'}
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
        onResign={handleOnlineResign}
        onExitToMenu={() => {
          sound.playClick();
          sound.stopMusic();
          syncAudioState();
          setIsPaused(false);
          if (mode === 'online') {
            if (myProfileRef.current?.uid) {
              saveActiveOnlineMatchId(myProfileRef.current.uid, null);
            }
            setOnlineMatchId(null);
            setOnlineMatch(null);
            setShowOnlineLobby(true);
          } else {
            setPhase('TITLE_MENU');
          }
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
        faction={activeFaction}
        onSelectColor={handleSelectWildColor}
      />

      <WildPlus4Modal
        isOpen={phase === 'WILD_PLUS4_CHOICE' && isHumanTurn}
        enemyHasTargets={enemyHasAttackTargets}
        onSelectMode={handleSelectPlus4Mode}
      />

      <PromotionModal
        isOpen={phase === 'PROMOTION_CHOICE' && pendingPromotion !== null && isHumanTurn}
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
        isOnline={mode === 'online'}
        eloDelta={onlineEloResult?.delta ?? null}
        didWinOnline={onlineEloResult?.didWin ?? false}
        onWatchGame={handleWatchCurrentGame}
        onDownloadPgn={handleDownloadPgn}
        onPlayAgain={startNewGame}
        onMainMenu={() => {
          sound.playClick();
          sound.stopMusic();
          syncAudioState();
          if (mode === 'online') {
            if (myProfileRef.current?.uid) {
              saveActiveOnlineMatchId(myProfileRef.current.uid, null);
            }
            setOnlineMatchId(null);
            setOnlineMatch(null);
            setPhase('TITLE_MENU');
            setShowOnlineLobby(true);
          } else {
            setPhase('TITLE_MENU');
          }
        }}
      />

      <ProfileHistoryModal
        isOpen={isProfileHistoryOpen}
        profile={myProfile}
        matches={savedMatchHistory}
        loading={historyLoading}
        onSelectMatch={(rec) => {
          setIsProfileHistoryOpen(false);
          setReplayRecord(rec);
        }}
        onClose={() => {
          setIsProfileHistoryOpen(false);
        }}
      />

      <GameReplayModal
        isOpen={replayRecord !== null}
        record={replayRecord}
        onUpdateTree={handleUpdateReplayTree}
        onClose={() => {
          setReplayRecord(null);
        }}
      />

      <MatchChatModal
        isOpen={isChatOpen}
        matchId={onlineMatchId}
        profile={myProfile}
        opponentName={playerLabel(myOnlineRole === 'p1' ? 'p2' : 'p1')}
        messages={chatMessages}
        systemConfig={systemModerationConfig}
        onClose={() => setIsChatOpen(false)}
        onReportMessage={(msg) => {
          setIsChatOpen(false);
          openReportModal({
            category: 'chat',
            targetUid: msg.senderUid,
            targetNickname: msg.senderNickname,
            matchId: msg.matchId,
            messageId: msg.id,
            messageExcerpt: msg.text,
          });
        }}
        onOpenAppeals={() => setIsAppealsOpen(true)}
      />

      <ReportModal
        isOpen={isReportOpen}
        profile={myProfile}
        prefill={reportContext}
        onClose={() => setIsReportOpen(false)}
        onOpenLobbyForAccount={() => {
          setMode('online');
          setShowOnlineLobby(true);
        }}
      />

      <AppealsModal
        isOpen={isAppealsOpen}
        profile={myProfile}
        onClose={() => setIsAppealsOpen(false)}
      />

      <ModerationConsoleModal
        isOpen={isModConsoleOpen}
        actor={myProfile}
        systemConfig={systemModerationConfig}
        onClose={() => setIsModConsoleOpen(false)}
      />
    </div>
  );
}

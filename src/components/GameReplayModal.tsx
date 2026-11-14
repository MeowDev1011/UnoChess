import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Film,
  GitBranch,
  MessageSquarePlus,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Coord,
  Faction,
  MoveAnnotation,
  PieceType,
  ReplayNode,
  SavedMatchRecord,
} from '../types/game';
import { getStandardLegalMoves, isInCheck, oppositeFaction } from '../engine/chess';
import { downloadPGNFile } from '../engine/pgn';
import {
  addOrSelectVariationMove,
  buildInitialReplayTree,
  buildPGNFromReplayTree,
  deleteVariationNode,
  deriveReplayBoardWithStableIds,
  findNodeById,
  findNodePath,
  getActiveBranchNodes,
  sqToCoord,
  updateReplayNodeAnnotation,
} from '../engine/replay';
import { exportReplayToMp4, triggerVideoDownload } from '../engine/videoExport';
import { ChessBoard } from './ChessBoard';
import { sound } from '../utils/audio';

interface GameReplayModalProps {
  isOpen: boolean;
  record: SavedMatchRecord | null;
  onUpdateTree?: (recordId: string, nextTree: ReplayNode) => void;
  onClose: () => void;
}

const NAG_OPTIONS: { value: Exclude<MoveAnnotation, ''>; badgeClass: string }[] = [
  { value: '!!', badgeClass: 'bg-teal-400 text-slate-950 border-teal-200' },
  { value: '!', badgeClass: 'bg-sky-400 text-slate-950 border-sky-200' },
  { value: '!?', badgeClass: 'bg-emerald-400 text-slate-950 border-emerald-200' },
  { value: '?!', badgeClass: 'bg-amber-400 text-slate-950 border-amber-200' },
  { value: '?', badgeClass: 'bg-orange-500 text-white border-orange-300' },
  { value: '??', badgeClass: 'bg-rose-500 text-white border-rose-300' },
];

export function nagBadgeStyle(nag?: MoveAnnotation): string {
  switch (nag) {
    case '!!':
      return 'bg-teal-400 text-slate-950';
    case '!':
      return 'bg-sky-400 text-slate-950';
    case '!?':
      return 'bg-emerald-400 text-slate-950';
    case '?!':
      return 'bg-amber-400 text-slate-950';
    case '?':
      return 'bg-orange-500 text-white';
    case '??':
      return 'bg-rose-500 text-white';
    default:
      return '';
  }
}

export const GameReplayModal: React.FC<GameReplayModalProps> = ({
  isOpen,
  record,
  onUpdateTree,
  onClose,
}) => {
  const { t } = useTranslation();

  const [tree, setTree] = useState<ReplayNode | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string>('root');
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<0.5 | 1 | 2>(1);
  const [selectedCoord, setSelectedCoord] = useState<Coord | null>(null);
  const [analysisSideOverride, setAnalysisSideOverride] = useState<Faction | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [copiedPgn, setCopiedPgn] = useState(false);

  const [exportingMp4, setExportingMp4] = useState(false);
  const [mp4Progress, setMp4Progress] = useState(0);
  const [mp4Error, setMp4Error] = useState('');

  // Reset state whenever a new match record is opened
  useEffect(() => {
    if (!isOpen || !record) return;
    const initialTree = record.replayTree ?? buildInitialReplayTree(record.moves);
    setTree(initialTree);
    setCurrentNodeId('root');
    setBoardFlipped(record.playerFaction === 'black');
    setIsPlaying(false);
    setSelectedCoord(null);
    setAnalysisSideOverride(null);
    setMp4Error('');
    setExportingMp4(false);
    setMp4Progress(0);
  }, [isOpen, record]);

  const activeNode = useMemo(() => {
    if (!tree) return null;
    return findNodeById(tree, currentNodeId) ?? tree;
  }, [currentNodeId, tree]);

  const pathToCurrent = useMemo(() => {
    if (!tree) return [];
    return findNodePath(tree, currentNodeId) ?? [tree];
  }, [currentNodeId, tree]);

  const activeBranchNodes = useMemo(() => {
    if (!tree) return [];
    return getActiveBranchNodes(tree, currentNodeId);
  }, [currentNodeId, tree]);

  useEffect(() => {
    setCommentDraft(activeNode?.userComment ?? '');
    setSelectedCoord(null);
    setAnalysisSideOverride(null);
  }, [activeNode?.id, activeNode?.userComment]);

  const currentBoard = useMemo(() => {
    return deriveReplayBoardWithStableIds(pathToCurrent);
  }, [pathToCurrent]);

  const defaultAnalysisTurn: Faction = useMemo(() => {
    if (!activeNode || activeNode.id === 'root') return 'white';
    return oppositeFaction(activeNode.faction);
  }, [activeNode]);

  const analysisTurn: Faction = analysisSideOverride ?? defaultAnalysisTurn;

  const legalMovesForAnalysis = useMemo(() => {
    return getStandardLegalMoves(currentBoard, analysisTurn, null);
  }, [analysisTurn, currentBoard]);

  const legalMovesForSelected = useMemo(() => {
    if (!selectedCoord) return [];
    return legalMovesForAnalysis.filter(
      (m) => m.from.row === selectedCoord.row && m.from.col === selectedCoord.col
    );
  }, [legalMovesForAnalysis, selectedCoord]);

  const checkedFaction: Faction | null = useMemo(() => {
    if (isInCheck(currentBoard, 'white')) return 'white';
    if (isInCheck(currentBoard, 'black')) return 'black';
    return null;
  }, [currentBoard]);

  const lastMove = useMemo(() => {
    const from = sqToCoord(activeNode?.fromSq);
    const to = sqToCoord(activeNode?.toSq);
    if (!from && !to) return null;
    return { from, to };
  }, [activeNode?.fromSq, activeNode?.toSq]);

  const highlightCoords = useMemo(() => {
    return [] as Coord[];
  }, []);

  // Auto-playback timer
  useEffect(() => {
    if (!isOpen || !isPlaying || !activeNode) return;
    if (activeNode.children.length === 0) {
      setIsPlaying(false);
      return;
    }
    const delayMs = Math.round(900 / speedMultiplier);
    const timer = window.setTimeout(() => {
      const nextChild = activeNode.children[0];
      if (nextChild) {
        sound.playMove();
        setCurrentNodeId(nextChild.id);
      } else {
        setIsPlaying(false);
      }
    }, delayMs);
    return () => clearTimeout(timer);
  }, [activeNode, isOpen, isPlaying, speedMultiplier]);

  const commitTree = useCallback(
    (nextTree: ReplayNode) => {
      setTree(nextTree);
      if (record && onUpdateTree) {
        onUpdateTree(record.id, nextTree);
      }
    },
    [onUpdateTree, record]
  );

  const handleGoStart = () => {
    sound.playClick();
    setIsPlaying(false);
    setCurrentNodeId('root');
  };

  const handleStepBack = () => {
    if (pathToCurrent.length <= 1) return;
    sound.playClick();
    setIsPlaying(false);
    setCurrentNodeId(pathToCurrent[pathToCurrent.length - 2].id);
  };

  const handleStepForward = () => {
    if (!activeNode || activeNode.children.length === 0) return;
    sound.playMove();
    setIsPlaying(false);
    setCurrentNodeId(activeNode.children[0].id);
  };

  const handleGoEnd = () => {
    if (activeBranchNodes.length === 0) return;
    sound.playClick();
    setIsPlaying(false);
    setCurrentNodeId(activeBranchNodes[activeBranchNodes.length - 1].id);
  };

  const handleTogglePlay = () => {
    if (!activeNode) return;
    sound.playClick();
    if (!isPlaying && activeNode.children.length === 0) {
      // Restart from beginning if already at the end
      setCurrentNodeId('root');
      setIsPlaying(true);
      return;
    }
    setIsPlaying((p) => !p);
  };

  const handleSquareClick = (coord: Coord) => {
    if (!tree || !activeNode) return;
    setIsPlaying(false);

    if (selectedCoord) {
      const chosen = legalMovesForSelected.find(
        (m) => m.to.row === coord.row && m.to.col === coord.col
      );
      if (chosen) {
        sound.playMove();
        const promoType: PieceType = 'queen';
        const { nextRoot, addedNodeId } = addOrSelectVariationMove(
          tree,
          activeNode.id,
          currentBoard,
          chosen,
          promoType
        );
        commitTree(nextRoot);
        setCurrentNodeId(addedNodeId);
        setSelectedCoord(null);
        return;
      }
    }

    const clickedPiece = currentBoard[coord.row][coord.col];
    if (clickedPiece) {
      if (clickedPiece.faction !== analysisTurn) {
        // Allow user to switch analysis side freely (useful after UnoChess multi-move or Revers turns!)
        const altMoves = getStandardLegalMoves(currentBoard, clickedPiece.faction, null);
        if (altMoves.some((m) => m.from.row === coord.row && m.from.col === coord.col)) {
          sound.playClick();
          setAnalysisSideOverride(clickedPiece.faction);
          setSelectedCoord(coord);
          return;
        }
      }
      const hasMoves = legalMovesForAnalysis.some(
        (m) => m.from.row === coord.row && m.from.col === coord.col
      );
      if (hasMoves) {
        sound.playClick();
        setSelectedCoord(coord);
        return;
      }
    }
    setSelectedCoord(null);
  };

  const handleSetNag = (nag: MoveAnnotation) => {
    if (!tree || !activeNode || activeNode.id === 'root') return;
    sound.playClick();
    const nextNag = activeNode.nag === nag ? '' : nag;
    const nextTree = updateReplayNodeAnnotation(tree, activeNode.id, { nag: nextNag });
    commitTree(nextTree);
  };

  const handleSaveComment = () => {
    if (!tree || !activeNode || activeNode.id === 'root') return;
    sound.playClick();
    const nextTree = updateReplayNodeAnnotation(tree, activeNode.id, {
      userComment: commentDraft.trim().slice(0, 160),
    });
    commitTree(nextTree);
  };

  const handleDeleteVariation = (nodeId: string) => {
    if (!tree) return;
    sound.playClick();
    const nextTree = deleteVariationNode(tree, nodeId);
    commitTree(nextTree);
    if (!findNodeById(nextTree, currentNodeId)) {
      setCurrentNodeId('root');
    }
  };

  const handleExportPgn = () => {
    if (!tree || !record) return;
    sound.playClick();
    const pgn = buildPGNFromReplayTree({
      root: tree,
      whiteName: record.whiteName,
      blackName: record.blackName,
      result: record.result,
      timeControlLabel: record.timeControlLabel,
      date: new Date(record.createdAtMs || Date.now()),
    });
    downloadPGNFile(pgn);
  };

  const handleCopyPgn = async () => {
    if (!tree || !record) return;
    sound.playClick();
    const pgn = buildPGNFromReplayTree({
      root: tree,
      whiteName: record.whiteName,
      blackName: record.blackName,
      result: record.result,
      timeControlLabel: record.timeControlLabel,
      date: new Date(record.createdAtMs || Date.now()),
    });
    try {
      await navigator.clipboard.writeText(pgn);
      setCopiedPgn(true);
      window.setTimeout(() => setCopiedPgn(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadMp4 = async () => {
    if (!tree || !record || exportingMp4) return;
    sound.playClick();
    setMp4Error('');
    setExportingMp4(true);
    setMp4Progress(0);
    setIsPlaying(false);

    try {
      const nodesForVideo = getActiveBranchNodes(tree, currentNodeId);
      const blob = await exportReplayToMp4({
        nodes: nodesForVideo,
        whiteName: record.whiteName,
        blackName: record.blackName,
        result: record.result,
        timeControlLabel: record.timeControlLabel,
        flipped: boardFlipped,
        msPerMove: Math.round(800 / speedMultiplier),
        onProgress: setMp4Progress,
      });
      triggerVideoDownload(blob);
      sound.playSpecial();
    } catch {
      setMp4Error(t('replayMp4Error'));
    } finally {
      setExportingMp4(false);
    }
  };

  if (!isOpen || !record || !tree || !activeNode) return null;

  const isInMainLine = pathToCurrent.every((n, i) =>
    i === 0 ? true : pathToCurrent[i - 1].children[0]?.id === n.id
  );

  // Recursive move-tree renderer showing main line and indented variation branches
  const renderBranch = (startNode: ReplayNode, isVariation: boolean, depth: number): React.ReactNode => {
    const chain: ReplayNode[] = [];
    let cursor: ReplayNode | null = startNode;
    while (cursor) {
      chain.push(cursor);
      cursor = cursor.children[0] ?? null;
    }

    return (
      <div
        className={
          isVariation
            ? 'my-1 ml-2.5 flex flex-wrap items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-950/35 px-2 py-1 text-[11px]'
            : 'flex flex-wrap items-center gap-1 text-xs'
        }
      >
        {isVariation && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-sky-300">
            <GitBranch className="h-3 w-3" />(
          </span>
        )}
        {chain.map((node) => {
          const isCurrent = node.id === currentNodeId;
          const badge = nagBadgeStyle(node.nag);
          const hasNote = Boolean(node.userComment || node.comment);
          return (
            <React.Fragment key={node.id}>
              <span className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setIsPlaying(false);
                    setCurrentNodeId(node.id);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 font-mono text-[11px] font-bold transition ${
                    isCurrent
                      ? 'border-amber-300 bg-amber-400 text-slate-950 shadow'
                      : 'border-slate-700/80 bg-slate-800/80 text-slate-100 hover:border-amber-300/60'
                  }`}
                >
                  <span className="opacity-65">
                    {Math.max(1, node.turnNumber)}
                    {node.faction === 'white' ? '.' : '...'}
                  </span>
                  <span>{node.san}</span>
                  {node.nag && (
                    <span className={`rounded px-1 text-[10px] font-extrabold ${badge}`}>
                      {node.nag}
                    </span>
                  )}
                  {hasNote && <MessageSquarePlus className="h-2.5 w-2.5 text-sky-300" />}
                </button>
                {isVariation && node.id === startNode.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteVariation(startNode.id)}
                    aria-label={t('replayDeleteVariation')}
                    title={t('replayDeleteVariation')}
                    className="rounded p-0.5 text-rose-400 hover:bg-rose-950/70"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </span>

              {/* Render any variation branches splitting from this node */}
              {node.children.length > 1 &&
                depth < 4 &&
                node.children.slice(1).map((varRoot) => (
                  <div key={varRoot.id} className="w-full">
                    {renderBranch(varRoot, true, depth + 1)}
                  </div>
                ))}
            </React.Fragment>
          );
        })}
        {isVariation && <span className="font-extrabold text-sky-300">)</span>}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('replayTitle')}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-950/95 px-3 py-3 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[490px] flex-1 flex-col gap-2.5">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-outline-sm truncate text-lg font-bold text-amber-300">
              {t('replayTitle')}
            </h2>
            <p className="truncate text-[11px] font-bold text-slate-300">
              {record.whiteName} vs {record.blackName} · {record.result} ({record.timeControlLabel})
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setIsPlaying(false);
              onClose();
            }}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-950 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Interactive Board for Replay + Variations */}
        <ChessBoard
          board={currentBoard}
          boardFlipped={boardFlipped}
          isSpinning={false}
          selectedCoord={selectedCoord}
          legalMovesForSelected={legalMovesForSelected}
          highlightCoords={highlightCoords}
          highlightMode={highlightCoords.length > 0 ? 'select-own' : 'none'}
          checkedFaction={checkedFaction}
          lastMove={lastMove}
          onSquareClick={handleSquareClick}
        />

        {/* Analysis Status & Hint */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setAnalysisSideOverride((s) =>
                oppositeFaction(s ?? defaultAnalysisTurn)
              );
              setSelectedCoord(null);
            }}
            className="inline-flex items-center gap-1.5 font-extrabold text-amber-200 hover:text-amber-300"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full border ${
                analysisTurn === 'white'
                  ? 'border-slate-950 bg-amber-50'
                  : 'border-slate-300 bg-slate-900'
              }`}
            />
            <span>
              {t('replayAnalysisTurn', {
                side: analysisTurn === 'white' ? t('whitePieces') : t('blackPieces'),
              })}
            </span>
          </button>

          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
              isInMainLine
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-sky-500/20 text-sky-300'
            }`}
          >
            {isInMainLine ? t('replayMainLine') : t('replayVariationBadge')}
          </span>
        </div>

        {/* Playback Controls */}
        <div className="grid grid-cols-7 gap-1.5 rounded-2xl border-2 border-slate-950 bg-slate-900/95 p-1.5 shadow">
          <button
            type="button"
            onClick={handleGoStart}
            aria-label={t('replayStart')}
            className="flex min-h-[38px] items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleStepBack}
            disabled={pathToCurrent.length <= 1}
            className="flex min-h-[38px] items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isPlaying ? t('replayPause') : t('replayPlay')}
            className="col-span-2 flex min-h-[38px] items-center justify-center gap-1 rounded-xl border-2 border-slate-950 bg-amber-400 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_#0f172a] hover:brightness-105"
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            <span>{isPlaying ? t('replayPause') : t('replayPlay')}</span>
          </button>
          <button
            type="button"
            onClick={handleStepForward}
            disabled={activeNode.children.length === 0}
            className="flex min-h-[38px] items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleGoEnd}
            className="flex min-h-[38px] items-center justify-center rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setBoardFlipped((f) => !f);
            }}
            aria-label={t('replayFlip')}
            title={t('replayFlip')}
            className="flex min-h-[38px] items-center justify-center rounded-xl bg-slate-800 text-sky-300 hover:bg-slate-700"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>

        {/* Speed & NAG Sign Selector + Comment Editor */}
        <div className="space-y-2 rounded-2xl border-2 border-slate-950 bg-slate-900/95 p-2.5 shadow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold text-amber-300">
              {t('replaySignsLabel')}
            </span>
            <div className="flex items-center gap-1">
              {([0.5, 1, 2] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeedMultiplier(spd)}
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-extrabold tabular-nums ${
                    speedMultiplier === spd
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {NAG_OPTIONS.map((opt) => {
              const selected = activeNode.nag === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={activeNode.id === 'root'}
                  onClick={() => handleSetNag(opt.value)}
                  className={`min-h-[32px] rounded-xl border text-xs font-extrabold transition disabled:opacity-35 ${
                    selected
                      ? `${opt.badgeClass} ring-2 ring-white`
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-amber-300'
                  }`}
                >
                  {opt.value}
                </button>
              );
            })}
            <button
              type="button"
              disabled={activeNode.id === 'root' || !activeNode.nag}
              onClick={() => handleSetNag('')}
              className="min-h-[32px] rounded-xl border border-slate-700 bg-slate-800 text-xs font-extrabold text-slate-400 hover:text-white disabled:opacity-35"
            >
              ✕
            </button>
          </div>

          {/* Comment Box for Active Move */}
          <div className="flex gap-1.5">
            <input
              type="text"
              maxLength={160}
              disabled={activeNode.id === 'root'}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onBlur={handleSaveComment}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveComment();
              }}
              placeholder={
                activeNode.id === 'root'
                  ? t('replayVariationHint')
                  : t('replayCommentPlaceholder')
              }
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={activeNode.id === 'root'}
              onClick={handleSaveComment}
              className="rounded-xl border border-slate-950 bg-emerald-400 px-3 text-xs font-extrabold text-slate-950 disabled:opacity-40"
            >
              {t('replaySaveComment')}
            </button>
          </div>
        </div>

        {/* Move List & Branching Variations */}
        <div className="rounded-2xl border-2 border-slate-950 bg-slate-900/95 p-2.5 shadow">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className="flex items-center gap-1 text-amber-300">
              <Trophy className="h-3.5 w-3.5" />
              {t('moveHistoryTitle')}
            </span>
            <button
              type="button"
              onClick={handleGoStart}
              className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                currentNodeId === 'root'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {t('replayStart')}
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto pr-1">
            {tree.children.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-400">{t('replayMovesEmpty')}</p>
            ) : (
              <>
                {renderBranch(tree.children[0], false, 0)}
                {tree.children.length > 1 &&
                  tree.children.slice(1).map((rootVar) => (
                    <div key={rootVar.id} className="mt-1">
                      {renderBranch(rootVar, true, 1)}
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>

        {/* Export PGN + Download MP4 Video */}
        {mp4Error && (
          <div className="rounded-xl border border-rose-500 bg-rose-950/90 px-3 py-1.5 text-center text-xs font-bold text-rose-200">
            {mp4Error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pb-2">
          <button
            type="button"
            onClick={handleExportPgn}
            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-sky-400 to-blue-600 px-3 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#0f172a] active:translate-y-0.5 active:shadow-none"
          >
            <Download className="h-4 w-4" />
            <span>{t('replayExportPgn')}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyPgn}
            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-2xl border-3 border-slate-950 bg-slate-800 px-3 py-2 text-xs font-extrabold text-amber-200 shadow-[0_3px_0_#0f172a] hover:bg-slate-700 active:translate-y-0.5 active:shadow-none"
          >
            {copiedPgn ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            <span>{copiedPgn ? t('replayCopiedPgn') : t('replayCopyPgn')}</span>
          </button>

          <button
            type="button"
            disabled={exportingMp4}
            onClick={handleDownloadMp4}
            className="col-span-2 flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-75"
          >
            <Film className="h-4 w-4" />
            <span>
              {exportingMp4
                ? t('replayExportingMp4', { pct: mp4Progress })
                : t('replayDownloadMp4')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

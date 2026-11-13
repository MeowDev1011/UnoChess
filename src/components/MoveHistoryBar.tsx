import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, History, Sparkles, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MoveHistoryEntry } from '../types/game';

interface MoveHistoryBarProps {
  entries: MoveHistoryEntry[];
  onDownloadPgn: () => void;
}

export const MoveHistoryBar: React.FC<MoveHistoryBarProps> = ({
  entries,
  onDownloadPgn,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    }
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length, expanded]);

  return (
    <section
      aria-label={t('moveHistoryTitle')}
      className="mt-1.5 rounded-2xl border-2 border-slate-950 bg-slate-900/90 px-2.5 py-1.5 shadow-md backdrop-blur-sm"
    >
      {/* Top Bar of the Bottom History Drawer */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-left text-[11px] font-extrabold text-amber-300 transition hover:text-amber-200"
        >
          <History className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t('moveHistoryTitle')}</span>
          <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 tabular-nums">
            {entries.length}
          </span>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
        </button>

        <button
          type="button"
          onClick={onDownloadPgn}
          disabled={entries.length === 0}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-extrabold text-sky-300 transition hover:border-sky-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Download className="h-3 w-3" />
          <span>PGN</span>
        </button>
      </div>

      {/* Compact Horizontal Strip (Always Visible) */}
      {!expanded && (
        <div
          ref={stripRef}
          className="mt-1 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] scrollbar-none"
        >
          {entries.length === 0 ? (
            <span className="text-[11px] font-medium text-slate-400">{t('noMovesYet')}</span>
          ) : (
            entries.map((entry) => (
              <span
                key={entry.ply}
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                  entry.duelEvent
                    ? 'border-rose-500/70 bg-rose-950/70 text-rose-200'
                    : entry.syncBonus
                    ? 'border-amber-400/70 bg-amber-950/70 text-amber-200'
                    : entry.faction === 'white'
                    ? 'border-slate-700 bg-amber-50/90 text-slate-950'
                    : 'border-slate-700 bg-slate-800 text-slate-100'
                }`}
                title={entry.comment}
              >
                <span className="opacity-65">{entry.turnNumber}.</span>
                <span>{entry.san}</span>
                {entry.syncBonus && <Sparkles className="h-2.5 w-2.5 text-amber-500" />}
                {entry.duelEvent && <Swords className="h-2.5 w-2.5 text-rose-400" />}
              </span>
            ))
          )}
        </div>
      )}

      {/* Expanded Scrollable History Drawer */}
      {expanded && (
        <div
          ref={listRef}
          className="mt-1.5 max-h-36 space-y-1 overflow-y-auto border-t border-slate-800 pt-1.5 pr-1 text-[11px]"
        >
          {entries.length === 0 ? (
            <div className="py-2 text-center text-slate-400">{t('noMovesYet')}</div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.ply}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/60 px-2 py-1"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="w-6 shrink-0 font-mono text-[10px] font-bold text-slate-400 tabular-nums">
                    #{entry.ply}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
                      entry.faction === 'white'
                        ? 'border-slate-950 bg-amber-50'
                        : 'border-slate-400 bg-slate-800'
                    }`}
                  />
                  <span className="font-mono font-extrabold text-white">{entry.san}</span>
                  {entry.syncBonus && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-400/20 px-1 py-0.5 text-[9px] font-extrabold text-amber-300">
                      <Sparkles className="h-2.5 w-2.5" />
                      {t('colorSyncBadge')}
                    </span>
                  )}
                  {entry.duelEvent && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-rose-500/25 px-1 py-0.5 text-[9px] font-extrabold text-rose-300">
                      <Swords className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
                {entry.comment && (
                  <span className="max-w-[52%] truncate text-[10px] text-slate-400">
                    {entry.comment}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};

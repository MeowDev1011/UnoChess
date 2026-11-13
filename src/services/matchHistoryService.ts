import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { MoveHistoryEntry, ReplayNode, SavedMatchRecord } from '../types/game';
import { db } from './onlineService';

const MATCH_HISTORY_LOCAL_KEY = 'unochess_match_history_v1';
const MAX_LOCAL_HISTORY = 50;

function sanitizeMoveEntry(entry: MoveHistoryEntry): MoveHistoryEntry {
  return {
    ply: Number(entry.ply || 1),
    turnNumber: Number(entry.turnNumber || 1),
    faction: entry.faction === 'black' ? 'black' : 'white',
    san: String(entry.san ?? '').slice(0, 40),
    comment: String(entry.comment ?? '').slice(0, 120),
    isChessMove: Boolean(entry.isChessMove),
    cardColor: entry.cardColor ?? '',
    cardValue: entry.cardValue ?? '',
    syncBonus: Boolean(entry.syncBonus),
    duelEvent: Boolean(entry.duelEvent),
    boardAfter: typeof entry.boardAfter === 'string' ? entry.boardAfter.slice(0, 128) : '',
    fromSq: typeof entry.fromSq === 'string' ? entry.fromSq.slice(0, 4) : '',
    toSq: typeof entry.toSq === 'string' ? entry.toSq.slice(0, 4) : '',
    nag: entry.nag ?? '',
    userComment: typeof entry.userComment === 'string' ? entry.userComment.slice(0, 160) : '',
  };
}

export function loadLocalMatchHistory(): SavedMatchRecord[] {
  try {
    const raw = localStorage.getItem(MATCH_HISTORY_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedMatchRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  } catch {
    return [];
  }
}

export function saveMatchRecordLocally(record: SavedMatchRecord): SavedMatchRecord[] {
  const existing = loadLocalMatchHistory();
  const clean: SavedMatchRecord = {
    ...record,
    moves: (record.moves || []).slice(-500).map(sanitizeMoveEntry),
  };
  const filtered = existing.filter((r) => r.id !== clean.id);
  const next = [clean, ...filtered]
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, MAX_LOCAL_HISTORY);
  try {
    localStorage.setItem(MATCH_HISTORY_LOCAL_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota failures
  }
  return next;
}

export async function saveMatchRecord(record: SavedMatchRecord): Promise<SavedMatchRecord[]> {
  const nextLocal = saveMatchRecordLocally(record);

  if (record.ownerUid && record.ownerUid !== 'local') {
    const safeId = record.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    if (safeId) {
      try {
        const ref = doc(db, 'players', record.ownerUid, 'matches', safeId);
        await setDoc(ref, {
          id: safeId,
          ownerUid: record.ownerUid,
          mode: record.mode,
          whiteName: record.whiteName.slice(0, 40) || 'White',
          blackName: record.blackName.slice(0, 40) || 'Black',
          whiteElo: record.whiteElo ?? null,
          blackElo: record.blackElo ?? null,
          playerFaction: record.playerFaction,
          result: record.result,
          outcome: record.outcome,
          reasonText: record.reasonText.slice(0, 120),
          timeControlLabel: record.timeControlLabel.slice(0, 24) || '∞',
          turnsPlayed: Math.max(1, Math.round(record.turnsPlayed || 1)),
          elapsedSeconds: Math.max(0, Math.round(record.elapsedSeconds || 0)),
          eloDelta: record.eloDelta ?? null,
          createdAtMs: Math.max(0, Math.round(record.createdAtMs || Date.now())),
          moves: (record.moves || []).slice(-500).map(sanitizeMoveEntry),
          ...(record.replayTree ? { replayTree: record.replayTree } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Keep local saved copy intact if offline or profile doc missing
      }
    }
  }

  return nextLocal;
}

export async function updateSavedMatchReplayTree(
  recordId: string,
  replayTree: ReplayNode,
  ownerUid?: string | null
): Promise<SavedMatchRecord[]> {
  const existing = loadLocalMatchHistory();
  const next = existing.map((rec) =>
    rec.id === recordId ? { ...rec, replayTree } : rec
  );
  try {
    localStorage.setItem(MATCH_HISTORY_LOCAL_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }

  const targetRec = next.find((r) => r.id === recordId);
  const uid = ownerUid || targetRec?.ownerUid;
  if (uid && uid !== 'local' && targetRec) {
    const safeId = recordId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    try {
      await updateDoc(doc(db, 'players', uid, 'matches', safeId), {
        moves: targetRec.moves.slice(-500).map(sanitizeMoveEntry),
        replayTree,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Ignore offline update errors; local copy is updated
    }
  }

  return next;
}

export async function loadMergedMatchHistory(ownerUid?: string | null): Promise<SavedMatchRecord[]> {
  const local = loadLocalMatchHistory();
  if (!ownerUid || ownerUid === 'local') {
    return local;
  }

  try {
    const q = query(
      collection(db, 'players', ownerUid, 'matches'),
      where('ownerUid', '==', ownerUid)
    );
    const snap = await getDocs(q);
    const byId = new Map<string, SavedMatchRecord>();
    for (const item of local) {
      byId.set(item.id, item);
    }
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const cloudRec: SavedMatchRecord = {
        id: String(d.id),
        ownerUid: String(d.ownerUid),
        mode: (d.mode as SavedMatchRecord['mode']) || 'online',
        whiteName: String(d.whiteName || 'White'),
        blackName: String(d.blackName || 'Black'),
        whiteElo: typeof d.whiteElo === 'number' ? d.whiteElo : null,
        blackElo: typeof d.blackElo === 'number' ? d.blackElo : null,
        playerFaction: d.playerFaction === 'black' ? 'black' : 'white',
        result: (d.result as SavedMatchRecord['result']) || '*',
        outcome: (d.outcome as SavedMatchRecord['outcome']) || 'draw',
        reasonText: String(d.reasonText || ''),
        timeControlLabel: String(d.timeControlLabel || '∞'),
        turnsPlayed: Number(d.turnsPlayed || 1),
        elapsedSeconds: Number(d.elapsedSeconds || 0),
        eloDelta: typeof d.eloDelta === 'number' ? d.eloDelta : null,
        createdAtMs: Number(d.createdAtMs || 0),
        moves: Array.isArray(d.moves) ? (d.moves as MoveHistoryEntry[]) : [],
        replayTree: d.replayTree as ReplayNode | undefined,
      };
      // Prefer whichever has replayTree or latest data
      const existing = byId.get(cloudRec.id);
      if (!existing || (!existing.replayTree && cloudRec.replayTree)) {
        byId.set(cloudRec.id, cloudRec);
      }
    });
    return Array.from(byId.values()).sort(
      (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
    );
  } catch {
    return local;
  }
}

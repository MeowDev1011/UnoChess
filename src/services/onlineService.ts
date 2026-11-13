import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { createInitialBoard } from '../engine/chess';
import { createDeck } from '../engine/deck';
import {
  CardColor,
  ChessPiece,
  Faction,
  LichessTimeControlElos,
  LobbyChallenge,
  MoveHistoryEntry,
  OnlineMatchDoc,
  PlayerId,
  PlayerProfile,
  PreferredColor,
  TimeControlCategory,
  TimeControlElos,
  TimeControlPreset,
  getProfileEloForCategory,
  getTimeControlCategoryFromMinutes,
} from '../types/game';
import {
  LichessProfileResult,
  clearStoredLichessToken,
  fetchLatestLichessProfile,
} from './lichessService';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const DEVICE_ACCOUNT_KEY = 'unochess_device_account_v1';
const WAITING_MAGIC_KEY = 'unochess_waiting_magic_v1';
const PENDING_CHALLENGE_KEY = 'unochess_waiting_challenge_v1';
const ACTIVE_MATCH_KEY = 'unochess_active_online_match_v1';
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Boot-time connection check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Online service connection check: client is offline.');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    authType?: string | null;
  };
}

function clampElo(val: number): number {
  return Math.max(100, Math.min(4000, Math.round(val)));
}

function clampLichessRaw(val: number): number {
  return Math.max(0, Math.min(4000, Math.round(val)));
}

function buildDefaultElos(baseElo = 1200): TimeControlElos {
  const b = clampElo(baseElo);
  return {
    unlimited: b,
    bullet: b,
    blitz: b,
    rapid: b,
    classical: b,
  };
}

function normalizeElos(raw: unknown, fallback = 1200): TimeControlElos {
  const fb = clampElo(fallback);
  if (!raw || typeof raw !== 'object') return buildDefaultElos(fb);
  const r = raw as Record<string, unknown>;
  return {
    unlimited: typeof r.unlimited === 'number' ? clampElo(r.unlimited) : fb,
    bullet: typeof r.bullet === 'number' ? clampElo(r.bullet) : fb,
    blitz: typeof r.blitz === 'number' ? clampElo(r.blitz) : fb,
    rapid: typeof r.rapid === 'number' ? clampElo(r.rapid) : fb,
    classical: typeof r.classical === 'number' ? clampElo(r.classical) : fb,
  };
}

function normalizeLichessElos(raw: unknown): LichessTimeControlElos {
  if (!raw || typeof raw !== 'object') {
    return { bullet: 0, blitz: 0, rapid: 0, classical: 0 };
  }
  const r = raw as Record<string, unknown>;
  return {
    bullet: typeof r.bullet === 'number' ? clampLichessRaw(r.bullet) : 0,
    blitz: typeof r.blitz === 'number' ? clampLichessRaw(r.blitz) : 0,
    rapid: typeof r.rapid === 'number' ? clampLichessRaw(r.rapid) : 0,
    classical: typeof r.classical === 'number' ? clampLichessRaw(r.classical) : 0,
  };
}

export function loadDeviceAccount(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(DEVICE_ACCOUNT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PlayerProfile>;
    if (!d.uid || !d.nickname) return null;
    const baseElo = Number(d.elo ?? 1200);
    return {
      uid: String(d.uid),
      nickname: String(d.nickname).slice(0, 20),
      elo: clampElo(baseElo),
      wins: Number(d.wins ?? 0),
      losses: Number(d.losses ?? 0),
      authType: d.authType === 'lichess' ? 'lichess' : 'device',
      lichessUsername: String(d.lichessUsername ?? ''),
      lichessElo: Number(d.lichessElo ?? 0),
      elos: normalizeElos(d.elos, baseElo),
      lichessElos: normalizeLichessElos(d.lichessElos),
    };
  } catch {
    return null;
  }
}

export function saveDeviceAccountLocally(profile: PlayerProfile): void {
  try {
    localStorage.setItem(DEVICE_ACCOUNT_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage quota failures
  }
}

export function clearDeviceAccountLocally(): void {
  try {
    localStorage.removeItem(DEVICE_ACCOUNT_KEY);
  } catch {
    // ignore storage failures
  }
  clearStoredLichessToken();
}

function saveUidScopedId(storageKey: string, uid: string, id: string | null): void {
  try {
    if (!id || !uid) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(
      storageKey,
      JSON.stringify({ uid, id, savedAtMs: Date.now() })
    );
  } catch {
    // ignore storage quota errors
  }
}

function loadUidScopedId(storageKey: string, uid: string): string | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; id?: string; savedAtMs?: number };
    if (
      parsed.uid !== uid ||
      !parsed.id ||
      (parsed.savedAtMs && Date.now() - parsed.savedAtMs > SESSION_MAX_AGE_MS)
    ) {
      return null;
    }
    return String(parsed.id);
  } catch {
    return null;
  }
}

export function saveWaitingMagicMatchId(uid: string, matchId: string | null): void {
  saveUidScopedId(WAITING_MAGIC_KEY, uid, matchId);
}

export function loadWaitingMagicMatchId(uid: string): string | null {
  return loadUidScopedId(WAITING_MAGIC_KEY, uid);
}

export function savePendingChallengeId(uid: string, challengeId: string | null): void {
  saveUidScopedId(PENDING_CHALLENGE_KEY, uid, challengeId);
}

export function loadPendingChallengeId(uid: string): string | null {
  return loadUidScopedId(PENDING_CHALLENGE_KEY, uid);
}

export function saveActiveOnlineMatchId(uid: string, matchId: string | null): void {
  saveUidScopedId(ACTIVE_MATCH_KEY, uid, matchId);
}

export function loadActiveOnlineMatchId(uid: string): string | null {
  return loadUidScopedId(ACTIVE_MATCH_KEY, uid);
}

function buildFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): Error {
  const localAcc = loadDeviceAccount();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: localAcc?.uid ?? null,
      authType: localAcc?.authType ?? null,
    },
    operationType,
    path,
  };
  console.error('Database Error: ', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  throw buildFirestoreError(error, operationType, path);
}

export function flattenBoard(board: (ChessPiece | null)[][]): (ChessPiece | null)[] {
  const flat: (ChessPiece | null)[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      flat.push(cell ? { ...cell } : null);
    }
  }
  return flat;
}

export function unflattenBoard(flat: (ChessPiece | null)[]): (ChessPiece | null)[][] {
  const board: (ChessPiece | null)[][] = [];
  for (let r = 0; r < 8; r++) {
    const row: (ChessPiece | null)[] = [];
    for (let c = 0; c < 8; c++) {
      const cell = flat[r * 8 + c] ?? null;
      row.push(cell ? { ...cell } : null);
    }
    board.push(row);
  }
  return board;
}

export function generateSafeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function calculateEloDelta(winnerElo: number, loserElo: number): number {
  const k = 32;
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const delta = Math.round(k * (1 - expectedWinner));
  return Math.max(1, Math.min(100, delta));
}

function mapDocToProfile(d: Record<string, unknown>): PlayerProfile {
  const baseElo = Number(d.elo ?? 1200);
  return {
    uid: String(d.uid),
    nickname: String(d.nickname).slice(0, 20),
    elo: clampElo(baseElo),
    wins: Number(d.wins ?? 0),
    losses: Number(d.losses ?? 0),
    authType: d.authType === 'lichess' ? 'lichess' : 'device',
    lichessUsername: String(d.lichessUsername ?? ''),
    lichessElo: Number(d.lichessElo ?? 0),
    elos: normalizeElos(d.elos, baseElo),
    lichessElos: normalizeLichessElos(d.lichessElos),
  };
}

function mergeFreshLichessElos(
  current: PlayerProfile,
  fresh: LichessProfileResult
): {
  elos: TimeControlElos;
  lichessElos: LichessTimeControlElos;
  elo: number;
  lichessElo: number;
  nickname: string;
  changed: boolean;
} {
  const noUnoGamesYet = current.wins + current.losses === 0;
  const cats: ('bullet' | 'blitz' | 'rapid' | 'classical')[] = [
    'bullet',
    'blitz',
    'rapid',
    'classical',
  ];

  const nextElos: TimeControlElos = { ...current.elos };
  if (noUnoGamesYet) {
    nextElos.unlimited = fresh.elos.unlimited;
  }

  for (const cat of cats) {
    const prevRaw = current.lichessElos?.[cat] ?? 0;
    const freshRaw = fresh.lichessElos[cat] ?? 0;
    if (noUnoGamesYet || prevRaw === 0) {
      nextElos[cat] = fresh.elos[cat];
    } else if (freshRaw > 0) {
      const diff = freshRaw - prevRaw;
      nextElos[cat] = clampElo((current.elos?.[cat] ?? fresh.elos[cat]) + diff);
    }
  }

  const nextPrimaryElo = nextElos.blitz || fresh.elo;
  const nextNickname = fresh.username.slice(0, 20) || current.nickname;

  const changed =
    nextNickname !== current.nickname ||
    nextPrimaryElo !== current.elo ||
    fresh.elo !== current.lichessElo ||
    cats.some(
      (c) =>
        nextElos[c] !== current.elos?.[c] ||
        fresh.lichessElos[c] !== current.lichessElos?.[c]
    ) ||
    nextElos.unlimited !== current.elos?.unlimited;

  return {
    elos: nextElos,
    lichessElos: fresh.lichessElos,
    elo: nextPrimaryElo,
    lichessElo: fresh.elo,
    nickname: nextNickname,
    changed,
  };
}

export async function refreshLichessProfileIfLinked(
  profile: PlayerProfile
): Promise<PlayerProfile> {
  if (profile.authType !== 'lichess') return profile;
  const queryName =
    profile.lichessUsername || profile.uid.replace(/^lichess_/, '');
  if (!queryName) return profile;

  const fresh = await fetchLatestLichessProfile(queryName);
  if (!fresh) return profile;

  const merged = mergeFreshLichessElos(profile, fresh);
  if (!merged.changed) return profile;

  const updated: PlayerProfile = {
    ...profile,
    nickname: merged.nickname,
    elo: merged.elo,
    elos: merged.elos,
    lichessUsername: fresh.username.slice(0, 40),
    lichessElo: merged.lichessElo,
    lichessElos: merged.lichessElos,
  };

  try {
    await updateDoc(doc(db, 'players', profile.uid), {
      nickname: updated.nickname,
      elo: updated.elo,
      elos: updated.elos,
      authType: 'lichess',
      lichessUsername: updated.lichessUsername,
      lichessElo: updated.lichessElo,
      lichessElos: updated.lichessElos,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // keep local updated ratings if offline
  }

  saveDeviceAccountLocally(updated);
  return updated;
}

export async function syncDeviceAccountWithFirestore(
  localProfile: PlayerProfile
): Promise<PlayerProfile> {
  const path = `players/${localProfile.uid}`;
  const ref = doc(db, 'players', localProfile.uid);
  try {
    const snap = await getDoc(ref);
    let synced: PlayerProfile;
    if (snap.exists()) {
      synced = mapDocToProfile(snap.data() as Record<string, unknown>);
      saveDeviceAccountLocally(synced);
    } else {
      await setDoc(ref, {
        uid: localProfile.uid,
        nickname: localProfile.nickname.slice(0, 20),
        elo: clampElo(localProfile.elo),
        wins: 0,
        losses: 0,
        authType: localProfile.authType,
        lichessUsername: localProfile.lichessUsername.slice(0, 40),
        lichessElo: clampLichessRaw(localProfile.lichessElo),
        elos: localProfile.elos ?? buildDefaultElos(localProfile.elo),
        lichessElos: localProfile.lichessElos ?? {
          bullet: 0,
          blitz: 0,
          rapid: 0,
          classical: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      synced = localProfile;
      saveDeviceAccountLocally(synced);
    }

    if (synced.authType === 'lichess') {
      synced = await refreshLichessProfileIfLinked(synced);
    }
    return synced;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePlayerProfile(
  uid: string,
  cb: (profile: PlayerProfile | null) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `players/${uid}`;
  return onSnapshot(
    doc(db, 'players', uid),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const prof = mapDocToProfile(snap.data() as Record<string, unknown>);
      saveDeviceAccountLocally(prof);
      cb(prof);
    },
    (error) => {
      const err = buildFirestoreError(error, OperationType.GET, path);
      onError?.(err);
    }
  );
}

export async function saveDevicePlayerAccount(
  rawNickname: string,
  existingProfile?: PlayerProfile | null
): Promise<PlayerProfile> {
  const nickname = rawNickname.trim().slice(0, 20);
  if (nickname.length < 2) {
    throw new Error('Nickname too short');
  }
  const uid = existingProfile?.uid || generateSafeId('dev');
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      const created: PlayerProfile = {
        uid,
        nickname,
        elo: 1200,
        wins: 0,
        losses: 0,
        authType: 'device',
        lichessUsername: '',
        lichessElo: 0,
        elos: buildDefaultElos(1200),
        lichessElos: { bullet: 0, blitz: 0, rapid: 0, classical: 0 },
      };
      await setDoc(ref, {
        ...created,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      saveDeviceAccountLocally(created);
      return created;
    } else {
      await updateDoc(ref, {
        nickname,
        updatedAt: serverTimestamp(),
      });
      const updated = {
        ...mapDocToProfile(existing.data() as Record<string, unknown>),
        nickname,
      };
      saveDeviceAccountLocally(updated);
      return updated;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loginWithLichessProfile(
  lichess: LichessProfileResult
): Promise<PlayerProfile> {
  const safeId = lichess.lichessId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'user';
  const uid = `lichess_${safeId}`;
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);
  const nickname = lichess.username.trim().slice(0, 20);
  const clampedElo = clampElo(lichess.elo || 1200);

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      const profile: PlayerProfile = {
        uid,
        nickname: nickname.length >= 2 ? nickname : `Li_${safeId}`.slice(0, 20),
        elo: clampedElo,
        wins: 0,
        losses: 0,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: clampedElo,
        elos: lichess.elos,
        lichessElos: lichess.lichessElos,
      };
      await setDoc(ref, {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      saveDeviceAccountLocally(profile);
      return profile;
    } else {
      const current = mapDocToProfile(existing.data() as Record<string, unknown>);
      const merged = mergeFreshLichessElos(current, lichess);
      await updateDoc(ref, {
        nickname: merged.nickname,
        elo: merged.elo,
        elos: merged.elos,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: merged.lichessElo,
        lichessElos: merged.lichessElos,
        updatedAt: serverTimestamp(),
      });
      const updated: PlayerProfile = {
        ...current,
        nickname: merged.nickname,
        elo: merged.elo,
        elos: merged.elos,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: merged.lichessElo,
        lichessElos: merged.lichessElos,
      };
      saveDeviceAccountLocally(updated);
      return updated;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function applyMatchEloToMyProfile(
  profile: PlayerProfile,
  won: boolean,
  eloDelta: number,
  category: TimeControlCategory = 'blitz'
): Promise<void> {
  const path = `players/${profile.uid}`;
  const currentCatElo = getProfileEloForCategory(profile, category);
  const updatedCatElo = clampElo(currentCatElo + (won ? eloDelta : -eloDelta));
  const nextElos: TimeControlElos = {
    ...(profile.elos ?? buildDefaultElos(profile.elo)),
    [category]: updatedCatElo,
  };
  const newElo = clampElo(profile.elo + (won ? eloDelta : -eloDelta));
  const newWins = profile.wins + (won ? 1 : 0);
  const newLosses = profile.losses + (won ? 0 : 1);
  try {
    await updateDoc(doc(db, 'players', profile.uid), {
      elo: newElo,
      elos: nextElos,
      wins: newWins,
      losses: newLosses,
      updatedAt: serverTimestamp(),
    });
    saveDeviceAccountLocally({
      ...profile,
      elo: newElo,
      elos: nextElos,
      wins: newWins,
      losses: newLosses,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function mapDocToChallenge(d: Record<string, unknown>): LobbyChallenge {
  return {
    id: String(d.id),
    creatorUid: String(d.creatorUid),
    creatorNickname: String(d.creatorNickname),
    creatorElo: Number(d.creatorElo),
    timeControlId: String(d.timeControlId),
    timeControlLabel: String(d.timeControlLabel),
    minutes: Number(d.minutes),
    increment: Number(d.increment),
    preferredColor: (d.preferredColor as PreferredColor) || 'random',
    status: d.status as 'open' | 'matched' | 'cancelled',
    matchedMatchId: String(d.matchedMatchId ?? ''),
    opponentUid: String(d.opponentUid ?? ''),
  };
}

export async function getChallengeFromServer(
  challengeId: string
): Promise<LobbyChallenge | null> {
  if (!challengeId) return null;
  try {
    const snap = await getDocFromServer(doc(db, 'challenges', challengeId));
    if (!snap.exists()) return null;
    return mapDocToChallenge(snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function subscribeOpenChallenges(
  cb: (challenges: LobbyChallenge[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = 'challenges';
  const q = query(collection(db, 'challenges'), where('status', '==', 'open'));
  return onSnapshot(
    q,
    (snap) => {
      const list: LobbyChallenge[] = [];
      snap.forEach((docSnap) => {
        list.push(mapDocToChallenge(docSnap.data() as Record<string, unknown>));
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      cb(list);
    },
    (error) => {
      const err = buildFirestoreError(error, OperationType.LIST, path);
      onError?.(err);
    }
  );
}

export function subscribeMyMatchedChallenges(
  uid: string,
  cb: (matchedMatchId: string, challengeId: string) => void,
  activeChallengeId?: string | null,
  onError?: (err: Error) => void
): () => void {
  const path = 'challenges';
  // Query explicitly satisfies firestore.rules `allow list: if existing().status == 'open' || existing().status == 'matched'`
  const q = query(
    collection(db, 'challenges'),
    where('creatorUid', '==', uid),
    where('status', 'in', ['open', 'matched'])
  );
  let initialSnapshotHandled = false;
  const handledMatchedIds = new Set<string>();
  return onSnapshot(
    q,
    (snap) => {
      if (!initialSnapshotHandled) {
        initialSnapshotHandled = true;
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status === 'matched') {
            // If this is our active waiting challenge and it matched while reloading/away, enter immediately!
            if (
              activeChallengeId &&
              docSnap.id === activeChallengeId &&
              typeof d.matchedMatchId === 'string' &&
              d.matchedMatchId
            ) {
              handledMatchedIds.add(docSnap.id);
              cb(d.matchedMatchId, docSnap.id);
            } else {
              handledMatchedIds.add(docSnap.id);
            }
          }
        });
        return;
      }
      snap.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          if (handledMatchedIds.has(change.doc.id)) return;
          const d = change.doc.data();
          if (
            d.status === 'matched' &&
            typeof d.matchedMatchId === 'string' &&
            d.matchedMatchId
          ) {
            handledMatchedIds.add(change.doc.id);
            cb(d.matchedMatchId, change.doc.id);
          }
        }
      });
    },
    (error) => {
      const err = buildFirestoreError(error, OperationType.LIST, path);
      onError?.(err);
    }
  );
}

export async function createLobbyChallenge(
  profile: PlayerProfile,
  timeControl: TimeControlPreset,
  preferredColor: PreferredColor
): Promise<string> {
  const id = generateSafeId('chl');
  const path = `challenges/${id}`;
  const categoryElo = getProfileEloForCategory(profile, timeControl.category);
  try {
    await setDoc(doc(db, 'challenges', id), {
      id,
      creatorUid: profile.uid,
      creatorNickname: profile.nickname,
      creatorElo: Math.round(categoryElo),
      timeControlId: timeControl.id,
      timeControlLabel: timeControl.label,
      minutes: Math.round(timeControl.minutes),
      increment: Math.round(timeControl.increment),
      preferredColor,
      status: 'open',
      matchedMatchId: '',
      opponentUid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function cancelLobbyChallenge(challengeId: string): Promise<void> {
  const path = `challenges/${challengeId}`;
  try {
    await updateDoc(doc(db, 'challenges', challengeId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function resolveP1Faction(preferred: PreferredColor): Faction {
  if (preferred === 'white' || preferred === 'black') return preferred;
  return Math.random() < 0.5 ? 'white' : 'black';
}

function buildInitialMatchPayload(params: {
  matchId: string;
  inviteType: 'lobby' | 'magic_link';
  status: 'waiting' | 'active';
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
  p1Faction: Faction;
}) {
  const initialBoard = createInitialBoard();
  const initialDeck = createDeck();
  const initialClockMs = Math.round(params.minutes * 60 * 1000);
  // White always moves first in chess!
  const startingPlayer = params.p1Faction === 'white' ? 'p1' : 'p2';

  return {
    id: params.matchId,
    inviteType: params.inviteType,
    status: params.status,
    hostUid: params.hostUid,
    hostNickname: params.hostNickname,
    hostElo: Math.round(params.hostElo),
    guestUid: params.guestUid,
    guestNickname: params.guestNickname,
    guestElo: Math.round(params.guestElo),
    timeControlId: params.timeControlId,
    timeControlLabel: params.timeControlLabel,
    minutes: Math.round(params.minutes),
    increment: Math.round(params.increment),
    p1Uid: params.hostUid,
    p2Uid: params.guestUid,
    p1Faction: params.p1Faction,
    activePlayer: startingPlayer,
    p1TimeMs: initialClockMs,
    p2TimeMs: initialClockMs,
    stateVersion: 1,
    turnsPlayed: 1,
    boardFlat: flattenBoard(initialBoard),
    drawPile: initialDeck,
    discardPile: [],
    capturedWhitePieces: [],
    capturedBlackPieces: [],
    exiledPieces: [],
    enPassantTarget: null,
    currentCard: null,
    cardFaceDown: true,
    phase: 'DRAW_PHASE',
    movesRemaining: 0,
    skipOpponentTurns: 0,
    wildTeleportPending: false,
    plus2Remaining: 0,
    plus4Remaining: 0,
    pendingWildPieceType: '',
    pendingPromotion: null,
    bannerKey: 'bannerOnlineTurn',
    bannerParams: {},
    winnerUid: '',
    winReasonKey: '',
    eloDelta: 0,
    lastChainColor: '' as CardColor | '',
    lastChainBy: '' as PlayerId | '',
    isFirstMoveOfTurn: true,
    moveHistory: [] as MoveHistoryEntry[],
    lastDuelText: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function ensureSafeNick(raw: string, fallback = 'Player'): string {
  const clean = raw.trim().slice(0, 20);
  if (clean.length >= 2) return clean;
  return (clean + fallback).slice(0, 20);
}

export async function acceptLobbyChallenge(
  challenge: LobbyChallenge,
  accepter: PlayerProfile
): Promise<string> {
  const matchId = generateSafeId('mch');
  const matchRef = doc(db, 'matches', matchId);
  const challengeRef = doc(db, 'challenges', challenge.id);
  const p1Faction = resolveP1Faction(challenge.preferredColor);
  const category = getTimeControlCategoryFromMinutes(challenge.minutes);
  const accepterElo = getProfileEloForCategory(accepter, category);

  const matchPayload = buildInitialMatchPayload({
    matchId,
    inviteType: 'lobby',
    status: 'active',
    hostUid: challenge.creatorUid,
    hostNickname: ensureSafeNick(challenge.creatorNickname, 'Host'),
    hostElo: challenge.creatorElo,
    guestUid: accepter.uid,
    guestNickname: ensureSafeNick(accepter.nickname, 'Guest'),
    guestElo: accepterElo,
    timeControlId: challenge.timeControlId,
    timeControlLabel: challenge.timeControlLabel,
    minutes: challenge.minutes,
    increment: challenge.increment,
    p1Faction,
  });

  try {
    await runTransaction(db, async (tx) => {
      const chSnap = await tx.get(challengeRef);
      if (!chSnap.exists()) {
        throw new Error('CHALLENGE_UNAVAILABLE');
      }
      const chData = chSnap.data();
      if (chData.status !== 'open' || chData.creatorUid === accepter.uid) {
        throw new Error('CHALLENGE_UNAVAILABLE');
      }
      tx.set(matchRef, matchPayload);
      tx.update(challengeRef, {
        status: 'matched',
        opponentUid: accepter.uid,
        matchedMatchId: matchId,
        updatedAt: serverTimestamp(),
      });
    });
    return matchId;
  } catch (error) {
    if (error instanceof Error && error.message === 'CHALLENGE_UNAVAILABLE') {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `matches/${matchId}`);
  }
}

export async function createMagicLinkMatch(
  host: PlayerProfile,
  timeControl: TimeControlPreset,
  preferredColor: PreferredColor
): Promise<string> {
  const matchId = generateSafeId('mlk');
  const path = `matches/${matchId}`;
  const p1Faction = resolveP1Faction(preferredColor);
  const hostCatElo = getProfileEloForCategory(host, timeControl.category);

  const payload = buildInitialMatchPayload({
    matchId,
    inviteType: 'magic_link',
    status: 'waiting',
    hostUid: host.uid,
    hostNickname: ensureSafeNick(host.nickname, 'Host'),
    hostElo: hostCatElo,
    guestUid: '',
    guestNickname: '',
    guestElo: 0,
    timeControlId: timeControl.id,
    timeControlLabel: timeControl.label,
    minutes: timeControl.minutes,
    increment: timeControl.increment,
    p1Faction,
  });

  try {
    await setDoc(doc(db, 'matches', matchId), payload);
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export type JoinMagicLinkResult =
  | { status: 'joined'; match: OnlineMatchDoc }
  | { status: 'already_in'; match: OnlineMatchDoc }
  | { status: 'self_waiting'; match: OnlineMatchDoc }
  | { status: 'unavailable' };

export async function joinMagicLinkMatch(
  matchId: string,
  guest: PlayerProfile
): Promise<JoinMagicLinkResult> {
  const path = `matches/${matchId}`;
  const ref = doc(db, 'matches', matchId);
  try {
    const result = await runTransaction(db, async (tx): Promise<JoinMagicLinkResult> => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { status: 'unavailable' };
      const d = snap.data() as Record<string, unknown>;
      const mapped = mapDocToOnlineMatch(d);

      if (mapped.status === 'finished') {
        return { status: 'unavailable' };
      }

      if (mapped.hostUid === guest.uid) {
        if (mapped.status === 'waiting') {
          // Host opened their own link while still waiting for friend
          return { status: 'self_waiting', match: mapped };
        }
        return { status: 'already_in', match: mapped };
      }

      if (mapped.guestUid === guest.uid) {
        return { status: 'already_in', match: mapped };
      }

      if (mapped.status !== 'waiting' || mapped.inviteType !== 'magic_link') {
        return { status: 'unavailable' };
      }

      const matchCategory = getTimeControlCategoryFromMinutes(mapped.minutes);
      const guestCatElo = Math.round(getProfileEloForCategory(guest, matchCategory));
      const safeGuestNick = ensureSafeNick(guest.nickname, 'Guest');

      tx.update(ref, {
        status: 'active',
        guestUid: guest.uid,
        guestNickname: safeGuestNick,
        guestElo: guestCatElo,
        p2Uid: guest.uid,
        updatedAt: serverTimestamp(),
      });

      return {
        status: 'joined',
        match: {
          ...mapped,
          status: 'active',
          guestUid: guest.uid,
          guestNickname: safeGuestNick,
          guestElo: guestCatElo,
          p2Uid: guest.uid,
        },
      };
    });
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelWaitingMatch(matchId: string): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      status: 'finished',
      winReasonKey: 'onlineMatchCancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function mapDocToOnlineMatch(d: Record<string, unknown>): OnlineMatchDoc {
  return {
    id: String(d.id),
    inviteType: d.inviteType as 'lobby' | 'magic_link',
    status: d.status as 'waiting' | 'active' | 'finished',
    hostUid: String(d.hostUid),
    hostNickname: String(d.hostNickname),
    hostElo: Number(d.hostElo),
    guestUid: String(d.guestUid ?? ''),
    guestNickname: String(d.guestNickname ?? ''),
    guestElo: Number(d.guestElo ?? 0),
    timeControlId: String(d.timeControlId),
    timeControlLabel: String(d.timeControlLabel),
    minutes: Number(d.minutes),
    increment: Number(d.increment),
    p1Uid: String(d.p1Uid),
    p2Uid: String(d.p2Uid ?? ''),
    p1Faction: d.p1Faction as Faction,
    activePlayer: d.activePlayer as 'p1' | 'p2',
    p1TimeMs: Number(d.p1TimeMs),
    p2TimeMs: Number(d.p2TimeMs),
    stateVersion: Number(d.stateVersion),
    turnsPlayed: Number(d.turnsPlayed),
    boardFlat: (d.boardFlat as (ChessPiece | null)[]) || [],
    drawPile: (d.drawPile as OnlineMatchDoc['drawPile']) || [],
    discardPile: (d.discardPile as OnlineMatchDoc['discardPile']) || [],
    capturedWhitePieces: (d.capturedWhitePieces as ChessPiece[]) || [],
    capturedBlackPieces: (d.capturedBlackPieces as ChessPiece[]) || [],
    exiledPieces: (d.exiledPieces as ChessPiece[]) || [],
    enPassantTarget: (d.enPassantTarget as OnlineMatchDoc['enPassantTarget']) ?? null,
    currentCard: (d.currentCard as OnlineMatchDoc['currentCard']) ?? null,
    cardFaceDown: Boolean(d.cardFaceDown),
    phase: d.phase as OnlineMatchDoc['phase'],
    movesRemaining: Number(d.movesRemaining ?? 0),
    skipOpponentTurns: Number(d.skipOpponentTurns ?? 0),
    wildTeleportPending: Boolean(d.wildTeleportPending),
    plus2Remaining: Number(d.plus2Remaining ?? 0),
    plus4Remaining: Number(d.plus4Remaining ?? 0),
    pendingWildPieceType: String(d.pendingWildPieceType ?? ''),
    pendingPromotion: (d.pendingPromotion as OnlineMatchDoc['pendingPromotion']) ?? null,
    bannerKey: String(d.bannerKey ?? ''),
    bannerParams: (d.bannerParams as Record<string, string | number>) ?? {},
    winnerUid: String(d.winnerUid ?? ''),
    winReasonKey: String(d.winReasonKey ?? ''),
    eloDelta: Number(d.eloDelta ?? 0),
    lastChainColor: (d.lastChainColor as CardColor | '') ?? '',
    lastChainBy: (d.lastChainBy as PlayerId | '') ?? '',
    isFirstMoveOfTurn: d.isFirstMoveOfTurn !== undefined ? Boolean(d.isFirstMoveOfTurn) : true,
    moveHistory: (d.moveHistory as MoveHistoryEntry[]) ?? [],
    lastDuelText: String(d.lastDuelText ?? ''),
  };
}

export async function getMatchFromServer(
  matchId: string
): Promise<OnlineMatchDoc | null> {
  if (!matchId) return null;
  try {
    const snap = await getDocFromServer(doc(db, 'matches', matchId));
    if (!snap.exists()) return null;
    return mapDocToOnlineMatch(snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function subscribeMatch(
  matchId: string,
  cb: (match: OnlineMatchDoc | null) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `matches/${matchId}`;
  return onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(mapDocToOnlineMatch(snap.data() as Record<string, unknown>));
    },
    (error) => {
      const err = buildFirestoreError(error, OperationType.GET, path);
      onError?.(err);
    }
  );
}

export async function pushMatchUpdate(
  matchId: string,
  patch: Partial<Omit<OnlineMatchDoc, 'id' | 'inviteType' | 'hostUid' | 'p1Uid'>>
): Promise<void> {
  const path = `matches/${matchId}`;
  const cleanPatch: Record<string, unknown> = {
    ...patch,
    updatedAt: serverTimestamp(),
  };
  if (typeof cleanPatch.p1TimeMs === 'number') {
    cleanPatch.p1TimeMs = Math.max(0, Math.round(cleanPatch.p1TimeMs));
  }
  if (typeof cleanPatch.p2TimeMs === 'number') {
    cleanPatch.p2TimeMs = Math.max(0, Math.round(cleanPatch.p2TimeMs));
  }
  if (typeof cleanPatch.eloDelta === 'number') {
    cleanPatch.eloDelta = Math.max(0, Math.round(cleanPatch.eloDelta));
  }
  if (Array.isArray(cleanPatch.moveHistory)) {
    cleanPatch.moveHistory = cleanPatch.moveHistory.slice(-500).map((entry) => ({
      ply: Number(entry.ply),
      turnNumber: Number(entry.turnNumber),
      faction: entry.faction,
      san: String(entry.san ?? ''),
      comment: String(entry.comment ?? ''),
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
    }));
  }
  if (typeof cleanPatch.lastDuelText === 'string') {
    cleanPatch.lastDuelText = cleanPatch.lastDuelText.slice(0, 160);
  }
  try {
    await updateDoc(doc(db, 'matches', matchId), cleanPatch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

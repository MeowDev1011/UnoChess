import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { createInitialBoard } from '../engine/chess';
import { createDeck } from '../engine/deck';
import {
  CardColor,
  ChessPiece,
  Faction,
  LobbyChallenge,
  MoveHistoryEntry,
  OnlineMatchDoc,
  PlayerId,
  PlayerProfile,
  PreferredColor,
  TimeControlPreset,
} from '../types/game';
import { LichessProfileResult } from './lichessService';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const DEVICE_ACCOUNT_KEY = 'unochess_device_account_v1';

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

export function loadDeviceAccount(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(DEVICE_ACCOUNT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PlayerProfile>;
    if (!d.uid || !d.nickname) return null;
    return {
      uid: String(d.uid),
      nickname: String(d.nickname).slice(0, 20),
      elo: Number(d.elo ?? 1200),
      wins: Number(d.wins ?? 0),
      losses: Number(d.losses ?? 0),
      authType: d.authType === 'lichess' ? 'lichess' : 'device',
      lichessUsername: String(d.lichessUsername ?? ''),
      lichessElo: Number(d.lichessElo ?? 0),
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
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
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
  throw new Error(JSON.stringify(errInfo));
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
  return {
    uid: String(d.uid),
    nickname: String(d.nickname).slice(0, 20),
    elo: Number(d.elo ?? 1200),
    wins: Number(d.wins ?? 0),
    losses: Number(d.losses ?? 0),
    authType: d.authType === 'lichess' ? 'lichess' : 'device',
    lichessUsername: String(d.lichessUsername ?? ''),
    lichessElo: Number(d.lichessElo ?? 0),
  };
}

export async function syncDeviceAccountWithFirestore(
  localProfile: PlayerProfile
): Promise<PlayerProfile> {
  const path = `players/${localProfile.uid}`;
  const ref = doc(db, 'players', localProfile.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const remote = mapDocToProfile(snap.data() as Record<string, unknown>);
      saveDeviceAccountLocally(remote);
      return remote;
    }
    await setDoc(ref, {
      uid: localProfile.uid,
      nickname: localProfile.nickname.slice(0, 20),
      elo: Math.max(100, Math.min(4000, Math.round(localProfile.elo))),
      wins: 0,
      losses: 0,
      authType: localProfile.authType,
      lichessUsername: localProfile.lichessUsername.slice(0, 40),
      lichessElo: Math.max(0, Math.min(4000, Math.round(localProfile.lichessElo))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    saveDeviceAccountLocally(localProfile);
    return localProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribePlayerProfile(
  uid: string,
  cb: (profile: PlayerProfile | null) => void
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
    (error) => handleFirestoreError(error, OperationType.GET, path)
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
  const clampedElo = Math.max(100, Math.min(4000, Math.round(lichess.elo || 1200)));

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
      const nextNickname = nickname.length >= 2 ? nickname : current.nickname;
      // Preserve UnoChess earned Elo if player already has rated UnoChess games; otherwise sync Lichess Elo
      const nextElo = current.wins + current.losses === 0 ? clampedElo : current.elo;
      await updateDoc(ref, {
        nickname: nextNickname,
        elo: nextElo,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: clampedElo,
        updatedAt: serverTimestamp(),
      });
      const updated: PlayerProfile = {
        ...current,
        nickname: nextNickname,
        elo: nextElo,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: clampedElo,
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
  eloDelta: number
): Promise<void> {
  const path = `players/${profile.uid}`;
  const newElo = Math.max(100, Math.min(4000, Math.round(profile.elo + (won ? eloDelta : -eloDelta))));
  const newWins = profile.wins + (won ? 1 : 0);
  const newLosses = profile.losses + (won ? 0 : 1);
  try {
    await updateDoc(doc(db, 'players', profile.uid), {
      elo: newElo,
      wins: newWins,
      losses: newLosses,
      updatedAt: serverTimestamp(),
    });
    saveDeviceAccountLocally({
      ...profile,
      elo: newElo,
      wins: newWins,
      losses: newLosses,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeOpenChallenges(
  cb: (challenges: LobbyChallenge[]) => void
): () => void {
  const path = 'challenges';
  const q = query(collection(db, 'challenges'), where('status', '==', 'open'));
  return onSnapshot(
    q,
    (snap) => {
      const list: LobbyChallenge[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
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
        });
      });
      list.sort((a, b) => b.id.localeCompare(a.id));
      cb(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeMyMatchedChallenges(
  uid: string,
  cb: (matchedMatchId: string) => void
): () => void {
  const path = 'challenges';
  const q = query(collection(db, 'challenges'), where('creatorUid', '==', uid));
  let initialSnapshotHandled = false;
  const ignoredOldMatchedIds = new Set<string>();
  return onSnapshot(
    q,
    (snap) => {
      if (!initialSnapshotHandled) {
        initialSnapshotHandled = true;
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status === 'matched') {
            ignoredOldMatchedIds.add(docSnap.id);
          }
        });
        return;
      }
      snap.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          if (ignoredOldMatchedIds.has(change.doc.id)) return;
          const d = change.doc.data();
          if (
            d.status === 'matched' &&
            typeof d.matchedMatchId === 'string' &&
            d.matchedMatchId
          ) {
            ignoredOldMatchedIds.add(change.doc.id);
            cb(d.matchedMatchId);
          }
        }
      });
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createLobbyChallenge(
  profile: PlayerProfile,
  timeControl: TimeControlPreset,
  preferredColor: PreferredColor
): Promise<string> {
  const id = generateSafeId('chl');
  const path = `challenges/${id}`;
  try {
    await setDoc(doc(db, 'challenges', id), {
      id,
      creatorUid: profile.uid,
      creatorNickname: profile.nickname,
      creatorElo: Math.round(profile.elo),
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

export async function acceptLobbyChallenge(
  challenge: LobbyChallenge,
  accepter: PlayerProfile
): Promise<string> {
  const matchId = generateSafeId('mch');
  const matchRef = doc(db, 'matches', matchId);
  const challengeRef = doc(db, 'challenges', challenge.id);
  const p1Faction = resolveP1Faction(challenge.preferredColor);

  const matchPayload = buildInitialMatchPayload({
    matchId,
    inviteType: 'lobby',
    status: 'active',
    hostUid: challenge.creatorUid,
    hostNickname: challenge.creatorNickname,
    hostElo: challenge.creatorElo,
    guestUid: accepter.uid,
    guestNickname: accepter.nickname,
    guestElo: accepter.elo,
    timeControlId: challenge.timeControlId,
    timeControlLabel: challenge.timeControlLabel,
    minutes: challenge.minutes,
    increment: challenge.increment,
    p1Faction,
  });

  try {
    const batch = writeBatch(db);
    batch.set(matchRef, matchPayload);
    batch.update(challengeRef, {
      status: 'matched',
      opponentUid: accepter.uid,
      matchedMatchId: matchId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return matchId;
  } catch (error) {
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

  const payload = buildInitialMatchPayload({
    matchId,
    inviteType: 'magic_link',
    status: 'waiting',
    hostUid: host.uid,
    hostNickname: host.nickname,
    hostElo: host.elo,
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

export async function joinMagicLinkMatch(
  matchId: string,
  guest: PlayerProfile
): Promise<'joined' | 'already_in' | 'unavailable'> {
  const path = `matches/${matchId}`;
  const ref = doc(db, 'matches', matchId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return 'unavailable';
    const d = snap.data();

    if (d.hostUid === guest.uid || d.guestUid === guest.uid) {
      return 'already_in';
    }
    if (d.status !== 'waiting' || d.inviteType !== 'magic_link') {
      return 'unavailable';
    }

    await updateDoc(ref, {
      status: 'active',
      guestUid: guest.uid,
      guestNickname: guest.nickname,
      guestElo: Math.round(guest.elo),
      p2Uid: guest.uid,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return 'joined';
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

export function subscribeMatch(
  matchId: string,
  cb: (match: OnlineMatchDoc | null) => void
): () => void {
  const path = `matches/${matchId}`;
  return onSnapshot(
    doc(db, 'matches', matchId),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const d = snap.data();
      cb({
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
        enPassantTarget: d.enPassantTarget ?? null,
        currentCard: d.currentCard ?? null,
        cardFaceDown: Boolean(d.cardFaceDown),
        phase: d.phase as OnlineMatchDoc['phase'],
        movesRemaining: Number(d.movesRemaining ?? 0),
        skipOpponentTurns: Number(d.skipOpponentTurns ?? 0),
        wildTeleportPending: Boolean(d.wildTeleportPending),
        plus2Remaining: Number(d.plus2Remaining ?? 0),
        plus4Remaining: Number(d.plus4Remaining ?? 0),
        pendingWildPieceType: String(d.pendingWildPieceType ?? ''),
        pendingPromotion: d.pendingPromotion ?? null,
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
      });
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
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

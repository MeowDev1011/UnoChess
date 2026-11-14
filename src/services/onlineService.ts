import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
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
  UserRole,
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
const PENDING_JOIN_SESSION_KEY = 'unochess_pending_join_v1';
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// Boot-time connection check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'system', 'moderation'));
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

export function clampElo(val: number): number {
  return Math.max(100, Math.min(4000, Math.round(val)));
}

function clampLichessRaw(val: number): number {
  return Math.max(0, Math.min(4000, Math.round(val)));
}

export function buildDefaultElos(baseElo = 1200): TimeControlElos {
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

export function isGuaranteedPermanentModerator(
  profile:
    | {
        uid?: string | null;
        authType?: string | null;
        lichessUsername?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  const uid = String(profile.uid ?? '').trim().toLowerCase();
  const authType = String(profile.authType ?? '').trim().toLowerCase();
  const liUser = String(profile.lichessUsername ?? '').trim().toLowerCase();
  return uid === 'lichess_gatochess89' || (authType === 'lichess' && liUser === 'gatochess89');
}

export function resolveEffectiveRole(
  rawRole: unknown,
  identity: {
    uid?: string | null;
    authType?: string | null;
    lichessUsername?: string | null;
  }
): UserRole {
  if (rawRole === 'founder') return 'founder';
  if (isGuaranteedPermanentModerator(identity)) return 'moderator';
  if (rawRole === 'moderator') return 'moderator';
  return 'user';
}

export function loadDeviceAccount(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(DEVICE_ACCOUNT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<PlayerProfile>;
    if (!d.uid || !d.nickname) return null;
    const baseElo = Number(d.elo ?? 1200);
    const uid = String(d.uid);
    const authType: 'device' | 'lichess' = d.authType === 'lichess' ? 'lichess' : 'device';
    const lichessUsername = String(d.lichessUsername ?? '');
    return {
      uid,
      nickname: String(d.nickname).slice(0, 20),
      elo: clampElo(baseElo),
      wins: Number(d.wins ?? 0),
      losses: Number(d.losses ?? 0),
      authType,
      lichessUsername,
      lichessElo: Number(d.lichessElo ?? 0),
      elos: normalizeElos(d.elos, baseElo),
      lichessElos: normalizeLichessElos(d.lichessElos),
      role: resolveEffectiveRole(d.role, { uid, authType, lichessUsername }),
      banned: Boolean(d.banned),
      suspendedUntilMs: Number(d.suspendedUntilMs ?? 0),
      chatMuted: Boolean(d.chatMuted),
      mutedUntilMs: Number(d.mutedUntilMs ?? 0),
      warningsCount: Number(d.warningsCount ?? 0),
      sanctionReason: String(d.sanctionReason ?? ''),
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

export function savePendingJoinId(matchId: string | null): void {
  try {
    if (!matchId) {
      sessionStorage.removeItem(PENDING_JOIN_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(PENDING_JOIN_SESSION_KEY, matchId);
  } catch {
    // ignore sessionStorage failures
  }
}

export function loadPendingJoinId(): string | null {
  try {
    const val = sessionStorage.getItem(PENDING_JOIN_SESSION_KEY);
    return val && /^[a-zA-Z0-9_-]{3,128}$/.test(val) ? val : null;
  } catch {
    return null;
  }
}

function isTransientFirestoreError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('aborted') ||
    msg.includes('unavailable') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('internal') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('client is offline')
  );
}

async function withTransientRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isTransientFirestoreError(err)) {
        throw err;
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

export function buildFirestoreError(
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

export function normalizeUsernameKey(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '_');
  return cleaned.slice(0, 20);
}

export function assertCanPlayOnline(profile: PlayerProfile): void {
  if (profile.banned) {
    throw new Error('PLAYER_BANNED');
  }
  if (typeof profile.suspendedUntilMs === 'number' && profile.suspendedUntilMs > Date.now()) {
    throw new Error('PLAYER_SUSPENDED');
  }
}

export async function syncUsernameIndex(uid: string, nickname: string): Promise<void> {
  const key = normalizeUsernameKey(nickname);
  if (key.length < 2 || !uid) return;
  if (key === 'gatochess89' && uid.toLowerCase() !== 'lichess_gatochess89') {
    return;
  }
  try {
    const indexRef = doc(db, 'usernames', key);
    const existingSnap = await getDoc(indexRef);
    if (existingSnap.exists()) {
      const existingUid = String(existingSnap.data().uid || '');
      if (existingUid && existingUid !== uid) {
        const ownerSnap = await getDoc(doc(db, 'players', existingUid));
        if (ownerSnap.exists()) {
          const owner = ownerSnap.data() as Record<string, unknown>;
          const ownerKey = normalizeUsernameKey(String(owner.nickname || ''));
          const ownerProtected =
            owner.authType === 'lichess' ||
            owner.role === 'founder' ||
            owner.role === 'moderator' ||
            isGuaranteedPermanentModerator({
              uid: existingUid,
              authType: String(owner.authType ?? ''),
              lichessUsername: String(owner.lichessUsername ?? ''),
            });
          if (ownerProtected && ownerKey === key) {
            return;
          }
        }
      }
    }
    await setDoc(indexRef, {
      usernameKey: key,
      uid,
      nickname: nickname.trim().slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking secondary index update
  }
}

export async function ensureGuaranteedModerator(
  profile: PlayerProfile
): Promise<PlayerProfile> {
  if (!isGuaranteedPermanentModerator(profile)) return profile;
  if (profile.role === 'founder') return profile;
  const targetRef = doc(db, 'players', profile.uid);
  try {
    const snap = await getDoc(targetRef);
    if (snap.exists()) {
      const rawRole = snap.data().role;
      if (rawRole !== 'moderator' && rawRole !== 'founder') {
        await updateDoc(targetRef, {
          role: 'moderator',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // keep effective moderator role locally even if offline temporarily
  }
  const enforced: PlayerProfile = { ...profile, role: 'moderator' };
  saveDeviceAccountLocally(enforced);
  return enforced;
}

export async function ensureFounderIfUnclaimed(
  profile: PlayerProfile
): Promise<PlayerProfile> {
  const modRef = doc(db, 'system', 'moderation');
  const playerRef = doc(db, 'players', profile.uid);
  try {
    const claimedRole = await runTransaction(db, async (tx): Promise<UserRole> => {
      const modSnap = await tx.get(modRef);
      if (!modSnap.exists()) {
        const safeNick = profile.nickname.trim().slice(0, 20) || 'Founder';
        tx.set(modRef, {
          founderUid: profile.uid,
          founderNickname: safeNick.length >= 2 ? safeNick : 'Founder',
          globalSlowModeSec: 0,
          wordFilterEnabled: true,
          chatDisabledGlobally: false,
          broadcastBanner: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.update(playerRef, {
          role: 'founder',
          updatedAt: serverTimestamp(),
        });
        return 'founder';
      }
      const modData = modSnap.data();
      if (modData.founderUid === profile.uid && profile.role !== 'founder') {
        tx.update(playerRef, {
          role: 'founder',
          updatedAt: serverTimestamp(),
        });
        return 'founder';
      }
      return resolveEffectiveRole(profile.role, profile);
    });
    if (claimedRole !== profile.role) {
      const next = { ...profile, role: claimedRole };
      saveDeviceAccountLocally(next);
      return next;
    }
    return await ensureGuaranteedModerator(profile);
  } catch {
    return await ensureGuaranteedModerator(profile);
  }
}

export function mapDocToProfile(d: Record<string, unknown>): PlayerProfile {
  const baseElo = Number(d.elo ?? 1200);
  const uid = String(d.uid);
  const authType: 'device' | 'lichess' = d.authType === 'lichess' ? 'lichess' : 'device';
  const lichessUsername = String(d.lichessUsername ?? '');
  const role = resolveEffectiveRole(d.role, { uid, authType, lichessUsername });
  return {
    uid,
    nickname: String(d.nickname).slice(0, 20),
    elo: clampElo(baseElo),
    wins: Number(d.wins ?? 0),
    losses: Number(d.losses ?? 0),
    authType,
    lichessUsername,
    lichessElo: Number(d.lichessElo ?? 0),
    elos: normalizeElos(d.elos, baseElo),
    lichessElos: normalizeLichessElos(d.lichessElos),
    role,
    banned: Boolean(d.banned),
    suspendedUntilMs: Number(d.suspendedUntilMs ?? 0),
    chatMuted: Boolean(d.chatMuted),
    mutedUntilMs: Number(d.mutedUntilMs ?? 0),
    warningsCount: Number(d.warningsCount ?? 0),
    sanctionReason: String(d.sanctionReason ?? ''),
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
  if (!fresh) return await ensureGuaranteedModerator(profile);

  const merged = mergeFreshLichessElos(profile, fresh);
  const guaranteedMod = isGuaranteedPermanentModerator({
    uid: profile.uid,
    authType: 'lichess',
    lichessUsername: fresh.username,
  });
  const nextRole: UserRole =
    profile.role === 'founder'
      ? 'founder'
      : guaranteedMod
      ? 'moderator'
      : profile.role || 'user';
  const roleChanged = nextRole !== profile.role;

  if (!merged.changed && !roleChanged) return profile;

  const updated: PlayerProfile = {
    ...profile,
    nickname: merged.nickname,
    elo: merged.elo,
    elos: merged.elos,
    lichessUsername: fresh.username.slice(0, 40),
    lichessElo: merged.lichessElo,
    lichessElos: merged.lichessElos,
    role: nextRole,
  };

  try {
    const patch: Record<string, unknown> = {
      nickname: updated.nickname,
      elo: updated.elo,
      elos: updated.elos,
      authType: 'lichess',
      lichessUsername: updated.lichessUsername,
      lichessElo: updated.lichessElo,
      lichessElos: updated.lichessElos,
      updatedAt: serverTimestamp(),
    };
    if (guaranteedMod && nextRole === 'moderator') {
      patch.role = 'moderator';
    }
    await updateDoc(doc(db, 'players', profile.uid), patch);
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
      const raw = snap.data() as Record<string, unknown>;
      synced = mapDocToProfile(raw);
      if (
        isGuaranteedPermanentModerator(synced) &&
        raw.role !== 'moderator' &&
        raw.role !== 'founder'
      ) {
        await updateDoc(ref, {
          role: 'moderator',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      saveDeviceAccountLocally(synced);
    } else {
      const initialRole: UserRole = isGuaranteedPermanentModerator(localProfile)
        ? 'moderator'
        : 'user';
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
        role: initialRole,
        banned: false,
        suspendedUntilMs: 0,
        chatMuted: false,
        mutedUntilMs: 0,
        warningsCount: 0,
        sanctionReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      synced = { ...localProfile, role: initialRole };
      saveDeviceAccountLocally(synced);
    }

    await syncUsernameIndex(synced.uid, synced.nickname);
    synced = await ensureFounderIfUnclaimed(synced);
    synced = await ensureGuaranteedModerator(synced);

    if (synced.authType === 'lichess') {
      synced = await refreshLichessProfileIfLinked(synced);
    }
    return synced;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

const selfHealedModUids = new Set<string>();

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
      const raw = snap.data() as Record<string, unknown>;
      const prof = mapDocToProfile(raw);
      if (
        isGuaranteedPermanentModerator(prof) &&
        raw.role !== 'moderator' &&
        raw.role !== 'founder' &&
        !selfHealedModUids.has(uid)
      ) {
        selfHealedModUids.add(uid);
        void updateDoc(doc(db, 'players', uid), {
          role: 'moderator',
          updatedAt: serverTimestamp(),
        }).catch(() => {
          selfHealedModUids.delete(uid);
        });
      }
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
      let created: PlayerProfile = {
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
        role: 'user',
        banned: false,
        suspendedUntilMs: 0,
        chatMuted: false,
        mutedUntilMs: 0,
        warningsCount: 0,
        sanctionReason: '',
      };
      await setDoc(ref, {
        ...created,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await syncUsernameIndex(uid, nickname);
      created = await ensureFounderIfUnclaimed(created);
      saveDeviceAccountLocally(created);
      return created;
    } else {
      await updateDoc(ref, {
        nickname,
        updatedAt: serverTimestamp(),
      });
      await syncUsernameIndex(uid, nickname);
      const updated = await ensureFounderIfUnclaimed({
        ...mapDocToProfile(existing.data() as Record<string, unknown>),
        nickname,
      });
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
  const guaranteedMod = isGuaranteedPermanentModerator({
    uid,
    authType: 'lichess',
    lichessUsername: lichess.username,
  });

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      let profile: PlayerProfile = {
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
        role: guaranteedMod ? 'moderator' : 'user',
        banned: false,
        suspendedUntilMs: 0,
        chatMuted: false,
        mutedUntilMs: 0,
        warningsCount: 0,
        sanctionReason: '',
      };
      await setDoc(ref, {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await syncUsernameIndex(uid, profile.nickname);
      profile = await ensureFounderIfUnclaimed(profile);
      profile = await ensureGuaranteedModerator(profile);
      saveDeviceAccountLocally(profile);
      return profile;
    } else {
      const raw = existing.data() as Record<string, unknown>;
      const current = mapDocToProfile(raw);
      const merged = mergeFreshLichessElos(current, lichess);
      const patch: Record<string, unknown> = {
        nickname: merged.nickname,
        elo: merged.elo,
        elos: merged.elos,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: merged.lichessElo,
        lichessElos: merged.lichessElos,
        updatedAt: serverTimestamp(),
      };
      if (guaranteedMod && raw.role !== 'founder' && raw.role !== 'moderator') {
        patch.role = 'moderator';
      }
      await updateDoc(ref, patch);
      await syncUsernameIndex(uid, merged.nickname);
      let updated = await ensureFounderIfUnclaimed({
        ...current,
        nickname: merged.nickname,
        elo: merged.elo,
        elos: merged.elos,
        authType: 'lichess',
        lichessUsername: lichess.username.slice(0, 40),
        lichessElo: merged.lichessElo,
        lichessElos: merged.lichessElos,
        role:
          current.role === 'founder'
            ? 'founder'
            : guaranteedMod
            ? 'moderator'
            : current.role,
      });
      updated = await ensureGuaranteedModerator(updated);
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
  const ref = doc(db, 'players', profile.uid);
  try {
    const updatedLocal = await runTransaction(db, async (tx): Promise<PlayerProfile> => {
      const snap = await tx.get(ref);
      const latest = snap.exists()
        ? mapDocToProfile(snap.data() as Record<string, unknown>)
        : profile;
      const currentCatElo = getProfileEloForCategory(latest, category);
      const updatedCatElo = clampElo(currentCatElo + (won ? eloDelta : -eloDelta));
      const nextElos: TimeControlElos = {
        ...(latest.elos ?? buildDefaultElos(latest.elo)),
        [category]: updatedCatElo,
      };
      const newElo = clampElo(latest.elo + (won ? eloDelta : -eloDelta));
      const newWins = latest.wins + (won ? 1 : 0);
      const newLosses = latest.losses + (won ? 0 : 1);
      tx.update(ref, {
        elo: newElo,
        elos: nextElos,
        wins: newWins,
        losses: newLosses,
        updatedAt: serverTimestamp(),
      });
      return {
        ...latest,
        elo: newElo,
        elos: nextElos,
        wins: newWins,
        losses: newLosses,
      };
    });
    saveDeviceAccountLocally(updatedLocal);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

const STALE_CHALLENGE_MS = 2 * 60 * 60 * 1000;

function isStaleChallengeDoc(d: Record<string, unknown>): boolean {
  const ts = d.createdAt as { toMillis?: () => number } | null | undefined;
  if (!ts || typeof ts.toMillis !== 'function') return false;
  return Date.now() - ts.toMillis() > STALE_CHALLENGE_MS;
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

export async function getOpenChallengesFromServer(): Promise<LobbyChallenge[]> {
  try {
    const q = query(collection(db, 'challenges'), where('status', '==', 'open'));
    const snap = await getDocsFromServer(q);
    const list: LobbyChallenge[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>;
      if (!isStaleChallengeDoc(data)) {
        list.push(mapDocToChallenge(data));
      }
    });
    list.sort((a, b) => b.id.localeCompare(a.id));
    return list;
  } catch {
    return [];
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
        const data = docSnap.data() as Record<string, unknown>;
        if (!isStaleChallengeDoc(data)) {
          list.push(mapDocToChallenge(data));
        }
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
  activeChallengeId?: string | null | (() => string | null),
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
      const currentActiveId =
        typeof activeChallengeId === 'function' ? activeChallengeId() : activeChallengeId;
      if (!initialSnapshotHandled) {
        initialSnapshotHandled = true;
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status === 'matched') {
            if (
              currentActiveId &&
              docSnap.id === currentActiveId &&
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
  assertCanPlayOnline(profile);
  const id = generateSafeId('chl');
  const path = `challenges/${id}`;
  const categoryElo = clampElo(getProfileEloForCategory(profile, timeControl.category));
  try {
    // Clean up any leftover open challenges created by the same player
    try {
      const oldSnap = await getDocsFromServer(
        query(
          collection(db, 'challenges'),
          where('creatorUid', '==', profile.uid),
          where('status', '==', 'open')
        )
      );
      await Promise.all(
        oldSnap.docs.map((d) =>
          updateDoc(d.ref, { status: 'cancelled', updatedAt: serverTimestamp() }).catch(() => {})
        )
      );
    } catch {
      // Non-fatal cleanup of prior open challenges
    }

    await withTransientRetry(() =>
      setDoc(doc(db, 'challenges', id), {
        id,
        creatorUid: profile.uid,
        creatorNickname: ensureSafeNick(profile.nickname, 'Host'),
        creatorElo: categoryElo,
        timeControlId: timeControl.id.slice(0, 32),
        timeControlLabel: timeControl.label.slice(0, 20),
        minutes: Math.max(0, Math.min(180, Math.round(timeControl.minutes))),
        increment: Math.max(0, Math.min(120, Math.round(timeControl.increment))),
        preferredColor,
        status: 'open',
        matchedMatchId: '',
        opponentUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
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
  assertCanPlayOnline(accepter);
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
    hostElo: clampElo(challenge.creatorElo),
    guestUid: accepter.uid,
    guestNickname: ensureSafeNick(accepter.nickname, 'Guest'),
    guestElo: clampElo(accepterElo),
    timeControlId: challenge.timeControlId.slice(0, 32),
    timeControlLabel: challenge.timeControlLabel.slice(0, 20),
    minutes: Math.max(0, Math.min(180, Math.round(challenge.minutes))),
    increment: Math.max(0, Math.min(120, Math.round(challenge.increment))),
    p1Faction,
  });

  try {
    await withTransientRetry(() =>
      runTransaction(db, async (tx) => {
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
      })
    );
    return matchId;
  } catch (error) {
    if (error instanceof Error && error.message === 'CHALLENGE_UNAVAILABLE') {
      throw error;
    }
    // If another player committed an accept concurrently, Firestore rules reject the stale commit;
    // verify current server status so the UI shows CHALLENGE_UNAVAILABLE instead of a generic error.
    try {
      const latestSnap = await getDocFromServer(challengeRef);
      if (!latestSnap.exists() || latestSnap.data()?.status !== 'open') {
        throw new Error('CHALLENGE_UNAVAILABLE');
      }
    } catch (recheckErr) {
      if (recheckErr instanceof Error && recheckErr.message === 'CHALLENGE_UNAVAILABLE') {
        throw recheckErr;
      }
    }
    handleFirestoreError(error, OperationType.WRITE, `matches/${matchId}`);
  }
}

export async function createMagicLinkMatch(
  host: PlayerProfile,
  timeControl: TimeControlPreset,
  preferredColor: PreferredColor
): Promise<string> {
  assertCanPlayOnline(host);
  const matchId = generateSafeId('mlk');
  const path = `matches/${matchId}`;
  const p1Faction = resolveP1Faction(preferredColor);
  const hostCatElo = clampElo(getProfileEloForCategory(host, timeControl.category));

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
    timeControlId: timeControl.id.slice(0, 32),
    timeControlLabel: timeControl.label.slice(0, 20),
    minutes: Math.max(0, Math.min(180, Math.round(timeControl.minutes))),
    increment: Math.max(0, Math.min(120, Math.round(timeControl.increment))),
    p1Faction,
  });

  try {
    await withTransientRetry(() => setDoc(doc(db, 'matches', matchId), payload));
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export type JoinMagicLinkResult =
  | { status: 'joined'; match: OnlineMatchDoc }
  | { status: 'already_in'; match: OnlineMatchDoc }
  | { status: 'self_waiting'; match: OnlineMatchDoc }
  | { status: 'already_started' }
  | { status: 'expired' };

export async function joinMagicLinkMatch(
  matchId: string,
  guest: PlayerProfile
): Promise<JoinMagicLinkResult> {
  assertCanPlayOnline(guest);
  const path = `matches/${matchId}`;
  const ref = doc(db, 'matches', matchId);
  try {
    const result = await withTransientRetry(() =>
      runTransaction(db, async (tx): Promise<JoinMagicLinkResult> => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return { status: 'expired' };
        const d = snap.data() as Record<string, unknown>;
        const mapped = mapDocToOnlineMatch(d);

        if (mapped.status === 'finished') {
          return { status: 'expired' };
        }

        if (mapped.hostUid === guest.uid) {
          if (mapped.status === 'waiting') {
            return { status: 'self_waiting', match: mapped };
          }
          return { status: 'already_in', match: mapped };
        }

        if (mapped.guestUid === guest.uid) {
          return { status: 'already_in', match: mapped };
        }

        if (mapped.status === 'active') {
          return { status: 'already_started' };
        }

        if (mapped.status !== 'waiting' || mapped.inviteType !== 'magic_link') {
          return { status: 'expired' };
        }

        const matchCategory = getTimeControlCategoryFromMinutes(mapped.minutes);
        const guestCatElo = clampElo(getProfileEloForCategory(guest, matchCategory));
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
      })
    );
    return result;
  } catch (error) {
    try {
      const latestSnap = await getDocFromServer(ref);
      if (!latestSnap.exists()) return { status: 'expired' };
      const mapped = mapDocToOnlineMatch(latestSnap.data() as Record<string, unknown>);
      if (mapped.status === 'finished') return { status: 'expired' };
      if (mapped.guestUid === guest.uid || mapped.hostUid === guest.uid) {
        return { status: 'already_in', match: mapped };
      }
      if (mapped.status === 'active') return { status: 'already_started' };
    } catch {
      // Fall through to structured error reporting if server recheck also fails
    }
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

const matchWriteQueues = new Map<string, Promise<void>>();

export function pushMatchUpdate(
  matchId: string,
  patch: Partial<Omit<OnlineMatchDoc, 'id' | 'inviteType' | 'hostUid' | 'p1Uid'>>
): Promise<void> {
  const path = `matches/${matchId}`;
  const cleanPatch: Record<string, unknown> = {
    ...patch,
    updatedAt: serverTimestamp(),
  };
  if (typeof cleanPatch.p1TimeMs === 'number') {
    cleanPatch.p1TimeMs = Math.max(0, Math.min(10800000, Math.round(cleanPatch.p1TimeMs)));
  }
  if (typeof cleanPatch.p2TimeMs === 'number') {
    cleanPatch.p2TimeMs = Math.max(0, Math.min(10800000, Math.round(cleanPatch.p2TimeMs)));
  }
  if (typeof cleanPatch.movesRemaining === 'number') {
    cleanPatch.movesRemaining = Math.max(0, Math.min(20, Math.round(cleanPatch.movesRemaining)));
  }
  if (typeof cleanPatch.skipOpponentTurns === 'number') {
    cleanPatch.skipOpponentTurns = Math.max(0, Math.min(10, Math.round(cleanPatch.skipOpponentTurns)));
  }
  if (typeof cleanPatch.plus2Remaining === 'number') {
    cleanPatch.plus2Remaining = Math.max(0, Math.min(4, Math.round(cleanPatch.plus2Remaining)));
  }
  if (typeof cleanPatch.plus4Remaining === 'number') {
    cleanPatch.plus4Remaining = Math.max(0, Math.min(4, Math.round(cleanPatch.plus4Remaining)));
  }
  if (typeof cleanPatch.eloDelta === 'number') {
    cleanPatch.eloDelta = Math.max(0, Math.min(200, Math.round(cleanPatch.eloDelta)));
  }
  if (typeof cleanPatch.bannerKey === 'string') {
    cleanPatch.bannerKey = cleanPatch.bannerKey.slice(0, 80);
  }
  if (typeof cleanPatch.winReasonKey === 'string') {
    cleanPatch.winReasonKey = cleanPatch.winReasonKey.slice(0, 80);
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

  const prev = matchWriteQueues.get(matchId) ?? Promise.resolve();
  const next = prev
    .catch(() => {
      // Keep write queue alive even if a previous write errored
    })
    .then(async () => {
      try {
        await withTransientRetry(() => updateDoc(doc(db, 'matches', matchId), cleanPatch));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    });

  matchWriteQueues.set(matchId, next);
  return next;
}

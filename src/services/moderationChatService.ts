import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AppealSanctionType,
  MatchChatMessage,
  ModerationAppeal,
  ModerationLog,
  ModerationReport,
  PlayerProfile,
  ReportCategory,
  ReportStatus,
  SystemModerationConfig,
  UserRole,
} from '../types/game';
import {
  OperationType,
  buildDefaultElos,
  buildFirestoreError,
  cancelLobbyChallenge,
  clampElo,
  db,
  generateSafeId,
  handleFirestoreError,
  mapDocToProfile,
  normalizeUsernameKey,
  syncUsernameIndex,
} from './onlineService';

export function isModerator(profile: PlayerProfile | null | undefined): boolean {
  return profile?.role === 'founder' || profile?.role === 'moderator';
}

export function isFounder(profile: PlayerProfile | null | undefined): boolean {
  return profile?.role === 'founder';
}

export function isPlayerChatMuted(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.chatMuted) return true;
  if (typeof profile.mutedUntilMs === 'number' && profile.mutedUntilMs > Date.now()) {
    return true;
  }
  return false;
}

export function isPlayerSuspended(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  return typeof profile.suspendedUntilMs === 'number' && profile.suspendedUntilMs > Date.now();
}

const DEFAULT_BAD_WORDS = [
  'idiota',
  'estupido',
  'estúpido',
  'imbecil',
  'imbécil',
  'pendejo',
  'mierda',
  'puto',
  'puta',
  'cabron',
  'cabrón',
  'fuck',
  'shit',
  'bitch',
  'asshole',
];

export function sanitizeChatText(raw: string, wordFilterEnabled: boolean): string {
  let clean = raw.trim().slice(0, 300);
  if (!clean) return '';
  if (wordFilterEnabled) {
    for (const word of DEFAULT_BAD_WORDS) {
      const rx = new RegExp(`\\b${word}\\b`, 'gi');
      clean = clean.replace(rx, '***');
    }
  }
  return clean.slice(0, 300);
}

// ---------- Audit Logging ----------
export async function recordModerationLog(
  actor: PlayerProfile,
  action: string,
  targetUid: string,
  targetNickname: string,
  details: string
): Promise<void> {
  const id = generateSafeId('log');
  const safeActorNick = actor.nickname.trim().slice(0, 20) || 'Mod';
  try {
    await setDoc(doc(db, 'moderationLogs', id), {
      id,
      action: action.slice(0, 64),
      actorUid: actor.uid,
      actorNickname: safeActorNick.length >= 2 ? safeActorNick : 'Mod',
      targetUid: targetUid.slice(0, 128),
      targetNickname: targetNickname.slice(0, 40),
      details: details.slice(0, 300),
      createdAtMs: Date.now(),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if audit log write fails offline
  }
}

export function subscribeModerationLogs(
  cb: (logs: ModerationLog[]) => void
): () => void {
  const q = query(
    collection(db, 'moderationLogs'),
    where('createdAtMs', '>=', 0),
    orderBy('createdAtMs', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ModerationLog[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: String(d.id),
          action: String(d.action),
          actorUid: String(d.actorUid),
          actorNickname: String(d.actorNickname),
          targetUid: String(d.targetUid ?? ''),
          targetNickname: String(d.targetNickname ?? ''),
          details: String(d.details ?? ''),
          createdAtMs: Number(d.createdAtMs ?? 0),
        });
      });
      cb(list);
    },
    () => {
      cb([]);
    }
  );
}

// ---------- System Moderation Config ----------
function mapSystemModeration(d: Record<string, unknown>): SystemModerationConfig {
  return {
    founderUid: String(d.founderUid ?? ''),
    founderNickname: String(d.founderNickname ?? ''),
    globalSlowModeSec: Number(d.globalSlowModeSec ?? 0),
    wordFilterEnabled: d.wordFilterEnabled !== undefined ? Boolean(d.wordFilterEnabled) : true,
    chatDisabledGlobally: Boolean(d.chatDisabledGlobally),
    broadcastBanner: String(d.broadcastBanner ?? ''),
  };
}

export async function getSystemModerationConfig(): Promise<SystemModerationConfig | null> {
  try {
    const snap = await getDocFromServer(doc(db, 'system', 'moderation'));
    if (!snap.exists()) return null;
    return mapSystemModeration(snap.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function subscribeSystemModerationConfig(
  cb: (cfg: SystemModerationConfig | null) => void
): () => void {
  return onSnapshot(
    doc(db, 'system', 'moderation'),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      cb(mapSystemModeration(snap.data() as Record<string, unknown>));
    },
    () => {
      // keep previous state on transient errors
    }
  );
}

export async function updateSystemModerationConfig(
  actor: PlayerProfile,
  patch: Partial<
    Pick<
      SystemModerationConfig,
      'globalSlowModeSec' | 'wordFilterEnabled' | 'chatDisabledGlobally' | 'broadcastBanner'
    >
  >
): Promise<void> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = 'system/moderation';
  const cleanPatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof patch.globalSlowModeSec === 'number') {
    cleanPatch.globalSlowModeSec = Math.max(0, Math.min(60, Math.round(patch.globalSlowModeSec)));
  }
  if (typeof patch.wordFilterEnabled === 'boolean') {
    cleanPatch.wordFilterEnabled = patch.wordFilterEnabled;
  }
  if (typeof patch.chatDisabledGlobally === 'boolean') {
    cleanPatch.chatDisabledGlobally = patch.chatDisabledGlobally;
  }
  if (typeof patch.broadcastBanner === 'string') {
    cleanPatch.broadcastBanner = patch.broadcastBanner.trim().slice(0, 200);
  }
  try {
    await updateDoc(doc(db, 'system', 'moderation'), cleanPatch);
    await recordModerationLog(
      actor,
      'system_config_updated',
      'system',
      'System',
      JSON.stringify({
        slowMode: patch.globalSlowModeSec,
        filter: patch.wordFilterEnabled,
        chatOff: patch.chatDisabledGlobally,
        banner: patch.broadcastBanner,
      }).slice(0, 280)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ---------- In-Match Real-Time Chat ----------
function mapChatMessage(d: Record<string, unknown>): MatchChatMessage {
  const role: UserRole =
    d.senderRole === 'founder' || d.senderRole === 'moderator' ? d.senderRole : 'user';
  return {
    id: String(d.id),
    matchId: String(d.matchId),
    senderUid: String(d.senderUid),
    senderNickname: String(d.senderNickname),
    senderRole: role,
    text: String(d.text ?? ''),
    kind:
      d.kind === 'system' || d.kind === 'moderated'
        ? d.kind
        : 'text',
    deleted: Boolean(d.deleted),
    deletedBy: String(d.deletedBy ?? ''),
    flagged: Boolean(d.flagged),
    createdAtMs: Number(d.createdAtMs ?? 0),
  };
}

export function subscribeMatchChat(
  matchId: string,
  cb: (messages: MatchChatMessage[]) => void,
  onError?: (err: Error) => void
): () => void {
  const path = `matches/${matchId}/messages`;
  const q = query(
    collection(db, 'matches', matchId, 'messages'),
    where('matchId', '==', matchId),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: MatchChatMessage[] = [];
      snap.forEach((docSnap) => {
        list.push(mapChatMessage(docSnap.data() as Record<string, unknown>));
      });
      list.sort((a, b) => a.createdAtMs - b.createdAtMs);
      cb(list);
    },
    (error) => {
      const err = buildFirestoreError(error, OperationType.LIST, path);
      onError?.(err);
    }
  );
}

export async function fetchMatchChatFromServer(matchId: string): Promise<MatchChatMessage[]> {
  if (!matchId) return [];
  try {
    const q = query(
      collection(db, 'matches', matchId, 'messages'),
      where('matchId', '==', matchId),
      limit(150)
    );
    const snap = await getDocsFromServer(q);
    const list: MatchChatMessage[] = [];
    snap.forEach((docSnap) => {
      list.push(mapChatMessage(docSnap.data() as Record<string, unknown>));
    });
    list.sort((a, b) => a.createdAtMs - b.createdAtMs);
    return list;
  } catch {
    return [];
  }
}

export async function sendMatchChatMessage(
  matchId: string,
  sender: PlayerProfile,
  rawText: string,
  options?: { wordFilterEnabled?: boolean; kind?: 'text' | 'system' }
): Promise<string> {
  if (sender.banned) throw new Error('PLAYER_BANNED');
  if (isPlayerChatMuted(sender)) throw new Error('PLAYER_MUTED');

  const text = sanitizeChatText(rawText, options?.wordFilterEnabled ?? true);
  if (!text) throw new Error('EMPTY_MESSAGE');

  const id = generateSafeId('msg');
  const path = `matches/${matchId}/messages/${id}`;
  const safeNick = sender.nickname.trim().slice(0, 20) || 'Player';
  const senderRole: UserRole = sender.role || 'user';

  try {
    await setDoc(doc(db, 'matches', matchId, 'messages', id), {
      id,
      matchId,
      senderUid: sender.uid,
      senderNickname: safeNick.length >= 2 ? safeNick : 'Player',
      senderRole,
      text,
      kind: options?.kind === 'system' ? 'system' : 'text',
      deleted: false,
      deletedBy: '',
      flagged: false,
      createdAtMs: Date.now(),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function moderateDeleteChatMessage(
  actor: PlayerProfile,
  matchId: string,
  messageId: string,
  redactedText = '[Removed by moderator]'
): Promise<void> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = `matches/${matchId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId, 'messages', messageId), {
      text: redactedText.slice(0, 300),
      kind: 'moderated',
      deleted: true,
      deletedBy: actor.uid,
      flagged: true,
    });
    await recordModerationLog(
      actor,
      'delete_chat_message',
      matchId,
      messageId,
      `Redacted message in match ${matchId}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function flagChatMessage(matchId: string, messageId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'matches', matchId, 'messages', messageId), {
      flagged: true,
    });
  } catch {
    // Non-blocking flag marker
  }
}

// ---------- User Reports (Behavior / Chat / Bugs) ----------
function mapReport(d: Record<string, unknown>): ModerationReport {
  return {
    id: String(d.id),
    reporterUid: String(d.reporterUid),
    reporterNickname: String(d.reporterNickname),
    category: (d.category as ReportCategory) || 'behavior',
    targetUid: String(d.targetUid ?? ''),
    targetNickname: String(d.targetNickname ?? ''),
    matchId: String(d.matchId ?? ''),
    messageId: String(d.messageId ?? ''),
    messageExcerpt: String(d.messageExcerpt ?? ''),
    description: String(d.description ?? ''),
    status: (d.status as ReportStatus) || 'open',
    resolutionNote: String(d.resolutionNote ?? ''),
    handledByUid: String(d.handledByUid ?? ''),
    handledByNickname: String(d.handledByNickname ?? ''),
    createdAtMs: Number(d.createdAtMs ?? 0),
  };
}

export async function submitModerationReport(
  reporter: PlayerProfile,
  input: {
    category: ReportCategory;
    targetUid?: string;
    targetNickname?: string;
    matchId?: string;
    messageId?: string;
    messageExcerpt?: string;
    description: string;
  }
): Promise<string> {
  const desc = input.description.trim().slice(0, 500);
  if (desc.length < 5) throw new Error('DESCRIPTION_TOO_SHORT');

  const id = generateSafeId('rep');
  const path = `reports/${id}`;
  const safeNick = reporter.nickname.trim().slice(0, 20) || 'Player';
  try {
    await setDoc(doc(db, 'reports', id), {
      id,
      reporterUid: reporter.uid,
      reporterNickname: safeNick.length >= 2 ? safeNick : 'Player',
      category: input.category,
      targetUid: (input.targetUid || '').slice(0, 128),
      targetNickname: (input.targetNickname || '').slice(0, 40),
      matchId: (input.matchId || '').slice(0, 128),
      messageId: (input.messageId || '').slice(0, 128),
      messageExcerpt: (input.messageExcerpt || '').slice(0, 300),
      description: desc,
      status: 'open',
      resolutionNote: '',
      handledByUid: '',
      handledByNickname: '',
      createdAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (input.matchId && input.messageId) {
      void flagChatMessage(input.matchId, input.messageId);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeModerationReports(
  cb: (reports: ModerationReport[]) => void
): () => void {
  const q = query(
    collection(db, 'reports'),
    where('status', 'in', ['open', 'in_review', 'resolved', 'dismissed']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ModerationReport[] = [];
      snap.forEach((docSnap) => {
        list.push(mapReport(docSnap.data() as Record<string, unknown>));
      });
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      cb(list);
    },
    () => {
      cb([]);
    }
  );
}

export async function updateReportStatus(
  actor: PlayerProfile,
  reportId: string,
  status: ReportStatus,
  resolutionNote = ''
): Promise<void> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = `reports/${reportId}`;
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      resolutionNote: resolutionNote.trim().slice(0, 300),
      handledByUid: actor.uid,
      handledByNickname: actor.nickname.slice(0, 40),
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      `report_${status}`,
      reportId,
      reportId,
      resolutionNote.trim().slice(0, 200) || `Status changed to ${status}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ---------- User Appeals ----------
function mapAppeal(d: Record<string, unknown>): ModerationAppeal {
  return {
    id: String(d.id),
    appellantUid: String(d.appellantUid),
    appellantNickname: String(d.appellantNickname),
    sanctionType: (d.sanctionType as AppealSanctionType) || 'other',
    reason: String(d.reason ?? ''),
    status: (d.status as ModerationAppeal['status']) || 'pending',
    reviewerUid: String(d.reviewerUid ?? ''),
    reviewerNickname: String(d.reviewerNickname ?? ''),
    reviewerNote: String(d.reviewerNote ?? ''),
    createdAtMs: Number(d.createdAtMs ?? 0),
  };
}

export async function submitModerationAppeal(
  appellant: PlayerProfile,
  sanctionType: AppealSanctionType,
  rawReason: string
): Promise<string> {
  const reason = rawReason.trim().slice(0, 500);
  if (reason.length < 5) throw new Error('REASON_TOO_SHORT');

  const id = generateSafeId('apl');
  const path = `appeals/${id}`;
  const safeNick = appellant.nickname.trim().slice(0, 20) || 'Player';
  try {
    await setDoc(doc(db, 'appeals', id), {
      id,
      appellantUid: appellant.uid,
      appellantNickname: safeNick.length >= 2 ? safeNick : 'Player',
      sanctionType,
      reason,
      status: 'pending',
      reviewerUid: '',
      reviewerNickname: '',
      reviewerNote: '',
      createdAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeAllAppeals(
  cb: (appeals: ModerationAppeal[]) => void
): () => void {
  const q = query(
    collection(db, 'appeals'),
    where('status', 'in', ['pending', 'approved', 'rejected']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ModerationAppeal[] = [];
      snap.forEach((docSnap) => {
        list.push(mapAppeal(docSnap.data() as Record<string, unknown>));
      });
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      cb(list);
    },
    () => {
      cb([]);
    }
  );
}

export function subscribeMyAppeals(
  uid: string,
  cb: (appeals: ModerationAppeal[]) => void
): () => void {
  const q = query(
    collection(db, 'appeals'),
    where('status', 'in', ['pending', 'approved', 'rejected']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: ModerationAppeal[] = [];
      snap.forEach((docSnap) => {
        const mapped = mapAppeal(docSnap.data() as Record<string, unknown>);
        if (mapped.appellantUid === uid) {
          list.push(mapped);
        }
      });
      list.sort((a, b) => b.createdAtMs - a.createdAtMs);
      cb(list);
    },
    () => {
      cb([]);
    }
  );
}

export async function reviewModerationAppeal(
  actor: PlayerProfile,
  appeal: ModerationAppeal,
  decision: 'approved' | 'rejected',
  reviewerNote = ''
): Promise<void> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = `appeals/${appeal.id}`;
  try {
    await updateDoc(doc(db, 'appeals', appeal.id), {
      status: decision,
      reviewerUid: actor.uid,
      reviewerNickname: actor.nickname.slice(0, 40),
      reviewerNote: reviewerNote.trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });

    if (decision === 'approved') {
      await updateDoc(doc(db, 'players', appeal.appellantUid), {
        banned: false,
        suspendedUntilMs: 0,
        chatMuted: false,
        mutedUntilMs: 0,
        warningsCount: 0,
        sanctionReason: '',
        updatedAt: serverTimestamp(),
      });
    }

    await recordModerationLog(
      actor,
      `appeal_${decision}`,
      appeal.appellantUid,
      appeal.appellantNickname,
      reviewerNote.trim().slice(0, 200) || `Appeal ${decision}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function replyToModerationAppeal(
  actor: PlayerProfile,
  appeal: ModerationAppeal,
  reviewerNote: string
): Promise<void> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const note = reviewerNote.trim().slice(0, 300);
  if (note.length < 2) throw new Error('REPLY_TOO_SHORT');
  const path = `appeals/${appeal.id}`;
  try {
    await updateDoc(doc(db, 'appeals', appeal.id), {
      reviewerUid: actor.uid,
      reviewerNickname: actor.nickname.slice(0, 40),
      reviewerNote: note,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'appeal_reply',
      appeal.appellantUid,
      appeal.appellantNickname,
      note.slice(0, 200)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function submitAppealOnBehalfOfUser(
  actor: PlayerProfile,
  target: PlayerProfile,
  sanctionType: AppealSanctionType,
  rawReason: string
): Promise<string> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const reason = rawReason.trim().slice(0, 500);
  if (reason.length < 5) throw new Error('REASON_TOO_SHORT');

  const id = generateSafeId('apl');
  const path = `appeals/${id}`;
  const safeNick = target.nickname.trim().slice(0, 20) || 'Player';
  try {
    await setDoc(doc(db, 'appeals', id), {
      id,
      appellantUid: target.uid,
      appellantNickname: safeNick.length >= 2 ? safeNick : 'Player',
      sanctionType,
      reason,
      status: 'pending',
      reviewerUid: '',
      reviewerNickname: '',
      reviewerNote: '',
      createdAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'appeal_created_for_user',
      target.uid,
      target.nickname,
      reason.slice(0, 200)
    );
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeRegisteredPlayers(
  cb: (players: PlayerProfile[]) => void
): () => void {
  const q = query(
    collection(db, 'players'),
    where('elo', '>=', 100),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: PlayerProfile[] = [];
      snap.forEach((docSnap) => {
        list.push(mapDocToProfile(docSnap.data() as Record<string, unknown>));
      });
      const roleRank = (r?: UserRole) =>
        r === 'founder' ? 0 : r === 'moderator' ? 1 : 2;
      list.sort((a, b) => {
        const rr = roleRank(a.role) - roleRank(b.role);
        if (rr !== 0) return rr;
        return a.nickname.localeCompare(b.nickname);
      });
      cb(list);
    },
    () => {
      cb([]);
    }
  );
}

// ---------- User Lookup & 15+ Moderation Actions ----------
export async function lookupPlayerByUsername(
  usernameOrUid: string
): Promise<PlayerProfile | null> {
  const trimmed = usernameOrUid.trim();
  if (!trimmed) return null;

  // 1) Try normalized username index first
  const key = normalizeUsernameKey(trimmed);
  if (key.length >= 2) {
    try {
      const uSnap = await getDocFromServer(doc(db, 'usernames', key));
      if (uSnap.exists()) {
        const uid = String(uSnap.data().uid || '');
        if (uid) {
          const pSnap = await getDocFromServer(doc(db, 'players', uid));
          if (pSnap.exists()) {
            return mapDocToProfile(pSnap.data() as Record<string, unknown>);
          }
        }
      }
    } catch {
      // continue to direct UID check
    }
  }

  // 2) Fallback: direct UID lookup
  if (/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
    try {
      const pSnap = await getDoc(doc(db, 'players', trimmed));
      if (pSnap.exists()) {
        return mapDocToProfile(pSnap.data() as Record<string, unknown>);
      }
    } catch {
      return null;
    }
  }
  return null;
}

export async function promoteModeratorByUsername(
  actor: PlayerProfile,
  targetUsername: string
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const target = await lookupPlayerByUsername(targetUsername);
  if (!target) throw new Error('USER_NOT_FOUND');
  if (target.role === 'founder') return target;

  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      role: 'moderator',
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'promote_moderator',
      target.uid,
      target.nickname,
      `Promoted ${target.nickname} to Moderator`
    );
    return { ...target, role: 'moderator' };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function demoteModeratorByUsername(
  actor: PlayerProfile,
  targetUsername: string
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const target = await lookupPlayerByUsername(targetUsername);
  if (!target) throw new Error('USER_NOT_FOUND');
  if (target.role === 'founder') throw new Error('CANNOT_DEMOTE_FOUNDER');

  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      role: 'user',
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'demote_moderator',
      target.uid,
      target.nickname,
      `Demoted ${target.nickname} to User`
    );
    return { ...target, role: 'user' };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function issueUserWarning(
  actor: PlayerProfile,
  target: PlayerProfile,
  reason: string
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const nextWarnings = Math.min(1000, (target.warningsCount ?? 0) + 1);
  const safeReason = reason.trim().slice(0, 200) || 'Rule violation warning';
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      warningsCount: nextWarnings,
      sanctionReason: safeReason,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(actor, 'warn_user', target.uid, target.nickname, safeReason);
    return { ...target, warningsCount: nextWarnings, sanctionReason: safeReason };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function clearUserWarnings(
  actor: PlayerProfile,
  target: PlayerProfile
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      warningsCount: 0,
      sanctionReason: '',
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'clear_warnings',
      target.uid,
      target.nickname,
      'Cleared warnings'
    );
    return { ...target, warningsCount: 0, sanctionReason: '' };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function muteUserChat(
  actor: PlayerProfile,
  target: PlayerProfile,
  duration: 15 | 1440 | 'permanent',
  reason = ''
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  if (target.role === 'founder' && actor.uid !== target.uid) {
    throw new Error('CANNOT_SANCTION_FOUNDER');
  }
  const isPerm = duration === 'permanent';
  const mutedUntilMs = isPerm ? 0 : Date.now() + duration * 60 * 1000;
  const safeReason =
    reason.trim().slice(0, 200) ||
    (isPerm ? 'Permanent chat mute' : `Chat muted (${duration}m)`);
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      chatMuted: isPerm,
      mutedUntilMs,
      sanctionReason: safeReason,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      isPerm ? 'mute_chat_perm' : `mute_chat_${duration}m`,
      target.uid,
      target.nickname,
      safeReason
    );
    return {
      ...target,
      chatMuted: isPerm,
      mutedUntilMs,
      sanctionReason: safeReason,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function unmuteUserChat(
  actor: PlayerProfile,
  target: PlayerProfile
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      chatMuted: false,
      mutedUntilMs: 0,
      sanctionReason: '',
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'unmute_chat',
      target.uid,
      target.nickname,
      'Chat unmuted'
    );
    return { ...target, chatMuted: false, mutedUntilMs: 0, sanctionReason: '' };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function suspendUserTemp(
  actor: PlayerProfile,
  target: PlayerProfile,
  hours = 24,
  reason = ''
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  if (target.role === 'founder') throw new Error('CANNOT_SANCTION_FOUNDER');
  const suspendedUntilMs = Date.now() + hours * 3600 * 1000;
  const safeReason = reason.trim().slice(0, 200) || `Suspended for ${hours}h`;
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      suspendedUntilMs,
      sanctionReason: safeReason,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      `suspend_${hours}h`,
      target.uid,
      target.nickname,
      safeReason
    );
    return { ...target, suspendedUntilMs, sanctionReason: safeReason };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function banUserAccount(
  actor: PlayerProfile,
  target: PlayerProfile,
  reason = ''
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  if (target.role === 'founder') throw new Error('CANNOT_SANCTION_FOUNDER');
  const safeReason = reason.trim().slice(0, 200) || 'Account banned by moderator';
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      banned: true,
      sanctionReason: safeReason,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(actor, 'ban_user', target.uid, target.nickname, safeReason);
    return { ...target, banned: true, sanctionReason: safeReason };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function pardonUserAccount(
  actor: PlayerProfile,
  target: PlayerProfile
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      banned: false,
      suspendedUntilMs: 0,
      chatMuted: false,
      mutedUntilMs: 0,
      sanctionReason: '',
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'pardon_user',
      target.uid,
      target.nickname,
      'Lifted ban/suspension/mute'
    );
    return {
      ...target,
      banned: false,
      suspendedUntilMs: 0,
      chatMuted: false,
      mutedUntilMs: 0,
      sanctionReason: '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adjustUserElo(
  actor: PlayerProfile,
  target: PlayerProfile,
  delta: number
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const nextElo = clampElo(target.elo + delta);
  const nextElos = {
    unlimited: clampElo((target.elos?.unlimited ?? target.elo) + delta),
    bullet: clampElo((target.elos?.bullet ?? target.elo) + delta),
    blitz: clampElo((target.elos?.blitz ?? target.elo) + delta),
    rapid: clampElo((target.elos?.rapid ?? target.elo) + delta),
    classical: clampElo((target.elos?.classical ?? target.elo) + delta),
  };
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      elo: nextElo,
      elos: nextElos,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'adjust_elo',
      target.uid,
      target.nickname,
      `Adjusted Elo by ${delta >= 0 ? `+${delta}` : delta} -> ${nextElo}`
    );
    return { ...target, elo: nextElo, elos: nextElos };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resetUserStats(
  actor: PlayerProfile,
  target: PlayerProfile
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  const nextElos = buildDefaultElos(1200);
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      elo: 1200,
      elos: nextElos,
      wins: 0,
      losses: 0,
      updatedAt: serverTimestamp(),
    });
    await recordModerationLog(
      actor,
      'reset_stats',
      target.uid,
      target.nickname,
      'Reset wins/losses to 0 and Elo to 1200'
    );
    return { ...target, elo: 1200, elos: nextElos, wins: 0, losses: 0 };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function forceRenameUser(
  actor: PlayerProfile,
  target: PlayerProfile,
  newName?: string
): Promise<PlayerProfile> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  if (target.role === 'founder' && actor.uid !== target.uid) {
    throw new Error('CANNOT_SANCTION_FOUNDER');
  }
  const safeName =
    (newName?.trim().slice(0, 20) || `Player_${target.uid.slice(-4)}`).padEnd(2, '_');
  const path = `players/${target.uid}`;
  try {
    await updateDoc(doc(db, 'players', target.uid), {
      nickname: safeName,
      updatedAt: serverTimestamp(),
    });
    await syncUsernameIndex(target.uid, safeName);
    await recordModerationLog(
      actor,
      'force_rename',
      target.uid,
      target.nickname,
      `Renamed ${target.nickname} -> ${safeName}`
    );
    return { ...target, nickname: safeName };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function moderatorCancelChallenge(
  actor: PlayerProfile,
  challengeId: string,
  creatorNickname: string
): Promise<void> {
  if (!isModerator(actor)) throw new Error('NOT_MODERATOR');
  await cancelLobbyChallenge(challengeId);
  await recordModerationLog(
    actor,
    'remove_challenge',
    challengeId,
    creatorNickname,
    `Removed lobby challenge ${challengeId}`
  );
}

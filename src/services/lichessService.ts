import { LichessTimeControlElos, TimeControlElos } from '../types/game';

export interface LichessProfileResult {
  lichessId: string;
  username: string;
  elo: number;
  lichessElos: LichessTimeControlElos;
  elos: TimeControlElos;
}

interface LichessPkceState {
  verifier: string;
  state: string;
  redirectUri: string;
  createdAt: number;
}

interface LichessPerfStats {
  games?: number;
  rating?: number;
  rd?: number;
  prov?: boolean;
}

interface LichessAccountResponse {
  id: string;
  username: string;
  perfs?: Record<string, LichessPerfStats>;
}

const LICHESS_PKCE_KEY = 'unochess_lichess_pkce_v1';
const LICHESS_TOKEN_KEY = 'unochess_lichess_token_v1';
export const LICHESS_CB_STORAGE_KEY = 'unochess_lichess_cb';
export const LICHESS_ACK_STORAGE_KEY = 'unochess_lichess_ack';
export const LICHESS_AUTH_CHANNEL = 'unochess_lichess_auth';
const LICHESS_CLIENT_ID = 'unochess.pages.dev';
const LICHESS_SCOPES = 'preference:read';

const inFlightExchanges = new Map<string, Promise<LichessProfileResult>>();
const completedExchanges = new Map<string, LichessProfileResult>();

function clampElo(val: number): number {
  return Math.max(100, Math.min(4000, Math.round(val)));
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomToken(byteLength = 32): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

async function computeS256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export function getLichessRedirectUri(): string {
  return `${window.location.origin}/auth/lichess/callback`;
}

export async function createLichessOAuthUrl(): Promise<{
  authUrl: string;
  state: string;
}> {
  const verifier = generateRandomToken(48);
  const state = generateRandomToken(24);
  const challenge = await computeS256Challenge(verifier);
  const redirectUri = getLichessRedirectUri();

  const pkce: LichessPkceState = {
    verifier,
    state,
    redirectUri,
    createdAt: Date.now(),
  };

  try {
    localStorage.setItem(LICHESS_PKCE_KEY, JSON.stringify(pkce));
    localStorage.removeItem(LICHESS_CB_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LICHESS_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: LICHESS_SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });

  return {
    authUrl: `https://lichess.org/oauth?${params.toString()}`,
    state,
  };
}

export function extractBestLichessElo(perfs?: Record<string, LichessPerfStats>): number {
  if (!perfs) return 1200;
  const order = ['rapid', 'blitz', 'classical', 'bullet'];
  const candidates: { rating: number; games: number; prov: boolean; priority: number }[] = [];

  order.forEach((key, idx) => {
    const stat = perfs[key];
    if (stat && typeof stat.rating === 'number' && stat.rating > 0) {
      candidates.push({
        rating: clampElo(stat.rating),
        games: Number(stat.games ?? 0),
        prov: Boolean(stat.prov) || (typeof stat.rd === 'number' && stat.rd > 180),
        priority: idx,
      });
    }
  });

  if (candidates.length === 0) return 1200;

  candidates.sort((a, b) => {
    if (a.prov !== b.prov) return a.prov ? 1 : -1;
    if ((a.games > 0) !== (b.games > 0)) return a.games > 0 ? -1 : 1;
    if (b.games !== a.games) return b.games - a.games;
    return a.priority - b.priority;
  });

  return candidates[0].rating;
}

export function extractAllLichessElos(perfs?: Record<string, LichessPerfStats>): {
  bestElo: number;
  lichessElos: LichessTimeControlElos;
  elos: TimeControlElos;
} {
  const bestElo = extractBestLichessElo(perfs);

  const readPerf = (key: 'bullet' | 'blitz' | 'rapid' | 'classical'): number => {
    const stat = perfs?.[key];
    if (stat && typeof stat.rating === 'number' && stat.rating > 0) {
      return clampElo(stat.rating);
    }
    return 0;
  };

  const rawBullet = readPerf('bullet');
  const rawBlitz = readPerf('blitz');
  const rawRapid = readPerf('rapid');
  const rawClassical = readPerf('classical');

  const lichessElos: LichessTimeControlElos = {
    bullet: rawBullet,
    blitz: rawBlitz,
    rapid: rawRapid,
    classical: rawClassical,
  };

  const elos: TimeControlElos = {
    unlimited: bestElo,
    bullet: rawBullet > 0 ? rawBullet : bestElo,
    blitz: rawBlitz > 0 ? rawBlitz : bestElo,
    rapid: rawRapid > 0 ? rawRapid : bestElo,
    classical: rawClassical > 0 ? rawClassical : bestElo,
  };

  return { bestElo, lichessElos, elos };
}

function mapLichessAccountToResult(account: LichessAccountResponse): LichessProfileResult {
  const rawName = (account.username || account.id || 'LichessPlayer').trim();
  const username = rawName.slice(0, 20);
  const { bestElo, lichessElos, elos } = extractAllLichessElos(account.perfs);
  return {
    lichessId: account.id,
    username: username.length >= 2 ? username : `Li_${account.id}`.slice(0, 20),
    elo: bestElo,
    lichessElos,
    elos,
  };
}

export async function exchangeLichessCodeForProfile(
  code: string,
  returnedState: string
): Promise<LichessProfileResult> {
  const dedupeKey = `${returnedState}:${code}`;
  const cached = completedExchanges.get(dedupeKey);
  if (cached) return cached;

  const existingPromise = inFlightExchanges.get(dedupeKey);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const raw = localStorage.getItem(LICHESS_PKCE_KEY);
    if (!raw) {
      throw new Error('Missing Lichess PKCE session');
    }
    const pkce = JSON.parse(raw) as LichessPkceState;
    if (!pkce.verifier || pkce.state !== returnedState) {
      throw new Error('Invalid Lichess OAuth state');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.verifier,
      redirect_uri: pkce.redirectUri,
      client_id: LICHESS_CLIENT_ID,
    });

    const tokenRes = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      throw new Error(`Lichess token exchange failed (${tokenRes.status})`);
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new Error('Missing access_token from Lichess');
    }

    try {
      localStorage.removeItem(LICHESS_PKCE_KEY);
      localStorage.removeItem(LICHESS_CB_STORAGE_KEY);
      localStorage.setItem(LICHESS_TOKEN_KEY, tokenJson.access_token);
    } catch {
      // ignore storage errors
    }

    const accRes = await fetch('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
      },
    });

    if (!accRes.ok) {
      throw new Error(`Lichess account fetch failed (${accRes.status})`);
    }

    const account = (await accRes.json()) as LichessAccountResponse;
    const result = mapLichessAccountToResult(account);
    completedExchanges.set(dedupeKey, result);
    return result;
  })();

  inFlightExchanges.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inFlightExchanges.delete(dedupeKey);
  }
}

export async function fetchLatestLichessProfile(
  lichessUsernameOrId: string
): Promise<LichessProfileResult | null> {
  const cleanUser = lichessUsernameOrId.trim();
  if (!cleanUser) return null;
  const cleanLower = cleanUser.toLowerCase();

  try {
    const token = localStorage.getItem(LICHESS_TOKEN_KEY);
    if (token) {
      const accRes = await fetch('https://lichess.org/api/account', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (accRes.ok) {
        const account = (await accRes.json()) as LichessAccountResponse;
        const accId = (account.id || '').trim().toLowerCase();
        const accUser = (account.username || '').trim().toLowerCase();
        // Guard against returning a different user's cached OAuth token
        if (accId === cleanLower || accUser === cleanLower) {
          return mapLichessAccountToResult(account);
        }
      } else if (accRes.status === 401) {
        localStorage.removeItem(LICHESS_TOKEN_KEY);
      }
    }

    const pubRes = await fetch(`https://lichess.org/api/user/${encodeURIComponent(cleanUser)}`);
    if (!pubRes.ok) return null;
    const account = (await pubRes.json()) as LichessAccountResponse;
    return mapLichessAccountToResult(account);
  } catch {
    return null;
  }
}

export function clearStoredLichessToken(): void {
  try {
    localStorage.removeItem(LICHESS_TOKEN_KEY);
  } catch {
    // ignore
  }
}

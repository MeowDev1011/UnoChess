export interface LichessProfileResult {
  lichessId: string;
  username: string;
  elo: number;
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
export const LICHESS_CB_STORAGE_KEY = 'unochess_lichess_cb';
const LICHESS_CLIENT_ID = 'unochess.pages.dev';
const LICHESS_SCOPES = 'preference:read';

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
        rating: Math.round(stat.rating),
        games: Number(stat.games ?? 0),
        prov: Boolean(stat.prov) || (typeof stat.rd === 'number' && stat.rd > 180),
        priority: idx,
      });
    }
  });

  if (candidates.length === 0) return 1200;

  // Prefer established (non-provisional) ratings with games, then highest games/priority
  candidates.sort((a, b) => {
    if (a.prov !== b.prov) return a.prov ? 1 : -1;
    if ((a.games > 0) !== (b.games > 0)) return a.games > 0 ? -1 : 1;
    if (b.games !== a.games) return b.games - a.games;
    return a.priority - b.priority;
  });

  return Math.max(100, Math.min(4000, candidates[0].rating));
}

export async function exchangeLichessCodeForProfile(
  code: string,
  returnedState: string
): Promise<LichessProfileResult> {
  const raw = localStorage.getItem(LICHESS_PKCE_KEY);
  if (!raw) {
    throw new Error('Missing Lichess PKCE session');
  }
  const pkce = JSON.parse(raw) as LichessPkceState;
  if (!pkce.verifier || pkce.state !== returnedState) {
    throw new Error('Invalid Lichess OAuth state');
  }

  localStorage.removeItem(LICHESS_PKCE_KEY);
  localStorage.removeItem(LICHESS_CB_STORAGE_KEY);

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

  const accRes = await fetch('https://lichess.org/api/account', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
  });

  if (!accRes.ok) {
    throw new Error(`Lichess account fetch failed (${accRes.status})`);
  }

  const account = (await accRes.json()) as LichessAccountResponse;
  const rawName = (account.username || account.id || 'LichessPlayer').trim();
  const username = rawName.slice(0, 20);
  const elo = extractBestLichessElo(account.perfs);

  return {
    lichessId: account.id,
    username: username.length >= 2 ? username : `Li_${account.id}`.slice(0, 20),
    elo,
  };
}

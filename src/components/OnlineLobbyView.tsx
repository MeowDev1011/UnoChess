import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Link2,
  LogOut,
  Share2,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  LobbyChallenge,
  PlayerProfile,
  PreferredColor,
  TIME_CONTROL_PRESETS,
  TimeControlCategory,
  TimeControlPreset,
  getProfileEloForCategory,
} from '../types/game';
import {
  acceptLobbyChallenge,
  cancelLobbyChallenge,
  cancelWaitingMatch,
  createLobbyChallenge,
  createMagicLinkMatch,
  joinMagicLinkMatch,
  loginWithLichessProfile,
  refreshLichessProfileIfLinked,
  saveDevicePlayerAccount,
  subscribeMatch,
  subscribeMyMatchedChallenges,
  subscribeOpenChallenges,
  syncDeviceAccountWithFirestore,
} from '../services/onlineService';
import {
  createLichessOAuthUrl,
  exchangeLichessCodeForProfile,
  LICHESS_CB_STORAGE_KEY,
} from '../services/lichessService';
import { OfficialLichessLogo } from './OfficialLichessLogo';
import { sound } from '../utils/audio';

interface OnlineLobbyViewProps {
  profile: PlayerProfile | null;
  profileLoading: boolean;
  pendingJoinMatchId: string | null;
  onClearPendingJoin: () => void;
  onProfileSaved: (profile: PlayerProfile) => void;
  onSwitchAccount: () => void;
  onEnterMatch: (matchId: string, joinNotice?: string) => void;
  onBack: () => void;
}

export const OnlineLobbyView: React.FC<OnlineLobbyViewProps> = ({
  profile,
  profileLoading,
  pendingJoinMatchId,
  onClearPendingJoin,
  onProfileSaved,
  onSwitchAccount,
  onEnterMatch,
  onBack,
}) => {
  const { t } = useTranslation();

  const [tab, setTab] = useState<'public' | 'magic'>('public');
  const [selectedTimeControl, setSelectedTimeControl] = useState<TimeControlPreset>(
    TIME_CONTROL_PRESETS[4] // 3+0 Blitz default in lobby
  );
  const [preferredColor, setPreferredColor] = useState<PreferredColor>('random');

  // Device mini-account / nickname form state
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);

  // Optional Lichess OAuth state
  const [lichessBusy, setLichessBusy] = useState(false);
  const [lichessError, setLichessError] = useState('');
  const [lichessFallbackUrl, setLichessFallbackUrl] = useState<string | null>(null);
  const lichessHandledCodeRef = useRef<string | null>(null);
  const lichessPollRef = useRef<number | null>(null);

  // Lobby state
  const [challenges, setChallenges] = useState<LobbyChallenge[]>([]);
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Magic link state
  const [magicMatchId, setMagicMatchId] = useState<string | null>(null);
  const [creatingMagic, setCreatingMagic] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [joiningDeepLink, setJoiningDeepLink] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState('');
  const [lobbyError, setLobbyError] = useState('');
  const attemptedJoinRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (lichessPollRef.current !== null) {
        clearInterval(lichessPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (profile && !editingNickname) {
      setNicknameInput(profile.nickname);
    }
  }, [editingNickname, profile]);

  // Dynamically refresh Firestore & Lichess per-time-control ratings every time the lobby opens
  const refreshedForUidRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profile) {
      refreshedForUidRef.current = null;
      return;
    }
    if (refreshedForUidRef.current === profile.uid) return;
    refreshedForUidRef.current = profile.uid;

    let active = true;
    void (async () => {
      try {
        const synced = await syncDeviceAccountWithFirestore(profile);
        const latest =
          synced.authType === 'lichess'
            ? await refreshLichessProfileIfLinked(synced)
            : synced;
        if (active && mountedRef.current) {
          onProfileSaved(latest);
        }
      } catch {
        // Keep cached profile if temporarily offline
      }
    })();

    return () => {
      active = false;
    };
  }, [onProfileSaved, profile]);

  const completeLichessCallback = useCallback(
    async (code: string, state: string, error?: string) => {
      if (lichessPollRef.current !== null) {
        clearInterval(lichessPollRef.current);
        lichessPollRef.current = null;
      }
      if (error || !code || !state) {
        if (mountedRef.current) {
          setLichessBusy(false);
          setLichessError(t('onlineLichessError'));
        }
        return;
      }
      if (lichessHandledCodeRef.current === code) return;
      lichessHandledCodeRef.current = code;

      try {
        const lichessData = await exchangeLichessCodeForProfile(code, state);
        const saved = await loginWithLichessProfile(lichessData);
        if (!mountedRef.current) return;
        sound.playSpecial();
        setLichessFallbackUrl(null);
        setLichessError('');
        setEditingNickname(false);
        onProfileSaved(saved);
      } catch {
        if (mountedRef.current) {
          setLichessError(t('onlineLichessError'));
        }
      } finally {
        if (mountedRef.current) {
          setLichessBusy(false);
        }
      }
    },
    [onProfileSaved, t]
  );

  // Listen for Lichess OAuth callback via postMessage or localStorage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        code?: string;
        state?: string;
        error?: string;
      } | null;
      if (data?.type === 'LICHESS_OAUTH_CALLBACK') {
        void completeLichessCallback(data.code || '', data.state || '', data.error);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LICHESS_CB_STORAGE_KEY || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue) as {
          type?: string;
          code?: string;
          state?: string;
          error?: string;
        };
        if (data?.type === 'LICHESS_OAUTH_CALLBACK') {
          void completeLichessCallback(data.code || '', data.state || '', data.error);
        }
      } catch {
        // ignore malformed payload
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [completeLichessCallback]);

  // Subscribe to real open challenges and matched transitions
  const profileUid = profile?.uid ?? '';
  useEffect(() => {
    if (!profileUid) return;
    const unsubOpen = subscribeOpenChallenges((list) => {
      setChallenges(list);
    });
    const unsubMatched = subscribeMyMatchedChallenges(profileUid, (matchedMatchId) => {
      sound.playSpecial();
      onEnterMatch(matchedMatchId);
    });
    return () => {
      unsubOpen();
      unsubMatched();
    };
  }, [onEnterMatch, profileUid]);

  // Subscribe to host's waiting Magic Link match so host gets notified the instant friend joins
  useEffect(() => {
    if (!magicMatchId) return;
    const unsub = subscribeMatch(magicMatchId, (match) => {
      if (!match) return;
      if (match.status === 'active' && match.guestUid) {
        sound.playSpecial();
        const notice = t('onlineMagicJoinedToast', {
          name: match.guestNickname,
          elo: match.guestElo,
        });
        setJoinNotice(notice);
        setMagicMatchId(null);
        onEnterMatch(match.id, notice);
      }
    });
    return () => unsub();
  }, [magicMatchId, onEnterMatch, t]);

  // Handle ?join=<matchId> magic link safely once user has a mini-account / Lichess profile
  useEffect(() => {
    if (!pendingJoinMatchId || !profile) return;
    if (attemptedJoinRef.current === pendingJoinMatchId) return;
    attemptedJoinRef.current = pendingJoinMatchId;

    setJoiningDeepLink(true);
    setDeepLinkError('');

    void (async () => {
      try {
        const res = await joinMagicLinkMatch(pendingJoinMatchId, profile);
        if (!mountedRef.current) return;
        if (res === 'joined' || res === 'already_in') {
          sound.playSpecial();
          const joinedId = pendingJoinMatchId;
          onClearPendingJoin();
          onEnterMatch(joinedId);
        } else {
          setDeepLinkError(t('onlineMagicInvalid'));
          onClearPendingJoin();
        }
      } catch {
        if (mountedRef.current) {
          setDeepLinkError(t('onlineMagicInvalid'));
          onClearPendingJoin();
        }
      } finally {
        if (mountedRef.current) setJoiningDeepLink(false);
      }
    })();
  }, [onClearPendingJoin, onEnterMatch, pendingJoinMatchId, profile, t]);

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nicknameInput.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setNicknameError(t('onlineNicknameInvalid'));
      return;
    }
    sound.playClick();
    setSavingNickname(true);
    setNicknameError('');
    try {
      const saved = await saveDevicePlayerAccount(trimmed, editingNickname ? profile : null);
      onProfileSaved(saved);
      setEditingNickname(false);
    } catch {
      setNicknameError(t('onlineAuthError'));
    } finally {
      setSavingNickname(false);
    }
  };

  const handleLichessLogin = async () => {
    sound.playClick();
    setLichessBusy(true);
    setLichessError('');
    setLichessFallbackUrl(null);

    try {
      const { authUrl } = await createLichessOAuthUrl();
      // Open Lichess OAuth provider URL directly in popup
      const popup = window.open(authUrl, 'unochess_lichess_oauth', 'width=540,height=720');
      if (!popup) {
        setLichessBusy(false);
        setLichessFallbackUrl(authUrl);
        setLichessError(t('onlineLichessPopupBlocked'));
        return;
      }

      if (lichessPollRef.current !== null) {
        clearInterval(lichessPollRef.current);
      }
      lichessPollRef.current = window.setInterval(() => {
        try {
          const raw = localStorage.getItem(LICHESS_CB_STORAGE_KEY);
          if (raw) {
            const data = JSON.parse(raw) as {
              type?: string;
              code?: string;
              state?: string;
              error?: string;
            };
            if (data?.type === 'LICHESS_OAUTH_CALLBACK') {
              void completeLichessCallback(data.code || '', data.state || '', data.error);
              return;
            }
          }
          if (popup.closed) {
            if (lichessPollRef.current !== null) {
              clearInterval(lichessPollRef.current);
              lichessPollRef.current = null;
            }
            if (mountedRef.current) {
              setLichessBusy(false);
            }
          }
        } catch {
          // ignore cross-origin check while popup is on lichess.org
        }
      }, 500);
    } catch {
      setLichessBusy(false);
      setLichessError(t('onlineLichessError'));
    }
  };

  const myOpenChallenge = challenges.find((c) => c.creatorUid === profile?.uid) ?? null;

  const handlePublishChallenge = async () => {
    if (!profile || creatingChallenge || myOpenChallenge) return;
    sound.playClick();
    setLobbyError('');
    setCreatingChallenge(true);
    try {
      await createLobbyChallenge(profile, selectedTimeControl, preferredColor);
    } catch {
      setLobbyError(t('onlineLobbyError'));
    } finally {
      setCreatingChallenge(false);
    }
  };

  const handleCancelChallenge = async (challengeId: string) => {
    sound.playClick();
    setLobbyError('');
    try {
      await cancelLobbyChallenge(challengeId);
    } catch {
      setLobbyError(t('onlineLobbyError'));
    }
  };

  const handleAcceptChallenge = async (challenge: LobbyChallenge) => {
    if (!profile || acceptingId) return;
    sound.playSpecial();
    setLobbyError('');
    setAcceptingId(challenge.id);
    try {
      const matchId = await acceptLobbyChallenge(challenge, profile);
      onEnterMatch(matchId);
    } catch {
      setLobbyError(t('onlineLobbyError'));
    } finally {
      setAcceptingId(null);
    }
  };

  const handleCreateMagicLink = async () => {
    if (!profile || creatingMagic) return;
    sound.playClick();
    setLobbyError('');
    setCreatingMagic(true);
    setCopiedLink(false);
    try {
      const id = await createMagicLinkMatch(profile, selectedTimeControl, preferredColor);
      setMagicMatchId(id);
    } catch {
      setLobbyError(t('onlineLobbyError'));
    } finally {
      setCreatingMagic(false);
    }
  };

  const handleCancelMagicLink = async () => {
    if (!magicMatchId) return;
    sound.playClick();
    setLobbyError('');
    const id = magicMatchId;
    setMagicMatchId(null);
    try {
      await cancelWaitingMatch(id);
    } catch {
      setLobbyError(t('onlineLobbyError'));
    }
  };

  const magicUrl = magicMatchId
    ? `${window.location.origin}${window.location.pathname}?join=${magicMatchId}`
    : '';

  const handleCopyMagicUrl = async () => {
    if (!magicUrl) return;
    sound.playClick();
    try {
      await navigator.clipboard.writeText(magicUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Fallback
    }
  };

  const handleShareMagicUrl = async () => {
    if (!magicUrl) return;
    sound.playClick();
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'UnoChess',
          text: t('onlineMagicTitle'),
          url: magicUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyMagicUrl();
  };

  const categories: { id: TimeControlCategory; label: string }[] = [
    { id: 'unlimited', label: t('timeUnlimited') },
    { id: 'bullet', label: t('timeBullet') },
    { id: 'blitz', label: t('timeBlitz') },
    { id: 'rapid', label: t('timeRapid') },
    { id: 'classical', label: t('timeClassical') },
  ];

  const categoryLabelMap: Record<TimeControlCategory, string> = {
    unlimited: t('timeUnlimited'),
    bullet: t('timeBullet'),
    blitz: t('timeBlitz'),
    rapid: t('timeRapid'),
    classical: t('timeClassical'),
  };

  const activeCategoryElo = getProfileEloForCategory(
    profile,
    selectedTimeControl.category
  );
  const activeCategoryLabel = categoryLabelMap[selectedTimeControl.category];

  const handleSelectTimeCategory = (catId: TimeControlCategory) => {
    sound.playClick();
    if (selectedTimeControl.category === catId) return;
    const first = TIME_CONTROL_PRESETS.find((p) => p.category === catId);
    if (first) setSelectedTimeControl(first);
  };

  const presetsInCategory = TIME_CONTROL_PRESETS.filter(
    (p) => p.category === selectedTimeControl.category
  );

  const renderTimeAndColorSelectors = () => (
    <div className="space-y-2.5">
      <div>
        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-amber-300">
          <Clock className="h-3.5 w-3.5" />
          {t('timeControlTitle')}
        </span>
        <div className="grid grid-cols-5 border-b-2 border-slate-700">
          {categories.map((cat) => {
            const active = selectedTimeControl.category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectTimeCategory(cat.id)}
                className={`relative flex min-h-[32px] items-center justify-center pb-1 text-[11px] font-extrabold transition-colors ${
                  active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="truncate px-0.5">{cat.label}</span>
                {active && (
                  <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {selectedTimeControl.category === 'unlimited' ? (
          <div className="mt-1.5 flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/60 py-1.5 text-xs font-bold text-slate-300">
            <span>∞ · {t('timeUnlimitedDesc')}</span>
          </div>
        ) : (
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {presetsInCategory.map((preset) => {
              const selected = selectedTimeControl.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setSelectedTimeControl(preset);
                  }}
                  className={`min-h-[34px] rounded-xl border-2 px-2 py-1 text-xs font-extrabold tabular-nums transition ${
                    selected
                      ? 'border-slate-950 bg-amber-400 text-slate-950 shadow-[0_2px_0_#0f172a]'
                      : 'border-slate-700 bg-slate-800/90 text-slate-200 hover:border-amber-300/60'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Preferred Side */}
      <div>
        <span className="mb-1 block text-[11px] font-extrabold tracking-wide text-amber-300">
          {t('onlineSideLabel')}
        </span>
        <div className="grid grid-cols-3 border-b-2 border-slate-700">
          {(['random', 'white', 'black'] as PreferredColor[]).map((side) => {
            const active = preferredColor === side;
            const label =
              side === 'random'
                ? t('onlineSideRandom')
                : side === 'white'
                ? t('whitePieces')
                : t('blackPieces');
            return (
              <button
                key={side}
                type="button"
                onClick={() => {
                  sound.playClick();
                  setPreferredColor(side);
                }}
                className={`relative flex min-h-[32px] items-center justify-center pb-1 text-xs font-extrabold transition-colors ${
                  active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{label}</span>
                {active && (
                  <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col px-3 py-3">
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            onBack();
          }}
          className="flex min-h-[40px] items-center gap-1.5 rounded-2xl border-2 border-slate-950 bg-slate-900/90 px-3 py-1.5 text-xs font-extrabold text-amber-200 shadow transition hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('onlineBackMenu')}</span>
        </button>

        <h1 className="font-display text-outline-sm text-lg font-bold text-amber-300">
          {t('onlineLobbyTitle')}
        </h1>

        {profile ? (
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setEditingNickname(false);
              onSwitchAccount();
            }}
            aria-label={t('onlineSignOutBtn')}
            title={t('onlineSignOutBtn')}
            className="flex min-h-[40px] items-center gap-1 rounded-2xl border-2 border-slate-950 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 shadow transition hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {/* Deep Link / Lobby Errors & Notices */}
      {(deepLinkError || lobbyError) && (
        <div className="mt-2.5 rounded-2xl border-2 border-rose-500 bg-rose-950/90 px-3 py-2 text-center text-xs font-bold text-rose-200 shadow">
          {deepLinkError || lobbyError}
        </div>
      )}
      {joinNotice && (
        <div className="mt-2.5 flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-400 bg-emerald-950/90 px-3 py-2 text-xs font-extrabold text-emerald-200 shadow">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-300" />
          <span>{joinNotice}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="mt-3 flex flex-1 flex-col">
        {profileLoading || joiningDeepLink ? (
          <div className="my-auto rounded-3xl border-4 border-slate-950 bg-slate-900/90 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" />
            <p className="text-sm font-extrabold text-amber-200">
              {joiningDeepLink ? t('onlineJoiningMatch') : t('onlineConnecting')}
            </p>
          </div>
        ) : !profile || editingNickname ? (
          /* Device Mini-Account + Optional Lichess OAuth */
          <div className="my-auto rounded-3xl border-4 border-slate-950 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md">
            <div className="text-center">
              <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl border-3 border-slate-950 bg-amber-400 text-slate-950 shadow">
                <UserPlus className="h-6 w-6" />
              </div>
              <h2 className="font-display text-outline-sm text-2xl font-bold text-amber-300">
                {editingNickname ? t('onlineNicknameTitle') : t('onlineConnectTitle')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {editingNickname ? t('onlineNicknameDesc') : t('onlineConnectDesc')}
              </p>
            </div>

            <form onSubmit={handleSaveNickname} className="mt-4">
              <input
                type="text"
                minLength={2}
                maxLength={20}
                required
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder={t('onlineNicknamePlaceholder')}
                className="w-full rounded-2xl border-2 border-slate-700 bg-slate-950 px-4 py-3 text-sm font-extrabold text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
              {nicknameError && (
                <p className="mt-1.5 text-xs font-bold text-rose-400">{nicknameError}</p>
              )}

              <div className="mt-3 flex gap-2">
                {profile && editingNickname && (
                  <button
                    type="button"
                    onClick={() => setEditingNickname(false)}
                    className="flex min-h-[46px] items-center justify-center rounded-2xl border-2 border-slate-700 bg-slate-800 px-4 text-xs font-bold text-slate-200 hover:bg-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingNickname || lichessBusy}
                  className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                >
                  {savingNickname
                    ? t('onlineConnecting')
                    : editingNickname
                    ? t('onlineNicknameSave')
                    : t('onlineCreateMiniAccountBtn')}
                </button>
              </div>
            </form>

            <p className="mt-2.5 text-center text-[11px] font-medium text-slate-400">
              {t('onlineDeviceSavedHint')}
            </p>

            {/* Optional Official Lichess OAuth Button */}
            <div className="my-3.5 flex items-center gap-2.5">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-[11px] font-bold text-slate-400">
                {t('onlineOrDivider')}
              </span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>

            <button
              type="button"
              disabled={lichessBusy || savingNickname}
              onClick={handleLichessLogin}
              className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl border-3 border-slate-950 bg-white px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:bg-slate-100 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
            >
              <OfficialLichessLogo className="h-6 w-6 shrink-0 text-slate-950" />
              <span>
                {lichessBusy ? t('onlineLichessConnecting') : t('onlineLichessBtn')}
              </span>
            </button>

            <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">
              {t('onlineLichessSub')}
            </p>

            {lichessError && (
              <div className="mt-2.5 rounded-xl border border-rose-500/70 bg-rose-950/80 p-2.5 text-center text-xs font-bold text-rose-200">
                <p>{lichessError}</p>
                {lichessFallbackUrl && (
                  <a
                    href={lichessFallbackUrl}
                    target="_top"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-slate-950 shadow"
                  >
                    <OfficialLichessLogo className="h-4 w-4" />
                    <span>{t('onlineLichessOpenLink')}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Live Lobby + Magic Link */
          <div className="flex flex-1 flex-col gap-3">
            {/* Player Profile Strip (Device Mini-Account or Lichess + Active Time Control Elo + Record) */}
            <div className="space-y-2 rounded-2xl border-3 border-slate-950 bg-slate-900/90 px-3.5 py-2.5 shadow-lg backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {profile.authType === 'lichess' && (
                      <span
                        title={t('onlineLichessBadge', { user: profile.lichessUsername })}
                        className="inline-flex shrink-0 items-center justify-center rounded-md bg-white p-0.5 text-slate-950 shadow-sm"
                      >
                        <OfficialLichessLogo className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="truncate text-sm font-extrabold text-white">
                      {profile.nickname}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setNicknameInput(profile.nickname);
                        setEditingNickname(true);
                      }}
                      aria-label={t('onlineNicknameTitle')}
                      className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-amber-300"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 tabular-nums">
                    <span>{t('onlineRecordLabel', { wins: profile.wins, losses: profile.losses })}</span>
                    {profile.authType !== 'lichess' && (
                      <button
                        type="button"
                        disabled={lichessBusy}
                        onClick={handleLichessLogin}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-extrabold text-white transition hover:border-white"
                      >
                        <OfficialLichessLogo className="h-3 w-3" />
                        <span>{t('onlineLichessLinkBtn')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end">
                  <div className="flex items-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-3 py-1 text-xs font-extrabold text-slate-950 shadow tabular-nums">
                    <Trophy className="h-3.5 w-3.5" />
                    <span>{t('onlineEloLabel', { elo: activeCategoryElo })}</span>
                  </div>
                  <span className="mt-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-300">
                    {activeCategoryLabel}
                  </span>
                </div>
              </div>

              {/* Interactive All-Time-Control Elo Breakdown */}
              <div className="grid grid-cols-5 gap-1 border-t border-slate-800 pt-2">
                {categories.map((cat) => {
                  const catElo = getProfileEloForCategory(profile, cat.id);
                  const isActiveCat = selectedTimeControl.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectTimeCategory(cat.id)}
                      className={`flex flex-col items-center rounded-xl border px-1 py-1 text-center transition ${
                        isActiveCat
                          ? 'border-amber-400 bg-amber-400/20 text-amber-200 shadow-sm'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span className="w-full truncate text-[9px] font-bold uppercase tracking-tight">
                        {cat.id === 'unlimited' ? '∞' : cat.label}
                      </span>
                      <span className="text-[11px] font-extrabold tabular-nums text-white">
                        {catElo}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {lichessError && (
              <div className="rounded-xl border border-rose-500/70 bg-rose-950/85 px-3 py-2 text-center text-xs font-bold text-rose-200">
                {lichessError}
              </div>
            )}

            {/* Mode Tabs: Public Lobby | Magic Link */}
            <div className="rounded-3xl border-4 border-slate-950 bg-slate-900/90 p-3.5 shadow-2xl backdrop-blur-md">
              <div className="mb-3 grid grid-cols-2 border-b-2 border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setTab('public');
                  }}
                  className={`relative flex min-h-[38px] items-center justify-center gap-1.5 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                    tab === 'public' ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span>{t('onlineTabPublic')}</span>
                  {tab === 'public' && (
                    <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-sky-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setTab('magic');
                  }}
                  className={`relative flex min-h-[38px] items-center justify-center gap-1.5 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                    tab === 'magic' ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Link2 className="h-4 w-4" />
                  <span>{t('onlineTabMagic')}</span>
                  {tab === 'magic' && (
                    <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-emerald-400" />
                  )}
                </button>
              </div>

              {tab === 'public' ? (
                <div className="space-y-3">
                  {/* Create Real Challenge */}
                  {myOpenChallenge ? (
                    <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-950/35 p-3 text-center">
                      <p className="text-xs font-extrabold text-amber-200">
                        {t('onlineWaitingRival')}
                      </p>
                      <div className="mt-1 text-[11px] font-bold text-slate-300 tabular-nums">
                        {myOpenChallenge.timeControlLabel} · {myOpenChallenge.creatorElo} Elo
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelChallenge(myOpenChallenge.id)}
                        className="mt-2.5 flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-rose-500 px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
                      >
                        <X className="h-4 w-4" />
                        {t('onlineCancelChallenge')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {renderTimeAndColorSelectors()}
                      <button
                        type="button"
                        disabled={creatingChallenge}
                        onClick={handlePublishChallenge}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                      >
                        <Swords className="h-4 w-4" />
                        {t('onlinePublishChallenge')}
                      </button>
                    </div>
                  )}

                  {/* Real Open Challenges Feed */}
                  <div className="border-t border-slate-800 pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-extrabold text-amber-300">
                        {t('onlineOpenChallenges', { count: challenges.length })}
                      </span>
                    </div>

                    {challenges.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-4 text-center text-xs font-medium text-slate-400">
                        {t('onlineNoChallenges')}
                      </div>
                    ) : (
                      <div className="max-h-60 space-y-2 overflow-y-auto pr-0.5">
                        {challenges.map((ch) => {
                          const isMine = ch.creatorUid === profile.uid;
                          return (
                            <div
                              key={ch.id}
                              className="flex items-center justify-between gap-2 rounded-2xl border-2 border-slate-800 bg-slate-950/75 px-3 py-2"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-extrabold text-white">
                                    {ch.creatorNickname}
                                  </span>
                                  <span className="rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-300 tabular-nums">
                                    {ch.creatorElo} Elo
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-slate-400 tabular-nums">
                                  <span className="inline-flex items-center gap-1 text-sky-300">
                                    <Clock className="h-3 w-3" />
                                    {ch.timeControlLabel}
                                  </span>
                                  <span>·</span>
                                  <span>
                                    {ch.preferredColor === 'random'
                                      ? t('onlineSideRandom')
                                      : ch.preferredColor === 'white'
                                      ? t('whitePieces')
                                      : t('blackPieces')}
                                  </span>
                                </div>
                              </div>

                              {isMine ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelChallenge(ch.id)}
                                  className="min-h-[36px] shrink-0 rounded-xl border-2 border-slate-950 bg-rose-500 px-3 py-1 text-xs font-extrabold text-white"
                                >
                                  {t('onlineCancelChallenge')}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={acceptingId === ch.id}
                                  onClick={() => handleAcceptChallenge(ch)}
                                  className="min-h-[36px] shrink-0 rounded-xl border-2 border-slate-950 bg-emerald-400 px-3.5 py-1 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
                                >
                                  {t('onlineAcceptBtn')}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Magic Invite Link Tab */
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="text-xs font-extrabold text-emerald-300">
                      {t('onlineMagicTitle')}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                      {t('onlineMagicDesc')}
                    </p>
                  </div>

                  {!magicMatchId ? (
                    <>
                      {renderTimeAndColorSelectors()}
                      <button
                        type="button"
                        disabled={creatingMagic}
                        onClick={handleCreateMagicLink}
                        className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
                      >
                        <Link2 className="h-4 w-4" />
                        {t('onlineMagicGenerate')}
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2.5 rounded-2xl border-2 border-emerald-400/70 bg-emerald-950/35 p-3">
                      <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-emerald-200">
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                        <span>{t('onlineMagicWaiting')}</span>
                      </div>

                      <div className="break-all rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-amber-200">
                        {magicUrl}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={handleCopyMagicUrl}
                          className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-3 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_#0f172a]"
                        >
                          {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          <span>{copiedLink ? t('onlineMagicCopied') : t('onlineMagicCopy')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleShareMagicUrl}
                          className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-sky-400 px-3 text-xs font-extrabold text-slate-950 shadow-[0_2px_0_#0f172a]"
                        >
                          <Share2 className="h-4 w-4" />
                          <span>{t('onlineMagicShare')}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleCancelMagicLink}
                        className="flex min-h-[36px] w-full items-center justify-center gap-1 rounded-xl border border-rose-500/60 bg-rose-950/60 text-xs font-bold text-rose-200 hover:bg-rose-900/60"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>{t('onlineCancelChallenge')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

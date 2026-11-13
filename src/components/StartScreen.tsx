import React, { useState } from 'react';
import { BookOpen, Bot, Check, ChevronDown, Clock, Globe, Link2, Play, Trophy, Users, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BotLevel,
  Faction,
  GameMode,
  LocalPlayStyle,
  TIME_CONTROL_PRESETS,
  TimeControlCategory,
  TimeControlPreset,
} from '../types/game';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { LayeredCard } from './LayeredCard';

interface StartScreenProps {
  mode: GameMode;
  botLevel: BotLevel;
  playerColor: Faction;
  localPlayStyle: LocalPlayStyle;
  timeControl: TimeControlPreset;
  onChangeMode: (mode: GameMode) => void;
  onChangeBotLevel: (level: BotLevel) => void;
  onChangePlayerColor: (color: Faction) => void;
  onChangeLocalPlayStyle: (style: LocalPlayStyle) => void;
  onChangeTimeControl: (tc: TimeControlPreset) => void;
  onStartGame: () => void;
  onOpenOnlineLobby: () => void;
  onOpenGuide: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  mode,
  botLevel,
  playerColor,
  localPlayStyle,
  timeControl,
  onChangeMode,
  onChangeBotLevel,
  onChangePlayerColor,
  onChangeLocalPlayStyle,
  onChangeTimeControl,
  onStartGame,
  onOpenOnlineLobby,
  onOpenGuide,
}) => {
  const { t, i18n } = useTranslation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const currentCode = (i18n.resolvedLanguage || i18n.language || 'es').split('-')[0];
  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentCode) || SUPPORTED_LANGUAGES[0];

  const getAiTierLabel = (lvl: number) => {
    if (lvl <= 3) return t('aiTierBasic');
    if (lvl <= 6) return t('aiTierNormal');
    if (lvl <= 8) return t('aiTierTactical');
    return t('aiTierMaster');
  };

  const approxElo = 200 + botLevel * 200; // 400 Elo (Lvl 1) .. 2200 Elo (Lvl 10)

  const categories: { id: TimeControlCategory; label: string }[] = [
    { id: 'unlimited', label: t('timeUnlimited') },
    { id: 'bullet', label: t('timeBullet') },
    { id: 'blitz', label: t('timeBlitz') },
    { id: 'rapid', label: t('timeRapid') },
    { id: 'classical', label: t('timeClassical') },
  ];

  const presetsInCategory = TIME_CONTROL_PRESETS.filter(
    (p) => p.category === timeControl.category
  );

  const handleSelectCategory = (cat: TimeControlCategory) => {
    const first = TIME_CONTROL_PRESETS.find((p) => p.category === cat);
    if (first) onChangeTimeControl(first);
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-between px-4 py-3.5">
      {/* Top Bar: Compact 25-Language Selector */}
      <div className="relative z-30 flex w-full max-w-sm justify-end">
        <button
          type="button"
          onClick={() => setLangMenuOpen((o) => !o)}
          aria-expanded={langMenuOpen}
          aria-label={t('languageLabel')}
          className="flex min-h-[38px] items-center gap-2 rounded-xl border-2 border-slate-950 bg-slate-900/90 px-3 py-1 text-xs font-bold text-amber-200 shadow-lg backdrop-blur-sm transition hover:bg-slate-800"
        >
          <Globe className="h-4 w-4 text-sky-400" />
          <span>{currentLang.nativeName}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${langMenuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {langMenuOpen && (
          <div
            role="listbox"
            aria-label={t('languageLabel')}
            className="absolute right-0 top-11 z-40 max-h-72 w-56 overflow-y-auto rounded-2xl border-3 border-slate-950 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md"
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const selected = lang.code === currentLang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    setLangMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold transition ${
                    selected
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 font-mono text-[10px] opacity-75">{lang.short}</span>
                    <span>{lang.nativeName}</span>
                  </span>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hero Logo + Decorative Layered Cards Fan */}
      <div className="flex flex-col items-center text-center">
        <img
          src="/assets/logo.png"
          alt="UnoChess"
          referrerPolicy="no-referrer"
          className="animate-float-slow h-20 w-auto drop-shadow-[0_10px_20px_rgba(0,0,0,0.65)] sm:h-28"
        />

        <p className="font-display text-outline-sm mt-1 max-w-xs text-sm font-semibold text-amber-200 sm:text-base">
          {t('tagline')}
        </p>

        {/* Showcase Fan of Clean Layered Cards */}
        <div className="mt-2.5 flex items-center justify-center -space-x-4">
          <div className="-rotate-12 transform">
            <LayeredCard
              card={{ id: 'demo-1', color: 'blue', value: 'draw2', pieceNumber: 2 }}
              size="sm"
            />
          </div>
          <div className="z-10 -translate-y-2 transform">
            <LayeredCard
              card={{ id: 'demo-2', color: 'red', value: 'revers', pieceNumber: 5 }}
              size="sm"
            />
          </div>
          <div className="rotate-12 transform">
            <LayeredCard
              card={{ id: 'demo-3', color: 'yellow', value: 'wild-draw', pieceNumber: 4 }}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Center Setup Card */}
      <div className="my-2 w-full max-w-sm rounded-3xl border-4 border-slate-950 bg-slate-900/90 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.7)] backdrop-blur-md">
        {/* 1. Game Mode Selector (Line indicator: Bot | 2P Local | Online) */}
        <div className="mb-3.5">
          <span className="mb-1 block text-xs font-extrabold tracking-wide text-amber-300">
            {t('modeTitle')}
          </span>
          <div className="grid grid-cols-3 border-b-2 border-slate-700">
            <button
              type="button"
              onClick={() => onChangeMode('bot')}
              className={`relative flex min-h-[38px] items-center justify-center gap-1.5 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                mode === 'bot' ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bot className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('modeBot')}</span>
              {mode === 'bot' && (
                <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onChangeMode('local')}
              className={`relative flex min-h-[38px] items-center justify-center gap-1.5 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                mode === 'local' ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('modeLocal')}</span>
              {mode === 'local' && (
                <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onChangeMode('online')}
              className={`relative flex min-h-[38px] items-center justify-center gap-1.5 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                mode === 'online' ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wifi className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('modeOnline')}</span>
              {mode === 'online' && (
                <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              )}
            </button>
          </div>
        </div>

        {mode === 'online' ? (
          <div className="space-y-3">
            <div className="rounded-2xl border-2 border-slate-700/80 bg-slate-950/60 p-3 text-xs text-slate-200">
              <div className="flex items-center gap-2 font-extrabold text-amber-300">
                <Trophy className="h-4 w-4 shrink-0" />
                <span>{t('onlineLobbyTitle')} · Elo</span>
              </div>
              <p className="mt-1 leading-relaxed text-slate-300">
                {t('onlineConnectDesc')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-sky-300">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {t('onlineTabPublic')}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  <Link2 className="h-3.5 w-3.5" />
                  {t('onlineTabMagic')}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenOnlineLobby}
              className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 px-5 py-2.5 text-base font-extrabold text-slate-950 shadow-[0_5px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
            >
              <Wifi className="h-5 w-5" />
              {t('onlineLobbyBtn')}
            </button>
          </div>
        ) : (
          <>
            {/* 2. Piece Color Selector (White vs Black) */}
            <div className="mb-3.5">
              <span className="mb-1 block text-xs font-extrabold tracking-wide text-amber-300">
                {t('pieceColorTitle')}
              </span>
              <div className="grid grid-cols-2 border-b-2 border-slate-700">
                <button
                  type="button"
                  onClick={() => onChangePlayerColor('white')}
                  className={`relative flex min-h-[36px] items-center justify-center gap-2 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                    playerColor === 'white' ? 'text-amber-100' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-950 bg-amber-50 shadow" />
                  <span>{t('whitePieces')}</span>
                  {playerColor === 'white' && (
                    <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-amber-200 shadow-[0_0_8px_rgba(253,230,138,0.8)]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onChangePlayerColor('black')}
                  className={`relative flex min-h-[36px] items-center justify-center gap-2 pb-1.5 text-xs font-extrabold transition-colors sm:text-sm ${
                    playerColor === 'black' ? 'text-rose-300' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 bg-slate-900 shadow" />
                  <span>{t('blackPieces')}</span>
                  {playerColor === 'black' && (
                    <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                  )}
                </button>
              </div>
            </div>

            {/* 3. Chess Time Controls (Unlimited + Bullet -> Classical) */}
            <div className="mb-3.5">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-amber-300">
                <Clock className="h-3.5 w-3.5" />
                {t('timeControlTitle')}
              </span>

              {/* Category Line Tabs */}
              <div className="grid grid-cols-5 border-b-2 border-slate-700">
                {categories.map((cat) => {
                  const active = timeControl.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat.id)}
                      className={`relative flex min-h-[34px] items-center justify-center pb-1.5 text-[11px] font-extrabold transition-colors ${
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

              {/* Preset Tiles ("losas comunes") for the selected category */}
              {timeControl.category === 'unlimited' ? (
                <div className="mt-2 flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/60 py-1.5 text-xs font-bold text-slate-300">
                  <span>∞ · {t('timeUnlimitedDesc')}</span>
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {presetsInCategory.map((preset) => {
                    const selected = timeControl.id === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onChangeTimeControl(preset)}
                        className={`min-h-[36px] rounded-xl border-2 px-2 py-1 text-xs font-extrabold tabular-nums transition ${
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

            {/* 4A. AI Intelligence Level Slider ("rayita") + Elo Counter */}
            {mode === 'bot' ? (
              <div className="mb-4">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-amber-300">
                  {t('aiLevelTitle')}
                </span>

                <div className="relative px-1 pt-0.5">
                  <div className="relative flex items-center">
                    <div className="pointer-events-none absolute left-0 right-0 h-1.5 rounded-full bg-slate-700" />
                    <div
                      className="pointer-events-none absolute left-0 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-all duration-150"
                      style={{ width: `${((botLevel - 1) / 9) * 100}%` }}
                    />
                    <input
                      type="range"
                      min={1}
                      max={10}
                      step={1}
                      value={botLevel}
                      onChange={(e) => onChangeBotLevel(parseInt(e.target.value, 10))}
                      aria-label={t('aiLevelTitle')}
                      className="relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent accent-amber-300"
                    />
                  </div>

                  <div className="mt-0.5 flex justify-between px-0.5 text-[10px] font-bold text-slate-400 tabular-nums">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onChangeBotLevel(n)}
                        className={`min-w-[18px] text-center transition-colors ${
                          botLevel === n ? 'font-extrabold text-amber-300' : 'hover:text-slate-200'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/60 py-1.5 text-xs font-extrabold text-amber-200 tabular-nums">
                  {t('aiCounter', {
                    level: botLevel,
                    elo: approxElo,
                    tier: getAiTierLabel(botLevel),
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-amber-300">
                  {t('localStyleTitle')}
                </span>
                <div className="grid grid-cols-2 border-b-2 border-slate-700">
                  <button
                    type="button"
                    onClick={() => onChangeLocalPlayStyle('tabletop')}
                    className={`relative flex min-h-[36px] items-center justify-center pb-1.5 text-xs font-extrabold transition-colors ${
                      localPlayStyle === 'tabletop'
                        ? 'text-amber-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{t('localTabletop')}</span>
                    {localPlayStyle === 'tabletop' && (
                      <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-amber-400" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onChangeLocalPlayStyle('pass')}
                    className={`relative flex min-h-[36px] items-center justify-center pb-1.5 text-xs font-extrabold transition-colors ${
                      localPlayStyle === 'pass'
                        ? 'text-sky-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{t('localPass')}</span>
                    {localPlayStyle === 'pass' && (
                      <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] rounded-full bg-sky-400" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Primary CTA */}
            <button
              type="button"
              onClick={onStartGame}
              className="flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 px-6 py-2.5 text-lg font-extrabold text-slate-950 shadow-[0_5px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
            >
              <Play className="h-6 w-6 fill-current" />
              {t('playNow')}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onOpenGuide}
          className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-bold text-slate-100 transition hover:bg-slate-700 sm:text-sm"
        >
          <BookOpen className="h-4 w-4 text-sky-400" />
          {t('rulesAndCards')}
        </button>
      </div>

      {/* Subtle Bottom Metadata & Translated GitHub Source Code Button */}
      <footer className="flex flex-col items-center gap-2 pb-1">
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-amber-100/80">
          <span>{t('footerColors')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('footerPieces')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('footerGoal')}</span>
        </div>

        <a
          href="https://github.com/MeowDev1011/UnoChess"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[36px] items-center gap-2 rounded-xl border-2 border-slate-950 bg-slate-900/90 px-3.5 py-1.5 text-xs font-extrabold text-amber-200 shadow-lg backdrop-blur-sm transition hover:border-amber-400 hover:bg-slate-800 hover:text-white active:translate-y-0.5"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-current"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span>{t('sourceCode')}</span>
        </a>
      </footer>
    </div>
  );
};

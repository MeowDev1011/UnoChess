import React from 'react';
import { BookOpen, Globe, Home, Music, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';

interface PauseModalProps {
  isOpen: boolean;
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
  onResume: () => void;
  onChangeMusicVolume: (val: number) => void;
  onChangeSfxVolume: (val: number) => void;
  onToggleMusicMute: () => void;
  onToggleSfxMute: () => void;
  onOpenGuide: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  musicVolume,
  sfxVolume,
  musicMuted,
  sfxMuted,
  onResume,
  onChangeMusicVolume,
  onChangeSfxVolume,
  onToggleMusicMute,
  onToggleSfxMute,
  onOpenGuide,
  onRestart,
  onExitToMenu,
}) => {
  const { t, i18n } = useTranslation();
  if (!isOpen) return null;

  const currentCode = (i18n.resolvedLanguage || i18n.language || 'es').split('-')[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pauseTitle')}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl border-4 border-slate-950 bg-gradient-to-b from-slate-800 to-slate-900 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
        <div className="mb-4 text-center">
          <h2 className="font-display text-outline text-3xl font-bold tracking-wide text-amber-300">
            {t('pauseTitle')}
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-300">
            {t('pauseTimerStopped')}
          </p>
        </div>

        {/* 1. Resume */}
        <button
          type="button"
          onClick={onResume}
          className="mb-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-3 text-base font-extrabold text-slate-950 shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
        >
          <Play className="h-5 w-5 fill-current" />
          {t('resumeGame')}
        </button>

        {/* 2. Audio & Language Controls */}
        <div className="mb-4 space-y-3 rounded-2xl border-2 border-slate-700 bg-slate-950/60 p-3.5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Music className="h-4 w-4 text-sky-400" />
                {t('bgMusic')}
              </span>
              <button
                type="button"
                onClick={onToggleMusicMute}
                className={`flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                  musicMuted
                    ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                    : 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                }`}
              >
                {musicMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {musicMuted ? t('muted') : t('active')}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicMuted ? 0 : musicVolume}
              onChange={(e) => onChangeMusicVolume(parseFloat(e.target.value))}
              aria-label={t('bgMusic')}
              className="h-2 w-full cursor-pointer accent-sky-400"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Volume2 className="h-4 w-4 text-amber-400" />
                {t('sfxLabel')}
              </span>
              <button
                type="button"
                onClick={onToggleSfxMute}
                className={`flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                  sfxMuted
                    ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                    : 'border-amber-500/50 bg-amber-500/20 text-amber-200'
                }`}
              >
                {sfxMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {sfxMuted ? t('muted') : t('active')}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxMuted ? 0 : sfxVolume}
              onChange={(e) => onChangeSfxVolume(parseFloat(e.target.value))}
              aria-label={t('sfxLabel')}
              className="h-2 w-full cursor-pointer accent-amber-400"
            />
          </div>

          {/* Language Switcher inside Pause */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-2.5">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <Globe className="h-4 w-4 text-emerald-400" />
              {t('languageLabel')}
            </span>
            <select
              value={currentCode}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              aria-label={t('languageLabel')}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-bold text-amber-200 focus:border-amber-400 focus:outline-none"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. Quick Card Guide */}
        <button
          type="button"
          onClick={onOpenGuide}
          className="mb-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border-3 border-slate-950 bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
        >
          <BookOpen className="h-4 w-4" />
          {t('cardGuideBtn')}
        </button>

        {/* 4. Restart / Exit */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-amber-400 px-3 py-2 text-xs font-extrabold text-slate-950 shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            <RotateCcw className="h-4 w-4" />
            {t('restartBtn')}
          </button>
          <button
            type="button"
            onClick={onExitToMenu}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-2 border-slate-950 bg-rose-500 px-3 py-2 text-xs font-extrabold text-white shadow-[0_3px_0_#0f172a] transition hover:brightness-105 active:translate-y-0.5 active:shadow-none"
          >
            <Home className="h-4 w-4" />
            {t('menuBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

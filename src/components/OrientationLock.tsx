import React, { useEffect, useState } from 'react';
import { RotateCcw, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OrientationLockProps {
  onDesktopBypass?: (bypassed: boolean) => void;
  desktopBypassed: boolean;
}

export const OrientationLock: React.FC<OrientationLockProps> = ({
  onDesktopBypass,
  desktopBypassed,
}) => {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const evaluate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const ratio = h > 0 ? w / h : 1;
      const touch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia('(pointer: coarse)').matches;

      setIsTouchDevice(touch);
      setDimensions({ w, h });

      const isPanoramic16x9 = ratio >= 1.68;
      const isMobileLandscape = touch && w > h * 1.15;

      setLocked(isPanoramic16x9 || isMobileLandscape);
    };

    evaluate();
    window.addEventListener('resize', evaluate);
    window.addEventListener('orientationchange', evaluate);
    return () => {
      window.removeEventListener('resize', evaluate);
      window.removeEventListener('orientationchange', evaluate);
    };
  }, []);

  if (!locked || (!isTouchDevice && desktopBypassed)) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t('rotateTitle')}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/92 px-6 text-center backdrop-blur-md"
      style={{
        backgroundImage:
          "linear-gradient(rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.94)), url('/assets/background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <img
        src="/assets/logo.png"
        alt="UnoChess"
        referrerPolicy="no-referrer"
        className="mb-6 h-20 w-auto drop-shadow-xl"
      />

      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-amber-400 bg-slate-900/90 shadow-2xl">
        <div className="animate-rotate-device flex items-center justify-center text-amber-300">
          <Smartphone className="h-12 w-12" strokeWidth={2.2} />
        </div>
      </div>

      <h2 className="font-display text-outline mb-3 text-2xl font-bold tracking-wide text-amber-300 sm:text-3xl">
        {t('rotateTitle')}
      </h2>

      <p className="max-w-md text-sm font-medium leading-relaxed text-slate-200 sm:text-base">
        {t('rotateDesc')}
      </p>

      <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-400 tabular-nums">
        <RotateCcw className="h-3.5 w-3.5" />
        <span>{t('currentRes', { w: dimensions.w, h: dimensions.h })}</span>
      </div>

      {!isTouchDevice && onDesktopBypass && (
        <button
          type="button"
          onClick={() => onDesktopBypass(true)}
          className="mt-7 min-h-[44px] rounded-xl border-2 border-amber-300/60 bg-slate-800/90 px-5 py-2.5 text-xs font-bold text-amber-200 shadow-lg transition hover:bg-slate-700 active:scale-95"
        >
          {t('desktopBypassBtn')}
        </button>
      )}
    </div>
  );
};

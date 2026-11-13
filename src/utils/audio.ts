// Procedural Web Audio API Music & Sound Effects Engine for UnoChess

class UnoChessAudio {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private musicVolume = 0.35;
  private sfxVolume = 0.7;
  private musicMuted = false;
  private sfxMuted = false;

  private musicPlaying = false;
  private musicTimer: number | null = null;
  private stepIndex = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private applyGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.musicMuted ? 0 : this.musicVolume * 0.28, now, 0.03);
    }
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxMuted ? 0 : this.sfxVolume * 0.5, now, 0.02);
    }
  }

  public unlock() {
    this.ensureContext();
  }

  public setMusicVolume(v: number) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.applyGains();
  }

  public setSfxVolume(v: number) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    this.applyGains();
  }

  public setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    this.applyGains();
  }

  public setSfxMuted(muted: boolean) {
    this.sfxMuted = muted;
    this.applyGains();
  }

  public getState() {
    return {
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      musicMuted: this.musicMuted,
      sfxMuted: this.sfxMuted,
      musicPlaying: this.musicPlaying,
    };
  }

  // Cheerful rhythmic casual card-game instrumental loop (118 BPM, 16th-note grid)
  public startMusic() {
    const ctx = this.ensureContext();
    if (!ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const stepMs = (60 / 118 / 2) * 1000; // Eighth-note pulse (~254ms)

    // Upbeat C-major / F-major / G-major casual groove
    const melody = [
      523.25, 0, 659.25, 783.99, 659.25, 0, 587.33, 659.25,
      523.25, 0, 587.33, 659.25, 783.99, 880.0, 783.99, 0,
      698.46, 0, 880.0, 783.99, 698.46, 659.25, 587.33, 0,
      659.25, 587.33, 523.25, 587.33, 659.25, 783.99, 523.25, 0,
    ];
    const bass = [
      130.81, 196.0, 130.81, 196.0, 146.83, 220.0, 146.83, 220.0,
      130.81, 196.0, 164.81, 196.0, 196.0, 246.94, 196.0, 146.83,
      174.61, 220.0, 174.61, 220.0, 146.83, 220.0, 196.0, 246.94,
      130.81, 196.0, 164.81, 196.0, 196.0, 146.83, 130.81, 196.0,
    ];

    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.ctx.state !== 'running' || this.musicMuted) {
        this.stepIndex = (this.stepIndex + 1) % melody.length;
        return;
      }
      const now = this.ctx.currentTime;
      const idx = this.stepIndex % melody.length;

      // Plucky marimba melody
      const melFreq = melody[idx];
      if (melFreq > 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(melFreq, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.22);
      }

      // Warm bouncy bassline
      const bassFreq = bass[idx];
      if (bassFreq > 0 && idx % 2 === 0) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(bassFreq, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.25);
      }

      // Light off-beat hi-hat click
      if (idx % 2 === 1) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(3400, now);
        g.gain.setValueAtTime(0.03, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.04);
      }

      this.stepIndex = (this.stepIndex + 1) % melody.length;
    }, stepMs);
  }

  public stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.4,
    delay = 0,
    slideTo?: number
  ) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.sfxMuted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    }
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  public playClick() {
    this.playTone(620, 0.06, 'triangle', 0.25, 0, 760);
  }

  public playShuffle() {
    for (let i = 0; i < 6; i++) {
      this.playTone(260 + i * 55, 0.055, 'triangle', 0.22, i * 0.045, 180 + i * 30);
    }
  }

  public playDraw() {
    this.playTone(340, 0.11, 'sine', 0.35, 0, 580);
    this.playTone(720, 0.14, 'triangle', 0.3, 0.09, 920);
  }

  public playMove() {
    this.playTone(310, 0.09, 'triangle', 0.4, 0, 210);
  }

  public playCapture() {
    this.playTone(220, 0.12, 'sawtooth', 0.35, 0, 110);
    this.playTone(540, 0.13, 'triangle', 0.3, 0.04, 780);
  }

  public playRotate() {
    this.playTone(280, 0.28, 'sine', 0.35, 0, 560);
    this.playTone(420, 0.32, 'triangle', 0.3, 0.12, 840);
  }

  public playCheck() {
    this.playTone(587.33, 0.12, 'square', 0.28, 0);
    this.playTone(880.0, 0.25, 'square', 0.3, 0.12);
  }

  public playCheckmate() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.28, 'triangle', 0.4, idx * 0.1);
    });
  }

  public playSpecial() {
    this.playTone(440, 0.11, 'triangle', 0.35, 0, 660);
    this.playTone(660, 0.14, 'triangle', 0.35, 0.09, 990);
  }
}

export const sound = new UnoChessAudio();

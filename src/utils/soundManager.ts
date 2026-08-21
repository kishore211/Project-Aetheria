// Zero-asset WebAudio sound effects, synthesized on the fly.

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainNode: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicOn = false;
  private mood: 'bright' | 'dark' = 'bright';
  private chordIndex = 0;
  private lastSpawnSound = 0;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.35;
  }

  /** True while a rain loop is running, so callers can avoid double-starting. */
  get isRainPlaying(): boolean {
    return this.rainNode !== null;
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume = 0.5, glideTo?: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  private noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noise(duration: number, filterFreq: number, volume = 0.5, glideFilterTo?: number): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx, duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
    if (glideFilterTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, glideFilterTo), ctx.currentTime + duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  uiClick(): void { this.tone(660, 0.07, 'square', 0.15, 880); }
  /**
   * Births can arrive in bursts once a world is thriving, so the birth blip is
   * rate limited — otherwise a boom turns into a swarm of beeps.
   */
  spawn(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastSpawnSound < 220) return;
    this.lastSpawnSound = now;
    this.tone(440, 0.15, 'triangle', 0.3, 880);
  }
  terraform(): void { this.noise(0.15, 900, 0.25, 300); }
  meteor(): void { this.noise(1.1, 300, 0.9, 40); this.tone(80, 1.0, 'sawtooth', 0.5, 25); }
  lightning(): void { this.noise(0.5, 5000, 0.7, 200); }
  fire(): void { this.noise(0.6, 1200, 0.4, 500); }
  earthquake(): void { this.noise(1.4, 150, 0.9, 30); }
  bless(): void { this.tone(523, 0.4, 'sine', 0.3, 1046); this.tone(659, 0.5, 'sine', 0.2, 1318); }
  curse(): void { this.tone(220, 0.7, 'sawtooth', 0.35, 55); }
  death(): void { this.tone(330, 0.25, 'triangle', 0.2, 110); }
  birth(): void { this.tone(784, 0.2, 'sine', 0.2, 1568); }
  /** A power was refused — a flat, unmistakable thunk. */
  refused(): void { this.tone(180, 0.12, 'square', 0.18, 120); }

  startRain(): void {
    if (this.muted || this.rainNode) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx, 2);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.6;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.12;
    source.connect(filter).connect(this.rainGain).connect(this.master);
    source.start();
    this.rainNode = source;
  }

  stopRain(): void {
    if (!this.rainNode) return;
    try { this.rainNode.stop(); } catch { /* already stopped */ }
    this.rainNode = null;
    this.rainGain = null;
  }

  // -- ambient score ------------------------------------------------------

  /**
   * A slow, generative pad. Two detuned sine voices per chord through a gentle
   * low-pass, one chord every few seconds. No files, no loop points, and it
   * drifts by season: bright intervals in spring and summer, darker ones when
   * the world turns cold.
   */
  startMusic(): void {
    if (this.musicTimer !== null) return;
    this.musicOn = true;
    const playNext = () => {
      if (!this.musicOn) return;
      this.playPad();
    };
    playNext();
    this.musicTimer = window.setInterval(playNext, 7200);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  get isMusicOn(): boolean {
    return this.musicOn;
  }

  /** Called by the engine so the score follows the seasons. */
  setMusicMood(mood: 'bright' | 'dark'): void {
    this.mood = mood;
  }

  private playPad(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const roots = [110, 123.47, 146.83, 164.81, 98];
    const root = roots[this.chordIndex % roots.length];
    this.chordIndex++;

    // Major-ish in bright moods, minor with a flat sixth when it is bleak
    const intervals = this.mood === 'bright' ? [1, 1.5, 2, 2.5] : [1, 1.2, 1.5, 1.8];

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.mood === 'bright' ? 900 : 620;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.linearRampToValueAtTime(0.075, ctx.currentTime + 2.4);
    bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 7.0);
    filter.connect(bus).connect(this.master);

    for (const interval of intervals) {
      for (const detune of [-3, 3]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = root * interval;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start();
        osc.stop(ctx.currentTime + 7.2);
      }
    }
  }
}

export const soundManager = new SoundManager();

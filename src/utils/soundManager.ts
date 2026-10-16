// Zero-asset WebAudio sound effects, synthesized on the fly.

import { random } from './random';

/** Terraforming materials that have their own voice. */
export type TerraformVoice =
  | 'sand' | 'soil' | 'forest' | 'stone' | 'water';

interface VoiceSpec {
  duration: number;
  /** Filter cutoff at the start of the sound. */
  from: number;
  /** Filter cutoff it glides to. */
  to: number;
  volume: number;
}

/**
 * One noise voice per material.
 *
 * Sand is a dry high hiss, forest a mid rustle, stone a low crunch, water a
 * dull slap that closes fast. The point is not realism — it is that painting
 * across a coastline should audibly change under the brush.
 */
const TERRAFORM_VOICES: Record<TerraformVoice, VoiceSpec> = {
  sand: { duration: 0.14, from: 2600, to: 900, volume: 0.2 },
  soil: { duration: 0.15, from: 900, to: 300, volume: 0.25 },
  forest: { duration: 0.22, from: 1600, to: 600, volume: 0.22 },
  stone: { duration: 0.18, from: 420, to: 130, volume: 0.3 },
  water: { duration: 0.2, from: 700, to: 160, volume: 0.28 },
};

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
  /** Round-robin cursor per sound name, so repeats never land identically. */
  private variantCursor = new Map<string, number>();
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

  /**
   * Nudge a sound off its centre so a repeat is never identical.
   *
   * WorldBox ships 1,432 one-shots against 4 loops, and round-robins every
   * repeated action from a pool of 6-20 variants — 20 just for placing TNT
   * (09-WORLDBOX-VISUAL-RESEARCH.md §8). We cannot ship 1,432 files and are
   * not going to, so the equivalent for a synthesiser is to detune and retime
   * each firing.
   *
   * Round-robin rather than random: random collides with itself audibly (two
   * identical pitches in a row happen one time in `count`), while a cursor
   * guarantees the whole pool is heard before anything repeats.
   *
   * Returned as a multiplier so callers apply it to whichever of frequency,
   * duration and volume actually matters for that sound.
   */
  private variant(name: string, count = 8, spread = 0.06): number {
    const at = (this.variantCursor.get(name) ?? 0) % count;
    this.variantCursor.set(name, at + 1);
    // Map 0..count-1 onto a symmetric range around 1, so the pool is centred
    // on the sound as originally tuned rather than drifting sharp or flat.
    const offset = count === 1 ? 0 : (at / (count - 1)) * 2 - 1;
    return 1 + offset * spread;
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
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
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
    const v = this.variant('spawn', 12, 0.1);
    this.tone(440 * v, 0.15, 'triangle', 0.3, 880 * v);
  }

  /**
   * Terraforming, with a voice per material.
   *
   * WorldBox emits a different sound for sand, soil, forest, hills, mountains
   * and deep-ocean fill rather than one generic click, and the effect is that
   * the map starts to sound like a place. The frequency bands here are chosen
   * to match: sand is a dry hiss, stone is a low crunch, water is a dull slap.
   */
  terraform(material: TerraformVoice = 'soil'): void {
    const voice = TERRAFORM_VOICES[material] ?? TERRAFORM_VOICES.soil;
    const v = this.variant(`terraform:${material}`, 10, 0.14);
    this.noise(
      voice.duration * v, voice.from * v, voice.volume, voice.to * v,
    );
  }

  meteor(): void {
    const v = this.variant('meteor', 6, 0.09);
    this.noise(1.1 * v, 300 * v, 0.9, 40);
    this.tone(80 * v, 1.0, 'sawtooth', 0.5, 25);
  }
  lightning(): void {
    const v = this.variant('lightning', 8, 0.13);
    this.noise(0.5 * v, 5000 * v, 0.7, 200);
  }
  fire(): void {
    const v = this.variant('fire', 8, 0.12);
    this.noise(0.6 * v, 1200 * v, 0.4, 500);
  }
  earthquake(): void {
    const v = this.variant('earthquake', 6, 0.08);
    this.noise(1.4 * v, 150 * v, 0.9, 30);
  }
  bless(): void {
    const v = this.variant('bless', 8, 0.05);
    this.tone(523 * v, 0.4, 'sine', 0.3, 1046 * v);
    this.tone(659 * v, 0.5, 'sine', 0.2, 1318 * v);
  }
  curse(): void {
    const v = this.variant('curse', 8, 0.07);
    this.tone(220 * v, 0.7, 'sawtooth', 0.35, 55);
  }
  death(): void {
    const v = this.variant('death', 10, 0.1);
    this.tone(330 * v, 0.25, 'triangle', 0.2, 110);
  }
  birth(): void {
    const v = this.variant('birth', 10, 0.08);
    this.tone(784 * v, 0.2, 'sine', 0.2, 1568 * v);
  }
  /** A power was refused — a flat, unmistakable thunk, and always the same. */
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

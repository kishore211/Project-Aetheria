// Zero-asset WebAudio sound effects, synthesized on the fly.

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainNode: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
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
  spawn(): void { this.tone(440, 0.15, 'triangle', 0.3, 880); }
  terraform(): void { this.noise(0.15, 900, 0.25, 300); }
  meteor(): void { this.noise(1.1, 300, 0.9, 40); this.tone(80, 1.0, 'sawtooth', 0.5, 25); }
  lightning(): void { this.noise(0.5, 5000, 0.7, 200); }
  fire(): void { this.noise(0.6, 1200, 0.4, 500); }
  earthquake(): void { this.noise(1.4, 150, 0.9, 30); }
  bless(): void { this.tone(523, 0.4, 'sine', 0.3, 1046); this.tone(659, 0.5, 'sine', 0.2, 1318); }
  curse(): void { this.tone(220, 0.7, 'sawtooth', 0.35, 55); }
  death(): void { this.tone(330, 0.25, 'triangle', 0.2, 110); }
  birth(): void { this.tone(784, 0.2, 'sine', 0.2, 1568); }

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
}

export const soundManager = new SoundManager();

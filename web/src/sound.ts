export class Sound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  private audio(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      const len = Math.floor(this.ctx.sampleRate * 0.03);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  key(space = false) {
    const ctx = this.audio();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = space ? 0.65 : 0.9 + Math.random() * 0.25;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = space ? 900 : 2400 + Math.random() * 600;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(space ? 0.22 : 0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    const tick = ctx.createOscillator();
    tick.type = 'sine';
    tick.frequency.value = space ? 420 : 1600 + Math.random() * 300;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.03, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    tick.connect(tg).connect(ctx.destination);
    tick.start(t);
    tick.stop(t + 0.035);
  }

  error() {
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.12);
  }

  chime(big = false) {
    const ctx = this.audio();
    if (!ctx) return;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.085;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.5);
    });
  }
}

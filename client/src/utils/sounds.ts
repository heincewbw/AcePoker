class SoundManager {
  private ctx: AudioContext | null = null;
  private _enabled = true;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  get enabled() { return this._enabled; }

  toggle() {
    this._enabled = !this._enabled;
    return this._enabled;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.3,
    startDelay = 0,
  ) {
    if (!this._enabled) return;
    try {
      const ctx = this.getCtx();
      const t = ctx.currentTime + startDelay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.start(t);
      osc.stop(t + duration + 0.01);
    } catch { /* ignore */ }
  }

  private noise(duration: number, volume = 0.15, highpass = 1000, startDelay = 0) {
    if (!this._enabled) return;
    try {
      const ctx = this.getCtx();
      const t = ctx.currentTime + startDelay;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(t);
    } catch { /* ignore */ }
  }

  /** Card whoosh + soft landing thud */
  dealCard() {
    this.noise(0.08, 0.18, 2200);
    this.tone(110, 0.09, 'sine', 0.12, 0.06);
  }

  /** Metallic chip clink */
  chipPlace() {
    this.tone(980, 0.1, 'sine', 0.1);
    this.tone(1450, 0.07, 'sine', 0.07, 0.022);
    this.noise(0.04, 0.06, 3200, 0.01);
  }

  /** Multiple chips sliding */
  chipSlide() {
    for (let i = 0; i < 3; i++) {
      const d = i * 0.04;
      this.tone(680 + i * 180, 0.1, 'sine', 0.07, d);
      this.noise(0.04, 0.04, 2500, d + 0.02);
    }
  }

  /** Fold: dull thud / card swish */
  fold() {
    this.noise(0.15, 0.22, 350);
    this.tone(140, 0.18, 'triangle', 0.1, 0.05);
  }

  /** Check: soft double tap */
  check() {
    this.tone(480, 0.07, 'square', 0.06);
    this.tone(680, 0.05, 'square', 0.04, 0.09);
  }

  /** Call: chips sliding to pot */
  call() {
    this.chipSlide();
  }

  /** Raise: ascending chip sounds */
  raise() {
    [380, 520, 680, 880].forEach((f, i) => {
      this.tone(f, 0.12, 'sine', 0.09, i * 0.055);
    });
  }

  /** All-in: dramatic low chord */
  allIn() {
    [180, 240, 320, 420, 540].forEach((f, i) => {
      this.tone(f, 0.6, 'sawtooth', 0.055, i * 0.03);
    });
    this.noise(0.4, 0.12, 600, 0.1);
  }

  /** Win: ascending fanfare */
  win() {
    const melody = [523, 659, 784, 1047, 784, 1047];
    melody.forEach((f, i) => {
      this.tone(f, 0.35, 'sine', 0.18, i * 0.13);
    });
  }

  /** Turn start: bell ding for current player */
  turnStart() {
    this.tone(880, 0.35, 'sine', 0.14);
    this.tone(1100, 0.25, 'sine', 0.09, 0.08);
  }

  /** Normal timer tick */
  tick() {
    this.tone(440, 0.04, 'square', 0.04);
  }

  /** Urgent timer tick (<10s) */
  urgentTick() {
    this.tone(660, 0.05, 'square', 0.07);
  }

  /** Flop reveal: 3-tone reveal */
  revealFlop() {
    [640, 740, 860].forEach((f, i) => {
      this.tone(f, 0.25, 'sine', 0.11, i * 0.1);
    });
  }

  /** Turn/River single card reveal */
  revealCard() {
    this.tone(720, 0.2, 'sine', 0.1);
    this.tone(900, 0.14, 'sine', 0.07, 0.08);
  }
}

export const soundManager = new SoundManager();

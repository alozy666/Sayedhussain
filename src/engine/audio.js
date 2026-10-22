// مؤثرات صوتية مولّدة برمجيًا عبر Web Audio (لا توجد ملفات صوت يمكن أن تكون مفقودة).
import { readJSON, writeJSON } from '../app/storage.js';

const PREF_KEY = 'ali-explorer-sound';

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = readJSON('local', PREF_KEY, true) !== false;
    this.loops = new Set();
    this.lastHover = 0;
    this.ambienceTimer = null;
  }

  /** يُستدعى بعد أول تفاعل من المستخدم (سياسة المتصفحات للصوت). */
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.85 : 0;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
          // ضجيج وردي تقريبي (أنعم من الأبيض)
          const w = Math.random() * 2 - 1;
          last = (last + 0.04 * w) / 1.04;
          d[i] = w * 0.35 + last * 3;
        }
        this.startAmbience();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  setEnabled(v) {
    this.enabled = v;
    writeJSON('local', PREF_KEY, v);
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.85 : 0, this.ctx.currentTime, 0.05);
    if (!v) this.stopLoops();
  }

  get t() {
    return this.ctx.currentTime;
  }

  ok() {
    return this.enabled && this.ensure();
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, attack = 0.01, freqEnd = null, delay = 0, dest = null } = {}) {
    const ctx = this.ctx;
    const t0 = this.t + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest ?? this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  noise(dur, { filter = 'lowpass', freq = 800, q = 0.7, vol = 0.2, attack = 0.02, release = 0.2, delay = 0, freqEnd = null } = {}) {
    const ctx = this.ctx;
    const t0 = this.t + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.setValueAtTime(vol, Math.max(t0 + attack, t0 + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    return { src, gain: g };
  }

  track(loop) {
    this.loops.add(loop);
    return loop;
  }

  stopLoops() {
    for (const l of this.loops) {
      try {
        l.stop();
      } catch {
        /* تجاهل */
      }
    }
    this.loops.clear();
  }

  /** حلقة أصوات متقطعة (فقاعات، حصى...) حتى انتهاء المدة. */
  sprinkle(dur, fn, minGap, maxGap) {
    let stopped = false;
    let timer = null;
    const end = performance.now() + dur * 1000;
    const step = () => {
      if (stopped || performance.now() > end || !this.enabled) return;
      fn();
      timer = setTimeout(step, (minGap + Math.random() * (maxGap - minGap)) * 1000);
    };
    step();
    return this.track({
      stop: () => {
        stopped = true;
        clearTimeout(timer);
      },
    });
  }

  sustained(nodes) {
    return this.track({
      stop: () => {
        for (const n of nodes) {
          try {
            n.gain?.gain.cancelScheduledValues(this.t);
            n.gain?.gain.setTargetAtTime(0.0001, this.t, 0.08);
            n.src?.stop(this.t + 0.4);
          } catch {
            /* تجاهل */
          }
        }
      },
    });
  }

  play(name, dur = 1) {
    if (!this.ok()) return;
    switch (name) {
      case 'rumble':
      case 'rumbleSoft': {
        const soft = name === 'rumbleSoft';
        const n = this.noise(dur, { freq: 130, vol: soft ? 0.35 : 0.7, attack: 0.4, release: 0.9 });
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 7;
        lg.gain.value = soft ? 0.1 : 0.25;
        lfo.connect(lg);
        lg.connect(n.gain.gain);
        lfo.start();
        lfo.stop(this.t + dur);
        this.tone(48, dur, { vol: soft ? 0.12 : 0.25, attack: 0.4 });
        this.sustained([n]);
        break;
      }
      case 'crack':
        this.noise(0.18, { filter: 'highpass', freq: 1400, vol: 0.32, attack: 0.005, release: 0.12 });
        this.tone(190, 0.18, { type: 'triangle', vol: 0.18, freqEnd: 70, attack: 0.005 });
        break;
      case 'crumble':
        for (let i = 0; i < 7; i++) {
          this.noise(0.07, { filter: 'bandpass', freq: 900 + Math.random() * 1400, q: 2, vol: 0.2, attack: 0.004, release: 0.05, delay: i * 0.09 + Math.random() * 0.05 });
        }
        break;
      case 'pebbles':
        this.sprinkle(
          dur,
          () => this.tone(1400 + Math.random() * 900, 0.05, { type: 'triangle', vol: 0.05, attack: 0.003 }),
          0.08,
          0.25
        );
        break;
      case 'bubbles':
        this.sprinkle(
          dur,
          () => this.tone(170 + Math.random() * 80, 0.16, { vol: 0.16, freqEnd: 70, attack: 0.01 }),
          0.28,
          0.6
        );
        break;
      case 'hiss':
        this.noise(1.6, { filter: 'highpass', freq: 2800, vol: 0.06, attack: 0.3, release: 0.9 });
        break;
      case 'water': {
        const a = this.noise(dur, { filter: 'bandpass', freq: 900, q: 0.5, vol: 0.13, attack: 0.8, release: 1 });
        const b = this.noise(dur, { filter: 'bandpass', freq: 2600, q: 1.2, vol: 0.05, attack: 1, release: 1 });
        this.sustained([a, b]);
        break;
      }
      case 'engine': {
        const ctx = this.ctx;
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o1.type = 'sawtooth';
        o2.type = 'square';
        o1.frequency.value = 52;
        o2.frequency.value = 78;
        f.type = 'lowpass';
        f.frequency.value = 260;
        g.gain.setValueAtTime(0.0001, this.t);
        g.gain.exponentialRampToValueAtTime(0.09, this.t + 0.5);
        g.gain.setValueAtTime(0.09, this.t + dur - 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 11;
        lg.gain.value = 0.03;
        lfo.connect(lg);
        lg.connect(g.gain);
        o1.connect(f);
        o2.connect(f);
        f.connect(g);
        g.connect(this.master);
        for (const o of [o1, o2, lfo]) {
          o.start();
          o.stop(this.t + dur + 0.1);
        }
        this.sustained([{ gain: g, src: o1 }, { src: o2 }, { src: lfo }]);
        break;
      }
      case 'scoop':
        this.noise(0.35, { freq: 600, vol: 0.28, attack: 0.02, release: 0.2 });
        this.tone(95, 0.25, { vol: 0.18, freqEnd: 50 });
        break;
      case 'dump':
        this.noise(0.7, { filter: 'bandpass', freq: 500, q: 0.6, vol: 0.25, attack: 0.05, release: 0.4 });
        break;
      case 'build':
        this.noise(1.2, { freq: 380, vol: 0.12, attack: 0.2, release: 0.5 });
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.1, delay: 1.2 + i * 0.1 }));
        break;
      default:
        break;
    }
  }

  click() {
    if (!this.ok()) return;
    this.tone(660, 0.08, { vol: 0.12, freqEnd: 990, attack: 0.005 });
  }

  hover() {
    if (!this.ok()) return;
    const now = performance.now();
    if (now - this.lastHover < 120) return;
    this.lastHover = now;
    this.tone(1250, 0.04, { vol: 0.025, attack: 0.004 });
  }

  correct() {
    if (!this.ok()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.16, delay: i * 0.09 }));
  }

  wrong() {
    if (!this.ok()) return;
    this.tone(392, 0.2, { vol: 0.12 });
    this.tone(330, 0.3, { vol: 0.12, delay: 0.18 });
  }

  celebrate() {
    if (!this.ok()) return;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.15, delay: i * 0.1 }));
    for (let i = 0; i < 10; i++) this.tone(1800 + Math.random() * 1600, 0.12, { vol: 0.04, delay: 0.7 + i * 0.07 });
  }

  star(i) {
    if (!this.ok()) return;
    this.tone(700 + i * 110, 0.18, { type: 'triangle', vol: 0.12 });
  }

  whoosh() {
    if (!this.ok()) return;
    this.noise(0.6, { filter: 'bandpass', freq: 400, freqEnd: 1800, q: 1.2, vol: 0.07, attack: 0.15, release: 0.3 });
  }

  pop() {
    if (!this.ok()) return;
    this.tone(500, 0.1, { vol: 0.1, freqEnd: 900 });
  }

  /** أصوات الطبيعة الهادئة: عصافير بين حين وآخر. */
  startAmbience() {
    const chirp = () => {
      if (this.enabled && this.ctx && document.visibilityState === 'visible') {
        const base = 2400 + Math.random() * 900;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(base, 0.09, { vol: 0.025, freqEnd: base * 1.3, delay: i * 0.13 });
      }
      this.ambienceTimer = setTimeout(chirp, 3500 + Math.random() * 5000);
    };
    this.ambienceTimer = setTimeout(chirp, 2500);
  }
}

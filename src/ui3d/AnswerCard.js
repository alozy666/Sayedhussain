import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../world/palette.js';
import { uiMat } from '../world/materials.js';
import { createCanvas, getCtx, canvasTexture, roundRect, drawText, drawIcon } from './textCanvas.js';
import { onTick, animate, wait } from '../engine/ticker.js';
import { damp, ease } from '../engine/mathx.js';
import { services } from '../engine/services.js';

const PX = 190;

const FRAME = {
  idle: '#cfe8f6',
  hover: PALETTE.skyBlue,
  correct: PALETTE.green,
  wrong: '#f2a04f',
  reveal: PALETTE.green,
  dim: '#d6dbe0',
};

/**
 * بطاقة إجابة مصورة ثلاثية الأبعاد (صورة + نص + حرف الخيار).
 * الحالات: idle | correct | wrong | reveal | dim
 */
export class AnswerCard extends THREE.Group {
  constructor({ id, width = 3.3, height = 3.9, onClick = null }) {
    super();
    this.name = `card:${id}`;
    this.cardId = id;
    this.widthU = width;
    this.heightU = height;
    this.onClick = onClick;
    this.state = 'idle';
    this.interactive = false;
    this.hovered = false;
    this.lift = 0;
    this.shake = 0;
    this.showScale = 0;
    this.content = { letter: '', text: '', image: null };
    this.visible = false;
    this.bobSeed = Math.random() * 10;

    this.inner = new THREE.Group();
    this.add(this.inner);

    this.frameMat = new THREE.MeshStandardMaterial({ color: FRAME.idle, roughness: 0.55 });
    this.frame = new THREE.Mesh(new RoundedBoxGeometry(width + 0.26, height + 0.26, 0.24, 3, 0.32), this.frameMat);
    this.frame.castShadow = true;
    this.inner.add(this.frame);

    this.canvas = createCanvas(width * PX, height * PX);
    this.texture = canvasTexture(this.canvas);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), uiMat(this.texture));
    this.face.position.z = 0.125;
    this.inner.add(this.face);

    services.interaction?.add(this.frame, {
      id: `card-${id}`,
      onClick: () => {
        if (this.interactive) this.onClick?.();
      },
      onHover: (v) => {
        this.hovered = v;
        if (v && this.interactive) services.audio?.hover();
        this.updateFrame();
      },
      enabled: () => this.interactive && this.showScale > 0.8,
    });

    this._off = onTick((dt, t) => this.tick(dt, t));
  }

  setContent({ letter, text, image = null }) {
    this.content = { letter, text, image };
    this.state = 'idle';
    this.redraw();
    this.updateFrame();
  }

  setState(state) {
    this.state = state;
    if (state === 'wrong') this.shake = 1;
    this.redraw();
    this.updateFrame();
  }

  setInteractive(v) {
    this.interactive = v;
    this.updateFrame();
  }

  updateFrame() {
    const key = this.state === 'idle' && this.hovered && this.interactive ? 'hover' : this.state;
    this.frameMat.color.set(FRAME[key] ?? FRAME.idle);
    this.frameMat.emissive.set(key === 'correct' || key === 'reveal' ? '#1b6b42' : '#000000');
    this.frameMat.emissiveIntensity = key === 'correct' || key === 'reveal' ? 0.35 : 0;
  }

  redraw() {
    const ctx = getCtx(this.canvas);
    const W = this.canvas.width;
    const H = this.canvas.height;
    const { letter, text, image } = this.content;
    ctx.clearRect(0, 0, W, H);

    const bg = {
      idle: ['#ffffff', PALETTE.cream],
      correct: ['#f2fff7', '#d5f5e2'],
      reveal: ['#f2fff7', '#d5f5e2'],
      wrong: ['#fffaf3', '#fde6cf'],
      dim: ['#f7f7f7', '#e9eaec'],
    }[this.state] ?? ['#ffffff', PALETTE.cream];
    roundRect(ctx, 0, 0, W, H, 54);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[1]);
    ctx.fillStyle = g;
    ctx.fill();

    const pad = 30;
    if (image) {
      const iw = W - pad * 2;
      const ih = Math.round(iw * 0.72);
      ctx.save();
      roundRect(ctx, pad, pad, iw, ih, 36);
      ctx.clip();
      // ملاءمة الصورة (cover)
      const s = Math.max(iw / image.width, ih / image.height);
      const dw = image.width * s;
      const dh = image.height * s;
      ctx.globalAlpha = this.state === 'dim' ? 0.55 : 1;
      ctx.drawImage(image, pad + (iw - dw) / 2, pad + (ih - dh) / 2, dw, dh);
      ctx.restore();
      roundRect(ctx, pad, pad, iw, ih, 36);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(31,59,99,0.12)';
      ctx.stroke();
      drawText(ctx, text, W / 2, pad + ih + (H - pad - ih) / 2, {
        size: 52,
        weight: 700,
        color: this.state === 'dim' ? '#8a96a6' : PALETTE.navy,
        maxWidth: W - pad * 2.4,
        lineHeight: 1.35,
      });
    } else {
      drawText(ctx, text, W / 2, H / 2 + 20, {
        size: 92,
        weight: 800,
        color: this.state === 'dim' ? '#8a96a6' : PALETTE.navy,
        maxWidth: W - pad * 2.4,
        lineHeight: 1.3,
      });
    }

    // حرف الخيار في أعلى اليمين
    if (letter) {
      const bx = W - 64;
      const by = 64;
      ctx.beginPath();
      ctx.arc(bx, by, 46, 0, Math.PI * 2);
      ctx.fillStyle = this.state === 'dim' ? '#9aa6b5' : PALETTE.navy;
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      drawText(ctx, letter, bx, by + 2, { size: 56, weight: 800, color: '#ffffff', maxWidth: 120 });
    }

    // شارة التصحيح في أعلى اليسار
    if (this.state === 'correct' || this.state === 'reveal') {
      this.badge(ctx, 70, 70, PALETTE.green, 'check');
    } else if (this.state === 'wrong') {
      this.badge(ctx, 70, 70, '#f2a04f', 'cross');
    }
    this.texture.needsUpdate = true;
  }

  badge(ctx, x, y, color, icon) {
    ctx.beginPath();
    ctx.arc(x, y, 54, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    drawIcon(ctx, icon, x, y, 76, '#ffffff');
  }

  show(delay = 0) {
    this._anim?.cancel();
    this.visible = true;
    this.showScale = 0;
    const token = (this._showToken = (this._showToken ?? 0) + 1);
    const run = () => {
      if (token !== this._showToken || !this.visible) return;
      this._anim = animate(0.5, (p) => (this.showScale = ease.outBack(p)));
    };
    if (delay) wait(delay).then(run);
    else run();
  }

  hide() {
    this._showToken = (this._showToken ?? 0) + 1;
    this._anim?.cancel();
    const from = this.showScale;
    this.interactive = false;
    this._anim = animate(0.25, (p) => {
      this.showScale = from * (1 - p);
      if (p >= 1) this.visible = false;
    });
  }

  tick(dt, t) {
    if (!this.visible) return;
    const wantLift = this.hovered && this.interactive ? 1 : this.state === 'correct' || this.state === 'reveal' ? 0.6 : 0;
    this.lift = damp(this.lift, wantLift, 12, dt);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const bob = Math.sin(t * 1.6 + this.bobSeed) * 0.06;
    this.inner.position.set(Math.sin(t * 38) * this.shake * 0.12, bob + this.lift * 0.15, this.lift * 0.35);
    this.inner.rotation.z = Math.sin(t * 30) * this.shake * 0.04;
    const pulse = this.state === 'reveal' ? 1 + Math.sin(t * 5) * 0.02 : 1;
    const s = this.showScale * (1 + this.lift * 0.05) * pulse;
    this.inner.scale.setScalar(Math.max(0.001, s));
  }
}

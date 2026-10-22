import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../world/palette.js';
import { uiMat } from '../world/materials.js';
import { createCanvas, getCtx, canvasTexture, drawText, drawIcon, font, measure } from './textCanvas.js';
import { onTick, animate, wait } from '../engine/ticker.js';
import { ease, damp } from '../engine/mathx.js';
import { services } from '../engine/services.js';

const PX = 200; // بكسل لكل وحدة

/**
 * زر ثلاثي الأبعاد على شكل حبة ناعمة، يعمل بالماوس ووحدات تحكم VR.
 */
export class Button3D extends THREE.Group {
  constructor({
    id,
    label,
    icon = null,
    iconSide = 'start',
    width = null,
    height = 0.95,
    color = PALETTE.orange,
    textColor = '#ffffff',
    fontSize = 0.42,
    onClick = null,
    baseScale = 0.74,
  }) {
    super();
    this.name = `btn:${id}`;
    this.btnId = id;
    this.label = label;
    this.icon = icon;
    this.iconSide = iconSide;
    this.heightU = height;
    this.color = new THREE.Color(color);
    this.textColor = textColor;
    this.fontSize = fontSize;
    this.onClick = onClick;
    this.baseScale = baseScale;
    this.enabledFlag = true;
    this.hovered = false;
    this.attention = false;
    this.targetScale = 1;
    this.showScale = 1;
    this.press = 0;

    // نحسب العرض من طول النص إن لم يُحدد
    const probe = getCtx(createCanvas(4, 4));
    probe.font = font(Math.round(fontSize * PX), 800);
    const textW = measure(probe, label) / PX;
    this.widthU = width ?? Math.max(2.2, textW + (icon ? 1.5 : 0.9));

    const w = this.widthU;
    const h = height;
    this.material = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.55, metalness: 0 });
    this.body = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.34, 3, h * 0.48), this.material);
    this.body.castShadow = true;
    this.add(this.body);

    const baseColor = this.color.clone().multiplyScalar(0.72);
    this.base = new THREE.Mesh(
      new RoundedBoxGeometry(w + 0.1, h + 0.1, 0.24, 3, (h + 0.1) * 0.48),
      new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.7 })
    );
    this.base.position.set(0, -0.06, -0.12);
    this.add(this.base);

    this.canvas = createCanvas(w * PX, h * PX);
    this.texture = canvasTexture(this.canvas);
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), uiMat(this.texture));
    this.face.position.z = 0.18;
    this.add(this.face);
    this.redraw();

    this.handler = {
      id,
      onClick: () => this.click(),
      onHover: (v) => {
        this.hovered = v;
        if (v) services.audio?.hover();
      },
      enabled: () => this.enabledFlag && this.showScale > 0.6,
    };
    services.interaction?.add(this.body, this.handler);

    this._off = onTick((dt, t) => this.tick(dt, t));
  }

  redraw() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = getCtx(this.canvas);
    ctx.clearRect(0, 0, W, H);
    const size = Math.round(this.fontSize * PX);
    const iconSize = H * 0.5;
    ctx.font = font(size, 800);
    const tw = measure(ctx, this.label);
    const gap = this.icon ? iconSize * 0.95 : 0;
    const total = tw + gap;
    // في العربية: البداية على اليمين
    const startX = W / 2 + total / 2;
    let textCenter = W / 2;
    if (this.icon) {
      const iconX = this.iconSide === 'start' ? startX - iconSize * 0.4 : W / 2 - total / 2 + iconSize * 0.4;
      textCenter = this.iconSide === 'start' ? startX - gap - tw / 2 : W / 2 - total / 2 + gap + tw / 2;
      drawIcon(ctx, this.icon, iconX, H / 2, iconSize, this.textColor);
    }
    drawText(ctx, this.label, textCenter, H / 2 + size * 0.04, {
      size,
      weight: 800,
      color: this.textColor,
      maxWidth: W * 2,
      stroke: 'rgba(0,0,0,0.12)',
      strokeWidth: size * 0.12,
    });
    this.texture.needsUpdate = true;
  }

  setLabel(label, icon = this.icon) {
    if (label === this.label && icon === this.icon) return;
    this.label = label;
    this.icon = icon;
    this.redraw();
  }

  setEnabled(v) {
    this.enabledFlag = v;
    this.material.color.copy(v ? this.color : new THREE.Color(PALETTE.grey));
  }

  setAttention(v) {
    this.attention = v;
  }

  click() {
    if (!this.enabledFlag) return;
    services.audio?.click();
    this.press = 1;
    this.onClick?.();
  }

  show(delay = 0) {
    if (this.visible && this.showScale > 0.99 && !this._hiding) return;
    this._anim?.cancel();
    this._hiding = false;
    this.visible = true;
    this.showScale = 0;
    const token = (this._showToken = (this._showToken ?? 0) + 1);
    const run = () => {
      if (token !== this._showToken || !this.visible) return;
      this._anim = animate(0.45, (p) => (this.showScale = ease.outBack(p)));
    };
    if (delay > 0) wait(delay).then(run);
    else run();
  }

  hide(instant = false) {
    this._showToken = (this._showToken ?? 0) + 1;
    this._anim?.cancel();
    if (instant || !this.visible) {
      this.visible = false;
      this.showScale = 0;
      return;
    }
    this._hiding = true;
    const from = this.showScale;
    this._anim = animate(0.25, (p) => {
      this.showScale = from * (1 - p);
      if (p >= 1) {
        this.visible = false;
        this._hiding = false;
      }
    });
  }

  tick(dt, t) {
    if (!this.visible) return;
    const hoverScale = this.hovered && this.enabledFlag ? 1.08 : 1;
    const pulse = this.attention && this.enabledFlag && !this.hovered ? 1 + Math.sin(t * 4.2) * 0.035 : 1;
    this.targetScale = damp(this.targetScale, hoverScale * pulse, 14, dt);
    this.press = Math.max(0, this.press - dt * 5);
    const s = this.targetScale * this.showScale * this.baseScale;
    this.scale.set(s, s * (1 - this.press * 0.08), s);
    this.material.emissive.setRGB(1, 1, 1).multiplyScalar(this.hovered && this.enabledFlag ? 0.12 : 0);
  }

  dispose() {
    this._off?.();
    services.interaction?.remove(this.body);
  }
}

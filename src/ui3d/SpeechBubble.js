import * as THREE from 'three';
import { PALETTE } from '../world/palette.js';
import { uiMat } from '../world/materials.js';
import { createCanvas, getCtx, canvasTexture, measureBlock, drawText, roundRect, drawIcon } from './textCanvas.js';
import { animate } from '../engine/ticker.js';
import { ease } from '../engine/mathx.js';
import { services } from '../engine/services.js';

const PX = 190; // بكسل لكل وحدة
const FONT = 60;
const PAD = 46;
const TAIL = 56;

/**
 * فقاعة كلام المستكشف علي: لوحة تواجه الكاميرا دائمًا وتتبع رأسه.
 * side: 'left' تعني أن الفقاعة تظهر على يسار علي في الشاشة.
 */
export class SpeechBubble extends THREE.Group {
  constructor() {
    super();
    this.name = 'speechBubble';
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), uiMat(null, { depthTest: true }));
    this.mesh.renderOrder = 10;
    this.add(this.mesh);
    this.visible = false;
    this.scaleAnim = 0;
    this.text = '';
    this.side = 'left';
    this.anchor = new THREE.Vector3();

    // منطقة النقر على أيقونة السماعة لإعادة الاستماع
    this.speakerHit = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 20),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    this.speakerHit.position.z = 0.02;
    this.add(this.speakerHit);
    services.interaction?.add(this.speakerHit, {
      id: 'bubble-speaker',
      onClick: () => services.speech?.speak(this.text, true),
      enabled: () => this.visible && !!services.speech?.available && this.scaleAnim > 0.8,
    });
  }

  say(text, { side = 'left', maxWidthU = 6.2 } = {}) {
    this.text = text;
    this.side = side;
    const probe = getCtx(createCanvas(4, 4));
    const maxW = maxWidthU * PX - PAD * 2;
    const block = measureBlock(probe, text, { size: FONT, weight: 700, maxWidth: maxW, lineHeight: 1.45 });
    const speakerSpace = services.speech?.available ? 70 : 0;
    const W = Math.ceil(Math.max(block.width, 260) + PAD * 2 + speakerSpace);
    const H = Math.ceil(block.height + PAD * 2 + TAIL);
    const canvas = createCanvas(W, H);
    const ctx = getCtx(canvas);
    const bodyH = H - TAIL;

    // ظل خفيف
    ctx.save();
    ctx.shadowColor = 'rgba(31,59,99,0.22)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    roundRect(ctx, 10, 8, W - 20, bodyH - 18, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // الذيل يشير إلى علي
    const tailX = side === 'left' ? W - 120 : side === 'right' ? 120 : W / 2;
    ctx.beginPath();
    ctx.moveTo(tailX - 34, bodyH - 14);
    ctx.lineTo(tailX + (side === 'left' ? 30 : side === 'right' ? -30 : 0), H - 4);
    ctx.lineTo(tailX + 34, bodyH - 14);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    roundRect(ctx, 10, 8, W - 20, bodyH - 18, 48);
    ctx.lineWidth = 7;
    ctx.strokeStyle = PALETTE.mint;
    ctx.stroke();
    // إخفاء خط الحدود عند قاعدة الذيل
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tailX - 30, bodyH - 20, 60, 12);

    drawText(ctx, text, (W - speakerSpace) / 2 + speakerSpace, (bodyH - 10) / 2 + 4, {
      size: FONT,
      weight: 700,
      color: PALETTE.navy,
      maxWidth: maxW + 4,
      lineHeight: 1.45,
    });

    if (speakerSpace) {
      ctx.beginPath();
      ctx.arc(58, 58, 34, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.greenSoft;
      ctx.fill();
      drawIcon(ctx, 'speaker', 58, 58, 46, PALETTE.mintDark);
    }

    const old = this.mesh.material.map;
    this.mesh.material.map = canvasTexture(canvas);
    this.mesh.material.needsUpdate = true;
    old?.dispose();

    const w = W / PX;
    const h = H / PX;
    this.mesh.scale.set(w, h, 1);
    // نقطة الذيل عند أصل المجموعة
    const tailU = tailX / PX;
    this.mesh.position.set(w / 2 - tailU, h / 2, 0);
    this.speakerHit.position.set(
      this.mesh.position.x - w / 2 + 58 / PX,
      this.mesh.position.y + h / 2 - 58 / PX,
      0.02
    );
    this.speakerHit.visible = !!speakerSpace;

    this.visible = true;
    this._anim?.cancel();
    this.scaleAnim = 0;
    this._anim = animate(0.4, (p) => (this.scaleAnim = ease.outBack(p)));
  }

  hide() {
    if (!this.visible) return;
    this._anim?.cancel();
    const from = this.scaleAnim;
    this._anim = animate(0.2, (p) => {
      this.scaleAnim = from * (1 - p);
      if (p >= 1) this.visible = false;
    });
  }

  /** يضع الفقاعة فوق رأس علي ويجعلها تواجه الكاميرا. */
  follow(headWorldPos, camera) {
    if (!this.visible) return;
    const camQuat = camera.getWorldQuaternion(new THREE.Quaternion());
    this.quaternion.copy(camQuat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat);
    const sideOffset = this.side === 'left' ? -0.35 : this.side === 'right' ? 0.35 : 0;
    this.position.copy(headWorldPos).addScaledVector(up, 0.55).addScaledVector(right, sideOffset);
    // إزاحة نحو الكاميرا قليلًا حتى لا تختفي خلف العناصر
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const toCam = camPos.sub(this.position).normalize();
    this.position.addScaledVector(toCam, 0.6);
    this.scale.setScalar(Math.max(0.001, this.scaleAnim));
  }
}

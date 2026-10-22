import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../world/palette.js';
import { mat, uiMat } from '../world/materials.js';
import { createCanvas, getCtx, canvasTexture, roundRect, drawText } from './textCanvas.js';
import { animate } from '../engine/ticker.js';
import { ease } from '../engine/mathx.js';

/**
 * لوحة تعليمية ثلاثية الأبعاد: إطار نعناعي، وجه كريمي، ومحتوى مرسوم على Canvas.
 * إذا كانت posts=true فإن أصل اللوحة على الأرض وتقف على عمودين خشبيين.
 */
export class Board extends THREE.Group {
  constructor({
    width = 6,
    height = 3.6,
    px = 200,
    frameColor = PALETTE.mint,
    faceColor = PALETTE.cream,
    posts = false,
    postHeight = 1.7,
    depth = 0.22,
    radius = 0.35,
    border = 0.22,
  } = {}) {
    super();
    this.widthU = width;
    this.heightU = height;
    this.faceColor = faceColor;
    this.radiusU = radius;
    this.px = px;

    this.inner = new THREE.Group();
    this.add(this.inner);
    const cy = posts ? postHeight + height / 2 : 0;
    this.inner.position.y = cy;
    this.centerY = cy;

    this.frameMat = mat(frameColor, { roughness: 0.6 }).clone();
    this.frame = new THREE.Mesh(
      new RoundedBoxGeometry(width + border * 2, height + border * 2, depth, 5, radius + border * 0.6),
      this.frameMat
    );
    this.frame.castShadow = true;
    this.frame.receiveShadow = true;
    this.inner.add(this.frame);

    this.canvas = createCanvas(width * px, height * px);
    this.texture = canvasTexture(this.canvas);
    this.content = new THREE.Mesh(new THREE.PlaneGeometry(width, height), uiMat(this.texture));
    this.content.position.z = depth / 2 + 0.012;
    this.inner.add(this.content);

    // ظهر اللوحة
    const back = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat(PALETTE.creamDark));
    back.rotation.y = Math.PI;
    back.position.z = -depth / 2 - 0.01;
    this.inner.add(back);

    if (posts) {
      const postGeo = new THREE.CylinderGeometry(0.13, 0.16, postHeight + height * 0.5, 12);
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(postGeo, mat(PALETTE.trunk));
        p.position.set(sx * width * 0.36, (postHeight + height * 0.5) / 2, -depth / 2 - 0.12);
        p.castShadow = true;
        this.add(p);
      }
    }
    this.clear();
  }

  /** يمسح المحتوى ويرسم خلفية كريمية بزوايا دائرية. */
  clear() {
    const ctx = getCtx(this.canvas);
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const r = this.radiusU * this.px;
    roundRect(ctx, 0, 0, W, H, r);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fffdf5');
    g.addColorStop(1, this.faceColor);
    ctx.fillStyle = g;
    ctx.fill();
    return ctx;
  }

  /** يرسم المحتوى عبر دالة (ctx, W, H). */
  draw(fn) {
    const ctx = this.clear();
    fn(ctx, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  /** محتوى قياسي: عنوان صغير + عنوان + نص + ملاحظة. */
  setContent({ kicker = '', title = '', body = '', note = '', titleColor = PALETTE.navy } = {}) {
    this.draw((ctx, W, H) => {
      let y = H * 0.1;
      if (kicker) {
        drawText(ctx, kicker, W / 2, y + 30, { size: 48, weight: 700, color: PALETTE.mintDark, maxWidth: W * 0.9 });
        y += 100;
      }
      if (title) {
        const th = drawText(ctx, title, W / 2, y, {
          size: title.length > 14 ? 92 : 118,
          weight: 800,
          color: titleColor,
          maxWidth: W * 0.9,
          valign: 'top',
          lineHeight: 1.3,
        });
        y += th + 10;
        // خط زخرفي
        ctx.fillStyle = PALETTE.orange;
        roundRect(ctx, W / 2 - 90, y, 180, 12, 6);
        ctx.fill();
        y += 40;
      }
      if (body) {
        const bh = drawText(ctx, body, W / 2, y, {
          size: 70,
          weight: 700,
          color: PALETTE.navySoft,
          maxWidth: W * 0.86,
          valign: 'top',
          lineHeight: 1.5,
        });
        y += bh + 20;
      }
      if (note) {
        drawText(ctx, note, W / 2, H - 72, {
          size: 50,
          weight: 600,
          color: '#7a6a4f',
          maxWidth: W * 0.9,
          lineHeight: 1.35,
        });
      }
    });
  }

  pop() {
    this._pop?.cancel();
    this._pop = animate(0.5, (p) => {
      const s = 0.9 + 0.1 * ease.outBack(p);
      this.inner.scale.setScalar(s);
    });
  }

  setFrameColor(c) {
    this.frameMat.color.set(c);
  }
}

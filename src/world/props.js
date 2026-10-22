import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './palette.js';
import { mat, vcMat, paintGeometry, mergeable, shadowify, uiMat } from './materials.js';
import { mulberry32, noise3 } from '../engine/mathx.js';
import { createCanvas, getCtx, canvasTexture, roundRect, drawText } from '../ui3d/textCanvas.js';

// مكتبة المجسمات الطبيعية الكرتونية (تُبنى برمجيًا وتُدمج لتحسين الأداء).

const geoCache = new Map();
function cached(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return geoCache.get(key);
}

/** تدرج لوني عمودي على الهندسة (أغمق في الأسفل وأفتح في الأعلى). */
export function paintGradient(geo, bottom, top, y0 = null, y1 = null) {
  geo.computeBoundingBox();
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const lo = y0 ?? geo.boundingBox.min.y;
  const hi = y1 ?? geo.boundingBox.max.y;
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - lo) / (hi - lo || 1), 0, 1);
    c.copy(a).lerp(b, t);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** كتلة ناعمة غير منتظمة (للأشجار والسحب والصخور). */
export function blobGeometry(radius, { detail = 2, seed = 1, jitter = 0.12, squash = 1, freq = 1.6, smooth = true } = {}) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  if (smooth) g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3((v.x / radius) * freq + seed * 3.1, (v.y / radius) * freq + seed * 1.3, (v.z / radius) * freq);
    v.multiplyScalar(1 + n * jitter);
    v.y *= squash;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, s, s)
  );
  return geo.applyMatrix4(m);
}

// ---------------------------------------------------------------- الأشجار

export function roundTreeGeometry(variant = 0) {
  return cached(`roundTree${variant}`, () => {
    const rand = mulberry32(100 + variant);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.17, 0.27, 1.9, 9);
    trunk.translate(0, 0.95, 0);
    parts.push(mergeable(paintGradient(trunk, PALETTE.trunkDark, PALETTE.trunk)));
    const shades = [
      [PALETTE.leafDark, PALETTE.leaf],
      ['#69b56c', '#9bd889'],
      ['#5fae7c', '#8fd3a0'],
    ][variant % 3];
    const blobs = [
      [0, 2.55, 0, 1.25],
      [0.75, 2.15, 0.2, 0.85],
      [-0.7, 2.25, -0.15, 0.9],
      [0.1, 3.15, -0.1, 0.8],
    ];
    blobs.forEach(([x, y, z, r], i) => {
      const b = blobGeometry(r * (0.9 + rand() * 0.2), { seed: variant * 7 + i, detail: 2, jitter: 0.1 });
      b.translate(x, y, z);
      parts.push(mergeable(paintGradient(b, shades[0], shades[1], 1.3, 3.9)));
    });
    return mergeGeometries(parts);
  });
}

export function pineTreeGeometry() {
  return cached('pine', () => {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1.2, 8);
    trunk.translate(0, 0.6, 0);
    parts.push(mergeable(paintGeometry(trunk, PALETTE.trunk)));
    [
      [1.25, 1.5, 1.4],
      [1.0, 1.35, 2.2],
      [0.72, 1.15, 2.9],
    ].forEach(([r, h, y]) => {
      const c = new THREE.ConeGeometry(r, h, 10);
      c.translate(0, y, 0);
      parts.push(mergeable(paintGradient(c, '#4f9d6b', '#86cf8e')));
    });
    return mergeGeometries(parts);
  });
}

function leafStrip(length, width, droop, segs = 10) {
  // ورقة نخيل منحنية بثنية في المنتصف
  const pos = [];
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * length;
    const y = Math.sin(t * Math.PI * 0.55) * length * 0.32 - t * t * droop;
    const w = width * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.35) + 0.02;
    pts.push([x, y, w]);
  }
  for (let i = 0; i < segs; i++) {
    const [x0, y0, w0] = pts[i];
    const [x1, y1, w1] = pts[i + 1];
    const crease = 0.06;
    // نصف أيسر
    pos.push(x0, y0 + crease, 0, x1, y1 + crease, 0, x0, y0, w0);
    pos.push(x1, y1 + crease, 0, x1, y1, w1, x0, y0, w0);
    // نصف أيمن
    pos.push(x0, y0 + crease, 0, x0, y0, -w0, x1, y1 + crease, 0);
    pos.push(x1, y1 + crease, 0, x0, y0, -w0, x1, y1, -w1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function palmTreeGeometry(variant = 0) {
  return cached(`palm${variant}`, () => {
    const rand = mulberry32(300 + variant);
    const parts = [];
    const segs = 8;
    const height = 4.6 + variant * 0.4;
    const bend = 0.55 + rand() * 0.3;
    let prev = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const p0 = new THREE.Vector3(Math.pow(t0, 2) * bend, t0 * height, 0);
      const p1 = new THREE.Vector3(Math.pow(t1, 2) * bend, t1 * height, 0);
      const len = p0.distanceTo(p1);
      const r0 = 0.24 - t0 * 0.08;
      const c = new THREE.CylinderGeometry(r0 - 0.03, r0 + 0.02, len * 1.04, 9);
      const dir = p1.clone().sub(p0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      c.applyQuaternion(q);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      c.translate(mid.x, mid.y, mid.z);
      parts.push(mergeable(paintGeometry(c, i % 2 ? '#b88a5c' : '#a07450')));
      prev = p1;
    }
    const top = prev;
    const leafColors = ['#5fb565', '#76c56f', '#4fa65e'];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const leaf = leafStrip(2.4 + rand() * 0.5, 0.42, 1.3 + rand() * 0.4);
      leaf.rotateZ(-0.15 - rand() * 0.2);
      leaf.rotateY((i / n) * Math.PI * 2 + rand() * 0.3);
      leaf.translate(top.x, top.y, top.z);
      parts.push(mergeable(paintGradient(leaf, leafColors[i % 3], '#9edb83', top.y - 1.4, top.y + 0.8)));
    }
    for (let i = 0; i < 3; i++) {
      const s = new THREE.SphereGeometry(0.16, 8, 6);
      const a = (i / 3) * Math.PI * 2;
      s.translate(top.x + Math.cos(a) * 0.2, top.y - 0.18, top.z + Math.sin(a) * 0.2);
      parts.push(mergeable(paintGeometry(s, '#7a5236')));
    }
    return mergeGeometries(parts);
  });
}

export function bushGeometry(variant = 0) {
  return cached(`bush${variant}`, () => {
    const parts = [];
    [
      [0, 0.45, 0, 0.62],
      [0.5, 0.36, 0.15, 0.45],
      [-0.48, 0.35, -0.1, 0.48],
    ].forEach(([x, y, z, r], i) => {
      const b = blobGeometry(r, { seed: 40 + variant * 3 + i, detail: 1, jitter: 0.1 });
      b.translate(x, y, z);
      parts.push(mergeable(paintGradient(b, variant % 2 ? '#5aa86a' : '#6aae5c', variant % 2 ? '#93d59a' : '#a7d985', 0, 1)));
    });
    return mergeGeometries(parts);
  });
}

export function desertShrubGeometry() {
  return cached('shrub', () => {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const c = new THREE.ConeGeometry(0.08, 0.7 + (i % 3) * 0.15, 5);
      c.translate(0, 0.35, 0);
      c.rotateZ((i - 3) * 0.22);
      c.rotateY(i * 0.9);
      parts.push(mergeable(paintGradient(c, '#8aa65a', '#c4d38a')));
    }
    return mergeGeometries(parts);
  });
}

export function grassTuftGeometry() {
  return cached('tuft', () => {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.ConeGeometry(0.05, 0.42 + (i % 2) * 0.14, 4);
      c.translate(0, 0.2, 0);
      c.rotateZ((i - 2) * 0.28);
      c.rotateY(i * 1.3);
      parts.push(mergeable(paintGradient(c, '#7fbf6a', '#c6eb9b')));
    }
    return mergeGeometries(parts);
  });
}

export function flowerGeometry() {
  return cached('flower', () => {
    const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.38, 4);
    stem.translate(0, 0.19, 0);
    const head = new THREE.IcosahedronGeometry(0.1, 0);
    head.translate(0, 0.42, 0);
    return mergeGeometries([mergeable(paintGeometry(stem, '#6fb067')), mergeable(paintGeometry(head, '#ffffff'))]);
  });
}

// ---------------------------------------------------------------- الصخور

export function rockGeometry(seed = 1, { radius = 1, squash = 0.7, jitter = 0.22, detail = 1, smooth = false } = {}) {
  return blobGeometry(radius, { seed, detail, jitter, squash, freq: 1.3, smooth });
}

export function makeRock(seed, radius, color = PALETTE.rock, opts = {}) {
  const geo = rockGeometry(seed, { radius, ...opts });
  const m = new THREE.Mesh(geo, mat(color, { roughness: 0.95, flatShading: !opts.smooth }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- السحب والجبال

export function cloudGeometry(seed = 1) {
  return cached(`cloud${seed}`, () => {
    const rand = mulberry32(seed * 17);
    const parts = [];
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const r = 2.2 + rand() * 2.2;
      const b = blobGeometry(r, { seed: seed * 9 + i, detail: 1, jitter: 0.06 });
      b.translate((i - n / 2) * 2.6 + rand(), rand() * 1.4, (rand() - 0.5) * 3);
      parts.push(mergeable(paintGradient(b, '#dfe9f2', '#ffffff', -2, 3)));
    }
    return mergeGeometries(parts);
  });
}

export const cloudMaterial = () =>
  mat('#ffffff', { vertexColors: true, roughness: 1, emissive: '#e8f0f6', emissiveIntensity: 0.45, fog: false });

// ---------------------------------------------------------------- مفردات مساعدة

/** مجسم شجرة مفرد (للاستخدام داخل المحطات). */
export function makeTree(kind = 'round', variant = 0, scale = 1) {
  const geo =
    kind === 'palm'
      ? palmTreeGeometry(variant)
      : kind === 'pine'
        ? pineTreeGeometry()
        : kind === 'bush'
          ? bushGeometry(variant)
          : kind === 'shrub'
            ? desertShrubGeometry()
            : roundTreeGeometry(variant);
  const m = new THREE.Mesh(geo, kind === 'palm' ? vcMat({ side: THREE.DoubleSide }) : vcMat());
  m.scale.setScalar(scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** لافتة خشبية صغيرة على المسار: رقم المحطة واسمها. */
export function makeSignpost(label, number = null) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.2, 8), mat(PALETTE.trunk));
  post.position.y = 1.1;
  g.add(post);
  const w = 2.6;
  const h = 0.9;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), mat(PALETTE.trunkDark));
  board.position.y = 1.85;
  g.add(board);
  const c = createCanvas(w * 160, h * 160);
  const ctx = getCtx(c);
  roundRect(ctx, 6, 6, c.width - 12, c.height - 12, 26);
  ctx.fillStyle = '#f7e2bd';
  ctx.fill();
  const text = number ? `${number} · ${label}` : label;
  drawText(ctx, text, c.width / 2, c.height / 2 + 4, { size: 58, weight: 800, color: PALETTE.navy, maxWidth: c.width - 30 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), uiMat(canvasTexture(c)));
  face.position.set(0, 1.85, 0.065);
  g.add(face);
  const back = face.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.065;
  g.add(back);
  shadowify(g, true, false);
  face.castShadow = false;
  back.castShadow = false;
  return g;
}

/** حاجز سلامة مخطط (أحمر/أبيض). */
export function makeBarrier(width = 2) {
  const g = new THREE.Group();
  const c = createCanvas(256, 64);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ef6f5e';
    ctx.beginPath();
    ctx.moveTo(i * 40 - 30, 64);
    ctx.lineTo(i * 40 + 10, 0);
    ctx.lineTo(i * 40 + 50, 0);
    ctx.lineTo(i * 40 + 10, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = canvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(width / 2, 1);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.32, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  bar.position.y = 0.85;
  g.add(bar);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), mat('#f4f4f4'));
    leg.position.set(sx * (width / 2 - 0.15), 0.5, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.5), mat('#5e6670'));
    foot.position.set(sx * (width / 2 - 0.15), 0.03, 0);
    g.add(foot);
  }
  return shadowify(g, true, false);
}

/** مخروط مرور برتقالي. */
export function makeCone() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 14), mat('#ff9a4d'));
  cone.position.y = 0.4;
  g.add(cone);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.17, 0.12, 14), mat('#ffffff'));
  stripe.position.y = 0.42;
  g.add(stripe);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), mat('#ff9a4d'));
  base.position.y = 0.03;
  g.add(base);
  return shadowify(g, true, false);
}

/** سهم ثلاثي الأبعاد مسطح (لتوضيح اتجاه الحركة). */
export function arrowGeometry(len = 1.2, width = 0.7) {
  const s = new THREE.Shape();
  const hw = width / 2;
  const sw = width * 0.2;
  s.moveTo(0, len / 2);
  s.lineTo(hw, len / 2 - hw);
  s.lineTo(sw, len / 2 - hw);
  s.lineTo(sw, -len / 2);
  s.lineTo(-sw, -len / 2);
  s.lineTo(-sw, len / 2 - hw);
  s.lineTo(-hw, len / 2 - hw);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.translate(0, 0, -0.06);
  // السهم يشير إلى +Z بعد الدوران ويستلقي أفقيًا
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  return g;
}

/** نسيج دائري ناعم للدخان والغبار. */
let softTex = null;
export function softCircleTexture() {
  if (softTex) return softTex;
  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  softTex = new THREE.CanvasTexture(c);
  softTex.colorSpace = THREE.SRGBColorSpace;
  return softTex;
}

/** مجموعة جزيئات (دخان/غبار) بمواد Sprite. */
export function makePuffs(count, color, opacity = 0.6) {
  const g = new THREE.Group();
  const material = new THREE.SpriteMaterial({
    map: softCircleTexture(),
    color,
    transparent: true,
    depthWrite: false,
    opacity,
  });
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(material.clone());
    s.visible = false;
    g.add(s);
  }
  return g;
}

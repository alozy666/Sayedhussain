import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from './palette.js';
import { mat, shadowify } from './materials.js';
import { Board } from '../ui3d/Panel.js';
import { drawText } from '../ui3d/textCanvas.js';
import { blobGeometry, makeTree } from './props.js';
import { onTick } from '../engine/ticker.js';

/** عمود حجري كرتوني بقاعدة وتاج. */
export function makePillar(height = 4.8, color = '#ecd3a6', capColor = PALETTE.mint) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.55, 1.45, 3, 0.14), mat('#d8b885'));
  base.position.y = 0.27;
  const col = new THREE.Mesh(new RoundedBoxGeometry(1.0, height, 1.0, 3, 0.16), mat(color));
  col.position.y = height / 2 + 0.4;
  const cap = new THREE.Mesh(new RoundedBoxGeometry(1.35, 0.42, 1.35, 3, 0.14), mat(capColor));
  cap.position.y = height + 0.55;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), mat(PALETTE.orange));
  ball.position.y = height + 1.05;
  g.add(base, col, cap, ball);
  return shadowify(g);
}

/** راية مثلثة ترفرف. */
function makePennant(color) {
  const geo = new THREE.BufferGeometry();
  const verts = [];
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const x0 = i / segs;
    const x1 = (i + 1) / segs;
    const h0 = 0.45 * (1 - x0);
    const h1 = 0.45 * (1 - x1);
    verts.push(x0, h0, 0, x0, -h0, 0, x1, h1, 0, x1, h1, 0, x0, -h0, 0, x1, -h1, 0);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.scale(1.3, 1, 1);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide }));
  m.userData.base = geo.attributes.position.array.slice();
  return m;
}

/**
 * بوابة المغامرات في بداية الجزيرة (إحداثيات منطقة البوابة: الكاميرا من +Z).
 */
export function buildGate(frame, { title, subtitle }) {
  const g = new THREE.Group();
  g.name = 'adventure-gate';
  frame.add(g);

  const span = 3.7;
  for (const sx of [-1, 1]) {
    const p = makePillar(5.0);
    p.position.x = sx * span;
    g.add(p);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(span, 0.34, 16, 48, Math.PI), mat('#bf8a5a'));
  arch.position.y = 5.55;
  arch.castShadow = true;
  g.add(arch);

  // أوراق متسلقة على القوس
  const leafGeo = blobGeometry(0.42, { seed: 4, detail: 1, jitter: 0.15 });
  const leaves = new THREE.InstancedMesh(leafGeo, mat('#7cc77a', { roughness: 0.9 }), 26);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) {
    const a = (i / 25) * Math.PI;
    const r = span + Math.sin(i * 1.7) * 0.15;
    const s = 0.7 + ((i * 37) % 10) / 20;
    m4.compose(
      new THREE.Vector3(Math.cos(a) * r, 5.55 + Math.sin(a) * r, 0.25 * Math.sin(i * 2.3)),
      new THREE.Quaternion(),
      new THREE.Vector3(s, s, s)
    );
    leaves.setMatrixAt(i, m4);
  }
  leaves.castShadow = true;
  g.add(leaves);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), mat('#ffb3c7'), 12);
  const fc = new THREE.Color();
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI;
    m4.compose(new THREE.Vector3(Math.cos(a) * (span + 0.1), 5.55 + Math.sin(a) * (span + 0.1), 0.45), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, fc.set(['#ffb3c7', '#ffe08a', '#ffffff'][i % 3]));
  }
  g.add(flowers);

  // لافتة العنوان
  const sign = new Board({ width: 7.4, height: 2.35, frameColor: PALETTE.orange, border: 0.24 });
  sign.position.set(0, 7.45, 0.55);
  sign.draw((ctx, W, H) => {
    drawText(ctx, title, W / 2, H * 0.38, { size: 118, weight: 800, color: PALETTE.navy, maxWidth: W * 0.94 });
    drawText(ctx, subtitle, W / 2, H * 0.78, { size: 76, weight: 700, color: PALETTE.mintDark, maxWidth: W * 0.9 });
  });
  g.add(sign);
  // حبال تعليق اللافتة
  for (const sx of [-2.4, 2.4]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), mat('#8a6a4a'));
    rope.position.set(sx, 8.9, 0.5);
    g.add(rope);
  }

  // رايات على الأعمدة
  const pennants = [];
  for (const [sx, color] of [
    [-1, PALETTE.mint],
    [1, PALETTE.skyBlue],
  ]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), mat('#f4f4f4'));
    pole.position.set(sx * span, 6.85, 0);
    g.add(pole);
    const pen = makePennant(color);
    pen.position.set(sx * span, 7.4, 0);
    pen.rotation.y = sx > 0 ? 0 : Math.PI;
    g.add(pen);
    pennants.push(pen);
  }
  onTick((dt, t) => {
    for (const p of pennants) {
      const pos = p.geometry.attributes.position;
      const base = p.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3] * 1.3;
        pos.setZ(i, Math.sin(x * 4 - t * 6) * 0.12 * x);
      }
      pos.needsUpdate = true;
    }
  });

  // أحواض زهور ونخلتان
  for (const sx of [-1, 1]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.6, 16), mat(PALETTE.coral));
    pot.position.set(sx * (span + 1.4), 0.3, 0.8);
    const bush = makeTree('bush', sx > 0 ? 1 : 0, 0.7);
    bush.position.set(sx * (span + 1.4), 0.45, 0.8);
    g.add(pot, bush);
    const palm = makeTree('palm', sx > 0 ? 0 : 1, 1.15);
    palm.position.set(sx * (span + 3.6), 0, -1.6);
    g.add(palm);
  }
  shadowify(g, true, true);
  sign.content.castShadow = false;
  return { group: g, sign };
}

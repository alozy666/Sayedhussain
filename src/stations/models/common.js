import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../world/palette.js';
import { mat, shadowify } from '../../world/materials.js';

// قطع مشتركة بين نماذج المحطات.

/** شريط مسطح على طول منحنى (للطرق والتشققات وجداول الماء). */
export function ribbonGeometry(points, widthFn, { yFn = null, revealFn = null } = {}) {
  const pos = [];
  const uv = [];
  const reveal = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const n = points.length;
  let acc = 0;
  const lengths = [0];
  for (let i = 1; i < n; i++) {
    acc += points[i].distanceTo(points[i - 1]);
    lengths.push(acc);
  }
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    const dir = next.clone().sub(prev).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(up, dir).normalize();
    const s = lengths[i] / (acc || 1);
    const w = widthFn(s, i);
    for (const k of [-1, 1]) {
      const q = p.clone().addScaledVector(side, (k * w) / 2);
      if (yFn) q.y = yFn(q, s);
      pos.push(q.x, q.y, q.z);
      uv.push(k < 0 ? 0 : 1, s);
      reveal.push(revealFn ? revealFn(s, i) : s);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aReveal', new THREE.Float32BufferAttribute(reveal, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** بيت كرتوني صغير. */
export function makeHouse() {
  const g = new THREE.Group();
  const walls = new THREE.Mesh(new RoundedBoxGeometry(3.0, 2.1, 2.5, 3, 0.12), mat('#fff0d4'));
  walls.position.y = 1.05;
  g.add(walls);
  const shape = new THREE.Shape();
  shape.moveTo(-1.8, 0);
  shape.lineTo(0, 1.45);
  shape.lineTo(1.8, 0);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 2.9,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  roofGeo.translate(0, 0, -1.45);
  const roof = new THREE.Mesh(roofGeo, mat(PALETTE.coral));
  roof.position.y = 2.05;
  g.add(roof);
  const chimney = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.8, 0.4, 2, 0.05), mat('#d9826a'));
  chimney.position.set(0.85, 3.0, -0.4);
  g.add(chimney);
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.25, 0.1, 2, 0.06), mat('#5aa6d6'));
  door.position.set(0.6, 0.66, 1.27);
  g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(PALETTE.gold, { metalness: 0.3, roughness: 0.4 }));
  knob.position.set(0.85, 0.65, 1.34);
  g.add(knob);
  for (const [x, y] of [[-0.75, 1.25]]) {
    const frame = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.75, 0.08, 2, 0.04), mat('#ffffff'));
    frame.position.set(x, y, 1.27);
    g.add(frame);
    const glass = new THREE.Mesh(new RoundedBoxGeometry(0.68, 0.58, 0.06, 2, 0.03), mat('#bfe6ff', { roughness: 0.2 }));
    glass.position.set(x, y, 1.3);
    g.add(glass);
  }
  const side = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.55, 0.08, 2, 0.03), mat('#bfe6ff', { roughness: 0.2 }));
  side.position.set(1.52, 1.25, 0);
  side.rotation.y = Math.PI / 2;
  g.add(side);
  // ممشى صغير وأحواض زهور
  const step = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.12, 0.6, 2, 0.04), mat('#d9cbb5'));
  step.position.set(0.6, 0.06, 1.6);
  g.add(step);
  return shadowify(g);
}

/** عمود إنارة كرتوني. */
export function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 10), mat('#5c6f86'));
  pole.position.y = 1.6;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8), mat('#5c6f86'));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.3, 3.15, 0);
  g.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat('#fff3c4', { emissive: '#ffe9a0', emissiveIntensity: 0.4 }));
  lamp.position.set(0.62, 3.0, 0);
  g.add(lamp);
  return shadowify(g, true, false);
}

/** سياج خشبي قصير. */
export function makeFence(length = 3) {
  const g = new THREE.Group();
  const n = Math.round(length / 0.5);
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.8, 0.08, 2, 0.03), mat('#e9d3b0'));
    p.position.set(-length / 2 + i * (length / n), 0.4, 0);
    g.add(p);
  }
  for (const y of [0.3, 0.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.05), mat('#d9bf98'));
    rail.position.set(0, y, -0.05);
    g.add(rail);
  }
  return shadowify(g, true, false);
}

/** خطوط حركة كرتونية «اهتزاز» تظهر بجانب الأجسام. */
export function makeShakeMarks() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#2b3d58', transparent: true, opacity: 0, depthWrite: false });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.35 + i * 0.22, 0.035, 6, 16, Math.PI * 0.55), m);
      arc.rotation.z = side > 0 ? -Math.PI * 0.27 : Math.PI - Math.PI * 0.27;
      arc.position.x = side * (0.2 + i * 0.05);
      arc.userData.side = side;
      g.add(arc);
    }
  }
  g.userData.material = m;
  return g;
}

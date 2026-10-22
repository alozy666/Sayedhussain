import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../world/palette.js';
import { mat, shadowify, revealMaterial, setReveal } from '../../world/materials.js';
import { makeTree, makeBarrier, makeCone, blobGeometry, paintGradient } from '../../world/props.js';
import { phase, ease, smoothstep, fbm, lerp } from '../../engine/mathx.js';

// المحطة 5: تغييرات الإنسان — الحفارة تزيل التربة وتمهد الأرض ثم يتكوّن طريق صغير.

const ROAD_Z = -1.0;
const ROAD_X0 = -6.2;
const ROAD_X1 = 4.4;
const MOUNDS = [
  { x: -3.6, h: 0.95 },
  { x: -0.4, h: 1.15 },
  { x: 2.8, h: 0.9 },
];
const CYCLE = 3.0;
const C0 = 0.9;
const PARK = new THREE.Vector3(-8.6, 0, -1.6);
const PILE_Z = -4.35;

/** حفارة صفراء كرتونية تتجه نحو +X. */
function makeExcavator() {
  const ex = new THREE.Group();
  const yellow = mat(PALETTE.excavator, { roughness: 0.55 });
  const yellowDark = mat(PALETTE.excavatorDark, { roughness: 0.6 });
  const dark = mat('#4b5059', { roughness: 0.8 });
  const glass = mat('#bfe7ff', { roughness: 0.15, metalness: 0.1 });

  const tracks = new THREE.Group();
  for (const z of [-0.62, 0.62]) {
    const tr = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.56, 0.5, 4, 0.24), dark);
    tr.position.set(0, 0.28, z);
    tracks.add(tr);
    for (const x of [-0.85, 0, 0.85]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 16), mat('#9aa2ad'));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.28, z + Math.sign(z) * 0.26);
      tracks.add(w);
    }
  }
  ex.add(tracks);
  ex.userData.wheels = tracks.children.filter((c) => c.geometry.type === 'CylinderGeometry');

  const turret = new THREE.Group();
  turret.position.y = 0.58;
  ex.add(turret);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.32, 1.55, 3, 0.1), yellowDark);
  plate.position.y = 0.16;
  turret.add(plate);
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.35, 0.62, 1.42, 3, 0.16), yellow);
  body.position.set(-0.38, 0.62, 0);
  turret.add(body);
  const counter = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.6, 1.4, 3, 0.16), yellowDark);
  counter.position.set(-1.08, 0.58, 0);
  turret.add(counter);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(0.98, 1.08, 0.9, 3, 0.14), yellow);
  cab.position.set(0.42, 0.86, 0.3);
  turret.add(cab);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.08, 0.1, 1.0, 2, 0.04), yellowDark);
  roof.position.set(0.42, 1.43, 0.3);
  turret.add(roof);
  const front = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.6, 0.66, 2, 0.03), glass);
  front.position.set(0.92, 1.0, 0.3);
  turret.add(front);
  const side = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.55, 0.06, 2, 0.03), glass);
  side.position.set(0.42, 1.0, 0.76);
  turret.add(side);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 10), dark);
  pipe.position.set(-0.7, 1.15, -0.45);
  turret.add(pipe);
  const lightBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('#ff9a3c', { emissive: '#ff7a1a', emissiveIntensity: 0.6 }));
  lightBall.position.set(0.42, 1.52, 0.3);
  turret.add(lightBall);

  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.8, 0.5, -0.32);
  turret.add(boomPivot);
  const boom = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.3, 0.28, 3, 0.1), yellow);
  boom.position.x = 1.15;
  boomPivot.add(boom);
  const armPivot = new THREE.Group();
  armPivot.position.x = 2.25;
  boomPivot.add(armPivot);
  const arm = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.24, 0.24, 3, 0.08), yellow);
  arm.position.x = 0.8;
  armPivot.add(arm);
  const bucketPivot = new THREE.Group();
  bucketPivot.position.x = 1.6;
  armPivot.add(bucketPivot);
  const bucket = new THREE.Group();
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.62, 0.72, 2, 0.04), mat('#6a717c'));
  back.position.set(0.05, -0.28, 0);
  const bottom = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.1, 0.72, 2, 0.04), mat('#6a717c'));
  bottom.position.set(0.32, -0.56, 0);
  bucket.add(back, bottom);
  for (const z of [-0.25, 0, 0.25]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), mat('#cfd5dc'));
    tooth.rotation.z = -Math.PI / 2;
    tooth.position.set(0.68, -0.56, z);
    bucket.add(tooth);
  }
  const soil = new THREE.Mesh(blobGeometry(0.32, { seed: 3, detail: 1, jitter: 0.2, squash: 0.7 }), mat('#b88a5a', { roughness: 1 }));
  soil.position.set(0.32, -0.38, 0);
  bucket.add(soil);
  bucketPivot.add(bucket);
  ex.userData = { ...ex.userData, turret, boomPivot, armPivot, bucketPivot, soil };
  return shadowify(ex);
}

export class HumanModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'human-model';
    this.duration = 13.2;
    this.cues = [
      { at: 0.7, sound: 'engine', dur: 10.6 },
      { at: C0 + 1.3, sound: 'scoop' },
      { at: C0 + CYCLE + 1.3, sound: 'scoop' },
      { at: C0 + CYCLE * 2 + 1.3, sound: 'scoop' },
      { at: C0 + 2.25, sound: 'dump' },
      { at: C0 + CYCLE + 2.25, sound: 'dump' },
      { at: C0 + CYCLE * 2 + 2.25, sound: 'dump' },
      { at: 11.1, sound: 'build' },
    ];
    this.focus = new THREE.Vector3(-0.4, 0.8, ROAD_Z);
    this.tagPos = new THREE.Vector3(-1.0, 3.9, -1.2);
    this.groundColor = '#e8cd98';
    this.pictureView = { pos: new THREE.Vector3(-0.6, 6.4, 9.8), target: new THREE.Vector3(-2.6, 0.5, -1.4), fov: 44 };
    this.pictureTime = 12.9;
    this.build();
    this.applyAt(0);
  }

  build() {
    // أرض رملية بتلال صغيرة
    const geo = new THREE.PlaneGeometry(16, 8.4, 96, 50);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-1.2, 0, -1.4);
    this.groundGeo = geo;
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const cA = new THREE.Color('#ecd3a2');
    const cB = new THREE.Color('#dcb67e');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      c.copy(cA).lerp(cB, 0.5 + fbm(x * 0.6, z * 0.6, 2));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.ground = new THREE.Mesh(geo, mat('#ffffff', { vertexColors: true, roughness: 1 }));
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.levels = MOUNDS.map(() => 1);
    this.rough = 1;

    // الطريق الجديد (يظهر تدريجيًا)
    const roadGeo = new THREE.PlaneGeometry(ROAD_X1 - ROAD_X0, 2.6, 60, 1);
    roadGeo.rotateX(-Math.PI / 2);
    roadGeo.translate((ROAD_X0 + ROAD_X1) / 2, 0.14, ROAD_Z);
    const rp = roadGeo.attributes.position;
    const rev = new Float32Array(rp.count);
    for (let i = 0; i < rp.count; i++) rev[i] = (rp.getX(i) - ROAD_X0) / (ROAD_X1 - ROAD_X0);
    roadGeo.setAttribute('aReveal', new THREE.BufferAttribute(rev, 1));
    this.roadMat = revealMaterial(mat('#8d97a3', { roughness: 0.9 }));
    this.road = new THREE.Mesh(roadGeo, this.roadMat);
    this.road.receiveShadow = true;
    this.group.add(this.road);
    this.curbs = [];
    for (const dz of [-1.38, 1.38]) {
      const cg = new THREE.BoxGeometry(ROAD_X1 - ROAD_X0, 0.16, 0.18);
      cg.translate((ROAD_X1 - ROAD_X0) / 2, 0, 0);
      const curb = new THREE.Mesh(cg, mat('#f2f2ee'));
      curb.position.set(ROAD_X0, 0.12, ROAD_Z + dz);
      this.group.add(curb);
      this.curbs.push(curb);
    }
    this.dashes = [];
    for (let x = ROAD_X0 + 0.7; x < ROAD_X1 - 0.6; x += 1.5) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.02, 0.14), mat('#fff3c9'));
      d.position.set(x + 0.37, 0.16, ROAD_Z);
      this.group.add(d);
      this.dashes.push(d);
    }

    // أكوام التربة المزالة (كومة خلف كل تلة)
    this.piles = MOUNDS.map((m, k) => {
      const pileGeo = blobGeometry(0.95, { seed: 9 + k, detail: 2, jitter: 0.14, squash: 0.55 });
      paintGradient(pileGeo, '#b78858', '#d6ad78');
      const pile = new THREE.Mesh(pileGeo, mat('#ffffff', { vertexColors: true, roughness: 1 }));
      pile.position.set(m.x - 2.2, 0, PILE_Z);
      this.group.add(pile);
      return pile;
    });
    this.fallingSoil = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(blobGeometry(0.12, { seed: 20 + i, detail: 0 }), mat('#b88a5a'));
      s.visible = false;
      this.group.add(s);
      this.fallingSoil.push(s);
    }

    // الحفارة
    this.ex = makeExcavator();
    this.group.add(this.ex);

    // حواجز السلامة والمخاريط
    for (const [x, z, r] of [
      [-7.4, -4.6, 0],
      [-4.6, -5.2, 0.1],
      [1.6, -5.1, -0.06],
      [4.6, -4.4, 0.3],
      [5.6, -1.2, Math.PI / 2],
    ]) {
      const b = makeBarrier(2.2);
      b.position.set(x, 0, z);
      b.rotation.y = r;
      this.group.add(b);
    }
    for (const [x, z] of [
      [-6.2, 1.2],
      [-3.0, 1.4],
      [0.4, 1.4],
      [3.4, 1.2],
      [5.2, 0.4],
    ]) {
      const cone = makeCone();
      cone.position.set(x, 0.05, z);
      this.group.add(cone);
    }
    for (const [kind, v, x, z, s] of [
      ['palm', 0, -10.4, -3.6, 1.05],
      ['round', 1, 6.4, -5.8, 1.1],
      ['round', 0, -6.2, -6.8, 1.0],
      ['bush', 1, 3.2, -6.0, 0.9],
      ['palm', 1, 8.6, -3.2, 0.95],
    ]) {
      const t = makeTree(kind, v, s);
      t.position.set(x, 0, z);
      this.group.add(t);
    }
    shadowify(this.group, true, true);
    this.road.castShadow = false;
    this.ground.castShadow = false;
  }

  groundHeight(x, z) {
    const edge = smoothstep(8.0, 6.6, Math.abs(x + 1.2)) * smoothstep(4.2, 3.2, Math.abs(z + 1.4));
    const inRoad = 1 - smoothstep(1.5, 2.3, Math.abs(z - ROAD_Z));
    let h = 0.05 + fbm(x * 0.5, z * 0.5, 2) * 0.16 * (1 - inRoad * (1 - this.rough)) + 0.06;
    MOUNDS.forEach((m, i) => {
      const dx = x - m.x;
      const dz = z - ROAD_Z;
      h += this.levels[i] * m.h * Math.exp(-(dx * dx) / (2 * 1.05 * 1.05) - (dz * dz) / (2 * 1.15 * 1.15));
    });
    return Math.max(0.01, h * edge);
  }

  rebuildGround() {
    const pos = this.groundGeo.attributes.position;
    const col = this.groundGeo.attributes.color;
    if (!this.baseColors) this.baseColors = col.array.slice();
    const dark = new THREE.Color('#c08f58');
    for (let i = 0; i < pos.count; i++) {
      const h = this.groundHeight(pos.getX(i), pos.getZ(i));
      pos.setY(i, h);
      const k = Math.min(1, Math.max(0, (h - 0.12) * 0.75));
      col.setXYZ(
        i,
        this.baseColors[i * 3] + (dark.r - this.baseColors[i * 3]) * k,
        this.baseColors[i * 3 + 1] + (dark.g - this.baseColors[i * 3 + 1]) * k,
        this.baseColors[i * 3 + 2] + (dark.b - this.baseColors[i * 3 + 2]) * k
      );
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.groundGeo.computeVertexNormals();
  }

  /** وضع الحفارة: موضع X، دوران البرج، زوايا الذراع، امتلاء الدلو. */
  setExcavator({ x, z = ROAD_Z, yaw = 0, boom = 0.75, arm = -1.95, bucket = 0.5, full = false, roll = 0 }) {
    const ex = this.ex;
    ex.position.set(x, this.groundHeight(x, z) * 0.6, z);
    const u = ex.userData;
    u.turret.rotation.y = yaw;
    u.boomPivot.rotation.z = boom;
    u.armPivot.rotation.z = arm;
    u.bucketPivot.rotation.z = bucket;
    u.soil.visible = full;
    for (const w of u.wheels) w.rotation.y = roll;
  }

  applyAt(t) {
    // مستوى كل تلة
    MOUNDS.forEach((m, k) => {
      const ck = C0 + k * CYCLE;
      this.levels[k] = 1 - 0.85 * ease.inOut(phase(t, ck + 1.0, ck + 1.6));
    });
    const smooth = ease.inOut(phase(t, 10.0, 11.0));
    this.levels = this.levels.map((l) => l * (1 - smooth));
    this.rough = 1 - smooth;
    this.rebuildGround();

    // حركة الحفارة
    const startX = -9.2;
    const targets = MOUNDS.map((m) => m.x - 3.15);
    let x = startX;
    let yaw = 0;
    let boom = 0.75;
    let arm = -1.95;
    let bucket = 0.5;
    let full = false;
    let z = ROAD_Z;
    for (let k = 0; k < MOUNDS.length; k++) {
      const ck = C0 + k * CYCLE;
      if (t < ck) break;
      const from = k === 0 ? startX : targets[k - 1];
      x = lerp(from, targets[k], ease.inOut(phase(t, ck, ck + 0.8)));
      const down = ease.inOut(phase(t, ck + 0.8, ck + 1.2)) - ease.inOut(phase(t, ck + 1.6, ck + 2.0));
      boom = 0.75 - down * 0.62;
      arm = -1.95 + down * 0.45;
      const curl = ease.inOut(phase(t, ck + 1.15, ck + 1.6));
      const dump = ease.inOut(phase(t, ck + 2.15, ck + 2.45));
      const reset = ease.inOut(phase(t, ck + 2.5, ck + 2.95));
      bucket = 0.5 - curl * 1.3 + dump * 2.0 - reset * 0.7;
      full = curl > 0.6 && dump < 0.5;
      yaw = ease.inOut(phase(t, ck + 1.6, ck + 2.15)) * 1.45 - ease.inOut(phase(t, ck + 2.5, ck + 2.95)) * 1.45;
    }
    // العودة للوقوف جانبًا بعد الانتهاء
    const leave = ease.inOut(phase(t, 9.9, 11.0));
    if (leave > 0) {
      x = lerp(targets[2], PARK.x, leave);
      z = lerp(ROAD_Z, PARK.z, leave);
    }
    this.setExcavator({ x, z, yaw, boom, arm, bucket, full, roll: x * 2.2 });

    // التربة المتساقطة في الأكوام
    this.piles.forEach((pile, k) => {
      const g = ease.out(phase(t, C0 + k * CYCLE + 2.2, C0 + k * CYCLE + 2.7));
      pile.visible = g > 0.01;
      pile.scale.setScalar(Math.max(0.001, g));
    });
    const activeDump = MOUNDS.findIndex((m, k) => {
      const p = phase(t, C0 + k * CYCLE + 2.15, C0 + k * CYCLE + 2.7);
      return p > 0 && p < 1;
    });
    this.fallingSoil.forEach((sp, i) => {
      if (activeDump < 0) {
        sp.visible = false;
        return;
      }
      const ck = C0 + activeDump * CYCLE;
      const p = phase(t, ck + 2.15 + i * 0.04, ck + 2.6 + i * 0.04);
      sp.visible = p > 0 && p < 1;
      const px = this.piles[activeDump].position.x;
      sp.position.set(px + Math.sin(i * 2.1) * 0.4, 0.4 + 1.6 * (1 - p * p), PILE_Z + Math.cos(i * 1.7) * 0.3);
    });

    // الطريق
    const road = ease.inOut(phase(t, 11.0, 12.5));
    setReveal(this.roadMat, road <= 0 ? -1 : road * 1.01);
    this.road.visible = road > 0;
    for (const curb of this.curbs) {
      curb.visible = road > 0;
      curb.scale.x = Math.max(0.001, road);
    }
    this.dashes.forEach((d, i) => {
      const p = phase(t, 12.1 + i * 0.07, 12.35 + i * 0.07);
      d.visible = p > 0;
      d.scale.setScalar(Math.max(0.001, ease.outBack(p)));
    });
    this.stage = t < 0.85 ? 'before' : road >= 1 ? 'after' : 'working';
  }

  update() {}
}

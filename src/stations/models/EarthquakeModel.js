import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../world/palette.js';
import { mat, revealMaterial, setReveal, shadowify } from '../../world/materials.js';
import { makeTree, makeRock, makePuffs } from '../../world/props.js';
import { ribbonGeometry, makeHouse, makeLamp, makeFence, makeShakeMarks } from './common.js';
import { phase, ease, mulberry32 } from '../../engine/mathx.js';

// المحطة 1: الزلزال — اهتزاز عناصر المشهد (وليس الكاميرا) ثم تشقق الطريق والأرض.

const ROAD_Z = 1.0;
const CRACK_X = -1.3;
const SHAKE = [0.5, 3.7];

export class EarthquakeModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'earthquake-model';
    this.duration = 4.9;
    this.cues = [
      { at: 0.45, sound: 'rumble', dur: 3.3 },
      { at: 1.35, sound: 'crack' },
      { at: 2.3, sound: 'crack' },
    ];
    this.focus = new THREE.Vector3(CRACK_X, 0.4, ROAD_Z);
    this.groundColor = PALETTE.grass;
    this.pictureView = { pos: new THREE.Vector3(2.4, 5.2, 8.6), target: new THREE.Vector3(-2.0, 0.6, -0.4), fov: 42 };
    this.pictureTime = this.duration;
    this.shakers = [];
    this.build();
    this.applyAt(0);
  }

  addShaker(obj, amp = 1, kind = 'slide') {
    this.shakers.push({
      obj,
      amp,
      kind,
      seed: this.shakers.length * 1.37 + 0.3,
      base: { p: obj.position.clone(), r: obj.rotation.clone() },
    });
    this.group.add(obj);
  }

  build() {
    // الطريق مقسوم إلى جزأين عند خط التشقق
    const roadMat = mat(PALETTE.road, { roughness: 0.9 });
    const leftLen = CRACK_X + 11;
    const rightLen = 8 - CRACK_X;
    this.roadLeft = new THREE.Group();
    this.roadRight = new THREE.Group();
    const makeRoadPart = (group, len, sign) => {
      const slab = new THREE.Mesh(new RoundedBoxGeometry(len, 0.1, 3.0, 2, 0.03), roadMat);
      slab.position.set((sign * len) / 2, 0.04, 0);
      slab.receiveShadow = true;
      group.add(slab);
      for (const ez of [-1.3, 1.3]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.02, 0.1), mat('#f6edd2'));
        line.position.set((sign * len) / 2, 0.1, ez);
        group.add(line);
      }
      for (let x = 0.6; x < len - 0.6; x += 1.6) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.12), mat('#fff3c9'));
        dash.position.set(sign * (x + 0.4), 0.1, 0);
        group.add(dash);
      }
    };
    makeRoadPart(this.roadLeft, leftLen, -1);
    makeRoadPart(this.roadRight, rightLen, 1);
    this.roadLeft.position.set(CRACK_X - 0.02, 0, ROAD_Z);
    this.roadRight.position.set(CRACK_X + 0.02, 0, ROAD_Z);
    this.addShaker(this.roadLeft, 0.25, 'road');
    this.addShaker(this.roadRight, 0.25, 'road');

    // التشقق: شريط متعرج يبدأ من الطريق وينتشر للخارج
    const rand = mulberry32(7);
    const pts = [];
    const z0 = ROAD_Z - 5.2;
    const z1 = ROAD_Z + 5.0;
    const N = 46;
    let x = CRACK_X;
    for (let i = 0; i <= N; i++) {
      const z = z0 + ((z1 - z0) * i) / N;
      x += (i % 2 ? 1 : -1) * (0.12 + rand() * 0.16) + (CRACK_X - x) * 0.35;
      pts.push(new THREE.Vector3(x, 0, z));
    }
    const onRoad = (q) => Math.abs(q.z - ROAD_Z) < 1.55;
    const revealFn = (s) => Math.abs(z0 + (z1 - z0) * s - ROAD_Z) / 5.2;
    const widthFn = (s) => 0.06 + 0.5 * Math.pow(Math.sin(Math.PI * s), 1.4) * (0.75 + 0.25 * Math.sin(s * 40));
    const rimGeo = ribbonGeometry(pts, (s) => widthFn(s) + 0.14, { yFn: (q) => (onRoad(q) ? 0.105 : 0.03), revealFn });
    const innerGeo = ribbonGeometry(pts, (s) => widthFn(s), { yFn: (q) => (onRoad(q) ? 0.112 : 0.04), revealFn });
    this.crackRimMat = revealMaterial(mat(PALETTE.crackRim, { roughness: 1 }));
    this.crackMat = revealMaterial(mat(PALETTE.crack, { roughness: 1 }));
    this.crackRim = new THREE.Mesh(rimGeo, this.crackRimMat);
    this.crack = new THREE.Mesh(innerGeo, this.crackMat);
    this.crackRim.receiveShadow = this.crack.receiveShadow = true;
    this.group.add(this.crackRim, this.crack);
    // تشققات جانبية صغيرة
    this.branches = [];
    for (const [sx, sz, len, ang] of [
      [0.2, ROAD_Z + 0.5, 1.6, 0.9],
      [-0.3, ROAD_Z - 0.6, 1.4, -2.3],
      [0.1, ROAD_Z + 3.0, 1.2, 0.6],
    ]) {
      const bp = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        bp.push(new THREE.Vector3(CRACK_X + sx + Math.cos(ang) * len * t + (i % 2 ? 0.07 : -0.07), 0, sz + Math.sin(ang) * len * t));
      }
      const g = ribbonGeometry(bp, (s) => 0.16 * (1 - s) + 0.03, { yFn: (q) => (onRoad(q) ? 0.115 : 0.042) });
      const m = revealMaterial(mat(PALETTE.crack, { roughness: 1 }));
      const mesh = new THREE.Mesh(g, m);
      this.group.add(mesh);
      this.branches.push(mesh);
    }

    // البيت والأشجار والصخور وعمود الإنارة
    const house = makeHouse();
    house.position.set(-5.6, 0, -3.0);
    house.rotation.y = 0.35;
    this.house = house;
    this.addShaker(house, 1, 'house');
    this.houseMarks = makeShakeMarks();
    this.houseMarks.position.set(-5.6, 1.6, -1.6);
    this.houseMarks.scale.setScalar(2.4);
    this.group.add(this.houseMarks);

    const fence = makeFence(3.2);
    fence.position.set(-8.6, 0, -1.4);
    fence.rotation.y = 0.5;
    this.addShaker(fence, 0.7, 'slide');

    const lamp = makeLamp();
    lamp.position.set(1.6, 0, ROAD_Z - 2.0);
    this.addShaker(lamp, 1, 'tree');

    const trees = [
      ['round', 1, 3.6, -4.8, 1.15],
      ['palm', 0, -9.4, 1.6, 1.0],
      ['round', 2, -1.8, -6.6, 1.2],
      ['bush', 0, 2.6, -2.4, 1.0],
      ['pine', 0, -10.5, -4.5, 1.1],
      ['bush', 1, -3.2, -1.2, 0.8],
    ];
    for (const [kind, v, tx, tz, s] of trees) {
      const t = makeTree(kind, v, s);
      t.position.set(tx, 0, tz);
      t.rotation.y = tx * 0.7;
      this.addShaker(t, 1, 'tree');
    }
    for (const [rx, rz, r, seed] of [
      [1.9, 3.6, 0.45, 2],
      [-7.2, 3.4, 0.7, 5],
      [-3.8, 4.2, 0.35, 9],
      [5.3, -1.8, 0.5, 11],
    ]) {
      const rock = makeRock(seed, r);
      rock.position.set(rx, r * 0.35, rz);
      this.addShaker(rock, 1, 'hop');
    }

    // غبار خفيف عند التشقق
    this.dust = makePuffs(12, '#e7d6bd', 0.7);
    this.group.add(this.dust);
    this.dustSeeds = this.dust.children.map((s, i) => ({
      z: ROAD_Z + (i % 2 ? 1 : -1) * (0.3 + (i / 12) * 4.2),
      start: 1.3 + (i / 12) * 1.6,
      x: CRACK_X + (rand() - 0.5) * 0.6,
    }));
    shadowify(this.group, true, true);
    this.crack.castShadow = this.crackRim.castShadow = false;
  }

  /** حالة المشهد في اللحظة t (حتمية، لتسهيل الإعادة). */
  applyAt(t) {
    const p = phase(t, SHAKE[0], SHAKE[1]);
    const env = p > 0 && p < 1 ? Math.pow(Math.sin(Math.PI * p), 0.8) : 0;
    for (const s of this.shakers) {
      const { obj, base, amp, kind, seed } = s;
      obj.position.copy(base.p);
      obj.rotation.copy(base.r);
      const w1 = Math.sin(t * 41 + seed * 7);
      const w2 = Math.sin(t * 29 + seed * 3);
      if (kind === 'house') {
        obj.position.x += env * 0.09 * amp * w1;
        obj.rotation.z += env * 0.03 * amp * w2;
      } else if (kind === 'tree') {
        obj.rotation.z += env * 0.07 * amp * w1;
        obj.rotation.x += env * 0.04 * amp * w2;
        obj.position.x += env * 0.04 * w2;
      } else if (kind === 'hop') {
        obj.position.y += env * 0.05 * Math.abs(w1);
        obj.position.x += env * 0.04 * w2;
      } else if (kind === 'road') {
        obj.position.y += env * 0.02 * w1;
        obj.position.x += env * 0.03 * w2;
      } else {
        obj.position.x += env * 0.06 * amp * w1;
      }
    }
    // بعد الزلزال: الجزء الأيسر من الطريق ينخفض قليلًا
    const drop = ease.out(phase(t, 2.0, 3.4));
    this.roadLeft.position.y -= drop * 0.07;
    this.roadLeft.rotation.x -= drop * 0.012;

    const marksOn = env > 0.15;
    this.houseMarks.visible = marksOn;
    this.houseMarks.userData.material.opacity = marksOn ? 0.55 + 0.35 * Math.sin(t * 30) : 0;
    this.houseMarks.children.forEach((a) => (a.position.x = a.userData.side * (0.2 + Math.abs(Math.sin(t * 20)) * 0.06)));

    const crackP = ease.inOut(phase(t, 1.2, 3.5));
    setReveal(this.crackMat, crackP <= 0 ? -1 : crackP);
    setReveal(this.crackRimMat, crackP <= 0 ? -1 : crackP * 1.02);
    this.branches.forEach((b, i) => {
      const bp = ease.out(phase(t, 2.2 + i * 0.35, 3.4 + i * 0.35));
      setReveal(b.material, bp <= 0 ? -1 : bp);
    });

    this.dust.children.forEach((sp, i) => {
      const d = this.dustSeeds[i];
      const a = phase(t, d.start, d.start + 1.4);
      sp.visible = a > 0 && a < 1;
      if (!sp.visible) return;
      sp.position.set(d.x, 0.2 + a * 1.0, d.z);
      sp.scale.setScalar(0.4 + a * 0.9);
      sp.material.opacity = Math.sin(Math.PI * a) * 0.55;
    });
  }

  update() {}
}

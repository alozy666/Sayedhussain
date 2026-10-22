import * as THREE from 'three';
import { PALETTE } from '../../world/palette.js';
import { mat, shadowify } from '../../world/materials.js';
import { makeTree, makeRock, rockGeometry, blobGeometry, paintGradient } from '../../world/props.js';
import { phase, ease, mulberry32 } from '../../engine/mathx.js';

// المحطة 3: التجوية — تظهر شقوق في الصخرة ثم تتفتت أجزاء منها وتبقى بجانبها (لا تنتقل بعيدًا).

const ROCK_R = 2.2;
const SQUASH = 0.8;

export class WeatheringModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'weathering-model';
    this.duration = 6.6;
    this.cues = [
      { at: 0.7, sound: 'crack' },
      { at: 1.5, sound: 'crack' },
      { at: 2.45, sound: 'crumble' },
      { at: 3.3, sound: 'crumble' },
      { at: 4.2, sound: 'crumble' },
    ];
    this.center = new THREE.Vector3(-1.4, 1.35, -0.9);
    this.focus = this.center.clone();
    this.tagPos = new THREE.Vector3(-1.4, 4.6, -0.9);
    this.groundColor = PALETTE.sand;
    this.pictureView = { pos: new THREE.Vector3(2.2, 3.4, 6.2), target: new THREE.Vector3(-1.1, 1.0, -0.5), fov: 42 };
    this.pictureTime = this.duration;
    this.build();
    this.applyAt(0);
  }

  build() {
    const rand = mulberry32(31);
    const rockMat = mat('#ffffff', { vertexColors: true, roughness: 0.95 });
    const chunkMat = mat('#c4ab92', { roughness: 0.95 });
    const pebbleMat = mat('#bea58c', { roughness: 0.95, flatShading: true });

    // الصخرة الكبيرة
    const geo = blobGeometry(ROCK_R, { seed: 21, detail: 4, jitter: 0.13, squash: SQUASH, freq: 1.4 });
    paintGradient(geo, '#a2876f', '#d8c0a2');
    this.rock = new THREE.Mesh(geo, rockMat);
    this.rock.position.copy(this.center);
    this.group.add(this.rock);

    // نقاط على سطح الصخرة باستخدام الإسقاط الشعاعي (حتى تلتصق الشقوق بالسطح)
    const probe = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    const ray = new THREE.Raycaster();
    const surface = (dir) => {
      const d = dir.clone().normalize();
      ray.set(d.clone().multiplyScalar(ROCK_R * 3), d.clone().negate());
      const hit = ray.intersectObject(probe, false)[0];
      return hit ? { p: hit.point, n: hit.face.normal.clone() } : { p: d.multiplyScalar(ROCK_R), n: d };
    };

    // القطع التي ستتفتت
    const dirs = [
      [0.55, 0.62, 0.56, 0.6],
      [0.95, 0.2, 0.25, 0.55],
      [-0.42, 0.5, 0.78, 0.55],
      [0.12, 0.98, 0.18, 0.5],
      [-0.9, 0.32, 0.3, 0.5],
      [0.25, 0.18, 0.95, 0.48],
    ];
    this.chunks = [];
    const crackMat = mat('#5b4a3f', { roughness: 1 });
    this.cracks = [];
    dirs.forEach(([x, y, z, r], i) => {
      const dir = new THREE.Vector3(x, y, z).normalize();
      const { p, n } = surface(dir);
      const chunkGeo = rockGeometry(60 + i, { radius: r, squash: 0.8, jitter: 0.16, detail: 2, smooth: true });
      const chunk = new THREE.Mesh(chunkGeo, chunkMat);
      const attach = p.clone().addScaledVector(n, -r * 0.5).add(this.center);
      chunk.position.copy(attach);
      chunk.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      this.group.add(chunk);
      const horiz = new THREE.Vector3(dir.x, 0, dir.z);
      if (horiz.lengthSq() < 0.01) horiz.set(0.3, 0, 1);
      horiz.normalize();
      const land = new THREE.Vector3(this.center.x, 0, this.center.z)
        .addScaledVector(horiz, ROCK_R + 0.55 + rand() * 0.7)
        .add(new THREE.Vector3((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5));
      land.y = r * 0.42;
      this.chunks.push({
        mesh: chunk,
        attach,
        land,
        rot0: chunk.rotation.clone(),
        spin: new THREE.Vector3(rand() * 4 - 2, rand() * 4 - 2, rand() * 4 - 2),
        start: 2.45 + i * 0.36,
      });

      // شق حول القطعة على سطح الصخرة
      const loop = [];
      const t1 = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0.01)).normalize();
      const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const rr = r * (0.95 + (k % 2 ? 0.12 : -0.05));
        const q = p.clone().addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr);
        const s = surface(q);
        loop.push(s.p.addScaledVector(s.n, 0.012));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), 60, 0.035, 5, true);
      const crack = new THREE.Mesh(tube, crackMat);
      crack.position.copy(this.center);
      crack.userData.count = tube.index.count;
      crack.userData.start = 0.6 + i * 0.22;
      this.group.add(crack);
      this.cracks.push(crack);
    });
    // شقوق طويلة عبر الصخرة
    for (const [a0, a1, seed] of [
      [0.3, 2.1, 1],
      [-1.0, 0.6, 2],
    ]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const ang = a0 + (a1 - a0) * t;
        const dir = new THREE.Vector3(Math.sin(ang), 0.9 - t * 1.0 + (k % 2 ? 0.08 : -0.08) * seed, Math.cos(ang));
        const s = surface(dir);
        pts.push(s.p.addScaledVector(s.n, 0.012));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, 0.03, 5, false);
      const crack = new THREE.Mesh(tube, crackMat);
      crack.position.copy(this.center);
      crack.userData.count = tube.index.count;
      crack.userData.start = 1.2 + seed * 0.4;
      this.group.add(crack);
      this.cracks.push(crack);
    }

    // حصى صغيرة تتساقط بجانب الصخرة
    const pebbleGeo = rockGeometry(90, { radius: 0.13, detail: 0, squash: 0.7 });
    this.pebbleCount = 26;
    this.pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, this.pebbleCount);
    this.pebbleData = [];
    for (let i = 0; i < this.pebbleCount; i++) {
      const d = this.chunks[i % this.chunks.length];
      const ang = rand() * Math.PI * 2;
      const dist = ROCK_R + 0.25 + rand() * 1.1;
      this.pebbleData.push({
        from: d.attach.clone().add(new THREE.Vector3((rand() - 0.5) * 0.4, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.4)),
        to: new THREE.Vector3(this.center.x + Math.cos(ang) * dist, 0.07, this.center.z + Math.sin(ang) * dist * 0.85 + 0.3),
        start: 2.5 + rand() * 2.6,
        s: 0.6 + rand() * 0.9,
        spin: rand() * 6,
      });
    }
    this.pebbles.castShadow = true;
    this.group.add(this.pebbles);

    // نباتات صحراوية وصخور صغيرة حول المكان
    for (const [kind, v, x, z, s] of [
      ['shrub', 0, 2.6, -2.8, 1.3],
      ['shrub', 0, -5.6, 1.8, 1.1],
      ['bush', 1, -6.8, -3.4, 1.0],
      ['palm', 0, -9.6, -4.6, 1.05],
      ['palm', 1, 4.8, -5.8, 0.95],
      ['shrub', 0, 1.2, 3.6, 0.9],
    ]) {
      const t = makeTree(kind, v, s);
      t.position.set(x, 0, z);
      this.group.add(t);
    }
    for (const [x, z, r, seed] of [
      [3.6, 1.2, 0.4, 3],
      [-6.0, 4.2, 0.55, 7],
      [-4.2, -4.6, 0.7, 13],
    ]) {
      const rk = makeRock(seed, r, PALETTE.rockWarm);
      rk.position.set(x, r * 0.3, z);
      this.group.add(rk);
    }
    shadowify(this.group, true, true);
  }

  applyAt(t) {
    for (const c of this.cracks) {
      const p = ease.out(phase(t, c.userData.start, c.userData.start + 1.0));
      const count = Math.floor((c.userData.count * p) / 3) * 3;
      c.geometry.setDrawRange(0, count);
      c.visible = count > 0;
    }
    for (const ch of this.chunks) {
      const wob = phase(t, ch.start - 0.55, ch.start);
      const fall = phase(t, ch.start, ch.start + 0.75);
      const bounce = phase(t, ch.start + 0.75, ch.start + 1.15);
      const m = ch.mesh;
      if (fall <= 0) {
        m.position.copy(ch.attach);
        m.rotation.copy(ch.rot0);
        if (wob > 0) {
          m.rotation.z += Math.sin(t * 40) * 0.05 * wob;
          m.position.y += Math.abs(Math.sin(t * 35)) * 0.02 * wob;
        }
        continue;
      }
      const u = ease.in(fall);
      m.position.lerpVectors(ch.attach, ch.land, fall);
      m.position.y = ch.attach.y + (ch.land.y - ch.attach.y) * u + Math.sin(Math.PI * fall) * 0.35;
      m.position.y += Math.sin(Math.PI * bounce) * 0.16 * (1 - bounce);
      m.rotation.set(
        ch.rot0.x + ch.spin.x * Math.min(1, fall + bounce * 0.2),
        ch.rot0.y + ch.spin.y * Math.min(1, fall + bounce * 0.2),
        ch.rot0.z + ch.spin.z * Math.min(1, fall + bounce * 0.2)
      );
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    for (let i = 0; i < this.pebbleCount; i++) {
      const d = this.pebbleData[i];
      const f = phase(t, d.start, d.start + 0.7);
      const visible = f > 0;
      const u = ease.in(f);
      v.lerpVectors(d.from, d.to, f);
      v.y = d.from.y + (d.to.y - d.from.y) * u + Math.sin(Math.PI * f) * 0.25;
      e.set(d.spin * f, d.spin * 0.7 * f, 0);
      const s = visible ? d.s : 0.0001;
      m4.compose(v, q.setFromEuler(e), new THREE.Vector3(s, s, s));
      this.pebbles.setMatrixAt(i, m4);
    }
    this.pebbles.instanceMatrix.needsUpdate = true;
    const shrink = ease.out(phase(t, 2.4, 5.5));
    this.rock.scale.setScalar(1 - shrink * 0.035);
  }

  update() {}
}

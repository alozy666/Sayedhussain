import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mat, vcMat, shadowify } from './materials.js';
import { ZONE_DEFS, RING_R, ISLAND_R, zoneCenter, ringPoint, STATION_ZONE_IDS } from './layout.js';
import { createSky, createWater, createMountains, createClouds } from './env.js';
import {
  roundTreeGeometry,
  palmTreeGeometry,
  pineTreeGeometry,
  bushGeometry,
  grassTuftGeometry,
  flowerGeometry,
  rockGeometry,
  makeSignpost,
} from './props.js';
import { fbm, smoothstep, lerp, mulberry32, clamp } from '../engine/mathx.js';
import { STATIONS } from '../content/stations.js';

const SUN_DIR = new THREE.Vector3(0.55, 0.85, 0.35).normalize();

/**
 * العالم: جزيرة واحدة مترابطة تحتوي جميع المناطق، مع مسار دائري يصل بينها.
 */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'world';
    scene.add(this.root);
    this.zones = {};
    for (const [id, def] of Object.entries(ZONE_DEFS)) {
      const center = zoneCenter(def);
      const frame = new THREE.Group();
      frame.name = `zone:${id}`;
      frame.position.copy(center);
      frame.rotation.y = def.facing === 'out' ? Math.atan2(center.x, center.z) : Math.atan2(-center.x, -center.z);
      this.root.add(frame);
      frame.updateMatrixWorld(true);
      this.zones[id] = { id, def, center, frame };
    }
  }

  // ------------------------------------------------------------ الارتفاعات
  heightAt(x, z) {
    const r = Math.hypot(x, z);
    let h = 0.42 * fbm(x * 0.055 + 3.1, z * 0.055 - 1.7, 3);
    h += 5.6 * Math.exp(-(r * r) / (2 * 10.5 * 10.5));
    let flat = 0;
    for (const zone of Object.values(this.zones)) {
      const d = Math.hypot(x - zone.center.x, z - zone.center.z);
      flat = Math.max(flat, 1 - smoothstep(zone.def.flat, zone.def.flat + 5, d));
    }
    flat = Math.max(flat, 1 - smoothstep(2.2, 5.0, Math.abs(r - RING_R)));
    if (Math.abs(x) < 6 && z > RING_R - 2) flat = Math.max(flat, 1 - smoothstep(2.0, 5.0, Math.abs(x)));
    h = lerp(h, 0, flat);
    const shore = smoothstep(ISLAND_R - 3, ISLAND_R + 6, r);
    h = lerp(h, -2.8, shore);
    return h;
  }

  zoneGroundWeight(x, z) {
    let best = null;
    let w = 0;
    for (const zone of Object.values(this.zones)) {
      if (!zone.def.ground) continue;
      const d = Math.hypot(x - zone.center.x, z - zone.center.z);
      const k = 1 - smoothstep(zone.def.flat - 3, zone.def.flat + 1.5, d);
      if (k > w) {
        w = k;
        best = zone.def.ground;
      }
    }
    return { color: best, w };
  }

  // ------------------------------------------------------------ البناء
  build() {
    this.buildLights();
    this.sky = createSky(SUN_DIR);
    this.scene.add(this.sky);
    this.shoreR = this.findShoreRadius();
    this.water = createWater(this.shoreR);
    this.root.add(this.water);
    this.root.add(createMountains());
    this.clouds = createClouds();
    this.root.add(this.clouds);
    this.buildTerrain();
    this.buildPaths();
    this.buildVegetation();
    this.buildSignposts();
    this.buildCenterpiece();
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight('#d9efff', '#d9c7a0', 1.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -26;
    s.right = 26;
    s.top = 26;
    s.bottom = -26;
    s.near = 5;
    s.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.setShadowFocus(new THREE.Vector3(0, 0, 50));
    this.scene.fog = new THREE.Fog(PALETTE.horizon, 120, 430);
  }

  /** الظل يتبع المنطقة الحالية حتى يبقى حادًا وخفيفًا على الأداء. */
  setShadowFocus(p) {
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(SUN_DIR, 70);
    this.sun.target.updateMatrixWorld();
  }

  findShoreRadius() {
    for (let r = ISLAND_R - 4; r < ISLAND_R + 10; r += 0.1) {
      if (this.heightAt(r * 0.7071, r * 0.7071) < -0.55) return r;
    }
    return ISLAND_R + 2;
  }

  buildTerrain() {
    const size = 152;
    const seg = 168;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(PALETTE.grass);
    const cGrassDark = new THREE.Color(PALETTE.grassDark);
    const cGrassLight = new THREE.Color(PALETTE.grassLight);
    const cSand = new THREE.Color(PALETTE.sand);
    const cWet = new THREE.Color(PALETTE.sandDark);
    const cUnder = new THREE.Color('#9fd1c8');
    const c = new THREE.Color();
    const zc = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const r = Math.hypot(x, z);
      const n = fbm(x * 0.09, z * 0.09, 2);
      c.copy(cGrassDark).lerp(cGrass, clamp(0.55 + n * 0.9));
      c.lerp(cGrassLight, clamp(fbm(x * 0.03 + 9, z * 0.03, 2) * 0.8) * 0.5);
      const g = this.zoneGroundWeight(x, z);
      if (g.color) c.lerp(zc.set(g.color), g.w);
      c.lerp(cSand, smoothstep(ISLAND_R - 6, ISLAND_R - 2.5, r));
      c.lerp(cWet, smoothstep(this.shoreR - 2.5, this.shoreR, r));
      c.lerp(cUnder, smoothstep(this.shoreR + 0.5, this.shoreR + 6, r));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, vcMat({ roughness: 1 }));
    terrain.name = 'terrain';
    terrain.receiveShadow = true;
    this.root.add(terrain);
    this.terrain = terrain;
  }

  ribbon(points, width, color, edgeColor, yOffset = 0.05) {
    const pos = [];
    const col = [];
    const idx = [];
    const cc = new THREE.Color(color);
    const ce = new THREE.Color(edgeColor);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dir = next.clone().sub(prev).setY(0).normalize();
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      const offsets = [-0.5, -0.36, 0, 0.36, 0.5];
      for (const o of offsets) {
        const q = p.clone().addScaledVector(side, o * width);
        q.y = this.heightAt(q.x, q.z) + yOffset;
        pos.push(q.x, q.y, q.z);
        const k = Math.abs(o) > 0.4 ? ce : cc;
        col.push(k.r, k.g, k.b);
      }
    }
    const cols = 5;
    for (let i = 0; i < points.length - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = (i + 1) * cols + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, vcMat({ roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    return m;
  }

  buildPaths() {
    const ring = [];
    for (let a = 0; a <= 360; a += 1.5) ring.push(ringPoint(a));
    const path = this.ribbon(ring, 3.2, '#f2dfb4', '#e3c992');
    path.name = 'path-ring';
    this.root.add(path);
    const spur = [];
    for (let z = RING_R; z <= 58; z += 0.75) spur.push(new THREE.Vector3(0, 0, z));
    const sp = this.ribbon(spur, 3.4, '#f2dfb4', '#e3c992', 0.055);
    sp.name = 'path-spur';
    this.root.add(sp);

    // حصى صغيرة على حافتي المسار
    const stoneGeo = rockGeometry(5, { radius: 0.22, detail: 0, squash: 0.55 });
    const count = 260;
    const stones = new THREE.InstancedMesh(stoneGeo, mat('#d9cbb5', { flatShading: true }), count);
    const rand = mulberry32(5);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = RING_R + (rand() < 0.5 ? -1 : 1) * (1.75 + rand() * 0.35);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.6 + rand() * 0.8;
      m4.compose(
        new THREE.Vector3(x, this.heightAt(x, z) + 0.04, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand() * 6, 0)),
        new THREE.Vector3(s, s, s)
      );
      stones.setMatrixAt(i, m4);
    }
    stones.receiveShadow = true;
    this.root.add(stones);
  }

  /** هل الموقع صالح لزراعة النباتات؟ (بعيدًا عن المسارات والمحطات وخطوط الرؤية) */
  isFree(x, z, margin = 0) {
    const r = Math.hypot(x, z);
    if (r > ISLAND_R - 4) return false;
    if (Math.abs(r - RING_R) < 3.4 + margin) return false;
    if (Math.abs(x) < 4 + margin && z > RING_R - 3) return false;
    for (const zone of Object.values(this.zones)) {
      const d = Math.hypot(x - zone.center.x, z - zone.center.z);
      if (d < zone.def.flat + 1.5 + margin) return false;
      // ممر الرؤية بين الكاميرا والمحطة
      const toCenter = zone.center.clone().setY(0).normalize();
      const along = -(x * toCenter.x + z * toCenter.z) + zone.center.length();
      const perp = Math.abs(-x * toCenter.z + z * toCenter.x);
      if (along > 0 && along < 26 && perp < 10 + margin) return false;
    }
    return true;
  }

  buildVegetation() {
    const rand = mulberry32(2024);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    const scatter = (geo, material, count, { minS = 0.8, maxS = 1.2, filter = () => true, tries = 40, margin = 0, shadow = true } = {}) => {
      const mats = [];
      for (let i = 0; i < count; i++) {
        for (let t = 0; t < tries; t++) {
          const a = rand() * Math.PI * 2;
          const r = Math.sqrt(rand()) * (ISLAND_R - 4);
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          if (!this.isFree(x, z, margin) || !filter(x, z, r)) continue;
          const s = minS + rand() * (maxS - minS);
          e.set(0, rand() * Math.PI * 2, 0);
          m4.compose(new THREE.Vector3(x, this.heightAt(x, z) - 0.05, z), q.setFromEuler(e), new THREE.Vector3(s, s, s));
          mats.push(m4.clone());
          break;
        }
      }
      const inst = new THREE.InstancedMesh(geo, material, mats.length);
      mats.forEach((mm, i) => inst.setMatrixAt(i, mm));
      inst.castShadow = shadow;
      inst.receiveShadow = true;
      this.root.add(inst);
      return inst;
    };

    const leafMat = vcMat();
    const palmMat = vcMat({ side: THREE.DoubleSide });
    for (let v = 0; v < 3; v++) scatter(roundTreeGeometry(v), leafMat, 20, { minS: 0.85, maxS: 1.35, margin: 1 });
    scatter(roundTreeGeometry(0), leafMat, 14, { minS: 1.1, maxS: 1.5, filter: (x, z, r) => r < 15 });
    for (let v = 0; v < 2; v++) scatter(palmTreeGeometry(v), palmMat, 16, { minS: 0.9, maxS: 1.25, margin: 1, filter: (x, z, r) => r > 22 });
    scatter(pineTreeGeometry(), leafMat, 16, { minS: 0.9, maxS: 1.4, margin: 1 });
    for (let v = 0; v < 2; v++) scatter(bushGeometry(v), leafMat, 40, { minS: 0.7, maxS: 1.2 });
    scatter(grassTuftGeometry(), leafMat, 400, { minS: 0.7, maxS: 1.4, tries: 8, margin: -2.5, shadow: false });

    // الأزهار بألوان باستيلية
    const flowers = scatter(flowerGeometry(), leafMat, 300, { minS: 0.8, maxS: 1.3, tries: 8, margin: -2.2, shadow: false });
    const palette = ['#ffb3c7', '#ffe08a', '#ffffff', '#c9b6ff', '#ffc59e'];
    const fc = new THREE.Color();
    for (let i = 0; i < flowers.count; i++) flowers.setColorAt(i, fc.set(palette[i % palette.length]));
    flowers.instanceColor.needsUpdate = true;

    // صخور متناثرة
    const rockMat = mat(PALETTE.rock, { flatShading: true, roughness: 0.95 });
    scatter(rockGeometry(3, { radius: 0.7, squash: 0.6 }), rockMat, 28, { minS: 0.6, maxS: 1.6 });
    scatter(rockGeometry(8, { radius: 0.9, squash: 0.55 }), rockMat, 14, { minS: 0.6, maxS: 1.5, filter: (x, z, r) => r > 48 });
  }

  buildSignposts() {
    STATIONS.forEach((st, i) => {
      const zone = this.zones[STATION_ZONE_IDS[i]];
      const a = zone.def.angle - 9;
      const p = ringPoint(a, RING_R - 2.6);
      const sign = makeSignpost(st.name, st.number);
      sign.position.set(p.x, this.heightAt(p.x, p.z), p.z);
      sign.lookAt(0, sign.position.y, 0);
      sign.rotateY(Math.PI);
      this.root.add(sign);
    });
    const ch = this.zones.challenge;
    const p = ringPoint(ch.def.angle - 9, RING_R - 2.6);
    const sign = makeSignpost('قاعة التحدي');
    sign.position.set(p.x, this.heightAt(p.x, p.z), p.z);
    sign.lookAt(0, sign.position.y, 0);
    sign.rotateY(Math.PI);
    this.root.add(sign);
  }

  /** معلم في وسط الجزيرة: برج مراقبة صغير وعلم. */
  buildCenterpiece() {
    const g = new THREE.Group();
    const top = this.heightAt(0, 0);
    g.position.set(0, top - 0.2, 0);
    const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 5, 8);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const leg = new THREE.Mesh(legGeo, mat(PALETTE.trunk));
      leg.position.set(x * 1.1, 2.5, z * 1.1);
      g.add(leg);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 3.2), mat('#c99a6b'));
    deck.position.y = 5;
    g.add(deck);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), mat(PALETTE.coral));
    roof.position.y = 7.4;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 6), mat(PALETTE.trunk));
      p.position.set(x * 1.4, 5.95, z * 1.4);
      g.add(p);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), mat('#eeeeee'));
    pole.position.y = 9.2;
    g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(1.4, 0.8, 8, 1);
    flagGeo.translate(0.7, 0, 0);
    this.flag = new THREE.Mesh(flagGeo, mat(PALETTE.orange, { side: THREE.DoubleSide }));
    this.flag.position.y = 9.9;
    g.add(this.flag);
    this.flagBase = flagGeo.attributes.position.array.slice();
    shadowify(g);
    this.root.add(g);
  }

  update(dt, t, camera) {
    this.water.material.uniforms.uTime.value = t;
    this.clouds.rotation.y += dt * 0.004;
    if (camera) this.sky.position.copy(camera.getWorldPosition(new THREE.Vector3()));
    if (this.flag) {
      const p = this.flag.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = this.flagBase[i * 3];
        p.setZ(i, Math.sin(x * 3 - t * 5) * 0.12 * x);
      }
      p.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ أدوات المواقع
  /** يحول نقطة من إحداثيات المنطقة المحلية إلى إحداثيات العالم. */
  toWorld(zoneId, local) {
    const z = this.zones[zoneId];
    return z.frame.localToWorld(local.clone());
  }

  /** نقطة على الأرض داخل المنطقة. */
  groundPoint(zoneId, lx, lz) {
    const p = this.toWorld(zoneId, new THREE.Vector3(lx, 0, lz));
    p.y = this.heightAt(p.x, p.z);
    return p;
  }

  /** نقاط مسار المشي على الحلقة بين زاويتين. */
  ringArc(a0, a1, step = 4) {
    const pts = [];
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
    for (let i = 0; i <= n; i++) {
      const p = ringPoint(lerp(a0, a1, i / n));
      p.y = this.heightAt(p.x, p.z);
      pts.push(p);
    }
    return pts;
  }
}

export { SUN_DIR };

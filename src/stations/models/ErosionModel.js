import * as THREE from 'three';
import { PALETTE } from '../../world/palette.js';
import { mat, shadowify } from '../../world/materials.js';
import { makeTree, makeRock, rockGeometry, arrowGeometry } from '../../world/props.js';
import { phase, ease, smoothstep, mulberry32, fbm } from '../../engine/mathx.js';
import { ribbonGeometry } from './common.js';

// المحطة 4: التعرية — الماء الجاري ينقل التربة وفتات الصخور من المرتفع إلى المنخفض.

const SITE = new THREE.Vector3(-1.4, 0, -2.2);
const Z0 = -6.9;
const Z1 = 4.4;
const BASIN = new THREE.Vector2(0.5, 5.1);

function channelX(z) {
  return 0.85 * Math.sin(z * 0.38) + 0.5;
}

function heightAt(x, z) {
  const H = 2.9 * smoothstep(3.2, -5.4, z);
  const dx = x - channelX(z);
  const D = 0.48 * Math.exp(-(dx * dx) / (2 * 0.62 * 0.62)) * smoothstep(-7.8, -6.4, z) * (1 - smoothstep(4.0, 5.5, z));
  const bd = Math.hypot(x - BASIN.x, (z - BASIN.y) * 1.15);
  const basin = 0.36 * (1 - smoothstep(0.2, 2.9, bd));
  const fall = smoothstep(10, 7.6, Math.abs(x)) * smoothstep(-8, -6.6, z) * smoothstep(8, 6.6, z);
  const rough = fbm(x * 0.4, z * 0.4, 2) * 0.12;
  return 0.02 + fall * (0.4 + H - D - basin + rough * (1 - D * 1.6));
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uProgress: { value: 0 }, uRadial: { value: 0 } },
    transparent: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uProgress; uniform float uRadial;
      varying vec2 vUv;
      void main() {
        float along = vUv.y;
        float edge = abs(vUv.x - 0.5) * 2.0;
        if (uRadial < 0.5 && along > uProgress) discard;
        vec3 deep = vec3(0.30, 0.66, 0.86);
        vec3 light = vec3(0.62, 0.86, 0.96);
        float stripes = sin(along * 70.0 - uTime * 7.0 + sin(vUv.x * 9.0) * 1.5);
        float stripes2 = sin(along * 31.0 - uTime * 4.0 + vUv.x * 4.0);
        vec3 col = mix(deep, light, smoothstep(0.2, 1.0, edge) * 0.6 + 0.2);
        col += vec3(0.25) * smoothstep(0.75, 1.0, stripes) * (1.0 - edge);
        col += vec3(0.12) * smoothstep(0.6, 1.0, stripes2);
        if (uRadial > 0.5) {
          float r = length(vUv - 0.5) * 2.0;
          col = mix(light, deep, smoothstep(0.0, 1.0, 1.0 - r) * 0.7);
          col += vec3(0.18) * smoothstep(0.8, 1.0, sin(r * 22.0 - uTime * 2.0));
        }
        float a = (uRadial > 0.5) ? 0.88 : 0.92 - edge * 0.25;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
    depthWrite: false,
  });
}

export class ErosionModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'erosion-model';
    this.duration = 8.8;
    this.cues = [
      { at: 0.2, sound: 'water', dur: 8.4 },
      { at: 2.2, sound: 'pebbles', dur: 4.5 },
    ];
    this.site = new THREE.Group();
    this.site.position.copy(SITE);
    this.group.add(this.site);
    this.focus = SITE.clone().add(new THREE.Vector3(channelX(-1), 1.6, -1));
    this.groundColor = PALETTE.grass;
    this.pictureView = { pos: new THREE.Vector3(4.6, 6.8, 8.6), target: new THREE.Vector3(-1.3, 0.9, -2.0), fov: 44 };
    this.pictureTime = 5.4;
    this.build();
    this.applyAt(0);
  }

  build() {
    const rand = mulberry32(55);
    // الأرض: مرتفع في الخلف ومنخفض في الأمام مع مجرى
    const geo = new THREE.PlaneGeometry(20, 16, 110, 88);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(PALETTE.grass);
    const cGrassDark = new THREE.Color(PALETTE.grassDark);
    const cSoil = new THREE.Color('#c39a6d');
    const cBed = new THREE.Color('#9d7a5a');
    const cSand = new THREE.Color('#e5cf9f');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const dx = Math.abs(x - channelX(z));
      c.copy(cGrassDark).lerp(cGrass, 0.5 + fbm(x * 0.3, z * 0.3, 2));
      const inChannel = z > Z0 - 0.8 && z < 4.8;
      if (inChannel) c.lerp(cSoil, 1 - smoothstep(0.5, 1.25, dx));
      if (inChannel) c.lerp(cBed, 1 - smoothstep(0.15, 0.55, dx));
      const bd = Math.hypot(x - BASIN.x, (z - BASIN.y) * 1.15);
      c.lerp(cSand, 1 - smoothstep(1.8, 3.2, bd));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, mat('#ffffff', { vertexColors: true, roughness: 1 }));
    land.receiveShadow = true;
    this.site.add(land);

    // منحنى الجدول
    const pts = [];
    for (let i = 0; i <= 70; i++) {
      const z = Z0 + ((Z1 - Z0) * i) / 70;
      const x = channelX(z);
      pts.push(new THREE.Vector3(x, heightAt(x, z) + 0.07, z));
    }
    this.curve = new THREE.CatmullRomCurve3(pts);
    const waterGeo = ribbonGeometry(pts, (s) => 0.95 + s * 0.35, { yFn: (q, s) => pts[Math.round(s * 70)].y });
    this.waterMat = waterMaterial();
    this.water = new THREE.Mesh(waterGeo, this.waterMat);
    this.water.renderOrder = 2;
    this.site.add(this.water);

    // بركة في المنخفض
    this.pondMat = waterMaterial();
    this.pondMat.uniforms.uRadial.value = 1;
    this.pond = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.pondMat);
    this.pond.rotation.x = -Math.PI / 2;
    this.pond.position.set(BASIN.x, heightAt(BASIN.x, BASIN.y), BASIN.y);
    this.pondBaseY = this.pond.position.y;
    this.site.add(this.pond);

    // كومة التربة وفتات الصخور عند أعلى المجرى + صخرة متفتتة مجاورة
    const headZ = Z0 + 0.7;
    const headX = channelX(headZ);
    const bigRock = makeRock(17, 0.95, PALETTE.rockWarm, { smooth: true, detail: 2, jitter: 0.15 });
    bigRock.position.set(headX - 1.7, heightAt(headX - 1.7, headZ - 0.4) + 0.45, headZ - 0.4);
    this.site.add(bigRock);

    this.count = 34;
    const soilGeo = rockGeometry(70, { radius: 0.16, detail: 1, squash: 0.65, jitter: 0.25 });
    const pebbleGeo = rockGeometry(71, { radius: 0.15, detail: 0, squash: 0.75, jitter: 0.2 });
    this.soil = new THREE.InstancedMesh(soilGeo, mat('#a8774b', { roughness: 1, flatShading: true }), this.count);
    this.stones = new THREE.InstancedMesh(pebbleGeo, mat('#b3aba1', { roughness: 0.95, flatShading: true }), this.count);
    this.particles = [];
    for (let i = 0; i < this.count * 2; i++) {
      const isSoil = i % 2 === 0;
      const ang = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * 0.75;
      const sx = headX - 0.55 + Math.cos(ang) * rr;
      const sz = headZ + Math.sin(ang) * rr * 0.8;
      const pile = new THREE.Vector3(sx, heightAt(sx, sz) + 0.09 + (0.75 - rr) * 0.35 * rand(), sz);
      const dAng = rand() * Math.PI * 2;
      const dr = Math.sqrt(rand()) * 1.5;
      const tx = BASIN.x + Math.cos(dAng) * dr * 1.1 - 0.3;
      const tz = BASIN.y - 0.4 + Math.sin(dAng) * dr * 0.8;
      const dest = new THREE.Vector3(tx, heightAt(tx, tz) + 0.08 + rand() * 0.05, tz);
      this.particles.push({
        isSoil,
        idx: Math.floor(i / 2),
        pile,
        dest,
        start: 2.1 + (i / (this.count * 2)) * 3.6 + rand() * 0.25,
        travel: 2.4 + rand() * 0.8,
        lane: (rand() - 0.5) * 0.45,
        s: 0.75 + rand() * 0.7,
        spin: 2 + rand() * 6,
        rot: rand() * 6,
      });
    }
    this.soil.castShadow = this.stones.castShadow = true;
    this.site.add(this.soil, this.stones);

    // أسهم توضح اتجاه انتقال الفتات
    const arrowMat = mat(PALETTE.orange, { emissive: '#ff8a2a', emissiveIntensity: 0.35, roughness: 0.5 });
    this.arrows = [0.2, 0.42, 0.64, 0.84].map((u) => {
      const a = new THREE.Mesh(arrowGeometry(1.0, 0.62), arrowMat);
      const p = this.curve.getPointAt(u);
      const tng = this.curve.getTangentAt(u);
      a.position.copy(p).add(new THREE.Vector3(0, 0.55, 0));
      a.rotation.y = Math.atan2(tng.x, tng.z);
      a.rotation.x = -Math.atan2(tng.y, Math.hypot(tng.x, tng.z)) * 0.6;
      a.userData = { base: a.position.clone(), dir: tng.clone(), u };
      a.castShadow = true;
      this.site.add(a);
      return a;
    });

    // أشجار ونباتات
    const plants = [
      ['round', 0, -6.2, -6.0, 1.15],
      ['round', 2, 5.6, -5.4, 1.1],
      ['pine', 0, -8.2, -2.4, 1.0],
      ['bush', 0, -3.2, -3.6, 0.9],
      ['bush', 1, 3.2, -2.4, 0.9],
      ['bush', 0, 2.6, 6.4, 0.8],
      ['palm', 1, -9.6, -5.4, 0.95],
      ['round', 1, 10.4, -4.6, 1.0],
    ];
    for (const [kind, v, x, z, s] of plants) {
      const t = makeTree(kind, v, s);
      t.position.set(x, heightAt(x, z) - 0.05, z);
      this.site.add(t);
    }
    shadowify(this.site, true, true);
    this.water.castShadow = this.pond.castShadow = false;
    this.water.receiveShadow = this.pond.receiveShadow = false;
    this.land = land;
  }

  applyAt(t) {
    const w = ease.inOut(phase(t, 0.3, 2.4));
    this.waterMat.uniforms.uProgress.value = w <= 0 ? -1 : w * 1.01;
    this.water.visible = w > 0;
    const pondFill = ease.out(phase(t, 1.9, 3.6));
    this.pond.visible = pondFill > 0.01;
    this.pond.scale.setScalar(0.4 + pondFill * 1.6);
    this.pond.position.y = this.pondBaseY + 0.03 + pondFill * 0.12;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    for (const p of this.particles) {
      const f = phase(t, p.start, p.start + p.travel);
      if (f <= 0) {
        v.copy(p.pile);
        e.set(p.rot, p.rot * 0.5, 0);
      } else if (f < 0.88) {
        const u = Math.min(1, 0.04 + (f / 0.88) * 0.96);
        v.copy(this.curve.getPointAt(u));
        const tng = this.curve.getTangentAt(u);
        const side = new THREE.Vector3(tng.z, 0, -tng.x).normalize();
        v.addScaledVector(side, p.lane);
        v.y += 0.06 + Math.abs(Math.sin(f * 30 + p.rot)) * 0.06;
        // دخول المجرى من الكومة بسلاسة
        const enter = Math.min(1, f / 0.1);
        v.lerpVectors(p.pile, v.clone(), enter);
        e.set(p.rot + f * p.spin * 4, p.rot * 0.5 + f * p.spin, 0);
      } else {
        const g = (f - 0.88) / 0.12;
        v.lerpVectors(this.curve.getPointAt(1), p.dest, ease.out(g));
        v.y = Math.max(v.y, p.dest.y);
        e.set(p.rot + p.spin * 3.5, p.rot * 0.5 + p.spin * 0.9, 0);
      }
      m4.compose(v, q.setFromEuler(e), new THREE.Vector3(p.s, p.s, p.s));
      (p.isSoil ? this.soil : this.stones).setMatrixAt(p.idx, m4);
    }
    this.soil.instanceMatrix.needsUpdate = true;
    this.stones.instanceMatrix.needsUpdate = true;
    this.arrowLevel = ease.outBack(phase(t, 2.4, 3.0));
  }

  update(dt, time) {
    this.waterMat.uniforms.uTime.value = time;
    this.pondMat.uniforms.uTime.value = time;
    const lvl = this.arrowLevel ?? 0;
    for (const a of this.arrows) {
      a.visible = lvl > 0.01;
      if (!a.visible) continue;
      const slide = ((time * 0.8 + a.userData.u * 3) % 1) * 0.5;
      a.position.copy(a.userData.base).addScaledVector(a.userData.dir, slide - 0.25);
      a.position.y += Math.sin(time * 3 + a.userData.u * 8) * 0.06;
      a.scale.setScalar(Math.max(0.001, lvl));
    }
  }
}

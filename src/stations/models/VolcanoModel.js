import * as THREE from 'three';
import { PALETTE } from '../../world/palette.js';
import { mat, shadowify } from '../../world/materials.js';
import { makeTree, makeRock, makePuffs } from '../../world/props.js';
import { phase, ease, noise2, smoothstep } from '../../engine/mathx.js';

// المحطة 2: البركان — الحمم تظهر في الفوهة ثم تتدفق ببطء على الجانب مع دخان خفيف.

const PROFILE = [
  [7.4, 0.0],
  [6.9, 0.35],
  [5.8, 1.2],
  [4.6, 2.3],
  [3.5, 3.6],
  [2.6, 4.9],
  [2.0, 5.95],
  [1.78, 6.35],
  [1.55, 6.5],
  [1.32, 6.35],
  [1.12, 5.8],
  [0.0, 5.7],
];
const TOP_Y = 6.5;
const CRATER_FLOOR = 5.72;
const FLOW_PHI = 0.42;

function lavaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uProgress: { value: 0 }, uRadial: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uProgress; uniform float uRadial;
      varying vec2 vUv;
      void main() {
        float along = vUv.y;
        float across = vUv.x;
        if (uRadial > 0.5) { along = 0.0; across = 0.5; }
        float edge = abs(across - 0.5) * 2.0;
        float wob = 0.86 + 0.12 * sin(along * 45.0 + 1.3) + 0.05 * sin(along * 13.0);
        if (uRadial < 0.5 && edge > wob) discard;
        float front = uProgress - 0.05 * (1.0 - edge * edge);
        if (along > front) discard;
        float flow = sin(along * 26.0 - uTime * 2.2 + sin(across * 7.0) * 1.4) * 0.5 + 0.5;
        float flow2 = sin(along * 9.0 - uTime * 1.3 + across * 3.0) * 0.5 + 0.5;
        vec3 deep = vec3(0.80, 0.22, 0.16);
        vec3 mid = vec3(0.98, 0.42, 0.15);
        vec3 hot = vec3(1.0, 0.72, 0.32);
        vec3 col = mix(mid, deep, smoothstep(0.35, 1.0, edge));
        col = mix(col, hot, flow * (1.0 - edge) * 0.55 + flow2 * 0.15);
        // الطرف المتقدم أكثر توهجًا قليلًا
        col = mix(col, hot, smoothstep(front - 0.06, front, along) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** تموج سطح البركان (مشترك بين الجسم ومجرى الحمم حتى يلتصق المجرى بالسطح). */
function bump(ang, y) {
  if (y <= 0.2 || y >= 6.3) return 0;
  const k = smoothstep(0.2, 0.8, y) * (1 - smoothstep(5.6, 6.3, y));
  return (noise2(ang * 3.0, y * 0.7) * 0.1 + noise2(ang * 8.0, y * 1.8) * 0.035) * k;
}

function surfaceRadius(ang, y) {
  return profileRadius(y) * (1 + bump(ang, y));
}

function profileRadius(y) {
  // نصف القطر الخارجي عند ارتفاع y (الجزء الصاعد من المقطع)
  for (let i = 0; i < 8; i++) {
    const [r0, y0] = PROFILE[i];
    const [r1, y1] = PROFILE[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return y > TOP_Y ? PROFILE[8][0] : PROFILE[0][0];
}

export class VolcanoModel {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'volcano-model';
    this.duration = 9.0;
    this.cues = [
      { at: 0.3, sound: 'rumbleSoft', dur: 2.2 },
      { at: 1.6, sound: 'bubbles', dur: 6.5 },
      { at: 2.4, sound: 'hiss' },
    ];
    this.center = new THREE.Vector3(-1.4, 0, -3.6);
    this.focus = this.center.clone().setY(TOP_Y * 1.12);
    this.groundColor = '#c9b39a';
    this.pictureView = { pos: new THREE.Vector3(3.5, 6.0, 14.5), target: new THREE.Vector3(-1.2, 3.2, -3.4), fov: 42 };
    this.pictureTime = this.duration;
    this.smokeLevel = 0;
    this.build();
    this.applyAt(0);
  }

  build() {
    const g = new THREE.Group();
    g.position.copy(this.center);
    g.scale.setScalar(1.12);
    this.group.add(g);
    this.volcano = g;

    // جسم البركان (مقطع دوراني) بتدرج لوني
    const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 72);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const cBase = new THREE.Color('#9cc68e');
    const cMid = new THREE.Color('#b0907a');
    const cTop = new THREE.Color('#8c7062');
    const cIn = new THREE.Color('#5d473c');
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = Math.hypot(v.x, v.z);
      const ang = Math.atan2(v.x, v.z);
      if (r > 1.6) {
        const n = bump(ang, v.y);
        v.x *= 1 + n;
        v.z *= 1 + n;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      const inside = r < 1.5 && v.y > 5.6;
      c.copy(cBase).lerp(cMid, smoothstep(0.4, 2.6, v.y));
      c.lerp(cTop, smoothstep(3.5, 6.2, v.y));
      if (inside) c.copy(cIn);
      // أخاديد فاتحة لإبراز الشكل
      c.multiplyScalar(0.92 + 0.12 * (noise2(ang * 6.0, v.y * 0.5) * 0.5 + 0.5));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const body = new THREE.Mesh(geo, mat('#ffffff', { vertexColors: true, roughness: 0.95 }));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // بركة الحمم داخل الفوهة
    this.lavaPoolMat = lavaMaterial();
    this.lavaPoolMat.uniforms.uRadial.value = 1;
    this.lavaPoolMat.uniforms.uProgress.value = 2;
    this.lavaPool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.lavaPoolMat);
    this.lavaPool.rotation.x = -Math.PI / 2;
    g.add(this.lavaPool);

    // مجرى الحمم على جانب البركان
    const flowPts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const y = TOP_Y - 0.02 - s * (TOP_Y - 0.08);
      const phi = FLOW_PHI + 0.22 * Math.sin(s * 3.4) + s * 0.15;
      const r = surfaceRadius(phi, y) + 0.07;
      flowPts.push({ p: new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r), phi, s });
    }
    const posArr = [];
    const uvArr = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const { p, phi, s } = flowPts[i];
      const tangentSide = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
      const w = 0.55 + s * 0.75;
      for (const k of [-1, 1]) {
        const q = p.clone().addScaledVector(tangentSide, (k * w) / 2);
        // نرفع الطرفين قليلًا ليلامس السطح المنحني
        const rq = Math.hypot(q.x, q.z);
        const target = surfaceRadius(Math.atan2(q.x, q.z), q.y) + 0.08;
        q.x *= target / rq;
        q.z *= target / rq;
        posArr.push(q.x, q.y, q.z);
        uvArr.push(k < 0 ? 0 : 1, s);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    fg.setIndex(idx);
    fg.computeVertexNormals();
    this.flowMat = lavaMaterial();
    this.flow = new THREE.Mesh(fg, this.flowMat);
    g.add(this.flow);

    // بقعة الحمم عند القاعدة
    const end = flowPts[N].p;
    this.basePoolMat = lavaMaterial();
    this.basePoolMat.uniforms.uRadial.value = 1;
    this.basePoolMat.uniforms.uProgress.value = 2;
    this.basePool = new THREE.Mesh(new THREE.CircleGeometry(1, 32), this.basePoolMat);
    this.basePool.rotation.x = -Math.PI / 2;
    this.basePool.position.set(end.x * 1.04, 0.06, end.z * 1.04);
    this.basePool.scale.set(1.3, 0.9, 1);
    g.add(this.basePool);

    // توهج خفيف
    this.glow = new THREE.PointLight('#ff8a4a', 0, 16, 2);
    this.glow.position.set(0, TOP_Y + 1.2, 0.6);
    g.add(this.glow);

    // دخان خفيف رمادي فاتح
    this.smoke = makePuffs(16, '#d9d2cc', 0.6);
    this.smoke.position.y = TOP_Y;
    g.add(this.smoke);

    // صخور ونباتات حول البركان
    const rocks = [
      [5.2, 2.6, 0.7, 1],
      [-6.0, 1.8, 0.9, 4],
      [3.4, 4.6, 0.45, 6],
      [-4.2, 4.6, 0.55, 8],
      [7.2, -1.0, 0.6, 12],
    ];
    for (const [x, z, r, seed] of rocks) {
      const rock = makeRock(seed, r, '#8f8178');
      rock.position.set(x + this.center.x, r * 0.3, z + this.center.z);
      this.group.add(rock);
    }
    for (const [kind, v, x, z, s] of [
      ['palm', 1, 6.8, 2.5, 1.0],
      ['bush', 0, -7.6, 3.2, 1.0],
      ['shrub', 0, 4.2, 5.4, 1.2],
      ['shrub', 0, -3.0, 6.0, 1.0],
      ['round', 1, -9.5, -1.5, 1.1],
    ]) {
      const t = makeTree(kind, v, s);
      t.position.set(x + this.center.x, 0, z + this.center.z);
      this.group.add(t);
    }
    shadowify(this.group, true, true);
    this.flow.castShadow = false;
    this.lavaPool.castShadow = false;
    this.basePool.castShadow = false;
  }

  applyAt(t) {
    // 1) ارتفاع الحمم داخل الفوهة
    const rise = ease.inOut(phase(t, 0.6, 2.4));
    const y = CRATER_FLOOR - 0.1 + rise * (TOP_Y - 0.06 - CRATER_FLOOR + 0.1);
    this.lavaPool.position.y = y;
    const rPool = 1.12 + (1.48 - 1.12) * rise;
    this.lavaPool.scale.setScalar(rPool);
    this.lavaPool.visible = rise > 0.01;
    // 2) التدفق البطيء على الجانب
    const flowP = phase(t, 2.3, 7.8);
    this.flowMat.uniforms.uProgress.value = flowP <= 0 ? -1 : ease.inOut(flowP) * 1.02;
    this.flow.visible = flowP > 0;
    // 3) بقعة صغيرة عند القاعدة
    const pool = ease.out(phase(t, 7.4, 8.8));
    this.basePool.visible = pool > 0.01;
    this.basePool.scale.set(1.4 * pool, 0.95 * pool, 1);
    // 4) الدخان والتوهج
    this.smokeLevel = smoothstep(0.8, 2.6, t);
    this.glow.intensity = rise * 22;
  }

  update(dt, time) {
    for (const m of [this.flowMat, this.lavaPoolMat, this.basePoolMat]) m.uniforms.uTime.value = time;
    const n = this.smoke.children.length;
    this.smoke.children.forEach((sp, i) => {
      const age = (time * 0.11 + i / n) % 1;
      sp.visible = this.smokeLevel > 0.01;
      if (!sp.visible) return;
      const a = i * 2.39;
      sp.position.set(Math.sin(a) * 0.45 + age * 1.6, 0.4 + age * 6.2, Math.cos(a) * 0.45 - age * 0.4);
      sp.scale.setScalar(1.0 + age * 3.4);
      sp.material.opacity = this.smokeLevel * 0.6 * Math.sin(Math.PI * age);
    });
  }
}

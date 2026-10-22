import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mat } from './materials.js';
import { cloudGeometry, cloudMaterial, blobGeometry, paintGradient } from './props.js';
import { mulberry32 } from '../engine/mathx.js';

// السماء والماء والجبال البعيدة والسحب.

export function createSky(sunDir) {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.skyTop) },
      uSky: { value: new THREE.Color(PALETTE.sky) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uSunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uSky; uniform vec3 uHorizon; uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uSky, smoothstep(-0.02, 0.22, h));
        col = mix(col, uTop, smoothstep(0.22, 0.9, h));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.95, 0.82) * (pow(s, 90.0) * 0.55 + pow(s, 10.0) * 0.07);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, material);
  sky.name = 'sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

export function createWater(shoreR) {
  const geo = new THREE.CircleGeometry(520, 96);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color('#8fdbe6') },
        uMid: { value: new THREE.Color(PALETTE.water) },
        uDeep: { value: new THREE.Color(PALETTE.waterDeep) },
        uFoam: { value: new THREE.Color(PALETTE.foam) },
        uShoreR: { value: shoreR },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uFoam; uniform float uShoreR;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float r = length(vWorld.xz);
        float d = r - uShoreR;
        vec3 col = mix(uShallow, uMid, smoothstep(0.0, 9.0, d));
        col = mix(col, uDeep, smoothstep(12.0, 70.0, d));
        float w = sin(vWorld.x * 0.32 + uTime * 0.7) * sin(vWorld.z * 0.27 - uTime * 0.55);
        float w2 = sin((vWorld.x - vWorld.z) * 0.8 + uTime * 1.2) * 0.5 + 0.5;
        col += vec3(0.07) * smoothstep(0.55, 1.0, w * 0.5 + 0.5) * w2;
        float ang = atan(vWorld.z, vWorld.x);
        float wob = sin(ang * 9.0 + uTime * 0.8) * 0.35 + sin(uTime * 0.9) * 0.3;
        float foam = 1.0 - smoothstep(0.0, 1.1, abs(d - 0.6 - wob));
        float foam2 = (1.0 - smoothstep(0.0, 0.5, abs(d - 3.2 - wob * 1.4 - sin(uTime * 0.6) * 0.8))) * 0.45;
        col = mix(col, uFoam, clamp(foam * 0.9 + foam2, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(geo, material);
  water.name = 'water';
  water.position.y = -0.55;
  water.receiveShadow = false;
  return water;
}

export function createMountains() {
  const g = new THREE.Group();
  g.name = 'mountains';
  const rand = mulberry32(77);
  const colors = [
    ['#8fbfa6', '#c4e0cf'],
    ['#93bdb4', '#cfe5dc'],
    ['#a3c7ae', '#d6eadb'],
  ];
  const count = 20;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.15;
    const r = 180 + rand() * 50;
    const radius = 30 + rand() * 18;
    const geo = blobGeometry(radius, { seed: 200 + i, detail: 2, jitter: 0.12, freq: 1.1 });
    geo.scale(1, 0.55 + rand() * 0.35, 0.8);
    const [lo, hi] = colors[i % colors.length];
    paintGradient(geo, lo, hi, 0, radius * 0.9);
    const m = new THREE.Mesh(geo, mat('#ffffff', { vertexColors: true, roughness: 1 }));
    m.position.set(Math.cos(a) * r, -6, Math.sin(a) * r);
    m.rotation.y = rand() * Math.PI;
    g.add(m);
  }
  return g;
}

export function createClouds() {
  const g = new THREE.Group();
  g.name = 'clouds';
  const rand = mulberry32(11);
  const material = cloudMaterial();
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = 70 + rand() * 170;
    const m = new THREE.Mesh(cloudGeometry((i % 6) + 1), material);
    m.position.set(Math.cos(a) * r, 42 + rand() * 32, Math.sin(a) * r);
    m.rotation.y = rand() * Math.PI;
    m.scale.setScalar(0.9 + rand() * 0.9);
    g.add(m);
  }
  return g;
}

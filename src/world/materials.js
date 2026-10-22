import * as THREE from 'three';

// خامات «صلصال» ناعمة مشتركة لتقليل عدد الخامات وتحسين الأداء.
const cache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
    cache.set(key, m);
  }
  return m;
}

/** خامة تعتمد على ألوان الرؤوس (Vertex Colors). */
export function vcMat(opts = {}) {
  return mat('#ffffff', { vertexColors: true, ...opts });
}

/** خامة بلا إضاءة للنصوص واللوحات حتى تبقى واضحة وحادة. */
export function uiMat(map, opts = {}) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    toneMapped: false,
    fog: false,
    ...opts,
  });
}

/** يفعّل الظلال لكل الشبكات داخل الكائن. */
export function shadowify(obj, cast = true, receive = true) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

/** يلوّن هندسة كاملة بلون واحد (لدمجها مع هندسات أخرى بألوان مختلفة). */
export function paintGeometry(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** يحوّل الهندسة لصيغة قابلة للدمج: بلا فهرس وبلا UV. */
export function mergeable(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}

/** خامة تكشف الشبكة تدريجيًا وفق سمة aReveal (0..1) وقيمة uReveal. */
export function revealMaterial(base) {
  const m = base.clone();
  m.userData.uniforms = { uReveal: { value: 0 } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = m.userData.uniforms.uReveal;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aReveal;\nvarying float vReveal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReveal = aReveal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;\nvarying float vReveal;')
      .replace('void main() {', 'void main() {\nif (vReveal > uReveal) discard;');
  };
  m.customProgramCacheKey = () => 'reveal-' + base.type;
  return m;
}

export function setReveal(material, v) {
  material.userData.uniforms.uReveal.value = v;
}

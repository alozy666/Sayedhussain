import * as THREE from 'three';

/** هل يدعم المتصفح WebGL2؟ (Three.js الحديث يتطلبه) */
export function supportsWebGL2() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.xr.enabled = true;
  renderer.domElement.id = 'world-canvas';
  renderer.domElement.setAttribute('aria-label', 'عالم المغامرة ثلاثي الأبعاد');
  renderer.domElement.tabIndex = 0;
  container.appendChild(renderer.domElement);
  return renderer;
}

/** يراقب أداء الإطارات ويخفض الدقة تلقائيًا إذا كان الجهاز بطيئًا. */
export class AdaptiveQuality {
  constructor(renderer) {
    this.renderer = renderer;
    this.samples = [];
    this.cooldown = 4;
    this.minRatio = 0.85;
  }

  update(dt) {
    if (this.renderer.xr.isPresenting) return;
    this.cooldown -= dt;
    this.samples.push(dt);
    if (this.samples.length > 90) this.samples.shift();
    if (this.cooldown > 0 || this.samples.length < 90) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const ratio = this.renderer.getPixelRatio();
    if (avg > 1 / 38 && ratio > this.minRatio) {
      this.renderer.setPixelRatio(Math.max(this.minRatio, ratio - 0.25));
      this.cooldown = 4;
      this.samples.length = 0;
    }
  }
}

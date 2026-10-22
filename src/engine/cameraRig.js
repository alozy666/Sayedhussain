import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ease } from './mathx.js';

const MOVE_KEYS = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * كاميرا استكشاف سهلة للأطفال:
 *  • سحب الماوس لتدوير الرؤية ضمن حدود مريحة حول المحطة.
 *  • العجلة للتقريب والإبعاد ضمن حدود.
 *  • WASD أو الأسهم لتحريك بسيط (اختياري).
 *  • انتقالات بطيئة وسلسة، ولا اهتزاز للكاميرا أبدًا.
 */
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    const c = new OrbitControls(camera, dom);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.rotateSpeed = 0.45;
    c.zoomSpeed = 0.7;
    c.minPolarAngle = 0.32;
    c.maxPolarAngle = 1.38;
    this.controls = c;
    this.view = null;
    this.transition = null;
    this.keys = new Set();
    this.keyboardEnabled = true;

    window.addEventListener('keydown', (e) => {
      if (!this.keyboardEnabled || !(e.code in MOVE_KEYS)) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.body.classList.contains('modal-open')) return;
      this.keys.add(e.code);
      e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get target() {
    return this.controls.target;
  }

  resetDeltas() {
    const c = this.controls;
    c._sphericalDelta?.set(0, 0, 0);
    c._panOffset?.set(0, 0, 0);
    if ('_scale' in c) c._scale = 1;
  }

  applyLimits(view) {
    const c = this.controls;
    const off = view.pos.clone().sub(view.target);
    const dist = off.length();
    c.minDistance = view.minDist ?? dist * 0.55;
    c.maxDistance = view.maxDist ?? dist * 1.35;
    const az = Math.atan2(off.x, off.z);
    const range = view.azRange ?? 0.85;
    if (range >= Math.PI) {
      c.minAzimuthAngle = -Infinity;
      c.maxAzimuthAngle = Infinity;
    } else {
      c.minAzimuthAngle = wrapAngle(az - range);
      c.maxAzimuthAngle = wrapAngle(az + range);
    }
    c.cursor.copy(view.target);
    c.maxTargetRadius = view.moveRadius ?? 3.5;
  }

  freeLimits() {
    const c = this.controls;
    c.minDistance = 0;
    c.maxDistance = Infinity;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.maxTargetRadius = Infinity;
  }

  /** ينقل الكاميرا إلى منظر جديد (فورًا أو بانتقال سلس). */
  setView(view, { instant = false, duration = 1.8 } = {}) {
    this.view = { ...view, pos: view.pos.clone(), target: view.target.clone() };
    if (instant) {
      this.transition = null;
      this.freeLimits();
      this.camera.position.copy(view.pos);
      this.controls.target.copy(view.target);
      this.resetDeltas();
      this.controls.update();
      this.applyLimits(this.view);
      this.controls.enabled = true;
      return Promise.resolve();
    }
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    return this.runPath(
      (p) => {
        const k = ease.inOut(p);
        return {
          pos: fromPos.clone().lerp(view.pos, k),
          target: fromTarget.clone().lerp(view.target, k),
        };
      },
      duration
    );
  }

  /** انتقال على مسار مخصص: fn(p) → {pos, target} ، ثم تثبيت المنظر الحالي. */
  runPath(fn, duration) {
    this.transition?.resolve();
    this.controls.enabled = false;
    this.freeLimits();
    this.resetDeltas();
    return new Promise((resolve) => {
      this.transition = { fn, duration: Math.max(0.01, duration), t: 0, resolve };
    });
  }

  resetView() {
    if (!this.view) return Promise.resolve();
    return this.setView(this.view, { duration: 1.0 });
  }

  update(dt) {
    const tr = this.transition;
    if (tr) {
      tr.t += dt;
      const p = Math.min(1, tr.t / tr.duration);
      const { pos, target } = tr.fn(p);
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      if (p >= 1) {
        this.transition = null;
        if (this.view) {
          this.resetDeltas();
          this.controls.update();
          this.applyLimits(this.view);
        }
        this.controls.enabled = true;
        tr.resolve();
      }
      return;
    }
    if (this.keys.size && this.controls.enabled) {
      let fx = 0;
      let fz = 0;
      for (const k of this.keys) {
        fx += MOVE_KEYS[k][0];
        fz += MOVE_KEYS[k][1];
      }
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const delta = fwd.multiplyScalar(fz).add(right.multiplyScalar(fx));
      if (delta.lengthSq() > 0) {
        delta.normalize().multiplyScalar(5 * dt);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
    }
    this.controls.update(dt);
  }

  get busy() {
    return !!this.transition;
  }
}

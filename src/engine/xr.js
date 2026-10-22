import * as THREE from 'three';
import { animate } from './ticker.js';

/**
 * دعم الواقع الافتراضي عبر WebXR (ميزة إضافية).
 * المستخدم داخل «حامل» (player) يوضع عند نقطة مشاهدة كل محطة،
 * والتنقل بين المحطات بالتلاشي (fade) بدل الحركة المستمرة لراحة المستخدم.
 */
export class XRSupport {
  constructor({ renderer, scene, camera, player, interaction }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.interaction = interaction;
    this.supported = false;
    this.session = null;
    this.listeners = new Set();

    // قناع التلاشي أمام العين
    this.fadeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#dff3fb', side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false })
    );
    this.fadeMesh.renderOrder = 999;
    this.fadeMesh.visible = false;
    camera.add(this.fadeMesh);

    this.setupControllers();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  async checkSupport() {
    try {
      this.supported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
    } catch {
      this.supported = false;
    }
    return this.supported;
  }

  get presenting() {
    return this.renderer.xr.isPresenting;
  }

  setupControllers() {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#ffad5c' }));
      line.scale.z = 8;
      c.add(line);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      c.add(tip);
      this.player.add(c);
      this.interaction.addXRController(c, line);
      const grip = this.renderer.xr.getControllerGrip(i);
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.025, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: '#5fb4e6', roughness: 0.5 })
      );
      handle.rotation.x = Math.PI / 2;
      grip.add(handle);
      this.player.add(grip);
    }
  }

  async enter() {
    if (!navigator.xr) return false;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      this.renderer.xr.setReferenceSpaceType('local-floor');
      await this.renderer.xr.setSession(session);
      this.session = session;
      session.addEventListener('end', () => {
        this.session = null;
        this.player.position.set(0, 0, 0);
        this.player.rotation.set(0, 0, 0);
        for (const fn of this.listeners) fn(false);
      });
      for (const fn of this.listeners) fn(true);
      return true;
    } catch (e) {
      console.warn('تعذر بدء جلسة VR', e);
      return false;
    }
  }

  exit() {
    this.session?.end();
  }

  /** يضع المستخدم واقفًا عند نقطة معينة وينظر نحو هدف. */
  placeAt(groundPos, lookTarget) {
    this.player.position.copy(groundPos);
    const dx = lookTarget.x - groundPos.x;
    const dz = lookTarget.z - groundPos.z;
    this.player.rotation.set(0, Math.atan2(-dx, -dz), 0);
  }

  async fade(to, seconds = 0.35) {
    const m = this.fadeMesh.material;
    this.fadeMesh.visible = true;
    const from = m.opacity;
    // نستخدم ساعة اللعبة لأن requestAnimationFrame لا يعمل أثناء جلسة VR
    await animate(seconds, (p) => (m.opacity = from + (to - from) * p)).done;
    if (to === 0) this.fadeMesh.visible = false;
  }
}

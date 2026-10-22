import * as THREE from 'three';

// نظام تفاعل موحد: الماوس (أو اللمس) ووحدات تحكم VR تستخدم المسار نفسه.
// كل عنصر تفاعلي يسجل شبكة (mesh) ومعالجًا: { id, onClick, onHover(bool), enabled() }

const CLICK_MOVE_PX = 7;
const CLICK_MAX_MS = 1200;

function visibleChain(obj) {
  let o = obj;
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

export class Interaction {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.items = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerInside = false;
    this.mouseHovered = null;
    this.down = null;
    this.dragging = false;
    this.locked = false; // يمنع التفاعل أثناء الانتقالات
    this.xrSources = [];
    this._tmpMat = new THREE.Matrix4();

    dom.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      this.pointerInside = true;
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_MOVE_PX) {
        this.dragging = true;
      }
    });
    dom.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.setMouseHover(null);
    });
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.setPointer(e);
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragging = false;
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      const wasDrag = this.dragging;
      this.dragging = false;
      this.updateCursor();
      if (!d || wasDrag || e.target !== this.dom) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved > CLICK_MOVE_PX || performance.now() - d.t > CLICK_MAX_MS) return;
      this.setPointer(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const h = this.pick(this.raycaster);
      if (h) this.activate(h);
    });
  }

  setPointer(e) {
    const r = this.dom.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  add(mesh, handler) {
    handler.mesh = mesh;
    handler.hoverCount = 0;
    this.items.set(mesh, handler);
    return () => this.remove(mesh);
  }

  remove(mesh) {
    const h = this.items.get(mesh);
    if (!h) return;
    if (this.mouseHovered === h) this.setMouseHover(null);
    this.items.delete(mesh);
  }

  isActive(h) {
    return visibleChain(h.mesh) && (h.enabled ? h.enabled() !== false : true);
  }

  candidates() {
    const out = [];
    for (const [mesh, h] of this.items) if (this.isActive(h)) out.push(mesh);
    return out;
  }

  pick(raycaster) {
    if (this.locked) return null;
    const hits = raycaster.intersectObjects(this.candidates(), false);
    return hits.length ? this.items.get(hits[0].object) : null;
  }

  activate(h) {
    if (this.locked || !this.isActive(h)) return;
    h.onClick?.();
  }

  changeHover(h, delta) {
    if (!h) return;
    const before = h.hoverCount > 0;
    h.hoverCount = Math.max(0, h.hoverCount + delta);
    const after = h.hoverCount > 0;
    if (before !== after) h.onHover?.(after);
  }

  setMouseHover(h) {
    if (h === this.mouseHovered) return;
    this.changeHover(this.mouseHovered, -1);
    this.mouseHovered = h;
    this.changeHover(h, +1);
    this.updateCursor();
  }

  updateCursor() {
    this.dom.style.cursor = this.mouseHovered ? 'pointer' : this.dragging ? 'grabbing' : 'grab';
  }

  /** يُستدعى كل إطار لتحديث حالة المرور فوق العناصر. */
  update(xrPresenting = false) {
    if (!xrPresenting && this.pointerInside && !this.dragging) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      this.setMouseHover(this.pick(this.raycaster));
    } else if (xrPresenting) {
      this.setMouseHover(null);
    }
    // تحديث أشعة وحدات التحكم في VR
    for (const src of this.xrSources) {
      if (!xrPresenting || !src.controller.visible) {
        if (src.hovered) {
          this.changeHover(src.hovered, -1);
          src.hovered = null;
        }
        continue;
      }
      this.setRayFromController(src.controller);
      const hit = this.raycaster.intersectObjects(this.candidates(), false)[0];
      const h = this.locked ? null : hit ? this.items.get(hit.object) : null;
      if (h !== src.hovered) {
        this.changeHover(src.hovered, -1);
        src.hovered = h;
        this.changeHover(h, +1);
      }
      if (src.line) src.line.scale.z = hit ? hit.distance : 8;
    }
  }

  setRayFromController(controller) {
    this._tmpMat.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tmpMat);
  }

  addXRController(controller, line) {
    const src = { controller, line, hovered: null };
    this.xrSources.push(src);
    controller.addEventListener('select', () => {
      this.setRayFromController(controller);
      const h = this.pick(this.raycaster);
      if (h) this.activate(h);
    });
  }

  // ---- أدوات للاختبار الآلي ----
  findById(id) {
    for (const h of this.items.values()) if (h.id === id) return h;
    return null;
  }

  listActiveIds() {
    return [...this.items.values()].filter((h) => this.isActive(h)).map((h) => h.id);
  }

  /** موضع مركز العنصر على الشاشة بإحداثيات الصفحة. */
  screenPosition(id) {
    const h = this.findById(id);
    if (!h || !this.isActive(h)) return null;
    const box = new THREE.Box3().setFromObject(h.mesh);
    const c = box.getCenter(new THREE.Vector3()).project(this.camera);
    const r = this.dom.getBoundingClientRect();
    return { x: r.left + ((c.x + 1) / 2) * r.width, y: r.top + ((1 - c.y) / 2) * r.height, z: c.z };
  }
}

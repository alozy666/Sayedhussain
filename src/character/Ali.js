import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../world/palette.js';
import { damp, clamp } from '../engine/mathx.js';

// =====================================================================
//  المستكشف علي — طفل بحريني كرتوني بثوب أبيض وغترة بيضاء وعقال أسود.
//  شخصية واحدة تُستخدم في كل المشاهد (لا يتغير الوجه أو الملابس أو الألوان).
//  الحركات: idle | wave | point | think | thumbsUp | encourage | celebrate | walk
// =====================================================================

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });
}

/** خامة الحد الخارجي الكرتوني (Inverted Hull). */
function outlineMaterial(thickness = 0.012) {
  const m = new THREE.MeshBasicMaterial({ color: '#2b3d58', side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed += normalize(normal) * ${thickness.toFixed(4)};`
    );
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  return m;
}

const OUTLINE = {
  thin: null,
  mid: null,
};

function withOutline(mesh, kind = 'mid') {
  if (!OUTLINE[kind]) OUTLINE[kind] = outlineMaterial(kind === 'thin' ? 0.008 : 0.013);
  const o = new THREE.Mesh(mesh.geometry, OUTLINE[kind]);
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  mesh.add(o);
  return mesh;
}

const MATS = {};
function mats() {
  if (MATS.skin) return MATS;
  MATS.skin = std(PALETTE.skin, { roughness: 0.65 });
  MATS.thobe = std(PALETTE.thobe, { roughness: 0.92 });
  MATS.ghutra = std('#ffffff', { roughness: 0.95, side: THREE.DoubleSide });
  MATS.agal = std(PALETTE.agal, { roughness: 0.5 });
  MATS.hair = std(PALETTE.hair, { roughness: 0.6 });
  MATS.eyeWhite = std('#ffffff', { roughness: 0.25 });
  MATS.iris = std(PALETTE.eyeIris, { roughness: 0.25 });
  MATS.pupil = std('#111111', { roughness: 0.2 });
  MATS.shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  MATS.brow = std('#2a1c16', { roughness: 0.7 });
  MATS.lip = std(PALETTE.lip, { roughness: 0.5 });
  MATS.mouthIn = std('#7a2f2b', { roughness: 0.6 });
  MATS.tongue = std('#e57f7a', { roughness: 0.6 });
  MATS.blush = new THREE.MeshBasicMaterial({ color: PALETTE.blush, transparent: true, opacity: 0.45, depthWrite: false });
  MATS.sandal = std(PALETTE.sandal, { roughness: 0.7 });
  MATS.button = std('#d8d2c4', { roughness: 0.4 });
  MATS.nose = std(PALETTE.skinShade, { roughness: 0.65 });
  return MATS;
}

const POSES = ['idle', 'wave', 'point', 'think', 'thumbsUp', 'encourage', 'celebrate', 'walk'];

export class Ali extends THREE.Group {
  constructor() {
    super();
    this.name = 'Ali';
    const M = mats();

    this.pose = 'idle';
    this.poseTime = 0;
    this.talkTime = 0;
    this.blinkTimer = 2;
    this.blink = 0;
    this.yaw = 0;
    this.yawTarget = 0;
    this.pointTarget = null;
    this.walkSpeed = 1;
    this._q = new THREE.Quaternion();

    // ------------------------------------------------ الجسم والثوب
    this.body = new THREE.Group();
    this.add(this.body);

    const profile = [
      [0.0, 0.07],
      [0.305, 0.07],
      [0.31, 0.12],
      [0.29, 0.35],
      [0.265, 0.6],
      [0.245, 0.8],
      [0.225, 0.9],
      [0.18, 0.97],
      [0.11, 1.02],
      [0.0, 1.03],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const thobe = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), M.thobe);
    thobe.castShadow = true;
    withOutline(thobe);
    this.body.add(thobe);
    this.thobe = thobe;

    // ياقة الثوب وفتحة الأزرار
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.06, 20), M.thobe);
    collar.position.y = 1.02;
    this.body.add(collar);
    const placket = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.3, 0.02, 2, 0.01), std(PALETTE.thobeShade));
    placket.position.set(0, 0.86, 0.218);
    placket.rotation.x = -0.12;
    this.body.add(placket);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.button);
      b.position.set(0, 0.95 - i * 0.085, 0.232 + i * 0.01);
      this.body.add(b);
    }

    // القدمان (تظهران تحت طرف الثوب)
    this.feet = [];
    for (const sx of [-1, 1]) {
      const foot = new THREE.Group();
      foot.position.set(sx * 0.11, 0, 0.08);
      const sandal = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.05, 0.27, 2, 0.02), M.sandal);
      sandal.position.set(0, 0.025, 0.03);
      const toes = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), M.skin);
      toes.scale.set(1, 0.6, 1.5);
      toes.position.set(0, 0.07, 0.07);
      foot.add(sandal, toes);
      sandal.castShadow = true;
      this.add(foot);
      this.feet.push(foot);
    }

    // ------------------------------------------------ الذراعان
    this.arms = {};
    for (const side of ['R', 'L']) {
      const sx = side === 'R' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.215, 0.92, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.2, 6, 12), M.thobe);
      upper.position.y = -0.15;
      upper.castShadow = true;
      withOutline(upper, 'thin');
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.17, 6, 12), M.thobe);
      fore.position.y = -0.11;
      fore.castShadow = true;
      withOutline(fore, 'thin');
      elbow.add(fore);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.05, 14), M.thobe);
      cuff.position.y = -0.21;
      elbow.add(cuff);
      const wrist = new THREE.Group();
      wrist.position.y = -0.25;
      elbow.add(wrist);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), M.skin);
      hand.scale.set(0.9, 1.05, 0.85);
      hand.position.y = -0.05;
      hand.castShadow = true;
      withOutline(hand, 'thin');
      wrist.add(hand);
      // الإبهام (يبرز من طرف القبضة عند رفعه)
      const thumbPivot = new THREE.Group();
      thumbPivot.position.set(-sx * 0.012, -0.1, 0.035);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), M.skin);
      thumb.position.y = -0.045;
      withOutline(thumb, 'thin');
      thumbPivot.add(thumb);
      wrist.add(thumbPivot);
      // السبابة (تظهر عند الإشارة)
      const index = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.08, 4, 8), M.skin);
      index.position.set(0, -0.14, 0.02);
      index.visible = false;
      wrist.add(index);
      this.body.add(shoulder);
      this.arms[side] = { shoulder, elbow, wrist, thumbPivot, index, sx };
    }

    // ------------------------------------------------ الرأس
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.12, 14), M.skin);
    this.neck.position.y = 1.07;
    this.body.add(this.neck);

    this.headPivot = new THREE.Group();
    this.headPivot.position.y = 1.08;
    this.body.add(this.headPivot);
    const head = new THREE.Group();
    head.position.y = 0.32;
    this.headPivot.add(head);
    this.head = head;

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 22), M.skin);
    skull.scale.set(1, 0.98, 0.95);
    skull.castShadow = true;
    withOutline(skull);
    head.add(skull);

    // الشعر الأسود المرتب (يظهر تحت حافة الغترة)
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.348, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), M.hair);
    hair.scale.set(1, 0.98, 0.96);
    hair.rotation.x = 0.04;
    head.add(hair);
    // خصلات أمامية صغيرة مرتبة
    for (let i = -1; i <= 1; i++) {
      const lock = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), M.hair);
      const p = new THREE.Vector3(i * 0.09, 0.165, 0.3).normalize().multiplyScalar(0.335);
      lock.position.copy(p);
      lock.scale.set(1.3, 0.5, 0.55);
      lock.rotation.z = i * 0.2;
      head.add(lock);
    }

    // العينان
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      const dir = new THREE.Vector3(sx * 0.125, 0.0, 0.3).normalize();
      eye.position.copy(dir.clone().multiplyScalar(0.3));
      eye.lookAt(dir.clone().multiplyScalar(2));
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), M.eyeWhite);
      white.scale.set(0.82, 1.05, 0.45);
      eye.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), M.iris);
      iris.scale.set(1, 1.05, 0.42);
      iris.position.z = 0.022;
      eye.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.027, 12, 8), M.pupil);
      pupil.scale.set(1, 1, 0.45);
      pupil.position.z = 0.036;
      eye.add(pupil);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.shine);
      shine.position.set(0.018, 0.022, 0.046);
      eye.add(shine);
      const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), M.shine);
      shine2.position.set(-0.016, -0.018, 0.045);
      eye.add(shine2);
      head.add(eye);
      this.eyes.push({ group: eye, iris, pupil, baseY: eye.position.y });
    }

    // الحاجبان
    this.brows = [];
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.075, 4, 8), M.brow);
      brow.rotation.z = Math.PI / 2 + sx * 0.12;
      const p = new THREE.Vector3(sx * 0.125, 0.105, 0.3).normalize().multiplyScalar(0.33);
      brow.position.copy(p);
      brow.userData.base = p.clone();
      brow.userData.sx = sx;
      head.add(brow);
      this.brows.push(brow);
    }

    // الأنف والخدان
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), M.nose);
    nose.position.set(0, -0.055, 0.33);
    head.add(nose);
    for (const sx of [-1, 1]) {
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), M.blush);
      const p = new THREE.Vector3(sx * 0.2, -0.085, 0.26).normalize().multiplyScalar(0.333);
      blush.position.copy(p);
      blush.lookAt(p.clone().multiplyScalar(2));
      head.add(blush);
    }

    // الفم: ابتسامة / مفتوح / دائري
    this.mouth = new THREE.Group();
    this.mouth.position.set(0, -0.135, 0.312);
    this.mouth.rotation.x = -0.25;
    head.add(this.mouth);
    this.mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.013, 8, 20, Math.PI), M.lip);
    this.mouthSmile.rotation.z = Math.PI;
    this.mouthSmile.position.y = 0.03;
    this.mouth.add(this.mouthSmile);
    this.mouthOpen = new THREE.Group();
    const openShape = new THREE.Mesh(new THREE.CircleGeometry(0.066, 20, Math.PI, Math.PI), M.mouthIn);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.032, 14), M.tongue);
    tongue.position.set(0, -0.042, 0.002);
    tongue.scale.set(1.2, 0.6, 1);
    this.mouthOpen.add(openShape, tongue);
    this.mouthOpen.position.y = 0.02;
    this.mouth.add(this.mouthOpen);
    this.mouthO = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.011, 8, 16), M.lip);
    this.mouth.add(this.mouthO);

    // الغترة البيضاء: قبة مغلقة فوق الرأس + جزء منسدل مفتوح عند الوجه
    const capProfile = [
      [0.001, 0.415],
      [0.12, 0.405],
      [0.23, 0.36],
      [0.31, 0.285],
      [0.355, 0.2],
      [0.372, 0.17],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const cap = new THREE.Mesh(new THREE.LatheGeometry(capProfile, 40), M.ghutra);
    cap.castShadow = true;
    withOutline(cap);
    head.add(cap);
    const drapeProfile = [
      [0.372, 0.17],
      [0.38, 0.1],
      [0.385, 0.0],
      [0.385, -0.16],
      [0.39, -0.3],
      [0.41, -0.42],
      [0.44, -0.5],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const gap = 0.92;
    const drape = new THREE.Mesh(new THREE.LatheGeometry(drapeProfile, 36, gap, Math.PI * 2 - gap * 2), M.ghutra);
    drape.castShadow = true;
    withOutline(drape);
    head.add(drape);
    // حافة الغترة الأمامية فوق الجبين
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.373, 0.018, 8, 40, gap * 2.0), M.ghutra);
    hem.rotation.set(Math.PI / 2, 0, Math.PI / 2 - gap);
    hem.position.y = 0.17;
    head.add(hem);

    // العقال الأسود (حلقتان فوق الغترة)
    const agal1 = new THREE.Mesh(new THREE.TorusGeometry(0.348, 0.03, 12, 56), M.agal);
    agal1.rotation.x = Math.PI / 2;
    agal1.position.set(0, 0.252, 0);
    const agal2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 12, 56), M.agal);
    agal2.rotation.x = Math.PI / 2;
    agal2.position.set(0, 0.314, 0);
    agal1.castShadow = agal2.castShadow = true;
    head.add(agal1, agal2);

    // ------------------------------------------------ حالة المفاصل
    this.joints = {
      shR: this.arms.R.shoulder,
      elR: this.arms.R.elbow,
      wrR: this.arms.R.wrist,
      shL: this.arms.L.shoulder,
      elL: this.arms.L.elbow,
      wrL: this.arms.L.wrist,
      head: this.headPivot,
      body: this.body,
    };
    this.extra = { thumbR: 0, thumbL: 0, bounce: 0, happy: 0, browRaise: 0, lookUp: 0, lean: 0 };
    this.mouthMode = 'smile';
    this.scale.setScalar(1.35);
    this.applyPose(true);
  }

  setPose(name, opts = {}) {
    if (!POSES.includes(name)) name = 'idle';
    if (name !== this.pose) this.poseTime = 0;
    this.pose = name;
    if (opts.target) this.pointTarget = opts.target.clone();
  }

  /** يجعل علي يتكلم (حركة الفم) لمدة تقريبية حسب طول النص. */
  talk(seconds) {
    this.talkTime = Math.max(this.talkTime, seconds);
  }

  faceYaw(yaw, instant = false) {
    this.yawTarget = yaw;
    if (instant) {
      this.yaw = yaw;
      this.rotation.y = yaw;
    }
  }

  faceTowards(worldPos, instant = false) {
    const dx = worldPos.x - this.position.x;
    const dz = worldPos.z - this.position.z;
    let target = Math.atan2(dx, dz);
    // أقصر طريق للدوران
    while (target - this.yaw > Math.PI) target -= Math.PI * 2;
    while (target - this.yaw < -Math.PI) target += Math.PI * 2;
    this.faceYaw(target, instant);
  }

  getHeadWorldPosition(out = new THREE.Vector3()) {
    return this.head.getWorldPosition(out);
  }

  /** يحسب الوضعية المستهدفة لكل مفصل حسب الحركة الحالية والزمن. */
  targetPose(t) {
    const P = {
      shR: [0.06, 0, -0.14],
      elR: [-0.18, 0, 0],
      wrR: [0, 0, 0],
      shL: [0.06, 0, 0.14],
      elL: [-0.18, 0, 0],
      wrL: [0, 0, 0],
      head: [0, 0, 0],
      body: [0, 0, 0],
      thumbR: 0,
      thumbL: 0,
      bounce: 0,
      happy: 0,
      browRaise: 0,
      lookUp: 0,
      indexR: false,
      indexL: false,
      mouth: 'smile',
      feet: [0, 0],
    };
    const breathe = Math.sin(t * 2.1) * 0.02;
    P.head = [Math.sin(t * 0.9) * 0.03, Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.7) * 0.025];
    P.shR[2] += breathe;
    P.shL[2] -= breathe;

    switch (this.pose) {
      case 'wave': {
        P.shR = [-0.15, 0.25, -2.55];
        P.elR = [0, 0, -0.55 + Math.sin(t * 9) * 0.4];
        P.wrR = [0, 0, Math.sin(t * 9 + 0.6) * 0.25];
        P.head = [0, 0.12, -0.08];
        P.happy = 0.4;
        P.mouth = 'open';
        break;
      }
      case 'point': {
        const aim = this.aimDirection('R');
        P.shR = aim ?? [-0.1, 0.35, -1.45];
        P.elR = [0, 0, -0.08];
        P.wrR = [0, 0, -0.1];
        P.indexR = true;
        const look = this.pointTarget ? this.localYawTo(this.pointTarget) : -0.6;
        P.head = [0.05, clamp(look * 0.7, -0.9, 0.9), 0];
        P.body = [0, clamp(look * 0.25, -0.35, 0.35), 0];
        P.mouth = 'open';
        break;
      }
      case 'think': {
        P.shR = [-1.05, 0.15, 0.32];
        P.elR = [-2.05, 0, 0];
        P.wrR = [0.25, 0, 0];
        P.shL = [0.0, 0, 0.12];
        P.elL = [-0.25, 0, 0];
        P.head = [-0.12, 0.08, 0.14 + Math.sin(t * 1.2) * 0.03];
        P.browRaise = 0.6;
        P.lookUp = 1;
        P.mouth = 'o';
        break;
      }
      case 'thumbsUp': {
        P.shR = [-0.55, 0.0, -0.45];
        P.elR = [-2.35, 0, 0.25];
        P.wrR = [0, 0, 0];
        P.thumbR = 1;
        P.head = [0.05, -0.08, -0.1];
        P.happy = 0.9;
        P.bounce = Math.abs(Math.sin(t * 5)) * 0.03;
        P.mouth = 'open';
        break;
      }
      case 'encourage': {
        P.shR = [-0.75, 0.2, -0.5];
        P.elR = [-0.6, 0, 0];
        P.wrR = [0, 0, -0.3];
        P.shL = [-0.75, -0.2, 0.5];
        P.elL = [-0.6, 0, 0];
        P.wrL = [0, 0, 0.3];
        P.head = [Math.sin(t * 4) * 0.09, 0, 0.06];
        P.browRaise = 0.3;
        P.happy = 0.3;
        P.mouth = 'smile';
        break;
      }
      case 'celebrate': {
        const j = Math.abs(Math.sin(t * 5.5));
        P.shR = [-0.2, 0, -2.75 + Math.sin(t * 11) * 0.12];
        P.shL = [-0.2, 0, 2.75 - Math.sin(t * 11) * 0.12];
        P.elR = [0, 0, -0.3];
        P.elL = [0, 0, 0.3];
        P.bounce = j * 0.2;
        P.happy = 1;
        P.head = [-0.1, 0, Math.sin(t * 5.5) * 0.1];
        P.mouth = 'open';
        break;
      }
      case 'walk': {
        const w = t * 9.5 * this.walkSpeed;
        const s = Math.sin(w);
        P.shR = [s * 0.55, 0, -0.18];
        P.shL = [-s * 0.55, 0, 0.18];
        P.elR = [-0.45, 0, 0];
        P.elL = [-0.45, 0, 0];
        P.bounce = Math.abs(Math.cos(w)) * 0.06;
        P.body = [0.1, 0, s * 0.04];
        P.head = [-0.05, 0, -s * 0.03];
        P.feet = [s * 0.14, -s * 0.14];
        P.happy = 0.2;
        break;
      }
      default:
        break;
    }
    if (this.talkTime > 0 && P.mouth !== 'o') P.mouth = Math.sin(t * 16) > -0.1 ? 'open' : 'smile';
    return P;
  }

  /** زاوية التفاف الهدف نسبةً لاتجاه علي (موجب = إلى يسار علي). */
  localYawTo(worldPos) {
    const local = this.worldToLocal(worldPos.clone());
    return Math.atan2(local.x, local.z);
  }

  /** زوايا الكتف لتوجيه الذراع نحو الهدف (تقريب بسيط). */
  aimDirection(side) {
    if (!this.pointTarget) return null;
    const local = this.worldToLocal(this.pointTarget.clone());
    const yaw = Math.atan2(local.x, local.z);
    // الذراع اليمنى تمتد جانبيًا (z سالب) ثم تدور أفقيًا نحو الأمام (y)
    if (side === 'R') {
      const forward = clamp(Math.PI / 2 + yaw, -0.2, 1.4);
      return [-0.05, forward, -1.42];
    }
    return null;
  }

  applyPose(instant = false, dt = 0, t = 0) {
    const P = this.targetPose(t);
    const k = instant ? 1 : 1 - Math.exp(-11 * dt);
    const e = new THREE.Euler();
    for (const [name, obj] of Object.entries(this.joints)) {
      const v = P[name];
      e.set(v[0], v[1], v[2]);
      this._q.setFromEuler(e);
      obj.quaternion.slerp(this._q, k);
    }
    for (const key of ['thumbR', 'thumbL', 'bounce', 'happy', 'browRaise', 'lookUp']) {
      this.extra[key] = instant ? P[key] : damp(this.extra[key], P[key], 10, dt);
    }
    // الإبهام
    for (const side of ['R', 'L']) {
      const a = this.arms[side];
      const f = this.extra[`thumb${side}`];
      a.thumbPivot.rotation.set(0, 0, a.sx * (1 - f) * 1.3);
      a.thumbPivot.scale.setScalar(0.35 + f * 0.65);
    }
    this.arms.R.index.visible = P.indexR;
    this.arms.L.index.visible = P.indexL;

    // الجسم: ارتداد وتنفس
    this.body.position.y = this.extra.bounce;
    this.thobe.scale.y = 1 + Math.sin(t * 2.1) * 0.008;

    // القدمان
    this.feet[0].position.z = 0.08 + (instant ? P.feet[0] : damp(this.feet[0].position.z - 0.08, P.feet[0], 12, dt));
    this.feet[1].position.z = 0.08 + (instant ? P.feet[1] : damp(this.feet[1].position.z - 0.08, P.feet[1], 12, dt));
    this.feet[0].position.y = Math.max(0, P.feet[0]) * 0.3;
    this.feet[1].position.y = Math.max(0, P.feet[1]) * 0.3;

    // الفم
    this.mouthSmile.visible = P.mouth === 'smile';
    this.mouthOpen.visible = P.mouth === 'open';
    this.mouthO.visible = P.mouth === 'o';

    // العينان: رمش + سعادة + نظر للأعلى
    const happy = this.extra.happy;
    const blinkScale = 1 - this.blink * 0.9;
    for (const eye of this.eyes) {
      eye.group.scale.y = Math.max(0.08, blinkScale * (1 - happy * 0.45));
      eye.group.position.y = eye.baseY + happy * 0.012;
      const up = this.extra.lookUp * 0.016;
      eye.iris.position.y = up;
      eye.pupil.position.y = up;
    }
    for (const brow of this.brows) {
      const b = brow.userData.base;
      brow.position.set(b.x, b.y + this.extra.browRaise * 0.03 * (brow.userData.sx > 0 ? 1.2 : 0.6) + happy * 0.01, b.z);
    }
  }

  update(dt, t) {
    this.poseTime += dt;
    this.talkTime = Math.max(0, this.talkTime - dt);
    // الرمش
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2.2 + Math.random() * 2.8;
    }
    this.blink = Math.max(0, this.blink - dt * 8);
    // الدوران نحو الاتجاه المطلوب
    this.yaw = damp(this.yaw, this.yawTarget, 7, dt);
    this.rotation.y = this.yaw;
    this.applyPose(false, dt, t);
  }

  /** وضعية فورية (للقطات الثابتة مثل صورة الشهادة). */
  snapPose(name, t = 0.3) {
    this.setPose(name);
    this.applyPose(true, 0, t);
  }
}

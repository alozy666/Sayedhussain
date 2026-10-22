import * as THREE from 'three';
import { PALETTE } from '../world/palette.js';
import { mat, shadowify } from '../world/materials.js';
import { Board } from '../ui3d/Panel.js';
import { Button3D } from '../ui3d/Button3D.js';
import { drawText, roundRect } from '../ui3d/textCanvas.js';
import { STRINGS } from '../content/strings.js';
import { onTick, animate } from '../engine/ticker.js';
import { ease, mulberry32 } from '../engine/mathx.js';
import { services } from '../engine/services.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.22;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 });
  g.center();
  return g;
}

/** منطقة النتائج: منصة احتفال، لوحة النتيجة، نجوم، شهادة الإنجاز وأزرار المتابعة. */
export class ResultsHall {
  constructor({ zone, handlers }) {
    this.zone = zone;
    this.handlers = handlers;
    this.root = new THREE.Group();
    this.root.name = 'results-hall';
    zone.frame.add(this.root);
    this.confettiOn = false;
    this.build();
  }

  w(x, y, z) {
    return this.zone.frame.localToWorld(v3(x, y, z));
  }

  view() {
    return { pos: this.w(0, 5.2, 16.0), target: this.w(0, 2.8, 0), minDist: 7, maxDist: 22, azRange: 0.6 };
  }

  /** مكان علي: بين اللوحة والشهادة عند النجاح، وبجانب اللوحة عند عدم النجاح. */
  aliSpot(passed = true) {
    return passed ? this.w(0.6, 0.45, 3.6) : this.w(4.4, 0.45, 2.6);
  }

  build() {
    const R = this.root;
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.4, 0.45, 72), mat('#fff6e6', { roughness: 0.8 }));
    stage.position.y = 0.22;
    stage.receiveShadow = true;
    R.add(stage);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(8.05, 0.16, 10, 80), mat(PALETTE.mint));
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.45;
    R.add(edge);

    // بالونات
    this.balloons = [];
    const colors = [PALETTE.orange, PALETTE.mint, PALETTE.skyBlue, '#f5a3b5', '#ffd36b'];
    const rand = mulberry32(9);
    for (const [cx, cz] of [
      [-7.6, -2.4],
      [7.6, -2.4],
      [-6.0, -5.6],
      [6.0, -5.6],
    ]) {
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 14), mat(colors[(i + Math.abs(cx)) % colors.length | 0], { roughness: 0.35 }));
        ball.scale.y = 1.15;
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 4), mat('#ffffff'));
        string.position.y = -1.6;
        b.add(ball, string);
        b.position.set(cx + (rand() - 0.5) * 1.2, 4.6 + rand() * 1.4, cz + (rand() - 0.5) * 1.2);
        b.userData.base = b.position.clone();
        b.userData.seed = rand() * 10;
        R.add(b);
        this.balloons.push(b);
      }
    }

    // لوحة النتيجة
    this.board = new Board({ width: 6.6, height: 4.6, posts: true, postHeight: 1.4, frameColor: PALETTE.skyBlue });
    this.board.position.set(-3.5, 0.45, -1.0);
    this.faceCam(this.board);
    R.add(this.board);

    // النجوم الخمس فوق اللوحة
    const sg = starGeometry();
    this.starGold = mat(PALETTE.gold, { roughness: 0.35, metalness: 0.2, emissive: '#b37a00', emissiveIntensity: 0.25 });
    this.starGrey = mat('#d9dde2', { roughness: 0.6 });
    this.stars = [];
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(sg, this.starGrey);
      s.scale.setScalar(1.25);
      const bx = this.board.position.x;
      s.position.set(bx + (2 - i) * 1.2, 7.35 + (i === 2 ? 0.25 : i === 1 || i === 3 ? 0.12 : 0), this.board.position.z + 0.25);
      s.rotation.y = this.board.rotation.y;
      s.visible = false;
      R.add(s);
      this.stars.push(s);
    }

    // حامل الشهادة
    this.easel = new THREE.Group();
    this.easel.position.set(4.0, 0.45, -0.8);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), mat(PALETTE.trunk));
      leg.position.set(sx * 1.6, 2.5, -0.2);
      leg.rotation.z = -sx * 0.08;
      this.easel.add(leg);
    }
    this.certBoard = new Board({ width: 5.0, height: 3.536, frameColor: PALETTE.gold, border: 0.2 });
    this.certBoard.position.set(0, 3.25, 0.1);
    this.certBoard.rotation.x = -0.06;
    this.easel.add(this.certBoard);
    this.faceCam(this.easel);
    this.easel.visible = false;
    R.add(this.easel);

    // الأزرار
    const H = this.handlers;
    this.downloadBtn = new Button3D({
      id: 'res-download',
      label: STRINGS.downloadCertificate,
      icon: 'download',
      color: PALETTE.green,
      onClick: () => H.onDownload(),
    });
    this.downloadBtn.position.set(4.0, 1.15, 1.4);
    this.faceCam(this.downloadBtn, -0.3);
    R.add(this.downloadBtn);
    this.retryBtn = new Button3D({ id: 'res-retry', label: STRINGS.retryChallenge, icon: 'replay', color: PALETTE.orange, onClick: () => H.onRetry() });
    this.reviewBtn = new Button3D({ id: 'res-review', label: STRINGS.reviewStations, icon: 'map', color: '#7fcfac', textColor: PALETTE.navy, onClick: () => H.onReview() });
    this.homeBtn = new Button3D({ id: 'res-home', label: STRINGS.backToStart, icon: 'home', color: PALETTE.skyBlue, onClick: () => H.onHome() });
    this.rowBtns = [this.retryBtn, this.reviewBtn, this.homeBtn];
    let x = 0;
    const gap = 0.45;
    const total = this.rowBtns.reduce((a, b) => a + b.widthU, 0) + gap * 2;
    x = total / 2;
    for (const b of this.rowBtns) {
      x -= b.widthU / 2;
      b.position.set(x * 0.74, 1.0, 6.4);
      x -= b.widthU / 2 + gap;
      b.rotation.x = -0.35;
      R.add(b);
    }
    for (const b of [this.downloadBtn, ...this.rowBtns]) b.hide(true);

    // القصاصات الملونة
    const count = 160;
    this.confetti = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.16, 0.28),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
      count
    );
    const cc = new THREE.Color();
    const cols = ['#ffad5c', '#8fd9b6', '#5fb4e6', '#f5c242', '#f5a3b5', '#c9b6ff'];
    this.confettiData = [];
    for (let i = 0; i < count; i++) {
      this.confetti.setColorAt(i, cc.set(cols[i % cols.length]));
      this.confettiData.push({
        x: (rand() - 0.5) * 16,
        z: (rand() - 0.5) * 9 - 0.5,
        speed: 0.8 + rand() * 1.0,
        phase: rand() * 20,
        spin: 1 + rand() * 4,
      });
    }
    this.confetti.visible = false;
    this.confetti.frustumCulled = false;
    R.add(this.confetti);

    shadowify(R, true, true);
    this.confetti.castShadow = false;
    onTick((dt, t) => this.tick(dt, t));
  }

  faceCam(obj, tilt = 0) {
    const cam = v3(0, 5.2, 16.0);
    obj.rotation.set(tilt, Math.atan2(cam.x - obj.position.x, cam.z - obj.position.z), 0, 'YXZ');
  }

  /** يعرض النتيجة: score {correct,total,percent,passed}، certificateCanvas عند النجاح. */
  show(score, certificateCanvas) {
    this.board.draw((ctx, W, H) => {
      drawText(ctx, STRINGS.resultsTitle, W / 2, 110, { size: 104, weight: 800, color: PALETTE.navy });
      ctx.fillStyle = PALETTE.orange;
      roundRect(ctx, W / 2 - 100, 180, 200, 12, 6);
      ctx.fill();
      const boxW = W * 0.4;
      const boxes = [
        { label: STRINGS.scoreLabel, value: `${score.correct}/${score.total}`, x: W / 2 + boxW / 2 + 20 },
        { label: STRINGS.percentLabel, value: `${score.percent}%`, x: W / 2 - boxW / 2 - 20 },
      ];
      for (const b of boxes) {
        roundRect(ctx, b.x - boxW / 2, 230, boxW, 250, 36);
        ctx.fillStyle = score.passed ? '#e2f7ea' : '#fdeedd';
        ctx.fill();
        drawText(ctx, b.label, b.x, 280, { size: 50, weight: 700, color: PALETTE.navySoft });
        drawText(ctx, b.value, b.x, 390, { size: 128, weight: 800, color: score.passed ? PALETTE.green : PALETTE.orangeDark });
      }
      drawText(ctx, score.passed ? STRINGS.passMessage : STRINGS.failMessage, W / 2, 660, {
        size: 62,
        weight: 800,
        color: PALETTE.navy,
        maxWidth: W * 0.9,
        lineHeight: 1.4,
      });
    });
    this.board.pop();

    // النجوم تظهر واحدة تلو الأخرى
    this.stars.forEach((s, i) => {
      s.visible = false;
      s.material = i < score.correct ? this.starGold : this.starGrey;
      setTimeout(() => {
        s.visible = true;
        if (i < score.correct) services.audio?.star(i);
        animate(0.5, (p) => s.scale.setScalar(1.25 * ease.outBack(p)));
      }, 500 + i * 320);
    });

    this.easel.visible = !!(score.passed && certificateCanvas);
    if (this.easel.visible) {
      this.certBoard.draw((ctx, W, H) => ctx.drawImage(certificateCanvas, 0, 0, W, H));
      this.certBoard.pop();
      this.downloadBtn.show(1.6);
      this.downloadBtn.setAttention(true);
    } else {
      this.downloadBtn.hide(true);
    }
    // اللوحة في المنتصف إن لم تكن هناك شهادة
    this.board.position.x = this.easel.visible ? -3.5 : -0.2;
    this.faceCam(this.board);
    this.stars.forEach((s, i) => {
      s.position.x = this.board.position.x + (2 - i) * 1.2;
      s.rotation.y = this.board.rotation.y;
    });
    this.rowBtns.forEach((b, i) => b.show(1.2 + i * 0.12));
    this.confettiOn = score.passed;
    this.confetti.visible = score.passed;
    this.confettiStart = performance.now() / 1000;
  }

  hide() {
    this.confettiOn = false;
    this.confetti.visible = false;
    for (const b of [this.downloadBtn, ...this.rowBtns]) b.hide(true);
  }

  tick(dt, t) {
    for (const b of this.balloons) {
      b.position.y = b.userData.base.y + Math.sin(t * 1.1 + b.userData.seed) * 0.2;
      b.rotation.z = Math.sin(t * 0.8 + b.userData.seed) * 0.08;
    }
    if (this.confetti.visible) {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = new THREE.Euler();
      const p = new THREE.Vector3();
      const s = new THREE.Vector3(1, 1, 1);
      this.confettiData.forEach((d, i) => {
        const y = 10 - ((t * d.speed + d.phase) % 10);
        p.set(d.x + Math.sin(t * 1.3 + d.phase) * 0.4, y, d.z);
        e.set(t * d.spin, t * d.spin * 0.7, d.phase);
        m4.compose(p, q.setFromEuler(e), s);
        this.confetti.setMatrixAt(i, m4);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }
}

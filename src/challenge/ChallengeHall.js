import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../world/palette.js';
import { mat, shadowify } from '../world/materials.js';
import { Board } from '../ui3d/Panel.js';
import { Button3D } from '../ui3d/Button3D.js';
import { AnswerCard } from '../ui3d/AnswerCard.js';
import { drawText, roundRect } from '../ui3d/textCanvas.js';
import { makePillar } from '../world/gate.js';
import { CHALLENGE, OPTION_LETTERS } from '../content/challenge.js';
import { STRINGS } from '../content/strings.js';
import { onTick } from '../engine/ticker.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** قاعة التحدي: بوابة دخول + قاعة دائرية مفتوحة + لوحة سؤال عائمة + ثلاث بطاقات مصورة. */
export class ChallengeHall {
  constructor({ zone, images, handlers }) {
    this.zone = zone;
    this.images = images;
    this.handlers = handlers;
    this.root = new THREE.Group();
    this.root.name = 'challenge-hall';
    zone.frame.add(this.root);
    this.build();
  }

  w(x, y, z) {
    return this.zone.frame.localToWorld(v3(x, y, z));
  }

  gateView() {
    return { pos: this.w(0.4, 5.0, 25.5), target: this.w(0.4, 3.6, 9.5), minDist: 8, maxDist: 22, azRange: 0.7 };
  }

  hallView() {
    return { pos: this.w(0, 5.6, 12.9), target: this.w(0, 3.3, -2.4), minDist: 6, maxDist: 16, azRange: 0.55, moveRadius: 2 };
  }

  aliGateSpot() {
    return this.w(3.0, 0, 13.4);
  }

  aliHallSpot() {
    return this.w(7.5, 0.3, 0.4);
  }

  build() {
    const R = this.root;
    // الأرضية الدائرية
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 10, 0.3, 72), mat('#fdf3e1', { roughness: 0.8 }));
    floor.position.set(0, 0.15, -1);
    floor.receiveShadow = true;
    R.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.4, 7.6, 72), mat('#cdeedd', { roughness: 0.8 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.31, -1);
    R.add(ring);
    const inner = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 60), mat('#ffd7a8'));
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(0, 0.315, -1);
    R.add(inner);

    // أعمدة خلفية وجانبية
    const cols = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.05 + (i / 8) * 0.9);
      const p = makePillar(5.2, '#fffaf0', i % 2 ? PALETTE.mint : '#ffd7a8');
      p.position.set(Math.cos(a) * 9.2, 0.3, -1 + Math.sin(a) * 9.2);
      R.add(p);
      cols.push(p.position.clone());
    }
    // رايات ملونة بين الأعمدة
    const flagColors = [PALETTE.orange, PALETTE.mint, PALETTE.skyBlue, '#ffd36b', '#f5a3b5'];
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i].clone().setY(6.0);
      const b = cols[i + 1].clone().setY(6.0);
      const mid = a.clone().lerp(b, 0.5).setY(5.2);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.025, 4), mat('#8a6a4a'));
      R.add(rope);
      for (let k = 1; k < 6; k++) {
        const p = curve.getPoint(k / 6);
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), mat(flagColors[(i + k) % flagColors.length]));
        flag.position.copy(p).add(v3(0, -0.28, 0));
        flag.rotation.x = Math.PI;
        flag.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        R.add(flag);
      }
    }
    // فوانيس متوهجة
    this.lanterns = [];
    for (const [x, z] of [
      [-6.2, -6.0],
      [6.2, -6.0],
      [0, -9.0],
    ]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat('#fff3c4', { emissive: '#ffe08a', emissiveIntensity: 0.8 }));
      l.position.set(x, 6.4, z);
      R.add(l);
      this.lanterns.push(l);
    }

    // بوابة الدخول
    const gate = new THREE.Group();
    gate.position.set(0, 0, 10.6);
    for (const sx of [-1, 1]) {
      const p = makePillar(4.4, '#ecd3a6', PALETTE.skyBlue);
      p.position.x = sx * 3.3;
      gate.add(p);
    }
    const beam = new THREE.Mesh(new RoundedBoxGeometry(8.0, 0.5, 0.8, 3, 0.18), mat('#bf8a5a'));
    beam.position.y = 5.45;
    gate.add(beam);
    this.gateSign = new Board({ width: 6.6, height: 1.45, frameColor: PALETTE.orange, border: 0.2 });
    this.gateSign.position.set(0, 6.6, 0.3);
    this.gateSign.draw((ctx, W, H) => {
      drawText(ctx, STRINGS.challengeGateTitle, W / 2, H / 2 + 8, { size: 104, weight: 800, color: PALETTE.navy, maxWidth: W * 0.96 });
    });
    gate.add(this.gateSign);
    R.add(gate);
    this.gate = gate;

    this.startBtn = new Button3D({
      id: 'challenge-start',
      label: STRINGS.startChallenge,
      icon: 'flag',
      color: PALETTE.orange,
      height: 1.1,
      fontSize: 0.5,
      onClick: () => this.handlers.onStart(),
    });
    this.startBtn.position.set(0, 1.0, 14.2);
    this.startBtn.rotation.x = -0.3;
    this.startBtn.setAttention(true);
    this.startBtn.hide(true);
    R.add(this.startBtn);

    // لوحة السؤال العائمة
    this.qBoard = new Board({ width: 11, height: 3.35, frameColor: PALETTE.skyBlue, border: 0.26, radius: 0.5 });
    this.qBoard.position.set(0, 6.0, -4.6);
    this.qBoard.visible = false;
    R.add(this.qBoard);

    // البطاقات (الخيار أ على اليمين)
    this.cards = [0, 1, 2].map((i) => {
      const card = new AnswerCard({
        id: `ch-${i}`,
        width: 3.5,
        height: 4.0,
        onClick: () => this.handlers.onAnswer(i),
      });
      card.position.set((1 - i) * 3.95, 2.2, -1.4);
      R.add(card);
      return card;
    });

    this.nextBtn = new Button3D({
      id: 'challenge-next',
      label: STRINGS.nextQuestion,
      icon: 'next',
      iconSide: 'end',
      color: PALETTE.orange,
      height: 1.05,
      fontSize: 0.48,
      onClick: () => this.handlers.onNext(),
    });
    this.nextBtn.position.set(0, 0.75, 1.4);
    this.nextBtn.rotation.x = -0.35;
    this.nextBtn.hide(true);
    R.add(this.nextBtn);

    shadowify(R, true, true);
    this.qBoard.content.castShadow = false;
    onTick((dt, t) => {
      this.lanterns.forEach((l, i) => (l.position.y = 6.4 + Math.sin(t * 1.5 + i) * 0.12));
      if (this.qBoard.visible) this.qBoard.position.y = 6.0 + Math.sin(t * 1.2) * 0.06;
    });
  }

  showGate() {
    this.gate.visible = true;
    this.hideQuestion();
    this.startBtn.show(0.2);
  }

  enterHall() {
    this.startBtn.hide();
  }

  /** يعرض السؤال رقم index (يبدأ من 0) دون أي تلميح للإجابة. */
  showQuestion(index, answeredFlags = []) {
    const q = CHALLENGE[index];
    this.gate.visible = false;
    const img = q.questionImage ? this.images[q.questionImage] : null;
    this.qBoard.visible = true;
    this.qBoard.draw((ctx, W, H) => {
      // مؤشر رقم السؤال
      const n = CHALLENGE.length;
      for (let i = 0; i < n; i++) {
        const x = W / 2 + ((n - 1) / 2 - i) * 70;
        ctx.beginPath();
        ctx.arc(x, 58, i === index ? 22 : 17, 0, Math.PI * 2);
        ctx.fillStyle = i === index ? PALETTE.orange : answeredFlags[i] ? PALETTE.skyBlue : '#e5e9ee';
        ctx.fill();
      }
      drawText(ctx, STRINGS.questionCounter(index + 1, n), W / 2, 124, { size: 50, weight: 800, color: PALETTE.mintDark });
      if (img) {
        const iw = W * 0.36;
        const ih = iw * (img.height / img.width);
        const x = 60;
        const y = (H - ih) / 2 + 40;
        ctx.save();
        roundRect(ctx, x, y, iw, ih, 34);
        ctx.clip();
        ctx.drawImage(img, x, y, iw, ih);
        ctx.restore();
        roundRect(ctx, x, y, iw, ih, 34);
        ctx.lineWidth = 8;
        ctx.strokeStyle = PALETTE.skyBlue;
        ctx.stroke();
        drawText(ctx, q.prompt, x + iw + (W - x - iw) / 2, H / 2 + 50, { size: 112, weight: 800, color: PALETTE.navy, maxWidth: W - iw - 160 });
      } else {
        drawText(ctx, q.prompt, W / 2, H / 2 + 60, { size: 108, weight: 800, color: PALETTE.navy, maxWidth: W * 0.92 });
      }
    });
    this.qBoard.pop();
    q.options.forEach((opt, i) => {
      const card = this.cards[i];
      card.setContent({ letter: OPTION_LETTERS[i], text: opt.text, image: opt.image ? this.images[opt.image] : null });
      card.setInteractive(true);
      card.show(0.15 + i * 0.12);
    });
    this.nextBtn.hide();
  }

  /** يُظهر التصحيح بعد الإجابة الأولى المؤكدة. */
  reveal(choice, correctIndex) {
    this.cards.forEach((c) => c.setInteractive(false));
    if (choice === correctIndex) {
      this.cards.forEach((c, i) => c.setState(i === choice ? 'correct' : 'dim'));
    } else {
      this.cards.forEach((c, i) => c.setState(i === choice ? 'wrong' : 'dim'));
      setTimeout(() => this.cards[correctIndex].setState('reveal'), 750);
    }
  }

  showNext(label) {
    this.nextBtn.setLabel(label, 'next');
    this.nextBtn.setAttention(true);
    this.nextBtn.show(0.2);
  }

  hideQuestion() {
    this.cards.forEach((c) => c.hide());
    this.nextBtn.hide();
    this.qBoard.visible = false;
  }

  reset() {
    this.hideQuestion();
    this.startBtn.hide(true);
  }
}

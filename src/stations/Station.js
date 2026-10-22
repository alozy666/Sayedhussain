import * as THREE from 'three';
import { PALETTE } from '../world/palette.js';
import { Board } from '../ui3d/Panel.js';
import { Button3D } from '../ui3d/Button3D.js';
import { AnswerCard } from '../ui3d/AnswerCard.js';
import { drawText, roundRect, drawIcon } from '../ui3d/textCanvas.js';
import { STRINGS } from '../content/strings.js';
import { STATION_COUNT } from '../content/stations.js';
import { OPTION_LETTERS } from '../content/challenge.js';
import { services } from '../engine/services.js';
import { onTick, animate } from '../engine/ticker.js';
import { ease } from '../engine/mathx.js';

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// تخطيط عناصر كل محطة بإحداثيات المنطقة المحلية (الكاميرا تنظر من +Z نحو -Z).
const BASE_LAYOUT = {
  view: { pos: [1.3, 5.2, 15.8], target: [1.0, 2.0, 0], minDist: 7, maxDist: 24 },
  board: [6.9, 0, 0.4],
  ali: [2.7, 0, 5.9],
  bubbleSide: 'left',
  buttons: [-0.2, 0.8, 7.2],
  practice: [-7.7, 0, 1.4],
  practiceView: { pos: [-1.6, 6.0, 17.6], target: [-1.9, 2.6, 0], minDist: 7, maxDist: 25 },
};

const LAYOUTS = {
  earthquake: {},
  volcano: {
    view: { pos: [1.4, 10.2, 20.0], target: [0.0, 3.6, -2.2], minDist: 9, maxDist: 28 },
    board: [8.2, 0, 1.6],
    ali: [3.6, 0, 6.6],
    buttons: [-5.4, 1.1, 5.6],
  },
  weathering: {},
  erosion: {
    view: { pos: [0.6, 6.2, 16.6], target: [0.0, 2.1, -1.4], minDist: 7, maxDist: 25 },
    practiceView: { pos: [-1.6, 6.6, 17.8], target: [-1.9, 2.6, -0.6], minDist: 7, maxDist: 25 },
  },
  human: {
    view: { pos: [0.2, 6.0, 16.4], target: [-0.6, 1.6, -1.0], minDist: 7, maxDist: 25 },
  },
};

/** محطة تعليمية: نموذج الظاهرة + لوحة + أزرار ثلاثية الأبعاد + سؤال تدريبي (اختياري). */
export class Station {
  constructor({ index, def, zone, model, practice = null, images = null, handlers }) {
    this.index = index;
    this.def = def;
    this.id = def.id;
    this.zone = zone;
    this.model = model;
    this.practiceDef = practice;
    this.images = images;
    this.handlers = handlers;
    this.layout = { ...BASE_LAYOUT, ...(LAYOUTS[def.id] || {}) };
    this.time = 0;
    this.playing = false;
    this.played = false;
    this.cueIndex = 0;
    this.phase = 'intro';
    this.root = new THREE.Group();
    this.root.name = `station:${def.id}`;
    zone.frame.add(this.root);
    this.build();
    this._off = onTick((dt, t) => this.tick(dt, t));
  }

  local(a) {
    return v3(a);
  }

  /** موضع عالمي لنقطة محلية. */
  world(a) {
    return this.zone.frame.localToWorld(Array.isArray(a) ? v3(a) : a.clone());
  }

  viewFor(kind = 'main') {
    const l = kind === 'practice' ? this.layout.practiceView : this.layout.view;
    return {
      pos: this.world(l.pos),
      target: this.world(l.target),
      minDist: l.minDist,
      maxDist: l.maxDist,
      azRange: 0.9,
      moveRadius: 3.5,
    };
  }

  faceCamera(obj, tilt = 0) {
    const cam = v3(this.layout.view.pos);
    obj.rotation.set(tilt, Math.atan2(cam.x - obj.position.x, cam.z - obj.position.z), 0, 'YXZ');
  }

  build() {
    this.root.add(this.model.group);

    // اللوحة التعليمية
    const isCompare = !!this.def.compare;
    this.board = new Board({ width: 6.6, height: isCompare ? 5.0 : 3.9, posts: true, postHeight: 1.5 });
    this.board.position.copy(v3(this.layout.board));
    this.faceCamera(this.board);
    this.root.add(this.board);
    this.showBoardIntro();

    // الأزرار
    const H = this.handlers;
    this.watchBtn = new Button3D({
      id: `st-${this.id}-watch`,
      label: this.def.watchLabel,
      icon: 'play',
      color: PALETTE.orange,
      height: 0.88,
      fontSize: 0.4,
      onClick: () => H.onWatch(this),
    });
    this.replayBtn = new Button3D({
      id: `st-${this.id}-replay`,
      label: STRINGS.replay,
      icon: 'replay',
      color: '#7fcfac',
      textColor: PALETTE.navy,
      height: 0.78,
      fontSize: 0.34,
      onClick: () => H.onReplay(this),
    });
    this.nextBtn = new Button3D({
      id: `st-${this.id}-next`,
      label: this.index === STATION_COUNT - 1 ? STRINGS.toChallenge : STRINGS.next,
      icon: 'next',
      iconSide: 'end',
      color: PALETTE.orange,
      height: 0.88,
      fontSize: 0.4,
      onClick: () => H.onNext(this),
    });
    this.buttons = [this.watchBtn, this.replayBtn, this.nextBtn];
    if (this.def.beforeTag) {
      this.baBtn = new Button3D({
        id: `st-${this.id}-beforeafter`,
        label: STRINGS.beforeAfter,
        icon: 'swap',
        color: PALETTE.skyBlue,
        height: 0.78,
        fontSize: 0.34,
        onClick: () => H.onBeforeAfter(this),
      });
      this.buttons.push(this.baBtn);
    }
    const row = v3(this.layout.buttons);
    for (const b of this.buttons) {
      b.position.copy(row);
      this.faceCamera(b, -0.38);
      this.root.add(b);
      b.hide(true);
    }

    // وسم عائم (محاكاة مسرّعة / قبل وبعد العمل)
    if (this.model.tagPos) {
      this.tag = new Board({ width: 4.4, height: 0.95, frameColor: PALETTE.orange, border: 0.12, radius: 0.4, depth: 0.14 });
      this.tag.position.copy(this.model.tagPos);
      this.faceCamera(this.tag);
      this.tag.visible = false;
      this.root.add(this.tag);
    }

    if (this.practiceDef) this.buildPractice();
  }

  layoutButtons(list) {
    const row = v3(this.layout.buttons);
    const gap = 0.45;
    const widths = list.map((b) => b.widthU);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (list.length - 1);
    // ترتيب من اليمين إلى اليسار: أول زر في القائمة على اليمين
    let x = row.x + total / 2;
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.watchBtn.rotation.y, 0));
    list.forEach((b, i) => {
      x -= widths[i] / 2;
      b.position.copy(row).addScaledVector(right, x - row.x);
      x -= widths[i] / 2 + gap;
    });
  }

  setTag(text, icon = null) {
    if (!this.tag) return;
    this.tag.draw((ctx, W, H) => {
      if (icon) drawIcon(ctx, icon, W - 80, H / 2, 84, PALETTE.orangeDark);
      drawText(ctx, text, icon ? W / 2 - 40 : W / 2, H / 2 + 6, { size: 72, weight: 800, color: PALETTE.navy, maxWidth: W - 190 });
    });
    this.tag.visible = true;
  }

  hideTag() {
    if (this.tag) this.tag.visible = false;
  }

  // ------------------------------------------------ اللوحة
  showBoardIntro() {
    this.board.setContent({
      kicker: STRINGS.stationKicker(this.def.number, STATION_COUNT),
      title: STRINGS.watchFirst,
      body: '',
    });
  }

  showBoardExplained() {
    if (this.def.compare && this.images) {
      this.board.draw((ctx, W, H) => {
        drawText(ctx, STRINGS.stationKicker(this.def.number, STATION_COUNT), W / 2, 62, { size: 44, color: PALETTE.mintDark });
        drawText(ctx, this.def.title, W / 2, 160, { size: 112, weight: 800, color: PALETTE.navy });
        ctx.fillStyle = PALETTE.orange;
        roundRect(ctx, W / 2 - 90, 236, 180, 12, 6);
        ctx.fill();
        drawText(ctx, this.def.definition, W / 2, 330, { size: 62, weight: 700, color: PALETTE.navySoft, maxWidth: W * 0.9 });
        const iw = W * 0.4;
        const ih = iw * 0.62;
        this.def.compare.forEach((c, i) => {
          const x = i === 0 ? W - 60 - iw : 60;
          const y = 430;
          const img = this.images[c.image];
          ctx.save();
          roundRect(ctx, x, y, iw, ih, 30);
          ctx.clip();
          if (img) {
            const s = Math.max(iw / img.width, ih / img.height);
            ctx.drawImage(img, x + (iw - img.width * s) / 2, y + (ih - img.height * s) / 2, img.width * s, img.height * s);
          }
          ctx.restore();
          roundRect(ctx, x, y, iw, ih, 30);
          ctx.lineWidth = 8;
          ctx.strokeStyle = i === 0 ? '#c9b49a' : PALETTE.skyBlue;
          ctx.stroke();
          drawText(ctx, c.label, x + iw / 2, y + ih + 58, { size: 50, weight: 800, color: PALETTE.navy, maxWidth: iw + 40 });
        });
      });
    } else {
      this.board.setContent({
        kicker: STRINGS.stationKicker(this.def.number, STATION_COUNT),
        title: this.def.title,
        body: this.def.definition,
        note: this.def.note,
      });
    }
    this.board.pop();
  }

  // ------------------------------------------------ السؤال التدريبي
  buildPractice() {
    const p = this.practiceDef;
    this.practice = new THREE.Group();
    this.practice.position.copy(v3(this.layout.practice));
    const cam = v3(this.layout.view.pos);
    this.practice.rotation.y = Math.atan2(cam.x - this.practice.position.x, cam.z - this.practice.position.z);
    this.root.add(this.practice);
    this.practiceBoard = new Board({ width: 6.9, height: 1.75, frameColor: PALETTE.skyBlue, radius: 0.45 });
    this.practiceBoard.position.y = 5.75;
    this.practiceBoard.draw((ctx, W, H) => {
      drawText(ctx, p.title, W - 40, 62, { size: 46, color: PALETTE.mintDark, align: 'right' });
      drawText(ctx, p.prompt, W / 2, H / 2 + 26, { size: 96, weight: 800, color: PALETTE.navy, maxWidth: W * 0.92 });
    });
    this.practice.add(this.practiceBoard);
    this.practiceCards = p.options.map((opt, i) => {
      const card = new AnswerCard({
        id: `pr-${this.id}-${i}`,
        width: 3.15,
        height: opt.image ? 3.6 : 3.0,
        onClick: () => this.handlers.onPracticeAnswer(this, i),
      });
      // الخيار الأول على اليمين
      card.position.set(i === 0 ? 1.72 : -1.72, opt.image ? 2.55 : 2.85, 0.2);
      card.setContent({ letter: OPTION_LETTERS[i], text: opt.text, image: opt.image ? this.images?.[opt.image] : null });
      this.practice.add(card);
      return card;
    });
    this.practice.visible = false;
  }

  showPractice() {
    if (!this.practice) return;
    this.practice.visible = true;
    this.practiceBoard.pop();
    this.practiceCards.forEach((c, i) => {
      c.setState('idle');
      c.setInteractive(true);
      c.show(0.15 + i * 0.12);
    });
  }

  hidePractice() {
    if (!this.practice) return;
    this.practiceCards.forEach((c) => c.hide());
    setTimeout(() => {
      if (this.practice) this.practice.visible = false;
    }, 300);
  }

  // ------------------------------------------------ تشغيل الظاهرة
  play() {
    this.time = 0;
    this.cueIndex = 0;
    this.playing = true;
    this.model.applyAt(0);
    if (this.def.speedTag) this.setTag(this.def.speedTag, 'clock');
    if (this.def.beforeTag) this.setTag(this.def.beforeTag);
  }

  stop() {
    this.playing = false;
    services.audio?.stopLoops();
  }

  /** يعيد المشهد لحالته الأولى. */
  resetScene() {
    this.stop();
    this.time = 0;
    this.model.applyAt(0);
    this.hideTag();
  }

  /** يعرض الحالة النهائية مباشرة (عند الرجوع لمحطة مكتملة). */
  showFinal() {
    this.stop();
    this.time = this.model.duration;
    this.model.applyAt(this.model.duration);
    this.showAfterTag();
  }

  showAfterTag() {
    if (this.def.afterTag) this.setTag(this.def.afterTag);
    else this.hideTag();
  }

  toggleBeforeAfter() {
    if (this.playing) return;
    const showingAfter = this.time >= this.model.duration - 0.01;
    if (showingAfter) {
      this.time = 0;
      this.model.applyAt(0);
      this.setTag(this.def.beforeTag);
    } else {
      this.time = this.model.duration;
      this.model.applyAt(this.model.duration);
      this.setTag(this.def.afterTag);
    }
  }

  tick(dt, t) {
    this.model.update(dt, t);
    if (!this.playing) return;
    this.time += dt;
    const cues = this.model.cues;
    while (this.cueIndex < cues.length && this.time >= cues[this.cueIndex].at) {
      const c = cues[this.cueIndex++];
      services.audio?.play(c.sound, c.dur);
    }
    const tt = Math.min(this.time, this.model.duration);
    this.model.applyAt(tt);
    if (this.time >= this.model.duration) {
      this.playing = false;
      this.played = true;
      services.audio?.stopLoops();
      if (this.def.speedTag) this.hideTag();
      this.showAfterTag();
      this.handlers.onPlayComplete(this);
    }
  }

  // ------------------------------------------------ حالات الواجهة
  /** phase: intro | playing | explained | practice | done */
  setPhase(phase, { completed = false } = {}) {
    this.phase = phase;
    const show = [];
    if (phase === 'intro') {
      this.watchBtn.setLabel(this.def.watchLabel, 'play');
      this.watchBtn.setAttention(true);
      show.push(this.watchBtn);
      if (completed) show.push(this.nextBtn);
    } else if (phase === 'explained' || phase === 'done') {
      show.push(this.replayBtn);
      if (this.baBtn) show.push(this.baBtn);
      if (phase === 'done' || completed) show.push(this.nextBtn);
      this.nextBtn.setAttention(true);
    } else if (phase === 'practice') {
      show.push(this.replayBtn);
    }
    for (const b of this.buttons) {
      if (show.includes(b)) b.show(0.1);
      else b.hide();
    }
    if (phase === 'intro' && completed) this.layoutButtons([this.watchBtn, this.nextBtn]);
    else this.layoutButtons(show.length ? show : [this.watchBtn]);
  }

  hideAllButtons() {
    for (const b of this.buttons) b.hide();
  }

  // مواقع مفيدة لعلي والكاميرا
  aliSpot() {
    const p = this.world(this.layout.ali);
    p.y = services.world.heightAt(p.x, p.z);
    return p;
  }

  focusWorld() {
    return this.zone.frame.localToWorld(this.model.focus.clone());
  }

  cameraWorldPos() {
    return this.world(this.layout.view.pos);
  }

  /** نقطة على المسار الدائري أمام المحطة. */
  pathAngle() {
    return this.zone.def.angle;
  }

  popIn(obj) {
    animate(0.4, (p) => obj.scale.setScalar(ease.outBack(p)));
  }
}

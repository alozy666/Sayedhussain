import * as THREE from 'three';
import { STATIONS, STATION_COUNT } from '../content/stations.js';
import { PRACTICE } from '../content/practice.js';
import { CHALLENGE } from '../content/challenge.js';
import { STRINGS } from '../content/strings.js';
import { ZONE_DEFS, RING_R } from '../world/layout.js';
import { createQuizState, submitAnswer, computeScore, isAnswered } from './quiz.js';
import {
  loadProgress,
  saveProgress,
  freshProgress,
  clearProgress,
  hasMeaningfulProgress,
  unlockedStationCount,
  allStationsDone,
} from './progress.js';
import { saveAttempt, buildAttemptRecord } from './teacherStore.js';
import { drawCertificate, downloadCanvas, printCanvas } from '../challenge/certificate.js';
import { openTeacherPanel } from '../hud/teacher.js';
import { services } from '../engine/services.js';
import { wait } from '../engine/ticker.js';
import { ease, clamp, smoothstep } from '../engine/mathx.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const WALK_SPEED = 8.5;

/**
 * العقل المدبر للتجربة: آلة الحالات، التنقل، التقويم، الحفظ.
 * المواقع: welcome | station(index) | challengeGate | challenge | results
 */
export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.progress = loadProgress();
    this.location = { type: 'boot', index: 0 };
    this.busy = false;
    this.quiz = null;
    this.qIndex = 0;
    this.lastLine = '';
    this.poseTimer = null;
    this.practiceLock = false;
    this.cert = null;
    this.score = null;
    this.vrActive = false;
    this.fadeEl = document.createElement('div');
    this.fadeEl.style.cssText =
      'position:fixed;inset:0;background:#dff3fb;opacity:0;pointer-events:none;transition:opacity .35s ease;z-index:20';
    document.body.append(this.fadeEl);
    this.bindKeys();
  }

  // ================================================================ أدوات عامة
  save() {
    saveProgress(this.progress);
  }

  get activeCamera() {
    return this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
  }

  say(text, pose = null, { side = null, maxWidthU = 6.2, poseSeconds = 0, speak = true } = {}) {
    this.lastLine = text;
    this.bubble.say(text, { side: side ?? this.bubbleSideFor(this.location), maxWidthU });
    this.ali.talk(Math.min(6, 0.6 + text.length * 0.06));
    if (pose) this.posePulse(pose, poseSeconds);
    if (speak) this.speech.speak(text);
    this.hud.setListenHidden(false);
  }

  hideBubbleLater(seconds) {
    const text = this.bubble.text;
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      if (this.bubble.text === text) this.bubble.hide();
    }, seconds * 1000);
  }

  /** وضعية مؤقتة ثم العودة للوقوف الطبيعي. */
  posePulse(pose, seconds = 0, after = 'idle') {
    clearTimeout(this.poseTimer);
    this.ali.setPose(pose);
    if (seconds > 0) this.poseTimer = setTimeout(() => this.ali.setPose(after), seconds * 1000);
  }

  placeAli(pos, faceTarget = null) {
    this.ali.position.copy(pos);
    if (faceTarget) this.ali.faceTowards(faceTarget, true);
    this.aliFacesCamera = true;
  }

  angleOf(loc) {
    if (loc.type === 'welcome') return ZONE_DEFS.gate.angle;
    if (loc.type === 'station') return ZONE_DEFS[STATIONS[loc.index].id].angle;
    if (loc.type === 'challengeGate' || loc.type === 'challenge') return ZONE_DEFS.challenge.angle;
    if (loc.type === 'results') return ZONE_DEFS.results.angle;
    return 90;
  }

  locKey(loc) {
    return loc.type === 'station' ? `station:${loc.index}` : loc.type;
  }

  spotFor(loc) {
    if (loc.type === 'welcome') return this.gateSpot.clone();
    if (loc.type === 'station') return this.stations[loc.index].aliSpot();
    if (loc.type === 'challengeGate') return this.hall.aliGateSpot();
    if (loc.type === 'challenge') return this.hall.aliHallSpot();
    if (loc.type === 'results') return this.results.aliSpot(this.progress.lastResult?.passed !== false);
    return new THREE.Vector3();
  }

  viewFor(loc) {
    if (loc.type === 'welcome') return this.welcomeView;
    if (loc.type === 'station') return this.stations[loc.index].viewFor('main');
    if (loc.type === 'challengeGate') return this.hall.gateView();
    if (loc.type === 'challenge') return this.hall.hallView();
    if (loc.type === 'results') return this.results.view();
    return this.welcomeView;
  }

  bubbleSideFor(loc) {
    return loc.type === 'challenge' ? 'center' : 'left';
  }

  setBusy(v) {
    this.busy = v;
    this.interaction.locked = v;
    if (v) this.bubble.hide();
    this.refreshHUD();
  }

  // ================================================================ الانتقال بين المواقع
  /** هل الانتقال التالي متسلسل (مشيًا) أم قفزة (تلاشي)؟ */
  isSequential(from, to) {
    if (from.type === 'welcome' && to.type === 'station' && to.index === 0) return true;
    if (from.type === 'station' && to.type === 'station' && to.index === from.index + 1) return true;
    if (from.type === 'station' && from.index === STATION_COUNT - 1 && to.type === 'challengeGate') return true;
    if (from.type === 'challenge' && to.type === 'results') return true;
    return false;
  }

  async travel(to, { mode = 'auto' } = {}) {
    if (this.busy) return;
    const from = { ...this.location };
    this.leaveLocation(from);
    this.setBusy(true);
    const walk = mode === 'walk' || (mode === 'auto' && this.isSequential(from, to));
    const view = this.viewFor(to);
    const spot = this.spotFor(to);
    if (this.vrActive) {
      await this.xr.fade(1);
      this.placeAli(spot, view.pos);
      this.placeVR(view);
      this.rig.setView(view, { instant: true });
      await this.xr.fade(0);
    } else if (walk) {
      await this.walkTo(from, to, spot, view);
    } else {
      this.fadeEl.style.opacity = '1';
      services.audio?.whoosh();
      await new Promise((r) => setTimeout(r, 380));
      this.placeAli(spot, view.pos);
      this.rig.setView(view, { instant: true });
      this.world.setShadowFocus(view.target);
      await new Promise((r) => setTimeout(r, 120));
      this.fadeEl.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 250));
    }
    this.setBusy(false);
    this.arrive(to);
  }

  /** علي يمشي على المسار والكاميرا تتبعه بسلاسة (بدون اهتزاز). */
  async walkTo(from, to, spot, endView) {
    const pts = [this.ali.position.clone()];
    const a0 = this.angleOf(from);
    const a1 = this.angleOf(to);
    if (from.type === 'welcome') pts.push(new THREE.Vector3(0, 0, 49), new THREE.Vector3(0, 0, RING_R + 4));
    if (from.type === 'challenge') pts.push(this.hall.w(1.5, 0, 6), this.hall.w(0.5, 0, 10));
    const arc = this.world.ringArc(a0, a1, 3);
    pts.push(...arc);
    pts.push(spot.clone());
    // نحذف النقاط المتقاربة جدًا
    const clean = [pts[0]];
    for (const p of pts.slice(1)) if (p.distanceTo(clean[clean.length - 1]) > 0.8) clean.push(p);
    for (const p of clean) if (p !== clean[clean.length - 1]) p.y = this.world.heightAt(p.x, p.z);
    const curve = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
    const len = curve.getLength();
    const duration = clamp(len / WALK_SPEED, 2.4, 7.5) / Math.max(1, services.timeScale);
    const startPos = this.camera.position.clone();
    const startTarget = this.rig.target.clone();
    this.ali.setPose('walk');
    this.ali.walkSpeed = 1.15;
    this.aliFacesCamera = false;
    services.audio?.whoosh();
    const tmp = new THREE.Vector3();
    this.rig.view = endView;
    await this.rig.runPath((p) => {
      const u = ease.inOut(p) * 0.15 + p * 0.85;
      const ap = curve.getPointAt(Math.min(1, u));
      this.ali.position.copy(ap);
      const tng = curve.getTangentAt(Math.min(0.999, u));
      this.ali.faceYaw(this.unwrapYaw(Math.atan2(tng.x, tng.z)));
      this.world.setShadowFocus(ap);
      // كاميرا المتابعة: من جهة مركز الجزيرة وعلى ارتفاع مريح
      const inward = tmp.set(-ap.x, 0, -ap.z).normalize();
      const followPos = ap.clone().addScaledVector(inward, 11.5).add(new THREE.Vector3(0, 6.2, 0));
      const followTarget = ap.clone().add(new THREE.Vector3(0, 1.4, 0));
      const wIn = smoothstep(0, 0.28, p);
      const wOut = smoothstep(0.72, 1, p);
      const pos = startPos.clone().lerp(followPos, wIn).lerp(endView.pos, wOut);
      const target = startTarget.clone().lerp(followTarget, wIn).lerp(endView.target, wOut);
      return { pos, target };
    }, duration);
    this.ali.position.copy(spot);
    this.ali.setPose('idle');
    this.aliFacesCamera = true;
  }

  unwrapYaw(target) {
    let t = target;
    while (t - this.ali.yaw > Math.PI) t -= Math.PI * 2;
    while (t - this.ali.yaw < -Math.PI) t += Math.PI * 2;
    return t;
  }

  placeVR(view) {
    const ground = view.target.clone().lerp(view.pos, 0.72);
    ground.y = this.world.heightAt(ground.x, ground.z);
    if (this.location.type === 'challenge' || this.location.type === 'results') ground.y += 0.3;
    this.xr.placeAt(ground, view.target);
  }

  leaveLocation(loc) {
    this.speech.cancel();
    clearTimeout(this.practiceTimer);
    if (loc.type === 'station') {
      const st = this.stations[loc.index];
      st.stop();
      st.hideAllButtons();
      st.hidePractice();
    } else if (loc.type === 'challengeGate') {
      this.hall.startBtn.hide();
    } else if (loc.type === 'challenge') {
      this.hall.hideQuestion();
    } else if (loc.type === 'results') {
      this.results.hide();
    } else if (loc.type === 'welcome') {
      this.hud.hideWelcome();
      this.gateStartBtn?.hide();
    }
  }

  arrive(loc) {
    this.location = { ...loc };
    // نقطة الاستئناف: آخر موقع داخل المغامرة (الصفحة الرئيسية لا تلغيها)
    if (loc.type !== 'welcome') {
      this.progress.location = { type: loc.type, index: loc.type === 'challenge' ? 0 : loc.index ?? 0 };
      this.save();
    }
    const view = this.viewFor(loc);
    this.world.setShadowFocus(view.target);
    if (!this.rig.busy) this.rig.view = { ...view };
    this.rig.applyLimits(view);
    if (loc.type === 'welcome') this.arriveWelcome();
    else if (loc.type === 'station') this.arriveStation(loc.index);
    else if (loc.type === 'challengeGate') this.arriveChallengeGate();
    else if (loc.type === 'challenge') this.arriveChallenge();
    else if (loc.type === 'results') this.arriveResults();
    this.refreshHUD();
  }

  // ================================================================ البداية
  goWelcome({ instant = false } = {}) {
    if (instant || this.location.type === 'boot') {
      this.location = { type: 'welcome', index: 0 };
      this.placeAli(this.gateSpot, this.welcomeView.pos);
      this.rig.setView(this.welcomeView, { instant: true });
      this.arrive({ type: 'welcome', index: 0 });
      return;
    }
    this.travel({ type: 'welcome', index: 0 }, { mode: 'fade' });
  }

  arriveWelcome() {
    const back = hasMeaningfulProgress(this.progress);
    const text = back ? STRINGS.welcomeBack : STRINGS.welcome;
    this.hud.showGameBars(false);
    if (!this.portraitUrl && this.aliPortrait) this.portraitUrl = this.aliPortrait.toDataURL('image/png');
    this.hud.showWelcome(back, { text, portrait: this.portraitUrl });
    if (this.vrActive) this.say(text, 'wave', { poseSeconds: 3, maxWidthU: 8.4 });
    else {
      this.lastLine = text;
      this.bubble.hide();
      this.posePulse('wave', 3);
      if (this.audioUnlocked) this.speech.speak(text);
    }
    if (this.vrActive) this.gateStartBtn?.show();
  }

  /** زر «ابدأ المغامرة / تابع المغامرة». */
  start() {
    if (this.busy) return;
    this.unlockAudio();
    this.hud.hideWelcome();
    this.hud.showGameBars(true);
    const p = this.progress;
    let dest = { type: 'station', index: 0 };
    const loc = p.location;
    if (hasMeaningfulProgress(p) && loc && loc.type !== 'welcome') {
      if (loc.type === 'results' && !p.lastResult) dest = { type: 'challengeGate' };
      else if (loc.type === 'challenge' && !p.challenge) dest = { type: 'challengeGate' };
      else dest = { type: loc.type, index: loc.index ?? 0 };
    } else if (hasMeaningfulProgress(p)) {
      if (allStationsDone(p)) dest = { type: 'challengeGate' };
      else dest = { type: 'station', index: p.stationsDone.findIndex((d) => !d) };
    }
    const sequential = dest.type === 'station' && dest.index === 0;
    if (sequential) this.say(STRINGS.letsGo, 'wave', { poseSeconds: 1, speak: true });
    setTimeout(() => this.travel(dest, { mode: sequential ? 'walk' : 'fade' }), sequential ? 700 : 0);
  }

  restart() {
    clearProgress();
    this.progress = freshProgress();
    this.quiz = null;
    this.save();
    this.stations.forEach((s) => {
      s.played = false;
      s.resetScene();
      s.showBoardIntro();
    });
    this.hud.toast('بدأت مغامرة جديدة!');
    this.start();
  }

  unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    this.audio.ensure();
  }

  // ================================================================ المحطات
  arriveStation(i) {
    const st = this.stations[i];
    const done = this.progress.stationsDone[i];
    this.hud.showGameBars(true);
    this.placeAli(st.aliSpot(), st.cameraWorldPos());
    st.hidePractice();
    if (done) {
      st.showFinal();
      st.showBoardExplained();
      st.played = true;
    } else {
      st.resetScene();
      st.showBoardIntro();
    }
    st.setPhase('intro', { completed: done });
    this.say(st.def.intro, i === 0 ? 'wave' : 'think', { poseSeconds: 2.2 });
  }

  currentStation() {
    return this.location.type === 'station' ? this.stations[this.location.index] : null;
  }

  onWatch(st) {
    if (this.busy || st !== this.currentStation() || st.playing) return;
    this.unlockAudio();
    st.hidePractice();
    st.setPhase('playing');
    this.bubble.hide();
    this.speech.cancel();
    this.ali.setPose('point', { target: st.focusWorld() });
    clearTimeout(this.poseTimer);
    this.rig.setView(st.viewFor('main'), { duration: 0.8 });
    st.play();
    this.refreshHUD();
  }

  onReplay(st) {
    if (this.busy || st !== this.currentStation() || st.playing) return;
    st.resetScene();
    this.onWatch(st);
  }

  onPlayComplete(st) {
    if (st !== this.currentStation()) return;
    st.showBoardExplained();
    services.audio?.pop();
    this.posePulse('thumbsUp', 2.4);
    this.say(st.def.outro, null);
    const i = st.index;
    const practiceKey = st.def.practice;
    if (practiceKey && !this.progress.practiceDone[practiceKey]) {
      st.setPhase('practice');
      this.practiceTimer = setTimeout(() => this.startPractice(st), 2600 / Math.max(1, services.timeScale));
    } else {
      this.markStationDone(i);
      st.setPhase('done');
    }
    this.refreshHUD();
  }

  markStationDone(i) {
    if (!this.progress.stationsDone[i]) {
      this.progress.stationsDone[i] = true;
      this.save();
      this.hud.toast(i === STATION_COUNT - 1 ? 'أكملت المحطات الخمس! قاعة التحدي مفتوحة الآن.' : `أحسنت! أكملت المحطة ${i + 1}`);
    }
  }

  startPractice(st) {
    if (st !== this.currentStation() || st.playing) return;
    st.setPhase('practice');
    this.rig.setView(st.viewFor('practice'), { duration: 1.2 });
    st.showPractice();
    this.practiceLock = false;
    this.say(STRINGS.practiceIntro, 'think');
    this.refreshHUD();
  }

  onPracticeAnswer(st, choice) {
    if (this.busy || this.practiceLock || st !== this.currentStation()) return;
    const key = st.def.practice;
    const def = PRACTICE[key];
    this.progress.practiceTries[key] = (this.progress.practiceTries[key] ?? 0) + 1;
    const card = st.practiceCards[choice];
    if (choice === def.correct) {
      this.practiceLock = true;
      st.practiceCards.forEach((c, i) => {
        c.setInteractive(false);
        c.setState(i === choice ? 'correct' : 'dim');
      });
      services.audio?.correct();
      this.posePulse('thumbsUp', 2.5);
      this.say(def.praise, null);
      this.progress.practiceDone[key] = true;
      this.markStationDone(st.index);
      setTimeout(() => {
        if (st === this.currentStation()) st.setPhase('done');
        this.refreshHUD();
      }, 600);
    } else {
      card.setInteractive(false);
      card.setState('wrong');
      services.audio?.wrong();
      this.posePulse('encourage', 2.2);
      this.say(def.retry, null);
      setTimeout(() => {
        if (st !== this.currentStation() || this.practiceLock) return;
        card.setState('idle');
        card.setInteractive(true);
      }, 1400);
    }
    this.save();
  }

  onBeforeAfter(st) {
    if (st !== this.currentStation()) return;
    st.toggleBeforeAfter();
    services.audio?.whoosh();
  }

  onNext(st) {
    if (this.busy || st !== this.currentStation()) return;
    if (!this.progress.stationsDone[st.index]) {
      this.hud.toast('شاهد الظاهرة أولًا ثم انتقل إلى المحطة التالية.');
      return;
    }
    if (st.index < STATION_COUNT - 1) this.travel({ type: 'station', index: st.index + 1 });
    else this.travel({ type: 'challengeGate' });
  }

  // ================================================================ قاعة التحدي
  arriveChallengeGate() {
    this.hud.showGameBars(true);
    this.placeAli(this.hall.aliGateSpot(), this.hall.gateView().pos);
    this.hall.showGate();
    this.say(STRINGS.challengeIntro, 'wave', { poseSeconds: 2.5 });
  }

  async startChallenge() {
    if (this.busy) return;
    if (!allStationsDone(this.progress)) {
      this.hud.toast(STRINGS.challengeLocked);
      return;
    }
    this.unlockAudio();
    this.hall.enterHall();
    // محاولة جديدة إن لم تكن هناك محاولة جارية
    if (!this.progress.challenge) {
      this.progress.challenge = {
        attemptId: `a-${Date.now().toString(36)}`,
        startedAt: new Date().toISOString(),
        answers: createQuizState(CHALLENGE).answers,
        index: 0,
      };
      this.save();
    }
    if (this.location.type === 'challengeGate' && !this.vrActive) {
      this.leaveLocation(this.location);
      this.setBusy(true);
      const view = this.hall.hallView();
      const from = this.ali.position.clone();
      const to = this.hall.aliHallSpot();
      const mid = this.hall.w(1.5, 0, 6);
      mid.y = 0.3;
      const curve = new THREE.CatmullRomCurve3([from, this.hall.w(1.5, 0, 10.5), mid, to]);
      this.ali.setPose('walk');
      this.aliFacesCamera = false;
      const startPos = this.camera.position.clone();
      const startTarget = this.rig.target.clone();
      this.rig.view = view;
      await this.rig.runPath((p) => {
        const k = ease.inOut(p);
        const ap = curve.getPointAt(k);
        ap.y = k > 0.55 ? 0.3 : this.world.heightAt(ap.x, ap.z);
        this.ali.position.copy(ap);
        const tng = curve.getTangentAt(Math.min(0.999, k));
        this.ali.faceYaw(this.unwrapYaw(Math.atan2(tng.x, tng.z)));
        return { pos: startPos.clone().lerp(view.pos, k), target: startTarget.clone().lerp(view.target, k) };
      }, 2.6 / Math.max(1, services.timeScale));
      this.ali.setPose('idle');
      this.setBusy(false);
      this.arrive({ type: 'challenge', question: this.progress.challenge.index });
    } else {
      this.travel({ type: 'challenge', question: this.progress.challenge.index }, { mode: 'fade' });
    }
  }

  arriveChallenge() {
    this.hud.showGameBars(true);
    const ch = this.progress.challenge;
    if (!ch) {
      this.arrive({ type: 'challengeGate' });
      return;
    }
    this.quiz = { answers: ch.answers };
    this.placeAli(this.hall.aliHallSpot(), this.hall.hallView().pos);
    this.showQuestion(ch.index);
  }

  showQuestion(i) {
    this.qIndex = i;
    this.location.question = i;
    this.progress.challenge.index = i;
    this.save();
    this.hall.showQuestion(i, this.quiz.answers.map(Boolean));
    if (isAnswered(this.quiz, i)) {
      // سؤال أجيب عنه سابقًا (بعد تحديث الصفحة): نعرض التصحيح نفسه دون السماح بالتغيير
      const a = this.quiz.answers[i];
      this.hall.reveal(a.choice, CHALLENGE[i].correct);
      this.hall.showNext(i < CHALLENGE.length - 1 ? STRINGS.nextQuestion : STRINGS.showResult);
    } else {
      this.ali.setPose('think');
      if (i === 0) this.say(STRINGS.thinkPrompt, null, { side: 'center', maxWidthU: 4.2 });
      else this.bubble.hide();
    }
    this.refreshHUD();
  }

  onAnswer(choice) {
    if (this.busy || this.location.type !== 'challenge') return;
    const i = this.qIndex;
    const res = submitAnswer(this.quiz, CHALLENGE, i, choice);
    if (!res.accepted) return; // الإجابة الأولى فقط تُحتسب
    this.progress.challenge.answers = this.quiz.answers;
    this.save();
    this.hall.reveal(choice, res.correctIndex);
    if (res.correct) {
      services.audio?.correct();
      this.posePulse('thumbsUp', 2.2, 'idle');
      this.say(pick(STRINGS.correctPhrases), null, { side: 'center', maxWidthU: 4.2 });
    } else {
      services.audio?.wrong();
      this.posePulse('encourage', 2.4, 'idle');
      this.say(pick(STRINGS.wrongPhrases), null, { side: 'center', maxWidthU: 4.2 });
    }
    setTimeout(() => {
      if (this.location.type !== 'challenge' || this.qIndex !== i) return;
      this.hall.showNext(i < CHALLENGE.length - 1 ? STRINGS.nextQuestion : STRINGS.showResult);
      this.refreshHUD();
    }, 900 / Math.max(1, services.timeScale));
    this.refreshHUD();
  }

  onNextQuestion() {
    if (this.busy || this.location.type !== 'challenge') return;
    const i = this.qIndex;
    if (!isAnswered(this.quiz, i)) return; // لا ننتقل قبل الإجابة
    if (i < CHALLENGE.length - 1) {
      this.hall.hideQuestion();
      this.bubble.hide();
      setTimeout(() => this.showQuestion(i + 1), 320);
    } else {
      this.finishChallenge();
    }
  }

  finishChallenge() {
    const score = computeScore(this.quiz);
    const ch = this.progress.challenge;
    const record = buildAttemptRecord({
      id: ch.attemptId,
      startedAt: ch.startedAt,
      finishedAt: new Date().toISOString(),
      quizState: this.quiz,
      score,
      practiceTries: this.progress.practiceTries,
    });
    saveAttempt(record);
    this.progress.lastResult = { ...score, attemptId: ch.attemptId, finishedAt: record.finishedAt };
    this.progress.challenge = null;
    this.save();
    this.hall.hideQuestion();
    this.travel({ type: 'results' });
  }

  // ================================================================ النتائج والشهادة
  arriveResults() {
    this.hud.showGameBars(true);
    const r = this.progress.lastResult;
    if (!r) {
      this.arrive({ type: 'challengeGate' });
      return;
    }
    this.score = r;
    this.cert = r.passed ? this.renderCertificate('') : null;
    this.placeAli(this.results.aliSpot(r.passed), this.results.view().pos);
    this.results.show(r, this.cert);
    if (r.passed) {
      services.audio?.celebrate();
      this.ali.setPose('celebrate');
      this.say(STRINGS.aliPassLine, null, { side: 'center', maxWidthU: 3.4 });
      this.hideBubbleLater(4.5);
      setTimeout(() => this.location.type === 'results' && this.ali.setPose('thumbsUp'), 4200);
    } else {
      this.posePulse('encourage', 3);
      this.say(STRINGS.aliFailLine, null, { side: 'right', maxWidthU: 3.8 });
      this.hideBubbleLater(6);
    }
  }

  renderCertificate(name) {
    const r = this.progress.lastResult;
    return drawCertificate({
      score: r.correct,
      total: r.total,
      percent: r.percent,
      name,
      aliPortrait: this.aliPortrait,
      date: r.finishedAt ? new Date(r.finishedAt) : new Date(),
    });
  }

  openCertificate() {
    if (!this.progress.lastResult?.passed) return;
    this.hud.openCertificate({
      canvas: this.cert ?? this.renderCertificate(''),
      render: (name) => this.renderCertificate(name),
      onDownload: async (name) => {
        const ok = await downloadCanvas(this.renderCertificate(name));
        this.hud.toast(ok ? 'تم تنزيل الشهادة.' : 'تعذّر التنزيل في هذا المتصفح، جرّب زر الطباعة.');
      },
      onPrint: (name) => {
        if (!printCanvas(this.renderCertificate(name))) this.hud.toast('اسمح بالنوافذ المنبثقة لطباعة الشهادة.');
      },
    });
  }

  retryChallenge() {
    if (this.busy) return;
    this.progress.challenge = null;
    this.quiz = null;
    this.save();
    this.progress.challenge = {
      attemptId: `a-${Date.now().toString(36)}`,
      startedAt: new Date().toISOString(),
      answers: createQuizState(CHALLENGE).answers,
      index: 0,
    };
    this.save();
    this.travel({ type: 'challenge', question: 0 }, { mode: 'fade' });
  }

  reviewStations() {
    if (this.busy) return;
    this.travel({ type: 'station', index: 0 }, { mode: 'fade' }).then(() =>
      this.hud.toast('يمكنك اختيار أي محطة من شريط المحطات أو من الخريطة.')
    );
  }

  // ================================================================ التنقل من الشريط والخريطة
  goTo(key) {
    if (this.busy) return;
    const p = this.progress;
    if (key === 'welcome') {
      if (this.location.type !== 'welcome') this.goWelcome();
      return;
    }
    if (key.startsWith('station:')) {
      const i = Number(key.split(':')[1]);
      if (i >= unlockedStationCount(p) && !p.stationsDone[i]) {
        this.hud.toast(STRINGS.locked);
        return;
      }
      if (this.location.type === 'station' && this.location.index === i) {
        this.rig.resetView();
        return;
      }
      this.travel({ type: 'station', index: i });
      return;
    }
    if (key === 'challenge') {
      if (!allStationsDone(p)) {
        this.hud.toast(STRINGS.challengeLocked);
        return;
      }
      if (['challengeGate', 'challenge', 'results'].includes(this.location.type)) {
        this.rig.resetView();
        return;
      }
      if (p.challenge) this.travel({ type: 'challenge', question: p.challenge.index }, { mode: 'fade' });
      else this.travel({ type: 'challengeGate' });
    }
  }

  openMap() {
    if (this.busy) return;
    const p = this.progress;
    const ext = this.mapImage?.extent ?? 70;
    const toUV = (v) => ({ x: (v.x + ext) / (2 * ext), y: (v.z + ext) / (2 * ext) });
    const unlocked = unlockedStationCount(p);
    const markers = [];
    const gate = toUV(this.world.zones.gate.center);
    markers.push({ key: 'welcome', label: 'البداية', icon: 'gate', state: this.location.type === 'welcome' ? 'current' : 'done', ...gate });
    STATIONS.forEach((s, i) => {
      let state = p.stationsDone[i] ? 'done' : i < unlocked ? 'open' : 'locked';
      if (this.location.type === 'station' && this.location.index === i) state = 'current';
      markers.push({ key: `station:${i}`, label: s.name, num: i + 1, state, ...toUV(this.world.zones[s.id].center) });
    });
    let chState = allStationsDone(p) ? 'open' : 'locked';
    if (['challengeGate', 'challenge', 'results'].includes(this.location.type)) chState = 'current';
    markers.push({ key: 'challenge', label: 'قاعة التحدي', icon: 'challenge', state: chState, ...toUV(this.world.zones.challenge.center) });
    this.hud.openMap({
      imageUrl: this.mapImage?.url,
      markers,
      onPick: (m) => {
        if (m.state === 'locked') {
          this.hud.toast(m.key === 'challenge' ? STRINGS.challengeLocked : STRINGS.locked);
          return;
        }
        this.hud.closeModal(true);
        this.goTo(m.key);
      },
    });
  }

  // ================================================================ أزرار الواجهة
  primaryAction() {
    if (this.busy) return;
    const loc = this.location;
    if (loc.type === 'welcome') this.start();
    else if (loc.type === 'station') {
      const st = this.stations[loc.index];
      if (this.progress.stationsDone[loc.index]) this.onNext(st);
      else if (st.phase === 'intro') this.onWatch(st);
    } else if (loc.type === 'challengeGate') this.startChallenge();
    else if (loc.type === 'challenge') this.onNextQuestion();
    else if (loc.type === 'results') {
      if (this.progress.lastResult?.passed) this.openCertificate();
      else this.retryChallenge();
    }
  }

  replayAction() {
    const st = this.currentStation();
    if (st) this.onReplay(st);
  }

  listen() {
    if (this.lastLine) this.speech.speak(this.lastLine, true);
  }

  toggleSound() {
    const on = !this.audio.enabled;
    this.audio.setEnabled(on);
    this.speech.enabled = on;
    if (!on) this.speech.cancel();
    else this.unlockAudio();
    this.hud.setSound(on);
  }

  openTeacher() {
    openTeacherPanel(this.hud);
  }

  async vr() {
    const supported = await this.xr.checkSupport();
    this.hud.setVRSupported(supported);
    this.hud.openVRInfo({ supported, onEnter: () => this.enterVR() });
  }

  async enterVR() {
    this.unlockAudio();
    const ok = await this.xr.enter();
    if (!ok) this.hud.toast('تعذّر بدء وضع VR على هذا الجهاز.');
  }

  onXRChange(active) {
    this.vrActive = active;
    this.hud.setHidden(active);
    this.rig.controls.enabled = !active;
    if (active) {
      this.placeVR(this.viewFor(this.location));
      if (this.location.type === 'welcome') this.gateStartBtn?.show();
    } else {
      this.gateStartBtn?.hide(true);
      this.rig.setView(this.viewFor(this.location), { instant: true });
    }
  }

  refreshHUD() {
    const loc = this.location;
    if (loc.type === 'boot') return;
    this.hud.updateStepper(this.progress, loc);
    const busy = this.busy;
    if (loc.type === 'welcome') {
      this.hud.setActions({});
      this.hud.setListenHidden(true);
      return;
    }
    this.hud.setListenHidden(false);
    if (loc.type === 'station') {
      const st = this.stations[loc.index];
      const done = this.progress.stationsDone[loc.index];
      const last = loc.index === STATION_COUNT - 1;
      // قبل المشاهدة الأولى يصبح الزر الرئيسي «شاهد…» حتى تكون الخطوة التالية واضحة دائمًا
      const watchFirst = !done && !st.played && st.phase === 'intro';
      this.hud.setActions({
        replay: { visible: true, enabled: !busy && st.played && !st.playing },
        map: { visible: true, enabled: !busy },
        reset: { visible: true, enabled: !busy },
        primary: watchFirst
          ? { visible: true, enabled: !busy, label: st.def.watchLabel, icon: 'play' }
          : { visible: true, enabled: !busy && done && !st.playing, label: last ? STRINGS.toChallenge : STRINGS.next, icon: 'next' },
      });
    } else if (loc.type === 'challengeGate') {
      this.hud.setActions({
        map: { visible: true, enabled: !busy },
        reset: { visible: true, enabled: !busy },
        primary: { visible: true, enabled: !busy, label: STRINGS.startChallenge, icon: 'play' },
      });
    } else if (loc.type === 'challenge') {
      const answered = this.quiz && isAnswered(this.quiz, this.qIndex);
      this.hud.setActions({
        reset: { visible: true, enabled: !busy },
        primary: {
          visible: true,
          enabled: !busy && !!answered,
          label: this.qIndex < CHALLENGE.length - 1 ? STRINGS.nextQuestion : STRINGS.showResult,
          icon: 'next',
        },
      });
    } else if (loc.type === 'results') {
      const passed = this.progress.lastResult?.passed;
      this.hud.setActions({
        map: { visible: true, enabled: !busy },
        reset: { visible: true, enabled: !busy },
        primary: { visible: true, enabled: !busy, label: passed ? STRINGS.downloadCertificate : STRINGS.retryChallenge, icon: passed ? 'download' : 'replay' },
      });
    }
  }

  // ================================================================ لوحة المفاتيح
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('modal-open')) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = e.key;
      const digits = { 1: 0, 2: 1, 3: 2, '١': 0, '٢': 1, '٣': 2 };
      if (key in digits) {
        const idx = digits[key];
        if (this.location.type === 'challenge') this.hall.cards[idx] && this.hall.cards[idx].interactive && this.onAnswer(idx);
        const st = this.currentStation();
        if (st?.phase === 'practice' && st.practiceCards?.[idx]?.interactive) this.onPracticeAnswer(st, idx);
        return;
      }
      if (e.code === 'KeyR') this.rig.resetView();
      else if (e.code === 'KeyM' && this.location.type !== 'welcome') this.openMap();
      else if (e.code === 'KeyH' || key === '?') this.hud.openHelp();
      else if (key === 'Enter' || key === ' ') {
        if (tag === 'BUTTON') return; // الزر المركّز يتولى النقر بنفسه
        e.preventDefault();
        this.primaryAction();
      }
    });
  }

  // ================================================================ الحلقة
  update(dt, t) {
    this.ali.update(dt, t);
    if (this.aliFacesCamera && !this.busy && this.ali.pose !== 'walk') {
      const camPos = this.activeCamera.getWorldPosition(new THREE.Vector3());
      this.ali.faceTowards(camPos);
    }
    const head = this.ali.getHeadWorldPosition(new THREE.Vector3());
    this.bubble.follow(head, this.activeCamera);
  }

  /** حالة مختصرة للاختبار الآلي. */
  snapshot() {
    const st = this.currentStation();
    return {
      location: { ...this.location },
      busy: this.busy,
      stationPhase: st?.phase ?? null,
      stationPlaying: st?.playing ?? false,
      progress: JSON.parse(JSON.stringify(this.progress)),
      qIndex: this.qIndex,
      answers: this.quiz ? JSON.parse(JSON.stringify(this.quiz.answers)) : null,
      score: this.quiz ? computeScore(this.quiz) : null,
      lastResult: this.progress.lastResult,
      certificateVisible: this.results.easel.visible,
      bubble: this.bubble.visible ? this.bubble.text : null,
    };
  }
}

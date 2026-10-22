import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/cairo/arabic-800.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/latin-700.css';
import '@fontsource/cairo/latin-800.css';
import './styles/main.css';

import * as THREE from 'three';
import { supportsWebGL2, createRenderer, AdaptiveQuality } from './engine/renderer.js';
import { CameraRig } from './engine/cameraRig.js';
import { Interaction } from './engine/interaction.js';
import { AudioFX } from './engine/audio.js';
import { Speech } from './engine/speech.js';
import { XRSupport } from './engine/xr.js';
import { services } from './engine/services.js';
import { tick } from './engine/ticker.js';
import { setMaxAnisotropy } from './ui3d/textCanvas.js';
import { SpeechBubble } from './ui3d/SpeechBubble.js';
import { Button3D } from './ui3d/Button3D.js';
import { World } from './world/World.js';
import { buildGate } from './world/gate.js';
import { STATION_ZONE_IDS } from './world/layout.js';
import { PALETTE } from './world/palette.js';
import { Ali } from './character/Ali.js';
import { Station } from './stations/Station.js';
import { EarthquakeModel } from './stations/models/EarthquakeModel.js';
import { VolcanoModel } from './stations/models/VolcanoModel.js';
import { WeatheringModel } from './stations/models/WeatheringModel.js';
import { ErosionModel } from './stations/models/ErosionModel.js';
import { HumanModel } from './stations/models/HumanModel.js';
import { ChallengeHall } from './challenge/ChallengeHall.js';
import { ResultsHall } from './challenge/ResultsHall.js';
import { renderDioramas, renderMapImage } from './challenge/dioramas.js';
import { HUD } from './hud/hud.js';
import { Game } from './app/Game.js';
import { STATIONS } from './content/stations.js';
import { PRACTICE } from './content/practice.js';
import { STRINGS } from './content/strings.js';

// الاتجاه من اليمين لليسار حتى لو عُرضت الصفحة داخل إطار يضيف هيكل HTML خاصًا به
document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

const params = new URLSearchParams(location.search);

// ------------------------------------------------------------ شاشة التحميل والأخطاء
const loadingEl = document.getElementById('loading');
const fillEl = document.getElementById('loading-fill');
const textEl = document.getElementById('loading-text');
let booted = false;

function progress(p, text) {
  fillEl.style.width = `${Math.round(p * 100)}%`;
  if (text) textEl.textContent = text;
}

function showError(message, detail = '') {
  loadingEl.classList.add('hidden');
  document.getElementById('error-screen').classList.remove('hidden');
  document.getElementById('error-text').textContent = message;
  document.getElementById('error-detail').textContent = detail;
  document.getElementById('error-retry').onclick = () => location.reload();
}

class StepError extends Error {
  constructor(step, cause) {
    super(`${step}: ${cause?.message ?? cause}`);
    this.step = step;
    this.cause = cause;
  }
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function step(label, p, fn) {
  progress(p, label);
  await frame();
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    throw new StepError(label, e);
  }
}

async function loadFonts() {
  if (!document.fonts?.load) return true;
  const sample = 'مغامرة المستكشف علي 0123';
  const loads = [400, 600, 700, 800].map((w) => document.fonts.load(`${w} 48px Cairo`, sample));
  const timeout = new Promise((r) => setTimeout(() => r('timeout'), 6000));
  const res = await Promise.race([Promise.all(loads).then(() => 'ok'), timeout]);
  return res === 'ok' && document.fonts.check('700 48px Cairo', sample);
}

function fitCamera(camera, renderer, stage) {
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  camera.aspect = w / h;
  // نحافظ على مجال الرؤية الأفقي في الشاشات الأضيق (الأجهزة اللوحية)
  const base = 50;
  const ref = 16 / 9;
  if (camera.aspect >= ref) camera.fov = base;
  else {
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * ref);
    camera.fov = Math.min(70, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)));
  }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ------------------------------------------------------------ الإقلاع
async function boot() {
  if (!supportsWebGL2()) {
    showError(
      'عذرًا، متصفحك أو جهازك لا يدعم الرسومات ثلاثية الأبعاد (WebGL 2).',
      'جرّب أحدث نسخة من Chrome أو Edge، وتأكد من تفعيل «تسريع الأجهزة» في إعدادات المتصفح.'
    );
    return;
  }
  services.timeScale = Math.max(1, Number(params.get('speed')) || 1);

  const fontsOk = await step('تحميل الخط العربي…', 0.05, loadFonts);

  const stage = document.getElementById('stage');
  const { renderer, scene, camera, player } = await step('تجهيز المشهد ثلاثي الأبعاد…', 0.1, () => {
    const renderer = createRenderer(stage);
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.horizon);
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1200);
    const player = new THREE.Group();
    player.name = 'player';
    player.add(camera);
    scene.add(player);
    fitCamera(camera, renderer, stage);
    return { renderer, scene, camera, player };
  });
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('توقفت الرسومات مؤقتًا بسبب ضغط على الجهاز.', 'اضغط «إعادة المحاولة» لإعادة تحميل المغامرة؛ سيتم استئناف تقدمك.');
  });

  const interaction = new Interaction(camera, renderer.domElement);
  const audio = new AudioFX();
  const speech = new Speech();
  speech.enabled = audio.enabled;
  Object.assign(services, { renderer, scene, camera, interaction, audio, speech });

  const world = await step('بناء الجزيرة الكرتونية…', 0.18, () => {
    const w = new World(scene);
    w.build();
    services.world = w;
    return w;
  });

  const gateZone = world.zones.gate;
  await step('تجهيز بوابة المغامرة…', 0.26, () => buildGate(gateZone.frame, { title: STRINGS.siteTitle, subtitle: STRINGS.siteSubtitle }));

  const { ali, bubble } = await step('تجهيز المستكشف علي…', 0.32, () => {
    const ali = new Ali();
    scene.add(ali);
    const bubble = new SpeechBubble();
    scene.add(bubble);
    return { ali, bubble };
  });

  const dio = await step('رسم الصور التعليمية…', 0.4, () =>
    renderDioramas((p) => progress(0.4 + p * 0.25, 'رسم الصور التعليمية…'))
  );

  // المعالجات تُربط بعد إنشاء اللعبة
  const H = {};
  const handlers = {
    onWatch: (s) => H.game.onWatch(s),
    onReplay: (s) => H.game.onReplay(s),
    onNext: (s) => H.game.onNext(s),
    onBeforeAfter: (s) => H.game.onBeforeAfter(s),
    onPracticeAnswer: (s, i) => H.game.onPracticeAnswer(s, i),
    onPlayComplete: (s) => H.game.onPlayComplete(s),
  };
  const MODELS = { earthquake: EarthquakeModel, volcano: VolcanoModel, weathering: WeatheringModel, erosion: ErosionModel, human: HumanModel };
  const stations = await step('تجهيز المحطات الخمس…', 0.68, async () => {
    const list = [];
    for (let i = 0; i < STATIONS.length; i++) {
      const def = STATIONS[i];
      progress(0.68 + (i / STATIONS.length) * 0.14, `تجهيز محطة ${def.name}…`);
      await frame();
      list.push(
        new Station({
          index: i,
          def,
          zone: world.zones[STATION_ZONE_IDS[i]],
          model: new MODELS[def.id](),
          practice: def.practice ? PRACTICE[def.practice] : null,
          images: dio.images,
          handlers,
        })
      );
    }
    return list;
  });

  const { hall, results } = await step('تجهيز قاعة التحدي…', 0.84, () => {
    const hall = new ChallengeHall({
      zone: world.zones.challenge,
      images: dio.images,
      handlers: {
        onStart: () => H.game.startChallenge(),
        onAnswer: (i) => H.game.onAnswer(i),
        onNext: () => H.game.onNextQuestion(),
      },
    });
    const results = new ResultsHall({
      zone: world.zones.results,
      handlers: {
        onDownload: () => H.game.openCertificate(),
        onRetry: () => H.game.retryChallenge(),
        onReview: () => H.game.reviewStations(),
        onHome: () => H.game.goWelcome(),
      },
    });
    return { hall, results };
  });

  const mapImage = await step('رسم خريطة الجزيرة…', 0.9, () => renderMapImage(scene));

  const xr = new XRSupport({ renderer, scene, camera, player, interaction });
  services.xr = xr;

  // زر بدء ثلاثي الأبعاد عند البوابة (يظهر في وضع VR فقط)
  const gateStartBtn = new Button3D({
    id: 'gate-start',
    label: 'ابدأ المغامرة',
    icon: 'play',
    color: PALETTE.orange,
    height: 1.1,
    fontSize: 0.5,
    onClick: () => H.game.start(),
  });
  gateStartBtn.position.set(0, 1.2, 7);
  gateStartBtn.hide(true);
  gateZone.frame.add(gateStartBtn);

  const rig = new CameraRig(camera, renderer.domElement);
  const hud = new HUD({
    start: () => H.game.start(),
    restart: () => H.game.restart(),
    toggleSound: () => H.game.toggleSound(),
    vr: () => H.game.vr(),
    teacher: () => H.game.openTeacher(),
    replay: () => H.game.replayAction(),
    map: () => H.game.openMap(),
    resetView: () => rig.resetView(),
    primary: () => H.game.primaryAction(),
    goTo: (key) => H.game.goTo(key),
    listen: () => H.game.listen(),
  });
  hud.setSound(audio.enabled);
  hud.setListenAvailable(speech.available);
  speech.onChange((v) => hud.setListenAvailable(v));
  xr.checkSupport().then((v) => hud.setVRSupported(v));

  const welcomeView = {
    pos: gateZone.frame.localToWorld(new THREE.Vector3(0.6, 4.9, 21.5)),
    target: gateZone.frame.localToWorld(new THREE.Vector3(0.6, 3.9, 0)),
    minDist: 8,
    maxDist: 24,
    azRange: 0.7,
  };
  const gateSpot = world.groundPoint('gate', 4.4, 5.2);

  const game = new Game({
    renderer,
    scene,
    camera,
    player,
    rig,
    interaction,
    audio,
    speech,
    world,
    ali,
    bubble,
    hud,
    stations,
    hall,
    results,
    xr,
    images: dio.images,
    aliPortrait: dio.aliPortrait,
    mapImage,
    welcomeView,
    gateSpot,
    gateStartBtn,
  });
  H.game = game;
  services.game = game;
  xr.onChange((v) => game.onXRChange(v));

  await step('تجهيز المؤثرات…', 0.95, async () => {
    game.goWelcome({ instant: true });
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      /* التجميع المسبق اختياري */
    }
  });

  window.addEventListener('resize', () => fitCamera(camera, renderer, stage));

  // ------------------------------------------------------------ الحلقة الرئيسية
  const timer = new THREE.Timer();
  const adaptive = new AdaptiveQuality(renderer);
  let elapsed = 0;
  let frameNo = 0;
  renderer.setAnimationLoop(() => {
    frameNo++;
    // عند فتح نافذة فوق العالم نخفف الرسم لتوفير طاقة الأجهزة الضعيفة
    if (!xr.presenting && document.body.classList.contains('modal-open') && frameNo % 4 !== 0) return;
    timer.update();
    const raw = Math.min(timer.getDelta(), 0.05);
    const dt = raw * services.timeScale;
    elapsed += dt;
    tick(dt);
    game.update(dt, elapsed);
    if (!xr.presenting) rig.update(dt);
    interaction.update(xr.presenting);
    world.update(dt, elapsed, game.activeCamera);
    adaptive.update(raw);
    renderer.render(scene, camera);
  });

  progress(1, 'هيا نبدأ!');
  booted = true;
  setTimeout(() => {
    loadingEl.classList.add('fade');
    setTimeout(() => loadingEl.classList.add('hidden'), 650);
  }, 250);
  hud.root.classList.remove('hidden');
  if (!fontsOk) hud.toast('تعذّر تحميل الخط العربي، تم استخدام خط بديل.');
  if (dio.failed.length) hud.toast('تعذّر رسم بعض الصور التعليمية، تم وضع صور بديلة.');

  if (params.has('test')) {
    window.__ali = {
      game,
      state: () => game.snapshot(),
      screen: (id) => interaction.screenPosition(id),
      activeIds: () => interaction.listActiveIds(),
      services,
    };
  }
}

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  if (!booted) showError('حدث خطأ أثناء تحميل المغامرة.', String(e.message || ''));
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  if (!booted) {
    const step = e.reason?.step ? `تعذّر: ${e.reason.step}` : 'حدث خطأ أثناء تحميل المغامرة.';
    showError(step, String(e.reason?.cause?.message || e.reason?.message || ''));
  }
});

boot().catch((e) => {
  console.error(e);
  showError(
    e.step ? `تعذّر تحميل جزء من المغامرة: ${e.step.replace('…', '')}` : 'حدث خطأ أثناء تحميل المغامرة.',
    String(e.cause?.message || e.message || '')
  );
});

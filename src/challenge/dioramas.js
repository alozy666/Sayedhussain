import * as THREE from 'three';
import { EarthquakeModel } from '../stations/models/EarthquakeModel.js';
import { VolcanoModel } from '../stations/models/VolcanoModel.js';
import { WeatheringModel } from '../stations/models/WeatheringModel.js';
import { ErosionModel } from '../stations/models/ErosionModel.js';
import { HumanModel } from '../stations/models/HumanModel.js';
import { Ali } from '../character/Ali.js';
import { mat } from '../world/materials.js';
import { createCanvas, placeholderImage } from '../ui3d/textCanvas.js';
import { PALETTE } from '../world/palette.js';

// الصور الكرتونية للأسئلة والمقارنات: تُرسم مرة واحدة من نماذج المحطات نفسها،
// فتبقى متطابقة بصريًا مع ما شاهده الطالب، ولا توجد ملفات صور قد تكون مفقودة.

export const IMAGE_W = 640;
export const IMAGE_H = 460;

const MODELS = {
  earthquake: EarthquakeModel,
  volcano: VolcanoModel,
  weathering: WeatheringModel,
  erosion: ErosionModel,
  human: HumanModel,
};

const LABELS = {
  earthquake: 'زلزال',
  volcano: 'بركان',
  weathering: 'تجوية',
  erosion: 'تعرية',
  human: 'تغييرات الإنسان',
};

function skyTexture() {
  const c = createCanvas(4, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7cc4ec');
  g.addColorStop(0.6, '#cdeefa');
  g.addColorStop(1, '#eef8fb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeRenderer(w, h, alpha = false) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

function addLights(scene, center = new THREE.Vector3()) {
  scene.add(new THREE.HemisphereLight('#d9efff', '#d9c7a0', 1.6));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.copy(center).add(new THREE.Vector3(14, 22, 10));
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera;
  s.left = s.bottom = -16;
  s.right = s.top = 16;
  s.near = 1;
  s.far = 80;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * يرسم الصور المصغرة لكل مظهر + صورة علي للشهادة.
 * @returns {Promise<{images: Record<string, HTMLCanvasElement>, aliPortrait: HTMLCanvasElement, failed: string[]}>}
 */
export async function renderDioramas(onProgress = () => {}) {
  const images = {};
  const failed = [];
  let renderer;
  try {
    renderer = makeRenderer(IMAGE_W, IMAGE_H);
  } catch {
    for (const k of Object.keys(MODELS)) images[k] = placeholderImage(IMAGE_W, IMAGE_H, LABELS[k]);
    return { images, aliPortrait: placeholderImage(520, 620, 'علي'), failed: Object.keys(MODELS) };
  }
  const sky = skyTexture();
  const keys = Object.keys(MODELS);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const scene = new THREE.Scene();
      scene.background = sky;
      const model = new MODELS[key]();
      scene.add(model.group);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 1, 64), mat(model.groundColor ?? PALETTE.grass, { roughness: 1 }));
      base.position.y = -0.5;
      base.receiveShadow = true;
      scene.add(base);
      addLights(scene, model.pictureView.target);
      model.applyAt(model.pictureTime);
      model.update(0.016, 2.4);
      const v = model.pictureView;
      const cam = new THREE.PerspectiveCamera(v.fov ?? 42, IMAGE_W / IMAGE_H, 0.1, 200);
      cam.position.copy(v.pos);
      cam.lookAt(v.target);
      renderer.render(scene, cam);
      const c = createCanvas(IMAGE_W, IMAGE_H);
      c.getContext('2d').drawImage(renderer.domElement, 0, 0);
      images[key] = c;
    } catch (e) {
      console.warn('تعذر رسم الصورة', key, e);
      images[key] = placeholderImage(IMAGE_W, IMAGE_H, LABELS[key]);
      failed.push(key);
    }
    onProgress((i + 1) / (keys.length + 1));
    await nextFrame();
  }

  // صورة علي للشهادة (خلفية شفافة)
  let aliPortrait;
  try {
    const r2 = makeRenderer(520, 620, true);
    r2.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    addLights(scene);
    const ali = new Ali();
    ali.scale.setScalar(1);
    ali.snapPose('wave', 0.35);
    ali.rotation.y = -0.15;
    scene.add(ali);
    const cam = new THREE.PerspectiveCamera(30, 520 / 620, 0.1, 50);
    cam.position.set(0, 1.25, 4.6);
    cam.lookAt(0, 0.95, 0);
    r2.render(scene, cam);
    aliPortrait = createCanvas(520, 620);
    aliPortrait.getContext('2d').drawImage(r2.domElement, 0, 0);
    r2.dispose();
    r2.forceContextLoss();
  } catch (e) {
    console.warn('تعذر رسم صورة علي', e);
    aliPortrait = placeholderImage(520, 620, 'علي');
    failed.push('ali');
  }
  onProgress(1);
  renderer.dispose();
  renderer.forceContextLoss();
  return { images, aliPortrait, failed };
}

/** لقطة علوية للجزيرة تُستخدم في نافذة الخريطة. */
export function renderMapImage(scene, size = 900, extent = 70) {
  let r;
  try {
    r = makeRenderer(size, size);
    const cam = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, 400);
    cam.position.set(0, 160, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    const fog = scene.fog;
    scene.fog = null;
    r.render(scene, cam);
    scene.fog = fog;
    const url = r.domElement.toDataURL('image/jpeg', 0.85);
    return { url, extent };
  } catch (e) {
    console.warn('تعذر رسم الخريطة', e);
    return null;
  } finally {
    r?.dispose();
    r?.forceContextLoss();
  }
}

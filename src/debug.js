// أداة تطوير: معاينة الشخصية والعالم بسرعة (?debug=ali أو ?debug=world)
import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { World } from './world/World.js';
import { Ali } from './character/Ali.js';
import { tick } from './engine/ticker.js';
import { services } from './engine/services.js';

export async function runDebug(mode) {
  document.getElementById('loading').classList.add('hidden');
  const stage = document.getElementById('stage');
  const renderer = createRenderer(stage);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 900);
  services.renderer = renderer;
  services.scene = scene;
  services.camera = camera;
  const world = new World(scene);
  world.build();
  const params = new URLSearchParams(location.search);

  const alis = [];
  if (mode === 'ali') {
    const poses = ['idle', 'wave', 'point', 'think', 'thumbsUp', 'encourage', 'celebrate', 'walk'];
    poses.forEach((p, i) => {
      const a = new Ali();
      a.position.set((i - 3.5) * 1.6, 0, 54);
      a.setPose(p, { target: new THREE.Vector3(a.position.x - 5, 1, 58) });
      a.faceYaw(0, true);
      scene.add(a);
      alis.push(a);
    });
    const zoom = params.get('zoom');
    if (zoom != null) {
      const a = alis[Number(zoom)];
      camera.position.set(a.position.x + 0.2, 1.9, a.position.z + 3.2);
      camera.lookAt(a.position.x, 1.45, a.position.z);
    } else {
      camera.position.set(0, 2.2, 66);
      camera.lookAt(0, 1.3, 54);
    }
    world.setShadowFocus(new THREE.Vector3(0, 0, 54));
  } else {
    const v = params.get('view') || 'top';
    if (v === 'top') {
      camera.position.set(0, 120, 60);
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(0, 5, 67);
      camera.lookAt(0, 3.5, 50);
    }
  }

  const clock = new THREE.Timer();
  renderer.setAnimationLoop(() => {
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.05);
    tick(dt);
    const t = clock.getElapsed();
    for (const a of alis) a.update(dt, t);
    world.update(dt, t, camera);
    renderer.render(scene, camera);
  });
  window.__debugReady = true;
}

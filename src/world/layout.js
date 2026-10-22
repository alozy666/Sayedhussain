import * as THREE from 'three';
import { PALETTE } from './palette.js';

// تخطيط الجزيرة: كل منطقة على دائرة حول المركز، والمسار الدائري يربطها بالترتيب.
// الزوايا بالدرجات (x = r·cos θ ، z = r·sin θ). الترتيب تصاعدي مع اتجاه الرحلة.

export const ISLAND_R = 60; // بداية الشاطئ
export const RING_R = 36; // نصف قطر المسار الدائري

export const ZONE_DEFS = {
  gate: { angle: 90, r: 52, flat: 9, facing: 'out' },
  earthquake: { angle: 132, r: 46, flat: 13, facing: 'in' },
  volcano: { angle: 180, r: 48, flat: 14, facing: 'in', ground: '#c9b39a' },
  weathering: { angle: 228, r: 46, flat: 12, facing: 'in', ground: PALETTE.sand },
  erosion: { angle: 276, r: 46, flat: 13, facing: 'in' },
  human: { angle: 324, r: 46, flat: 12, facing: 'in', ground: '#e8cd98' },
  challenge: { angle: 372, r: 46, flat: 13, facing: 'in' },
  results: { angle: 420, r: 45, flat: 11, facing: 'in' },
};

export const STATION_ZONE_IDS = ['earthquake', 'volcano', 'weathering', 'erosion', 'human'];

export function zoneCenter(def) {
  const a = THREE.MathUtils.degToRad(def.angle);
  return new THREE.Vector3(Math.cos(a) * def.r, 0, Math.sin(a) * def.r);
}

export function ringPoint(angleDeg, r = RING_R) {
  const a = THREE.MathUtils.degToRad(angleDeg);
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

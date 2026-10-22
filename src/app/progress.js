// حفظ تقدم الطالب خلال الجلسة (sessionStorage) — يُستأنف عند تحديث الصفحة.

import { readJSON, writeJSON, removeKey } from './storage.js';
import { STATION_COUNT } from '../content/stations.js';

const KEY = 'ali-explorer-progress-v1';

export function freshProgress() {
  return {
    v: 1,
    stationsDone: Array(STATION_COUNT).fill(false),
    practiceDone: { weathering: false, erosion: false },
    practiceTries: { weathering: 0, erosion: 0 },
    location: { type: 'welcome', index: 0 },
    challenge: null, // { attemptId, answers: [...] , index }
    lastResult: null,
  };
}

export function loadProgress() {
  const p = readJSON('session', KEY, null);
  if (!p || p.v !== 1 || !Array.isArray(p.stationsDone) || p.stationsDone.length !== STATION_COUNT) {
    return freshProgress();
  }
  return { ...freshProgress(), ...p };
}

export function saveProgress(p) {
  writeJSON('session', KEY, p);
}

export function clearProgress() {
  removeKey('session', KEY);
}

export function hasMeaningfulProgress(p) {
  return p.stationsDone.some(Boolean) || p.location.type !== 'welcome' || !!p.lastResult;
}

/** آخر محطة مفتوحة (المحطات تُفتح بالترتيب). */
export function unlockedStationCount(p) {
  let n = 1;
  for (let i = 0; i < p.stationsDone.length; i++) {
    if (p.stationsDone[i]) n = Math.max(n, i + 2);
  }
  return Math.min(n, STATION_COUNT);
}

export function allStationsDone(p) {
  return p.stationsDone.every(Boolean);
}

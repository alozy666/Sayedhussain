// تخزين آمن: إذا منع المتصفح التخزين (وضع خاص أو إطار مقيد) نستخدم الذاكرة بدلًا منه.

const memory = new Map();

function getStore(kind) {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__ali_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJSON(kind, key, fallback) {
  try {
    const s = getStore(kind);
    const raw = s ? s.getItem(key) : memory.get(`${kind}:${key}`);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJSON(kind, key, value) {
  const raw = JSON.stringify(value);
  try {
    const s = getStore(kind);
    if (s) {
      s.setItem(key, raw);
      return true;
    }
  } catch {
    /* يتم الرجوع إلى الذاكرة */
  }
  memory.set(`${kind}:${key}`, raw);
  return false;
}

export function removeKey(kind, key) {
  try {
    const s = getStore(kind);
    if (s) s.removeItem(key);
  } catch {
    /* تجاهل */
  }
  memory.delete(`${kind}:${key}`);
}

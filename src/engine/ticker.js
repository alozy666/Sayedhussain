// حلقة تحديث مركزية: أي كائن يحتاج حركة مستمرة يسجل دالة هنا.

const fns = new Set();
let elapsed = 0;

export function onTick(fn) {
  fns.add(fn);
  return () => fns.delete(fn);
}

export function tick(dt) {
  elapsed += dt;
  for (const fn of [...fns]) fn(dt, elapsed);
}

export function now() {
  return elapsed;
}

/**
 * حركة مؤقتة: تستدعي onUpdate(تقدم 0..1) لمدة duration ثم تنتهي.
 * تعيد دالة إلغاء، وتعيد Promise عبر الخاصية done.
 */
export function animate(duration, onUpdate, easing = (t) => t) {
  let t = 0;
  let cancel;
  const done = new Promise((resolve) => {
    if (duration <= 0) {
      onUpdate(1);
      resolve();
      cancel = () => {};
      return;
    }
    const off = onTick((dt) => {
      t += dt;
      const p = Math.min(1, t / duration);
      onUpdate(easing(p));
      if (p >= 1) {
        off();
        resolve();
      }
    });
    cancel = () => {
      off();
      resolve();
    };
  });
  return { done, cancel };
}

/** انتظار بالثواني وفق ساعة اللعبة. */
export function wait(seconds) {
  return animate(seconds, () => {}).done;
}

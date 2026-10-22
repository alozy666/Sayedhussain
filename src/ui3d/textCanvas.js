import * as THREE from 'three';
import { PALETTE } from '../world/palette.js';

// رسم النص العربي على Canvas ثنائي الأبعاد: المتصفح يتولى تشكيل الحروف ووصلها،
// ونضبط الاتجاه من اليمين إلى اليسار حتى تظهر علامات الترقيم في مكانها الصحيح.

export const FONT_FAMILY = "Cairo, Tajawal, 'Segoe UI', Tahoma, Arial, sans-serif";
const RLE = '‫';
const PDF = '‬';

let maxAnisotropy = 4;
export function setMaxAnisotropy(n) {
  maxAnisotropy = n;
}

export function font(size, weight = 700) {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

export function rtl(text) {
  return RLE + text + PDF;
}

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  c.dir = 'rtl';
  return c;
}

export function getCtx(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  return ctx;
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function measure(ctx, text) {
  return ctx.measureText(rtl(text)).width;
}

/** يقسم النص إلى أسطر حسب العرض الأقصى (مع احترام \n). */
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (line && measure(ctx, test) > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * يرسم نصًا ملتفًا متمركزًا عموديًا حول y.
 * @returns {number} الارتفاع الكلي المستخدم
 */
export function drawText(ctx, text, x, y, o = {}) {
  const {
    size = 48,
    weight = 700,
    color = PALETTE.navy,
    align = 'center',
    maxWidth = 1000,
    lineHeight = 1.45,
    stroke = null,
    strokeWidth = 0,
    shadow = null,
    valign = 'middle',
  } = o;
  ctx.save();
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.direction = 'rtl';
  const lines = wrapText(ctx, text, maxWidth);
  const lh = size * lineHeight;
  const total = lines.length * lh;
  let top = valign === 'top' ? y : valign === 'bottom' ? y - total : y - total / 2;
  if (shadow) {
    ctx.shadowColor = shadow.color ?? 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = shadow.blur ?? 8;
    ctx.shadowOffsetY = shadow.y ?? 3;
  }
  lines.forEach((line, i) => {
    const ly = top + lh * i + lh / 2;
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(rtl(line), x, ly);
    }
    ctx.fillStyle = color;
    ctx.fillText(rtl(line), x, ly);
  });
  ctx.restore();
  return total;
}

/** يحسب أبعاد النص الملتف دون رسمه. */
export function measureBlock(ctx, text, { size = 48, weight = 700, maxWidth = 1000, lineHeight = 1.45 } = {}) {
  ctx.save();
  ctx.font = font(size, weight);
  const lines = wrapText(ctx, text, maxWidth);
  const width = Math.max(...lines.map((l) => measure(ctx, l)), 0);
  ctx.restore();
  return { lines, width, height: lines.length * size * lineHeight };
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function starPath(ctx, cx, cy, outer, inner, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** أيقونات متجهة بسيطة ترسم على اللوحات (بدون رموز تعبيرية حتى تظهر في كل الأجهزة). */
export function drawIcon(ctx, name, cx, cy, s, color = '#fff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (name) {
    case 'play': {
      ctx.beginPath();
      // رمز التشغيل المتعارف عليه عالميًا
      ctx.moveTo(cx - s * 0.32, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.42, cy);
      ctx.lineTo(cx - s * 0.32, cy + s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'replay': {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.36, -Math.PI * 0.35, Math.PI * 1.35);
      ctx.stroke();
      const a = -Math.PI * 0.35;
      const ax = cx + Math.cos(a) * s * 0.36;
      const ay = cy + Math.sin(a) * s * 0.36;
      ctx.beginPath();
      ctx.moveTo(ax + s * 0.2, ay - s * 0.05);
      ctx.lineTo(ax - s * 0.06, ay - s * 0.2);
      ctx.lineTo(ax - s * 0.02, ay + s * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'next': {
      // سهم يشير إلى اليسار (اتجاه التقدم في العربية)
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.38, cy);
      ctx.lineTo(cx - s * 0.32, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05, cy - s * 0.3);
      ctx.lineTo(cx - s * 0.36, cy);
      ctx.lineTo(cx - s * 0.05, cy + s * 0.3);
      ctx.stroke();
      break;
    }
    case 'check': {
      ctx.lineWidth = s * 0.18;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.32, cy + s * 0.02);
      ctx.lineTo(cx - s * 0.08, cy + s * 0.26);
      ctx.lineTo(cx + s * 0.36, cy - s * 0.24);
      ctx.stroke();
      break;
    }
    case 'cross': {
      ctx.lineWidth = s * 0.16;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.24, cy - s * 0.24);
      ctx.lineTo(cx + s * 0.24, cy + s * 0.24);
      ctx.moveTo(cx + s * 0.24, cy - s * 0.24);
      ctx.lineTo(cx - s * 0.24, cy + s * 0.24);
      ctx.stroke();
      break;
    }
    case 'star': {
      starPath(ctx, cx, cy, s * 0.45, s * 0.2);
      ctx.fill();
      break;
    }
    case 'speaker': {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.36, cy - s * 0.12);
      ctx.lineTo(cx - s * 0.16, cy - s * 0.12);
      ctx.lineTo(cx + s * 0.06, cy - s * 0.32);
      ctx.lineTo(cx + s * 0.06, cy + s * 0.32);
      ctx.lineTo(cx - s * 0.16, cy + s * 0.12);
      ctx.lineTo(cx - s * 0.36, cy + s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(cx + s * 0.1, cy, s * 0.18, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.1, cy, s * 0.32, -0.9, 0.9);
      ctx.stroke();
      break;
    }
    case 'flag': {
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.25, cy + s * 0.4);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.25, cy - s * 0.4);
      ctx.lineTo(cx - s * 0.35, cy - s * 0.22);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.02);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'home': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.42, cy);
      ctx.lineTo(cx + s * 0.28, cy);
      ctx.lineTo(cx + s * 0.28, cy + s * 0.36);
      ctx.lineTo(cx - s * 0.28, cy + s * 0.36);
      ctx.lineTo(cx - s * 0.28, cy);
      ctx.lineTo(cx - s * 0.42, cy);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'map': {
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.4, cy - s * 0.28);
      ctx.lineTo(cx - s * 0.13, cy - s * 0.36);
      ctx.lineTo(cx + s * 0.13, cy - s * 0.28);
      ctx.lineTo(cx + s * 0.4, cy - s * 0.36);
      ctx.lineTo(cx + s * 0.4, cy + s * 0.28);
      ctx.lineTo(cx + s * 0.13, cy + s * 0.36);
      ctx.lineTo(cx - s * 0.13, cy + s * 0.28);
      ctx.lineTo(cx - s * 0.4, cy + s * 0.36);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'download': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.38);
      ctx.lineTo(cx, cy + s * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.24, cy - s * 0.08);
      ctx.lineTo(cx, cy + s * 0.18);
      ctx.lineTo(cx + s * 0.24, cy - s * 0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.36, cy + s * 0.36);
      ctx.lineTo(cx + s * 0.36, cy + s * 0.36);
      ctx.stroke();
      break;
    }
    case 'swap': {
      ctx.lineWidth = s * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.36, cy - s * 0.14);
      ctx.lineTo(cx + s * 0.32, cy - s * 0.14);
      ctx.moveTo(cx + s * 0.14, cy - s * 0.3);
      ctx.lineTo(cx + s * 0.34, cy - s * 0.14);
      ctx.lineTo(cx + s * 0.14, cy + s * 0.02);
      ctx.moveTo(cx + s * 0.36, cy + s * 0.18);
      ctx.lineTo(cx - s * 0.32, cy + s * 0.18);
      ctx.moveTo(cx - s * 0.14, cy + s * 0.02);
      ctx.lineTo(cx - s * 0.34, cy + s * 0.18);
      ctx.lineTo(cx - s * 0.14, cy + s * 0.34);
      ctx.stroke();
      break;
    }
    case 'clock': {
      ctx.lineWidth = s * 0.09;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.22);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + s * 0.16, cy + s * 0.1);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** صورة بديلة لطيفة إذا تعذر توليد صورة مصغرة. */
export function placeholderImage(w, h, label = 'صورة') {
  const c = createCanvas(w, h);
  const ctx = getCtx(c);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#dff1fb');
  g.addColorStop(1, '#f6ecd6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  drawText(ctx, label, w / 2, h / 2, { size: Math.round(h / 8), color: PALETTE.navySoft, maxWidth: w * 0.9 });
  return c;
}

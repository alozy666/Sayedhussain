import { PALETTE } from '../world/palette.js';
import { STRINGS } from '../content/strings.js';
import { createCanvas, getCtx, drawText, roundRect, starPath } from '../ui3d/textCanvas.js';

export const CERT_W = 1600;
export const CERT_H = 1131;

function formatDate(d = new Date()) {
  try {
    return d.toLocaleDateString('ar-BH-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** يرسم «شهادة المستكشف الصغير» على Canvas (للعرض داخل العالم وللتنزيل). */
export function drawCertificate({ score, total, percent, name = '', aliPortrait = null, date = new Date() }) {
  const c = createCanvas(CERT_W, CERT_H);
  const ctx = getCtx(c);
  const W = CERT_W;
  const H = CERT_H;

  // الخلفية
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fffdf6');
  bg.addColorStop(1, '#fff3da');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // إطاران زخرفيان
  roundRect(ctx, 30, 30, W - 60, H - 60, 50);
  ctx.lineWidth = 26;
  ctx.strokeStyle = PALETTE.mint;
  ctx.stroke();
  roundRect(ctx, 66, 66, W - 132, H - 132, 36);
  ctx.lineWidth = 7;
  ctx.strokeStyle = PALETTE.gold;
  ctx.stroke();

  // نجوم الزوايا
  for (const [x, y] of [
    [110, 110],
    [W - 110, 110],
    [110, H - 110],
    [W - 110, H - 110],
  ]) {
    starPath(ctx, x, y, 34, 15);
    ctx.fillStyle = PALETTE.gold;
    ctx.fill();
  }

  // صورة علي (على اليسار لأن النص يبدأ من اليمين)
  const px = 120;
  const py = 230;
  const pw = 430;
  const ph = 560;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 50);
  ctx.fillStyle = '#e3f4fb';
  ctx.fill();
  ctx.clip();
  const g = ctx.createRadialGradient(px + pw / 2, py + ph * 0.45, 40, px + pw / 2, py + ph * 0.45, pw * 0.75);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#cdeefa');
  ctx.fillStyle = g;
  ctx.fillRect(px, py, pw, ph);
  if (aliPortrait) {
    const s = Math.min(pw / aliPortrait.width, ph / aliPortrait.height) * 1.02;
    const dw = aliPortrait.width * s;
    const dh = aliPortrait.height * s;
    ctx.drawImage(aliPortrait, px + (pw - dw) / 2, py + ph - dh, dw, dh);
  }
  ctx.restore();
  roundRect(ctx, px, py, pw, ph, 50);
  ctx.lineWidth = 10;
  ctx.strokeStyle = PALETTE.skyBlue;
  ctx.stroke();
  drawText(ctx, 'المستكشف علي', px + pw / 2, py + ph + 52, { size: 44, weight: 800, color: PALETTE.navySoft });

  // النصوص (العمود الأيمن)
  const cx = 1010;
  drawText(ctx, STRINGS.certificateTitle, cx, 190, { size: 76, weight: 800, color: PALETTE.navy, maxWidth: 900 });
  ctx.fillStyle = PALETTE.orange;
  roundRect(ctx, cx - 150, 262, 300, 14, 7);
  ctx.fill();
  drawText(ctx, STRINGS.certificateGivenTo, cx, 340, { size: 50, weight: 600, color: PALETTE.navySoft });
  const displayName = name.trim() || STRINGS.certificateDefaultName;
  drawText(ctx, displayName, cx, 435, { size: 84, weight: 800, color: PALETTE.mintDark, maxWidth: 900 });
  ctx.strokeStyle = '#d9c9a6';
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  ctx.moveTo(cx - 380, 495);
  ctx.lineTo(cx + 380, 495);
  ctx.stroke();
  ctx.setLineDash([]);
  drawText(ctx, STRINGS.certificateBody, cx, 585, { size: 46, weight: 600, color: PALETTE.navy, maxWidth: 900, lineHeight: 1.55 });

  // النتيجة والنجوم
  drawText(ctx, `النتيجة: ${score}/${total}  (${percent}%)`, cx, 720, { size: 64, weight: 800, color: PALETTE.navy });
  for (let i = 0; i < total; i++) {
    const sx = cx + (i - (total - 1) / 2) * 120;
    starPath(ctx, sx, 830, 52, 23);
    ctx.fillStyle = i < score ? PALETTE.gold : '#e6e1d6';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = i < score ? PALETTE.goldDark : '#cfc8b8';
    ctx.stroke();
  }

  // التاريخ والتذييل
  drawText(ctx, `التاريخ: ${formatDate(date)}`, cx, 945, { size: 40, weight: 600, color: PALETTE.navySoft });
  drawText(ctx, STRINGS.certificateFooter, W / 2, H - 112, { size: 34, weight: 600, color: '#8a7b60' });
  return c;
}

/** ينزّل الشهادة كصورة PNG (مع بديل عند منع التنزيل). */
export function downloadCanvas(canvas, filename = 'ali-explorer-certificate.png') {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        resolve(true);
      }, 'image/png');
    } catch {
      resolve(false);
    }
  });
}

/** يطبع الشهادة في نافذة مستقلة. */
export function printCanvas(canvas) {
  try {
    const url = canvas.toDataURL('image/png');
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.write(
      `<!doctype html><html dir="rtl"><head><title>${STRINGS.certificateTitle}</title><style>@page{size:landscape;margin:0}body{margin:0;display:grid;place-items:center;height:100vh}img{max-width:100%;max-height:100vh}</style></head><body><img src="${url}" onload="setTimeout(()=>{window.print()},200)"></body></html>`
    );
    w.document.close();
    return true;
  } catch {
    return false;
  }
}

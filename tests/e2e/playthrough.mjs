// اختبار شامل آلي: يلعب المغامرة كاملة بنقرات فأرة حقيقية على العناصر ثلاثية الأبعاد.
// التشغيل:  npm run build && npm run test:e2e
// يحتاج متصفح Chromium: يُستخدم المسار في CHROMIUM_PATH إن وُجد، وإلا متصفح Playwright المثبت.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'test-results');
mkdirSync(outDir, { recursive: true });

const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) throw new Error(`فشل: ${name} ${detail}`);
}

const server = await preview({ root, preview: { port: 4179, strictPort: false, open: false }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const state = () => page.evaluate(() => window.__ali.state());
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const waitFor = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout, polling: 200 });
const waitIdle = () => waitFor(() => !window.__ali.state().busy);

/** نقرة فأرة حقيقية على عنصر ثلاثي الأبعاد حسب موضعه على الشاشة. */
async function click3D(id) {
  await waitFor((id) => window.__ali.activeIds().includes(id) && !window.__ali.state().busy, id);
  await page.waitForTimeout(450); // انتهاء حركة الظهور
  const p = await page.evaluate((id) => window.__ali.screen(id), id);
  if (!p) throw new Error(`العنصر غير ظاهر: ${id}`);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

try {
  // ---------------------------------------------------------------- التحميل
  await page.goto(`${base}?test=1&speed=4`);
  await waitFor(() => window.__ali && document.getElementById('loading').classList.contains('hidden'), null, 180000);
  check('يتحمّل الموقع ويظهر العالم ثلاثي الأبعاد', await page.locator('#world-canvas').isVisible());
  check('واجهة عربية من اليمين لليسار', (await page.getAttribute('html', 'dir')) === 'rtl');
  check('زر «ابدأ المغامرة» ظاهر', await page.locator('#btn-start').isVisible());
  await shot('01-welcome');

  // نافذة طريقة اللعب
  await page.click('#btn-how');
  check('تظهر تعليمات اللعب المصورة', await page.locator('.help-grid .help-item').count() >= 5);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- المحطات
  await page.click('#btn-start');
  await waitFor(() => window.__ali.state().location.type === 'station' && !window.__ali.state().busy);
  check('ينتقل الطالب إلى المحطة الأولى', (await state()).location.index === 0);
  const ids = ['earthquake', 'volcano', 'weathering', 'erosion', 'human'];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    await waitIdle();
    await shot(`02-station-${i + 1}-intro`);
    let s = await state();
    check(`المحطة ${i + 1}: الزر الرئيسي يدعو للمشاهدة أولًا`, (await page.locator('#hud-primary').textContent()).includes('شاهد'));
    await click3D(`st-${id}-watch`);
    await waitFor(() => window.__ali.state().stationPlaying);
    check(`المحطة ${i + 1}: تبدأ الظاهرة عند الضغط على زر المشاهدة`, true);
    await waitFor(() => !window.__ali.state().stationPlaying);
    if (i === 2 || i === 3) {
      await waitFor((id) => window.__ali.activeIds().includes(`card-pr-${id}-0`), id);
      await shot(`03-practice-${id}`);
      const correct = i === 2 ? 0 : 1;
      const wrong = 1 - correct;
      await click3D(`card-pr-${id}-${wrong}`);
      await page.waitForTimeout(500);
      s = await state();
      check(`تدريب ${id}: الإجابة الخاطئة لا تُكمل المحطة وتسمح بالمحاولة`, !s.progress.stationsDone[i] && s.progress.practiceTries[id] === 1);
      await page.waitForTimeout(1600);
      await click3D(`card-pr-${id}-${correct}`);
      await waitFor((i) => window.__ali.state().progress.stationsDone[i], i);
      check(`تدريب ${id}: الإجابة الصحيحة تُكمل المحطة`, true);
    } else {
      await waitFor((i) => window.__ali.state().progress.stationsDone[i], i);
    }
    await shot(`04-station-${i + 1}-done`);
    if (i === 0) {
      await click3D(`st-${id}-replay`);
      await waitFor(() => window.__ali.state().stationPlaying);
      check('زر «أعد المشاهدة» يعيد تشغيل الظاهرة', true);
      await waitFor(() => !window.__ali.state().stationPlaying);
    }
    if (id === 'human') {
      await click3D(`st-${id}-beforeafter`);
      check('زر «قبل / بعد» يعمل', true);
      await page.waitForTimeout(400);
      await click3D(`st-${id}-beforeafter`);
    }
    check(`المحطة ${i + 1}: زر «التالي» مفعّل بعد الإكمال`, !(await page.locator('#hud-primary').isDisabled()));
    await click3D(`st-${id}-next`);
    await waitFor(() => window.__ali.state().busy);
    await waitIdle();
  }
  let s = await state();
  check('بعد المحطات الخمس يصل الطالب إلى بوابة التحدي', s.location.type === 'challengeGate');
  await shot('05-challenge-gate');

  // ---------------------------------------------------------------- التحدي
  async function playChallenge(choices, label) {
    await click3D('challenge-start');
    await waitFor(() => window.__ali.state().location.type === 'challenge' && !window.__ali.state().busy);
    for (let q = 0; q < 5; q++) {
      await waitFor((q) => window.__ali.state().qIndex === q && window.__ali.activeIds().includes('card-ch-0'), q);
      check(`${label} س${q + 1}: لا يوجد تلميح قبل الاختيار`, await page.evaluate(() => window.__ali.game.hall.cards.every((c) => c.state === 'idle')));
      check(`${label} س${q + 1}: «السؤال التالي» معطل قبل الإجابة`, await page.locator('#hud-primary').isDisabled());
      if (q === 1 && label === 'المحاولة 1') {
        await page.keyboard.press(String(choices[q] + 1)); // لوحة المفاتيح
      } else {
        await click3D(`card-ch-${choices[q]}`);
      }
      await waitFor((q) => window.__ali.state().answers?.[q] != null, q);
      // محاولة إجابة ثانية بعد إظهار التصحيح يجب ألا تُحتسب
      const before = (await state()).score.correct;
      await page.evaluate((c) => window.__ali.game.onAnswer(c), (choices[q] + 1) % 3);
      check(`${label} س${q + 1}: تُحتسب الإجابة الأولى فقط`, (await state()).score.correct === before);
      if (q === 0) await shot(`06-${label}-q1-feedback`);
      await click3D('challenge-next');
      if (q < 4) await waitFor((q) => window.__ali.state().qIndex === q + 1, q);
    }
    await waitFor(() => window.__ali.state().location.type === 'results' && !window.__ali.state().busy);
    await page.waitForTimeout(2500);
    return state();
  }
  const right = [1, 2, 0, 1, 2];
  const scenario = (n) => right.map((r, i) => (i < n ? r : (r + 1) % 3));

  s = await playChallenge(scenario(4), 'المحاولة 1');
  check('4/5 = 80% ويتحقق الهدف', s.lastResult.correct === 4 && s.lastResult.percent === 80 && s.lastResult.passed);
  check('تظهر شهادة الإنجاز عند 80%', s.certificateVisible);
  await shot('07-results-80');

  // تنزيل الشهادة
  await click3D('res-download');
  await page.waitForSelector('#cert-download');
  await page.fill('.field input', 'سارة');
  const [certDl] = await Promise.all([page.waitForEvent('download'), page.click('#cert-download')]);
  const certName = certDl.suggestedFilename();
  check('تنزيل الشهادة بصيغة PNG', /\.png$/i.test(certName), certName);
  await page.keyboard.press('Escape');

  const scenarios = [
    [3, 60, false],
    [5, 100, true],
    [0, 0, false],
  ];
  for (const [n, pct, pass] of scenarios) {
    await click3D('res-retry');
    await waitFor(() => window.__ali.state().location.type === 'challenge' && !window.__ali.state().busy);
    check(`إعادة التحدي تصفّر الدرجة (${n}/5)`, (await state()).score.answered === 0);
    // يبدأ من القاعة مباشرة
    for (let q = 0; q < 5; q++) {
      await waitFor((q) => window.__ali.state().qIndex === q && window.__ali.activeIds().includes('card-ch-0'), q);
      await click3D(`card-ch-${scenario(n)[q]}`);
      await waitFor((q) => window.__ali.state().answers?.[q] != null, q);
      await click3D('challenge-next');
      if (q < 4) await waitFor((q) => window.__ali.state().qIndex === q + 1, q);
    }
    await waitFor(() => window.__ali.state().location.type === 'results' && !window.__ali.state().busy);
    await page.waitForTimeout(1500);
    s = await state();
    check(`${n}/5 = ${pct}% ${pass ? 'يتحقق' : 'لا يتحقق'} الهدف`, s.lastResult.correct === n && s.lastResult.percent === pct && s.lastResult.passed === pass);
    check(`الشهادة ${pass ? 'تظهر' : 'لا تظهر'} عند ${pct}%`, s.certificateVisible === pass);
    await shot(`08-results-${pct}`);
  }

  // ---------------------------------------------------------------- لوحة المعلم
  await page.click('#btn-teacher');
  await page.waitForSelector('.teacher-card');
  const rows = await page.locator('.teacher-card table.data').nth(1).locator('tbody tr').count();
  check('لوحة المعلم تعرض جميع المحاولات (4)', rows === 4, `عدد الصفوف ${rows}`);
  await shot('09-teacher');
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('#teacher-csv')]);
  const csvPath = path.join(outDir, 'results.csv');
  await csvDl.saveAs(csvPath);
  const csv = readFileSync(csvPath, 'utf8');
  check('ملف CSV بترميز UTF-8 مع BOM ويحتوي 4 محاولات', csv.charCodeAt(0) === 0xfeff && csv.trim().split(/\r?\n/).length === 5);
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- الخريطة والتنقل
  await page.click('#hud-map');
  await page.waitForSelector('.map-marker');
  check('نافذة الخريطة تعرض المحطات', (await page.locator('.map-marker').count()) === 7);
  await page.click('.map-marker[data-key="station:2"]');
  await waitFor(() => window.__ali.state().location.type === 'station' && window.__ali.state().location.index === 2 && !window.__ali.state().busy);
  check('الرجوع لمحطة مكتملة للمراجعة من الخريطة', true);
  await page.click('#hud-reset');
  check('زر ضبط الرؤية يعمل', true);

  // حفظ التقدم في الجلسة بعد التحديث
  await page.reload();
  await waitFor(() => window.__ali && document.getElementById('loading').classList.contains('hidden'), null, 180000);
  check('يُحفظ تقدم الطالب بعد تحديث الصفحة', (await page.locator('#btn-start span').textContent()).includes('تابع'));
  await page.click('#btn-start');
  await waitFor(() => window.__ali.state().location.type === 'station' && !window.__ali.state().busy);
  s = await state();
  check('«تابع المغامرة» يعيد الطالب إلى آخر موقع', s.location.index === 2 && s.progress.stationsDone.every(Boolean));
  await page.click('.step[data-key="welcome"]');
  await waitFor(() => window.__ali.state().location.type === 'welcome' && !window.__ali.state().busy);
  await page.click('#btn-new');
  await waitFor(() => window.__ali.state().location.type === 'station' && !window.__ali.state().busy);
  s = await state();
  check('«مغامرة جديدة» تبدأ من المحطة الأولى وتصفّر التقدم', s.location.index === 0 && s.progress.stationsDone.every((d) => !d));
  check('المحطات التالية مقفلة في المغامرة الجديدة', await page.locator('.step[data-key="station:1"].locked').count() === 1);

  check('لا توجد أخطاء في وحدة التحكم', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  console.error(e);
  await shot('zz-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\nالنتيجة: ${passed}/${results.length} فحصًا ناجحًا`);
  if (consoleErrors.length) console.log('أخطاء وحدة التحكم:', consoleErrors);
  await browser.close();
  await server.close();
}

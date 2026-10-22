import { ICONS, HELP_ART } from './icons.js';
import { STATIONS, STATION_COUNT } from '../content/stations.js';
import { STRINGS } from '../content/strings.js';
import { unlockedStationCount, allStationsDone } from '../app/progress.js';

const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  if (html) e.innerHTML = html;
  return e;
};

const STEP_ICONS = ['quake', 'volcano', 'weathering', 'erosion', 'human'];

/** واجهة الديسكتوب (HTML فوق العالم ثلاثي الأبعاد). */
export class HUD {
  constructor(actions) {
    this.a = actions;
    this.root = document.getElementById('hud');
    this.modals = document.getElementById('modals');
    this.toasts = document.getElementById('toasts');
    this.soundOn = true;
    this.vrSupported = false;
    this.build();
  }

  build() {
    const a = this.a;
    // ---------------- قائمة الترحيب
    this.welcome = el('div', { class: 'welcome-menu hidden', role: 'group', 'aria-label': 'القائمة الرئيسية' });
    this.startBtn = el('button', { class: 'btn btn-primary btn-big', type: 'button', id: 'btn-start', onclick: () => a.start() }, `${ICONS.play}<span>ابدأ المغامرة</span>`);
    this.howBtn = el('button', { class: 'btn btn-big', type: 'button', id: 'btn-how', onclick: () => this.openHelp() }, `${ICONS.help}<span>طريقة اللعب</span>`);
    this.soundBtnBig = el('button', { class: 'btn btn-big', type: 'button', id: 'btn-sound-welcome', onclick: () => a.toggleSound() });
    this.vrBtnBig = el('button', { class: 'btn btn-big btn-mint', type: 'button', id: 'btn-vr-welcome', onclick: () => a.vr() }, `${ICONS.vr}<span>وضع VR</span>`);
    this.newLink = el('button', { class: 'welcome-link hidden', type: 'button', id: 'btn-new', onclick: () => a.restart() }, 'ابدأ مغامرة جديدة من الصفر');
    this.welcome.append(this.startBtn, this.howBtn, this.soundBtnBig, this.vrBtnBig, this.newLink);
    this.root.append(this.welcome);

    this.speechCard = el('div', { class: 'welcome-speech hidden', role: 'note', 'aria-label': 'كلام المستكشف علي' });
    this.speechImg = el('img', { class: 'speaker', alt: 'المستكشف علي' });
    this.speechText = el('p', { id: 'welcome-text' });
    this.speechListen = el('button', { class: 'btn btn-mint hidden', type: 'button', id: 'welcome-listen', onclick: () => a.listen() }, `${ICONS.listen}<span>استمع لعلي</span>`);
    const body = el('div', { class: 'speech-body' });
    body.append(this.speechText, this.speechListen);
    this.speechCard.append(this.speechImg, body);
    this.root.append(this.speechCard);

    // ---------------- الشريط العلوي
    this.top = el('div', { class: 'hud-top hidden' });
    const brand = el(
      'div',
      { class: 'brand' },
      `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#7ccbe4" stroke="#1f3b63" stroke-width="3"/><path d="M9 36c6-8 12-3 18-9s10-12 18-7 8 14 10 18c-6 14-34 20-46-2z" fill="#a6dc8e"/><path d="M36 22l6-11 6 11z" fill="#c9b39a"/></svg><span class="brand-text">${STRINGS.siteTitle}</span>`
    );
    this.stepperWrap = el('div', { class: 'stepper-wrap' });
    this.stepper = el('nav', { class: 'stepper', 'aria-label': 'خريطة المحطات' });
    this.chip = el('div', { class: 'chip', id: 'progress-chip' });
    this.stepperWrap.append(this.stepper, this.chip);
    this.tools = el('div', { class: 'hud-tools' });
    this.soundBtn = el('button', { class: 'btn btn-icon', type: 'button', id: 'btn-sound', onclick: () => a.toggleSound() });
    this.helpBtn = el('button', { class: 'btn btn-icon', type: 'button', id: 'btn-help', title: 'طريقة اللعب', 'aria-label': 'طريقة اللعب', onclick: () => this.openHelp() }, ICONS.help);
    this.vrBtn = el('button', { class: 'btn btn-icon', type: 'button', id: 'btn-vr', title: 'وضع VR', 'aria-label': 'وضع الواقع الافتراضي', onclick: () => a.vr() }, ICONS.vr);
    this.teacherBtn = el('button', { class: 'btn btn-icon small', type: 'button', id: 'btn-teacher', title: 'لوحة المعلم', 'aria-label': 'لوحة المعلم', onclick: () => a.teacher() }, ICONS.teacher);
    this.tools.append(this.soundBtn, this.helpBtn, this.vrBtn, this.teacherBtn);
    this.top.append(brand, this.stepperWrap, this.tools);
    this.root.append(this.top);

    // ---------------- الشريط السفلي
    this.bottom = el('div', { class: 'hud-bottom hidden' });
    this.replayBtn = el('button', { class: 'btn', type: 'button', id: 'hud-replay', onclick: () => a.replay() }, `${ICONS.replay}<span>${STRINGS.replay}</span>`);
    this.mapBtn = el('button', { class: 'btn', type: 'button', id: 'hud-map', onclick: () => a.map() }, `${ICONS.map}<span>الخريطة</span>`);
    this.resetBtn = el('button', { class: 'btn', type: 'button', id: 'hud-reset', title: 'إعادة ضبط زاوية الرؤية (R)', onclick: () => a.resetView() }, `${ICONS.target}<span>ضبط الرؤية</span>`);
    this.primaryBtn = el('button', { class: 'btn btn-primary btn-big', type: 'button', id: 'hud-primary', onclick: () => a.primary() });
    this.bottom.append(this.replayBtn, this.mapBtn, this.resetBtn, this.primaryBtn);
    this.root.append(this.bottom);

    this.listenBtn = el('button', { class: 'btn btn-mint listen-btn hidden', type: 'button', id: 'hud-listen', onclick: () => a.listen() }, `${ICONS.listen}<span>استمع لعلي</span>`);
    this.root.append(this.listenBtn);

    this.setSound(true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalOpen) this.closeModal();
    });
  }

  // ------------------------------------------------ حالات عامة
  showWelcome(hasProgress, { text = '', portrait = null } = {}) {
    this.root.classList.remove('hidden');
    this.welcome.classList.remove('hidden');
    this.speechText.textContent = text;
    if (portrait) this.speechImg.src = portrait;
    this.speechImg.classList.toggle('hidden', !portrait);
    this.speechListen.classList.toggle('hidden', !this.listenAvailable);
    this.speechCard.classList.toggle('hidden', !text);
    this.top.classList.add('hidden');
    this.bottom.classList.add('hidden');
    this.startBtn.querySelector('span').textContent = hasProgress ? 'تابع المغامرة' : 'ابدأ المغامرة';
    this.newLink.classList.toggle('hidden', !hasProgress);
    setTimeout(() => this.startBtn.focus({ preventScroll: true }), 50);
  }

  hideWelcome() {
    this.welcome.classList.add('hidden');
    this.speechCard.classList.add('hidden');
  }

  showGameBars(v) {
    this.top.classList.toggle('hidden', !v);
    this.bottom.classList.toggle('hidden', !v);
  }

  setHidden(v) {
    this.root.classList.toggle('hidden', v);
  }

  setSound(on) {
    this.soundOn = on;
    const icon = on ? ICONS.soundOn : ICONS.soundOff;
    const label = on ? 'إيقاف الصوت' : 'تشغيل الصوت';
    this.soundBtn.innerHTML = icon;
    this.soundBtn.title = label;
    this.soundBtn.setAttribute('aria-label', label);
    this.soundBtn.setAttribute('aria-pressed', String(on));
    this.soundBtnBig.innerHTML = `${icon}<span>${on ? 'الصوت: يعمل' : 'الصوت: متوقف'}</span>`;
    this.soundBtnBig.setAttribute('aria-pressed', String(on));
  }

  setListenAvailable(v) {
    this.listenAvailable = v;
    this.listenBtn.classList.toggle('hidden', !v || this.listenHidden);
  }

  setListenHidden(v) {
    this.listenHidden = v;
    this.listenBtn.classList.toggle('hidden', !this.listenAvailable || v);
  }

  setVRSupported(v) {
    this.vrSupported = v;
    this.vrBtn.classList.toggle('dim', !v);
  }

  /** أزرار الشريط السفلي حسب الحالة. */
  setActions({ replay, map, reset, primary }) {
    const apply = (btn, cfg) => {
      btn.classList.toggle('hidden', !cfg?.visible);
      btn.disabled = cfg?.enabled === false;
    };
    apply(this.replayBtn, replay);
    apply(this.mapBtn, map);
    apply(this.resetBtn, reset);
    apply(this.primaryBtn, primary);
    if (primary?.label) {
      const icon = primary.icon ? ICONS[primary.icon] : ICONS.next;
      const iconFirst = primary.icon === 'play' || primary.icon === 'trophy';
      this.primaryBtn.innerHTML = iconFirst ? `${icon}<span>${primary.label}</span>` : `<span>${primary.label}</span>${icon}`;
    }
  }

  /** شريط المحطات: البداية ← 1..5 ← التحدي. */
  updateStepper(progress, location) {
    const unlocked = unlockedStationCount(progress);
    const items = [];
    items.push({ key: 'welcome', label: 'البداية', icon: 'gate', state: location.type === 'welcome' ? 'current' : 'done' });
    STATIONS.forEach((s, i) => {
      let state = 'locked';
      if (progress.stationsDone[i]) state = 'done';
      else if (i < unlocked) state = 'open';
      if (location.type === 'station' && location.index === i) state = 'current';
      items.push({ key: `station:${i}`, label: s.name, num: i + 1, icon: STEP_ICONS[i], state });
    });
    const chDone = !!progress.lastResult?.passed;
    let chState = allStationsDone(progress) ? (chDone ? 'done' : 'open') : 'locked';
    if (['challengeGate', 'challenge', 'results'].includes(location.type)) chState = 'current';
    items.push({ key: 'challenge', label: 'التحدي', icon: 'challenge', state: chState });

    this.stepper.innerHTML = '';
    items.forEach((it, i) => {
      if (i > 0) this.stepper.append(el('span', { class: `step-link ${items[i - 1].state === 'done' ? 'done' : ''}`, 'aria-hidden': 'true' }));
      const dot = it.state === 'done' ? ICONS.check : it.state === 'locked' ? ICONS.lock : it.num ?? ICONS[it.icon];
      const b = el(
        'button',
        {
          class: `step ${it.state}`,
          type: 'button',
          'data-key': it.key,
          'aria-current': it.state === 'current' ? 'step' : false,
          title: it.state === 'locked' ? `${it.label} (مقفلة)` : it.label,
          onclick: () => this.a.goTo(it.key, it.state),
        },
        `<span class="dot">${dot}</span><span class="name">${it.label}</span>`
      );
      this.stepper.append(b);
    });
    let chip = '';
    if (location.type === 'station') chip = STRINGS.stationKicker(location.index + 1, STATION_COUNT);
    else if (location.type === 'challengeGate') chip = 'بوابة التحدي';
    else if (location.type === 'challenge') chip = STRINGS.questionCounter((location.question ?? 0) + 1, 5);
    else if (location.type === 'results') chip = 'النتيجة';
    this.chip.textContent = chip;
    this.chip.classList.toggle('hidden', !chip);
  }

  toast(text) {
    const t = el('div', { class: 'toast' }, '');
    t.textContent = text;
    this.toasts.append(t);
    setTimeout(() => t.remove(), 4200);
  }

  // ------------------------------------------------ النوافذ
  openModal(content, { title = '', className = '', onClose = null } = {}) {
    this.closeModal(true);
    const wrap = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'نافذة' });
    const card = el('div', { class: `modal-card ${className}` });
    const close = el('button', { class: 'btn btn-icon modal-close no-print', type: 'button', 'aria-label': 'إغلاق', onclick: () => this.closeModal() }, ICONS.close);
    card.append(close);
    if (title) card.append(el('h2', {}, title));
    card.append(content);
    wrap.append(card);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) this.closeModal();
    });
    this.modals.append(wrap);
    document.body.classList.add('modal-open');
    this.modalOpen = wrap;
    this.onModalClose = onClose;
    this.lastFocus = document.activeElement;
    setTimeout(() => (card.querySelector('[data-autofocus]') || close).focus({ preventScroll: true }), 30);
    return card;
  }

  closeModal(silent = false) {
    if (!this.modalOpen) return;
    this.modalOpen.remove();
    this.modalOpen = null;
    document.body.classList.remove('modal-open');
    const cb = this.onModalClose;
    this.onModalClose = null;
    if (!silent) cb?.();
    this.lastFocus?.focus?.({ preventScroll: true });
  }

  openHelp() {
    const c = el('div');
    const grid = el('div', { class: 'help-grid' });
    const items = [
      ['drag', 'اسحب بالفأرة', 'لتدوير زاوية الرؤية'],
      ['wheel', 'عجلة الفأرة', 'للتقريب والإبعاد'],
      ['click', 'انقر بالزر الأيسر', 'على الأزرار والبطاقات'],
      ['answer', 'اختر الإجابة', 'انقر على البطاقة'],
      ['keys', 'الأسهم أو WASD', 'لتحريك الرؤية قليلًا'],
      ['reset', 'ضبط الرؤية', 'زر «ضبط الرؤية» أو حرف R'],
    ];
    for (const [art, t, sub] of items) {
      grid.append(el('div', { class: 'help-item' }, `${HELP_ART[art]}<span>${t}</span><small>${sub}</small>`));
    }
    c.append(grid);
    c.append(
      el(
        'ol',
        { class: 'help-steps' },
        '<li>استمع إلى المستكشف علي واقرأ كلامه.</li><li>اضغط الزر البرتقالي «شاهد…» لتشغيل الظاهرة.</li><li>اقرأ المعلومة على اللوحة، ويمكنك إعادة المشاهدة.</li><li>انتقل إلى المحطة التالية حتى تكمل المحطات الخمس.</li><li>ادخل قاعة التحدي وأجب عن خمسة أسئلة.</li>'
      )
    );
    const actions = el('div', { class: 'modal-actions' });
    actions.append(el('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': true, onclick: () => this.closeModal() }, 'فهمت!'));
    c.append(actions);
    this.openModal(c, { title: 'طريقة اللعب' });
  }

  /** نافذة الخريطة: صورة علوية حقيقية للجزيرة مع علامات المحطات. */
  openMap({ imageUrl, markers, onPick }) {
    const c = el('div');
    const wrap = el('div', { class: 'map-wrap' });
    if (imageUrl) wrap.append(el('img', { src: imageUrl, alt: 'خريطة جزيرة المغامرة' }));
    for (const m of markers) {
      const icon = m.state === 'done' ? ICONS.check : m.state === 'locked' ? ICONS.lock : m.num ?? ICONS[m.icon];
      const b = el(
        'button',
        {
          class: `map-marker ${m.state}`,
          type: 'button',
          style: `left:${m.x * 100}%;top:${m.y * 100}%`,
          'data-key': m.key,
          'aria-label': m.state === 'locked' ? `${m.label} (مقفلة)` : m.label,
          onclick: () => onPick(m),
        },
        `<span class="pin">${icon}</span><span class="label">${m.label}</span>`
      );
      wrap.append(b);
    }
    c.append(wrap);
    c.append(el('p', { class: 'note' }, 'انقر على محطة مفتوحة للانتقال إليها. المحطات تُفتح بالترتيب.'));
    this.openModal(c, { title: 'خريطة الجزيرة' });
  }

  openVRInfo({ supported, onEnter }) {
    const c = el('div');
    c.append(
      el(
        'div',
        { class: 'help-steps', style: 'background:#fff;line-height:1.9;list-style:none' },
        supported
          ? '<b>جهازك يدعم الواقع الافتراضي.</b><br>قبل البدء: اجلس أو قف في مكان خالٍ من العوائق، وبإشراف شخص بالغ، ولا تتجاوز الجلسة 10–15 دقيقة.<br>التزم بالعمر الأدنى الذي تحدده الشركة المصنعة لنظارتك (مثلًا Meta Quest: 10 سنوات فأكثر بحساب يديره ولي الأمر).<br>استخدم زر وحدة التحكم (الزناد) للنقر على الأزرار والبطاقات.'
          : '<b>لم يتم العثور على نظارة VR متصلة بهذا المتصفح.</b><br>يمكنك إكمال المغامرة كاملة على الحاسوب بالفأرة.<br>لاستخدام VR: افتح الموقع من متصفح النظارة (مثل متصفح Meta Quest)، أو من Chrome/Edge على حاسوب متصل بنظارة تدعم WebXR.<br>ملاحظة: يُنصح الأطفال دون العمر الذي تحدده الشركة المصنعة بعدم استخدام النظارة.'
      )
    );
    const actions = el('div', { class: 'modal-actions' });
    if (supported) {
      actions.append(
        el('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': true, onclick: () => { this.closeModal(true); onEnter(); } }, `${ICONS.vr}<span>دخول وضع VR</span>`)
      );
    }
    actions.append(el('button', { class: 'btn', type: 'button', onclick: () => this.closeModal() }, 'متابعة على الحاسوب'));
    c.append(actions);
    this.openModal(c, { title: 'وضع الواقع الافتراضي (VR)' });
  }

  openCertificate({ canvas, render, onDownload, onPrint }) {
    const c = el('div');
    const img = el('img', { class: 'cert-preview', alt: STRINGS.certificateTitle, src: canvas.toDataURL('image/png') });
    c.append(img);
    const field = el('label', { class: 'field' }, '<span>اكتب اسمك على الشهادة (اختياري)</span>');
    const input = el('input', { type: 'text', maxlength: '30', placeholder: STRINGS.certificateDefaultName, autocomplete: 'off', 'data-autofocus': true, dir: 'rtl' });
    input.addEventListener('input', () => {
      img.src = render(input.value).toDataURL('image/png');
    });
    field.append(input, el('small', {}, 'الاسم لا يُحفظ في أي مكان، ويظهر فقط على صورة الشهادة.'));
    c.append(field);
    const actions = el('div', { class: 'modal-actions' });
    actions.append(
      el('button', { class: 'btn btn-primary', type: 'button', id: 'cert-download', onclick: () => onDownload(input.value) }, `${ICONS.download}<span>تنزيل الشهادة (PNG)</span>`),
      el('button', { class: 'btn', type: 'button', onclick: () => onPrint(input.value) }, `${ICONS.print}<span>طباعة</span>`)
    );
    c.append(actions);
    this.openModal(c, { title: STRINGS.certificateTitle });
  }
}

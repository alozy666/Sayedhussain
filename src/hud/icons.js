// أيقونات SVG مضمّنة (لا تعتمد على ملفات خارجية).
const s = (body, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  soundOn: s('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  soundOff: s('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  help: s('<circle cx="12" cy="12" r="9.5"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'),
  map: s('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  target: s('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  replay: s('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  next: s('<path d="M20 12H5M11 5l-7 7 7 7"/>'),
  home: s('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  teacher: s('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4"/>'),
  vr: s('<path d="M3 8h18v8h-5l-2-3h-4l-2 3H3z"/><circle cx="7.5" cy="12" r="1.2" fill="currentColor"/><circle cx="16.5" cy="12" r="1.2" fill="currentColor"/>'),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  lock: s('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  star: s('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>'),
  trophy: s('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>'),
  download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  print: s('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  play: s('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  listen: s('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6"/>'),
  gate: s('<path d="M4 21V9a8 8 0 0 1 16 0v12"/><path d="M4 21h16"/>'),
  quake: s('<path d="M3 17h5l2-4 2 6 2-9 2 7h5"/>'),
  volcano: s('<path d="M3 20l6-10h6l6 10z"/><path d="M10 10l1-3M13 10l1-4M12 4c0-1 1-2 2-2"/>'),
  weathering: s('<path d="M5 18l3-8 6-2 4 5-2 5z"/><circle cx="19" cy="20" r="1" fill="currentColor"/><circle cx="21" cy="17" r="0.8" fill="currentColor"/>'),
  erosion: s('<path d="M3 8c3 0 3 3 6 3s3-3 6-3 3 3 6 3"/><path d="M3 14c3 0 3 3 6 3s3-3 6-3 3 3 6 3"/><path d="M17 4l3 2-3 2"/>'),
  human: s('<path d="M3 18h13l3-4h2"/><circle cx="6" cy="19" r="1.5"/><circle cx="13" cy="19" r="1.5"/><path d="M8 18V12h5l3 6M13 12l4-6 3 2"/>'),
  challenge: s('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M12 13v4M8 21h8M9 17h6"/>'),
};

/** رسومات تعليمات التحكم (فأرة، عجلة، لوحة مفاتيح...). */
export const HELP_ART = {
  drag: `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="32" y="22" width="36" height="56" rx="18" fill="#fff" stroke="#1f3b63" stroke-width="4"/><path d="M50 22v20M32 42h36" stroke="#1f3b63" stroke-width="4"/><path d="M33 40V34a17 17 0 0 1 17-12v20z" fill="#ffad5c"/><path d="M12 60c-6-14 0-28 12-34M88 60c6-14 0-28-12-34" stroke="#5fb4e6" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M20 22l5 4-6 3M80 22l-5 4 6 3" stroke="#5fb4e6" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,
  wheel: `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="32" y="22" width="36" height="56" rx="18" fill="#fff" stroke="#1f3b63" stroke-width="4"/><path d="M50 22v20M32 42h36" stroke="#1f3b63" stroke-width="4"/><rect x="45" y="27" width="10" height="13" rx="5" fill="#ffad5c"/><path d="M80 30v40M74 36l6-6 6 6M74 64l6 6 6-6" stroke="#5fb4e6" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`,
  click: `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="14" y="30" width="46" height="20" rx="10" fill="#ffad5c"/><text x="37" y="45" font-size="11" text-anchor="middle" fill="#fff" font-weight="800">زر</text><path d="M58 52l14 34 6-13 13 12 5-5-12-13 13-5z" fill="#fff" stroke="#1f3b63" stroke-width="4" stroke-linejoin="round"/></svg>`,
  keys: `<svg viewBox="0 0 100 100" aria-hidden="true"><g font-weight="800" font-size="15" text-anchor="middle" fill="#1f3b63"><rect x="38" y="20" width="24" height="24" rx="6" fill="#fff" stroke="#1f3b63" stroke-width="3"/><text x="50" y="37">W</text><rect x="10" y="50" width="24" height="24" rx="6" fill="#fff" stroke="#1f3b63" stroke-width="3"/><text x="22" y="67">A</text><rect x="38" y="50" width="24" height="24" rx="6" fill="#fff" stroke="#1f3b63" stroke-width="3"/><text x="50" y="67">S</text><rect x="66" y="50" width="24" height="24" rx="6" fill="#fff" stroke="#1f3b63" stroke-width="3"/><text x="78" y="67">D</text></g><text x="50" y="94" font-size="11" text-anchor="middle" fill="#3a5a86" font-weight="700">اختياري</text></svg>`,
  reset: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" fill="#fff" stroke="#1f3b63" stroke-width="4"/><circle cx="50" cy="50" r="10" fill="#ffad5c"/><path d="M50 8v16M50 76v16M8 50h16M76 50h16" stroke="#5fb4e6" stroke-width="5" stroke-linecap="round"/></svg>`,
  answer: `<svg viewBox="0 0 100 100" aria-hidden="true"><g font-weight="800" font-size="20" text-anchor="middle"><rect x="6" y="30" width="26" height="34" rx="7" fill="#fff" stroke="#1f3b63" stroke-width="3"/><text x="19" y="54" fill="#1f3b63">ج</text><rect x="37" y="30" width="26" height="34" rx="7" fill="#c7f0d8" stroke="#3db878" stroke-width="4"/><text x="50" y="54" fill="#1f3b63">ب</text><rect x="68" y="30" width="26" height="34" rx="7" fill="#fff" stroke="#1f3b63" stroke-width="3"/><text x="81" y="54" fill="#1f3b63">أ</text></g><text x="50" y="84" font-size="11" text-anchor="middle" fill="#3a5a86" font-weight="700">أو مفاتيح الأرقام</text><text x="50" y="97" font-size="11" text-anchor="middle" fill="#3a5a86" font-weight="800" direction="ltr" unicode-bidi="isolate">1 · 2 · 3</text></svg>`,
};

// سجل نتائج المحاولات للمعلم — محفوظ محليًا في المتصفح (localStorage) دون أي بيانات شخصية.

import { readJSON, writeJSON, removeKey } from './storage.js';
import { CHALLENGE, CONCEPTS } from '../content/challenge.js';

const KEY = 'ali-explorer-teacher-v1';

export function loadAttempts() {
  const data = readJSON('local', KEY, null);
  return Array.isArray(data?.attempts) ? data.attempts : [];
}

export function saveAttempt(attempt) {
  const attempts = loadAttempts();
  const idx = attempts.findIndex((a) => a.id === attempt.id);
  if (idx >= 0) attempts[idx] = attempt;
  else attempts.push(attempt);
  writeJSON('local', KEY, { attempts });
  return attempts;
}

export function clearAttempts() {
  removeKey('local', KEY);
}

/** يبني سجل محاولة كاملًا من حالة الاختبار. */
export function buildAttemptRecord({ id, startedAt, finishedAt, quizState, score, practiceTries }) {
  return {
    id,
    startedAt,
    finishedAt,
    score: score.correct,
    total: score.total,
    correct: score.correct,
    wrong: score.total - score.correct,
    percent: score.percent,
    passed: score.passed,
    answers: quizState.answers.map((a, i) => {
      const q = CHALLENGE[i];
      return {
        q: q.id,
        concept: q.concept,
        chosen: a ? a.choice : null,
        chosenConcept: a ? q.options[a.choice].concept : null,
        correct: a ? a.correct : false,
      };
    }),
    practiceTries: { ...practiceTries },
  };
}

/** عدد مرات الخطأ في كل مفهوم عبر جميع المحاولات. */
export function conceptErrorCounts(attempts) {
  const counts = Object.fromEntries(Object.keys(CONCEPTS).map((k) => [k, 0]));
  for (const a of attempts) {
    for (const ans of a.answers) if (!ans.correct) counts[ans.concept] = (counts[ans.concept] ?? 0) + 1;
  }
  return counts;
}

export function confusionText(ans) {
  if (ans.correct) return '';
  const target = CONCEPTS[ans.concept] ?? ans.concept;
  if (!ans.chosenConcept) return `لم يُجب عن سؤال «${target}»`;
  const chosen = CONCEPTS[ans.chosenConcept] ?? ans.chosenConcept;
  return `اختار «${chosen}» بدل «${target}»`;
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatDate(iso) {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString('ar-BH-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      time: d.toLocaleTimeString('ar-BH-u-nu-latn', { hour: '2-digit', minute: '2-digit' }),
    };
  } catch {
    return { date: iso, time: '' };
  }
}

/** ملف CSV بترميز UTF-8 مع BOM ليُفتح بالعربية في Excel. */
export function attemptsToCSV(attempts) {
  const header = [
    'رقم المحاولة',
    'التاريخ',
    'الوقت',
    'الدرجة',
    'من',
    'النسبة المئوية',
    'تحقق الهدف',
    'الإجابات الصحيحة',
    'الإجابات الخاطئة',
    ...CHALLENGE.map((q, i) => `س${i + 1} (${CONCEPTS[q.concept]})`),
    'المفاهيم التي أخطأ فيها',
    'محاولات تدريب التجوية',
    'محاولات تدريب التعرية',
  ];
  const rows = attempts.map((a, i) => {
    const { date, time } = formatDate(a.finishedAt || a.startedAt);
    return [
      i + 1,
      date,
      time,
      a.score,
      a.total,
      `${a.percent}%`,
      a.passed ? 'نعم' : 'لا',
      a.correct,
      a.wrong,
      ...a.answers.map((x) => (x.correct ? 'صحيحة' : 'خاطئة')),
      a.answers.filter((x) => !x.correct).map(confusionText).join(' | '),
      a.practiceTries?.weathering ?? '',
      a.practiceTries?.erosion ?? '',
    ];
  });
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n');
}

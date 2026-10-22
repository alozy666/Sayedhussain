import { describe, it, expect } from 'vitest';
import { CHALLENGE, CONCEPTS } from '../src/content/challenge.js';
import { PRACTICE } from '../src/content/practice.js';
import { STATIONS } from '../src/content/stations.js';
import {
  createQuizState,
  submitAnswer,
  computeScore,
  missedConcepts,
  answeredCount,
} from '../src/app/quiz.js';
import { buildAttemptRecord, attemptsToCSV, conceptErrorCounts, confusionText } from '../src/app/teacherStore.js';

/** يجيب عن الأسئلة بحيث يكون عدد الصحيح = n (الأسئلة الأولى صحيحة). */
function play(nCorrect) {
  const s = createQuizState(CHALLENGE);
  CHALLENGE.forEach((q, i) => {
    const choice = i < nCorrect ? q.correct : (q.correct + 1) % q.options.length;
    submitAnswer(s, CHALLENGE, i, choice);
  });
  return s;
}

describe('محتوى الأسئلة', () => {
  it('خمسة أسئلة بثلاثة خيارات لكل منها', () => {
    expect(CHALLENGE).toHaveLength(5);
    for (const q of CHALLENGE) expect(q.options).toHaveLength(3);
  });

  it('الإجابات الصحيحة مطابقة للمطلوب (ب، ج، أ، ب، ج)', () => {
    expect(CHALLENGE.map((q) => q.correct)).toEqual([1, 2, 0, 1, 2]);
  });

  it('مفهوم الخيار الصحيح يطابق مفهوم السؤال', () => {
    for (const q of CHALLENGE) expect(q.options[q.correct].concept).toBe(q.concept);
  });

  it('الأسئلة تغطي المظاهر الخمسة فقط', () => {
    expect(new Set(CHALLENGE.map((q) => q.concept))).toEqual(new Set(Object.keys(CONCEPTS)));
    expect(STATIONS.map((s) => s.id)).toEqual(['earthquake', 'volcano', 'weathering', 'erosion', 'human']);
  });

  it('التدريبان: أ للتجوية، ب للتعرية', () => {
    expect(PRACTICE.weathering.correct).toBe(0);
    expect(PRACTICE.erosion.correct).toBe(1);
  });
});

describe('حساب الدرجة والنسبة وتحقق الهدف', () => {
  const cases = [
    [5, 100, true],
    [4, 80, true],
    [3, 60, false],
    [2, 40, false],
    [1, 20, false],
    [0, 0, false],
  ];
  for (const [n, pct, pass] of cases) {
    it(`${n}/5 = ${pct}% ${pass ? 'يتحقق الهدف' : 'لا يتحقق الهدف'}`, () => {
      const score = computeScore(play(n));
      expect(score.correct).toBe(n);
      expect(score.wrong).toBe(5 - n);
      expect(score.total).toBe(5);
      expect(score.percent).toBe(pct);
      expect(score.passed).toBe(pass);
      expect(score.stars).toBe(n);
    });
  }

  it('لا يتحقق الهدف قبل الإجابة عن أي سؤال', () => {
    const s = createQuizState(CHALLENGE);
    expect(computeScore(s)).toMatchObject({ correct: 0, percent: 0, passed: false, answered: 0 });
  });
});

describe('الإجابة الأولى فقط', () => {
  it('تتجاهل أي إجابة ثانية للسؤال نفسه بعد إظهار التصحيح', () => {
    const s = createQuizState(CHALLENGE);
    const first = submitAnswer(s, CHALLENGE, 0, 0); // خطأ
    expect(first).toMatchObject({ accepted: true, correct: false, correctIndex: 1 });
    const second = submitAnswer(s, CHALLENGE, 0, 1); // محاولة تصحيح
    expect(second.accepted).toBe(false);
    expect(computeScore(s).correct).toBe(0);
    expect(answeredCount(s)).toBe(1);
  });

  it('إعادة التحدي تبدأ من الصفر', () => {
    const old = play(5);
    expect(computeScore(old).correct).toBe(5);
    const fresh = createQuizState(CHALLENGE);
    expect(computeScore(fresh).correct).toBe(0);
    expect(answeredCount(fresh)).toBe(0);
  });

  it('ترفض الخيارات غير الصالحة', () => {
    const s = createQuizState(CHALLENGE);
    expect(() => submitAnswer(s, CHALLENGE, 0, 3)).toThrow();
    expect(() => submitAnswer(s, CHALLENGE, 9, 0)).toThrow();
  });
});

describe('المفاهيم الخاطئة ولوحة المعلم', () => {
  it('يحدد المفهوم الذي أخطأ فيه والمفهوم الذي اختاره بدلًا منه', () => {
    const s = createQuizState(CHALLENGE);
    submitAnswer(s, CHALLENGE, 3, 0); // التعرية ← اختار التجوية
    const missed = missedConcepts(s, CHALLENGE);
    expect(missed).toEqual([{ questionId: 'q4', concept: 'erosion', chosenConcept: 'weathering' }]);
  });

  it('ينشئ سجل محاولة وملف CSV صحيحًا', () => {
    const s = play(3);
    const score = computeScore(s);
    const rec = buildAttemptRecord({
      id: 'a1',
      startedAt: '2026-01-01T08:00:00.000Z',
      finishedAt: '2026-01-01T08:10:00.000Z',
      quizState: s,
      score,
      practiceTries: { weathering: 1, erosion: 2 },
    });
    expect(rec).toMatchObject({ score: 3, total: 5, percent: 60, passed: false, correct: 3, wrong: 2 });
    expect(confusionText(rec.answers[3])).toContain('التعرية');
    const counts = conceptErrorCounts([rec]);
    expect(counts).toMatchObject({ earthquake: 0, volcano: 0, weathering: 0, erosion: 1, human: 1 });
    const csv = attemptsToCSV([rec]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('60%');
    expect(lines[1]).toContain('لا');
  });
});

// منطق التقويم النقي (بلا رسومات) — مختبَر في tests/quiz.test.js
// قواعد التصحيح:
//   • نقطة واحدة لكل إجابة صحيحة، والدرجة النهائية = عدد الأسئلة (5).
//   • تُحتسب الإجابة الأولى المؤكدة فقط؛ أي محاولة لاحقة للسؤال نفسه تُتجاهل.
//   • يتحقق الهدف عند نسبة 80% فأكثر فقط.

import { PASS_RATIO } from '../content/challenge.js';

export function createQuizState(questions) {
  return { answers: questions.map(() => null) };
}

/**
 * يسجل إجابة الطالب إن لم يكن السؤال قد أُجيب عنه من قبل.
 * @returns {{accepted:boolean, correct:boolean, correctIndex:number}}
 */
export function submitAnswer(state, questions, qIndex, choiceIndex) {
  const q = questions[qIndex];
  if (!q) throw new Error(`سؤال غير موجود: ${qIndex}`);
  const existing = state.answers[qIndex];
  if (existing) {
    return { accepted: false, correct: existing.correct, correctIndex: q.correct };
  }
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= q.options.length) {
    throw new Error(`خيار غير صالح: ${choiceIndex}`);
  }
  const correct = choiceIndex === q.correct;
  state.answers[qIndex] = { choice: choiceIndex, correct };
  return { accepted: true, correct, correctIndex: q.correct };
}

export function isAnswered(state, qIndex) {
  return state.answers[qIndex] != null;
}

export function answeredCount(state) {
  return state.answers.filter(Boolean).length;
}

export function computeScore(state, passRatio = PASS_RATIO) {
  const total = state.answers.length;
  const correct = state.answers.filter((a) => a && a.correct).length;
  const answered = answeredCount(state);
  const wrong = answered - correct;
  const percent = total ? Math.round((correct * 100) / total) : 0;
  // مقارنة بالأعداد الصحيحة لتجنب أخطاء الفاصلة العائمة
  const passed = total > 0 && correct * 100 >= Math.round(passRatio * 100) * total;
  return { correct, wrong, answered, total, percent, passed, stars: correct };
}

/** المفاهيم التي أخطأ الطالب في تمييزها، مع المفهوم الذي اختاره بدلًا منها. */
export function missedConcepts(state, questions) {
  const out = [];
  state.answers.forEach((a, i) => {
    if (a && !a.correct) {
      const q = questions[i];
      out.push({
        questionId: q.id,
        concept: q.concept,
        chosenConcept: q.options[a.choice]?.concept ?? null,
      });
    }
  });
  return out;
}

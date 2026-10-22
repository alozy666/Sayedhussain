import { ICONS } from './icons.js';
import { CONCEPTS, CHALLENGE } from '../content/challenge.js';
import { loadAttempts, clearAttempts, attemptsToCSV, conceptErrorCounts, confusionText, formatDate } from '../app/teacherStore.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** لوحة المعلم: نتيجة آخر محاولة، السجل، المفاهيم الخاطئة، الطباعة وCSV. */
export function openTeacherPanel(hud) {
  const render = () => {
    const attempts = loadAttempts();
    const c = document.createElement('div');
    if (!attempts.length) {
      c.innerHTML = `<div class="empty">لا توجد محاولات مسجلة بعد على هذا الجهاز.<br>ستظهر النتائج هنا تلقائيًا بعد أن يُنهي الطالب قاعة التحدي.</div>
        <p class="note">تُحفظ البيانات محليًا في هذا المتصفح فقط، دون أسماء أو بيانات شخصية.</p>`;
      return c;
    }
    const last = attempts[attempts.length - 1];
    const { date, time } = formatDate(last.finishedAt || last.startedAt);
    const missed = last.answers.filter((a) => !a.correct);
    const counts = conceptErrorCounts(attempts);
    const passedCount = attempts.filter((a) => a.passed).length;
    c.innerHTML = `
      <div class="teacher-section"><h3>آخر محاولة — ${esc(date)} ${esc(time)}</h3></div>
      <div class="stats">
        <div class="stat ${last.passed ? 'ok' : 'no'}"><b>${last.score}/${last.total}</b><span>الدرجة</span></div>
        <div class="stat ${last.passed ? 'ok' : 'no'}"><b>${last.percent}%</b><span>النسبة المئوية</span></div>
        <div class="stat ok"><b>${last.correct}</b><span>إجابات صحيحة</span></div>
        <div class="stat no"><b>${last.wrong}</b><span>إجابات خاطئة</span></div>
        <div class="stat ${last.passed ? 'ok' : 'no'}"><b>${last.passed ? 'تحقق' : 'لم يتحقق'}</b><span>الهدف (80% فأكثر)</span></div>
      </div>
      <div class="teacher-section">
        <h3>تفاصيل الإجابات</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>السؤال</th><th>المفهوم</th><th>النتيجة</th><th>ملاحظة</th></tr></thead>
          <tbody>${last.answers
            .map(
              (a, i) => `<tr><td>${i + 1}. ${esc(CHALLENGE[i]?.prompt ?? a.q)}</td><td>${esc(CONCEPTS[a.concept])}</td>
              <td>${a.correct ? '<span class="tag ok">صحيحة</span>' : '<span class="tag no">خاطئة</span>'}</td>
              <td>${esc(confusionText(a))}</td></tr>`
            )
            .join('')}</tbody>
        </table></div>
        <p class="note">${missed.length ? `المفاهيم التي أخطأ الطالب في تمييزها: <b>${missed.map((a) => esc(CONCEPTS[a.concept])).join('، ')}</b>` : 'أجاب الطالب عن جميع الأسئلة إجابة صحيحة.'}
        — محاولات التدريب: التجوية ${last.practiceTries?.weathering ?? '-'}، التعرية ${last.practiceTries?.erosion ?? '-'}</p>
      </div>
      <div class="teacher-section">
        <h3>جميع المحاولات على هذا الجهاز (${attempts.length}) — حققت الهدف: ${passedCount}</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>التاريخ</th><th>الوقت</th><th>الدرجة</th><th>النسبة</th><th>الهدف</th><th>المفاهيم الخاطئة</th></tr></thead>
          <tbody>${attempts
            .map((a, i) => {
              const d = formatDate(a.finishedAt || a.startedAt);
              const wrong = a.answers.filter((x) => !x.correct).map((x) => CONCEPTS[x.concept]);
              return `<tr><td>${i + 1}</td><td>${esc(d.date)}</td><td>${esc(d.time)}</td><td>${a.score}/${a.total}</td><td>${a.percent}%</td>
                <td>${a.passed ? '<span class="tag ok">تحقق</span>' : '<span class="tag no">لم يتحقق</span>'}</td><td>${esc(wrong.join('، ') || '—')}</td></tr>`;
            })
            .reverse()
            .join('')}</tbody>
        </table></div>
      </div>
      <div class="teacher-section">
        <h3>عدد مرات الخطأ في كل مفهوم (كل المحاولات)</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr>${Object.values(CONCEPTS).map((n) => `<th>${esc(n)}</th>`).join('')}</tr></thead>
          <tbody><tr>${Object.keys(CONCEPTS).map((k) => `<td>${counts[k]}</td>`).join('')}</tr></tbody>
        </table></div>
      </div>
      <p class="note">تُحفظ البيانات محليًا في هذا المتصفح فقط، دون أسماء أو بيانات شخصية للطلاب.</p>`;
    const actions = document.createElement('div');
    actions.className = 'modal-actions no-print';
    const mk = (html, cls, fn, id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.innerHTML = html;
      if (id) b.id = id;
      b.addEventListener('click', fn);
      return b;
    };
    actions.append(
      mk(`${ICONS.print}<span>طباعة النتيجة</span>`, 'btn-primary', () => window.print(), 'teacher-print'),
      mk(
        `${ICONS.download}<span>تنزيل CSV</span>`,
        'btn-mint',
        () => downloadText(attemptsToCSV(loadAttempts()), 'ali-explorer-results.csv', 'text/csv;charset=utf-8'),
        'teacher-csv'
      ),
      mk(
        `${ICONS.trash}<span>مسح السجل</span>`,
        '',
        () => {
          if (window.confirm('هل تريد مسح جميع النتائج المحفوظة على هذا الجهاز؟')) {
            clearAttempts();
            hud.closeModal(true);
            openTeacherPanel(hud);
          }
        },
        'teacher-clear'
      )
    );
    c.append(actions);
    return c;
  };
  hud.openModal(render(), { title: 'لوحة المعلم', className: 'teacher-card' });
}

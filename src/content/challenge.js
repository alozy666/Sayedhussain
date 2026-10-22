// =====================================================================
//  أسئلة التقويم النهائي (5 أسئلة × 3 خيارات) — قاعة التحدي
//  correct: رقم الخيار الصحيح بدءًا من 0 (0 = أ ، 1 = ب ، 2 = ج)
//  concept: المفهوم الذي يقيسه السؤال / يمثله الخيار (يُستخدم في لوحة المعلم)
//  image: الصورة المصغرة للخيار، أو للسؤال نفسه (questionImage)
// =====================================================================

export const CONCEPTS = {
  earthquake: 'الزلزال',
  volcano: 'البركان',
  weathering: 'التجوية',
  erosion: 'التعرية',
  human: 'تغييرات الإنسان لسطح الأرض',
};

export const PASS_RATIO = 0.8; // معيار النجاح 80% (4 من 5)

export const CHALLENGE = [
  {
    id: 'q1',
    prompt: 'أي صورة تُظهر زلزالًا؟',
    concept: 'earthquake',
    options: [
      { text: 'بركان تتدفق منه الحمم', image: 'volcano', concept: 'volcano' },
      { text: 'طريق متشقق بسبب زلزال', image: 'earthquake', concept: 'earthquake' },
      { text: 'صخرة تتفتت إلى أجزاء صغيرة', image: 'weathering', concept: 'weathering' },
    ],
    correct: 1,
  },
  {
    id: 'q2',
    prompt: 'ما اسم هذا المظهر؟',
    concept: 'volcano',
    questionImage: 'volcano',
    options: [
      { text: 'التعرية', image: null, concept: 'erosion' },
      { text: 'التجوية', image: null, concept: 'weathering' },
      { text: 'البركان', image: null, concept: 'volcano' },
    ],
    correct: 2,
  },
  {
    id: 'q3',
    prompt: 'أي صورة تُمثّل التجوية؟',
    concept: 'weathering',
    options: [
      { text: 'صخرة تتفتت وتبقى أجزاؤها قربها', image: 'weathering', concept: 'weathering' },
      { text: 'ماء ينقل التربة وفتات الصخور', image: 'erosion', concept: 'erosion' },
      { text: 'حفارة تغيّر شكل الأرض', image: 'human', concept: 'human' },
    ],
    correct: 0,
  },
  {
    id: 'q4',
    prompt: 'أي مشهد يُمثّل التعرية؟',
    concept: 'erosion',
    options: [
      { text: 'صخرة تتفتت في مكانها', image: 'weathering', concept: 'weathering' },
      { text: 'ماء جارٍ ينقل التربة وفتات الصخور', image: 'erosion', concept: 'erosion' },
      { text: 'بركان تتدفق منه الحمم', image: 'volcano', concept: 'volcano' },
    ],
    correct: 1,
  },
  {
    id: 'q5',
    prompt: 'أي صورة تُمثّل تغييرات الإنسان لسطح الأرض؟',
    concept: 'human',
    options: [
      { text: 'ثوران بركان', image: 'volcano', concept: 'volcano' },
      { text: 'تشقق الأرض بسبب زلزال', image: 'earthquake', concept: 'earthquake' },
      { text: 'حفارة تمهّد الأرض لإنشاء طريق', image: 'human', concept: 'human' },
    ],
    correct: 2,
  },
];

export const OPTION_LETTERS = ['أ', 'ب', 'ج'];

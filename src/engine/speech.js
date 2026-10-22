// شرح علي الصوتي عبر قراءة النص آليًا (Web Speech API) إذا توفر صوت عربي على الجهاز.

const PREFERRED = ['ar-BH', 'ar-SA', 'ar-AE', 'ar-KW', 'ar-QA', 'ar-OM', 'ar-JO', 'ar-EG'];

export class Speech {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    this.voice = null;
    this.available = false;
    this.enabled = true;
    this.listeners = new Set();
    if (this.supported) {
      this.pickVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoice());
      // بعض المتصفحات تحمّل الأصوات متأخرًا
      setTimeout(() => this.pickVoice(), 1500);
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  pickVoice() {
    try {
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('ar'));
      let best = null;
      let bestScore = -1;
      for (const v of voices) {
        const idx = PREFERRED.findIndex((p) => v.lang.toLowerCase() === p.toLowerCase());
        let score = idx >= 0 ? 20 - idx : 5;
        if (/natural|online|neural/i.test(v.name)) score += 10;
        if (score > bestScore) {
          best = v;
          bestScore = score;
        }
      }
      const was = this.available;
      this.voice = best;
      this.available = !!best;
      if (was !== this.available) for (const fn of this.listeners) fn(this.available);
    } catch {
      this.available = false;
    }
  }

  speak(text, force = false) {
    if (!this.supported || !this.available) return false;
    if (!this.enabled && !force) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/\n+/g, ' '));
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = 0.92;
      u.pitch = 1.15;
      window.speechSynthesis.speak(u);
      return true;
    } catch {
      return false;
    }
  }

  cancel() {
    try {
      if (this.supported) window.speechSynthesis.cancel();
    } catch {
      /* تجاهل */
    }
  }
}

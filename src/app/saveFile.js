// حفظ ملف على جهاز المستخدم (الشهادة PNG وملف النتائج CSV).
// داخل عارض claude.ai يمر الحفظ عبر قدرة «downloads» التي تطلب موافقة المستخدم،
// وفي أي مكان آخر (الاستضافة العادية أو الملف المحلي) نستخدم رابط تنزيل عاديًا.

/** @returns {Promise<'saved'|'declined'|'failed'>} */
export async function saveFile(filename, blob) {
  if (typeof window.claude?.use === 'function') {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) {
        await downloads.save({ filename, data: blob });
        return 'saved';
      }
    } catch (e) {
      return e?.code === 'declined' ? 'declined' : 'failed';
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

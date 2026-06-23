# استوديو القصة الذكي — مستودع GitHub (فصل كامل)

الموقع على Perchance بقى **نحيف (~46KB)**، وكل الكود والتصميم والبيانات على GitHub وتُحمّل عبر jsDelivr.

## الملفات
| الملف | الدور | المكان |
|-------|------|--------|
| `يمين.txt` | الموقع النحيف (HTML + روابط لـ CSS/JS) | يُلصق في Perchance (لوحة اليمين) |
| `شمال.txt` | إعدادات الـ plugins (text-to-image / ai-text) | يُلصق في Perchance (لوحة الشمال) |
| `app.js` | كل كود التطبيق (~180KB) | يُرفع للمستودع → jsDelivr |
| `style.css` | كل التصميم (~20KB) | يُرفع للمستودع → jsDelivr |
| `prompts.json` | البرومبتات الأربعة | يُرفع للمستودع → jsDelivr |
| `config.json` | الاستايلات + التسميات | يُرفع للمستودع → jsDelivr |

> 🔒 **مفاتيح Gemini لا تُرفع هنا إطلاقًا** — تبقى في متصفح المستخدم (localStorage) فقط.

## خطوات التشغيل
1. ارفع **`app.js` + `style.css` + `prompts.json` + `config.json`** إلى مستودع `Metaplus8` (فرع `main`).
2. الصق `يمين.txt` و `شمال.txt` في Perchance.
3. افتح المولّد — يحمّل CSS/JS/البيانات من GitHub تلقائيًا.

## روابط jsDelivr المستخدمة
```
https://cdn.jsdelivr.net/gh/cazanova971/Metaplus8@main/style.css
https://cdn.jsdelivr.net/gh/cazanova971/Metaplus8@main/app.js
https://cdn.jsdelivr.net/gh/cazanova971/Metaplus8@main/prompts.json
https://cdn.jsdelivr.net/gh/cazanova971/Metaplus8@main/config.json
```

## التعديل لاحقًا (بدون لمس Perchance)
عدّل أي ملف على GitHub → ادفع (push) → **فرّغ كاش jsDelivr** → أعد فتح الموقع:
```
https://purge.jsdelivr.net/gh/cazanova971/Metaplus8@main/app.js
https://purge.jsdelivr.net/gh/cazanova971/Metaplus8@main/style.css
https://purge.jsdelivr.net/gh/cazanova971/Metaplus8@main/prompts.json
https://purge.jsdelivr.net/gh/cazanova971/Metaplus8@main/config.json
```

## ⚠️ ملاحظات
- **تبعية صلبة:** لو GitHub/jsDelivr غير متاح، الموقع لن يعمل (لا يوجد fallback للكود/التصميم).
- اختُبر محليًا: التصميم والكود يعملان بشكل مطابق للنسخة المدمجة، صفر أخطاء.
- **يحتاج تأكيد حيّ:** توليد الصور (t2i) من app.js الخارجي — جرّبه على Perchance للتأكد أن بلجن t2i متاح للسكربت الخارجي.

## ملف الاختبار
`csp-test.html` — سنيبت تأكّد أن jsDelivr مسموح على Perchance (نجح: script + link + fetch ✅).

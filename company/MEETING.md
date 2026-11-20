# الاجتماع الأسبوعي

الجلسة الرئيسية تدير الاجتماع وتنادي الموظفين (الموظف ما يقدر ينادي موظف ثاني، فالجلسة الرئيسية تنادي الكل).
الهيكل الكامل وأرقام الموظفين في `company/ORG.md` و`company/org.json`.

## ① التحضير

```bash
cd /home/user/QD 2>/dev/null || cd QD
git checkout claude/multi-agent-company-9dst9p && git pull --ff-only
npm ci --no-audit --no-fund && npm test 2>&1 | tail -4
git log --since="7 days ago" --oneline
date +%V   # رقم الأسبوع W
```

## ② دورة العمل (مسارين كل أسبوع)

### المسار أ: خلايا الفئات
57 فئة، لكل فئة خلية من 5 موظفين، مقسمة على 9 مجموعات (الحقل `group` في `org.json`).
مجموعة هالأسبوع = `(W mod 9) + 1`، يعني كل فئة تشتغل مرة كل 9 أسابيع.

خلايا المجموعة تشتغل **مع بعض**، بس داخل الخلية الخطوات **بالترتيب**. اسم المجلد: `company/work/categories/<cat-XX>/<تاريخ اليوم>/`.

1. نادِ كل `cat-XX-rival` بالتوازي ← ملف النمط `1-rivals.md`
2. نادِ كل `cat-XX-writer` بالتوازي ← `2-questions.json`
3. نادِ كل `cat-XX-media` بالتوازي ← `3-media.json`
4. نادِ كل `cat-XX-checker` بالتوازي ← `4-check.md`
5. نادِ كل `cat-XX-monitor` بالتوازي ← `5-monitor.md` و`ready.json`
6. نادِ `monitor-questions-<المجموعة>` مع تقارير مراقبي الخلايا.

أعط كل موظف اسم مجلد اليوم. بعد كل خطوة كومت: `git add company && git commit -m "Cells group G step N"`.

### المسار ب: باقي اللجان
لجنة وحدة بالأسبوع = `(W mod 7) + 1`:

| الرقم | اللجنة (cslug في `org.json`) |
|---|---|
| 1 | ابتكار الفئات والألعاب (innovation) |
| 2 | اللغة (language) + النمو والمشاهير (growth) |
| 3 | البث المباشر والفيديو (streaming) |
| 4 | الذكاء الاصطناعي والخوارزميات (ai) |
| 5 | تطوير التطبيقات والمنصات (apps) |
| 6 | البنية التحتية والأمن السيبراني (infra) |
| 7 | التصميم والصوتيات (design) |

نادِ العاملين بالتوازي (10 بكل رسالة)، بعدين مراقبيهم مع تقاريرهم، وكومت.

تبي أسرع؟ شغّل أكثر من مجموعة أو لجنة بالأسبوع.

## ③ مجلس التفتيش والقيادة

1. نادِ بالتوازي: `auditor-content`، `auditor-tech`، `auditor-design`، `auditor-growth`، `auditor-compliance`، `coo`، `head-strategy`، `head-academy`.
   أعطهم تقارير المراقبين وحالة الأسبوع. `head-academy` يعدّل ملفات الموظفين اللي تقييمهم أقل من 6، ويسجّل في `company/academy/log.md`.
2. نادِ `chief-inspector` مع تقارير المفتشين الخمسة.
3. نادِ `ceo` مع كل التقارير: يطلع قرارات الأسبوع (مسؤول وموعد لكل قرار) وأولويات الأسبوع الجاي.
4. نادِ `coo`: يكتب المحضر في `company/meetings/YYYY-MM-DD.md`، ويحدّث `company/decisions.md` و`company/backlog.md`.

## ④ الحفظ والرسالة

```bash
git add -A company .claude && git commit -m "Weekly meeting YYYY-MM-DD" && git push -u origin claude/multi-agent-company-9dst9p
```

آخر رسالة للمالك بالعربي، أقل من 20 سطر: المجموعة واللجنة اللي اشتغلت، كم سؤال جاهز في ready.json لكل فئة، تقييم كل قطاع، أفضل 3 إنجازات، أكبر 3 مشاكل، قرارات الرئيس التنفيذي، ومين انعاد تأهيله.

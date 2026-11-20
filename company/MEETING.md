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

## ② دورة العمل (لجنتين كل أسبوع)

كل أسبوع تشتغل **دفعتين** من الجدول تحت. رقم الدفعة = `(2×W) mod 10 + 1` و`(2×W + 1) mod 10 + 1`.
يعني كل الشركة تشتغل مرة كل 5 أسابيع. تبي أسرع؟ زِد عدد الدفعات بالأسبوع.

| الدفعة | الموظفين (المعرّفات من `org.json`) |
|---|---|
| 1 | `author-01` … `author-21` + `monitor-questions-1..3` |
| 2 | `author-22` … `author-42` + `monitor-questions-4..6` |
| 3 | `author-43` … `author-60` + `monitor-questions-7..9` |
| 4 | لجنة ابتكار الفئات والألعاب (cslug = innovation) |
| 5 | لجنة اللغة (language) + لجنة النمو والمشاهير (growth) |
| 6 | لجنة البث المباشر والفيديو (streaming) |
| 7 | لجنة الذكاء الاصطناعي والخوارزميات (ai) |
| 8 | لجنة تطوير التطبيقات والمنصات (apps) |
| 9 | لجنة البنية التحتية والأمن السيبراني (infra) |
| 10 | قطاع التصميم والصوتيات (design) |

لكل دفعة:
1. نادِ **العاملين** (مو المراقبين) بالتوازي، 10 بكل رسالة. كل واحد يسوي مهمته ويحفظ شغله في `company/work/` ويرجع تقريره.
2. بعدها نادِ **مراقبيهم** بالتوازي، وأعط كل مراقب تقارير اللي تحته. المراقب يراجع الشغل الفعلي ويقيّم كل موظف من 10.
3. كومت بعد كل دفعة: `git add company && git commit -m "Work batch N week W"`.

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

آخر رسالة للمالك بالعربي، أقل من 20 سطر: الدفعتين اللي اشتغلت، تقييم كل قطاع، أفضل 3 إنجازات، أكبر 3 مشاكل، قرارات الرئيس التنفيذي، ومين انعاد تأهيله.

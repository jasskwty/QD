<div dir="rtl">

# دليل التشغيل: مكتب الديوانية الافتراضي 🏢

المكتب لعبة على المتصفح تمشي فيها بشخصيتك (المدير التنفيذي 👑) بين أقسام الشركة الـ 482 موظف، تفتش عليهم، تكلمهم، وتسوي اجتماعات.

## ① شغّل اللعبة على جهازك

تحتاج **Node.js 20 أو أحدث** ([nodejs.org](https://nodejs.org)) و**git**.

```bash
git clone https://github.com/jasskwty/QD.git
cd QD
git checkout claude/multi-agent-company-9dst9p
cd virtual-office
npm install
npm start
```

افتح المتصفح على: **http://localhost:8080/virtual-office/**

- الخادم يسحب آخر شغل الموظفين من GitHub كل 5 دقايق، والصفحة تتحدث كل دقيقة. لو تبي توقف السحب: `AUTO_PULL=0 npm start`.
- تبي تفتحه من جوالك على نفس الواي فاي؟ شغّله بـ `HOST=0.0.0.0 npm start` وافتح `http://<IP جهازك>:8080/virtual-office/`.

## ② التحكم

| الزر | وش يسوي |
|---|---|
| **WASD** أو **الأسهم** | تمشي |
| **ضغطة ماوس** على أي مكان (أو على الخريطة الصغيرة) | تروح له بنفسك |
| **E** قريب من موظف (أو اضغط عليه) | تفتح بطاقته: رقمه، قسمه، مراقبه، حالته، تقييمه، عهدته، شاشة شغله، والدردشة معه |
| **R** داخل قاعة اجتماعات | «استدعاء قادة المجالات» أو «استدعاء موظف بالاسم»، وتشوفهم يمشون للقاعة ويجلسون |
| **📋 أولوياتي** | مدير أعمالك: الملخص التنفيذي (3 نقاط) والمهام المفتوحة وزر «رتّب لي شغلي» |
| **🚨 اجتماع قادة عاجل** | القادة الـ 13 يمشون لقاعة 1 فوراً |
| **🔎 البحث** | اكتب اسم أو رقم موظف وتروح له |
| عجلة الماوس | تقريب وتبعيد |

على الجوال: اضغط على الشاشة للمشي، واضغط على شريط التلميح تحت بدل E و R.

## ③ الدردشة الحية مع الإيجنتات

بدون إعداد، اللعبة تشتغل كاملة، والدردشة تعطيك نص جاهز تنسخه وتلصقه في Claude Code.
عشان الموظف يرد عليك داخل اللعبة بنفسه (بتعليماته من ملفه)، تحتاج **مفتاح Claude API**:

1. سوّ مفتاح من [console.anthropic.com](https://console.anthropic.com). **انتبه:** الـ API يتحاسب لحاله، مو من اشتراكك في Claude.
2. شغّل الخادم ومعه المفتاح:
   - Mac / Linux: `ANTHROPIC_API_KEY=sk-ant-... npm start`
   - Windows (PowerShell): `$env:ANTHROPIC_API_KEY="sk-ant-..."; npm start`
3. كل موظف يرد بنموذجه: Haiku للروتيني، Sonnet للمدققين والمراقبين، Opus للقيادة. الاجتماع مع 13 قائد = 13 طلب لكل رسالة منك.

**لا تحط المفتاح في أي ملف داخل الريبو.** الريبو عام وأي مفتاح فيه ينسرق.

## ④ إيميلك ورقمك للتقارير والاتصال الفوري

الأدوات: `tools/notify/email_reporter.js` (التقارير على الإيميل) و`tools/notify/call_notifier.js` (اتصال أو تيليقرام عند كارثة الفرحة أو انتهاء المهام).
**مكانها في متغيرات البيئة بس، مو في ملفات الريبو** (الريبو عام، وإيميلك ورقمك بيصيرون مكشوفين للكل).

### وين أحطها؟
الإيجنتات تشتغل في بيئة Claude السحابية «ت». في Claude: من قائمة البيئة فوق في عنوان الجلسة ← **Edit**:

| الإعداد | وين | القيمة |
|---|---|---|
| `OWNER_EMAIL` | Environment variables | إيميلك |
| `RESEND_API_KEY` | Network secrets للموقع `api.resend.com` (Bearer)، وبعدها متغير `RESEND_API_KEY=dummy` | مفتاح من [resend.com](https://resend.com) (فيه خطة مجانية) |
| `OWNER_PHONE` | Environment variables | رقمك بالصيغة الدولية، مثلاً `+965XXXXXXXX` |
| `TWILIO_ACCOUNT_SID` و `TWILIO_FROM` | Environment variables | من حسابك في [twilio.com](https://www.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Network secrets للموقع `api.twilio.com` (username/password = SID/token)، وبعدها متغير `TWILIO_AUTH_TOKEN=dummy` | |
| `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHAT_ID` | Environment variables | بوت من @BotFather ورقم المحادثة (أسهل من Twilio ومجاني) |

Network secrets تنحط في الطلب وقت الإرسال، فالمفتاح ما يبين للإيجنتات. متغيرات البيئة يقدر يشوفها أي أحد يستخدم البيئة.
تقدر تجرب من جهازك بنفس المتغيرات:

```bash
OWNER_EMAIL=you@example.com RESEND_API_KEY=re_... node tools/notify/email_reporter.js "تجربة" "هلا من مكتب الديوانية"
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node tools/notify/call_notifier.js "تجربة إنذار"
```

بدون أي إعداد، الأداتين تطبع الرسالة بس (dry run) وما توقف شغل الإيجنتات.

## ⑤ من وين تجي البيانات الحية؟

| الملف | مين يكتبه | وش يبين في اللعبة |
|---|---|---|
| `company/org.json` | `tools/company/gen_org.py` | كل الموظفين ومكاتبهم |
| `company/office/agents-status.json` | كل موظف لما يخلص | الأيقونة فوق راسه (💻 🔍 💡 ✅ ⚠️ 🔥) |
| `company/office/status.json` | محرر مؤشر الفرحة، مدير التسويق، مدير الأعمال | مؤشر الفرحة، التارقت، التوفير، الكارثة، شاشات المباريات |
| `company/hr/roster.json` و `allowance.json` | الموارد البشرية | ⭐ الترقيات والعهدة الشهرية |
| `company/backlog.md` | مدير الأعمال | المهام المفتوحة في «أولوياتي» |

لين ما يشتغل الموظفين، الأرقام تبين «—». اللعبة ما تخترع أرقام.

</div>

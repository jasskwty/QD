# دليل تشغيل منظومة QD على n8n

هذا الدليل يشرح خطوة بخطوة: استيراد مسارات العمل الأربعة، وإضافة مفاتيح API، وربط المكتب الافتراضي.

> رابط n8n الخاص بك: `https://q8kwt.app.n8n.cloud`
> روابط الـ Webhooks مجهزة مسبقاً على: `https://q8kwt.app.n8n.cloud/webhook/...`

---

## 1) محتويات المجلد `/n8n-workflows`

| الملف | الوظيفة | الـ Endpoint |
|---|---|---|
| `01_cell_production_pipeline.json` | خط إنتاج الخلايا (5 خطوات + الشفتات A/B) | `POST /webhook/qd-cell-pipeline` |
| `02_joy_lab_and_crisis_lockdown.json` | مختبر المتعة + وضع `CODE_RED_JOY_CRISIS` | `POST /webhook/qd-joy-lab` |
| `03_hr_innovation_marketing_engine.json` | الابتكار + HR + التسويق + التارقت المتصاعد + مدرب المهارات | `POST /webhook/qd-growth-engine` (ويعمل أيضاً تلقائياً في أول كل شهر) |
| `04_ceo_assistant_email_and_call.json` | مدير أعمالك + الإيميل + Telegram + مكالمة Twilio + حالة الشركة | `qd-ceo-assistant`, `qd-task-report`, `qd-meeting`, `qd-company-state`, `qd-company-state-update` |

**طريقة الترابط:** المسارات 01 و02 و03 ترسل تقاريرها إلى المسار 04 (`qd-task-report`)، والمسار 04 يرسل لك إيميلاً ورسالة Telegram ويتصل بك، ويحدّث `company_state` الذي يقرأه المكتب الافتراضي.

---

## 2) الاستيراد في n8n

كرر هذه الخطوات لكل ملف من الأربعة، **وابدأ بالملف 04**:

1. افتح n8n، ثم **Overview** ثم **Create Workflow**.
2. من قائمة `...` أعلى اليمين اختر **Import from File...**.
3. اختر ملف JSON من مجلد `n8n-workflows`.
4. اضغط **Save**.

---

## 3) أين أضع مفاتيح API (Credentials)

افتح كل عقدة عليها علامة تحذير، واختر **Create new credential** من خانة Credential:

| الخدمة | العقد التي تستخدمها | نوع الـ Credential في n8n | من أين أحصل عليه |
|---|---|---|---|
| **Claude (Anthropic)** | `Claude Haiku`، `Claude Sonnet` في كل المسارات | **Anthropic** | console.anthropic.com ⬅️ API Keys |
| **Gmail** | `Email Detailed Report` (04) | **Gmail OAuth2** | زر "Sign in with Google" داخل n8n |
| **Telegram** | `Telegram Alert` (04)، `Ask CEO Approval` (02) | **Telegram API** | أنشئ بوت عبر @BotFather وخذ الـ Token |
| **Twilio** | `Twilio Phone Call` (04) | **Twilio API** | console.twilio.com: Account SID + Auth Token |
| **Unsplash** | `3c. Unsplash` (01) | **Header Auth**: Name = `Authorization`، Value = `Client-ID مفتاحك` | unsplash.com/developers |
| **Pexels** | `3d. Pexels` (01) | **Header Auth**: Name = `Authorization`، Value = `مفتاحك` | pexels.com/api |
| **NASA / Wikimedia** | `3a`, `3b` (01) | لا تحتاج مفتاحاً | - |

> مهم: لا تضع المفاتيح داخل ملفات JSON أو داخل GitHub أبداً. مكانها الوحيد شاشة Credentials في n8n.

### بياناتك الشخصية
- في المسار **04**، افتح عقدة **CEO Contact Config** وعدّل:
  - `ceo_email`: إيميلك (مضبوط مسبقاً على cvhd1225@gmail.com)
  - `ceo_phone`: رقمك بصيغة دولية، مثل `+965XXXXXXXX`
  - `twilio_from`: رقم Twilio الذي اشتريته
  - `telegram_chat_id`: رقم المحادثة (أرسل رسالة لبوتك ثم استخدم @get_id_bot)
- في المسار **02**، عدّل `chatId` في عقدة **Ask CEO Approval (Telegram)**.

> ملاحظة Twilio: الحساب التجريبي (Trial) يتصل فقط بالأرقام التي وثّقتها في Verified Caller IDs، ويجب تفعيل الاتصال الدولي للكويت من Geo Permissions.

---

## 4) التفعيل (Publish)

1. فعّل **04 أولاً** (زر Publish)، لأن باقي المسارات ترسل له.
2. بعده فعّل 01 و02 و03.
3. بيانات الحالة (الموظفون، التارقت، مؤشر الفرحة) تُحفظ في *Workflow Static Data*، ولا تُحفظ إلا في التشغيل الفعلي بعد التفعيل، وليس في التشغيل التجريبي من المحرر.

---

## 5) التجربة السريعة

```bash
# خط إنتاج الخلايا
curl -X POST https://q8kwt.app.n8n.cloud/webhook/qd-cell-pipeline \
  -H "Content-Type: application/json" \
  -d '{"category":"الدوري الكويتي","count":5}'

# مختبر المتعة
curl -X POST https://q8kwt.app.n8n.cloud/webhook/qd-joy-lab \
  -H "Content-Type: application/json" \
  -d '{"our_game_spec":"وصف لعبتنا...","max_rounds":3}'

# محرك النمو (مع إيراد الشهر)
curl -X POST https://q8kwt.app.n8n.cloud/webhook/qd-growth-engine \
  -H "Content-Type: application/json" \
  -d '{"monthly_revenue_kwd":215}'

# كلّم مدير أعمالك
curl -X POST https://q8kwt.app.n8n.cloud/webhook/qd-ceo-assistant \
  -H "Content-Type: application/json" \
  -d '{"message":"رتب لي أولويات اليوم","session_id":"ceo"}'

# حالة الشركة (للمكتب الافتراضي)
curl https://q8kwt.app.n8n.cloud/webhook/qd-company-state
```

---

## 6) كيف يعمل كل مسار (باختصار)

### 01: خط إنتاج الخلايا
`Webhook` ⬅️ **Shift Scheduler** ⬅️ محلل المنافسين (Haiku) ⬅️ كاتب الأسئلة (Haiku) ⬅️ **Switch** يوزع كل سؤال على مصدر الصور (NASA / Wikimedia / Unsplash / Pexels) ⬅️ إعادة التسمية `img_0001.jpg` ⬅️ مدقق الحقائق (Sonnet) ⬅️ **فلتر برمجي** لا يقبل إلا سؤالاً له مصدران موثوقان من القائمة، ويستبعد ويكيبيديا ⬅️ مراقب العملية (تقييم من 10) ⬅️ `ready.json` ⬅️ تقرير إلى 04.
- **الشفتات:** 10 خلايا. الفردية في Shift A (من 8 صباحاً إلى 8 مساءً بتوقيت الكويت)، والزوجية في Shift B. الخلية التي في استراحة ترد بـ `resting` دون أن تصرف توكنز.

### 02: مختبر المتعة وCODE_RED
9 لاعبين ثم 5 محللي سعادة ثم **Joy Meter**. إذا تفوقت سين جيم أو مخمخ ولو بـ 1%، يبدأ `CODE_RED_JOY_CRISIS`: تُقفل القاعات في المكتب، وتنعقد غرفة الطوارئ (Sonnet) في القاعات الأربع، وتُعدَّل اللعبة ويُعاد الاختبار.
- **حماية التوكنز:** الحلقة تستمر حتى الفوز، لكن ضمن حد أقصى `max_rounds` (لا يتجاوز 5). وكل جولة ترسل لك Telegram فيه رابطان: ✅ go أو ⛔ stop. إذا لم ترد خلال 24 ساعة تتوقف الحلقة. وإذا انتهت الجولات دون فوز يُرفع الأمر لك بأولوية عالية.

### 03: النمو
مختبر الابتكار (11) ⬅️ HR (4) ينشئ خلية من 5 إيجنتات لكل لعبة ⬅️ قواعد برمجية للعهدة (1 د.ك لكل موظف شهرياً) والترقيات (Junior ⬅️ Senior ⬅️ Lead) ومضاعفة مهام المقصرين ⬅️ التسويق (12) ⬅️ **محرك التارقت**: 200 د.ك، وعند تحقيقه يرتفع ×1.25 ويُضاف اجتماع تخطيط ⬅️ مدرب المهارات (3) يقرأ آخر تحديثات مستودع `anthropics/skills` ويقترح تعديلات البرومبتات.
- أرسل أداء الموظفين في الحقل `performance` (انظر الملاحظة داخل المسار).

### 04: مدير الأعمال
- محادثة مع ذاكرة (آخر 10 رسائل)، وأولويات يومية، وملخص من 3 نقاط فقط.
- اجتماعات القاعات الأربع: الدخول للقادة فقط، والموظف العادي يدخل بالاستدعاء بالاسم (`summoned_names`).
- **لا توجد أي عقدة Cron أسبوعية**؛ الاجتماعات بالطلب أو عند الطوارئ.

---

## 7) أسلوب توفير التوكنز المستخدم
- **Haiku** لكل الخطوات الخفيفة، و**Sonnet** فقط للتدقيق وغرفة الطوارئ ومدير الأعمال.
- تفعيل **Prompt Caching** في عقد Claude.
- كل الردود JSON مختصرة بحد أقصى للتوكنز في كل عقدة.
- القواعد الحسابية (الشفتات، المصادر، الترقيات، التارقت، مؤشر الفرحة) تُنفَّذ في عقد Code، أي بدون أي توكنز.
- الخلايا المستريحة لا تستدعي الذكاء الاصطناعي إطلاقاً.

> نسبة التوفير الفعلية تعتمد على حجم الاستخدام، وتقدر تراقبها من لوحة Anthropic Console.

---

## 8) حدود يجب أن تعرفها
- **اللاعبون ومحللو السعادة** نماذج AI تحاكي تجربة اللعب، وليسوا لاعبين حقيقيين. النتائج مؤشر، وليست بديلاً عن اختبار مع بشر.
- **مدقق الحقائق** لا يتصفح الإنترنت. هو مقيَّد بالرفض عند الشك، والفلتر البرمجي يشترط مصدرين من القائمة الموثوقة. للتحقق الحي أضف أداة بحث (مثل Tavily أو SerpAPI) كـ Tool لعقدة المدقق.
- **مدرب المهارات** يقترح تعديلات البرومبتات ويرسلها في التقرير، ولا يعدّل الملفات تلقائياً.

---

## 9) المكتب الافتراضي (`/virtual-office`)
المكتب الافتراضي يتصل بـ n8n عبر هذه الروابط:

| الغرض | الطلب |
|---|---|
| حالة الشركة (كل 5 ثوانٍ) | `GET https://q8kwt.app.n8n.cloud/webhook/qd-company-state` |
| الكلام مع مدير الأعمال | `POST .../qd-ceo-assistant` بالشكل `{ "message": "...", "session_id": "ceo" }` |
| فتح اجتماع واستدعاء موظف بالاسم | `POST .../qd-meeting` بالشكل `{ "room": "room_1", "attendees": [...], "summoned_names": [...] }` |

حقول `company_state` المهمة للعبة: `mode` (`NORMAL` أو `CODE_RED_JOY_CRISIS`)، و`meeting_rooms_locked`، و`joy_meter`، و`active_shift`، و`rooms`، و`events`، و`celebrate`، و`target_kwd`.

**التشغيل الحالي على متصفحك:**
```bash
cd virtual-office
npm install
npm start      # ثم افتح الرابط الذي يظهر في الطرفية (عادة http://localhost:3000)
```

> إعادة بناء المكتب بـ Phaser 3 + React وربطه الكامل بهذه الروابط هي **المرحلة الثانية**، وسيُحدَّث هذا القسم عند تسليمها.

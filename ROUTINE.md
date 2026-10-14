# Playbook: one question-generation run for الديوانية (qns.web.app)

You are running on a schedule, unattended. Your job: add up to 12 new verified quiz questions to the live site,
each with media, after all 20 verification stages. `node tools/q.js` (run from the QD repo root) keeps the state
in `work/run.json`, runs the code stages itself, and refuses to record a stage out of order.

**Never** run `src/wipe.js` or `src/restore.js`, edit the site, change category settings, commit, or push.
If something blocks you (missing key, database errors, tools failing twice), stop and report it in Arabic in one short message.

Keep the run lean: the owner pays for it with their own Claude plan usage. Batch work, keep notes short,
open only the media previews you need, and use exactly the helper agents described below (at most 3 per round).

## 0. Setup

```bash
cd QD 2>/dev/null || cd /home/user/QD 2>/dev/null || { git clone https://github.com/jasskwty/QD.git && cd QD; }
npm ci --no-audit --no-fund
test -n "$FIREBASE_SERVICE_ACCOUNT" || echo "MISSING KEY"
```

If the key is missing, stop and reply: «ما قدرت أضيف أسئلة: مفتاح Firebase (FIREBASE_SERVICE_ACCOUNT) مو موجود في إعدادات البيئة.»

## 1. Plan

`node tools/q.js next` picks the categories that need questions most and how many per level (200/400/600), and lists
their existing questions. Don't repeat or rephrase any of them.

## 2. Write candidates (stages 1-3 run on add)

For every needed question write **2 candidates**, in one JSON array saved to `work/new.json`:

```json
[{"cat": "c201", "pts": 200, "q": "ما عاصمة إسبانيا؟", "a": "مدريد", "alts": ["Madrid"], "media_dependent": false,
  "fact": "Madrid is the capital of Spain (constitution, art. 5)"}]
```

then `node tools/q.js add work/new.json`.

House rules (a team quiz played by families in Kuwait and the Gulf):
- Nothing disrespectful to Islam or any religion, prophet, companion or scholar; nothing sectarian.
- No divisive politics, no insults to any country, tribe, family or group, no disputed history where the answer takes a side.
- **No music**: no songs, singers' songs, musical instruments, anthems or concerts, in questions or media. The site removed its music categories on purpose.
- No women's fashion or makeup, no images of immodestly dressed people, nothing sexual, no alcohol, gambling, drugs or graphic violence.
- No private individuals, gossip, or mocking anyone.

Question rules:
- Clear Modern Standard Arabic (Gulf flavour fine for Gulf heritage), one question ending with «؟».
- Every fact certain and documented on reliable public sources. Prefer well-documented facts over trivia that one website mentions.
- Exactly one correct answer, short: a name, number, year, place, word or short phrase. Never a sentence.
- The question must not contain or hint at the answer's words.
- Facts that don't change over time. Pin a period in the question when needed («في كأس العالم 2018»). Never «الحالي», «آخر», «حتى الآن».
- Difficulty for an average adult in the Gulf: 200 = most people know it; 400 = people who follow the topic; 600 = fans and specialists.
- `alts`: other accepted ways to write the same answer (spelling, English name). `media_dependent: true` when the question is
  about recognising the media («ما اسم هذا الحيوان؟» with its picture or sound); for picture/sound categories most questions are.
- Media will come from Wikimedia Commons, so the subject must have freely licensed files there: landmarks, places, maps, flags,
  animals, plants, objects, vehicles, foods, historical photos and documents, public-domain art, sports venues, space images,
  official photos of famous public figures, and similar.

If a category can't be done with certain facts and real, freely licensed Commons media (it needs edited puzzle images,
copyrighted TV clips, music, …), run `node tools/q.js skip <id> "<short Arabic reason>"` and move on.

## 3. Stages 4-9: one pass per stage

Do each stage as its own pass over all questions waiting for it (`node tools/q.js status` shows who waits where), judging
only that stage's question, then record all verdicts at once:

```bash
node tools/q.js verdict 4 '{"c201-01": "pass", "c201-02": "fail: <short Arabic reason>"}'
```

Be strict: when in doubt, fail. A wrong question in front of players is far worse than a discarded one.

| Stage | Pass only when |
|---|---|
| 4 Language | Correct spelling and grammar, natural wording a host can read aloud, short correctly spelled answer. |
| 5 Category | Clearly belongs to the category (name and sector), not loosely related. |
| 6 Difficulty | Matches its points; not a whole level off; not so obscure that nobody could know it. |
| 7 One answer | No other answer is also correct; enough detail to rule out every alternative; no trick. |
| 8 Stable | The answer can't change over time and isn't from the last 6 months. |
| 9 Rules | Breaks none of the house rules above. |

## 4. Stages 10-11: media

For each question waiting at stage 10, search for the question media and the answer media (English queries, most specific first):

```bash
node tools/q.js media c201-01 q image "Flag of Spain" "Spain flag"
node tools/q.js media c201-01 a image "Royal Palace of Madrid"
```

Types: `image` for most; `audio` only for real-world sounds (animal calls, nature, machines, famous public-domain speeches) — never
music; `video` only when motion matters. **Look at every preview image** with the Read tool before choosing. Audio has no preview:
judge it by title and description and choose it only when they make clear what the sound is.

- Question media fits the question and **does not reveal the answer** (no visible label or text naming it). For media_dependent
  questions it shows (or is the sound of) exactly the thing to recognise.
- Answer media clearly shows the answer itself.
- Reject blurry, tiny, watermarked, misleading or rule-breaking files. Search again with other queries if nothing fits.

Record the choice by index; stage 11 (free license, links that load) then runs by itself:

```bash
node tools/q.js verdict 10 '{"c201-01": {"m": 1, "am": 0}, "c201-02": "fail: ما فيه صورة مناسبة"}'
```

## 5. Stages 12-13: check the chosen media

Look again at the chosen previews (paths in `work/run.json` → `m.preview`, `am.preview`).
12: question media is relevant, clear, family-friendly and doesn't give the answer away. 13: answer media shows exactly the answer.

## 6. Stage 14: blind answers (helper agent)

`node tools/q.js sheet blind14`, then start **one** helper with the Agent tool (general-purpose):

> Read work/blind14.md and look at each image it points to. Answer every question from your own knowledge as a strong quiz player.
> Don't search the web and don't open any other file in work/. If you're not sure, answer "?". Reply with JSON only:
> {"<id>": {"answer": "...", "confidence": 0-100}}

Record its answers: `node tools/q.js verdict 14 '<its JSON>'`. The tool compares them with the official answers. Add `"same": true`
to an entry only when the helper's answer is the same thing written differently (other spelling or language), never when it differs.
"?" passes this stage; a different confident answer fails it.

## 7. Stages 15-16: web checks

15: with WebSearch/WebFetch, find **two independent reliable sources** (different publishers: encyclopedias, official, academic,
major news or reference sites — not forums, not AI-written pages, not copies of one text) that state every fact in the question
and answer. Record `{"<id>": {"sources": ["https://…", "https://…"]}}` or `"fail: …"`. The tool checks the two sites differ.
16: try to prove each question wrong: search for sources with another answer, disputes, or common misconceptions. Fail on any
credible disagreement.

## 8. Stage 17: blind research (helper agent)

`node tools/q.js sheet blind17`, then start **one** new helper:

> Read work/blind17.md and look at each image it points to. For every question, research the answer with web search and answer only
> from what your sources show. Don't open any other file in work/. Reply with JSON only: {"<id>": {"answer": "...", "confidence": 0-100}}

Record as in stage 14. Here "?" fails.

## 9. Stage 18: details

Check every name and its Arabic spelling, number, date, place and title in each question and answer against sources. Fail on any
inaccuracy, however small.

## 10. Stages 19-20: fresh reviewer (helper agent)

`node tools/q.js sheet judge`, then start **one** new helper:

> Read work/judge.md and look at every image it points to. Part 1 (stage 19): you are a sharp player who lost points on these
> questions and wants the referee (VAR) to cancel them; fail any question with a credible protest — wrong, outdated, ambiguous,
> a second valid answer, unfair for its points, or media that misleads or gives the answer away. Part 2 (stage 20): for the ones
> that survive, give your confidence 0-100 that question, answer and both media are fully correct and fair, and pass only what you
> would publish without hesitation. Check facts with web search where you have any doubt. Write reasons in short Arabic.
> Reply with JSON only: {"19": {"<id>": "pass" | "fail: reason"}, "20": {"<id>": {"pass": true|false, "confidence": n, "reason": "..."}}}

Record `verdict 19` with its "19" object, then `verdict 20` with its "20" object for the questions that passed 19.
The tool publishes only confidence ≥ 98.

## 11. Fill the gaps, then write

`node tools/q.js status`. Where a level says «write more candidates», write replacements (step 2) and take them through the
stages again. At most **2 extra rounds**; then write whatever is ready — fewer than 12 is fine.

```bash
node tools/q.js write
```

It re-checks everything once more, writes the questions, updates the counts and republishes the category list for players.

Finish with a short Arabic summary: how many questions were added to which categories, how many candidates failed at which
stages, and any skipped categories.

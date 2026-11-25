# QD Virtual Office: React + Phaser 3, wired to n8n

A 2D top-down office. You walk around as the CEO, and every department is a live front end for one of the n8n workflows in `/n8n-workflows`.
The original vanilla game in `../` (server.js, js/game.js) is left untouched.

## Run

```bash
cd virtual-office/react-office
cp .env.example .env      # adjust if your n8n URL differs
npm install
npm run dev               # http://localhost:5173
```

In dev, requests go to `/n8n/webhook/*`, and Vite proxies them to `N8N_ORIGIN`, so you get no CORS issues.
For a static build (`npm run build`), set `VITE_N8N_BASE=https://q8kwt.app.n8n.cloud/webhook`. The webhooks already allow any origin.

The workflows must be **published** for the `/webhook/...` URLs to respond. To use test URLs instead, set `VITE_N8N_BASE=/n8n/webhook-test` and click "Listen for test event" in n8n first.

## Controls
- Arrow keys or WASD to move. Press **E** near a department, or click it.
- The right panel shows the department's actions, the latest events, and the office log.

## Map → n8n

| Zone | Action | Webhook |
|---|---|---|
| Cells 1–10 (odd = shift A, even = shift B) | Run the question production pipeline for that cell | `POST /qd-cell-pipeline` (WF 01) |
| Joy Lab (9 players + 5 analysts) | Start a joy test vs. Sinjim/Mukhmukh | `POST /qd-joy-lab` (WF 02) |
| Innovation / HR / Marketing / Skills Coach | Monthly growth review with revenue | `POST /qd-growth-engine` (WF 03) |
| Business manager / CEO office | Chat with your business manager | `POST /qd-ceo-assistant` (WF 04) |
| Meeting rooms 1–4 | Open or close a meeting (leaders only, or people summoned by name) | `POST /qd-meeting` (WF 04) |
| Reports board | Full event history | from state |
| (background) | Poll every 10 s | `GET /qd-company-state` (WF 04) |

## Live state effects
- `active_shift`: cells on the resting shift are dimmed.
- `mode = CODE_RED_JOY_CRISIS`: a pulsing red overlay appears, the meeting rooms get red borders, and the CEO avatar cannot enter them.
- `joy_meter`: shown as bars in the HUD and on the Joy Lab.
- New `events`: a floating icon appears over the matching cell or department.
- `celebrate`: confetti (for example, when the revenue target is hit).

## Files
- `src/n8n.js`: webhook client
- `src/officeLayout.js`: floor plan and agents
- `src/game/OfficeScene.js`: Phaser scene (movement, zones, state effects)
- `src/App.jsx`: React HUD, panels, and chat
- `src/eventBus.js`: React ↔ Phaser bridge

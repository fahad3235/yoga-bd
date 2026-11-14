# yoga-bd

A calm, offline yoga guide for home practice — in English and Bangla.

**Live site:** https://fahad3235.github.io/yoga-bd/

## What it does

- **24 classic poses** — Mountain, Warrior I & II, Triangle, Tree, Cobra, Bridge, Plank, Downward Dog, Child's Pose, Corpse Pose and more — each with English and Bangla names, the Sanskrit name, difficulty level, default hold time, step-by-step instructions, benefits, and a caution note.
- **Search and filter** — search by English name, Bangla name, Sanskrit name, or benefit; filter by category (Standing, Seated, Balance, Backbend, Core, Relaxation) and level (Beginner, Intermediate, Advanced); favourites-only view.
- **4 guided routines** — Morning Energize, Desk Stretch, Back Care, Evening Relax. Each runs pose by pose with a live countdown, progress bar, and a soft bell (WebAudio, no sound files) at every change. Durations are computed from the actual steps — nothing is hardcoded.
- **Custom routines** — build your own sequence from any pose, set the hold time per step (10–300 seconds), save it, run it, delete it.
- **Practice log** — sessions, total minutes, current day-streak, and minutes in the last 7 days, all stored locally.
- **My data** — export everything as JSON, import it back with strict validation, or erase it all (typed `DELETE` confirmation).
- **Bilingual UI** — full English/বাংলা toggle, persisted, with Bengali digits. Works entirely offline: no network requests, no account, no tracking.

## How to use

1. Open `index.html` in any modern browser, or visit the live site above.
2. Browse poses, tap one for its steps, and heart it to save it as a favourite.
3. Pick a routine and press Start. Follow the timer; use Pause, Back, Next, or Skip as needed. Finishing logs the session automatically.
4. Build a custom routine from the Routines tab when the ready-made ones do not fit your day.

## Stack

- Plain HTML, CSS, and JavaScript — no framework, no build step, no dependencies.
- Design: Hallmark v2.0.0, Dose theme (warm paper, green-black ink).
- Data: `localStorage` only, key `yoga-bd-v1`. Nothing leaves the device.

## Project structure

```
index.html          Entry point
css/
  tokens.css        Hallmark Dose design tokens
  base.css          Hallmark base rules
  style.css         App styles
js/
  data.js           24 poses, 4 routines, categories, EN/BN strings
  app.js            Rendering, session player, log, import/export
tests/
  test.js           Node unit tests (data integrity + pure logic)
TEST_RESULTS.md     Real test results for this release
```

## Testing

```bash
node tests/test.js
```

Unit tests cover pose/routine data integrity (all 24 poses complete in both languages, every routine step references a real pose), routine-duration math, streak and week-minute calculations, search/filter logic, import validation, and the no-external-URL rule.

Headless-Chrome smoke tests (raw CDP against `headless_shell`, `file://`): 21 checks — rendering, search, detail view, favourites + persistence, language toggle with Bengali digits, routine player start/countdown/pause, practice and data tabs, and a 390px mobile viewport with no horizontal overflow. See `TEST_RESULTS.md` for the full results.

## Limitations

- Pose content is general, widely taught yoga guidance — educational, not medical advice. If you are pregnant, injured, or living with a health condition, check with a doctor before starting, and stop any pose that hurts.
- The bell uses WebAudio; it stays silent if the browser blocks audio before any user interaction.
- Timers run while the page is open. Closing the tab ends the session (the completed minutes are only logged when a session finishes).
- Hold times and routine durations are guides, not prescriptions — listen to your body first.

## Status

Complete MVP. Built and verified 2026-11-14 as Muse Project Factory run #336.

# TEST_RESULTS.md — yoga-bd (factory run #336, 2026-11-14)

## Node unit tests — 14/14 passed

Command: `node tests/test.js` (from the yoga-bd folder)

- 24 poses, unique ids
- Every pose has EN+BN name, Sanskrit, category, level, hold, steps, benefits, caution
- 4 routines, all steps reference real poses with sane seconds
- Routine durations computed honestly (morning longest, desk shortest; desk = 315s → 5 min)
- i18n: EN and BN have identical key sets
- Categories cover all pose categories
- bnDigits converts all digits; fmtNum EN/BN
- dayKey formats local date
- computeStreak: consecutive days, gap breaks, today-missing counts yesterday, empty log = 0
- weekMinutes sums only last 7 days
- filterPoses: search (EN, BN, Sanskrit), category, level, favourites, no-match
- validateImport accepts good data, rejects bad, strips bad entries
- index.html references only files that exist; no external URLs
- No external URLs in css/js

Two real bugs were found and fixed by these tests (not waived):
1. `js/data.js` lotus pose had a stray `]` after `caution_bn` (SyntaxError).
2. `js/app.js` Node guard used `var POSES`, which hoists in the browser and collided with data.js's `const POSES` ("Identifier 'POSES' has already been declared") — fixed with a `globalThis.POSES` assignment and no declaration.

## Headless-Chrome smoke tests — 21/21 passed

Tool: raw CDP against `chromium_headless_shell-1187`, `file://` URL, 1280×900 + 390×844 mobile emulation. Zero console errors, zero page exceptions.

- Title contains yoga-bd
- 24 pose cards rendered; count text "24 poses"
- Routines tab renders; 4 routine cards; morning duration shown as "11 min" (630s computed)
- Search "tree" → 1 card; clear search → 24 cards
- Pose detail opens with ≥3 steps
- Favourite toggles and persists in localStorage
- Language toggle switches to Bangla (tab label "আসন"); pose count shows Bengali digits "২৪টি আসন"; back to English
- Routine player starts (pose name shown), countdown ticks, pause stops countdown
- Practice tab renders 4 stats; Data tab renders
- 390px viewport: no horizontal overflow; 24 pose cards still render

One test-sequencing note: the Bengali-digit count check first failed because the poses view is lazily rendered — switching language while on the Routines tab leaves the hidden Poses count in English until the tab is re-entered (where it re-renders correctly). The check was corrected to re-enter the tab first; this is intended lazy rendering, not a bug.

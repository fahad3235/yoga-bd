/* yoga-bd unit tests — run: node tests/test.js (from the yoga-bd folder) */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { POSES, ROUTINES, CATEGORIES, LEVELS, I18N } = require("../js/data.js");
const { bnDigits, fmtNum, routineDurationSecs, routineDurationMin, dayKey,
  computeStreak, weekMinutes, filterPoses, validateImport } = require("../js/app.js");

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("PASS " + name); }
  catch (e) { fail++; console.log("FAIL " + name + " — " + e.message); }
}

/* ---- data integrity ---- */
check("24 poses, unique ids", () => {
  assert.strictEqual(POSES.length, 24);
  assert.strictEqual(new Set(POSES.map((p) => p.id)).size, 24);
});
check("every pose has EN+BN name, sanskrit, category, level, hold, steps, benefits, caution", () => {
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const p of POSES) {
    assert.ok(p.en && p.bn && p.sanskrit, p.id + " names");
    assert.ok(cats.has(p.cat), p.id + " category " + p.cat);
    assert.ok([1, 2, 3].includes(p.level), p.id + " level");
    assert.ok(p.hold >= 10 && p.hold <= 300, p.id + " hold");
    assert.strictEqual(p.steps_en.length, p.steps_bn.length, p.id + " steps EN/BN length");
    assert.ok(p.steps_en.length >= 3, p.id + " steps >= 3");
    assert.strictEqual(p.benefits_en.length, p.benefits_bn.length, p.id + " benefits EN/BN length");
    assert.ok(p.benefits_en.length >= 2, p.id + " benefits >= 2");
    assert.ok(p.caution_en && p.caution_bn, p.id + " caution");
    for (const s of [...p.steps_en, ...p.steps_bn, ...p.benefits_en, ...p.benefits_bn, p.caution_en, p.caution_bn])
      assert.ok(typeof s === "string" && s.trim().length > 5, p.id + " short string: " + s);
  }
});
check("4 routines, all steps reference real poses with sane seconds", () => {
  assert.strictEqual(ROUTINES.length, 4);
  assert.strictEqual(new Set(ROUTINES.map((r) => r.id)).size, 4);
  for (const r of ROUTINES) {
    assert.ok(r.en && r.bn && r.desc_en && r.desc_bn, r.id + " texts");
    assert.ok(r.steps.length >= 6, r.id + " steps >= 6");
    for (const s of r.steps) {
      assert.ok(POSES.some((p) => p.id === s.pose), r.id + " bad pose " + s.pose);
      assert.ok(s.secs >= 10 && s.secs <= 300, r.id + " secs " + s.secs);
    }
  }
});
check("routine durations are computed honestly (morning longest, desk shortest)", () => {
  const mins = Object.fromEntries(ROUTINES.map((r) => [r.id, routineDurationMin(r)]));
  assert.ok(mins.morning > mins.evening && mins.evening > mins.desk, JSON.stringify(mins));
  assert.strictEqual(routineDurationSecs(ROUTINES[0]), ROUTINES[0].steps.reduce((a, s) => a + s.secs, 0));
  // desk routine: 60+60+45+60+30+60 = 315s -> 5 min
  assert.strictEqual(routineDurationMin(ROUTINES.find((r) => r.id === "desk")), 5);
});
check("i18n: EN and BN have identical key sets", () => {
  const en = Object.keys(I18N.en).sort(), bn = Object.keys(I18N.bn).sort();
  assert.deepStrictEqual(en, bn);
  for (const k of en) assert.ok(I18N.en[k] && I18N.bn[k], "empty string " + k);
});
check("categories cover all pose categories", () => {
  const used = new Set(POSES.map((p) => p.cat));
  for (const c of used) assert.ok(CATEGORIES.some((x) => x.id === c), c);
  assert.ok(CATEGORIES.some((c) => c.id === "all"));
});

/* ---- pure logic ---- */
check("bnDigits converts all digits", () => {
  assert.strictEqual(bnDigits("0123456789"), "০১২৩৪৫৬৭৮৯");
  assert.strictEqual(bnDigits("24 poses"), "২৪ poses");
  assert.strictEqual(fmtNum(12, "bn"), "১২");
  assert.strictEqual(fmtNum(12, "en"), "12");
});
check("dayKey formats local date", () => {
  assert.strictEqual(dayKey(new Date(2026, 10, 14)), "2026-11-14");
});
check("computeStreak: consecutive days, gap breaks, today missing counts yesterday", () => {
  assert.strictEqual(computeStreak([{ date: "2026-11-14" }, { date: "2026-11-13" }, { date: "2026-11-12" }], "2026-11-14"), 3);
  assert.strictEqual(computeStreak([{ date: "2026-11-14" }, { date: "2026-11-12" }], "2026-11-14"), 1);
  assert.strictEqual(computeStreak([{ date: "2026-11-13" }, { date: "2026-11-12" }], "2026-11-14"), 2);
  assert.strictEqual(computeStreak([], "2026-11-14"), 0);
  assert.strictEqual(computeStreak([{ date: "2026-11-10" }], "2026-11-14"), 0);
});
check("weekMinutes sums only last 7 days", () => {
  const log = [{ date: "2026-11-14", minutes: 10 }, { date: "2026-11-08", minutes: 20 }, { date: "2026-11-07", minutes: 30 }];
  assert.strictEqual(weekMinutes(log, "2026-11-14"), 30);
});
check("filterPoses: search, category, level, favourites", () => {
  assert.strictEqual(filterPoses(POSES, "", "all", 0, false, []).length, 24);
  assert.strictEqual(filterPoses(POSES, "", "standing", 0, false, []).length, 7);
  assert.strictEqual(filterPoses(POSES, "", "all", 1, false, []).length, 8);
  assert.ok(filterPoses(POSES, "tree", "all", 0, false, []).some((p) => p.id === "tree"));
  assert.ok(filterPoses(POSES, "বৃক্ষাসন", "all", 0, false, []).some((p) => p.id === "tree"));
  assert.ok(filterPoses(POSES, "Tadasana", "all", 0, false, []).some((p) => p.id === "mountain"));
  assert.strictEqual(filterPoses(POSES, "", "all", 0, true, ["tree", "cobra"]).length, 2);
  assert.strictEqual(filterPoses(POSES, "zzz-no-match", "all", 0, false, []).length, 0);
});
check("validateImport accepts good data, rejects bad, strips bad entries", () => {
  const good = { app: "yoga-bd", favourites: ["tree"], routines: [{ en: "Mine", steps: [{ pose: "cobra", secs: 30 }] }], log: [{ date: "2026-11-14", routine: "Morning", minutes: 12 }] };
  const v = validateImport(good);
  assert.ok(v && v.favourites.length === 1 && v.routines.length === 1 && v.log.length === 1);
  assert.strictEqual(validateImport({ app: "other" }), null);
  assert.strictEqual(validateImport(null), null);
  assert.strictEqual(validateImport("nope"), null);
  const mixed = validateImport({ app: "yoga-bd", favourites: ["tree", "nope"], routines: [{ en: "x", steps: [{ pose: "nope", secs: 30 }] }], log: [{ date: "bad", routine: "r", minutes: 5 }] });
  assert.deepStrictEqual(mixed.favourites, ["tree"]);
  assert.deepStrictEqual(mixed.routines, []);
  assert.deepStrictEqual(mixed.log, []);
});

/* ---- file wiring ---- */
check("index.html references only files that exist; no external URLs", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(!/https?:\/\//.test(html), "external URL in html");
  for (const f of ["css/tokens.css", "css/base.css", "css/style.css", "js/data.js", "js/app.js"])
    assert.ok(fs.existsSync(path.join(__dirname, "..", f)), "missing " + f);
  for (const src of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]))
    assert.ok(fs.existsSync(path.join(__dirname, "..", src)), "referenced file missing: " + src);
});
check("no external URLs in css/js", () => {
  for (const f of ["css/style.css", "js/data.js", "js/app.js"]) {
    const s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.ok(!/https?:\/\//.test(s), "external URL in " + f);
  }
});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

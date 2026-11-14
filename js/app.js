/* yoga-bd app logic. Offline, localStorage only, no network requests. */
"use strict";

/* Node (unit tests): data.js is a separate file; in the browser it loads first as a global.
   Use globalThis (no var/const declaration) so the browser's const POSES is not shadowed. */
if (typeof module !== "undefined" && typeof globalThis.POSES === "undefined") {
  globalThis.POSES = require("./data.js").POSES;
}

/* ---------- pure helpers (also unit-tested in Node) ---------- */
function bnDigits(s) {
  return String(s).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]);
}
function fmtNum(n, lang) { return lang === "bn" ? bnDigits(n) : String(n); }
function routineDurationSecs(routine) {
  return routine.steps.reduce((a, s) => a + (Number(s.secs) || 0), 0);
}
function routineDurationMin(routine) {
  return Math.max(1, Math.round(routineDurationSecs(routine) / 60));
}
function dayKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function computeStreak(log, todayStr) {
  const days = new Set(log.map((e) => e.date));
  if (!days.size) return 0;
  let cur = new Date(todayStr + "T12:00:00");
  if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}
function weekMinutes(log, todayStr) {
  const t = new Date(todayStr + "T12:00:00");
  const start = new Date(t); start.setDate(t.getDate() - 6);
  let m = 0;
  for (const e of log) {
    const d = new Date(e.date + "T12:00:00");
    if (d >= start && d <= t) m += e.minutes;
  }
  return m;
}
function filterPoses(poses, q, cat, level, favOnly, favs) {
  const needle = q.trim().toLowerCase();
  return poses.filter((p) => {
    if (cat !== "all" && p.cat !== cat) return false;
    if (level && p.level !== level) return false;
    if (favOnly && !favs.includes(p.id)) return false;
    if (!needle) return true;
    const hay = [p.en, p.bn, p.sanskrit, p.steps_en.join(" "), p.benefits_en.join(" "),
      p.steps_bn.join(" "), p.benefits_bn.join(" ")].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
function validateImport(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "yoga-bd") return null;
  const out = { favourites: [], routines: [], log: [] };
  if (Array.isArray(obj.favourites))
    out.favourites = obj.favourites.filter((x) => typeof x === "string" && POSES.some((p) => p.id === x));
  if (Array.isArray(obj.routines)) {
    for (const r of obj.routines) {
      if (!r || typeof r.en !== "string" || !Array.isArray(r.steps) || !r.steps.length) continue;
      const steps = r.steps.filter((s) => s && POSES.some((p) => p.id === s.pose) && Number(s.secs) >= 10 && Number(s.secs) <= 300);
      if (steps.length) out.routines.push({ id: "c-" + Date.now() + "-" + Math.floor(Math.random() * 1e6), en: r.en.slice(0, 60), bn: typeof r.bn === "string" ? r.bn.slice(0, 60) : "", steps });
    }
  }
  if (Array.isArray(obj.log)) {
    for (const e of obj.log) {
      if (e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.routine === "string" && Number(e.minutes) > 0 && Number(e.minutes) < 600)
        out.log.push({ date: e.date, routine: e.routine.slice(0, 80), minutes: Math.round(e.minutes) });
    }
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { bnDigits, fmtNum, routineDurationSecs, routineDurationMin, dayKey, computeStreak, weekMinutes, filterPoses, validateImport };
}

/* ---------- browser app ---------- */
if (typeof document !== "undefined") {
  const LS_KEY = "yoga-bd-v1";
  const LANG_KEY = "yoga-bd-lang";
  let lang = localStorage.getItem(LANG_KEY) || "en";
  if (lang !== "en" && lang !== "bn") lang = "en";

  let store = loadStore();
  function loadStore() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { favourites: [], routines: [], log: [] };
      const v = validateImport(JSON.parse(raw));
      return v || { favourites: [], routines: [], log: [] };
    } catch (e) { return { favourites: [], routines: [], log: [] }; }
  }
  function saveStore() { localStorage.setItem(LS_KEY, JSON.stringify({ app: "yoga-bd", ...store })); }

  const $ = (s) => document.querySelector(s);
  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  const poseById = (id) => POSES.find((p) => p.id === id);
  const allRoutines = () => [...ROUTINES, ...store.routines];
  const routineById = (id) => allRoutines().find((r) => r.id === id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let tab = "poses";
  let q = "", cat = "all", level = 0, favOnly = false;
  let openPose = null;
  let builder = [];
  let player = null; // {routine, idx, left, total, paused, timer}
  let soundOn = true;
  let audioCtx = null;

  function bell() {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 1.3);
    } catch (e) { /* audio unavailable: silent */ }
  }

  function render() {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
    $("#langToggle").textContent = lang === "en" ? "বাংলা" : "English";
    $("#tagline").textContent = t("tagline");
    $("#intro").textContent = t("intro");
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
      b.textContent = t("tab" + b.dataset.tab[0].toUpperCase() + b.dataset.tab.slice(1));
    });
    $("#safety").textContent = t("safety");
    $("#footerNote").textContent = t("footer");
    $("#view-poses").hidden = tab !== "poses";
    $("#view-routines").hidden = tab !== "routines";
    $("#view-practice").hidden = tab !== "practice";
    $("#view-data").hidden = tab !== "data";
    if (tab === "poses") renderPoses();
    if (tab === "routines") renderRoutines();
    if (tab === "practice") renderPractice();
    if (tab === "data") renderData();
  }

  function levelLabel(n) { return t("levelNames")[n] || ""; }

  function renderPoses() {
    $("#search").placeholder = t("searchPh");
    $("#search").value = q;
    const catSel = $("#catFilter"), lvlSel = $("#levelFilter");
    if (!catSel.options.length) {
      CATEGORIES.forEach((c) => { const o = document.createElement("option"); o.value = c.id; catSel.appendChild(o); });
      LEVELS.forEach((l) => { const o = document.createElement("option"); o.value = l.id; lvlSel.appendChild(o); });
    }
    [...catSel.options].forEach((o) => { o.textContent = (CATEGORIES.find((c) => c.id === o.value) || {}).en; });
    [...lvlSel.options].forEach((o) => { const l = LEVELS.find((x) => String(x.id) === o.value); o.textContent = l ? l.en : ""; });
    // option labels follow current language
    [...catSel.options].forEach((o) => { const c = CATEGORIES.find((x) => x.id === o.value); o.textContent = lang === "bn" ? c.bn : c.en; });
    [...lvlSel.options].forEach((o) => { const l = LEVELS.find((x) => String(x.id) === o.value); o.textContent = lang === "bn" ? l.bn : l.en; });
    catSel.value = cat; lvlSel.value = String(level);
    $("#favOnlyLabel").textContent = t("onlyFav");
    $("#favOnly").checked = favOnly;

    const list = filterPoses(POSES, q, cat, level, favOnly, store.favourites);
    $("#posesCount").textContent = t("posesCount").replace("{n}", fmtNum(list.length, lang));
    const grid = $("#poseGrid");
    grid.innerHTML = "";
    if (!list.length) { $("#emptyPoses").hidden = false; $("#emptyPoses").textContent = t("noPoses"); return; }
    $("#emptyPoses").hidden = true;
    for (const p of list) {
      const card = document.createElement("article");
      card.className = "pose-card";
      const fav = store.favourites.includes(p.id);
      card.innerHTML =
        '<button class="fav-btn" aria-label="' + esc(fav ? t("unfav") : t("fav")) + '">' + (fav ? "♥" : "♡") + "</button>" +
        '<h3>' + esc(lang === "bn" ? p.bn : p.en) + "</h3>" +
        '<p class="sans">' + esc(p.sanskrit) + " · " + esc(lang === "bn" ? p.en : p.bn) + "</p>" +
        '<p class="meta">' + esc(catLabel(p.cat)) + " · " + esc(levelLabel(p.level)) + " · " + esc(t("hold")) + " " + fmtNum(p.hold, lang) + " " + esc(t("sec")) + "</p>";
      card.querySelector(".fav-btn").addEventListener("click", (ev) => {
        ev.stopPropagation();
        store.favourites = fav ? store.favourites.filter((x) => x !== p.id) : [...store.favourites, p.id];
        saveStore(); renderPoses();
      });
      card.addEventListener("click", () => { openPose = p.id; renderDetail(); });
      grid.appendChild(card);
    }
    renderDetail();
  }
  function catLabel(id) { const c = CATEGORIES.find((x) => x.id === id); return c ? (lang === "bn" ? c.bn : c.en) : id; }

  function renderDetail() {
    const box = $("#poseDetail");
    if (!openPose) { box.hidden = true; box.innerHTML = ""; return; }
    const p = poseById(openPose);
    if (!p) { box.hidden = true; return; }
    const steps = lang === "bn" ? p.steps_bn : p.steps_en;
    const bens = lang === "bn" ? p.benefits_bn : p.benefits_en;
    const caution = lang === "bn" ? p.caution_bn : p.caution_en;
    box.hidden = false;
    box.innerHTML =
      '<button class="close-btn" id="closeDetail" aria-label="Close">×</button>' +
      "<h3>" + esc(lang === "bn" ? p.bn : p.en) + "</h3>" +
      '<p class="sans">' + esc(p.sanskrit) + " · " + esc(lang === "bn" ? p.en : p.bn) + "</p>" +
      '<p class="meta">' + esc(catLabel(p.cat)) + " · " + esc(levelLabel(p.level)) + " · " + esc(t("hold")) + " " + fmtNum(p.hold, lang) + " " + esc(t("sec")) + "</p>" +
      "<h4>" + esc(t("steps")) + "</h4><ol>" + steps.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ol>" +
      "<h4>" + esc(t("benefits")) + "</h4><ul>" + bens.map((s) => "<li>" + esc(s) + "</li>").join("") + "</ul>" +
      "<p class=\"caution\"><strong>" + esc(t("caution")) + ":</strong> " + esc(caution) + "</p>";
    $("#closeDetail").addEventListener("click", () => { openPose = null; renderDetail(); });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderRoutines() {
    $("#routinesTitle").textContent = t("routinesTitle");
    $("#routinesSub").textContent = t("routinesSub");
    $("#builtInLabel").textContent = t("builtIn");
    $("#buildCustomBtn").textContent = t("buildCustom");
    const wrap = $("#routineList");
    wrap.innerHTML = "";
    for (const r of allRoutines()) {
      const custom = r.id.startsWith("c-");
      const card = document.createElement("article");
      card.className = "routine-card";
      card.innerHTML =
        "<h3>" + esc(lang === "bn" ? (r.bn || r.en) : r.en) + "</h3>" +
        "<p>" + esc(lang === "bn" ? r.desc_bn : r.desc_en || "") + "</p>" +
        '<p class="meta">' + esc(t("stepsCount").replace("{n}", fmtNum(r.steps.length, lang))) + " · " + esc(t("duration").replace("{m}", fmtNum(routineDurationMin(r), lang))) + "</p>" +
        '<div class="row"><button class="btn primary start-btn">' + esc(t("start")) + "</button>" +
        (custom ? '<button class="btn danger del-btn">' + esc(t("deleteRoutine")) + "</button>" : "") + "</div>";
      card.querySelector(".start-btn").addEventListener("click", () => startRoutine(r.id));
      const del = card.querySelector(".del-btn");
      if (del) del.addEventListener("click", () => {
        if (!confirm(t("deleteRoutine") + "?")) return;
        store.routines = store.routines.filter((x) => x.id !== r.id);
        saveStore(); toast(t("routineDeleted")); renderRoutines();
      });
      wrap.appendChild(card);
    }
    renderBuilder();
  }

  function renderBuilder() {
    const box = $("#builder");
    $("#customName").placeholder = t("customNamePh");
    $("#addPoseBtn").textContent = t("addPose");
    $("#saveRoutineBtn").textContent = t("saveRoutine");
    $("#clearBuilderBtn").textContent = t("clearBuilder");
    const sel = $("#builderPose");
    if (!sel.options.length) {
      const o0 = document.createElement("option"); o0.value = ""; o0.textContent = t("choosePose"); sel.appendChild(o0);
      POSES.forEach((p) => { const o = document.createElement("option"); o.value = p.id; o.textContent = (lang === "bn" ? p.bn : p.en) + " (" + p.sanskrit + ")"; sel.appendChild(o); });
    }
    $("#holdLabel").textContent = t("holdSecs");
    const list = $("#builderSteps");
    list.innerHTML = "";
    if (!builder.length) { list.innerHTML = "<li class=\"muted\">" + esc(t("noStepsYet")) + "</li>"; return; }
    builder.forEach((s, i) => {
      const p = poseById(s.pose);
      const li = document.createElement("li");
      li.innerHTML = "<span>" + fmtNum(i + 1, lang) + ". " + esc(lang === "bn" ? p.bn : p.en) + " — " + fmtNum(s.secs, lang) + " " + esc(t("sec")) + "</span>" +
        '<button class="mini-btn" aria-label="Remove">×</button>';
      li.querySelector(".mini-btn").addEventListener("click", () => { builder.splice(i, 1); renderBuilder(); });
      list.appendChild(li);
    });
  }

  function renderPractice() {
    $("#practiceTitle").textContent = t("practiceTitle");
    const today = dayKey(new Date());
    const totalMin = store.log.reduce((a, e) => a + e.minutes, 0);
    $("#statSessions").textContent = fmtNum(store.log.length, lang);
    $("#statMinutes").textContent = fmtNum(totalMin, lang);
    $("#statStreak").textContent = fmtNum(computeStreak(store.log, today), lang);
    $("#statWeek").textContent = fmtNum(weekMinutes(store.log, today), lang);
    document.querySelectorAll("[data-stat]").forEach((el) => {
      el.previousElementSibling.textContent = t(el.dataset.stat);
    });
    const list = $("#sessionList");
    list.innerHTML = "";
    $("#recentLabel").textContent = t("recent");
    if (!store.log.length) { $("#emptyPractice").hidden = false; $("#emptyPractice").textContent = t("noSessions"); }
    else {
      $("#emptyPractice").hidden = true;
      [...store.log].reverse().slice(0, 10).forEach((e) => {
        const li = document.createElement("li");
        li.innerHTML = "<span>" + esc(e.date) + " — " + esc(e.routine) + "</span><strong>" + fmtNum(e.minutes, lang) + " " + esc(t("minutes")) + "</strong>";
        list.appendChild(li);
      });
    }
    $("#eraseLogBtn").textContent = t("eraseLog");
  }

  function renderData() {
    $("#dataTitle").textContent = t("dataTitle");
    $("#dataSub").textContent = t("dataSub");
    $("#exportBtn").textContent = t("exportBtn");
    $("#importBtn").textContent = t("importBtn");
    $("#eraseAllBtn").textContent = t("eraseAll");
  }

  /* ---------- session player ---------- */
  function startRoutine(id) {
    const r = routineById(id);
    if (!r) return;
    tab = "routines";
    player = { routine: r, idx: 0, left: r.steps[0].secs, paused: false, timer: null, done: false };
    render();
    showPlayer();
    bell();
    tick();
  }
  function showPlayer() {
    $("#player").hidden = false;
    $("#routineList").hidden = true;
    $("#builderWrap").hidden = true;
    $("#routinesSub").hidden = true;
    renderPlayerStep();
  }
  function hidePlayer() {
    $("#player").hidden = true;
    $("#routineList").hidden = false;
    $("#builderWrap").hidden = false;
    $("#routinesSub").hidden = false;
    if (player && player.timer) clearInterval(player.timer);
    player = null;
  }
  function renderPlayerStep() {
    const r = player.routine, step = r.steps[player.idx];
    const p = poseById(step.pose);
    $("#playerStep").textContent = t("playerStep").replace("{a}", fmtNum(player.idx + 1, lang)).replace("{b}", fmtNum(r.steps.length, lang));
    $("#playerPose").textContent = lang === "bn" ? p.bn : p.en;
    $("#playerSans").textContent = p.sanskrit;
    $("#playerTime").textContent = fmtNum(player.left, lang);
    $("#playerBar").style.width = (100 * (1 - player.left / step.secs)) + "%";
    const steps = lang === "bn" ? p.steps_bn : p.steps_en;
    $("#playerSteps").innerHTML = steps.map((s) => "<li>" + esc(s) + "</li>").join("");
    $("#pauseBtn").textContent = player.paused ? t("resume") : t("pause");
    $("#nextBtn").textContent = t("next");
    $("#prevBtn").textContent = t("prev");
    $("#skipBtn").textContent = t("skip");
    $("#finishBtn").textContent = t("finishEarly");
    $("#soundBtn").textContent = soundOn ? t("soundOn") : t("soundOff");
    $("#playerRoutineName").textContent = lang === "bn" ? (r.bn || r.en) : r.en;
  }
  function tick() {
    if (player.timer) clearInterval(player.timer);
    player.timer = setInterval(() => {
      if (player.paused || player.done) return;
      player.left--;
      if (player.left <= 0) { nextStep(true); return; }
      renderPlayerStep();
    }, 1000);
  }
  function nextStep(auto) {
    const r = player.routine;
    if (player.idx + 1 >= r.steps.length) { finishSession(); return; }
    player.idx++;
    player.left = r.steps[player.idx].secs;
    bell();
    renderPlayerStep();
  }
  function finishSession() {
    if (!player || player.done) return;
    player.done = true;
    clearInterval(player.timer);
    bell();
    const r = player.routine;
    const mins = routineDurationMin(r);
    store.log.push({ date: dayKey(new Date()), routine: lang === "bn" ? (r.bn || r.en) : r.en, minutes: mins });
    saveStore();
    const box = $("#player");
    box.innerHTML =
      '<p class="done-emoji" aria-hidden="true">✓</p>' +
      "<h3>" + esc(t("doneTitle")) + "</h3>" +
      "<p>" + esc(t("doneSub").replace("{m}", fmtNum(mins, lang))) + "</p>" +
      '<button class="btn primary" id="doneBack">' + esc(t("backToRoutines")) + "</button>";
    $("#doneBack").addEventListener("click", () => { location.reload(); });
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  /* ---------- events ---------- */
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
  $("#langToggle").addEventListener("click", () => {
    lang = lang === "en" ? "bn" : "en";
    localStorage.setItem(LANG_KEY, lang);
    render();
  });
  $("#search").addEventListener("input", (e) => { q = e.target.value; renderPoses(); });
  $("#catFilter").addEventListener("change", (e) => { cat = e.target.value; renderPoses(); });
  $("#levelFilter").addEventListener("change", (e) => { level = Number(e.target.value); renderPoses(); });
  $("#favOnly").addEventListener("change", (e) => { favOnly = e.target.checked; renderPoses(); });

  $("#buildCustomBtn").addEventListener("click", () => { $("#builder").hidden = false; $("#builder").scrollIntoView({ behavior: "smooth" }); });
  $("#addPoseBtn").addEventListener("click", () => {
    const id = $("#builderPose").value;
    const secs = Math.min(300, Math.max(10, Number($("#builderSecs").value) || 30));
    if (!id) return;
    builder.push({ pose: id, secs });
    renderBuilder();
  });
  $("#clearBuilderBtn").addEventListener("click", () => { builder = []; $("#customName").value = ""; renderBuilder(); });
  $("#saveRoutineBtn").addEventListener("click", () => {
    const name = $("#customName").value.trim();
    if (!name || !builder.length) { toast(t("noStepsYet")); return; }
    store.routines.push({ id: "c-" + Date.now(), en: name.slice(0, 60), bn: "", steps: builder.map((s) => ({ ...s })) });
    saveStore();
    builder = []; $("#customName").value = "";
    toast(t("routineSaved"));
    renderRoutines();
  });
  $("#eraseLogBtn").addEventListener("click", () => {
    if (!confirm(t("confirmErase"))) return;
    store.log = [];
    saveStore(); renderPractice();
  });
  $("#exportBtn").addEventListener("click", () => {
    const data = { app: "yoga-bd", exported: dayKey(new Date()), ...store };
    if (!store.favourites.length && !store.routines.length && !store.log.length) { toast(t("exportEmpty")); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "yoga-bd-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const v = validateImport(JSON.parse(rd.result));
        if (!v) { toast(t("importBad")); return; }
        store = { favourites: v.favourites, routines: [...store.routines, ...v.routines], log: [...store.log, ...v.log] };
        saveStore(); toast(t("importOk")); render();
      } catch (err) { toast(t("importBad")); }
    };
    rd.readAsText(f);
    e.target.value = "";
  });
  $("#eraseAllBtn").addEventListener("click", () => {
    const ans = prompt(t("eraseConfirm"));
    if (ans !== "DELETE") return;
    store = { favourites: [], routines: [], log: [] };
    saveStore(); toast(t("eraseDone")); render();
  });

  /* player buttons (delegated, present in DOM) */
  $("#pauseBtn").addEventListener("click", () => { if (!player) return; player.paused = !player.paused; renderPlayerStep(); });
  $("#nextBtn").addEventListener("click", () => { if (player && !player.done) nextStep(false); });
  $("#prevBtn").addEventListener("click", () => {
    if (!player || player.done) return;
    if (player.idx > 0) { player.idx--; player.left = player.routine.steps[player.idx].secs; renderPlayerStep(); }
  });
  $("#skipBtn").addEventListener("click", () => { if (player && !player.done) nextStep(false); });
  $("#finishBtn").addEventListener("click", () => { if (player && !player.done) finishSession(); });
  $("#soundBtn").addEventListener("click", () => { soundOn = !soundOn; renderPlayerStep(); });

  render();
}

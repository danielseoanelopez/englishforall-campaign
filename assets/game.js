/* Rank Up City — shared game engine.
   One engine for every building. A building is DATA: games/<id>.json (cast, scene, texts, stages, rounds)
   plus its audio clips (<audioPrefix><key>.mp3) and art. The page that loads this file says which
   building it is with <body data-game="cafe">, or game.html?b=cafe.

   Round types live in MECH at the bottom of the mechanics section. To add one, write
   build<Name>UI(R) and register it there; it gets the round object R and must end by calling
   succeed(R) or fail(R). Everything else (HUD, hearts, timer, Totti's judgment, summary, cards,
   progress, music) is shared.

   Round fields every type uses:  type, who, line, keys{line,retry,thanks[,twist]}, retryLine, thanks, par
   optional: sub, note, preIntro + preIntroKey, twist, trayLabel, countryThanks
     order    order[]            build the tray from the building's menu
     talk     options[], correct choose the reply
     compose  words[], answer, alts[], optional[]   tap word chips into a sentence
              (alts = other correct orders; optional = words the sentence is also correct without)
   Boss stages show the character's reply after each round and Totti's judgment once, at the end.

   Buildings 3–6 add (fields in studio/outlines/games-map.md §1b):
     clue, deduce, contradiction, timeline · lock, terminal, chart · say, fastear, onair · bestfit, spot, toast
   Stage modes: "chamber": {seconds, penalty, refill} = one countdown + digits + keypad (Vault);
                "air": N = one dead-air meter across the stage (Radio boss). Round "air" / "limit" = a meter for that round.
   Building options: "hint": {name, sub, img, pos, color, label, pre, post} replaces Enri as the hint giver;
                     scene.enri: false hides the sleeping Enri; a cast member with "sprite": false is never drawn in the scene;
                     "freePlay": true opens every stage (test buildings); text.selectLabel / startLabel / overTitle / coinLabel.
*/
(function () {
"use strict";

const WHATSAPP = "https://wa.me/5491123709477";
const qs = new URLSearchParams(location.search);
const GAME_ID = String(document.body.dataset.game || qs.get("b") || "cafe").toLowerCase().replace(/[^a-z0-9-]/g, "");

/* ============ PAGE SKELETON ============ */
document.body.insertAdjacentHTML("afterbegin",
  '<svg style="display:none" aria-hidden="true">' +
    '<symbol id="i-paw" viewBox="0 0 24 24"><ellipse cx="12" cy="15.5" rx="4.6" ry="4" fill="currentColor" stroke="none"/><circle cx="5.5" cy="11" r="2" fill="currentColor" stroke="none"/><circle cx="9.5" cy="7.5" r="2.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.5" r="2.1" fill="currentColor" stroke="none"/><circle cx="18.5" cy="11" r="2" fill="currentColor" stroke="none"/></symbol>' +
    '<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M10 2.5h4M12 2.5V6"/></symbol>' +
    '<symbol id="i-vol" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M16 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></symbol>' +
    '<symbol id="i-mute" viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></symbol>' +
    '<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5.5" y="11" width="13" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></symbol>' +
  '</svg>' +
  '<a class="map-btn" href="city.html">◀ CITY MAP</a>' +
  '<button class="mute-btn" id="muteBtn" title="Sound on/off" aria-label="Sound on/off"></button>' +
  /* iOS 17.4+ haptic bridge (Vibration API isn't exposed on Safari) */
  '<input type="checkbox" id="hapticSwitch" switch aria-hidden="true" tabindex="-1" style="position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none">' +
  '<label for="hapticSwitch" aria-hidden="true" style="position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none"></label>' +
  '<div class="cab">' +
    '<div class="marquee"><img src="logo.webp" alt="English for All — Rank Up"><div class="stage" id="marqueeTag">RANK UP CITY</div></div>' +
    '<div class="screen">' +
      '<div class="hud">' +
        '<span class="hearts" id="hudHearts"><ico-heart></ico-heart><ico-heart></ico-heart><ico-heart></ico-heart></span>' +
        '<span class="xp" id="hudXP">XP 0000</span>' +
        '<span class="coins" id="hudCoins">TIPS $0</span>' +
        '<span class="lvl" id="hudLvl">LVL</span>' +
      '</div>' +
      '<div id="stage"></div>' +
    '</div>' +
    '<div class="insert blink" id="insertLine"><ico-play></ico-play> INSERT KNOWLEDGE ◀</div>' +
  '</div>');

function ic(name, size) {
  const s = size || 17;
  return '<svg class="ic" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

/* ============ BUILDING DATA (filled by boot) ============ */
let G = null, MENU = [], CAST = {}, AVIMG = {}, STAGES = {}, ORDER = [], T = {};
const byId = id => MENU.find(m => m.id === id);
let spriteOverride = {};
function avaFile(ava) { return spriteOverride[ava] || AVIMG[ava]; }
function custFile(who) { return spriteOverride[who] || ("sprite-" + who + ".webp"); }

/* ============ PROGRESS ============ */
function loadProg() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(G.progKey) || "{}"); } catch (e) {}
  if (G.legacyBest) {
    const legacy = parseInt(localStorage.getItem(G.legacyBest) || "0", 10);
    if (legacy > 0 && !p[ORDER[0]]) { p[ORDER[0]] = { best: legacy }; saveProg(p); }
  }
  return p;
}
function saveProg(p) { localStorage.setItem(G.progKey, JSON.stringify(p)); }
function isUnlocked(sid) {
  const p = loadProg();
  const i = ORDER.indexOf(sid);
  if (i === 0 || G.freePlay) return true;
  if (STAGES[sid].boss) return ORDER.filter(s => !STAGES[s].boss).every(s => p[s]);   // the boss needs every regular stage
  return !!p[ORDER[i - 1]];
}
function maxPaws(sid) { return STAGES[sid].rounds.length * 3; }

/* ============ STATE ============ */
let S;
function resetState(sid) {
  S = { sid: sid, hearts: 3, xp: 0, coins: 0, pawsTotal: 0, round: 0, tries: 0,
        hints: 2, tray: [], twistShown: false,
        clock: 0, digits: [], airLeft: 0, airLocal: 0 };
  const st = STAGES[sid] || {};
  if (st.chamber) S.clock = st.chamber.seconds || 180;
  if (st.air) S.airLeft = st.air;
}

/* ============ AUDIO ============ */
let muted = false;
let AC = null;
const player = new Audio();
function duckMusic() { if (window.__ncMusic) { try { window.__ncMusic.volume = 0.09; } catch (e) {} } }
function unduckMusic() { if (window.__ncMusic) { try { window.__ncMusic.volume = window.__ncMusicVol || 0.3; } catch (e) {} } }
player.addEventListener("ended", unduckMusic);
player.addEventListener("pause", unduckMusic);
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
function tone(freq, dur, type, when, vol) {
  if (muted) return;
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.06, c.currentTime + (when || 0));
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (when || 0) + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + (when || 0)); o.stop(c.currentTime + (when || 0) + dur + 0.02);
  } catch (e) {}
}
/* haptics — navigator.vibrate on Android; iOS 17.4+ uses the hidden <input switch> bridge */
const hapticSwitch = document.getElementById("hapticSwitch");
function haptic(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  try { if (hapticSwitch) hapticSwitch.click(); } catch (e) {}
}
const blip   = () => tone(660, 0.07);
const coinFx = () => { tone(880, 0.09); tone(1320, 0.18, "square", 0.09); };
const buzz   = () => tone(140, 0.28, "sawtooth", 0, 0.08);
const purr   = () => { tone(220, 0.3, "sine", 0, 0.05); tone(196, 0.3, "sine", 0.15, 0.05); haptic([16, 34, 16, 34, 22]); };
const fanfare = () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "square", i * 0.13)); };

const TEXTS = {};
function speak(text) {
  if (muted || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*[^*]*\*/g, ""));
    u.lang = "en-US"; u.rate = 0.92;
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith("en"));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function stopVoice() {
  try { player.pause(); } catch (e) {}
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function say(key, text) {
  if (text) TEXTS[key] = text;
  if (muted || !key) return;
  stopVoice();
  player.src = G.audioPrefix + key + ".mp3";
  player.onerror = () => speak(TEXTS[key] || "");
  duckMusic();
  player.play().catch(() => speak(TEXTS[key] || ""));
}
if ("speechSynthesis" in window) speechSynthesis.getVoices();

const muteBtn = document.getElementById("muteBtn");
muteBtn.innerHTML = ic("vol", 20);
muteBtn.addEventListener("click", function () {
  muted = !muted;
  this.innerHTML = ic(muted ? "mute" : "vol", 20);
  if (muted) stopVoice();
});

/* ============ HELPERS ============ */
const stage = document.getElementById("stage");
function hud() {
  document.getElementById("hudHearts").innerHTML = "<ico-heart></ico-heart>".repeat(S.hearts) + "<ico-heartopen></ico-heartopen>".repeat(3 - S.hearts);
  document.getElementById("hudXP").textContent = "XP " + String(S.xp).padStart(4, "0");
  document.getElementById("hudCoins").textContent = (T.coinLabel || "TIPS") + " $" + S.coins;
}
function el(html) { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- player country (asked once by buildings with "askCountry", used in the "Where are you from?" rounds) ---------- */
const COUNTRIES = ["Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Costa Rica", "Cuba", "Dominican Republic", "Ecuador", "El Salvador",
  "Guatemala", "Honduras", "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru", "Puerto Rico", "Spain", "Uruguay", "Venezuela"];
let COUNTRY = "";
try { COUNTRY = localStorage.getItem("nc_country") || ""; } catch (e) {}
function cleanCountry(c) { return String(c || "").replace(/[^A-Za-zÀ-ÿ' -]/g, "").replace(/\s+/g, " ").trim().slice(0, 30); }
COUNTRY = cleanCountry(COUNTRY);
function countrySlug(c) { return c.toLowerCase().replace(/[^a-z]+/g, "-"); }
function fromCountry() { return COUNTRY === "Dominican Republic" ? "the Dominican Republic" : COUNTRY; }
function fillCountry(t) { return typeof t === "string" ? t.replace(/\{from\}/g, fromCountry()).replace(/\{country\}/g, COUNTRY) : t; }
function withCountry(R0) {
  if (!G.askCountry || JSON.stringify(R0).indexOf("{") < 0 || !COUNTRY) return R0;
  const R = Object.assign({}, R0, { keys: Object.assign({}, R0.keys) });
  ["line", "retryLine", "thanks"].forEach(k => { R[k] = fillCountry(R[k]); });
  if (R.options) R.options = R.options.map(fillCountry);
  if (R0.countryThanks) {
    if (COUNTRY === "Brazil") R.thanks = "No way! Brazil too! Cool.";
    // recorded for the listed countries; any other country falls back to the browser voice
    R.keys.thanks = R0.keys.thanks + "-" + (COUNTRIES.indexOf(COUNTRY) >= 0 ? countrySlug(COUNTRY) : "other-" + countrySlug(COUNTRY));
  }
  return R;
}
function pickCountry(done) {
  stage.innerHTML = '<div class="scene-tag">' + (T.setupTag || "PLAYER SETUP") + '</div>';
  stage.appendChild(bubble("dan", "One thing before your shift. Where are you from?"));
  const grid = el('<div class="country-grid"></div>');
  const choose = c => {
    c = cleanCountry(c); if (!c) return;
    COUNTRY = c; try { localStorage.setItem("nc_country", c); } catch (e) {}
    blip(); done();
  };
  COUNTRIES.forEach(c => {
    const b = el('<button class="opt country-opt"></button>'); b.textContent = c;
    b.addEventListener("click", () => choose(c)); grid.appendChild(b);
  });
  stage.appendChild(grid);
  const other = el('<form class="country-other"><input type="text" maxlength="30" placeholder="Another country…" aria-label="Another country" autocomplete="country-name">' +
    '<button class="btn cyan" type="submit">OK</button></form>');
  other.addEventListener("submit", e => { e.preventDefault(); choose(other.querySelector("input").value); });
  stage.appendChild(other);
}

/* a character with no portrait yet shows the first letter of the name */
function avaInner(c, big) {
  return avaFile(c.ava) ? '<img src="' + avaFile(c.ava) + '" alt="">' : '<span class="avin"' + (big ? ' style="font-size:1.15rem"' : '') + '>' + c.name.charAt(0) + '</span>';
}
function bubble(castKey, text, audioKey, subOverride) {
  const c = CAST[castKey];
  const r = el('<div class="row" style="--c:' + c.color + '">' +
    '<div class="ava">' + avaInner(c) + '</div>' +
    '<div class="bub"><div class="who">' + c.name + ' · ' + (subOverride || c.sub) + '</div><div class="say">' + text + '</div></div>' +
    (audioKey ? '<button class="replay" title="Listen again" aria-label="Listen again">' + ic("vol", 16) + '</button>' : "") +
  '</div>');
  if (audioKey) r.querySelector(".replay").addEventListener("click", () => say(audioKey, text));
  return r;
}
/* the hint giver: Enri by default; a building can name another one with "hint" (the Agency uses Totti's nose) */
function hintWho() {
  return Object.assign({ name: "ENRI", sub: "purr boost", img: "sprite-enri.webp", pos: "22% 40%", color: "#ff9d3d", label: "PURR BOOST" }, G.hint || {});
}
function hintLine(enriText, core) {
  if (!G.hint) return enriText;
  return (G.hint.pre || "") + core.charAt(0).toUpperCase() + core.slice(1) + (G.hint.post || "");
}
function enriBubble(text) {
  const h = hintWho();
  return el('<div class="row" style="--c:' + h.color + '">' +
    '<div class="ava"><img src="' + h.img + '" alt="" style="object-position:' + h.pos + '"></div>' +
    '<div class="bub"><div class="who">' + h.name + ' · ' + h.sub + '</div><div class="say">' + text + '</div></div></div>');
}
function pawRow(paws) {
  let s = '<div class="paws" style="color:var(--gold)">';
  for (let i = 0; i < 3; i++) s += i < paws ? ic("paw", 27) : '<span class="off">' + ic("paw", 27) + '</span>';
  return s + '</div>';
}
/* the scene: a picture (scene.bg, with the bar strip over the customer) or drawn art (scene.art, an inline SVG) */
function sceneHTML(custId) {
  const sc = G.scene || {};
  const bg = sc.bg ? ' style="background-image:url(\'' + sc.bg + '\')"' : "";
  return '<div class="scene-wrap"><div class="scene2' + (sc.class ? " " + sc.class : "") + '" role="img" aria-label="' + (sc.label || G.title) + '"' + bg + '>' +
    (sc.art || "") +
    (sc.customers !== false && custId && !(CAST[custId] && CAST[custId].sprite === false) ? '<img class="sc-cust cust" src="' + custFile(custId) + '" alt="">' : '') +
    (sc.bar ? '<div class="sc-bar"' + bg + '></div>' : '') +
    (sc.enri === false ? '' : '<img class="sc-enri" src="sprite-enri.webp" alt="">' +
    '<span class="zz sc-z1">z</span><span class="zz2 sc-z2">z</span>') +
    '<img class="sc-tot" src="sprite-totti.webp" alt="">' +
  '</div></div>';
}

let timerInt = null, tStart = 0;
function startTimer(par, anchor) {
  clearInterval(timerInt);
  if (!par || chamberOf()) { tStart = performance.now(); return; }   // chamber stages run one countdown instead
  const box = el('<div class="timer" id="timerBox">' + ic("clock", 14) + ' <span id="timerVal">0.0</span>s</div>');
  anchor.insertAdjacentElement("afterend", box);
  tStart = performance.now();
  timerInt = setInterval(() => {
    const b = document.getElementById("timerBox");
    if (!b) { clearInterval(timerInt); return; }
    const e = (performance.now() - tStart) / 1000;
    document.getElementById("timerVal").textContent = e.toFixed(1);
    b.style.color = e > par ? "var(--red)" : e > par * 0.66 ? "var(--gold)" : "var(--green)";
  }, 100);
}
function stopTimer() {
  clearInterval(timerInt);
  return (performance.now() - tStart) / 1000;
}

/* ============ SCREENS ============ */
function showTitle() {
  const p = loadProg();
  const total = ORDER.reduce((t, s) => t + (p[s] ? p[s].best : 0), 0);
  const totalMax = ORDER.reduce((t, s) => t + maxPaws(s), 0);
  stage.innerHTML =
    '<div class="center">' +
      '<div class="scene-tag">STREET VERSION · FREE PLAY</div>' +
      sceneHTML(null) +
      '<div class="title-big">' + G.title + '</div>' +
      '<p style="margin:10px 0 4px;">' + (T.tagline || "") + '</p>' +
      '<p class="es">' + (T.taglineEs || "") + '</p>' +
      (total > 0 ? '<p class="px" style="font-size:0.62rem; color:var(--gold); margin-top:12px;">' + (T.pawsLabel || "PAWS") + ': ' + total + '/' + totalMax + '</p>' : "") +
      '<div style="margin-top:18px;"><button class="btn" id="startBtn"><ico-play></ico-play> ' + (T.selectLabel || "SHIFT SELECT") + '</button></div>' +
      '<p class="es" style="margin-top:12px;">' + ic("vol", 14) + ' Mejor con sonido / best with sound on</p>' +
    '</div>';
  document.getElementById("startBtn").addEventListener("click", () => { blip(); showSelect(); });
}

function showSelect() {
  const p = loadProg();
  stage.innerHTML = '<div class="scene-tag">' + G.title + ' · ' + (T.selectLabel || "SHIFT SELECT") + '</div>';
  ORDER.forEach(sid => {
    const st = STAGES[sid];
    const open = isUnlocked(sid);
    const best = p[sid] ? p[sid].best : null;
    let pawHtml;
    if (best !== null) {
      const m = maxPaws(sid), r = best >= m ? 3 : best >= m * 0.66 ? 2 : best > 0 ? 1 : 0;
      pawHtml = "";
      for (let i = 0; i < 3; i++) pawHtml += i < r ? ic("paw", 16) : '<span class="off">' + ic("paw", 16) + '</span>';
    } else pawHtml = open ? '<span class="sh-new">NEW</span>' : "";
    const row = el('<div class="shift-row' + (open ? "" : " locked") + (st.boss ? " bossrow" : "") + '">' +
      '<div class="sh-num">' + (open ? st.num : ic("lock", 16)) + '</div>' +
      '<div class="sh-info"><div class="sh-name">' + st.name.toUpperCase() + '</div><div class="sh-tag">' + st.tag + '</div></div>' +
      '<div class="sh-paws">' + pawHtml + '</div>' +
    '</div>');
    if (open) row.addEventListener("click", () => { blip(); startStage(sid); });
    stage.appendChild(row);
  });
  const foot = el('<div class="actions" style="justify-content:center; margin-top:14px;">' +
    '<a class="btn cyan" href="city.html"><ico-city></ico-city> CITY MAP</a>' +
    '<a class="btn gold" href="' + WHATSAPP + '?text=' + encodeURIComponent("Hola Dan! 🎮 I'm playing " + G.title + " and I want my FREE trial lesson! 🚀") + '" target="_blank" rel="noopener"> FREE TRIAL LESSON</a></div>');
  stage.appendChild(foot);
  if (G.askCountry && COUNTRY) {
    const cf = el('<div class="country-foot"><button type="button"></button></div>');
    cf.querySelector("button").textContent = "From: " + COUNTRY + " · change";
    cf.querySelector("button").addEventListener("click", () => pickCountry(showSelect));
    stage.appendChild(cf);
  }
}

function startStage(sid) {
  if (G.askCountry && !COUNTRY) { pickCountry(() => startStage(sid)); return; }
  resetState(sid); hud();
  const st = STAGES[sid];
  spriteOverride = st.spriteOverride || {};
  document.getElementById("marqueeTag").textContent = "RANK UP CITY · STAGE " + st.num + " · " + st.name.toUpperCase();
  stage.innerHTML = '<div class="scene-tag">STAGE ' + st.num + ' · ' + st.name.toUpperCase() + '</div>';
  stage.appendChild(bubble("dan", st.intro, st.introKey));
  say(st.introKey, st.intro);

  if (st.tutorial) {
    const choices = el('<div class="actions" style="justify-content:flex-end; margin-top:14px;">' +
      '<button class="btn cyan" id="c1">I\'M READY!</button>' +
      '<button class="btn" id="c2">WAIT — WHAT DO I DO?</button></div>');
    stage.appendChild(choices);
    document.getElementById("c1").addEventListener("click", () => { blip(); startRound(0); });
    document.getElementById("c2").addEventListener("click", () => {
      blip(); choices.remove();
      stage.appendChild(bubble("dan", T.help, "dan-help"));
      say("dan-help", T.help);
      const go = el('<div class="actions" style="justify-content:flex-end; margin-top:14px;"><button class="btn cyan">OK — LET\'S GO!</button></div>');
      stage.appendChild(go);
      go.querySelector("button").addEventListener("click", () => { blip(); startRound(0); });
    });
  } else {
    const go = el('<div class="actions" style="justify-content:flex-end; margin-top:14px;"><button class="btn cyan"><ico-play></ico-play> ' + (T.startLabel || "START SHIFT") + '</button></div>');
    stage.appendChild(go);
    go.querySelector("button").addEventListener("click", () => { blip(); startRound(0); });
  }
}

function startRound(i) {
  const st = STAGES[S.sid];
  S.round = i; S.tries = 0; S.tray = []; S.twistShown = false;
  const R = withCountry(st.rounds[i]);
  const custSprite = R.who === "dan" ? null : R.who;
  stage.innerHTML = '<div class="scene-tag">ROUND ' + (i + 1) + ' OF ' + st.rounds.length + (st.boss ? " · <ico-warn></ico-warn> " + (T.bossTag || "BOSS") : "") + '</div>' + sceneHTML(custSprite);

  if (R.preIntro) {
    stage.appendChild(bubble("dan", R.preIntro, R.preIntroKey));
    TEXTS[R.preIntroKey] = R.preIntro;
  }
  stage.appendChild(bubble(R.who, R.line, R.keys.line, R.sub));
  if (R.note) stage.appendChild(el('<div class="note-board">' + R.note + '</div>'));

  (MECH[R.type] || MECH.talk)(R);
  if (chamberOf()) chamberRun();
  airRun(R);

  if (R.preIntro) { say(R.preIntroKey, R.preIntro); setTimeout(() => { if (S.round === i && S.sid === st.id) say(R.keys.line, R.line); }, 11000); }
  else say(R.keys.line, R.line);
}

/* ============ MECHANICS ============ */
/* Enri's hint button, shared by every round type. hintText() returns what he says; the bubble goes before `anchor()`. */
function wireHint(hintText, anchor) {
  const hintBtn = document.getElementById("hintBtn");
  if (S.hints <= 0) hintBtn.disabled = true;
  hintBtn.addEventListener("click", () => {
    if (S.hints <= 0) return;
    S.hints--; hintBtn.innerHTML = ic("paw", 15) + ' ' + hintWho().label + ' ×' + S.hints;
    if (S.hints <= 0) hintBtn.disabled = true;
    stage.insertBefore(enriBubble(hintText()), anchor());
    purr();
  });
}
const hintBtnHTML = () => '<button class="btn hint" id="hintBtn">' + ic("paw", 15) + ' ' + hintWho().label + ' ×' + S.hints + '</button>';
const trayEmpty = '<span class="es">empty / vacía</span>';

function sameOrder(tray, target) {
  if (tray.length !== target.length) return false;
  const count = a => a.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  const ct = count(tray), cg = count(target);
  return Object.keys(cg).every(k => ct[k] === cg[k]) && Object.keys(ct).every(k => cg[k]);
}
function orderText(target) {
  const count = target.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  return Object.keys(count).map(k => count[k] + "× " + byId(k).label).join(" · ");
}

/* order: build the tray from the menu */
function buildOrderUI(R) {
  const trayBox = el('<div class="tray"><div class="tl">' + (R.trayLabel || "YOUR TRAY") + ' <span class="es" style="text-transform:none;">· toca para quitar</span></div><div class="chips" id="trayChips">' + trayEmpty + '</div></div>');
  stage.appendChild(trayBox);

  const grid = el('<div class="menu-grid"></div>');
  MENU.forEach(m => {
    const c = el('<button class="chip"><img class="mimg" src="item-' + m.id + '.webp" alt=""> ' + m.label + '</button>');
    c.addEventListener("click", () => { blip(); S.tray.push(m.id); renderTray(); });
    grid.appendChild(c);
  });
  stage.appendChild(grid);

  stage.appendChild(el('<div class="actions">' + hintBtnHTML() + '<button class="btn serve" id="serveBtn"><ico-check></ico-check> SERVE</button></div>'));
  const serveBtn = document.getElementById("serveBtn");

  if (R.twist) {
    serveBtn.disabled = true;
    setTimeout(() => {
      if (!document.getElementById("serveBtn")) return;
      stage.insertBefore(bubble(R.who, R.twist, R.keys.twist, R.sub), document.querySelector(".tray"));
      tone(392, 0.12); tone(523, 0.12, "square", 0.12);
      say(R.keys.twist, R.twist);
      S.twistShown = true;
      document.getElementById("serveBtn").disabled = false;
      startTimer(R.par, stage.querySelector(".scene-tag"));
    }, 4200);
  } else {
    startTimer(R.par, stage.querySelector(".scene-tag"));
  }

  wireHint(() => hintLine("Prrrr... they want: " + orderText(R.order) + ". You didn't hear it from me. *goes back to sleep*", "they want: " + orderText(R.order) + "."), () => document.querySelector(".tray"));
  serveBtn.addEventListener("click", () => { if (sameOrder(S.tray, R.order)) succeed(R); else fail(R); });

  function renderTray() {
    const t = document.getElementById("trayChips");
    if (!S.tray.length) { t.innerHTML = trayEmpty; return; }
    t.innerHTML = "";
    S.tray.forEach((id, idx) => {
      const m = byId(id);
      const c = el('<button class="chip intray"><img class="mimg" src="item-' + m.id + '.webp" alt=""> ' + m.label + ' <ico-xmark></ico-xmark></button>');
      c.addEventListener("click", () => { blip(); S.tray.splice(idx, 1); renderTray(); });
      t.appendChild(c);
    });
  }
}

/* talk: choose the reply */
function buildTalkUI(R) {
  const opts = shuffled(R.options.map((t, i) => ({ t: t, ok: i === R.correct })));
  const wrap = el('<div style="margin-top:14px;"></div>');
  const letters = ["A", "B", "C", "D"];
  opts.forEach((o, i) => {
    const b = el('<button class="opt"><span class="ol">' + letters[i] + '</span>' + o.t + '</button>');
    b.addEventListener("click", () => {
      if (o.ok) succeed(R);
      else { b.classList.add("wrong"); fail(R); }
    });
    wrap.appendChild(b);
  });
  stage.appendChild(wrap);

  stage.appendChild(el('<div class="actions" style="justify-content:flex-start;">' + hintBtnHTML() + '</div>'));
  wireHint(() => hintLine('Prrrr... try saying: "' + R.options[R.correct] + '" ...you didn\'t hear it from me. *yawn*', R.hint || ('try: "' + R.options[R.correct] + '"')), () => wrap);

  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* compose: tap word chips into a sentence */
function composeAccepted(R) {
  let out = [R.answer].concat(R.alts || []).map(a => a.toLowerCase());
  (R.optional || []).forEach(o => { o = o.toLowerCase(); out = out.concat(out.map(a => a.split(" ").filter(w => w !== o).join(" "))); });
  return out;
}
function buildComposeUI(R, opt) {
  opt = opt || {};
  const pool = shuffled(R.words);
  S.tray = [];
  stage.appendChild(el('<div class="tray"><div class="tl">' + (opt.label || "YOUR MESSAGE") + ' <span class="es" style="text-transform:none;">· toca una palabra para quitarla</span></div><div class="chips" id="trayChips">' + trayEmpty + '</div></div>'));
  const grid = el('<div class="menu-grid" id="wordPool"></div>');
  stage.appendChild(grid);
  stage.appendChild(el('<div class="actions">' + hintBtnHTML() + '<button class="btn serve" id="serveBtn"><ico-check></ico-check> ' + (opt.send || "SEND") + '</button></div>'));

  function renderPool() {
    grid.innerHTML = "";
    pool.forEach((w, i) => {
      const used = S.tray.indexOf(i) !== -1;
      const c = el('<button class="chip"' + (used ? ' disabled style="opacity:.3"' : '') + '>' + w + '</button>');
      if (!used) c.addEventListener("click", () => { blip(); S.tray.push(i); renderPool(); renderTray(); });
      grid.appendChild(c);
    });
  }
  function renderTray() {
    const t = document.getElementById("trayChips");
    if (!S.tray.length) { t.innerHTML = trayEmpty; return; }
    t.innerHTML = "";
    S.tray.forEach((pi, idx) => {
      const c = el('<button class="chip intray">' + pool[pi] + ' <ico-xmark></ico-xmark></button>');
      c.addEventListener("click", () => { blip(); S.tray.splice(idx, 1); renderPool(); renderTray(); });
      t.appendChild(c);
    });
  }
  renderPool();

  wireHint(() => hintLine('Prrrr... it should read: "' + R.answer + '". You didn\'t hear it from me. *yawn*', R.hint || ('it should read: "' + R.answer + '"')), () => document.querySelector(".tray"));
  document.getElementById("serveBtn").addEventListener("click", () => {
    const got = S.tray.map(i => pool[i]).join(" ").toLowerCase();
    if (opt.check ? opt.check(got) : composeAccepted(R).indexOf(got) !== -1) succeed(R);
    else fail(R);
  });
  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* ============ MECHANICS FOR BUILDINGS 3–6 ============
   Agency (B1): clue, deduce, contradiction, timeline · Vault (B2): lock, terminal, chart + chamber mode
   Radio (C1): say, fastear, onair + broadcast mode · Hotel (C2): bestfit, spot, toast
   Field reference: studio/outlines/games-map.md §1b. */

/* a framed panel: a document, a piece of evidence, a door, a chart */
function panel(tag, html, cls) {
  return el('<div class="gpanel' + (cls ? " " + cls : "") + '"><div class="gp-tag">' + tag + '</div><div class="gp-body">' + html + '</div></div>');
}
/* a button that plays one recorded clip (<audioPrefix><key>.mp3; the browser voice reads `text` if the file is missing) */
function clipButton(key, text, label) {
  const b = el('<button type="button" class="btn cyan clip-play"><ico-play></ico-play> ' + (label || "PLAY") + '</button>');
  b.addEventListener("click", () => { say(key, text); });
  return b;
}
/* the answer buttons shared by every "choose one" round */
function optionsUI(R, hintCore) {
  const opts = shuffled(R.options.map((t, i) => ({ t: t, ok: i === R.correct })));
  const wrap = el('<div class="opts-wrap" style="margin-top:14px;"></div>');
  const letters = ["A", "B", "C", "D"];
  opts.forEach((o, i) => {
    const b = el('<button class="opt"><span class="ol">' + letters[i] + '</span>' + o.t + '</button>');
    b.addEventListener("click", () => {
      if (o.ok) succeed(R);
      else { b.classList.add("wrong"); fail(R); }
    });
    wrap.appendChild(b);
  });
  stage.appendChild(wrap);
  stage.appendChild(el('<div class="actions" style="justify-content:flex-start;">' + hintBtnHTML() + '</div>'));
  const core = R.hint || hintCore || ('the answer is: "' + R.options[R.correct] + '"');
  wireHint(() => hintLine('Prrrr... ' + core + ' ...you didn\'t hear it from me. *yawn*', core), () => wrap);
  startTimer(R.par, stage.querySelector(".scene-tag"));
  return wrap;
}

/* ---------- sentence check shared with the lessons (lesson.html trMatch): capitals, punctuation and contractions do not count ---------- */
function sNorm(s) { return String(s == null ? "" : s).toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[–—]/g, " ").replace(/[.,!?;:"“”()]/g, " ").replace(/\bcannot\b/g, "can not").replace(/\s+/g, " ").trim(); }
const S_PRON = /^(he|she|it|that|there|here|what|who|where|when|how|this|everyone|everybody|someone|somebody|nobody|everything|something|nothing)$/;
function sVariants(s) {
  const t = sNorm(s).replace(/\bwon't\b/g, "will not").replace(/\bcan't\b/g, "can not").replace(/\bshan't\b/g, "shall not").replace(/\blet's\b/g, "let us")
    .replace(/n't\b/g, " not").replace(/'m\b/g, " am").replace(/'re\b/g, " are").replace(/'ve\b/g, " have").replace(/'ll\b/g, " will");
  let out = [""];
  t.split(" ").forEach(w => {
    let alts = [w]; const m = w.match(/^(.+)'(s|d)$/);
    if (m && m[2] === "d") alts = [m[1] + " had", m[1] + " would"];
    else if (m && S_PRON.test(m[1])) alts = [m[1] + " is", m[1] + " has"];
    const next = []; out.forEach(o => alts.forEach(a => { if (next.length < 64) next.push((o ? o + " " : "") + a); })); out = next;
  });
  return out;
}
function sameSentence(input, answers) {
  const got = sVariants(input);
  return (answers || []).some(a => { const want = sVariants(a); return got.some(g => want.indexOf(g) !== -1); });
}

/* ---------- AGENCY ---------- */
/* clue: read a short document, answer one question about it.   doc{title,html}, q, options[], correct */
function buildClueUI(R) {
  stage.appendChild(panel('<ico-file></ico-file> ' + ((R.doc && R.doc.title) || "DOCUMENT"), (R.doc && R.doc.html) || "", "doc"));
  if (R.q) stage.appendChild(el('<p class="gq">' + R.q + '</p>'));
  optionsUI(R, "read it again. The answer is: \"" + R.options[R.correct] + "\"");
}
/* deduce: one piece of evidence, choose the deduction with the right strength (must / might / can't).   evidence, options[], correct */
function buildDeduceUI(R) {
  stage.appendChild(panel('<ico-search></ico-search> EVIDENCE', R.evidence || "", "evidence"));
  stage.appendChild(el('<p class="gq">' + (R.q || "What can you deduce?") + '</p>'));
  optionsUI(R, "how sure can you be? \"" + R.options[R.correct] + "\"");
}
/* contradiction: two statements and one piece of evidence; tap the statement that cannot be true.
   statements[2] ({who, text} or a string), evidence, correct (0 or 1) */
function buildContradictionUI(R) {
  stage.appendChild(panel('<ico-search></ico-search> EVIDENCE', R.evidence || "", "evidence"));
  stage.appendChild(el('<p class="gq">' + (R.q || "Which statement cannot be true?") + '</p>'));
  const wrap = el('<div class="opts-wrap stmts"></div>');
  (R.statements || []).forEach((s0, i) => {
    const s = typeof s0 === "string" ? { text: s0 } : s0;
    const c = s.who && CAST[s.who];
    const b = el('<button class="opt stmt"' + (c ? ' style="--c:' + c.color + '"' : "") + '>' + (c ? '<span class="ol">' + c.name + '</span>' : "") + '"' + s.text + '"</button>');
    b.addEventListener("click", () => { if (i === R.correct) succeed(R); else { b.classList.add("wrong"); fail(R); } });
    wrap.appendChild(b);
  });
  stage.appendChild(wrap);
  stage.appendChild(el('<div class="actions" style="justify-content:flex-start;">' + hintBtnHTML() + '</div>'));
  const bad = R.statements[R.correct]; const badText = typeof bad === "string" ? bad : bad.text;
  const core = R.hint || ('the evidence does not fit: "' + badText + '"');
  wireHint(() => hintLine('Prrrr... ' + core + ' *yawn*', core), () => wrap);
  startTimer(R.par, stage.querySelector(".scene-tag"));
}
/* timeline / toast: put the chips in order.   events[] (timeline) or parts[] (toast), given in the CORRECT order; optional clip + clipText */
function buildSequenceUI(R, cfg) {
  cfg = cfg || {};
  const items = R.events || R.parts || [];
  let pool = shuffled(items.map((t, i) => ({ t: t, i: i })));
  if (items.length > 1 && pool.every((p, k) => p.i === k)) pool.push(pool.shift());   // never hand it over already solved
  S.tray = [];
  if (R.clip) { const cp = panel('<ico-headphones></ico-headphones> ' + (cfg.clipTag || "STATEMENT"), "", "clip"); cp.querySelector(".gp-body").appendChild(clipButton(R.clip, R.clipText, "LISTEN")); stage.appendChild(cp); }
  stage.appendChild(el('<div class="tray seq"><div class="tl">' + (cfg.trayLabel || "IN ORDER") + ' <span class="es" style="text-transform:none;">· tap a line to take it out</span></div><div class="chips" id="trayChips">' + trayEmpty + '</div></div>'));
  const grid = el('<div class="seq-pool" id="wordPool"></div>');
  stage.appendChild(grid);
  stage.appendChild(el('<div class="actions">' + hintBtnHTML() + '<button class="btn serve" id="serveBtn"><ico-check></ico-check> ' + (cfg.send || "CONFIRM") + '</button></div>'));
  function renderPool() {
    grid.innerHTML = "";
    pool.forEach((p, k) => {
      if (S.tray.indexOf(k) !== -1) return;
      const c = el('<button class="chip seq-chip">' + p.t + '</button>');
      c.addEventListener("click", () => { blip(); S.tray.push(k); renderPool(); renderTray(); });
      grid.appendChild(c);
    });
  }
  function renderTray() {
    const t = document.getElementById("trayChips");
    if (!S.tray.length) { t.innerHTML = trayEmpty; return; }
    t.innerHTML = "";
    S.tray.forEach((k, idx) => {
      const c = el('<button class="chip intray seq-chip"><span class="seq-n">' + (cfg.labels ? cfg.labels[idx] || (idx + 1) : idx + 1) + '</span>' + pool[k].t + ' <ico-xmark></ico-xmark></button>');
      c.addEventListener("click", () => { blip(); S.tray.splice(idx, 1); renderPool(); renderTray(); });
      t.appendChild(c);
    });
  }
  renderPool();
  const core = R.hint || ('it starts with: "' + items[0] + '"');
  wireHint(() => hintLine('Prrrr... ' + core + ' *yawn*', core), () => document.querySelector(".tray"));
  document.getElementById("serveBtn").addEventListener("click", () => {
    const got = S.tray.map(k => pool[k].i);
    if (got.length === items.length && got.every((v, k) => v === k)) succeed(R); else fail(R);
  });
  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* ---------- VAULT ---------- */
/* lock: rewrite the sentence with word chips into the form the door accepts.   source, answer, alts[], words[] (or extra[] distractors) */
function buildLockUI(R) {
  stage.appendChild(panel('<ico-lock></ico-lock> ' + (R.doorTag || "THE DOOR READS"), '"' + R.source + '"' + (R.cue ? '<div class="gp-cue"><ico-shuffle></ico-shuffle> ' + R.cue + '</div>' : ""), "door"));
  const R2 = Object.assign({}, R, { words: R.words || R.answer.replace(/[.?!]$/, "").split(" ").concat(R.extra || []) });
  buildComposeUI(R2, { label: "YOUR VERSION", send: "UNLOCK", check: got => sameSentence(got, [R.answer].concat(R.alts || [])) });
}
/* terminal / fastear: play a recorded clip, choose the accurate report (terminal) or the full form (fastear).   clip, clipText, options[], correct */
function buildClipChoiceUI(R, cfg) {
  cfg = cfg || {};
  const cp = panel('<ico-headphones></ico-headphones> ' + (R.clipTag || cfg.tag || "RECORDED MESSAGE"), "", "clip");
  cp.querySelector(".gp-body").appendChild(clipButton(R.clip, R.clipText, cfg.play || "PLAY MESSAGE"));
  stage.appendChild(cp);
  if (R.q || cfg.q) stage.appendChild(el('<p class="gq">' + (R.q || cfg.q) + '</p>'));
  optionsUI(R, cfg.hint);
}
/* chart: read a small line chart, choose the sentence that describes it.   points[], labels[], title, unit, options[], correct */
function chartSVG(R) {
  const pts = R.points || [], n = pts.length, W = 320, H = 150, L = 34, Rm = 12, Tp = 14, B = 26;
  const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = (hi - lo) || 1;
  const x = i => L + (n > 1 ? i * (W - L - Rm) / (n - 1) : 0), y = v => Tp + (H - Tp - B) * (1 - (v - lo) / span);
  const line = pts.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
  let s = '<svg class="gchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (R.title || "chart") + '">';
  for (let g = 0; g <= 2; g++) { const gy = Tp + (H - Tp - B) * g / 2, gv = hi - span * g / 2; s += '<line class="gc-grid" x1="' + L + '" y1="' + gy + '" x2="' + (W - Rm) + '" y2="' + gy + '"/><text class="gc-ax" x="' + (L - 5) + '" y="' + (gy + 3) + '" text-anchor="end">' + Math.round(gv) + '</text>'; }
  s += '<polyline class="gc-line" points="' + line + '"/>';
  pts.forEach((v, i) => { s += '<circle class="gc-dot" cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3.2"/>'; if (R.labels && R.labels[i] != null) s += '<text class="gc-ax" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + R.labels[i] + '</text>'; });
  return s + '</svg>';
}
function buildChartUI(R) {
  stage.appendChild(panel('<ico-target></ico-target> ' + (R.title || "CHART") + (R.unit ? ' <span class="gp-unit">· ' + R.unit + '</span>' : ""), chartSVG(R), "chart"));
  stage.appendChild(el('<p class="gq">' + (R.q || "Which sentence describes the chart?") + '</p>'));
  optionsUI(R);
}

/* chamber mode (a stage with "chamber": {seconds, penalty, refill}): one countdown for the whole stage instead of a par per round.
   A wrong answer costs `penalty` seconds, not a heart; the heart goes when the clock runs out. Every round can carry a "digit";
   the stage ends at a keypad where the player enters them in order. */
let chInt = null;
function chamberOf() { return S && STAGES[S.sid] && STAGES[S.sid].chamber; }
function chamberCode() { return STAGES[S.sid].rounds.map(r => r.digit).filter(d => d != null).map(String); }
function chamberDraw() {
  const b = document.getElementById("chClock"); if (!b) return;
  const t = Math.max(0, Math.ceil(S.clock)), code = STAGES[S.sid].rounds.filter(r => r.digit != null);
  b.querySelector(".cd-t").textContent = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  b.querySelector(".cd-code").textContent = code.map(r => { const i = STAGES[S.sid].rounds.indexOf(r); return S.digits[i] != null ? S.digits[i] : "•"; }).join(" ");
  b.classList.toggle("low", S.clock <= 20);
}
function chamberRun() {
  clearInterval(chInt);
  const old = document.getElementById("chClock"); if (old) old.remove();
  const box = el('<div class="countdown" id="chClock">' + ic("clock", 14) + ' <span class="cd-t">0:00</span>' + (chamberCode().length ? ' <span class="cd-lbl">CODE</span> <span class="cd-code"></span>' : '<span class="cd-code" hidden></span>') + '</div>');
  stage.querySelector(".scene-tag").insertAdjacentElement("afterend", box);
  let last = performance.now(); chamberDraw();
  chInt = setInterval(() => {
    if (!document.getElementById("chClock")) { clearInterval(chInt); return; }
    const now = performance.now(); S.clock -= (now - last) / 1000; last = now;
    if (S.clock <= 0) { chamberTimeout(); return; }
    chamberDraw();
  }, 200);
}
function chamberStop() { clearInterval(chInt); }
function chamberTimeout() {
  const c = chamberOf(); clearInterval(chInt);
  S.hearts--; hud(); buzz();
  if (S.hearts <= 0) { showGameOver(); return; }
  S.clock = c.refill || 30;
  const tag = document.getElementById("chClock");
  if (tag) tag.insertAdjacentElement("afterend", el('<div class="note-board gnote">TIME OUT · one heart lost · the clock restarts at ' + (c.refill || 30) + ' seconds</div>'));
  chamberRun();
}
function showKeypad() {
  const st = STAGES[S.sid], c = chamberOf(), code = chamberCode().join("");
  let typed = "";
  stage.innerHTML = '<div class="scene-tag">' + st.name.toUpperCase() + ' · ' + (c.keypadTag || "THE KEYPAD") + '</div>';
  stage.appendChild(panel('<ico-key></ico-key> ' + (c.keypadTitle || "ENTER THE CODE"), '<div class="kp-display" id="kpDisplay"></div><div class="kp-grid" id="kpGrid"></div>', "keypad"));
  const draw = () => { document.getElementById("kpDisplay").textContent = (typed + "•".repeat(code.length)).slice(0, code.length).split("").join(" "); };
  const grid = document.getElementById("kpGrid");
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].forEach(k => {
    const b = el('<button type="button" class="kp-key' + (k === "OK" ? " ok" : "") + '">' + k + '</button>');
    b.addEventListener("click", () => {
      if (k === "⌫") { typed = typed.slice(0, -1); blip(); }
      else if (k === "OK") {
        if (typed === code) { chamberStop(); coinFx(); st.boss ? showVerdict() : showSummary(); return; }
        S.clock -= (c.penalty || 15); typed = ""; buzz();
        document.querySelector(".screen").classList.add("shake"); setTimeout(() => document.querySelector(".screen").classList.remove("shake"), 700);
      } else if (typed.length < code.length) { typed += k; blip(); }
      draw();
    });
    grid.appendChild(b);
  });
  draw(); chamberRun();
}
/* where a stage goes after its last round */
function endOfStage() {
  const st = STAGES[S.sid];
  if (chamberOf() && chamberCode().length) showKeypad();
  else if (st.boss) showVerdict();
  else showSummary();
}

/* ---------- RADIO ---------- */
/* the dead-air meter. Local: a round with "air" (onair) or "limit" (toast) seconds; when it empties the round is failed and the meter refills.
   Broadcast: a stage with "air": N runs one meter across all its rounds; a correct answer gives a little back; empty = off the air. */
let airInt = null;
function airStop() { clearInterval(airInt); }
function airRun(R) {
  airStop();
  const st = STAGES[S.sid], shared = !!st.air, total = shared ? st.air : (R.air || R.limit);
  if (!total) return;
  if (!shared) S.airLocal = total;
  const old = document.getElementById("airMeter"); if (old) old.remove();
  const box = el('<div class="airmeter" id="airMeter"><span class="am-lbl">' + (R.limit && !shared ? "TIME" : (T.airLabel || "ON AIR")) + '</span><span class="am-bar"><span class="am-fill"></span></span></div>');
  (document.getElementById("timerBox") || stage.querySelector(".scene-tag")).insertAdjacentElement("afterend", box);
  let last = performance.now();
  const draw = () => { const left = shared ? S.airLeft : S.airLocal, f = box.querySelector(".am-fill"); f.style.width = Math.max(0, left / total * 100) + "%"; box.classList.toggle("low", left / total < 0.3); };
  draw();
  airInt = setInterval(() => {
    if (!document.getElementById("airMeter")) { airStop(); return; }
    const now = performance.now(), d = (now - last) / 1000; last = now;
    if (shared) S.airLeft -= d; else S.airLocal -= d;
    if ((shared ? S.airLeft : S.airLocal) <= 0) {
      if (shared) { airStop(); showGameOver(T.deadAir || "Dead air. The station went silent. Take a breath and go again."); return; }
      S.airLocal = total; fail(R);
      if (S.hearts <= 0) { airStop(); return; }
    }
    draw();
  }, 100);
}

/* say: the player says a line. With speech recognition (Chrome, Edge, Android) the browser returns text and the round passes when
   enough target words match (minMatch, default 0.8), three tries. Without it (iPhone Safari, Firefox, no permission) the engine
   switches by itself to record mode: record, compare with the model, rate yourself (capped at 2 paws).
   target, accept[], minMatch, keys.model (the model clip) */
function wordsOf(s) { return sVariants(s)[0].replace(/'/g, "").split(" ").filter(Boolean); }
function matchRatio(heard, target) {
  const t = wordsOf(target), pool = wordsOf(heard); let hit = 0;
  t.forEach(w => { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } });
  return t.length ? hit / t.length : 0;
}
let sayHook = null;   // the open say round, for the test hook
function buildSayUI(R) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const targets = [R.target].concat(R.accept || []), min = R.minMatch || 0.8;
  const modelKey = (R.keys && R.keys.model) || null;
  let misses = 0, rec = null, done = false;
  const linePanel = panel('<ico-mic></ico-mic> ' + (R.sayTag || "YOUR LINE · SAY IT OUT LOUD"), '<span class="say-target">"' + R.target + '"</span>', "sayline");
  const model = clipButton(modelKey || ("say-model-" + S.sid + "-" + S.round), R.target, "HEAR IT"); model.classList.add("small");
  linePanel.querySelector(".gp-body").appendChild(model);
  stage.appendChild(linePanel);
  const box = el('<div class="saybox"><div class="say-main"></div><div class="say-status" id="sayStatus" aria-live="polite"></div><div class="say-foot es"></div></div>');
  stage.appendChild(box);
  const main = box.querySelector(".say-main"), status = box.querySelector(".say-status"), foot = box.querySelector(".say-foot");
  const pass = () => { if (done) return; done = true; sayHook = null; try { if (rec) rec.abort(); } catch (e) {} succeed(R); };
  function judge(alternatives) {
    let best = 0, bestText = alternatives[0] || "";
    alternatives.forEach(h => targets.forEach(t => { const r = matchRatio(h, t); if (r > best) { best = r; bestText = h; } }));
    if (best >= min) { pass(); return; }
    misses++; S.tries = Math.min(2, S.tries + 1); buzz();
    status.innerHTML = 'I heard: <b>"' + bestText + '"</b> · ' + Math.round(best * 100) + '% of the line.';
    if (misses >= 3) recordMode("Three tries used. Record it instead and rate yourself."); else status.innerHTML += ' ' + (3 - misses) + ' ' + (3 - misses === 1 ? "try" : "tries") + ' left.';
  }
  function voiceMode() {
    main.innerHTML = ""; const mic = el('<button type="button" class="btn serve mic" id="micBtn"><ico-mic></ico-mic> HOLD ON… SPEAK</button>');
    mic.innerHTML = '<ico-mic></ico-mic> TAP AND SPEAK'; main.appendChild(mic);
    foot.innerHTML = 'Your browser turns your voice into text (Chrome sends the audio to Google for this). <button type="button" class="linkbtn" id="toRecord">Use record mode instead</button>';
    foot.querySelector("#toRecord").addEventListener("click", () => recordMode());
    mic.addEventListener("click", () => {
      if (done) return;
      stopVoice();
      try {
        rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 4;
        rec.onresult = e => { const alts = []; for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript); judge(alts); };
        rec.onerror = e => {
          if (["not-allowed", "service-not-allowed", "network", "audio-capture", "language-not-supported"].indexOf(e.error) >= 0) recordMode("Voice check is not available here.");
          else status.textContent = "I didn't catch that. Tap and try again.";
        };
        rec.onend = () => { mic.disabled = false; mic.classList.remove("live"); mic.innerHTML = '<ico-mic></ico-mic> TAP AND SPEAK'; };
        mic.disabled = true; mic.classList.add("live"); mic.innerHTML = '<ico-mic></ico-mic> LISTENING…'; status.textContent = "";
        rec.start();
      } catch (e) { recordMode("Voice check is not available here."); }
    });
  }
  /* record mode: MediaRecorder when there is a microphone, otherwise just say it aloud; the player compares and rates */
  function recordMode(why) {
    try { if (rec) rec.abort(); } catch (e) {}
    main.innerHTML = ""; foot.innerHTML = "Record mode: nothing leaves your device. You compare your take with the model and rate it yourself (2 paws at most).";
    status.textContent = why || "";
    const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    let mine = null, stream = null, mr = null;
    const recBtn = el('<button type="button" class="btn serve mic"><ico-mic></ico-mic> ' + (canRec ? "RECORD" : "SAY IT ALOUD, THEN RATE") + '</button>');
    const play = el('<button type="button" class="btn cyan" disabled><ico-play></ico-play> MY TAKE</button>');
    const rate = el('<div class="say-rate" hidden><button type="button" class="btn serve" id="rateGood"><ico-check></ico-check> SOUNDS RIGHT</button><button type="button" class="btn gold" id="rateClose">CLOSE ENOUGH</button></div>');
    main.appendChild(recBtn); if (canRec) main.appendChild(play); main.appendChild(rate);
    const showRate = () => { rate.hidden = false; };
    const stopRec = () => { try { if (mr && mr.state !== "inactive") mr.stop(); } catch (e) {} };
    recBtn.addEventListener("click", () => {
      if (!canRec) { showRate(); return; }
      if (mr && mr.state === "recording") { stopRec(); return; }
      stopVoice();
      navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
        stream = s; const chunks = []; mr = new MediaRecorder(s);
        mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          if (mine) URL.revokeObjectURL(mine);
          mine = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
          play.disabled = false; recBtn.classList.remove("live"); recBtn.innerHTML = '<ico-mic></ico-mic> RECORD AGAIN';
          status.textContent = "Now listen to your take and to the model."; showRate();
        };
        mr.start(); recBtn.classList.add("live"); recBtn.innerHTML = '<ico-mic></ico-mic> STOP';
        setTimeout(stopRec, (R.maxSeconds || 8) * 1000);
      }).catch(() => { status.textContent = "No microphone here. Say the line aloud twice with the model, then rate yourself."; recBtn.disabled = true; showRate(); });
    });
    play.addEventListener("click", () => { if (!mine) return; stopVoice(); player.src = mine; player.onerror = null; player.play().catch(() => {}); });
    rate.querySelector("#rateGood").addEventListener("click", () => { S.tries = Math.max(S.tries, 1); pass(); });
    rate.querySelector("#rateClose").addEventListener("click", () => { S.tries = 2; pass(); });
  }
  sayHook = { heard: t => judge([t]), mode: () => (main.querySelector("#micBtn") ? "voice" : "record") };
  if (SR && qs.get("voice") !== "off") voiceMode(); else recordMode(SR ? "" : "This browser has no voice check, so you record instead.");
  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* ---------- HOTEL ---------- */
/* bestfit: a talk round where every option is correct English and one fits the guest's register and intent */
function buildBestFitUI(R) {
  stage.appendChild(el('<div class="note-board gnote">' + (R.fitNote || "Every reply is correct English. Which one fits this guest?") + '</div>'));
  optionsUI(R, "match the guest's register: \"" + R.options[R.correct] + "\"");
}
/* spot: tap the word (or words) that should go or are wrong.   text | words[], target[] (positions from 0), clean (adds "fine as it is"), fix */
function buildSpotUI(R) {
  const words = R.words ? R.words.slice() : String(R.text || "").trim().split(/\s+/);
  const target = (R.target || []).map(Number).sort((a, b) => a - b);
  let sel = [], clean = false;
  const need = Math.max(1, target.length);
  stage.appendChild(el('<div class="tray spot"><div class="tl">' + (R.spotLabel || "TAP WHAT SHOULD GO") + (target.length > 1 ? ' · ' + target.length + ' WORDS' : '') + '</div><div class="chips" id="spotLine"></div></div>'));
  const lineEl = document.getElementById("spotLine");
  let cleanBtn = null;
  function render() {
    lineEl.innerHTML = "";
    words.forEach((w, i) => {
      const c = el('<button type="button" class="chip spot-w' + (sel.indexOf(i) >= 0 ? " sel" : "") + '" aria-pressed="' + (sel.indexOf(i) >= 0) + '">' + w + '</button>');
      c.addEventListener("click", () => {
        blip(); clean = false;
        const at = sel.indexOf(i);
        if (at >= 0) sel.splice(at, 1);
        else if (need === 1) sel = [i];
        else if (sel.length < need) sel.push(i);
        render();
      });
      lineEl.appendChild(c);
    });
    if (cleanBtn) cleanBtn.classList.toggle("sel", clean);
  }
  if (R.clean) {
    cleanBtn = el('<button type="button" class="chip spot-clean"><ico-check></ico-check> FINE AS IT IS</button>');
    cleanBtn.addEventListener("click", () => { blip(); clean = !clean; sel = []; render(); });
    stage.querySelector(".tray.spot").appendChild(cleanBtn);
  }
  render();
  stage.appendChild(el('<div class="actions">' + hintBtnHTML() + '<button class="btn serve" id="serveBtn"><ico-check></ico-check> CHECK</button></div>'));
  const core = R.hint || (target.length ? 'look at "' + target.map(i => words[i]).join(" ") + '"' : "nothing needs to go");
  wireHint(() => hintLine('Prrrr... ' + core + '. *yawn*', core), () => document.querySelector(".tray"));
  document.getElementById("serveBtn").addEventListener("click", () => {
    const got = sel.slice().sort((a, b) => a - b);
    const ok = target.length ? (!clean && got.length === target.length && got.every((v, k) => v === target[k])) : (clean && !sel.length);
    if (ok) succeed(R); else fail(R);
  });
  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* round types — add new ones here (see the note at the top of the file) */
const MECH = {
  order: buildOrderUI, talk: buildTalkUI, compose: buildComposeUI,
  clue: buildClueUI, deduce: buildDeduceUI, contradiction: buildContradictionUI,
  timeline: R => buildSequenceUI(R, { trayLabel: "THE ORDER OF EVENTS" }),
  lock: buildLockUI,
  terminal: R => buildClipChoiceUI(R, { tag: "RECORDED MESSAGE", q: "Which report is accurate?" }),
  chart: buildChartUI,
  say: buildSayUI,
  fastear: R => buildClipChoiceUI(R, { tag: "FAST CLIP", play: "PLAY CLIP", q: "What are the full words?" }),
  onair: buildTalkUI,   // a talk round; its "air" seconds start the dead-air meter (see airRun)
  bestfit: buildBestFitUI, spot: buildSpotUI,
  toast: R => buildSequenceUI(R, { trayLabel: "YOUR ANSWER, IN ORDER", send: "SAY IT", labels: R.labels })
};

/* ============ JUDGMENT ============ */
function succeed(R) {
  const st = STAGES[S.sid];
  const elapsed = stopTimer();
  chamberStop(); airStop();
  if (chamberOf() && R.digit != null) S.digits[S.round] = R.digit;
  if (st.air) S.airLeft = Math.min(st.air, S.airLeft + (st.airBack == null ? 3 : st.airBack));   // a good answer buys a little air
  const bonus = (R.par && !chamberOf()) ? Math.min(25, Math.max(0, Math.round((R.par - elapsed) * 2))) : 0;
  const paws = Math.max(1, 3 - S.tries);
  const xp = st.boss ? paws * 15 : paws * 10;
  const tip = paws === 3 ? (st.boss ? 3 : 2) : 1;
  S.pawsTotal += paws; S.xp += xp + bonus; S.coins += tip; hud();
  coinFx(); if (st.boss) fanfare();
  if (bonus > 0) { tone(1568, 0.09); tone(2093, 0.14, "square", 0.09); }
  if (st.boss) showReply(R, xp, tip, bonus, elapsed);
  else showResult(R, paws, xp, tip, bonus, elapsed);
}

function fail(R) {
  const ch = chamberOf();
  S.tries++; buzz();
  if (ch) S.clock -= (ch.penalty || 15); else S.hearts--;
  hud();
  document.querySelector(".screen").classList.add("shake");
  setTimeout(() => document.querySelector(".screen").classList.remove("shake"), 700);
  if (S.hearts <= 0) { showGameOver(); return; }
  if (ch) { chamberDraw(); const cb = document.getElementById("chClock"); if (cb) { cb.classList.add("hit"); setTimeout(() => cb.classList.remove("hit"), 700); } }
  const anchor = document.querySelector(".tray") || document.querySelector(".opts-wrap") || document.querySelector(".saybox") || stage.children[2] || null;
  const bub = bubble(R.who, R.retryLine, R.keys.retry, R.sub);
  if (anchor) stage.insertBefore(bub, anchor); else stage.appendChild(bub);
  say(R.keys.retry, R.retryLine);
}

function showResult(R, paws, xp, tip, bonus, elapsed) {
  const st = STAGES[S.sid];
  haptic(paws >= 3 ? [12, 45, 12, 45, 90] : [50]);   // Totti's judgment buzz
  const quips = { 3: "...Acceptable. *slow blink of approval*", 2: "Adequate. I have seen worse.", 1: "*judges you silently* ...Next time, LISTEN." };
  const c = CAST[R.who];
  const speedLine = '<p class="px" style="font-size:0.62rem; color:' + (bonus > 0 ? "var(--gold)" : "var(--muted)") + '; margin-top:8px;">' + ic("clock", 13) + ' TIME ' + elapsed.toFixed(1) + 'S' + (bonus > 0 ? ' · <ico-bolt></ico-bolt> SPEED BONUS +' + bonus + ' XP' : '') + '</p>';
  stage.innerHTML =
    '<div class="scene-tag">ROUND COMPLETE</div>' +
    '<div class="center">' +
      '<div class="ava" style="--c:' + c.color + '; margin:8px auto; width:68px; height:68px;">' + avaInner(c, true) + '</div>' +
      '<p style="font-size:1rem; color:var(--muted); font-style:italic;">"' + R.thanks + '"</p>' +
      '<div class="ava" style="--c:var(--gold); margin:16px auto 7px; width:46px; height:46px;"><img src="sprite-totti.webp" alt="" style="object-position:42% 4%"></div>' +
      '<div class="px" style="font-size:0.62rem; color:var(--gold); letter-spacing:1px;">TOTTI\'S JUDGMENT</div>' +
      '<div style="margin:8px 0;">' + pawRow(paws) + '</div>' +
      '<p style="font-size:0.88rem; color:var(--muted); font-style:italic;">"' + quips[paws] + '"</p>' +
      '<p class="px" style="font-size:0.62rem; color:var(--green); margin-top:10px;">+$' + tip + ' TIP &nbsp; +' + xp + ' XP</p>' +
      (chamberOf() && R.digit != null ? '<p class="px digit-found">DIGIT FOUND · <b>' + R.digit + '</b></p>' : "") +
      (R.fix ? '<p class="fix-line"><ico-check></ico-check> ' + R.fix + '</p>' : "") +
      (chamberOf() ? "" : speedLine) +
    '</div>';
  say(R.keys.thanks, R.thanks);
  const next = S.round + 1 < st.rounds.length;
  const btn = el('<div class="center" style="margin-top:16px;"><button class="btn cyan">' + (next ? "<ico-play></ico-play> NEXT ROUND" : (chamberOf() && chamberCode().length ? "<ico-key></ico-key> TO THE KEYPAD" : "<ico-flag></ico-flag> " + (T.endLabel || "END SHIFT"))) + '</button></div>');
  stage.appendChild(btn);
  btn.querySelector("button").addEventListener("click", () => { blip(); next ? startRound(S.round + 1) : endOfStage(); });
}

/* boss stages: no judgment between questions — the character answers and the next question comes */
function showReply(R, xp, tip, bonus, elapsed) {
  const st = STAGES[S.sid];
  const next = S.round + 1 < st.rounds.length;
  stage.innerHTML = '<div class="scene-tag">ROUND ' + (S.round + 1) + ' OF ' + st.rounds.length + ' · <ico-check></ico-check> ANSWERED</div>' + sceneHTML(R.who === "dan" ? null : R.who);
  stage.appendChild(bubble(R.who, R.thanks, R.keys.thanks, R.sub));
  stage.appendChild(el('<p class="px center" style="font-size:0.62rem; color:var(--green); margin-top:4px;">+$' + tip + ' TIP &nbsp; +' + xp + ' XP' +
    (bonus > 0 ? ' &nbsp; <span style="color:var(--gold)"><ico-bolt></ico-bolt> +' + bonus + ' SPEED</span>' : '') +
    (chamberOf() && R.digit != null ? ' &nbsp; <span style="color:var(--gold)">DIGIT · ' + R.digit + '</span>' : '') + '</p>'));
  say(R.keys.thanks, R.thanks);
  const btn = el('<div class="center" style="margin-top:16px;"><button class="btn cyan">' + (next ? "<ico-play></ico-play> NEXT QUESTION" : (chamberOf() && chamberCode().length ? "<ico-key></ico-key> TO THE KEYPAD" : ic("paw", 15) + " TOTTI'S JUDGMENT")) + '</button></div>');
  stage.appendChild(btn);
  btn.querySelector("button").addEventListener("click", () => { blip(); next ? startRound(S.round + 1) : endOfStage(); });
}
/* Totti judges the whole boss stage once */
function showVerdict() {
  const st = STAGES[S.sid];
  const max = maxPaws(S.sid);
  const paws = S.pawsTotal >= max ? 3 : S.pawsTotal >= max * 0.66 ? 2 : 1;
  haptic(paws >= 3 ? [12, 45, 12, 45, 90] : [50]);
  const quips = { 3: "...Acceptable. *slow blink of approval*", 2: "Adequate. I have seen worse.", 1: "*judges you silently* ...Next time, LISTEN." };
  stopVoice();
  stage.innerHTML =
    '<div class="scene-tag">' + st.name.toUpperCase() + ' · COMPLETE</div>' +
    '<div class="center">' +
      '<div class="ava" style="--c:var(--gold); margin:14px auto 9px; width:68px; height:68px;"><img src="sprite-totti.webp" alt="" style="object-position:42% 4%"></div>' +
      '<div class="px" style="font-size:0.62rem; color:var(--gold); letter-spacing:1px;">TOTTI\'S JUDGMENT</div>' +
      '<div style="margin:10px 0;">' + pawRow(paws) + '</div>' +
      '<p style="font-size:0.88rem; color:var(--muted); font-style:italic;">"' + quips[paws] + '"</p>' +
      '<p class="px" style="font-size:0.62rem; color:var(--green); margin-top:12px;">PAWS ' + S.pawsTotal + '/' + max + '</p>' +
    '</div>';
  const btn = el('<div class="center" style="margin-top:16px;"><button class="btn cyan"><ico-flag></ico-flag> SEE RESULTS</button></div>');
  stage.appendChild(btn);
  btn.querySelector("button").addEventListener("click", () => { blip(); showSummary(); });
}

function showSummary() {
  fanfare();
  const st = STAGES[S.sid];
  const max = maxPaws(S.sid);
  const p = loadProg();
  const prev = p[S.sid] ? p[S.sid].best : 0;
  p[S.sid] = { best: Math.max(prev, S.pawsTotal) };
  saveProg(p); if (window.EFA) EFA.bumpStreak();

  const ratio = S.pawsTotal / max;
  const SC = G.summaryCards || {};
  let card;
  if (st.boss)            card = Object.assign({ rar: "<ico-star></ico-star> LEGENDARY <ico-star></ico-star>" }, SC.boss);
  else if (ratio >= 0.66) card = Object.assign({ rar: "◆ EPIC ◆" }, SC.epic);
  else                    card = Object.assign({ rar: "● COMMON ●" }, SC.common);

  const isBossWin = !!st.boss;
  const waMsg = encodeURIComponent("Hola Dan! 🎮 I finished stage " + st.num + " of " + G.title + " with " + S.pawsTotal + "/" + max + " paws 🐾 — I want to claim my FREE trial lesson! 🚀");
  const waLink = WHATSAPP + "?text=" + waMsg;

  stage.innerHTML =
    '<div class="scene-tag">' + (isBossWin ? "<ico-star></ico-star> BUILDING COMPLETE <ico-star></ico-star>" : "SHIFT COMPLETE · " + st.name.toUpperCase()) + '</div>' +
    '<div class="center"><div class="title-big" style="font-size:0.95rem;">' + (isBossWin ? (T.bossWinTitle || "BUILDING COMPLETE!") : "RANK UP!") + '</div></div>' +
    '<div class="stat-grid">' +
      '<div class="stat"><div class="sl">PAWS</div><div class="sv">' + S.pawsTotal + '/' + max + '</div></div>' +
      '<div class="stat"><div class="sl">TIPS</div><div class="sv">$' + S.coins + '</div></div>' +
      '<div class="stat"><div class="sl">XP</div><div class="sv">' + S.xp + '</div></div>' +
    '</div>' +
    '<p class="px center" style="font-size:0.62rem; color:var(--muted); letter-spacing:1px;">ENGLISH YOU USED TODAY</p>' +
    '<div class="wordchips">' + st.words.map(w => "<span>" + w + "</span>").join("") + '</div>' +
    '<div class="card-reveal">' +
      '<div class="rar">' + card.rar + '</div>' +
      '<div class="cface">' + (card.img ? '<img src="' + card.img + '" alt="" style="height:80px;">' : '<span style="font-size:4rem;line-height:1;color:var(--gold)"><ico-' + card.icon + ' style="margin:0"></ico-' + card.icon + '></span>') + '</div>' +
      '<div class="cname">' + card.name + '</div>' +
      '<div class="cquote">"' + card.quote + '"</div>' +
    '</div>';

  let danSay, danKey;
  if (isBossWin) {
    danSay = T.bossWin; danKey = T.bossWinKey || "sb-win";
  } else if (S.pawsTotal >= max * 0.75) {
    danSay = T.good || "Not bad, rookie. Not bad at ALL. Your prize is waiting — claim it!"; danKey = "dan-good";
  } else {
    danSay = T.ok || "Hey, that was hard! Run it back for a better card — or claim your prize anyway."; danKey = "dan-ok";
  }
  stage.appendChild(bubble("dan", danSay, danKey));
  say(danKey, danSay);

  const iNext = ORDER.indexOf(S.sid) + 1;
  const hasNext = !isBossWin && iNext < ORDER.length && isUnlocked(ORDER[iNext]);
  const acts = el('<div class="actions" style="justify-content:center; margin-top:14px;">' +
    (hasNext ? '<button class="btn serve" id="nextStageBtn"><ico-play></ico-play> NEXT SHIFT</button>' : '') +
    (isBossWin && G.exam ? '<a class="btn serve" href="' + G.exam.href + '"><ico-cap></ico-cap> ' + G.exam.label + '</a>' : '') +
    '<button class="btn cyan" id="selBtn">' + (T.selectLabel || "SHIFT SELECT") + '</button>' +
    '<a class="btn gold" href="cards.html"><ico-clone></ico-clone> CARD ALBUM</a>' +
    '<a class="btn" href="city.html"><ico-city></ico-city> CITY MAP</a>' +
    '<a class="btn gold" href="' + waLink + '" target="_blank" rel="noopener"><ico-star></ico-star> CLAIM FREE TRIAL LESSON</a>' +
    '<button class="btn" id="shareBtn"><ico-play></ico-play> SHARE SCORE</button></div>');
  stage.appendChild(acts);

  if (hasNext) document.getElementById("nextStageBtn").addEventListener("click", () => { blip(); startStage(ORDER[iNext]); });
  document.getElementById("selBtn").addEventListener("click", () => { blip(); showSelect(); });
  document.getElementById("shareBtn").addEventListener("click", async () => {
    blip();
    const txt = "I scored " + S.pawsTotal + "/" + max + " 🐾 on stage " + st.num + " of " + G.title + " — English for All · Rank Up! 🎮 Can you beat me? " + location.href.split("?")[0] + (document.body.dataset.game ? "" : "?b=" + GAME_ID);
    try {
      if (navigator.share) await navigator.share({ text: txt });
      else { await navigator.clipboard.writeText(txt); alert("Copied! / ¡Copiado!"); }
    } catch (e) {}
  });
}

function showGameOver(msg) {
  buzz(); stopTimer(); chamberStop(); airStop(); sayHook = null;
  stage.innerHTML =
    '<div class="center">' +
      '<div class="title-big" style="color:var(--red); text-shadow: 0 0 16px var(--red);">' + (T.overTitle || "SHIFT OVER") + '</div>' +
    '</div>';
  const danSay = (typeof msg === "string" && msg) || T.gameOver || "Take a breath and run it back. Enri believes in you. Probably.";
  const overKey = (typeof msg === "string" && msg) ? "dan-deadair" : "dan-over";   // the dead-air message has its own clip
  stage.appendChild(bubble("dan", danSay, overKey));
  say(overKey, danSay);
  const btn = el('<div class="actions" style="justify-content:center; margin-top:16px;">' +
    '<button class="btn cyan" id="retryBtn">↻ TRY AGAIN</button>' +
    '<button class="btn" id="selBtn2">' + (T.selectLabel || "SHIFT SELECT") + '</button></div>');
  stage.appendChild(btn);
  document.getElementById("retryBtn").addEventListener("click", () => { blip(); startStage(S.sid); });
  document.getElementById("selBtn2").addEventListener("click", () => { blip(); showSelect(); });
}

/* ============ BOOT ============ */
function boot(data) {
  G = data; MENU = G.menu || []; CAST = G.cast || {}; AVIMG = G.avatars || {}; STAGES = G.stages || {}; T = G.text || {};
  ORDER = G.order || Object.keys(STAGES);
  Object.keys(STAGES).forEach(k => { STAGES[k].id = k; });
  if (!document.body.dataset.game) document.title = G.title.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) + " — English for All · Rank Up";
  document.getElementById("marqueeTag").textContent = T.marquee || ("RANK UP CITY · " + G.title);
  document.getElementById("hudLvl").textContent = "LVL " + G.level;
  resetState(ORDER[0]); hud();
  const urlStage = qs.get("stage");
  if (urlStage && STAGES[urlStage] && isUnlocked(urlStage)) startStage(urlStage);
  else showTitle();
}
function loadFailed() {
  stage.innerHTML = '<div class="center" style="padding:30px 0;"><p>Could not load this building.<br><span class="es">No pude cargar este edificio. Revisa tu conexión.</span></p>' +
    '<div style="margin-top:16px;"><a class="btn cyan" href="city.html"><ico-city></ico-city> CITY MAP</a></div></div>';
}
fetch("games/" + GAME_ID + ".json", { cache: "no-cache" })
  .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(boot, loadFailed);

/* for building-specific add-ons and for testing */
window.RankUpGame = { id: GAME_ID, mechanics: MECH, get data() { return G; }, get state() { return S; },
  sameSentence: sameSentence, matchRatio: matchRatio,
  heard: function (text) { if (sayHook) sayHook.heard(text); },            // feed a transcript to the open "say" round
  sayMode: function () { return sayHook ? sayHook.mode() : null; } };

/* ============ MUSIC (shared with the city map: same key, same track position) ============ */
(function () {
  if (!window.Audio) return;
  var KEY = "nc_music";
  var on = (localStorage.getItem(KEY) || "on") === "on";
  var m = new Audio("efa-theme.mp3"); m.loop = true; m.preload = "none"; m.volume = 0.3;
  window.__ncMusic = m; window.__ncMusicVol = 0.3;
  var last = parseFloat(sessionStorage.getItem("nc_music_t") || "0");
  if (last > 0) { m.addEventListener("loadedmetadata", function () { try { m.currentTime = last % (m.duration || 1); } catch (e) {} }, { once: true }); }
  var btn = document.createElement("button");
  btn.className = "music-btn"; btn.title = "Music on/off"; btn.setAttribute("aria-label", "Music on/off");
  function draw() { btn.innerHTML = on ? "<ico-music></ico-music>" : "<ico-mute></ico-mute>"; btn.style.opacity = on ? "1" : "0.5"; }
  draw(); document.body.appendChild(btn);
  var started = false;
  function start() { if (started || !on) return; started = true; m.play().catch(function () { started = false; }); }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, start, { once: true, passive: true }); });
  btn.addEventListener("click", function (e) { e.stopPropagation(); on = !on; localStorage.setItem(KEY, on ? "on" : "off"); draw(); if (on) { started = true; m.play().catch(function () {}); } else { m.pause(); } });
  window.addEventListener("pagehide", function () { try { sessionStorage.setItem("nc_music_t", String(m.currentTime || 0)); } catch (e) {} });
})();
})();

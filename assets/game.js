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
  if (i === 0) return true;
  if (STAGES[sid].boss) return ORDER.filter(s => !STAGES[s].boss).every(s => p[s]);   // the boss needs every regular stage
  return !!p[ORDER[i - 1]];
}
function maxPaws(sid) { return STAGES[sid].rounds.length * 3; }

/* ============ STATE ============ */
let S;
function resetState(sid) {
  S = { sid: sid, hearts: 3, xp: 0, coins: 0, pawsTotal: 0, round: 0, tries: 0,
        hints: 2, tray: [], twistShown: false };
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
  document.getElementById("hudCoins").textContent = "TIPS $" + S.coins;
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
function enriBubble(text) {
  return el('<div class="row" style="--c:#ff9d3d">' +
    '<div class="ava"><img src="sprite-enri.webp" alt="" style="object-position:22% 40%"></div>' +
    '<div class="bub"><div class="who">ENRI · purr boost</div><div class="say">' + text + '</div></div></div>');
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
    (sc.customers !== false && custId ? '<img class="sc-cust cust" src="' + custFile(custId) + '" alt="">' : '') +
    (sc.bar ? '<div class="sc-bar"' + bg + '></div>' : '') +
    '<img class="sc-enri" src="sprite-enri.webp" alt="">' +
    '<span class="zz sc-z1">z</span><span class="zz2 sc-z2">z</span>' +
    '<img class="sc-tot" src="sprite-totti.webp" alt="">' +
  '</div></div>';
}

let timerInt = null, tStart = 0;
function startTimer(par, anchor) {
  clearInterval(timerInt);
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
      '<div style="margin-top:18px;"><button class="btn" id="startBtn"><ico-play></ico-play> SHIFT SELECT</button></div>' +
      '<p class="es" style="margin-top:12px;">' + ic("vol", 14) + ' Mejor con sonido / best with sound on</p>' +
    '</div>';
  document.getElementById("startBtn").addEventListener("click", () => { blip(); showSelect(); });
}

function showSelect() {
  const p = loadProg();
  stage.innerHTML = '<div class="scene-tag">' + G.title + ' · SHIFT SELECT</div>';
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
    const go = el('<div class="actions" style="justify-content:flex-end; margin-top:14px;"><button class="btn cyan"><ico-play></ico-play> START SHIFT</button></div>');
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
    S.hints--; hintBtn.innerHTML = ic("paw", 15) + ' PURR BOOST ×' + S.hints;
    if (S.hints <= 0) hintBtn.disabled = true;
    stage.insertBefore(enriBubble(hintText()), anchor());
    purr();
  });
}
const hintBtnHTML = () => '<button class="btn hint" id="hintBtn">' + ic("paw", 15) + ' PURR BOOST ×' + S.hints + '</button>';
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

  wireHint(() => "Prrrr... they want: " + orderText(R.order) + ". You didn't hear it from me. *goes back to sleep*", () => document.querySelector(".tray"));
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
  wireHint(() => 'Prrrr... try saying: "' + R.options[R.correct] + '" ...you didn\'t hear it from me. *yawn*', () => wrap);

  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* compose: tap word chips into a sentence */
function composeAccepted(R) {
  let out = [R.answer].concat(R.alts || []).map(a => a.toLowerCase());
  (R.optional || []).forEach(o => { o = o.toLowerCase(); out = out.concat(out.map(a => a.split(" ").filter(w => w !== o).join(" "))); });
  return out;
}
function buildComposeUI(R) {
  const pool = shuffled(R.words);
  S.tray = [];
  stage.appendChild(el('<div class="tray"><div class="tl">YOUR MESSAGE <span class="es" style="text-transform:none;">· toca una palabra para quitarla</span></div><div class="chips" id="trayChips">' + trayEmpty + '</div></div>'));
  const grid = el('<div class="menu-grid" id="wordPool"></div>');
  stage.appendChild(grid);
  stage.appendChild(el('<div class="actions">' + hintBtnHTML() + '<button class="btn serve" id="serveBtn"><ico-check></ico-check> SEND</button></div>'));

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

  wireHint(() => 'Prrrr... it should read: "' + R.answer + '". You didn\'t hear it from me. *yawn*', () => document.querySelector(".tray"));
  document.getElementById("serveBtn").addEventListener("click", () => {
    const got = S.tray.map(i => pool[i]).join(" ").toLowerCase();
    if (composeAccepted(R).indexOf(got) !== -1) succeed(R);
    else fail(R);
  });
  startTimer(R.par, stage.querySelector(".scene-tag"));
}

/* round types — add new ones here (see the note at the top of the file) */
const MECH = { order: buildOrderUI, talk: buildTalkUI, compose: buildComposeUI };

/* ============ JUDGMENT ============ */
function succeed(R) {
  const st = STAGES[S.sid];
  const elapsed = stopTimer();
  const bonus = Math.min(25, Math.max(0, Math.round((R.par - elapsed) * 2)));
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
  S.tries++; S.hearts--; hud(); buzz();
  document.querySelector(".screen").classList.add("shake");
  setTimeout(() => document.querySelector(".screen").classList.remove("shake"), 700);
  if (S.hearts <= 0) { showGameOver(); return; }
  const anchor = document.querySelector(".tray") || stage.children[2] || null;
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
      speedLine +
    '</div>';
  say(R.keys.thanks, R.thanks);
  const next = S.round + 1 < st.rounds.length;
  const btn = el('<div class="center" style="margin-top:16px;"><button class="btn cyan">' + (next ? "<ico-play></ico-play> NEXT ROUND" : "<ico-flag></ico-flag> END SHIFT") + '</button></div>');
  stage.appendChild(btn);
  btn.querySelector("button").addEventListener("click", () => { blip(); next ? startRound(S.round + 1) : showSummary(); });
}

/* boss stages: no judgment between questions — the character answers and the next question comes */
function showReply(R, xp, tip, bonus, elapsed) {
  const st = STAGES[S.sid];
  const next = S.round + 1 < st.rounds.length;
  stage.innerHTML = '<div class="scene-tag">ROUND ' + (S.round + 1) + ' OF ' + st.rounds.length + ' · <ico-check></ico-check> ANSWERED</div>' + sceneHTML(R.who === "dan" ? null : R.who);
  stage.appendChild(bubble(R.who, R.thanks, R.keys.thanks, R.sub));
  stage.appendChild(el('<p class="px center" style="font-size:0.62rem; color:var(--green); margin-top:4px;">+$' + tip + ' TIP &nbsp; +' + xp + ' XP' +
    (bonus > 0 ? ' &nbsp; <span style="color:var(--gold)"><ico-bolt></ico-bolt> +' + bonus + ' SPEED</span>' : '') + '</p>'));
  say(R.keys.thanks, R.thanks);
  const btn = el('<div class="center" style="margin-top:16px;"><button class="btn cyan">' + (next ? "<ico-play></ico-play> NEXT QUESTION" : ic("paw", 15) + " TOTTI'S JUDGMENT") + '</button></div>');
  stage.appendChild(btn);
  btn.querySelector("button").addEventListener("click", () => { blip(); next ? startRound(S.round + 1) : showVerdict(); });
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
    '<button class="btn cyan" id="selBtn">SHIFT SELECT</button>' +
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

function showGameOver() {
  buzz(); stopTimer();
  stage.innerHTML =
    '<div class="center">' +
      '<div class="title-big" style="color:var(--red); text-shadow: 0 0 16px var(--red);">SHIFT OVER</div>' +
    '</div>';
  const danSay = T.gameOver || "Take a breath and run it back. Enri believes in you. Probably.";
  stage.appendChild(bubble("dan", danSay, "dan-over"));
  say("dan-over", danSay);
  const btn = el('<div class="actions" style="justify-content:center; margin-top:16px;">' +
    '<button class="btn cyan" id="retryBtn">↻ TRY AGAIN</button>' +
    '<button class="btn" id="selBtn2">SHIFT SELECT</button></div>');
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
window.RankUpGame = { id: GAME_ID, mechanics: MECH, get data() { return G; }, get state() { return S; } };

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

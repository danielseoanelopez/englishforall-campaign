/* English for ALL · Rank Up — the big holo card that opens when you tap an album card.
   HoloCard.open({ card, building, detail, no, total })
     card     = the card from games/registry.json (id, name, rarity, img | icon + color, quote)
     building = its building (name, level, map.color)
     detail   = games/cards-detail.json › cards[id]  (optional: without it the card opens in a simpler "lite" version)
   Tap a phrase's speaker to hear it (the game's own recording if there is one, otherwise the device voice). */
(function () {
  "use strict";
  var RLABEL = { COMMON: "COMMON", RARE: "★ RARE ★<br>HOLO<br>EDITION", EPIC: "◆ EPIC ◆<br>HOLO<br>EDITION", LEGENDARY: "★ LEGEND ★<br>GOLD<br>FOIL", SECRET: "✦ SECRET ✦<br>RAINBOW<br>FOIL" };
  var CHIP = ["#00e5ff", "#ffc83d", "#ff3df0", "#3dffa0"];
  var player = new Audio();

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ico(n) { return n ? "<ico-" + n + "></ico-" + n + ">" : ""; }
  function stars(v) {
    if (typeof v !== "number") return '<span class="s max">' + esc(v) + "</span>";
    var on = Math.max(0, Math.min(5, v));
    return '<span class="s">' + "★".repeat(on) + '<span class="off">' + "★".repeat(5 - on) + "</span></span>";
  }
  function nameSize(name) {
    var s = String(name), n = s.length, w = Math.max.apply(null, s.split(/\s+/).map(function (x) { return x.length; }));
    var size = Math.max(3.4, Math.min(8.2, 44 / Math.max(n, 1)));
    return Math.min(size, 46 / Math.max(w, 1) - 0.4) + "cqi";   /* the longest word always fits on one line */
  }

  function say(text, audio, btn) {
    try { player.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    document.querySelectorAll(".hc-spk.on").forEach(function (b) { b.classList.remove("on"); });
    if (btn) btn.classList.add("on");
    var done = function () { if (btn) btn.classList.remove("on"); };
    if (audio) { player.src = audio; player.onended = done; player.play().catch(function () { tts(text, done); }); return; }
    tts(text, done);
  }
  function tts(text, done) {
    if (!window.speechSynthesis || !text) { done(); return; }
    var u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.9;
    var v = speechSynthesis.getVoices().filter(function (x) { return /^en(-|_)US/i.test(x.lang); })[0] || speechSynthesis.getVoices().filter(function (x) { return /^en/i.test(x.lang); })[0];
    if (v) u.voice = v;
    u.onend = done; u.onerror = done; speechSynthesis.speak(u);
  }
  function spk(text, audio) { return '<button type="button" class="hc-spk" data-say="' + esc(text) + '"' + (audio ? ' data-audio="' + esc(audio) + '"' : "") + ' aria-label="Listen">' + ico("volume") + "</button>"; }

  function art(card, d) {
    var bg = d && d.bg ? ' style="background-image:url(\'' + esc(d.bg) + '\')"' : "";
    var face = card.img ? '<img class="sprite" src="' + esc(card.img) + '" alt="' + esc(card.name) + '">'
      : '<span class="ficon" style="color:' + esc(card.color || "#00e5ff") + '">' + ico(card.icon || "star") + "</span>";
    return '<div class="hc-art"' + bg + ">" + face + '<div class="hc-no">No. ' + esc(card.__no) + "<b>" + esc(card.__lv) + "</b></div></div>";
  }

  function html(o) {
    var c = o.card, b = o.building || {}, d = o.detail, r = c.rarity || "COMMON";
    c.__no = String(o.no || 1).padStart(3, "0") + (o.total ? "/" + o.total : ""); c.__lv = (b.level || "") + " WORLD";
    var top = '<div class="hc-top">' +
      '<div class="hc-tag" style="--bc:' + esc((b.map && b.map.color) || "#00e5ff") + '"><b>' + esc(b.level || "") + "</b>" + esc((b.name || "").replace(/^THE /, "")) + "</div>" +
      '<div class="hc-title"><div class="hc-name" style="font-size:' + nameSize(c.name) + '">' + esc(c.name) + "</div>" + (d && d.subtitle ? '<div class="hc-sub">' + esc(d.subtitle) + "</div>" : "") + "</div>" +
      '<div class="hc-badge">' + (RLABEL[r] || esc(r)) + "</div></div>";
    var foot = function (quote) {
      return '<div class="hc-foot"><div class="hc-brand"><div class="b1">ENGLISH <em>for</em> ALL</div><div class="b2">★★★★★</div></div>' +
        '<div class="hc-quote">“' + esc(quote) + '”</div>' +
        (d && d.medal ? '<div class="hc-medal">' + (d.medal.img ? '<img src="' + esc(d.medal.img) + '" alt="">' : '<b class="mi">' + ico(d.medal.icon || "star") + "</b>") + "<span>" + esc(d.medal.label || "") + "</span></div>"
          : '<div class="hc-medal"><span style="position:static;background:none;font-size:5cqi;color:#5a3a00">' + ico("paw") + "</span></div>") + "</div>";
    };
    if (!d) {
      return '<div class="hc hc-lite r-' + esc(r) + '"><div class="hc-sheen"></div><div class="hc-in">' + top +
        '<div class="hc-mid" style="grid-template-columns:1fr">' + art(c, null) + "</div>" + foot(c.quote || "") + "</div></div>";
    }
    var prof = '<div class="hc-p cyan hc-prof"><div class="hc-h">' + esc(d.profileTitle || "CHARACTER PROFILE") + "</div>" + (d.profile || []).map(function (p) {
      return '<div class="hc-row"><span class="i">' + ico(p.icon) + '</span><span><span class="k">' + esc(p.k) + '</span><span class="v">' + esc(p.v) + "</span></span>" +
        (p.flag ? '<img class="flag" src="' + esc(p.flag) + '" alt="">' : "<span></span>") + "</div>";
    }).join("") + "</div>";
    var moves = (d.moves && d.moves.length) ? '<div class="hc-p mag"><div class="hc-h">' + esc(d.movesTitle || "KEY PHRASES + HOW TO BUILD THEM") + "</div>" + d.moves.map(function (m) {
      var SYM = /^[·→=\/>+|]$/, k = 0, prevChip = false;
      var build = (m.build || []).map(function (w) {
        if (SYM.test(String(w).trim())) { prevChip = false; return '<span class="pl sym">' + esc(w) + "</span>"; }
        var out = (prevChip ? '<span class="pl">+</span>' : "") + '<span class="ch" style="--cc:' + CHIP[k++ % CHIP.length] + '">' + esc(w) + "</span>";
        prevChip = true; return out;
      }).join("");
      return '<div class="hc-move"><span class="i">' + ico(m.icon) + '</span><div><div class="nm">' + esc(m.name) + '</div><div class="hc-build">' + build + "</div></div>" + spk(m.say, m.audio) + "</div>";
    }).join("") + "</div>" : "";
    var combo = d.combo ? '<div class="hc-p gold hc-combo"><div class="hc-h">COMBO · PUT IT TOGETHER</div><div class="chain">' +
      (d.combo.chips || []).map(function (x) { return '<span class="cc">' + esc(x) + "</span>"; }).join('<span class="gt">›</span>') + "</div>" +
      '<div class="line"><span>“' + esc(d.combo.line) + '”</span>' + spk(d.combo.line, d.combo.audio) + "</div>" +
      '<div class="lbl">' + esc(d.combo.label || "COMBO!") + "</div></div>" : "";
    var bot = '<div class="hc-bot">' +
      '<div class="hc-p gold"><div class="hc-h">POWER STATS</div>' + (d.stats || []).map(function (s) {
        return '<div class="hc-stat"><span class="i">' + ico(s.icon) + '</span><span class="k">' + esc(s.k) + "</span>" + stars(s.v) + "</div>";
      }).join("") + "</div>" +
      '<div class="hc-p purple"><div class="hc-h">LORE</div><div class="hc-lore">' + esc(d.lore || "") + "</div></div>" +
      '<div class="hc-p mag"><div class="hc-h">FUN FACTS</div>' + (d.facts || []).map(function (f) {
        return '<div class="hc-fact"><span class="i">' + ico(f.icon) + "</span><span>" + esc(f.t) + "</span></div>";
      }).join("") + "</div></div>";
    return '<div class="hc r-' + esc(r) + '"><div class="hc-sheen"></div><div class="hc-in">' + top +
      '<div class="hc-mid">' + art(c, d) + '<div class="hc-right">' + prof + moves + combo + "</div></div>" + bot + foot(d.quote || c.quote || "") + "</div></div>";
  }

  function tilt(cardEl) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function move(e) {
      var r = cardEl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      cardEl.style.setProperty("--mx", (x * 100) + "%"); cardEl.style.setProperty("--my", (y * 100) + "%");
      cardEl.style.setProperty("--ry", ((x - 0.5) * 10) + "deg"); cardEl.style.setProperty("--rx", ((0.5 - y) * 8) + "deg");
    }
    function reset() { cardEl.style.setProperty("--rx", "0deg"); cardEl.style.setProperty("--ry", "0deg"); }
    cardEl.addEventListener("pointermove", move); cardEl.addEventListener("pointerleave", reset); cardEl.addEventListener("pointerup", reset);
  }

  function open(o) {
    close();
    var m = document.createElement("div"); m.className = "hc-modal"; m.id = "hcModal";
    m.innerHTML = '<button type="button" class="hc-x" aria-label="Close">✕</button><div class="hc-stage">' + html(o) + "</div>";
    document.body.appendChild(m); document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(function () { m.classList.add("on"); });
    tilt(m.querySelector(".hc"));
    fitName(m);
    m.addEventListener("click", function (e) {
      var s = e.target.closest(".hc-spk"); if (s) { say(s.dataset.say, s.dataset.audio, s); return; }
      if (e.target === m || e.target.closest(".hc-x")) close();
    });
    document.addEventListener("keydown", onKey);
  }
  /* shrink the title until its longest word fits the space it really has (phones have a narrower title column) */
  function fitName(root) {
    var n = root.querySelector(".hc-name"); if (!n) return;
    var size = parseFloat(n.style.fontSize) || 8, guard = 0;
    while (n.scrollWidth > n.clientWidth + 1 && size > 2.4 && guard++ < 40) { size -= 0.25; n.style.fontSize = size + "cqi"; }
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function close() {
    var m = document.getElementById("hcModal"); if (!m) return;
    try { player.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    m.remove(); document.documentElement.style.overflow = ""; document.removeEventListener("keydown", onKey);
  }
  window.HoloCard = { open: open, close: close, html: html };
})();

/* ============================================================
   English for All · Rank Up — BUSINESS CLASS sidequest
   Shared framework for biz-l1..l4.
   Each page defines, BEFORE loading this file:
     window.BIZ_CONFIG = { key, name, exercises:[ids...] }
   Load order per page:  aos.js -> confetti.js -> biz.js
   ============================================================ */
(function () {
  "use strict";
  var CFG = window.BIZ_CONFIG || { key: "rankup_BIZ", name: "Business Lesson", exercises: [] };
  var EXERCISES = CFG.exercises;
  var TRACK = CFG.track || "Business Class";

  // ===== Arcade juice =====
  var muted = false;
  try { muted = localStorage.getItem("efa_muted") === "1"; } catch (e) {}
  var audioCtx = null;
  function beep(freq, dur, vol) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(); var g = audioCtx.createGain();
      o.type = "square"; o.frequency.value = freq; g.gain.value = vol || 0.035;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  function blip() { beep(660, 0.07); }
  function okBeep() { beep(784, 0.1, 0.04); }
  function noBeep() { beep(220, 0.18, 0.04); }
  function victory() { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 0.18, 0.045); }, i * 110); }); }
  window.toggleMute = function () {
    muted = !muted;
    try { localStorage.setItem("efa_muted", muted ? "1" : "0"); } catch (e) {}
    document.getElementById("muteBtn").textContent = muted ? "🔇" : "🔊";
    if (!muted) blip();
  };
  (function initMute() { var b = document.getElementById("muteBtn"); if (b) b.textContent = muted ? "🔇" : "🔊"; })();

  (function initSideDeco() {
    var items = ["★", "✦", "🎧", "💬", "🏆", "⭐", "📍", "🚀", "★", "✦"];
    var colors = ["#00e5ff", "#ff3df0", "#9d4dff", "#ffc83d"];
    ["decoLeft", "decoRight"].forEach(function (id) {
      var box = document.getElementById(id); if (!box) return;
      for (var i = 0; i < 8; i++) {
        var s = document.createElement("span");
        s.textContent = items[Math.floor(Math.random() * items.length)];
        s.style.left = (10 + Math.random() * 70) + "%";
        s.style.color = colors[Math.floor(Math.random() * colors.length)];
        s.style.animationDuration = (14 + Math.random() * 12) + "s";
        s.style.animationDelay = (-Math.random() * 22) + "s";
        box.appendChild(s);
      }
    });
  })();

  // ===== Contact links =====
  var SOCIAL = {
    whatsapp: "https://wa.me/5491123709477",
    instagram: "https://www.instagram.com/englishforall_dan/",
    linkedin: "https://www.linkedin.com/in/danielseoanelopez/",
    taplink: "https://englishforall.taplink.site",
    discord: "daniel.s.20"
  };
  var FORM_ENDPOINT = "https://formspree.io/f/mbdewbrp";
  (function initSocial() {
    document.querySelectorAll(".so-wa").forEach(function (a) { a.href = SOCIAL.whatsapp; });
    document.querySelectorAll(".so-ig").forEach(function (a) { a.href = SOCIAL.instagram; });
    document.querySelectorAll(".so-li").forEach(function (a) { a.href = SOCIAL.linkedin; });
    document.querySelectorAll(".so-tap").forEach(function (a) { a.href = SOCIAL.taplink; });
    document.querySelectorAll(".so-dc").forEach(function (a) { a.setAttribute("onclick", "return copyDiscord(this)"); a.title = "Discord: " + SOCIAL.discord + " (clic para copiar)"; });
  })();
  window.copyDiscord = function (el) {
    var r = el.innerHTML;
    var done = function () { el.innerHTML = '<i class="fa-solid fa-check"></i>' + (el.classList.contains("btn") ? " ¡COPIADO!" : ""); setTimeout(function () { el.innerHTML = r; }, 1500); };
    try { navigator.clipboard.writeText(SOCIAL.discord).then(done, done); } catch (e) { done(); }
    return false;
  };

  // ===== Generic reveal toggle =====
  window.toggleReveal = function (id, btn) {
    var el = document.getElementById(id);
    var open = el.classList.toggle("open");
    btn.textContent = open ? btn.dataset.hide : btn.dataset.show;
    blip();
  };

  // ===== Shuffle answer positions (anti memorize-the-slot) =====
  (function shuffleOptions() {
    document.querySelectorAll(".q[data-correct]").forEach(function (q) {
      var opts = Array.prototype.slice.call(q.querySelectorAll(".option"));
      for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
      opts.forEach(function (o) { q.appendChild(o); });
    });
  })();

  // ===== Scoring =====
  var scores = {}; // id -> {correct, total}
  window.checkExercise = function (exId) {
    var ex = document.getElementById(exId);
    var correct = 0, total = 0;
    ex.querySelectorAll(".q[data-correct]").forEach(function (q) {
      total++;
      var chosen = q.querySelector("input:checked");
      var val = chosen ? chosen.value : null;
      if (val === q.dataset.correct) correct++;
      q.querySelectorAll(".option").forEach(function (opt) {
        var inp = opt.querySelector("input");
        opt.classList.remove("opt-correct", "opt-wrong");
        var tick = opt.querySelector(".tick"); if (tick) tick.remove();
        if (inp.value === q.dataset.correct) {
          opt.classList.add("opt-correct");
          opt.insertAdjacentHTML("beforeend", '<span class="tick" style="color:var(--green)">✓</span>');
        } else if (inp.checked) {
          opt.classList.add("opt-wrong");
          opt.insertAdjacentHTML("beforeend", '<span class="tick" style="color:var(--red)">✗</span>');
        }
        inp.disabled = true;
      });
    });
    scores[exId] = { correct: correct, total: total };
    var box = document.getElementById("score-" + exId);
    var cls = correct === total ? "good" : (correct === 0 ? "bad" : "");
    box.innerHTML = '<span class="' + cls + '">' + correct + " / " + total + " correcto" + (total === 1 ? "" : "s") + "</span>" + (correct === total ? " 🎉 ¡Perfecto!" : "");
    ex.querySelector(".btn.check").disabled = true;
    if (correct === total) okBeep(); else noBeep();
    updateProgress();
  };

  function updateProgress() {
    var done = Object.keys(scores).length;
    document.getElementById("progressFill").style.width = (done / EXERCISES.length * 100) + "%";
    document.getElementById("progressLabel").textContent = done + " / " + EXERCISES.length + " retos";
  }

  // ===== Progress (standalone key) =====
  function saveStars(stars) {
    try {
      var prev = parseInt(localStorage.getItem(CFG.key) || "0", 10);
      if (stars > prev) localStorage.setItem(CFG.key, String(stars));
    } catch (e) {}
  }

  window.sendHomework = function (el) {
    var nf = document.getElementById("studentName");
    var name = (nf ? nf.value.trim() : "") || "Alumno/a";
    var msg = "¡Hola Daniel! Soy " + name + ". Terminé la lección \"" + CFG.name + "\" (" + TRACK + "). Te envío mi tarea: mi texto y un audio leyéndolo en voz alta.";
    el.href = SOCIAL.whatsapp + "?text=" + encodeURIComponent(msg);
    return true;
  };

  window.seeRank = function () {
    if (Object.keys(scores).length < EXERCISES.length) {
      document.getElementById("rankWarn").style.display = "block";
      for (var k = 0; k < EXERCISES.length; k++) { if (!scores[EXERCISES[k]]) { document.getElementById(EXERCISES[k]).scrollIntoView({ behavior: "smooth", block: "center" }); break; } }
      return;
    }
    var correct = 0, total = 0;
    EXERCISES.forEach(function (id) { correct += scores[id].correct; total += scores[id].total; });
    var pct = correct / total;
    var stars = 1;
    if (pct >= 0.9) stars = 5; else if (pct >= 0.75) stars = 4; else if (pct >= 0.6) stars = 3; else if (pct >= 0.4) stars = 2;
    saveStars(stars);
    document.getElementById("starRow").innerHTML = "⭐".repeat(stars) + '<span class="off">' + "⭐".repeat(5 - stars) + "</span>";
    document.getElementById("scoreText").textContent = "SCORE: " + correct + " / " + total;
    var studentName = (document.getElementById("studentName").value || "").trim() || "Alumno/a";
    var waMsg = "¡Hola Daniel! Soy " + studentName + ". Terminé la lección " + CFG.name + " (" + TRACK + "). Mi score: " + correct + "/" + total + " (" + stars + "⭐). Aquí van mi texto y mi audio:";
    document.getElementById("waCta").href = SOCIAL.whatsapp + "?text=" + encodeURIComponent(waMsg);
    try {
      fetch(FORM_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ _subject: TRACK + " — " + studentName, leccion: CFG.name, nombre: studentName, score: correct + "/" + total, estrellas: stars + "/5", fecha: new Date().toLocaleString() })
      }).catch(function () {});
    } catch (e) {}
    document.getElementById("finalRow").style.display = "none";
    document.getElementById("results").style.display = "block";
    document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.launchConfetti) window.launchConfetti();
    victory();
  };

  // ===== Confetti + AOS (CDN libs are loaded before this file) =====
  window.launchConfetti = function () {
    if (typeof confetti !== "function") return;
    var c = ["#00e5ff", "#ff3df0", "#9d4dff", "#ffc83d"];
    confetti({ particleCount: 140, spread: 90, startVelocity: 45, origin: { y: 0.3 }, colors: c, zIndex: 60 });
    setTimeout(function () { confetti({ particleCount: 90, angle: 60, spread: 75, origin: { x: 0, y: 0.65 }, colors: c, zIndex: 60 }); }, 150);
    setTimeout(function () { confetti({ particleCount: 90, angle: 120, spread: 75, origin: { x: 1, y: 0.65 }, colors: c, zIndex: 60 }); }, 300);
  };
  try {
    AOS.init({ duration: 700, once: true, offset: 40 });
    setTimeout(function () { document.querySelectorAll("[data-aos]:not(.aos-animate)").forEach(function (el) { el.classList.add("aos-animate"); }); }, 4000);
  } catch (e) {
    document.querySelectorAll("[data-aos]").forEach(function (el) { el.removeAttribute("data-aos"); });
  }
})();

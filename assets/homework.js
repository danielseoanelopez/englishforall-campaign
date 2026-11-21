/* English for ALL · Rank Up — in-lesson speaking recorder + writing check + "send to my teacher".
   No WhatsApp needed: the student records inside the lesson and the work goes straight to Dan's Google Drive
   (a Google Apps Script web app he owns). Nothing is sent until the student taps ENVIAR A MI PROFE.

   SET-UP: paste the web app URL (…/exec) into HW_ENDPOINT below. While it is empty, the lesson keeps the old
   WhatsApp button, and the recorder still works for self-practice (recordings stay on the device). */
(function () {
  "use strict";
  var HW_ENDPOINT = window.EFA_HW_ENDPOINT || "";   // ← paste your Apps Script web app URL, e.g. "https://script.google.com/macros/s/AKfy…/exec"
  var APP_TAG = "efa-hw-1";        // the script ignores anything without this tag
  var MAX_SEC = 60;                // longest take per recording

  var REC = {};                    // key -> { blob, mime, secs, label }
  var L = null, ON = false;
  var tr = function (es, en) { return (typeof T === "function") ? T(es, en) : es; };
  var canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  var player = new Audio();

  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function txt(s) { var d = document.createElement("div"); d.innerHTML = s; return (d.textContent || "").trim(); }
  function mmss(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function pickMime() {
    var c = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
    for (var i = 0; i < c.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c[i])) return c[i];
    return "";
  }

  /* ---------- the recorder widget ---------- */
  function recorder(key, label) {
    var box = el('<div class="rec-box">' +
      '<div class="rec-row">' +
        '<button type="button" class="rec-btn rec-main"><ico-mic></ico-mic> <span>' + tr("GRABAR", "RECORD") + '</span></button>' +
        '<button type="button" class="rec-btn rec-play" disabled><ico-play></ico-play> <span>' + tr("ESCUCHARME", "PLAY MINE") + '</span></button>' +
        '<button type="button" class="rec-btn rec-del" disabled aria-label="' + tr("Borrar", "Delete") + '"><ico-rotate></ico-rotate></button>' +
        '<span class="rec-time" aria-live="polite"></span>' +
      '</div>' +
      '<p class="rec-note"></p></div>');
    var main = box.querySelector(".rec-main"), play = box.querySelector(".rec-play"), del = box.querySelector(".rec-del");
    var time = box.querySelector(".rec-time"), note = box.querySelector(".rec-note");
    var mr = null, stream = null, t0 = 0, tick = 0, url = null;
    function setNote() {
      if (!canRec) { note.textContent = tr("Este navegador no puede grabar. Dilo en voz alta y grábalo en clase.", "This browser can't record. Say it aloud and we'll record it in class."); return; }
      note.innerHTML = REC[key]
        ? (ON ? '<ico-check></ico-check> ' + tr("Grabado. Se envía a tu profe con tu tarea.", "Recorded. It goes to your teacher with your homework.")
              : '<ico-check></ico-check> ' + tr("Grabado. Escúchate y compara con el modelo.", "Recorded. Listen and compare with the model."))
        : tr("Toca GRABAR, habla, y toca PARAR. Máximo " + MAX_SEC + " segundos.", "Tap RECORD, speak, then tap STOP. Up to " + MAX_SEC + " seconds.");
    }
    function stop() { try { if (mr && mr.state !== "inactive") mr.stop(); } catch (e) {} }
    main.addEventListener("click", function () {
      if (!canRec) return;
      if (mr && mr.state === "recording") { stop(); return; }
      player.pause();
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s; var chunks = [], mime = pickMime();
        mr = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          clearInterval(tick); stream.getTracks().forEach(function (t) { t.stop(); });
          var type = mr.mimeType || mime || "audio/mp4";
          var blob = new Blob(chunks, { type: type }), secs = (performance.now() - t0) / 1000;
          REC[key] = { blob: blob, mime: type, secs: secs, label: label };
          if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
          box.classList.remove("live"); box.classList.add("has");
          main.innerHTML = '<ico-mic></ico-mic> <span>' + tr("GRABAR OTRA VEZ", "RECORD AGAIN") + '</span>';
          play.disabled = false; del.disabled = false; time.textContent = mmss(secs); setNote(); refreshSend();
        };
        mr.start(); t0 = performance.now(); box.classList.add("live");
        main.innerHTML = '<ico-square></ico-square> <span>' + tr("PARAR", "STOP") + '</span>';
        time.textContent = "0:00";
        tick = setInterval(function () { var e = (performance.now() - t0) / 1000; time.textContent = mmss(e); if (e >= MAX_SEC) stop(); }, 250);
      }).catch(function () {
        note.textContent = tr("No hay permiso para el micrófono. Actívalo en Ajustes › Safari › Micrófono y vuelve a intentar.", "No microphone permission. Allow it in your browser settings and try again.");
      });
    });
    play.addEventListener("click", function () { if (!url) return; player.src = url; player.play().catch(function () {}); });
    del.addEventListener("click", function () {
      delete REC[key]; if (url) URL.revokeObjectURL(url); url = null;
      box.classList.remove("has"); play.disabled = true; del.disabled = true; time.textContent = "";
      main.innerHTML = '<ico-mic></ico-mic> <span>' + tr("GRABAR", "RECORD") + '</span>'; setNote(); refreshSend();
    });
    setNote();
    return box;
  }

  /* ---------- writing: live check against the lesson's own checklist ---------- */
  function alternatives(liHtml) {
    var d = document.createElement("div"); d.innerHTML = liHtml;
    var bs = d.querySelectorAll("b"), out = [];
    for (var i = 0; i < bs.length; i++) bs[i].textContent.split("/").forEach(function (p) {
      p = p.replace(/[….!?,:;]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/’/g, "'");
      if (p.length > 1) out.push(p);
    });
    return out;
  }
  function norm(s) { return " " + String(s || "").toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ") + " "; }
  function writingCheck(area, card) {
    var lis = card.querySelectorAll(".checklist li"), alts = [];
    for (var i = 0; i < lis.length; i++) alts.push(alternatives(lis[i].innerHTML));
    var out = el('<div class="w-check" aria-live="polite"></div>');
    area.insertAdjacentElement("afterend", out);
    function run() {
      var v = area.value, n = norm(v);
      var sentences = (v.match(/[^.!?]+[.!?]+/g) || []).filter(function (s) { return /[a-z]/i.test(s); }).length;
      if (v.trim() && !/[.!?]\s*$/.test(v.trim())) sentences++;
      var lowerI = /(^|[^a-z'])i('m|'ve|'d|'ll)?(?![a-z])/.test(v.replace(/I/g, "#"));
      var hit = 0, tested = 0;
      for (var k = 0; k < lis.length; k++) {
        if (!alts[k].length) continue; tested++;
        var ok = alts[k].some(function (a) { return n.indexOf(" " + a + " ") >= 0 || n.indexOf(" " + a) >= 0 && a.split(" ").length > 1; });
        lis[k].classList.toggle("auto-ok", ok); if (ok) hit++;
      }
      if (!v.trim()) { out.innerHTML = ""; return; }
      out.innerHTML =
        '<span class="wc ' + (sentences >= 3 ? "ok" : "") + '">' + sentences + " " + tr(sentences === 1 ? "frase" : "frases", sentences === 1 ? "sentence" : "sentences") + '</span>' +
        (tested ? '<span class="wc ' + (hit === tested ? "ok" : "") + '">' + hit + "/" + tested + " " + tr("puntos de la lista", "checklist points") + '</span>' : "") +
        '<span class="wc ' + (lowerI ? "bad" : "ok") + '">' + (lowerI ? tr("Ojo: <b>I</b> siempre en mayúscula", "Remember: <b>I</b> is always a capital") : tr("<b>I</b> en mayúscula", "Capital <b>I</b>") + " <ico-check></ico-check>") + '</span>';
      refreshSend();
    }
    area.addEventListener("input", run);
    try { var saved = localStorage.getItem("efa_w_" + (L && L.key)); if (saved && !area.value) { area.value = saved; } } catch (e) {}
    area.addEventListener("input", function () { try { localStorage.setItem("efa_w_" + (L && L.key), area.value); } catch (e) {} });
    run();
  }

  /* ---------- send ---------- */
  var sendBtn = null, sendStatus = null;
  function refreshSend() {
    if (!sendBtn) return;
    var w = document.getElementById("writingBox"), n = Object.keys(REC).length;
    var parts = [];
    if (w && w.value.trim()) parts.push(tr("tu escrito", "your writing"));
    if (n) parts.push(n + " " + tr(n === 1 ? "audio" : "audios", n === 1 ? "recording" : "recordings"));
    sendStatus.innerHTML = parts.length ? tr("Se envía: ", "Sending: ") + parts.join(" + ") + "." : tr("Escribe tu tarea y/o graba un audio para enviarla.", "Write your homework and/or record yourself to send it.");
    sendBtn.disabled = !parts.length;
  }
  function b64(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1] || ""); }; r.onerror = rej; r.readAsDataURL(blob); });
  }
  function send() {
    var nameEl = document.getElementById("studentName"), name = nameEl ? nameEl.value.trim() : "";
    if (!name) { sendStatus.innerHTML = '<span class="bad">' + tr("Escribe tu nombre arriba primero.", "Type your name above first.") + '</span>'; if (nameEl) nameEl.focus(); return; }
    var w = document.getElementById("writingBox");
    var keys = Object.keys(REC);
    sendBtn.disabled = true; sendStatus.textContent = tr("Enviando…", "Sending…");
    Promise.all(keys.map(function (k) { return b64(REC[k].blob); })).then(function (datas) {
      var payload = {
        app: APP_TAG, name: name, level: L.level, lesson: "L" + L.num + " · " + (L.titlePlain || ""), lessonKey: L.key,
        score: window.__efaScore || "", writing: w ? w.value : "",
        audios: keys.map(function (k, i) { return { label: REC[k].label, mime: REC[k].mime, secs: Math.round(REC[k].secs), data: datas[i] }; }),
        sentAt: new Date().toISOString()
      };
      return fetch(HW_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || "error");
      sendStatus.innerHTML = '<span class="good"><ico-check></ico-check> ' + tr("¡Enviado! Tu profe ya lo tiene. Lo vemos en clase.", "Sent! Your teacher has it. We'll go over it in class.") + '</span>';
      sendBtn.innerHTML = '<ico-check></ico-check> ' + tr("ENVIADO", "SENT");
      try { localStorage.removeItem("efa_w_" + L.key); } catch (e) {}
    }).catch(function () {
      sendBtn.disabled = false;
      sendStatus.innerHTML = '<span class="bad">' + tr("No se pudo enviar. Revisa tu conexión y vuelve a intentar.", "Couldn't send. Check your connection and try again.") + '</span>';
    });
  }

  /* ---------- wire it into the lesson ---------- */
  function init(lesson) {
    L = lesson; ON = !!HW_ENDPOINT; REC = {};
    var verbals = document.querySelectorAll("#lessonRoot .verbal");
    for (var i = 0; i < verbals.length; i++) {
      var q = verbals[i].querySelector(".vq");
      var label = "Speaking " + (i + 1) + (q ? " — " + txt(q.innerHTML).replace(/^Speaking:\s*/, "").slice(0, 60) : "");
      verbals[i].appendChild(recorder("speak" + i, label));
    }
    var area = document.getElementById("writingBox");
    if (area) {
      var card = area.closest(".card");
      writingCheck(area, card);
      var rb = recorder("reading", tr("Leyendo mi escrito", "Reading my writing"));
      rb.insertAdjacentHTML("afterbegin", '<p class="rec-title"><ico-mic></ico-mic> ' + tr("Grábate leyendo tu escrito", "Record yourself reading it") + '</p>');
      var hwNote = card.querySelector(".note.gold");
      card.insertBefore(rb, hwNote || null);
      if (ON && hwNote) hwNote.innerHTML = hwNote.innerHTML.replace(/por WhatsApp/gi, tr("con el botón ENVIAR A MI PROFE (abajo)", "with the SEND TO MY TEACHER button below")).replace(/on WhatsApp|via WhatsApp/gi, "with the SEND TO MY TEACHER button below");
    }
    if (ON) {
      var wa = document.getElementById("hwWa");
      if (wa) {
        var wrap = el('<div class="hw-send"><button type="button" class="btn hw-btn" id="hwSend"><ico-rocket></ico-rocket> ' + tr("ENVIAR A MI PROFE", "SEND TO MY TEACHER") + '</button>' +
          '<p class="hw-status es" aria-live="polite"></p>' +
          '<p class="hw-privacy es"><ico-lock></ico-lock> ' + tr("Va directo a tu profe, no por redes sociales. Los audios se borran después de corregirlos.", "It goes straight to your teacher, not through social media. Recordings are deleted after marking.") + '</p></div>');
        wa.parentNode.replaceWith(wrap);
        sendBtn = wrap.querySelector("#hwSend"); sendStatus = wrap.querySelector(".hw-status");
        sendBtn.addEventListener("click", send);
        var ct = document.getElementById("contactText");
        if (ct) ct.innerHTML = tr("Si no enviaste tu tarea, hazlo con <b>ENVIAR A MI PROFE</b> y la corregimos juntos. ¡Vas por buen camino!", "If you haven't sent your homework yet, use <b>SEND TO MY TEACHER</b> and we'll mark it together.");
        var waCta = document.getElementById("waCta"); if (waCta) waCta.style.display = "none";
        refreshSend();
      }
    }
  }
  window.HW = { init: init, enabled: function () { return !!HW_ENDPOINT; } };
})();

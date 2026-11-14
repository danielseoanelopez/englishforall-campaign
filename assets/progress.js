/* English for All · shared progress helpers (Academy + Rank Up City)
   - EFA.bumpStreak(): call when a shift or a lesson is completed (one count per day).
   - EFA.streakNow():  the streak to display (0 if the last play was before yesterday).
   - EFA.exportSave() / EFA.importSave(code): ONE save code for everything.
     Still reads the two older code formats (city v1, Academy rankup-only). Since 2026-11-14 the code also
     carries every other building's progress (any "<xx>_prog" key) in "g"; older pages ignore that field.
   - EFA.registry(): fetches games/registry.json (the buildings, their map spots, stages and cards).
     EFA.buildings(reg) adds prog / paws / done / open to each building; EFA.cardEarned(b, card). */
(function () {
  "use strict";
  function day(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function getJSON(k) { try { return JSON.parse(get(k) || "{}") || {}; } catch (e) { return {}; } }
  function keysWhere(test) { try { return Object.keys(localStorage).filter(test); } catch (e) { return []; } }
  function rankupKeys() { return keysWhere(function (k) { return k.indexOf("rankup_") === 0; }); }
  var PROG = /^[a-z]{2,8}_prog$/;   // one progress object per building: nc_prog, no_prog, da_prog, cv_prog, rt_prog, gh_prog…
  function progKeys() { return keysWhere(function (k) { return PROG.test(k) && k !== "lab_prog"; }); }

  function bumpStreak() {
    var s = getJSON("nc_streak"), today = day(new Date());
    if (s.last === today) return s;
    var yest = day(new Date(Date.now() - 86400000));
    s.count = (s.last === yest) ? (s.count || 0) + 1 : 1;
    s.last = today; s.best = Math.max(s.best || 0, s.count);
    set("nc_streak", JSON.stringify(s));
    return s;
  }
  function streakNow() {
    var s = getJSON("nc_streak"), today = day(new Date()), yest = day(new Date(Date.now() - 86400000));
    return (s.last === today || s.last === yest) ? (s.count || 0) : 0;
  }

  function b64(json) { return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(json))); }
  function unb64(code) { var bin = atob(String(code).trim()); return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); })); }

  function hasProgress() {
    return rankupKeys().length > 0 || progKeys().some(function (k) { return Object.keys(getJSON(k)).length > 0; });
  }
  function exportSave() {
    var r = {}, g = {};
    rankupKeys().forEach(function (k) { r[k] = get(k); });
    progKeys().forEach(function (k) { if (k !== "nc_prog" && k !== "no_prog") g[k] = getJSON(k); });
    // v stays 2: older pages read r, p, o, s and c, and skip g
    return b64(JSON.stringify({ v: 2, r: r, p: getJSON("nc_prog"), o: getJSON("no_prog"), g: g, s: getJSON("nc_streak"), c: get("nc_country") || "" }));
  }
  /* Returns how many records were restored; throws if the code is not valid. */
  function importSave(code) {
    var d = JSON.parse(unb64(code)), n = 0;
    if (!d || typeof d !== "object") throw new Error("bad code");
    var r = d.v === 2 ? d.r : (d.p || d.o ? null : d);   // old Academy codes are a plain { rankup_*: stars } object
    if (r && typeof r === "object") Object.keys(r).forEach(function (k) {
      if (k.indexOf("rankup_") === 0 && /^[\w-]{1,60}$/.test(k)) { set(k, String(r[k]).slice(0, 400)); n++; }
    });
    if (d.p && typeof d.p === "object") { set("nc_prog", JSON.stringify(d.p)); n++; }
    if (d.o && typeof d.o === "object") { set("no_prog", JSON.stringify(d.o)); n++; }
    if (d.g && typeof d.g === "object") Object.keys(d.g).forEach(function (k) {
      if (PROG.test(k) && d.g[k] && typeof d.g[k] === "object") { set(k, JSON.stringify(d.g[k]).slice(0, 2000)); n++; }
    });
    if (d.s && typeof d.s === "object") set("nc_streak", JSON.stringify(d.s));
    if (typeof d.c === "string" && d.c) set("nc_country", d.c.replace(/[^A-Za-zÀ-ÿ -]/g, "").slice(0, 30));
    if (!n) throw new Error("empty code");
    return n;
  }

  /* ---------- the building registry ---------- */
  var regPromise = null;
  function registry() {
    if (!regPromise) regPromise = fetch("games/registry.json").then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); });
    return regPromise;
  }
  function bossOf(b) { return b.stages.filter(function (s) { return s.boss; })[0] || b.stages[b.stages.length - 1]; }
  function buildings(reg) {
    var B = reg.buildings;
    B.forEach(function (b) {
      b.prog = getJSON(b.progKey);
      b.paws = b.stages.reduce(function (t, s) { return t + (b.prog[s.id] ? b.prog[s.id].best || 0 : 0); }, 0);
      b.maxPaws = b.stages.reduce(function (t, s) { return t + (s.max || 15); }, 0);
      b.boss = bossOf(b);
      b.done = !!b.prog[b.boss.id];
    });
    B.forEach(function (b) {
      var after = b.opensAfter ? B.filter(function (x) { return x.id === b.opensAfter; })[0] : null;
      b.open = !!b.ready && (!after || after.done);
    });
    return B;
  }
  function cardEarned(b, c) {
    var p = b.prog[c.stage];
    if (!p) return false;
    if (!c.perfect) return true;
    var st = b.stages.filter(function (s) { return s.id === c.stage; })[0];
    return (p.best || 0) >= (st ? st.max || 15 : 15);
  }

  window.EFA = { bumpStreak: bumpStreak, streakNow: streakNow, hasProgress: hasProgress, exportSave: exportSave, importSave: importSave,
                 registry: registry, buildings: buildings, cardEarned: cardEarned };
})();

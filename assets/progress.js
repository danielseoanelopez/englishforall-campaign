/* English for All · shared progress helpers (Academy + Rank Up City)
   - EFA.bumpStreak(): call when a shift or a lesson is completed (one count per day).
   - EFA.streakNow():  the streak to display (0 if the last play was before yesterday).
   - EFA.exportSave() / EFA.importSave(code): ONE save code for everything.
     Still reads the two older code formats (city v1, Academy rankup-only). */
(function () {
  "use strict";
  function day(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function getJSON(k) { try { return JSON.parse(get(k) || "{}") || {}; } catch (e) { return {}; } }
  function rankupKeys() { try { return Object.keys(localStorage).filter(function (k) { return k.indexOf("rankup_") === 0; }); } catch (e) { return []; } }

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
    return rankupKeys().length > 0 || Object.keys(getJSON("nc_prog")).length > 0 || Object.keys(getJSON("no_prog")).length > 0;
  }
  function exportSave() {
    var r = {}; rankupKeys().forEach(function (k) { r[k] = get(k); });
    return b64(JSON.stringify({ v: 2, r: r, p: getJSON("nc_prog"), o: getJSON("no_prog"), s: getJSON("nc_streak"), c: get("nc_country") || "" }));
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
    if (d.s && typeof d.s === "object") set("nc_streak", JSON.stringify(d.s));
    if (typeof d.c === "string" && d.c) set("nc_country", d.c.replace(/[^A-Za-zÀ-ÿ -]/g, "").slice(0, 30));
    if (!n) throw new Error("empty code");
    return n;
  }
  window.EFA = { bumpStreak: bumpStreak, streakNow: streakNow, hasProgress: hasProgress, exportSave: exportSave, importSave: importSave };
})();

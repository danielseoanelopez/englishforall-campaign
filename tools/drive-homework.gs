/**
 * English for ALL · Rank Up — receives homework and exams from the app and files them in Google Drive.
 *
 * What it does with every delivery:
 *   · Drive folder "English for ALL · Tareas" › one folder per student › one folder per lesson/exam
 *   · the writing as a Google Doc (easy to correct with comments), each recording as an audio file
 *   · one row in the sheet "Registro de tareas · English for ALL" (inside the same folder)
 *   · an email to you with the link (turn off with EMAIL_ME = false)
 *
 * Set-up, once:
 *   1. Run  setup  (▶ Run). Allow the permissions it asks for.
 *   2. Deploy › New deployment › type "Web app" · Execute as: Me · Who has access: Anyone › Deploy.
 *   3. Copy the Web app URL (ends in /exec) and paste it into assets/homework.js (HW_ENDPOINT).
 * If you change this code later: Deploy › Manage deployments › ✎ › Version: New version › Deploy (the URL stays the same).
 */
var APP_TAG = "efa-hw-1";                     // must match assets/homework.js
var ROOT_NAME = "English for ALL · Tareas";
var SHEET_NAME = "Registro de tareas · English for ALL";
var EMAIL_ME = true;
var MAX_AUDIOS = 12;
var MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function setup() {
  var root = getRoot_();
  var sheet = getSheet_();
  Logger.log("Carpeta: " + root.getUrl());
  Logger.log("Registro: " + sheet.getParent().getUrl());
  Logger.log("Listo. Ahora: Implementar › Nueva implementación › Aplicación web.");
}

/* opening the /exec URL in a browser just says it is alive */
function doGet() {
  return json_({ ok: true, app: "English for ALL · Tareas" });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var p = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!p || p.app !== APP_TAG) return json_({ ok: false, error: "unknown sender" });

    var name = clean_(p.name || "Sin nombre", 60);
    var kind = clean_(p.kind || "Tarea", 20);
    var what = clean_(((p.level ? p.level + " " : "") + (p.lesson || "")).trim() || kind, 90);
    var tz = Session.getScriptTimeZone();
    var stamp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH.mm");

    var student = folderIn_(getRoot_(), name);
    var box = student.createFolder(stamp + " · " + kind + " · " + what);

    /* writing (+ score and exam breakdown) → Google Doc */
    var writing = String(p.writing || "").trim();
    var words = writing ? writing.split(/\s+/).length : 0;
    var details = (p.details && typeof p.details === "object") ? p.details : null;
    if (writing || p.score || details) {
      var doc = DocumentApp.create("Writing · " + name + " · " + what);
      var body = doc.getBody();
      body.appendParagraph(name + " — " + kind + " · " + what).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      if (p.score) body.appendParagraph("Score: " + p.score);
      if (details) {
        Object.keys(details).forEach(function (k) {
          if (k.charAt(0) === "_" || k === "writing" || k === "nombre") return;
          body.appendParagraph(k + ": " + String(details[k]));
        });
      }
      body.appendParagraph(writing ? "Writing (" + words + " palabras):" : "Sin writing.").setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (writing) body.appendParagraph(writing);
      doc.saveAndClose();
      DriveApp.getFileById(doc.getId()).moveTo(box);
    }

    /* recordings → audio files */
    var audios = Array.isArray(p.audios) ? p.audios.slice(0, MAX_AUDIOS) : [];
    var saved = 0;
    audios.forEach(function (a, i) {
      if (!a || !a.data) return;
      var mime = String(a.mime || "audio/mp4").split(";")[0];
      var ext = /webm/.test(mime) ? "webm" : (/ogg/.test(mime) ? "ogg" : "m4a");
      var bytes = Utilities.base64Decode(String(a.data));
      if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) return;
      var label = clean_(a.label || ("Audio " + (i + 1)), 70);
      box.createFile(Utilities.newBlob(bytes, mime, (i + 1) + " · " + label + (a.secs ? " (" + a.secs + "s)" : "") + "." + ext));
      saved++;
    });

    getSheet_().appendRow([new Date(), safe_(name), kind, p.level || "", safe_(p.lesson || ""), safe_(p.score || ""), words, saved, box.getUrl(), safe_(writing.slice(0, 400))]);

    if (EMAIL_ME) {
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        kind + " · " + name + " · " + what + (p.score ? " · " + p.score : ""),
        name + " envió: " + kind + " · " + what + "\n" +
        (p.score ? "Score: " + p.score + "\n" : "") +
        "Writing: " + words + " palabras · Audios: " + saved + "\n\n" +
        "Carpeta: " + box.getUrl() + "\n\n" + (writing ? "— Writing —\n" + writing : ""));
    }
    return json_({ ok: true, saved: saved });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ---------- helpers ---------- */
function getRoot_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("ROOT_ID");
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  var it = DriveApp.getFoldersByName(ROOT_NAME);
  var root = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
  props.setProperty("ROOT_ID", root.getId());
  return root;
}
function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SHEET_ID"), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(getRoot_());
    var sh = ss.getSheets()[0];
    sh.setName("Registro");
    sh.appendRow(["Fecha", "Alumno", "Tipo", "Nivel", "Lección / examen", "Score", "Palabras", "Audios", "Carpeta", "Writing (inicio)"]);
    sh.setFrozenRows(1);
    props.setProperty("SHEET_ID", ss.getId());
  }
  return ss.getSheetByName("Registro") || ss.getSheets()[0];
}
function folderIn_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function clean_(s, max) {
  return String(s).replace(/[\/\\:*?"<>|\r\n\t]+/g, " ").replace(/^[=+\-@\s]+/, "").replace(/\s+/g, " ").trim().slice(0, max) || "—";
}
function safe_(s) {   // stops a cell from being read as a formula
  s = String(s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

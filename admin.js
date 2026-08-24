(function () {
  "use strict";
  var fb = window.ENORPA_FIREBASE;
  var CHUNK_SIZE = 700 * 1024;
  var MAX_FILE_SIZE = 20 * 1024 * 1024;
  var $ = function (id) { return document.getElementById(id); };
  function message(text, error) { $("message").hidden = !text; $("message").textContent = text || ""; $("message").className = "message " + (error ? "error" : "ok"); }
  function setConnected(ok) { $("connection").textContent = ok ? "Firebase hazır" : "Bağlantı hatası"; $("connection").className = "badge " + (ok ? "ok" : "error"); }
  function value(id) { return $(id).value.trim(); }
  function numberOrNull(id) { var n = Number($(id).value); return $(id).value === "" || !Number.isFinite(n) ? null : n; }
  var dimensionKeys = ["A", "B", "C", "D", "DM", "D1", "E", "F", "G", "H1", "I", "L", "M", "N", "O", "Plate", "Weight"];
  function dimensionsFromForm() { var result = {}; dimensionKeys.forEach(function (key) { var v = value("dim" + key); if (v) result[key === "Plate" ? "plate" : key === "Weight" ? "weight" : key] = v; }); return result; }
  if (!fb || !fb.auth || !fb.db) { setConnected(false); message("Firebase Auth veya Firestore hazırlanamadı.", true); return; }
  setConnected(true);
  $("loginForm").addEventListener("submit", async function (event) { event.preventDefault(); message(""); try { await fb.auth.signInWithEmailAndPassword(value("email"), $("password").value); } catch (error) { message("Giriş başarısız: " + error.message, true); } });
  $("logout").addEventListener("click", function () { fb.auth.signOut(); });
  $("refresh").addEventListener("click", loadBurners);
  $("cancelEdit").addEventListener("click", resetForm);
  fb.auth.onAuthStateChanged(function (user) { $("loginPanel").hidden = !!user; $("adminPanel").hidden = !user; $("userEmail").textContent = user ? user.email : ""; if (user) loadBurners(); });

  async function storeFile(file, burnerId, kind) {
    if (!file) return null;
    if (file.size > MAX_FILE_SIZE) throw new Error(file.name + " 20 MB sınırını aşıyor.");
    var fileRef = fb.db.collection("burnerFiles").doc();
    var bytes = new Uint8Array(await file.arrayBuffer());
    var chunkCount = Math.ceil(bytes.length / CHUNK_SIZE);
    var batch = fb.db.batch();
    for (var index = 0; index < chunkCount; index++) {
      var part = bytes.slice(index * CHUNK_SIZE, Math.min((index + 1) * CHUNK_SIZE, bytes.length));
      batch.set(fileRef.collection("chunks").doc(String(index).padStart(5, "0")), { index: index, data: firebase.firestore.Blob.fromUint8Array(part) });
    }
    batch.set(fileRef, { burnerId: burnerId, kind: kind, name: file.name, type: file.type || "application/octet-stream", size: file.size, chunkCount: chunkCount, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    return fileRef.id;
  }

  async function openStoredFile(fileId, fallbackUrl) {
    if (!fileId && fallbackUrl) { window.open(fallbackUrl, "_blank", "noopener"); return; }
    if (!fileId) return;
    message("Dosya hazırlanıyor…");
    try {
      var fileDoc = await fb.db.collection("burnerFiles").doc(fileId).get();
      if (!fileDoc.exists) throw new Error("Dosya kaydı bulunamadı.");
      var meta = fileDoc.data(), parts = await fileDoc.ref.collection("chunks").orderBy("index").get(), arrays = [], total = 0;
      parts.forEach(function (doc) { var a = doc.data().data.toUint8Array(); arrays.push(a); total += a.length; });
      if (arrays.length !== meta.chunkCount) throw new Error("Dosyanın bazı parçaları eksik.");
      var joined = new Uint8Array(total), offset = 0;
      arrays.forEach(function (a) { joined.set(a, offset); offset += a.length; });
      var url = URL.createObjectURL(new Blob([joined], { type: meta.type }));
      window.open(url, "_blank", "noopener"); setTimeout(function () { URL.revokeObjectURL(url); }, 60000); message("");
    } catch (error) { message("Dosya açılamadı: " + error.message, true); }
  }

  $("burnerForm").addEventListener("submit", async function (event) {
    event.preventDefault(); message("");
    var id = value("recordId") || fb.db.collection("burners").doc().id;
    var button = event.submitter; if (button) button.disabled = true;
    try {
      var old = (await fb.db.collection("burners").doc(id).get()).data() || {};
      var drawingFileId = await storeFile($("drawing").files[0], id, "drawing");
      var data = { brand: value("brand"), series: value("series"), model: value("model"), productCode: value("productCode"), fuel: value("fuel"), head: value("head"), active: $("active").checked, power: { min: numberOrNull("powerMin"), max: numberOrNull("powerMax") }, dimensions: dimensionsFromForm(), drawingFileId: drawingFileId || old.drawingFileId || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (!old.createdAt) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await fb.db.collection("burners").doc(id).set(data, { merge: true });
      message("Brülör ve dosyaları kaydedildi."); resetForm(); await loadBurners();
    } catch (error) { message("Kayıt başarısız: " + error.message, true); }
    finally { if (button) button.disabled = false; }
  });

  function fileButton(label, fileId, url) { if (!fileId && !url) return null; var button = document.createElement("button"); button.type = "button"; button.className = "secondary file-button"; button.textContent = label; button.addEventListener("click", function () { openStoredFile(fileId, url); }); return button; }
  async function loadBurners() {
    $("burnerRows").innerHTML = '<tr><td colspan="6">Yükleniyor…</td></tr>';
    try {
      var snapshot = await fb.db.collection("burners").orderBy("brand").limit(500).get(); $("burnerRows").innerHTML = "";
      snapshot.forEach(function (doc) {
        var d = doc.data(), tr = document.createElement("tr");
        [d.brand, d.series, d.model, d.active === false ? "Pasif" : "Aktif"].forEach(function (text) { var td = document.createElement("td"); td.textContent = text || "—"; tr.appendChild(td); });
        var files = document.createElement("td"), dr = fileButton("Görüntüle", d.drawingFileId, d.drawingUrl); if (dr) files.appendChild(dr); else files.textContent = "—"; tr.appendChild(files);
        var action = document.createElement("td"), edit = document.createElement("button"); edit.textContent = "Düzenle"; edit.className = "secondary"; edit.addEventListener("click", function () { editRecord(doc.id, d); }); action.appendChild(edit); tr.appendChild(action); $("burnerRows").appendChild(tr);
      });
      if (snapshot.empty) $("burnerRows").innerHTML = '<tr><td colspan="6">Henüz kayıt yok.</td></tr>';
    } catch (error) { message("Liste alınamadı: " + error.message, true); }
  }
  function editRecord(id, d) { $("recordId").value = id; $("brand").value = d.brand || ""; $("series").value = d.series || ""; $("model").value = d.model || ""; $("productCode").value = d.productCode || ""; $("fuel").value = d.fuel || ""; $("head").value = d.head || ""; $("powerMin").value = d.power && d.power.min != null ? d.power.min : ""; $("powerMax").value = d.power && d.power.max != null ? d.power.max : ""; dimensionKeys.forEach(function (key) { var dataKey = key === "Plate" ? "plate" : key === "Weight" ? "weight" : key; $("dim" + key).value = d.dimensions && d.dimensions[dataKey] || ""; }); $("active").checked = d.active !== false; $("formTitle").textContent = "Brülörü düzenle"; window.scrollTo({ top: 0, behavior: "smooth" }); }
  function resetForm() { $("burnerForm").reset(); $("recordId").value = ""; $("active").checked = true; $("formTitle").textContent = "Yeni brülör"; }
})();

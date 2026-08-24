(function () {
  "use strict";
  var fb = window.ENORPA_FIREBASE;
  var CHUNK_SIZE = 700 * 1024;
  var MAX_FILE_SIZE = 20 * 1024 * 1024;
  var $ = function (id) { return document.getElementById(id); };

  var schemas = {
    ecoflam: {
      label: "Ecoflam",
      version: "ecoflam-v1",
      help: "Ecoflam ölçü harfleri kendi datasheet standardına göre saklanır.",
      fields: [
        ["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"], ["DM", "DM"], ["D1", "D1"],
        ["E", "E"], ["F", "F"], ["G", "G"], ["H1", "H1"], ["I", "I"], ["L", "L"],
        ["M", "M"], ["N", "N"], ["O", "O"], ["plate", "Plaka kalınlığı"], ["weight", "Ağırlık"]
      ]
    },
    baltur: {
      label: "Baltur",
      version: "baltur-v1",
      help: "Baltur ölçüleri Ecoflam'dan bağımsızdır. Harf aynı olsa bile fiziksel anlamı Baltur çizimine göre değerlendirilir.",
      fields: [
        ["A", "A"], ["A1", "A1"], ["A2", "A2"], ["B", "B"], ["B1", "B1"], ["B2", "B2"],
        ["B5", "B5"], ["C", "C"], ["C1", "C1"], ["D", "D"], ["E", "ØE"], ["F", "ØF"],
        ["I", "I"], ["L", "ØL"], ["M", "M"], ["N", "ØN"], ["Q", "Q"], ["Z2", "Z2"]
      ]
    }
  };

  function message(text, error) { $("message").hidden = !text; $("message").textContent = text || ""; $("message").className = "message " + (error ? "error" : "ok"); }
  function setConnected(ok) { $("connection").textContent = ok ? "Firebase hazır" : "Bağlantı hatası"; $("connection").className = "badge " + (ok ? "ok" : "error"); }
  function value(id) { var el = $(id); return el ? el.value.trim() : ""; }
  function numberOrNull(id) { var el = $(id), n = el ? Number(el.value) : NaN; return !el || el.value === "" || !Number.isFinite(n) ? null : n; }
  function manufacturerOf(d) {
    if (d && (d.manufacturer === "baltur" || d.dimensionSchema === "baltur-v1")) return "baltur";
    if (d && /baltur/i.test(d.brand || "")) return "baltur";
    return "ecoflam";
  }
  function schemaFor(name) { return schemas[name] || schemas.ecoflam; }
  function dimensionsOf(d) {
    if (d && d.dimensionData && d.dimensionData.values) return d.dimensionData.values;
    return d && d.dimensions ? d.dimensions : {};
  }
  function escapeHtml(text) { return String(text == null ? "" : text).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }

  function renderDimensionFields(manufacturer, values) {
    var schema = schemaFor(manufacturer), container = $("dimensionFields");
    $("dimensionLegend").textContent = schema.label + " datasheet ölçüleri";
    $("dimensionHelp").textContent = schema.help;
    container.innerHTML = "";
    schema.fields.forEach(function (field) {
      var key = field[0], label = field[1], wrapper = document.createElement("label"), input = document.createElement("input");
      wrapper.textContent = label;
      input.id = "dim_" + key;
      input.dataset.dimensionKey = key;
      input.placeholder = key === "weight" ? "örn. 120 kg" : (key === "M" ? "örn. M20" : "mm");
      input.value = values && values[key] != null ? values[key] : "";
      wrapper.appendChild(input); container.appendChild(wrapper);
    });
  }

  function dimensionsFromForm() {
    var result = {};
    $("dimensionFields").querySelectorAll("[data-dimension-key]").forEach(function (input) {
      var v = input.value.trim(); if (v) result[input.dataset.dimensionKey] = v;
    });
    return result;
  }

  if (!fb || !fb.auth || !fb.db) { setConnected(false); message("Firebase Auth veya Firestore hazırlanamadı.", true); return; }
  setConnected(true);
  renderDimensionFields("ecoflam", {});

  $("manufacturer").addEventListener("change", function () { renderDimensionFields(this.value, {}); });
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
    var chunkCount = Math.ceil(bytes.length / CHUNK_SIZE), batch = fb.db.batch();
    for (var index = 0; index < chunkCount; index++) {
      var part = bytes.slice(index * CHUNK_SIZE, Math.min((index + 1) * CHUNK_SIZE, bytes.length));
      batch.set(fileRef.collection("chunks").doc(String(index).padStart(5, "0")), { index: index, data: firebase.firestore.Blob.fromUint8Array(part) });
    }
    batch.set(fileRef, { burnerId: burnerId, kind: kind, name: file.name, type: file.type || "application/octet-stream", size: file.size, chunkCount: chunkCount, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await batch.commit(); return fileRef.id;
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
      var manufacturer = value("manufacturer"), schema = schemaFor(manufacturer), dimensions = dimensionsFromForm();
      var drawingFileId = await storeFile($("drawing").files[0], id, "drawing");
      var data = {
        manufacturer: manufacturer,
        brand: schema.label,
        dimensionSchema: schema.version,
        dimensionData: { schema: schema.version, manufacturer: manufacturer, values: dimensions },
        dimensions: dimensions,
        series: value("series"), model: value("model"), productCode: value("productCode"), fuel: value("fuel"), head: value("head"),
        active: $("active").checked,
        power: { min: numberOrNull("powerMin"), max: numberOrNull("powerMax") },
        drawingFileId: drawingFileId || old.drawingFileId || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (!old.createdAt) data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await fb.db.collection("burners").doc(id).set(data, { merge: true });
      message(schema.label + " brülörü ve ölçüleri kaydedildi."); resetForm(); await loadBurners();
    } catch (error) { message("Kayıt başarısız: " + error.message, true); }
    finally { if (button) button.disabled = false; }
  });

  function fileButton(label, fileId, url) {
    if (!fileId && !url) return null;
    var button = document.createElement("button"); button.type = "button"; button.className = "secondary file-button"; button.textContent = label;
    button.addEventListener("click", function () { openStoredFile(fileId, url); }); return button;
  }
  function actionButton(label, handler, primary) {
    var button = document.createElement("button"); button.type = "button"; button.textContent = label; button.className = primary ? "" : "secondary"; button.addEventListener("click", handler); return button;
  }

  function technicalSheetHtml(d, autoPrint) {
    var manufacturer = manufacturerOf(d), schema = schemaFor(manufacturer), dims = dimensionsOf(d);
    var rows = schema.fields.map(function (field) {
      var v = dims[field[0]]; if (v == null || v === "") return "";
      return "<tr><th>" + escapeHtml(field[1]) + "</th><td>" + escapeHtml(v) + "</td></tr>";
    }).join("");
    var power = d.power || {};
    return "<!doctype html><html lang='tr'><head><meta charset='utf-8'><title>" + escapeHtml(schema.label + " " + (d.model || "Brülör")) + "</title><style>body{font-family:Arial,sans-serif;margin:36px;color:#18222b}header{border-bottom:3px solid #d35400;padding-bottom:14px;margin-bottom:22px}.brand{color:#d35400;font-size:13px;font-weight:700;letter-spacing:2px}h1{margin:5px 0}h2{margin-top:28px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #cfd6dc;padding:9px;text-align:left}th{background:#f3f5f6;width:34%}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px}.note{padding:10px;background:#fff5ed;border-left:4px solid #d35400;margin-top:18px}@media print{button{display:none}body{margin:18mm}}</style></head><body><header><div class='brand'>ENORPA</div><h1>" + escapeHtml(schema.label) + " Teknik Ölçü Fişi</h1><div>Ölçü standardı: " + escapeHtml(schema.version) + "</div></header><div class='meta'><div><b>Model:</b> " + escapeHtml(d.model || "—") + "</div><div><b>Seri:</b> " + escapeHtml(d.series || "—") + "</div><div><b>Ürün kodu:</b> " + escapeHtml(d.productCode || "—") + "</div><div><b>Yakıt:</b> " + escapeHtml(d.fuel || "—") + "</div><div><b>Güç:</b> " + escapeHtml(power.min != null ? power.min : "—") + " - " + escapeHtml(power.max != null ? power.max : "—") + " kW</div><div><b>Kafa:</b> " + escapeHtml(d.head || "—") + "</div></div><h2>Datasheet ölçüleri</h2><table>" + (rows || "<tr><td>Ölçü girilmemiş.</td></tr>") + "</table><div class='note'>" + escapeHtml(schema.help) + "</div><p><button onclick='window.print()'>PDF / Yazdır</button></p>" + (autoPrint ? "<script>window.onload=function(){window.print()}<\/script>" : "") + "</body></html>";
  }

  function openTechnicalSheet(d, autoPrint) {
    var w = window.open("", "_blank", "noopener");
    if (!w) { message("Teknik fiş penceresi açılamadı. Tarayıcı pop-up iznini kontrol edin.", true); return; }
    w.document.open(); w.document.write(technicalSheetHtml(d, autoPrint)); w.document.close();
  }

  async function loadBurners() {
    $("burnerRows").innerHTML = '<tr><td colspan="6">Yükleniyor…</td></tr>';
    try {
      var snapshot = await fb.db.collection("burners").orderBy("brand").limit(500).get(); $("burnerRows").innerHTML = "";
      snapshot.forEach(function (doc) {
        var d = doc.data(), manufacturer = manufacturerOf(d), schema = schemaFor(manufacturer), tr = document.createElement("tr");
        [schema.label, d.series, d.model, d.active === false ? "Pasif" : "Aktif"].forEach(function (text) { var td = document.createElement("td"); td.textContent = text || "—"; tr.appendChild(td); });
        var files = document.createElement("td"), dr = fileButton("Çizimi aç", d.drawingFileId, d.drawingUrl); if (dr) files.appendChild(dr); else files.textContent = "—"; tr.appendChild(files);
        var action = document.createElement("td"); action.className = "row-actions";
        action.appendChild(actionButton("Görüntüle", function () { openTechnicalSheet(d, false); }, false));
        action.appendChild(actionButton("PDF", function () { openTechnicalSheet(d, true); }, false));
        action.appendChild(actionButton("Düzenle", function () { editRecord(doc.id, d); }, true));
        tr.appendChild(action); $("burnerRows").appendChild(tr);
      });
      if (snapshot.empty) $("burnerRows").innerHTML = '<tr><td colspan="6">Henüz kayıt yok.</td></tr>';
    } catch (error) { message("Liste alınamadı: " + error.message, true); }
  }

  function editRecord(id, d) {
    var manufacturer = manufacturerOf(d), dims = dimensionsOf(d);
    $("recordId").value = id; $("manufacturer").value = manufacturer; renderDimensionFields(manufacturer, dims);
    $("series").value = d.series || ""; $("model").value = d.model || ""; $("productCode").value = d.productCode || ""; $("fuel").value = d.fuel || ""; $("head").value = d.head || "";
    $("powerMin").value = d.power && d.power.min != null ? d.power.min : ""; $("powerMax").value = d.power && d.power.max != null ? d.power.max : "";
    $("active").checked = d.active !== false; $("formTitle").textContent = schemaFor(manufacturer).label + " brülörünü düzenle"; window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    $("burnerForm").reset(); $("recordId").value = ""; $("manufacturer").value = "ecoflam"; renderDimensionFields("ecoflam", {}); $("active").checked = true; $("formTitle").textContent = "Yeni brülör";
  }
})();

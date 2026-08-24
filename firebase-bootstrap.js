(function (window) {
  "use strict";

  function resolveConfig() {
    return window.ENORPA_FIREBASE_CONFIG || window.firebaseConfig ||
      (typeof firebaseConfig !== "undefined" ? firebaseConfig : null);
  }

  function validConfig(config) {
    return config && ["apiKey", "authDomain", "projectId", "appId"].every(function (key) {
      return typeof config[key] === "string" && config[key].trim() &&
        !/BURAYA|SENIN|YOUR_|\.\.\./i.test(config[key]);
    });
  }

  function fail(message, cause) {
    var error = cause instanceof Error ? cause : new Error(message);
    window.ENORPA_FIREBASE_ERROR = error;
    console.error("[ENORPA Firebase] " + message, cause || "");
    window.dispatchEvent(new CustomEvent("enorpa:firebase-error", { detail: error }));
    return null;
  }

  function start() {
    if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
      return fail("Firebase App SDK yüklenmedi. Script sırasını kontrol edin.");
    }

    var config = resolveConfig();
    if (!validConfig(config)) {
      return fail("Firebase yapılandırması bulunamadı veya zorunlu alanlar eksik.");
    }

    try {
      var app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(config);
      var services = { app: app, config: config };
      if (typeof window.firebase.auth === "function") services.auth = window.firebase.auth();
      if (typeof window.firebase.firestore === "function") services.db = window.firebase.firestore();
      if (typeof window.firebase.storage === "function") services.storage = window.firebase.storage();
      window.ENORPA_FIREBASE = services;
      window.dispatchEvent(new CustomEvent("enorpa:firebase-ready", { detail: services }));
      return services;
    } catch (error) {
      return fail("Firebase başlatılamadı: " + error.message, error);
    }
  }

  window.ENORPA_START_FIREBASE = start;
  start();
})(window);

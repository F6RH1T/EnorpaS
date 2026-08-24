# ENORPA admin paneli kurulumu

Paket dosyalarını mevcut projenin kök dizinine kopyalayın. `firebase-config.js` gerçek EnorpaS yapılandırmasını zaten içerir.

`admin.html` dosyasını web sunucusu üzerinden açın. Firebase Console'da Email/Password Authentication etkin olmalı ve bir yönetici kullanıcı oluşturulmalıdır.

Zorunlu yükleme sırası `admin.html` içinde hazırdır:

1. Firebase App, Auth ve Firestore compat SDK'ları
2. `firebase-config.js`
3. `firebase-bootstrap.js`
4. `admin.js`

Bootstrap hem mevcut projedeki `window.ENORPA_FIREBASE_CONFIG` adını hem de eski paketlerdeki `window.firebaseConfig` adını destekler. Firebase daha önce başlatılmışsa ikinci kez başlatmaz.

## Üreticiye göre ölçü şeması

Yeni brülör kaydında önce üretici seçilir. Ecoflam ve Baltur aynı harfi farklı fiziksel ölçüler için kullanabildiğinden ölçüler tek bir ortak anlamda değerlendirilmez.

- **Ecoflam (`ecoflam-v1`)**: A, B, C, D, DM, D1, E, F, G, H1, I, L, M, N, O, plaka kalınlığı ve ağırlık.
- **Baltur (`baltur-v1`)**: A, A1, A2, B, B1, B2, B5, C, C1, D, ØE, ØF, I, ØL, M, ØN, Q ve Z2.

Firestore kaydında `manufacturer`, `dimensionSchema` ve `dimensionData` alanları bulunur. `dimensions` alanı da mevcut uygulama ile geriye dönük uyumluluk için korunur. Eski kayıtlarda üretici bilgisi yoksa kayıt Ecoflam kabul edilir; kayıt düzenlenip tekrar kaydedildiğinde yeni şema bilgileri eklenir.

Admin listesindeki **Görüntüle** düğmesi üreticiye özel teknik fişi açar, **PDF** düğmesi aynı fişi yazdırma/PDF kaydetme ekranına gönderir ve **Düzenle** eski kaydı forma geri yükler.

Ölçü tablosu/teknik çizim fotoğrafı ücretli Firebase Storage kullanılmadan Firestore içinde 700 KB parçalara ayrılarak saklanır. Dosya başına sınır 20 MB'dir. Yazma yetkisi `firestore.rules` içinde yalnızca onaylı yönetici UID'sine açıktır.

# ENORPA admin paneli kurulumu

Paket dosyalarını mevcut projenin kök dizinine kopyalayın. `firebase-config.js` gerçek EnorpaS yapılandırmasını zaten içerir.

`admin.html` dosyasını web sunucusu üzerinden açın. Firebase Console'da Email/Password Authentication etkin olmalı ve bir yönetici kullanıcı oluşturulmalıdır.

Zorunlu yükleme sırası `admin.html` içinde hazırdır:

1. Firebase App, Auth ve Firestore compat SDK'ları
2. `firebase-config.js`
3. `firebase-bootstrap.js`
4. `admin.js`

Bootstrap hem mevcut projedeki `window.ENORPA_FIREBASE_CONFIG` adını hem de eski paketlerdeki `window.firebaseConfig` adını destekler. Firebase daha önce başlatılmışsa ikinci kez başlatmaz.

PDF ve teknik çizimler ücretli Firebase Storage kullanılmadan Firestore içinde 700 KB parçalara ayrılarak saklanır. Dosya başına sınır 20 MB'dir. Görüntüleme sırasında parçalar tarayıcıda yeniden birleştirilir. Bu alan `firestore.rules` içinde yalnızca onaylı yönetici UID'sine açıktır.

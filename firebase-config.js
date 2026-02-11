/**
 * Ahmetli Medya - Firebase yapılandırması
 * Firebase Console'dan proje oluşturup bu değerleri doldurun.
 * https://console.firebase.google.com/
 */
(function (global) {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyD0oq-WdJOHLpX4STtT23m6lRwz2Gjts5w',
    authDomain: 'ahmetlisosyal-afae5.firebaseapp.com',
    projectId: 'ahmetlisosyal-afae5',
    storageBucket: 'ahmetlisosyal-afae5.firebasestorage.app',
    messagingSenderId: '984107058762',
    appId: '1:984107058762:web:f54f1784cab99633d448b3',
  };

  const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

  /**
   * Admin e-postaları: Sadece bu listeye eklediğiniz e-postalar panele girebilir.
   * Boş bırakırsanız Firebase'de giriş yapabilen her kullanıcı admin sayılır.
   * Örnek: ['admin@ahmetlimedya.com', 'editor@site.com']
   */
  const adminEmails = []; // Örn: ['admin@ahmetlimedya.com'] — boş bırakırsanız giriş yapabilen herkes admin sayılır.

  /** true = giriş ekranı atlanır, doğrudan panele girilir (geliştirme / yerel kullanım). Canlıda false yapın. */
  const skipAuth = true;

  if (skipAuth) {
    global.AhmetliMedyaFirebase = {
      app: null,
      auth: null,
      db: null,
      storage: null,
      isConfigured: false,
      adminEmails: adminEmails,
      skipAuth: true,
    };
  } else if (typeof global.firebase !== 'undefined' && isConfigured) {
    try {
      try {
        global.firebase.initializeApp(firebaseConfig);
      } catch (e) {
        if (e.code !== 'app/duplicate-app') throw e;
      }
      global.AhmetliMedyaFirebase = {
        app: global.firebase.app(),
        auth: global.firebase.auth(),
        db: global.firebase.firestore(),
        storage: global.firebase.storage(),
        isConfigured: true,
        adminEmails: adminEmails,
      };
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('Firebase init:', e);
      global.AhmetliMedyaFirebase = {
        app: null,
        auth: null,
        db: null,
        storage: null,
        isConfigured: false,
        config: firebaseConfig,
        adminEmails: adminEmails,
        skipAuth: false,
      };
    }
  } else {
    global.AhmetliMedyaFirebase = {
      app: null,
      auth: null,
      db: null,
      storage: null,
      isConfigured: false,
      config: firebaseConfig,
      adminEmails: adminEmails,
      skipAuth: false,
    };
  }
})(typeof window !== 'undefined' ? window : this);

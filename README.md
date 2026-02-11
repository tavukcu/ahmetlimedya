# Ahmetli Medya – Haber Web Sitesi

Yerel haberler için hazırlanmış, responsive haber sitesi. Üzüm diyarı Ahmetli temalı, portal tarzı arayüz.

## Özellikler

- **Responsive tasarım** – Mobil, tablet ve masaüstü uyumlu
- **Portal düzeni** – Manşet, 3’lü/2’li kartlar, Editörün Seçimi, Gündem, Üzüm & Bağcılık
- **Sidebar** – Son Dakika (ticker), Çok Okunanlar, 5 günlük hava durumu, döviz
- **Bülten formu** – E-posta backend’e kaydedilir (`POST /api/bulten`)
- **Backend API** – Haber listesi, detay, arama, bülten aboneliği

## Backend ile çalıştırma (önerilen)

```bash
npm install
npm start
```

Tarayıcıda **http://localhost:3000** açın. Sayfa + API aynı sunucuda çalışır.

### API uçları

| Metot | Uç nokta | Açıklama |
|-------|----------|----------|
| GET | `/api/haberler` | Haber listesi. Opsiyonel: `?kategori=`, `?sayfa=`, `?limit=` |
| GET | `/api/haberler/:id` veya `/:slug` | Tekil haber |
| GET | `/api/ara?q=` | Başlık/özet/kategori arama |
| POST | `/api/bulten` | Bülten aboneliği. Body: `{ "email": "..." }` |
| GET | `/api/son-dakika` | Son 10 haber özeti |
| GET | `/api/cok-okunan` | En çok okunan 5 haber |

Veri: `data/haberler.json`, `data/bulten.json`. Port: `PORT` env veya **3000**.

### Yönetim Paneli (Firebase)

Admin paneli **Firebase Authentication** (e-posta/şifre) ve **Firestore** ile çalışır.

- **URL:** http://localhost:3000/admin.html (veya statik sunucu ile açın)
- **Özellikler:** Dashboard (istatistikler, son haberler), haber CRUD, yayında/taslak, son dakika/öne çıkan işaretleme, kategori filtresi, arama, sıralama, silme onayı, toast bildirimleri
- **Kurulum:**
  1. [Firebase Console](https://console.firebase.google.com/)’da proje oluşturun.
  2. Authentication → E-posta/Şifre etkinleştirin; bir admin kullanıcısı ekleyin.
  3. Firestore Database oluşturun; kurallar için `firestore.rules` dosyasını deploy edin.
  4. Proje ayarlarından `apiKey`, `authDomain`, `projectId` vb. alın; `firebase-config.js` içindeki `firebaseConfig` objesine yapıştırın.
- **Dosyalar:** `admin.html`, `admin.css`, `admin.js`, `firebase-config.js`, `firestore.rules`

## Sadece statik (backend olmadan)

`index.html` dosyasını doğrudan açabilir veya statik sunucu kullanabilirsiniz. Bülten formu gönderiminde ağ hatası olursa yine de “teşekkür” mesajı gösterilir (demo için).

```bash
python3 -m http.server 8000
# veya: npx serve .
```

## Yapı

- `index.html` – Ana sayfa
- `styles.css` – Stiller ve responsive kurallar
- `script.js` – Ticker, bülten (API), hava, sidebar sekmeler, okuma çubuğu
- `server.js` – Express backend (API + statik)
- `data/haberler.json` – Haber listesi
- `data/bulten.json` – Bülten e-posta listesi

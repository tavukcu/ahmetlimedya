/**
 * Ahmetli Medya - Backend API
 * Express: statik dosya + haberler, arama, bülten + admin panel API
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const HABERLER_PATH = path.join(DATA_DIR, 'haberler.json');
const BULTEN_PATH = path.join(DATA_DIR, 'bulten.json');

const TOKEN_SECRET = process.env.TOKEN_SECRET || ADMIN_PASSWORD + '_ahmetli_secret';
const TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 saat

function createToken() {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(ts).digest('hex');
  return ts + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const ts = parts[0];
  const sig = parts[1];
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(ts).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  const age = Date.now() - parseInt(ts, 10);
  return age >= 0 && age < TOKEN_MAX_AGE;
}

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));
app.use(express.static(__dirname));

function okuHaberler() {
  try {
    const raw = fs.readFileSync(HABERLER_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function yazHaberler(liste) {
  fs.writeFileSync(HABERLER_PATH, JSON.stringify(liste, null, 2), 'utf8');
}

function okuBulten() {
  try {
    const raw = fs.readFileSync(BULTEN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function yazBulten(liste) {
  fs.writeFileSync(BULTEN_PATH, JSON.stringify(liste, null, 2), 'utf8');
}

function slugify(str) {
  if (!str || typeof str !== 'string') return '';
  const tr = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c', İ: 'i' };
  let s = str.toLowerCase();
  Object.keys(tr).forEach((k) => { s = s.replace(new RegExp(k, 'g'), tr[k]); });
  return s.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function okumaSuresiHesapla(metin) {
  if (!metin) return 1;
  const kelime = (metin.trim().split(/\s+/).filter(Boolean).length) || 1;
  return Math.max(1, Math.ceil(kelime / 200));
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ hata: 'Yetkisiz' });
  }
  next();
}

// ----- API: Haber listesi -----
// GET /api/haberler?kategori=Gündem&sayfa=1&limit=10
app.get('/api/haberler', (req, res) => {
  let haberler = okuHaberler();
  const kategori = req.query.kategori;
  const sayfa = Math.max(1, parseInt(req.query.sayfa, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (sayfa - 1) * limit;

  if (kategori) {
    haberler = haberler.filter((h) => h.kategori === kategori);
  }
  const toplam = haberler.length;
  const sayfalani = haberler.slice(offset, offset + limit);

  res.json({
    data: sayfalani,
    sayfa,
    limit,
    toplam,
    toplamSayfa: Math.ceil(toplam / limit),
  });
});

// ----- API: Tekil haber (id veya slug) -----
// GET /api/haberler/1  veya  GET /api/haberler/belediyeler-stratejik-planlarini-acikladi
app.get('/api/haberler/:idOrSlug', (req, res) => {
  const haberler = okuHaberler();
  const idOrSlug = req.params.idOrSlug;
  const id = parseInt(idOrSlug, 10);
  const haber = haberler.find(
    (h) => h.id === id || h.slug === idOrSlug
  );
  if (!haber) {
    return res.status(404).json({ hata: 'Haber bulunamadı' });
  }
  res.json(haber);
});

// ----- API: Arama -----
// GET /api/ara?q=üzüm
app.get('/api/ara', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) {
    return res.json({ data: [] });
  }
  const haberler = okuHaberler();
  const sonuc = haberler.filter(
    (h) =>
      (h.baslik && h.baslik.toLowerCase().includes(q)) ||
      (h.ozet && h.ozet.toLowerCase().includes(q)) ||
      (h.kategori && h.kategori.toLowerCase().includes(q))
  );
  res.json({ data: sonuc });
});

// ----- API: Bülten aboneliği -----
// POST /api/bulten  body: { "email": "test@example.com" }
app.post('/api/bulten', (req, res) => {
  const email = (req.body && req.body.email && req.body.email.trim()) || '';
  if (!email) {
    return res.status(400).json({ hata: 'E-posta gerekli' });
  }
  const list = okuBulten();
  if (list.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
    return res.json({ mesaj: 'Bu e-posta zaten kayıtlı.' });
  }
  list.push({ email: email.toLowerCase(), tarih: new Date().toISOString() });
  yazBulten(list);
  res.status(201).json({ mesaj: 'Bültenimize abone oldunuz. Teşekkürler!' });
});

// ----- API: Son dakika / çok okunan (özet) -----
app.get('/api/son-dakika', (req, res) => {
  const haberler = okuHaberler();
  const now = new Date();
  let son = haberler.filter((h) => {
    if (!h.sonDakika || !h.sonDakikaBaslangic) return false;
    const sure = (h.sonDakikaSure || 6) * 3600000; // saat → ms
    return (now - new Date(h.sonDakikaBaslangic)) < sure;
  });
  const aktifSonDakika = son.length > 0;
  if (son.length === 0) son = haberler.slice(0, 10);
  res.json({ data: son.map((h) => ({ id: h.id, baslik: h.baslik, slug: h.slug })), aktifSonDakika });
});

app.get('/api/cok-okunan', (req, res) => {
  const haberler = okuHaberler();
  const siralanmis = [...haberler].sort((a, b) => (b.goruntulenme || 0) - (a.goruntulenme || 0));
  const ilk5 = siralanmis.slice(0, 5).map((h) => ({ id: h.id, baslik: h.baslik, slug: h.slug }));
  res.json({ data: ilk5 });
});

// ----- Admin: Giriş (auth middleware'den önce, ayrı path) -----
app.post('/api/admin-login', (req, res) => {
  const raw = (req.body && req.body.password != null ? req.body.password : '');
  const password = String(raw).trim();
  const expected = ADMIN_PASSWORD;
  if (password !== expected) {
    console.log('[Admin] Giriş reddedildi. Gelen şifre uzunluğu:', password.length, 'Beklenen uzunluk:', expected.length);
    return res.status(401).json({ hata: 'Şifre hatalı. Varsayılan: admin123' });
  }
  const token = createToken();
  res.json({ token });
});

// ----- Admin: Tüm /api/admin/* route'ları auth gerekli -----
app.use('/api/admin', adminAuth);

app.get('/api/admin/bulten', (req, res) => {
  res.json({ data: okuBulten() });
});

app.get('/api/admin/haberler', (req, res) => {
  res.json({ data: okuHaberler() });
});

app.post('/api/admin/haberler', (req, res) => {
  const haberler = okuHaberler();
  const body = req.body || {};
  const maxId = haberler.length ? Math.max(...haberler.map((h) => h.id)) : 0;
  const baslik = (body.baslik || '').trim();
  const slug = body.slug && body.slug.trim() ? slugify(body.slug) : slugify(baslik);
  if (!baslik) return res.status(400).json({ hata: 'Başlık gerekli' });
  const icerik = (body.icerik || '').trim();
  const yeni = {
    id: maxId + 1,
    slug: slug || `haber-${maxId + 1}`,
    kategori: (body.kategori || 'Gündem').trim(),
    baslik,
    ozet: (body.ozet || icerik.slice(0, 200)).trim(),
    icerik: icerik || body.ozet || '',
    gorsel: (body.gorsel || '').trim() || 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=900&h=500&fit=crop',
    yazar: (body.yazar || 'Editör').trim(),
    yayinTarihi: body.yayinTarihi || new Date().toISOString().slice(0, 19) + '+03:00',
    okumaSuresi: body.okumaSuresi != null ? parseInt(body.okumaSuresi, 10) : okumaSuresiHesapla(icerik),
    goruntulenme: parseInt(body.goruntulenme, 10) || 0,
    sonDakika: !!body.sonDakika,
    sonDakikaSure: body.sonDakika ? (parseInt(body.sonDakikaSure, 10) || 6) : 0,
    sonDakikaBaslangic: body.sonDakika ? new Date().toISOString() : null,
    oneCikan: !!body.oneCikan,
  };
  haberler.push(yeni);
  yazHaberler(haberler);
  res.status(201).json(yeni);
});

app.put('/api/admin/haberler/:id', (req, res) => {
  const haberler = okuHaberler();
  const id = parseInt(req.params.id, 10);
  const idx = haberler.findIndex((h) => h.id === id);
  if (idx === -1) return res.status(404).json({ hata: 'Haber bulunamadı' });
  const body = req.body || {};
  const mevcut = haberler[idx];
  const baslik = (body.baslik !== undefined ? body.baslik : mevcut.baslik).trim();
  const slug = body.slug !== undefined && body.slug.trim() ? slugify(body.slug) : (body.baslik !== undefined ? slugify(baslik) : mevcut.slug);
  const icerik = body.icerik !== undefined ? body.icerik : mevcut.icerik;
  const yeniSonDakika = body.sonDakika !== undefined ? !!body.sonDakika : !!mevcut.sonDakika;
  const eskiSonDakika = !!mevcut.sonDakika;
  // sonDakika false→true: yeni başlangıç zamanı, true→true: mevcut zamanı koru
  const sonDakikaBaslangic = yeniSonDakika
    ? (!eskiSonDakika ? new Date().toISOString() : (mevcut.sonDakikaBaslangic || new Date().toISOString()))
    : null;
  haberler[idx] = {
    id: mevcut.id,
    slug: slug || mevcut.slug,
    kategori: (body.kategori !== undefined ? body.kategori : mevcut.kategori).trim(),
    baslik,
    ozet: (body.ozet !== undefined ? body.ozet : mevcut.ozet).trim(),
    icerik: (typeof icerik === 'string' ? icerik : mevcut.icerik).trim(),
    gorsel: (body.gorsel !== undefined ? body.gorsel : mevcut.gorsel).trim() || mevcut.gorsel,
    yazar: (body.yazar !== undefined ? body.yazar : mevcut.yazar).trim(),
    yayinTarihi: body.yayinTarihi !== undefined ? body.yayinTarihi : mevcut.yayinTarihi,
    okumaSuresi: body.okumaSuresi != null ? parseInt(body.okumaSuresi, 10) : (mevcut.okumaSuresi != null ? mevcut.okumaSuresi : okumaSuresiHesapla(icerik)),
    goruntulenme: body.goruntulenme != null ? parseInt(body.goruntulenme, 10) : (mevcut.goruntulenme || 0),
    sonDakika: yeniSonDakika,
    sonDakikaSure: body.sonDakikaSure != null ? (parseInt(body.sonDakikaSure, 10) || 6) : (mevcut.sonDakikaSure || 6),
    sonDakikaBaslangic: sonDakikaBaslangic,
    oneCikan: body.oneCikan !== undefined ? !!body.oneCikan : !!mevcut.oneCikan,
  };
  yazHaberler(haberler);
  res.json(haberler[idx]);
});

app.delete('/api/admin/haberler/:id', (req, res) => {
  const haberler = okuHaberler();
  const id = parseInt(req.params.id, 10);
  const idx = haberler.findIndex((h) => h.id === id);
  if (idx === -1) return res.status(404).json({ hata: 'Haber bulunamadı' });
  haberler.splice(idx, 1);
  yazHaberler(haberler);
  res.json({ mesaj: 'Silindi' });
});

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ahmetli Medya backend: http://localhost:${PORT}`);
  });
}

module.exports = app;

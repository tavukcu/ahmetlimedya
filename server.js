/**
 * Ahmetli Medya - Backend API
 * Express: statik dosya + haberler, arama, bülten + admin panel API
 * Vercel Blob Storage desteği (Vercel'de dosya sistemi read-only)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Vercel Blob: sadece video/görsel upload için
let blob = null;
if (process.env.BLOB_READ_WRITE_TOKEN) {
  blob = require('@vercel/blob');
}

// Neon Postgres: DATABASE_URL varsa kullan, yoksa lokal JSON fallback
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let sql = null;
if (DATABASE_URL) {
  const { neon } = require('@neondatabase/serverless');
  sql = neon(DATABASE_URL);
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const HABERLER_PATH = path.join(DATA_DIR, 'haberler.json');
const BULTEN_PATH = path.join(DATA_DIR, 'bulten.json');
const ANKET_PATH = path.join(DATA_DIR, 'anket.json');
const REKLAMLAR_PATH = path.join(DATA_DIR, 'reklamlar.json');
const ECZANE_PATH = path.join(DATA_DIR, 'eczane.json');
const VEFAT_PATH = path.join(DATA_DIR, 'vefat.json');
const UZUM_FIYAT_PATH = path.join(DATA_DIR, 'uzum-fiyat.json');

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// ----- DB başlatma (Postgres varsa tablo oluştur) -----

let dbReady = false;
async function initDB() {
  if (!sql || dbReady) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS haberler (
      id SERIAL PRIMARY KEY, slug TEXT, kategori TEXT, baslik TEXT, ozet TEXT,
      icerik TEXT, gorsel TEXT, video JSONB, yazar TEXT, yayin_tarihi TEXT,
      okuma_suresi INT DEFAULT 1, goruntulenme INT DEFAULT 0,
      son_dakika BOOLEAN DEFAULT false, son_dakika_sure INT DEFAULT 6,
      son_dakika_baslangic TEXT, one_cikan BOOLEAN DEFAULT false
    )`;
    await sql`CREATE TABLE IF NOT EXISTS bulten (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, tarih TEXT
    )`;
    await sql`CREATE TABLE IF NOT EXISTS anket (
      id SERIAL PRIMARY KEY, soru TEXT, secenekler JSONB,
      aktif BOOLEAN DEFAULT false, baslangic_tarihi TEXT, bitis_tarihi TEXT,
      olusturma_tarihi TEXT, toplam_oy INT DEFAULT 0, oy_veren_ipler TEXT[] DEFAULT '{}'
    )`;
    await sql`CREATE TABLE IF NOT EXISTS reklamlar (
      id SERIAL PRIMARY KEY, slot TEXT, baslik TEXT, gorsel TEXT, link TEXT, aktif BOOLEAN DEFAULT true
    )`;
    await sql`CREATE TABLE IF NOT EXISTS eczane (
      id BIGINT PRIMARY KEY, ad TEXT, adres TEXT, telefon TEXT, tarih TEXT
    )`;
    await sql`CREATE TABLE IF NOT EXISTS vefat (
      id BIGINT PRIMARY KEY, ad TEXT, gorsel TEXT, detay TEXT, tarih TEXT, olusturma TEXT
    )`;
    await sql`CREATE TABLE IF NOT EXISTS uzum_fiyat (
      id INT PRIMARY KEY DEFAULT 1, fiyatlar JSONB, guncelleme TEXT
    )`;
    dbReady = true;
  } catch (e) {
    console.error('[initDB hatası]', e.message);
  }
}

// ----- Satır dönüştürücüler (DB row -> JS object) -----

function haberRowToObj(r) {
  return {
    id: r.id, slug: r.slug, kategori: r.kategori, baslik: r.baslik,
    ozet: r.ozet, icerik: r.icerik, gorsel: r.gorsel,
    video: r.video || undefined,
    yazar: r.yazar, yayinTarihi: r.yayin_tarihi,
    okumaSuresi: r.okuma_suresi, goruntulenme: r.goruntulenme,
    sonDakika: r.son_dakika, sonDakikaSure: r.son_dakika_sure,
    sonDakikaBaslangic: r.son_dakika_baslangic,
    oneCikan: r.one_cikan,
  };
}

function anketRowToObj(r) {
  return {
    id: r.id, soru: r.soru, secenekler: r.secenekler,
    aktif: r.aktif, baslangicTarihi: r.baslangic_tarihi,
    bitisTarihi: r.bitis_tarihi, olusturmaTarihi: r.olusturma_tarihi,
    toplamOy: r.toplam_oy, oyVerenIpler: r.oy_veren_ipler || [],
  };
}

// ----- Veri okuma/yazma (Postgres veya lokal JSON fallback) -----

function okuLokal(dosyaYolu) {
  try {
    return JSON.parse(fs.readFileSync(dosyaYolu, 'utf8'));
  } catch (e) {
    return [];
  }
}

function yazLokal(dosyaYolu, liste) {
  fs.writeFileSync(dosyaYolu, JSON.stringify(liste, null, 2), 'utf8');
}

async function okuHaberler() {
  if (!sql) return okuLokal(HABERLER_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM haberler ORDER BY id DESC`;
  return rows.map(haberRowToObj);
}

async function yazHaberler(liste) {
  if (!sql) return yazLokal(HABERLER_PATH, liste);
  await initDB();
  await sql`TRUNCATE haberler RESTART IDENTITY`;
  for (const h of liste) {
    await sql`INSERT INTO haberler (id, slug, kategori, baslik, ozet, icerik, gorsel, video, yazar, yayin_tarihi, okuma_suresi, goruntulenme, son_dakika, son_dakika_sure, son_dakika_baslangic, one_cikan)
      VALUES (${h.id}, ${h.slug}, ${h.kategori}, ${h.baslik}, ${h.ozet || ''}, ${h.icerik || ''}, ${h.gorsel || ''}, ${h.video ? JSON.stringify(h.video) : null}, ${h.yazar || ''}, ${h.yayinTarihi || ''}, ${h.okumaSuresi || 1}, ${h.goruntulenme || 0}, ${h.sonDakika || false}, ${h.sonDakikaSure || 6}, ${h.sonDakikaBaslangic || null}, ${h.oneCikan || false})`;
  }
  await sql`SELECT setval('haberler_id_seq', (SELECT COALESCE(MAX(id),0) FROM haberler))`;
}

async function okuBulten() {
  if (!sql) return okuLokal(BULTEN_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM bulten ORDER BY id`;
  return rows.map(r => ({ email: r.email, tarih: r.tarih }));
}

async function yazBulten(liste) {
  if (!sql) return yazLokal(BULTEN_PATH, liste);
  await initDB();
  await sql`TRUNCATE bulten RESTART IDENTITY`;
  for (const b of liste) {
    await sql`INSERT INTO bulten (email, tarih) VALUES (${b.email}, ${b.tarih || ''}) ON CONFLICT (email) DO NOTHING`;
  }
}

async function okuAnketler() {
  if (!sql) return okuLokal(ANKET_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM anket ORDER BY id`;
  return rows.map(anketRowToObj);
}

async function yazAnketler(liste) {
  if (!sql) return yazLokal(ANKET_PATH, liste);
  await initDB();
  await sql`TRUNCATE anket RESTART IDENTITY`;
  for (const a of liste) {
    await sql`INSERT INTO anket (id, soru, secenekler, aktif, baslangic_tarihi, bitis_tarihi, olusturma_tarihi, toplam_oy, oy_veren_ipler)
      VALUES (${a.id}, ${a.soru}, ${JSON.stringify(a.secenekler)}, ${a.aktif || false}, ${a.baslangicTarihi || ''}, ${a.bitisTarihi || ''}, ${a.olusturmaTarihi || ''}, ${a.toplamOy || 0}, ${a.oyVerenIpler || []})`;
  }
  await sql`SELECT setval('anket_id_seq', (SELECT COALESCE(MAX(id),0) FROM anket))`;
}

async function okuReklamlar() {
  if (!sql) return okuLokal(REKLAMLAR_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM reklamlar ORDER BY id`;
  return rows.map(r => ({ id: r.id, slot: r.slot, baslik: r.baslik, gorsel: r.gorsel, link: r.link, aktif: r.aktif }));
}

async function yazReklamlar(liste) {
  if (!sql) return yazLokal(REKLAMLAR_PATH, liste);
  await initDB();
  await sql`TRUNCATE reklamlar RESTART IDENTITY`;
  for (const r of liste) {
    await sql`INSERT INTO reklamlar (id, slot, baslik, gorsel, link, aktif)
      VALUES (${r.id}, ${r.slot || ''}, ${r.baslik || ''}, ${r.gorsel || ''}, ${r.link || ''}, ${r.aktif !== false})`;
  }
  await sql`SELECT setval('reklamlar_id_seq', (SELECT COALESCE(MAX(id),0) FROM reklamlar))`;
}

async function okuEczane() {
  if (!sql) return okuLokal(ECZANE_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM eczane ORDER BY id`;
  return rows.map(r => ({ id: r.id, ad: r.ad, adres: r.adres, telefon: r.telefon, tarih: r.tarih }));
}

async function yazEczane(liste) {
  if (!sql) return yazLokal(ECZANE_PATH, liste);
  await initDB();
  await sql`TRUNCATE eczane`;
  for (const e of liste) {
    await sql`INSERT INTO eczane (id, ad, adres, telefon, tarih)
      VALUES (${e.id}, ${e.ad || ''}, ${e.adres || ''}, ${e.telefon || ''}, ${e.tarih || ''})`;
  }
}

async function okuVefat() {
  if (!sql) return okuLokal(VEFAT_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM vefat ORDER BY id DESC`;
  return rows.map(r => ({ id: r.id, ad: r.ad, gorsel: r.gorsel, detay: r.detay, tarih: r.tarih, olusturma: r.olusturma }));
}

async function yazVefat(liste) {
  if (!sql) return yazLokal(VEFAT_PATH, liste);
  await initDB();
  await sql`TRUNCATE vefat`;
  for (const v of liste) {
    await sql`INSERT INTO vefat (id, ad, gorsel, detay, tarih, olusturma)
      VALUES (${v.id}, ${v.ad || ''}, ${v.gorsel || ''}, ${v.detay || ''}, ${v.tarih || ''}, ${v.olusturma || ''})`;
  }
}

async function okuUzumFiyat() {
  if (!sql) return okuLokal(UZUM_FIYAT_PATH);
  await initDB();
  const rows = await sql`SELECT * FROM uzum_fiyat WHERE id = 1`;
  if (rows.length === 0) return { fiyatlar: [], guncelleme: '' };
  return { fiyatlar: rows[0].fiyatlar || [], guncelleme: rows[0].guncelleme || '' };
}

async function yazUzumFiyat(veri) {
  if (!sql) return yazLokal(UZUM_FIYAT_PATH, veri);
  await initDB();
  const fiyatlar = Array.isArray(veri) ? veri : (veri.fiyatlar || []);
  const guncelleme = Array.isArray(veri) ? '' : (veri.guncelleme || '');
  await sql`INSERT INTO uzum_fiyat (id, fiyatlar, guncelleme) VALUES (1, ${JSON.stringify(fiyatlar)}, ${guncelleme})
    ON CONFLICT (id) DO UPDATE SET fiyatlar = EXCLUDED.fiyatlar, guncelleme = EXCLUDED.guncelleme`;
}

function getClientIP(req) {
  var forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection.remoteAddress || '';
}

// ----- Yardımcılar -----

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

// ----- API: Döviz & Altın (proxy) -----
const https = require('https');

function truncgilFetch() {
  return new Promise((resolve, reject) => {
    https.get('https://finans.truncgil.com/today.json', (resp) => {
      let data = '';
      resp.on('data', (chunk) => { data += chunk; });
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON parse hatası: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

// Türkçe formatlı sayıyı parse et: "7.102,68" -> 7102.68
function parseTR(val) {
  if (!val || typeof val !== 'string') return 0;
  return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
}

let dovizCache = { data: null, ts: 0 };
app.get('/api/doviz', async (req, res) => {
  try {
    const now = Date.now();
    if (dovizCache.data && (now - dovizCache.ts) < 3 * 60 * 1000) {
      return res.json(dovizCache.data);
    }
    const raw = await truncgilFetch();
    const sonuc = {};
    const kurlar = { USD: 'USD', EUR: 'EUR', GBP: 'GBP', 'gram-altin': 'GRA', 'ceyrek-altin': 'CEYREKALTIN' };
    Object.entries(kurlar).forEach(([apiKey, ourKey]) => {
      if (raw[apiKey]) {
        const r = raw[apiKey];
        sonuc[ourKey] = {
          Buying: parseTR(r['Alış']),
          Selling: parseTR(r['Satış']),
          Change: parseTR((r['Değişim'] || '0').replace('%', '')),
          Name: r['Tür'] === 'Altın' ? apiKey.replace(/-/g, ' ') : apiKey
        };
      }
    });
    if (raw.Update_Date) sonuc.Update_Date = raw.Update_Date;
    dovizCache = { data: sonuc, ts: now };
    res.json(sonuc);
  } catch (err) {
    console.error('[/api/doviz] Hata:', err.message);
    res.status(502).json({ hata: 'Döviz verileri alınamadı: ' + err.message });
  }
});

// ----- API: Haber listesi -----
app.get('/api/haberler', async (req, res) => {
  try {
    let haberler = await okuHaberler();
    const kategori = req.query.kategori;
    const sayfa = Math.max(1, parseInt(req.query.sayfa, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (sayfa - 1) * limit;

    if (kategori) {
      haberler = haberler.filter((h) => h.kategori === kategori);
    }
    const toplam = haberler.length;
    const sayfalani = haberler.slice(offset, offset + limit);

    res.json({ data: sayfalani, sayfa, limit, toplam, toplamSayfa: Math.ceil(toplam / limit) });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Tekil haber (id veya slug) -----
app.get('/api/haberler/:idOrSlug', async (req, res) => {
  try {
    const haberler = await okuHaberler();
    const idOrSlug = req.params.idOrSlug;
    const id = parseInt(idOrSlug, 10);
    const haber = haberler.find((h) => h.id === id || h.slug === idOrSlug);
    if (!haber) return res.status(404).json({ hata: 'Haber bulunamadı' });
    res.json(haber);
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Arama -----
app.get('/api/ara', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ data: [] });
    const haberler = await okuHaberler();
    const sonuc = haberler.filter(
      (h) =>
        (h.baslik && h.baslik.toLowerCase().includes(q)) ||
        (h.ozet && h.ozet.toLowerCase().includes(q)) ||
        (h.kategori && h.kategori.toLowerCase().includes(q))
    );
    res.json({ data: sonuc });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Bülten aboneliği -----
app.post('/api/bulten', async (req, res) => {
  try {
    const email = (req.body && req.body.email && req.body.email.trim()) || '';
    if (!email) return res.status(400).json({ hata: 'E-posta gerekli' });
    const list = await okuBulten();
    if (list.some((e) => e.email.toLowerCase() === email.toLowerCase())) {
      return res.json({ mesaj: 'Bu e-posta zaten kayıtlı.' });
    }
    list.push({ email: email.toLowerCase(), tarih: new Date().toISOString() });
    await yazBulten(list);
    res.status(201).json({ mesaj: 'Bültenimize abone oldunuz. Teşekkürler!' });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Son dakika / çok okunan -----
app.get('/api/son-dakika', async (req, res) => {
  try {
    const haberler = await okuHaberler();
    const now = new Date();
    let son = haberler.filter((h) => {
      if (!h.sonDakika || !h.sonDakikaBaslangic) return false;
      const sure = (h.sonDakikaSure || 6) * 3600000;
      return (now - new Date(h.sonDakikaBaslangic)) < sure;
    });
    const aktifSonDakika = son.length > 0;
    if (son.length === 0) son = haberler.slice(0, 10);
    res.json({ data: son.map((h) => ({ id: h.id, baslik: h.baslik, slug: h.slug })), aktifSonDakika });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.get('/api/cok-okunan', async (req, res) => {
  try {
    const haberler = await okuHaberler();
    const siralanmis = [...haberler].sort((a, b) => (b.goruntulenme || 0) - (a.goruntulenme || 0));
    const ilk5 = siralanmis.slice(0, 5).map((h) => ({ id: h.id, baslik: h.baslik, slug: h.slug }));
    res.json({ data: ilk5 });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Reklamlar (public) -----
app.get('/api/reklamlar', async (req, res) => {
  try {
    const reklamlar = await okuReklamlar();
    const aktif = reklamlar.filter((r) => r.aktif === true);
    res.json({ data: aktif });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- Admin: Giriş -----
app.post('/api/admin-login', (req, res) => {
  const raw = (req.body && req.body.password != null ? req.body.password : '');
  const password = String(raw).trim();
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ hata: 'Şifre hatalı' });
  }
  res.json({ token: createToken() });
});

// ----- Admin: Auth gerekli -----
app.use('/api/admin', adminAuth);

// ----- Admin: Video yükleme -----
app.post('/api/admin/video-yukle', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ hata: 'Video dosyası gerekli' });
    const timestamp = Date.now();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = timestamp + '-' + safeName;

    if (blob) {
      // Vercel Blob Storage
      const result = await blob.put('videos/' + fileName, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype,
      });
      return res.json({ url: result.url });
    }

    // Lokal geliştirme: public/uploads klasörüne kaydet
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({ url: '/public/uploads/' + fileName });
  } catch (err) {
    console.error('[POST /api/admin/video-yukle] Hata:', err.message);
    res.status(500).json({ hata: 'Video yüklenemedi: ' + err.message });
  }
});

// ----- Admin: Görsel yükleme -----
app.post('/api/admin/gorsel-yukle', upload.single('gorsel'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ hata: 'Görsel dosyası gerekli' });
    const timestamp = Date.now();
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = timestamp + '-' + safeName;

    if (blob) {
      const result = await blob.put('images/' + fileName, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype,
      });
      return res.json({ url: result.url });
    }

    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({ url: '/public/uploads/' + fileName });
  } catch (err) {
    console.error('[POST /api/admin/gorsel-yukle] Hata:', err.message);
    res.status(500).json({ hata: 'Görsel yüklenemedi: ' + err.message });
  }
});

app.get('/api/admin/bulten', async (req, res) => {
  try {
    res.json({ data: await okuBulten() });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.get('/api/admin/haberler', async (req, res) => {
  try {
    res.json({ data: await okuHaberler() });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.post('/api/admin/haberler', async (req, res) => {
  try {
    const haberler = await okuHaberler();
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
    if (body.video && typeof body.video === 'object' && body.video.url) {
      yeni.video = body.video;
    }
    haberler.push(yeni);
    await yazHaberler(haberler);
    res.status(201).json(yeni);
  } catch (err) {
    console.error('[POST /api/admin/haberler] Hata:', err.message);
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.put('/api/admin/haberler/:id', async (req, res) => {
  try {
    const haberler = await okuHaberler();
    const id = parseInt(req.params.id, 10);
    const idx = haberler.findIndex((h) => h.id === id);
    if (idx === -1) return res.status(404).json({ hata: 'Haber bulunamadı' });
    const body = req.body || {};
    const mevcut = haberler[idx];
    const baslik = String(body.baslik !== undefined ? body.baslik : mevcut.baslik || '').trim();
    const slug = body.slug !== undefined && String(body.slug).trim() ? slugify(body.slug) : (body.baslik !== undefined ? slugify(baslik) : mevcut.slug);
    const icerik = body.icerik !== undefined ? body.icerik : mevcut.icerik;
    const yeniSonDakika = body.sonDakika !== undefined ? !!body.sonDakika : !!mevcut.sonDakika;
    const eskiSonDakika = !!mevcut.sonDakika;
    const sonDakikaBaslangic = yeniSonDakika
      ? (!eskiSonDakika ? new Date().toISOString() : (mevcut.sonDakikaBaslangic || new Date().toISOString()))
      : null;
    haberler[idx] = {
      id: mevcut.id,
      slug: slug || mevcut.slug,
      kategori: String(body.kategori !== undefined ? body.kategori : mevcut.kategori || '').trim(),
      baslik,
      ozet: String(body.ozet !== undefined ? body.ozet : mevcut.ozet || '').trim(),
      icerik: String(typeof icerik === 'string' ? icerik : mevcut.icerik || '').trim(),
      gorsel: String(body.gorsel !== undefined ? body.gorsel : mevcut.gorsel || '').trim() || mevcut.gorsel || '',
      yazar: String(body.yazar !== undefined ? body.yazar : mevcut.yazar || '').trim(),
      yayinTarihi: body.yayinTarihi !== undefined ? body.yayinTarihi : mevcut.yayinTarihi,
      okumaSuresi: body.okumaSuresi != null ? parseInt(body.okumaSuresi, 10) : (mevcut.okumaSuresi != null ? mevcut.okumaSuresi : okumaSuresiHesapla(icerik)),
      goruntulenme: body.goruntulenme != null ? parseInt(body.goruntulenme, 10) : (mevcut.goruntulenme || 0),
      sonDakika: yeniSonDakika,
      sonDakikaSure: body.sonDakikaSure != null ? (parseInt(body.sonDakikaSure, 10) || 6) : (mevcut.sonDakikaSure || 6),
      sonDakikaBaslangic: sonDakikaBaslangic,
      oneCikan: body.oneCikan !== undefined ? !!body.oneCikan : !!mevcut.oneCikan,
    };
    if (body.video !== undefined) {
      if (body.video && typeof body.video === 'object' && body.video.url) {
        haberler[idx].video = body.video;
      } else {
        delete haberler[idx].video;
      }
    } else if (mevcut.video) {
      haberler[idx].video = mevcut.video;
    }
    await yazHaberler(haberler);
    res.json(haberler[idx]);
  } catch (err) {
    console.error('[PUT /api/admin/haberler/:id] Hata:', err.message);
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.delete('/api/admin/haberler/:id', async (req, res) => {
  try {
    const haberler = await okuHaberler();
    const id = parseInt(req.params.id, 10);
    const idx = haberler.findIndex((h) => h.id === id);
    if (idx === -1) return res.status(404).json({ hata: 'Haber bulunamadı' });
    haberler.splice(idx, 1);
    await yazHaberler(haberler);
    res.json({ mesaj: 'Silindi' });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Anket (Public) -----
app.get('/api/anket', async (req, res) => {
  try {
    const anketler = await okuAnketler();
    const aktif = anketler.find((a) => a.aktif === true);
    if (!aktif) return res.json({ data: null });
    const ip = getClientIP(req);
    const oyVerdi = (aktif.oyVerenIpler || []).includes(ip);
    const { oyVerenIpler, ...publicData } = aktif;
    res.json({ data: { ...publicData, oyVerdi } });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.post('/api/anket/oy', async (req, res) => {
  try {
    const anketler = await okuAnketler();
    const aktifIdx = anketler.findIndex((a) => a.aktif === true);
    if (aktifIdx === -1) return res.status(404).json({ hata: 'Aktif anket bulunamadı' });
    const anket = anketler[aktifIdx];
    const ip = getClientIP(req);
    if ((anket.oyVerenIpler || []).includes(ip)) {
      return res.status(400).json({ hata: 'Bu ankete zaten oy verdiniz.' });
    }
    const secenekIdx = parseInt((req.body || {}).secenekIdx, 10);
    if (isNaN(secenekIdx) || secenekIdx < 0 || secenekIdx >= (anket.secenekler || []).length) {
      return res.status(400).json({ hata: 'Geçersiz seçenek' });
    }
    anket.secenekler[secenekIdx].oy = (anket.secenekler[secenekIdx].oy || 0) + 1;
    anket.toplamOy = (anket.toplamOy || 0) + 1;
    if (!anket.oyVerenIpler) anket.oyVerenIpler = [];
    anket.oyVerenIpler.push(ip);
    anketler[aktifIdx] = anket;
    await yazAnketler(anketler);
    const { oyVerenIpler, ...publicData } = anket;
    res.json({ data: { ...publicData, oyVerdi: true } });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- Admin: Anket CRUD -----
app.get('/api/admin/anket', async (req, res) => {
  try {
    res.json({ data: await okuAnketler() });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.post('/api/admin/anket', async (req, res) => {
  try {
    const anketler = await okuAnketler();
    const body = req.body || {};
    const maxId = anketler.length ? Math.max(...anketler.map((a) => a.id)) : 0;
    const soru = (body.soru || '').trim();
    if (!soru) return res.status(400).json({ hata: 'Soru gerekli' });
    const secenekler = (body.secenekler || []).filter((s) => s && s.metin && s.metin.trim());
    if (secenekler.length < 2) return res.status(400).json({ hata: 'En az 2 seçenek gerekli' });
    const aktif = !!body.aktif;
    if (aktif) {
      anketler.forEach((a) => { a.aktif = false; });
    }
    const yeni = {
      id: maxId + 1,
      soru,
      secenekler: secenekler.map((s) => ({ metin: s.metin.trim(), oy: 0 })),
      aktif,
      baslangicTarihi: body.baslangicTarihi || new Date().toISOString().slice(0, 10),
      bitisTarihi: body.bitisTarihi || '',
      olusturmaTarihi: new Date().toISOString(),
      toplamOy: 0,
      oyVerenIpler: [],
    };
    anketler.push(yeni);
    await yazAnketler(anketler);
    res.status(201).json(yeni);
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.put('/api/admin/anket/:id', async (req, res) => {
  try {
    const anketler = await okuAnketler();
    const id = parseInt(req.params.id, 10);
    const idx = anketler.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ hata: 'Anket bulunamadı' });
    const body = req.body || {};
    const mevcut = anketler[idx];
    if (body.aktif === true) {
      anketler.forEach((a) => { a.aktif = false; });
    }
    anketler[idx] = {
      ...mevcut,
      soru: body.soru !== undefined ? body.soru.trim() : mevcut.soru,
      secenekler: body.secenekler !== undefined
        ? body.secenekler.map((s, i) => ({
            metin: (s.metin || '').trim(),
            oy: mevcut.secenekler[i] ? mevcut.secenekler[i].oy : 0,
          }))
        : mevcut.secenekler,
      aktif: body.aktif !== undefined ? !!body.aktif : mevcut.aktif,
      baslangicTarihi: body.baslangicTarihi !== undefined ? body.baslangicTarihi : mevcut.baslangicTarihi,
      bitisTarihi: body.bitisTarihi !== undefined ? body.bitisTarihi : mevcut.bitisTarihi,
    };
    await yazAnketler(anketler);
    res.json(anketler[idx]);
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.delete('/api/admin/anket/:id', async (req, res) => {
  try {
    const anketler = await okuAnketler();
    const id = parseInt(req.params.id, 10);
    const idx = anketler.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ hata: 'Anket bulunamadı' });
    anketler.splice(idx, 1);
    await yazAnketler(anketler);
    res.json({ mesaj: 'Silindi' });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- Admin: Reklamlar CRUD -----
app.get('/api/admin/reklamlar', async (req, res) => {
  try {
    res.json({ data: await okuReklamlar() });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.post('/api/admin/reklamlar', async (req, res) => {
  try {
    const reklamlar = await okuReklamlar();
    const body = req.body || {};
    const slot = (body.slot || '').trim();
    if (!slot) return res.status(400).json({ hata: 'Slot gerekli' });

    // Aynı slot varsa güncelle, yoksa ekle
    const idx = reklamlar.findIndex((r) => r.slot === slot);
    const maxId = reklamlar.length ? Math.max(...reklamlar.map((r) => r.id)) : 0;

    const reklam = {
      id: idx !== -1 ? reklamlar[idx].id : maxId + 1,
      slot: slot,
      baslik: (body.baslik || '').trim() || slot,
      gorsel: (body.gorsel || '').trim(),
      link: (body.link || '').trim(),
      aktif: body.aktif !== undefined ? !!body.aktif : true,
    };

    if (idx !== -1) {
      reklamlar[idx] = reklam;
    } else {
      reklamlar.push(reklam);
    }

    await yazReklamlar(reklamlar);
    res.status(idx !== -1 ? 200 : 201).json(reklam);
  } catch (err) {
    console.error('[POST /api/admin/reklamlar] Hata:', err.message);
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.delete('/api/admin/reklamlar/:id', async (req, res) => {
  try {
    const reklamlar = await okuReklamlar();
    const id = parseInt(req.params.id, 10);
    const idx = reklamlar.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ hata: 'Reklam bulunamadı' });
    reklamlar.splice(idx, 1);
    await yazReklamlar(reklamlar);
    res.json({ mesaj: 'Silindi' });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Nöbetçi Eczane (Public) -----
app.get('/api/eczane', async (req, res) => {
  try {
    const liste = await okuEczane();
    res.json({ data: Array.isArray(liste) ? liste : [] });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Vefat Duyuruları (Public) -----
app.get('/api/vefat', async (req, res) => {
  try {
    const liste = await okuVefat();
    // Son 30 gün
    const now = Date.now();
    const aktif = (Array.isArray(liste) ? liste : []).filter(function(v) {
      if (!v.olusturma) return true;
      return (now - new Date(v.olusturma).getTime()) < 30 * 86400000;
    });
    res.json({ data: aktif });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- API: Üzüm Piyasa Fiyatları (Public) -----
app.get('/api/uzum-fiyat', async (req, res) => {
  try {
    const veri = await okuUzumFiyat();
    if (Array.isArray(veri)) {
      res.json({ data: veri, guncelleme: '' });
    } else {
      res.json({ data: veri.fiyatlar || [], guncelleme: veri.guncelleme || '' });
    }
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- Admin: Nöbetçi Eczane CRUD -----
app.get('/api/admin/eczane', async (req, res) => {
  try {
    res.json({ data: await okuEczane() });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.post('/api/admin/eczane', async (req, res) => {
  try {
    const body = req.body || {};
    const ad = (body.ad || '').trim();
    if (!ad) return res.status(400).json({ hata: 'Eczane adı gerekli' });
    const liste = await okuEczane();
    const arr = Array.isArray(liste) ? liste : [];
    arr.push({
      id: Date.now(),
      ad: ad,
      adres: (body.adres || '').trim(),
      telefon: (body.telefon || '').trim(),
      tarih: new Date().toISOString().slice(0, 10)
    });
    await yazEczane(arr);
    res.status(201).json({ mesaj: 'Eklendi', data: arr });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.put('/api/admin/eczane', async (req, res) => {
  try {
    const body = req.body || {};
    const liste = Array.isArray(body.liste) ? body.liste : [];
    await yazEczane(liste);
    res.json({ mesaj: 'Güncellendi', data: liste });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.delete('/api/admin/eczane/:id', async (req, res) => {
  try {
    const liste = await okuEczane();
    const arr = Array.isArray(liste) ? liste : [];
    const id = parseInt(req.params.id, 10);
    const idx = arr.findIndex(function(e) { return e.id === id; });
    if (idx === -1) return res.status(404).json({ hata: 'Bulunamadı' });
    arr.splice(idx, 1);
    await yazEczane(arr);
    res.json({ mesaj: 'Silindi' });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- Admin: Vefat CRUD -----
app.get('/api/admin/vefat', async (req, res) => {
  try {
    res.json({ data: await okuVefat() });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.post('/api/admin/vefat', async (req, res) => {
  try {
    const body = req.body || {};
    const ad = (body.ad || '').trim();
    if (!ad) return res.status(400).json({ hata: 'İsim gerekli' });
    const liste = await okuVefat();
    const arr = Array.isArray(liste) ? liste : [];
    arr.unshift({
      id: Date.now(),
      ad: ad,
      gorsel: (body.gorsel || '').trim(),
      detay: (body.detay || '').trim(),
      tarih: (body.tarih || '').trim() || new Date().toLocaleDateString('tr-TR'),
      olusturma: new Date().toISOString()
    });
    await yazVefat(arr);
    res.status(201).json({ mesaj: 'Eklendi', data: arr });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.delete('/api/admin/vefat/:id', async (req, res) => {
  try {
    const liste = await okuVefat();
    const arr = Array.isArray(liste) ? liste : [];
    const id = parseInt(req.params.id, 10);
    const idx = arr.findIndex(function(v) { return v.id === id; });
    if (idx === -1) return res.status(404).json({ hata: 'Bulunamadı' });
    arr.splice(idx, 1);
    await yazVefat(arr);
    res.json({ mesaj: 'Silindi' });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- Admin: Üzüm Fiyat CRUD -----
app.get('/api/admin/uzum-fiyat', async (req, res) => {
  try {
    const veri = await okuUzumFiyat();
    if (Array.isArray(veri)) {
      res.json({ data: { fiyatlar: veri, guncelleme: '' } });
    } else {
      res.json({ data: veri });
    }
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

app.put('/api/admin/uzum-fiyat', async (req, res) => {
  try {
    const body = req.body || {};
    const veri = {
      fiyatlar: Array.isArray(body.fiyatlar) ? body.fiyatlar : [],
      guncelleme: new Date().toLocaleDateString('tr-TR')
    };
    await yazUzumFiyat(veri);
    res.json({ mesaj: 'Güncellendi', data: veri });
  } catch (err) {
    res.status(500).json({ hata: 'Sunucu hatası: ' + err.message });
  }
});

// ----- RSS Feed -----
app.get('/api/rss', async (req, res) => {
  try {
    const haberler = await okuHaberler();
    const son20 = haberler.slice(0, 20);
    const baseUrl = 'https://ahmetlisosyal.com';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
    xml += '<channel>\n';
    xml += '<title>Ahmetli Medya</title>\n';
    xml += '<link>' + baseUrl + '</link>\n';
    xml += '<description>Üzüm diyarı Ahmetli\'den güncel haberler. Gündem, ekonomi, spor, magazin.</description>\n';
    xml += '<language>tr</language>\n';
    xml += '<atom:link href="' + baseUrl + '/api/rss" rel="self" type="application/rss+xml"/>\n';
    xml += '<lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n';

    son20.forEach(function(h) {
      xml += '<item>\n';
      xml += '<title><![CDATA[' + (h.baslik || '') + ']]></title>\n';
      xml += '<link>' + baseUrl + '/haber.html?slug=' + encodeURIComponent(h.slug) + '</link>\n';
      xml += '<description><![CDATA[' + (h.ozet || '') + ']]></description>\n';
      if (h.kategori) xml += '<category>' + h.kategori + '</category>\n';
      if (h.yayinTarihi) xml += '<pubDate>' + new Date(h.yayinTarihi).toUTCString() + '</pubDate>\n';
      xml += '<guid isPermaLink="true">' + baseUrl + '/haber.html?slug=' + encodeURIComponent(h.slug) + '</guid>\n';
      if (h.gorsel) xml += '<enclosure url="' + h.gorsel + '" type="image/jpeg" length="0"/>\n';
      xml += '</item>\n';
    });

    xml += '</channel>\n</rss>';

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=600');
    res.send(xml);
  } catch (err) {
    res.status(500).send('RSS oluşturma hatası');
  }
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

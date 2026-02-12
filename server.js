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

// Vercel Blob: sadece BLOB_READ_WRITE_TOKEN varsa kullan
let blob = null;
if (process.env.BLOB_READ_WRITE_TOKEN) {
  blob = require('@vercel/blob');
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const HABERLER_PATH = path.join(DATA_DIR, 'haberler.json');
const BULTEN_PATH = path.join(DATA_DIR, 'bulten.json');
const ANKET_PATH = path.join(DATA_DIR, 'anket.json');
const REKLAMLAR_PATH = path.join(DATA_DIR, 'reklamlar.json');

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

// ----- Veri okuma/yazma (Blob veya lokal dosya) -----

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

async function okuBlob(blobAdi, lokalYol) {
  if (!blob) return okuLokal(lokalYol);
  try {
    const { blobs } = await blob.list({ prefix: blobAdi, limit: 1 });
    if (blobs.length > 0) {
      const res = await fetch(blobs[0].url);
      if (res.ok) return await res.json();
    }
    // Blob yoksa lokal dosyadan seed'le
    const lokal = okuLokal(lokalYol);
    if (lokal.length > 0) {
      await yazBlob(blobAdi, lokal);
    }
    return lokal;
  } catch (e) {
    console.error('[Blob okuma hatası]', blobAdi, e.message);
    return okuLokal(lokalYol);
  }
}

async function yazBlob(blobAdi, liste) {
  if (!blob) {
    var lokalMap = { 'haberler.json': HABERLER_PATH, 'bulten.json': BULTEN_PATH, 'anket.json': ANKET_PATH, 'reklamlar.json': REKLAMLAR_PATH };
    return yazLokal(lokalMap[blobAdi] || BULTEN_PATH, liste);
  }
  try {
    await blob.put(blobAdi, JSON.stringify(liste, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
  } catch (e) {
    console.error('[Blob yazma hatası]', blobAdi, e.message);
    throw e;
  }
}

async function okuHaberler() {
  return okuBlob('haberler.json', HABERLER_PATH);
}

async function yazHaberler(liste) {
  return yazBlob('haberler.json', liste);
}

async function okuBulten() {
  return okuBlob('bulten.json', BULTEN_PATH);
}

async function yazBulten(liste) {
  return yazBlob('bulten.json', liste);
}

async function okuAnketler() {
  return okuBlob('anket.json', ANKET_PATH);
}

async function yazAnketler(liste) {
  return yazBlob('anket.json', liste);
}

async function okuReklamlar() {
  return okuBlob('reklamlar.json', REKLAMLAR_PATH);
}

async function yazReklamlar(liste) {
  return yazBlob('reklamlar.json', liste);
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

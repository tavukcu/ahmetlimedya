/**
 * Tek seferlik migrasyon: lokal JSON dosyalarından Neon Postgres'e veri aktarımı
 * Kullanım: node migrate-to-postgres.js
 */

const fs = require('fs');
const path = require('path');

// .env.local dosyasını oku (dotenv bağımlılığı olmadan)
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  });
}

const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL veya POSTGRES_URL bulunamadı. .env.local dosyasını kontrol edin.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const DATA_DIR = path.join(__dirname, 'data');

function okuJSON(dosya) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, dosya), 'utf8'));
  } catch (e) {
    console.warn(`${dosya} okunamadı, boş döndürülüyor:`, e.message);
    return [];
  }
}

async function migrate() {
  console.log('Tablolar oluşturuluyor...');

  await sql`CREATE TABLE IF NOT EXISTS haberler (
    id SERIAL PRIMARY KEY,
    slug TEXT,
    kategori TEXT,
    baslik TEXT,
    ozet TEXT,
    icerik TEXT,
    gorsel TEXT,
    video JSONB,
    yazar TEXT,
    yayin_tarihi TEXT,
    okuma_suresi INT DEFAULT 1,
    goruntulenme INT DEFAULT 0,
    son_dakika BOOLEAN DEFAULT false,
    son_dakika_sure INT DEFAULT 6,
    son_dakika_baslangic TEXT,
    one_cikan BOOLEAN DEFAULT false
  )`;

  await sql`CREATE TABLE IF NOT EXISTS bulten (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    tarih TEXT
  )`;

  await sql`CREATE TABLE IF NOT EXISTS anket (
    id SERIAL PRIMARY KEY,
    soru TEXT,
    secenekler JSONB,
    aktif BOOLEAN DEFAULT false,
    baslangic_tarihi TEXT,
    bitis_tarihi TEXT,
    olusturma_tarihi TEXT,
    toplam_oy INT DEFAULT 0,
    oy_veren_ipler TEXT[] DEFAULT '{}'
  )`;

  await sql`CREATE TABLE IF NOT EXISTS reklamlar (
    id SERIAL PRIMARY KEY,
    slot TEXT,
    baslik TEXT,
    gorsel TEXT,
    link TEXT,
    aktif BOOLEAN DEFAULT true
  )`;

  await sql`CREATE TABLE IF NOT EXISTS eczane (
    id BIGINT PRIMARY KEY,
    ad TEXT,
    adres TEXT,
    telefon TEXT,
    tarih TEXT
  )`;

  await sql`CREATE TABLE IF NOT EXISTS vefat (
    id BIGINT PRIMARY KEY,
    ad TEXT,
    gorsel TEXT,
    detay TEXT,
    tarih TEXT,
    olusturma TEXT
  )`;

  await sql`CREATE TABLE IF NOT EXISTS uzum_fiyat (
    id INT PRIMARY KEY DEFAULT 1,
    fiyatlar JSONB,
    guncelleme TEXT
  )`;

  console.log('Tablolar oluşturuldu.');

  // --- Haberler ---
  const haberler = okuJSON('haberler.json');
  if (haberler.length > 0) {
    console.log(`${haberler.length} haber aktarılıyor...`);
    await sql`TRUNCATE haberler RESTART IDENTITY`;
    for (const h of haberler) {
      await sql`INSERT INTO haberler (id, slug, kategori, baslik, ozet, icerik, gorsel, video, yazar, yayin_tarihi, okuma_suresi, goruntulenme, son_dakika, son_dakika_sure, son_dakika_baslangic, one_cikan)
        VALUES (${h.id}, ${h.slug}, ${h.kategori}, ${h.baslik}, ${h.ozet || ''}, ${h.icerik || ''}, ${h.gorsel || ''}, ${h.video ? JSON.stringify(h.video) : null}, ${h.yazar || ''}, ${h.yayinTarihi || ''}, ${h.okumaSuresi || 1}, ${h.goruntulenme || 0}, ${h.sonDakika || false}, ${h.sonDakikaSure || 6}, ${h.sonDakikaBaslangic || null}, ${h.oneCikan || false})`;
    }
    // Sequence'ı max id'ye ayarla
    await sql`SELECT setval('haberler_id_seq', (SELECT COALESCE(MAX(id),0) FROM haberler))`;
    console.log('Haberler aktarıldı.');
  }

  // --- Bülten ---
  const bulten = okuJSON('bulten.json');
  if (bulten.length > 0) {
    console.log(`${bulten.length} bülten abonesi aktarılıyor...`);
    await sql`TRUNCATE bulten RESTART IDENTITY`;
    for (const b of bulten) {
      await sql`INSERT INTO bulten (email, tarih) VALUES (${b.email}, ${b.tarih || ''}) ON CONFLICT (email) DO NOTHING`;
    }
    console.log('Bülten aktarıldı.');
  }

  // --- Anketler ---
  const anketler = okuJSON('anket.json');
  if (anketler.length > 0) {
    console.log(`${anketler.length} anket aktarılıyor...`);
    await sql`TRUNCATE anket RESTART IDENTITY`;
    for (const a of anketler) {
      await sql`INSERT INTO anket (id, soru, secenekler, aktif, baslangic_tarihi, bitis_tarihi, olusturma_tarihi, toplam_oy, oy_veren_ipler)
        VALUES (${a.id}, ${a.soru}, ${JSON.stringify(a.secenekler)}, ${a.aktif || false}, ${a.baslangicTarihi || ''}, ${a.bitisTarihi || ''}, ${a.olusturmaTarihi || ''}, ${a.toplamOy || 0}, ${a.oyVerenIpler || []})`;
    }
    await sql`SELECT setval('anket_id_seq', (SELECT COALESCE(MAX(id),0) FROM anket))`;
    console.log('Anketler aktarıldı.');
  }

  // --- Reklamlar ---
  const reklamlar = okuJSON('reklamlar.json');
  if (reklamlar.length > 0) {
    console.log(`${reklamlar.length} reklam aktarılıyor...`);
    await sql`TRUNCATE reklamlar RESTART IDENTITY`;
    for (const r of reklamlar) {
      await sql`INSERT INTO reklamlar (id, slot, baslik, gorsel, link, aktif)
        VALUES (${r.id}, ${r.slot || ''}, ${r.baslik || ''}, ${r.gorsel || ''}, ${r.link || ''}, ${r.aktif !== false})`;
    }
    await sql`SELECT setval('reklamlar_id_seq', (SELECT COALESCE(MAX(id),0) FROM reklamlar))`;
    console.log('Reklamlar aktarıldı.');
  }

  // --- Eczane ---
  const eczane = okuJSON('eczane.json');
  if (eczane.length > 0) {
    console.log(`${eczane.length} eczane aktarılıyor...`);
    await sql`TRUNCATE eczane`;
    for (const e of eczane) {
      await sql`INSERT INTO eczane (id, ad, adres, telefon, tarih)
        VALUES (${e.id}, ${e.ad || ''}, ${e.adres || ''}, ${e.telefon || ''}, ${e.tarih || ''})`;
    }
    console.log('Eczane aktarıldı.');
  }

  // --- Vefat ---
  const vefat = okuJSON('vefat.json');
  if (vefat.length > 0) {
    console.log(`${vefat.length} vefat duyurusu aktarılıyor...`);
    await sql`TRUNCATE vefat`;
    for (const v of vefat) {
      await sql`INSERT INTO vefat (id, ad, gorsel, detay, tarih, olusturma)
        VALUES (${v.id}, ${v.ad || ''}, ${v.gorsel || ''}, ${v.detay || ''}, ${v.tarih || ''}, ${v.olusturma || ''})`;
    }
    console.log('Vefat aktarıldı.');
  }

  // --- Üzüm Fiyat ---
  const uzumRaw = okuJSON('uzum-fiyat.json');
  const uzum = Array.isArray(uzumRaw) ? { fiyatlar: uzumRaw, guncelleme: '' } : uzumRaw;
  console.log('Üzüm fiyat aktarılıyor...');
  await sql`INSERT INTO uzum_fiyat (id, fiyatlar, guncelleme)
    VALUES (1, ${JSON.stringify(uzum.fiyatlar || [])}, ${uzum.guncelleme || ''})
    ON CONFLICT (id) DO UPDATE SET fiyatlar = EXCLUDED.fiyatlar, guncelleme = EXCLUDED.guncelleme`;
  console.log('Üzüm fiyat aktarıldı.');

  console.log('\nMigrasyon tamamlandı!');
}

migrate().catch((err) => {
  console.error('Migrasyon hatası:', err);
  process.exit(1);
});

/**
 * Ahmetli Medya - İnteraktif haber sitesi
 * Okuma çubuğu, Beğen/Paylaş, Bülten, Sidebar sekmeler
 */

// ----- Tarih (Türkçe) -----
function setCurrentDate() {
  const el = document.getElementById('currentDate');
  if (!el) return;
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('tr-TR', options);
}

// ----- Footer yılı -----
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

// ----- Okuma ilerleme çubuğu -----
function initReadingProgress() {
  const bar = document.getElementById('reading-progress-bar');
  if (!bar) return;
  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
    bar.style.width = pct + '%';
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ----- Beğen / Paylaş -----
function initHaberAksiyonlar() {
  const BEGEN_KEY = 'ahmetlimedya-begen';
  let begenenler = {};
  try {
    begenenler = JSON.parse(localStorage.getItem(BEGEN_KEY) || '{}');
  } catch (_) {}

  document.querySelectorAll('.haber-aksiyonlar__btn--begen').forEach((btn) => {
    const article = btn.closest('[data-haber-id]');
    const id = article ? article.getAttribute('data-haber-id') : null;
    const sayiEl = btn.querySelector('.haber-aksiyonlar__sayi');
    if (id && sayiEl) {
      const count = begenenler[id] ? 1 : 0;
      if (begenenler[id]) btn.classList.add('is-active');
      sayiEl.textContent = count;
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!id) return;
      const active = btn.classList.toggle('is-active');
      begenenler[id] = active;
      try {
        localStorage.setItem(BEGEN_KEY, JSON.stringify(begenenler));
      } catch (_) {}
      const sayi = btn.querySelector('.haber-aksiyonlar__sayi');
      if (sayi) sayi.textContent = active ? '1' : '0';
    });
  });

  document.querySelectorAll('.haber-aksiyonlar__btn--paylas').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const article = btn.closest('article');
      const title = article ? (article.querySelector('h1, h2, h3')?.textContent || '') : '';
      const url = window.location.href;
      const text = title ? `${title} - Ahmetli Medya` : 'Ahmetli Medya';

      if (navigator.share) {
        navigator.share({ title: text, url, text }).catch(() => copyLink(url, btn));
      } else {
        copyLink(url, btn);
      }
    });
  });

  // Facebook: paylaşım linkini href olarak ayarla (tıklanınca yeni sekmede açılır)
  const shareUrl = encodeURIComponent(window.location.href);
  document.querySelectorAll('.haber-aksiyonlar__btn--facebook').forEach((el) => {
    el.setAttribute('href', `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`);
    el.addEventListener('click', (e) => e.stopPropagation());
  });

  // Instagram: link kopyala (Instagram web’den doğrudan paylaşım desteklemediği için)
  document.querySelectorAll('.haber-aksiyonlar__btn--instagram').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyLink(window.location.href, btn);
      const orig = btn.getAttribute('aria-label');
      btn.setAttribute('aria-label', 'Link kopyalandı. Instagram\'da yapıştırarak paylaşabilirsiniz.');
      setTimeout(() => btn.setAttribute('aria-label', orig || 'Instagram\'da paylaş'), 2000);
    });
  });
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    if (btn) {
      const orig = btn.getAttribute('aria-label');
      btn.setAttribute('aria-label', 'Link kopyalandı');
      setTimeout(() => btn.setAttribute('aria-label', orig || 'Paylaş'), 1500);
    }
  }).catch(() => {});
}

// ----- Bülten formu (backend varsa POST /api/bulten) -----
function initNewsletter() {
  const form = document.getElementById('newsletter-form');
  const successEl = document.getElementById('newsletter-success');
  if (!form || !successEl) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const email = input?.value?.trim();
    if (!email) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    const prevText = submitBtn?.textContent;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch('/api/bulten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      form.hidden = true;
      if (data.mesaj) successEl.textContent = data.mesaj;
      successEl.hidden = false;
    } catch {
      form.hidden = true;
      successEl.hidden = false;
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      if (prevText) submitBtn.textContent = prevText;
    }
  });
}

// ----- Arama: ESC ile temizle -----
function initSearch() {
  const form = document.querySelector('.search-form');
  const input = form?.querySelector('.search-input');
  if (!input) return;
  form.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
    }
  });
}

// ----- Sidebar sekmeler -----
function initSidebarTabs() {
  const tabList = document.querySelector('.sidebar__tab-buttons');
  if (!tabList) return;
  const tabs = tabList.querySelectorAll('.sidebar__tab-btn');
  const panels = document.querySelectorAll('.sidebar__tab-panel');
  if (!tabs.length || !panels.length) return;

  function showPanel(index) {
    tabs.forEach((t, i) => {
      t.classList.toggle('active', i === index);
      t.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    panels.forEach((p, i) => {
      const show = i === index;
      p.classList.toggle('hidden', !show);
      p.hidden = !show;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showPanel(index));
  });
}

// ----- Mobil menü -----
function initNavToggle() {
  const toggle = document.querySelector('.nav-toggle');
  const overlay = document.getElementById('main-menu');
  const body = document.body;
  if (!toggle || !overlay) return;

  function openMenu() {
    overlay.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menüyü kapat');
    body.style.overflow = 'hidden';
  }
  function closeMenu() {
    overlay.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menüyü aç');
    body.style.overflow = '';
  }

  toggle.addEventListener('click', () => {
    const isOpen = overlay.getAttribute('aria-hidden') === 'false';
    if (isOpen) closeMenu();
    else openMenu();
  });

  overlay.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => closeMenu());
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') closeMenu();
  });
}

// ----- Yukarı çık -----
function initYukariCik() {
  const btn = document.getElementById('yukari-cik');
  if (!btn) return;
  function toggle() {
    if (window.scrollY > 400) btn.classList.add('is-visible');
    else btn.classList.remove('is-visible');
  }
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ----- Hava durumu (5 gün - Open-Meteo) -----
const HAVA_KOORD = { lat: 38.37, lon: 27.93 }; // Ahmetli, Manisa

const HAVA_KOD_ACIKLAMA = {
  0: 'Açık',
  1: 'Çoğunlukla açık',
  2: 'Parçalı bulutlu',
  3: 'Kapalı',
  45: 'Sisli',
  48: 'Sisli',
  51: 'Hafif çisenti',
  53: 'Çisenti',
  55: 'Çisenti',
  61: 'Hafif yağmur',
  63: 'Yağmurlu',
  65: 'Şiddetli yağmur',
  71: 'Hafif kar',
  73: 'Karlı',
  75: 'Yoğun kar',
  77: 'Kar taneleri',
  80: 'Hafif sağanak',
  81: 'Sağanak',
  82: 'Şiddetli sağanak',
  85: 'Hafif kar sağanağı',
  86: 'Kar sağanağı',
  95: 'Gök gürültülü fırtına',
  96: 'Gök gürültülü sağanak',
  99: 'Şiddetli gök gürültülü fırtına',
};

function havaKodToAciklama(code) {
  return HAVA_KOD_ACIKLAMA[code] || 'Bilinmiyor';
}

function havaKodToIcon(code) {
  if (code === 0) return 'sun';
  if (code === 1 || code === 2) return 'cloud-sun';
  if (code === 3) return 'cloud';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

function havaIconSvg(name) {
  const icons = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    'cloud-sun': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 2a5 5 0 0 1 3.8 8.2A4 4 0 0 1 16 18H6a4 4 0 0 1 .5-7.9A5 5 0 0 1 9.5 2z"/><circle cx="12" cy="12" r="3"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 18v2M8 18v2M12 20v2"/><path d="M19.5 14a4.5 4.5 0 0 0-7-3.5"/><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07l14.14-14.14M12 12l3 3 3-3-3-3M12 12l-3 3-3-3 3-3"/></svg>',
    fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 15h18M3 18h12M3 12h15"/></svg>',
    storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polygon points="13 11 9 17 15 17 11 23 13 11"/></svg>',
  };
  return icons[name] || icons.cloud;
}

function gunAdi(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'Bugün';
  if (d.getTime() === tomorrow.getTime()) return 'Yarın';
  const gunler = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  return gunler[d.getDay()];
}

function havaDoldur(bugunIkon, bugunSicaklik, bugunAciklama, bugunMax, bugunMin, list5, data) {
  const cur = data.current_weather;
  const daily = data.daily;
  const codeCur = cur && cur.weathercode != null ? cur.weathercode : daily.weathercode[0];

  if (bugunSicaklik) bugunSicaklik.textContent = (cur ? Math.round(cur.temperature) : Math.round(daily.temperature_2m_max[0])) + '°C';
  if (bugunAciklama) bugunAciklama.textContent = havaKodToAciklama(codeCur);
  if (bugunMax) bugunMax.textContent = Math.round(daily.temperature_2m_max[0]);
  if (bugunMin) bugunMin.textContent = Math.round(daily.temperature_2m_min[0]);
  if (bugunIkon) bugunIkon.innerHTML = havaIconSvg(havaKodToIcon(codeCur));

  const items = list5.querySelectorAll('.hava-durumu__gun');
  for (let i = 0; i < Math.min(5, daily.time.length); i++) {
    const code = daily.weathercode[i];
    const max = Math.round(daily.temperature_2m_max[i]);
    const min = Math.round(daily.temperature_2m_min[i]);
    items[i].querySelector('.hava-durumu__gun-ad').textContent = gunAdi(daily.time[i]);
    items[i].querySelector('.hava-durumu__gun-ikon').innerHTML = havaIconSvg(havaKodToIcon(code));
    items[i].querySelector('[data-max]').textContent = max;
    items[i].querySelector('[data-min]').textContent = min;
  }
}

function havaOrnekVeri() {
  const today = new Date();
  const time = [];
  const weathercode = [0, 1, 2, 1, 0, 2];
  const temperature_2m_max = [];
  const temperature_2m_min = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    time.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    temperature_2m_max.push(18 + i);
    temperature_2m_min.push(8 + i);
  }
  return {
    current_weather: { temperature: 16, weathercode: 1 },
    daily: { time, weathercode, temperature_2m_max, temperature_2m_min },
  };
}

function initHavaDurumu() {
  const bugunIkon = document.getElementById('hava-bugun-ikon');
  const bugunSicaklik = document.getElementById('hava-bugun-sicaklik');
  const bugunAciklama = document.getElementById('hava-bugun-aciklama');
  const bugunMax = document.getElementById('hava-bugun-max');
  const bugunMin = document.getElementById('hava-bugun-min');
  const list5 = document.getElementById('hava-5gun');
  if (!list5 || !bugunSicaklik) return;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${HAVA_KOORD.lat}&longitude=${HAVA_KOORD.lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Europe/Istanbul&forecast_days=6`;

  fetch(url)
    .then((res) => { if (!res.ok) throw new Error('API'); return res.json(); })
    .then((data) => {
      if (!data.daily || !data.daily.time || !data.daily.time.length) throw new Error('Veri yok');
      havaDoldur(bugunIkon, bugunSicaklik, bugunAciklama, bugunMax, bugunMin, list5, data);
    })
    .catch(() => {
      havaDoldur(bugunIkon, bugunSicaklik, bugunAciklama, bugunMax, bugunMin, list5, havaOrnekVeri());
      if (bugunAciklama) bugunAciklama.textContent = havaKodToAciklama(1) + ' (örnek veri)';
    });
}

// ----- Son dakika: üst bant ticker + sidebar -----
function initSonDakika() {
  fetch('/api/son-dakika')
    .then((res) => res.json())
    .then((result) => {
      const items = result.data || [];

      // Kırmızı bant: aktif son dakika varsa
      const tickerWrap = document.querySelector('.top-bar__ticker-wrap');
      if (tickerWrap) {
        tickerWrap.classList.toggle('top-bar__ticker-wrap--breaking', !!result.aktifSonDakika);
      }

      if (items.length === 0) return;

      // Üst bant ticker
      const tickerInner = document.getElementById('ticker-inner');
      if (tickerInner) {
        const spans = items.map((h) =>
          '<span>' + escapeHtmlFront(h.baslik) + '</span>'
        ).join('<span class="top-bar__ticker-sep">•</span>');
        // Sonsuz kaydırma için iki kez tekrarla
        tickerInner.innerHTML = spans + '<span class="top-bar__ticker-sep">•</span>' + spans + '<span class="top-bar__ticker-sep">•</span>';
      }

      // Sidebar son dakika kayan liste
      const sdList = document.querySelector('.son-dakika-ticker__list');
      if (sdList) {
        sdList.innerHTML = items.map((h) =>
          '<li><a href="haber.html?slug=' + encodeURIComponent(h.slug) + '">' + escapeHtmlFront(h.baslik) + '</a></li>'
        ).join('');
        const track = document.querySelector('.son-dakika-ticker__track');
        if (track) {
          const duplicate = track.querySelector('.son-dakika-ticker__list:nth-child(2)');
          if (duplicate) duplicate.innerHTML = sdList.innerHTML;
        }
      }
    })
    .catch(() => {
      // API unavailable, keep static/loading content
    });
}

// ----- API'den haberleri yükle -----
function initDynamicNews() {
  fetch('/api/haberler?limit=20')
    .then((res) => res.json())
    .then((result) => {
      const haberler = result.data || [];
      if (haberler.length === 0) return;

      // Manşet (10 haber, numaralı navigasyon)
      const mansetHaberler = haberler.slice(0, 10);
      window._mansetHaberler = mansetHaberler;
      mansetGoster(0);
      initMansetNav();

      // 3'lü kartlar (2., 3., 4. haber)
      const ucKartItems = document.querySelectorAll('.uc-kart__item');
      for (let i = 0; i < Math.min(3, ucKartItems.length); i++) {
        const h = haberler[i + 1];
        if (!h) break;
        const el = ucKartItems[i];
        el.dataset.haberId = h.id;
        const aLink = el.querySelector('a');
        if (aLink && h.slug) aLink.href = 'haber.html?slug=' + encodeURIComponent(h.slug);
        const img = el.querySelector('.uc-kart__img img');
        if (img && h.gorsel) { img.src = h.gorsel; img.alt = h.baslik; }
        const kat = el.querySelector('.uc-kart__kategori');
        if (kat) kat.textContent = h.kategori || '';
        const title = el.querySelector('.uc-kart__title');
        if (title) title.textContent = h.baslik;
        const meta = el.querySelector('.uc-kart__meta');
        if (meta) meta.textContent = zamanOnce(h.yayinTarihi) + ' · ' + (h.okumaSuresi || 2) + ' dk';
      }

      // 2 sütun haber kartları (5., 6. haber)
      const ikiItems = document.querySelectorAll('.haber-iki__item');
      for (let i = 0; i < Math.min(2, ikiItems.length); i++) {
        const h = haberler[i + 4];
        if (!h) break;
        const el = ikiItems[i];
        el.dataset.haberId = h.id;
        const aLink2 = el.querySelector('a');
        if (aLink2 && h.slug) aLink2.href = 'haber.html?slug=' + encodeURIComponent(h.slug);
        const img = el.querySelector('.haber-iki__img img');
        if (img && h.gorsel) { img.src = h.gorsel; img.alt = h.baslik; }
        const kat = el.querySelector('.haber-iki__kategori');
        if (kat) kat.textContent = h.kategori || '';
        const title = el.querySelector('.haber-iki__title');
        if (title) title.textContent = h.baslik;
        const meta = el.querySelector('.haber-iki__meta');
        if (meta) meta.textContent = zamanOnce(h.yayinTarihi) + ' · ' + (h.okumaSuresi || 2) + ' dk';
      }

      // Gündem başlık listesi
      const baslikList = document.querySelector('.baslik-listesi ul');
      if (baslikList && haberler.length > 1) {
        const gundemHaberleri = haberler.slice(0, 6);
        baslikList.innerHTML = gundemHaberleri.map((h) =>
          '<li><a href="haber.html?slug=' + encodeURIComponent(h.slug) + '">' + escapeHtmlFront(h.baslik) + '</a></li>'
        ).join('');
      }

      // Editörün Seçimi
      const editorList = document.querySelector('.editor-secimi__list');
      if (editorList && haberler.length >= 4) {
        editorList.innerHTML = haberler.slice(0, 4).map((h) =>
          '<li><a href="haber.html?slug=' + encodeURIComponent(h.slug) + '">' + escapeHtmlFront(h.baslik) + '</a></li>'
        ).join('');
      }

      // Re-init like/share buttons after DOM update
      initHaberAksiyonlar();
    })
    .catch(() => {
      // API unavailable, keep static content
    });
}

function mansetGoster(idx) {
  const haberler = window._mansetHaberler;
  if (!haberler || !haberler[idx]) return;
  const h = haberler[idx];
  const article = document.querySelector('.manset__article');
  if (!article) return;
  article.dataset.haberId = h.id;
  const link = article.querySelector('.manset__link');
  if (link && h.slug) link.href = 'haber.html?slug=' + encodeURIComponent(h.slug);
  const img = article.querySelector('.manset__img-wrap img');
  if (img && h.gorsel) { img.src = h.gorsel; img.alt = h.baslik; }
  const kat = article.querySelector('.manset__kategori');
  if (kat) kat.textContent = h.kategori || 'Gündem';
  const title = article.querySelector('.manset__title');
  if (title) title.textContent = h.baslik;
  const ozet = article.querySelector('.manset__ozet');
  if (ozet) ozet.textContent = h.ozet || '';
  const meta = article.querySelector('.manset__meta');
  if (meta) meta.textContent = (h.yazar || 'Editör') + ' · ' + zamanOnce(h.yayinTarihi) + ' · ' + (h.okumaSuresi || 3) + ' dk okuma';
  // Aktif numara güncelle
  document.querySelectorAll('.manset__nav-btn').forEach(function(btn) {
    btn.classList.toggle('active', parseInt(btn.dataset.mansetIdx, 10) === idx);
  });
}

var _mansetAutoTimer = null;

function initMansetNav() {
  var nav = document.getElementById('manset-nav');
  if (!nav) return;
  var btns = nav.querySelectorAll('.manset__nav-btn');
  // Mevcut haber sayısına göre butonları göster/gizle
  var count = (window._mansetHaberler || []).length;
  btns.forEach(function(btn) {
    var idx = parseInt(btn.dataset.mansetIdx, 10);
    if (idx >= count) { btn.style.display = 'none'; }
    btn.addEventListener('mouseenter', function() {
      mansetGoster(idx);
      clearInterval(_mansetAutoTimer);
    });
    btn.addEventListener('mouseleave', function() {
      mansetAutoPlay();
    });
  });
  // Otomatik geçiş
  mansetAutoPlay();
}

function mansetAutoPlay() {
  clearInterval(_mansetAutoTimer);
  var count = (window._mansetHaberler || []).length;
  if (count <= 1) return;
  var current = 0;
  _mansetAutoTimer = setInterval(function() {
    current = (current + 1) % count;
    mansetGoster(current);
  }, 5000);
}

function escapeHtmlFront(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function zamanOnce(dateStr) {
  if (!dateStr) return '';
  try {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = now - d;
    const dakika = Math.floor(diff / 60000);
    if (dakika < 1) return 'Az önce';
    if (dakika < 60) return dakika + ' dk önce';
    const saat = Math.floor(dakika / 60);
    if (saat < 24) return saat + ' saat önce';
    const gun = Math.floor(saat / 24);
    if (gun === 1) return 'Dün';
    if (gun < 7) return gun + ' gün önce';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch (e) { return ''; }
}

// ----- Arama - API ile -----
function initSearchAPI() {
  const form = document.querySelector('.search-form');
  const input = form?.querySelector('.search-input');
  if (!form || !input) return;

  let searchTimeout = null;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    doSearch(input.value.trim());
  });

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (input.value.trim().length >= 2) doSearch(input.value.trim());
    }, 400);
  });

  function doSearch(q) {
    if (!q) return;
    fetch('/api/ara?q=' + encodeURIComponent(q))
      .then((r) => r.json())
      .then((result) => {
        const list = result.data || [];
        const baslikList = document.querySelector('.baslik-listesi');
        if (baslikList) {
          const h2 = baslikList.querySelector('.baslik-listesi__baslik');
          if (h2) h2.textContent = '"' + q + '" arama sonuçları';
          const ul = baslikList.querySelector('ul');
          if (ul) {
            if (list.length === 0) {
              ul.innerHTML = '<li>Sonuç bulunamadı.</li>';
            } else {
              ul.innerHTML = list.map((h) =>
                '<li><a href="haber.html?slug=' + encodeURIComponent(h.slug) + '">' + escapeHtmlFront(h.baslik) + '</a> <small>(' + (h.kategori || '') + ')</small></li>'
              ).join('');
            }
          }
          baslikList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      })
      .catch(() => {});
  }
}

// ----- Döviz & Altın (Truncgil Finans API) -----
function initDovizAltin() {
  var ITEMS = [
    { key: 'USD', elDeger: 'doviz-usd', elDegisim: 'doviz-usd-degisim' },
    { key: 'EUR', elDeger: 'doviz-eur', elDegisim: 'doviz-eur-degisim' },
    { key: 'GBP', elDeger: 'doviz-gbp', elDegisim: 'doviz-gbp-degisim' },
    { key: 'GRA', elDeger: 'altin-gram', elDegisim: 'altin-gram-degisim' },
    { key: 'CEYREKALTIN', elDeger: 'altin-ceyrek', elDegisim: 'altin-ceyrek-degisim' },
  ];

  function formatFiyat(val) {
    var n = parseFloat(String(val).replace(',', '.'));
    if (isNaN(n)) return '–';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function guncelle() {
    fetch('/api/doviz')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        ITEMS.forEach(function(item) {
          var d = data[item.key];
          if (!d) return;
          var degerEl = document.getElementById(item.elDeger);
          var degisimEl = document.getElementById(item.elDegisim);
          if (degerEl) degerEl.textContent = formatFiyat(d.Selling || d.Buying);
          if (degisimEl) {
            var change = parseFloat(String(d.Change).replace(',', '.'));
            if (isNaN(change) || change === 0) {
              degisimEl.textContent = '';
              degisimEl.className = 'doviz-listesi__degisim';
            } else {
              var up = change > 0;
              degisimEl.textContent = (up ? '▲' : '▼') + ' %' + Math.abs(change).toFixed(2);
              degisimEl.className = 'doviz-listesi__degisim ' + (up ? 'doviz-listesi__degisim--up' : 'doviz-listesi__degisim--down');
            }
          }
        });
        var guncelEl = document.getElementById('doviz-guncelleme');
        if (guncelEl) {
          var saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
          guncelEl.textContent = 'Son güncelleme: ' + saat;
        }
      })
      .catch(function() {
        var guncelEl = document.getElementById('doviz-guncelleme');
        if (guncelEl) guncelEl.textContent = 'Güncellenemedi';
      });
  }

  guncelle();
  setInterval(guncelle, 5 * 60 * 1000);
}

// ----- Anket -----
function initAnket() {
  var container = document.getElementById('anket-icerik');
  if (!container) return;

  fetch('/api/anket')
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var anket = result.data;
      if (!anket) {
        container.innerHTML = '<p class="anket__bos">Anket yakında</p>';
        return;
      }

      if (anket.oyVerdi) {
        renderAnketSonuc(container, anket);
      } else {
        renderAnketForm(container, anket);
      }
    })
    .catch(function() {
      container.innerHTML = '<p class="anket__bos">Anket yakında</p>';
    });
}

function renderAnketForm(container, anket) {
  var html = '<p class="anket__soru">' + escapeHtmlFront(anket.soru) + '</p>';
  html += '<div class="anket__form">';
  anket.secenekler.forEach(function(s, i) {
    html += '<label class="anket__secenek">' +
      '<input type="radio" name="anket-oy" value="' + i + '">' +
      '<span class="anket__secenek-metin">' + escapeHtmlFront(s.metin) + '</span>' +
      '</label>';
  });
  html += '<button type="button" class="anket__btn" id="anket-gonder-btn" disabled>Oy Ver</button>';
  html += '</div>';
  container.innerHTML = html;

  var radios = container.querySelectorAll('input[name="anket-oy"]');
  var btn = document.getElementById('anket-gonder-btn');

  radios.forEach(function(r) {
    r.addEventListener('change', function() {
      btn.disabled = false;
    });
  });

  btn.addEventListener('click', function() {
    var selected = container.querySelector('input[name="anket-oy"]:checked');
    if (!selected) return;
    btn.disabled = true;
    btn.textContent = 'Gönderiliyor...';

    fetch('/api/anket/oy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secenekIdx: parseInt(selected.value, 10) })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (!res.ok) {
        var mesaj = res.data.hata || 'Oy gönderilemedi';
        btn.textContent = 'Oy Ver';
        btn.disabled = false;
        var existing = container.querySelector('.anket__mesaj');
        if (existing) existing.remove();
        var msgEl = document.createElement('p');
        msgEl.className = 'anket__mesaj anket__mesaj--hata';
        msgEl.textContent = mesaj;
        container.querySelector('.anket__form').appendChild(msgEl);
        return;
      }
      renderAnketSonuc(container, res.data.data || res.data);
    })
    .catch(function() {
      btn.textContent = 'Oy Ver';
      btn.disabled = false;
    });
  });
}

function renderAnketSonuc(container, anket) {
  var toplam = anket.toplamOy || 0;
  var html = '<p class="anket__soru">' + escapeHtmlFront(anket.soru) + '</p>';
  html += '<div class="anket__sonuclar">';
  anket.secenekler.forEach(function(s) {
    var oy = s.oy || 0;
    var yuzde = toplam > 0 ? Math.round((oy / toplam) * 100) : 0;
    html += '<div class="anket__sonuc-item">' +
      '<div class="anket__sonuc-baslik">' +
      '<span>' + escapeHtmlFront(s.metin) + '</span>' +
      '<span class="anket__sonuc-yuzde">%' + yuzde + '</span>' +
      '</div>' +
      '<div class="anket__sonuc-bar">' +
      '<div class="anket__sonuc-dolgu" data-yuzde="' + yuzde + '"></div>' +
      '</div>' +
      '</div>';
  });
  html += '</div>';
  html += '<p class="anket__toplam">Toplam ' + toplam + ' oy</p>';
  container.innerHTML = html;

  // Animasyonlu bar geçişi
  requestAnimationFrame(function() {
    container.querySelectorAll('.anket__sonuc-dolgu').forEach(function(bar) {
      bar.style.width = bar.dataset.yuzde + '%';
    });
  });
}

// ----- Init -----
document.addEventListener('DOMContentLoaded', () => {
  setCurrentDate();
  setFooterYear();
  initReadingProgress();
  initHaberAksiyonlar();
  initNewsletter();
  initSearch();
  initSearchAPI();
  initSidebarTabs();
  initNavToggle();
  initYukariCik();
  initHavaDurumu();
  initSonDakika();
  initDovizAltin();
  initDynamicNews();
  initAnket();
});

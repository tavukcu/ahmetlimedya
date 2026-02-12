/**
 * Ahmetli Medya - İnteraktif haber sitesi
 * Okuma çubuğu, Beğen/Paylaş, Bülten, Sidebar sekmeler
 */

// ----- Karanlık Mod -----
function initDarkMode() {
  var saved = localStorage.getItem('ahmetli-theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  function updateIcon() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark ? '&#9788;' : '&#9790;';
    btn.setAttribute('aria-label', isDark ? 'Aydınlık mod' : 'Karanlık mod');
  }
  updateIcon();
  btn.addEventListener('click', function() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('ahmetli-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('ahmetli-theme', 'dark');
    }
    updateIcon();
  });
}

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

      // Re-init after DOM update
      initHaberAksiyonlar();
      initKategoriRenk();
      initTarihBadge();
      initImageBlurLoad();
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

// ----- Video Haberler (anasayfa) -----
function initVideoHaberler() {
  var section = document.getElementById('video-haberler-section');
  var grid = document.getElementById('video-haberler-grid');
  if (!section || !grid) return;

  fetch('/api/haberler?limit=20')
    .then(function(res) { return res.json(); })
    .then(function(result) {
      var haberler = (result.data || []).filter(function(h) { return h.video && h.video.url; });
      if (haberler.length === 0) return;

      section.hidden = false;
      var gosterilecek = haberler.slice(0, 6);

      grid.innerHTML = gosterilecek.map(function(h) {
        var thumbnail = (h.video && h.video.kapak) ? h.video.kapak : (h.gorsel || '');
        var imgHtml = thumbnail
          ? '<img src="' + escapeHtmlFront(thumbnail) + '" alt="' + escapeHtmlFront(h.baslik) + '" loading="lazy">'
          : '';
        return '<article class="video-haberler__item" data-slug="' + encodeURIComponent(h.slug) + '">'
          + '<div class="video-haberler__img-wrap">'
          + imgHtml
          + '<span class="video-haberler__play"></span>'
          + '</div>'
          + '<div class="video-haberler__body">'
          + '<h3 class="video-haberler__title">' + escapeHtmlFront(h.baslik) + '</h3>'
          + '<span class="video-haberler__meta">' + zamanOnce(h.yayinTarihi) + '</span>'
          + '</div>'
          + '</article>';
      }).join('');

      grid.querySelectorAll('.video-haberler__item').forEach(function(item) {
        item.addEventListener('click', function() {
          window.location.href = 'haber.html?slug=' + item.dataset.slug;
        });
      });
    })
    .catch(function() {});
}

// ----- Reklamlar -----
function loadReklamlar() {
  fetch('/api/reklamlar')
    .then(function (r) { return r.json(); })
    .then(function (result) {
      var reklamlar = result.data || [];
      reklamlar.forEach(function (r) {
        var slotEl = document.querySelector('[data-reklam-slot="' + r.slot + '"]');
        if (!slotEl) return;
        if (r.gorsel) {
          var html = '<img src="' + r.gorsel + '" alt="' + (r.baslik || 'Reklam') + '" style="max-width:100%;height:auto;display:block">';
          if (r.link) {
            html = '<a href="' + r.link + '" target="_blank" rel="noopener noreferrer">' + html + '</a>';
          }
          slotEl.innerHTML = html;
        }
      });
    })
    .catch(function () {});
}

// ----- Günün Takvimi (Namaz + Hicri + Söz + Önemli Gün) -----
var HICRI_AYLAR = [
  'Muharrem', 'Safer', 'Rebiülevvel', 'Rebiülahir',
  'Cemaziyelevvel', 'Cemaziyelahir', 'Recep', 'Şaban',
  'Ramazan', 'Şevval', 'Zilkade', 'Zilhicce'
];

var GUNUN_SOZLERI = [
  'Sabrın sonu selamettir.',
  'Damlaya damlaya göl olur.',
  'Bir elin nesi var, iki elin sesi var.',
  'Ak akçe kara gün içindir.',
  'Ağaç yaşken eğilir.',
  'Her işte bir hayır vardır.',
  'İlim ilim bilmektir, ilim kendin bilmektir.',
  'Komşu komşunun külüne muhtaçtır.',
  'Güneş balçıkla sıvanmaz.',
  'Emek olmadan yemek olmaz.',
  'Yuvarlanan taş yosun tutmaz.',
  'Bugünün işini yarına bırakma.',
  'Ağacı kurt, insanı dert yer.',
  'Bilmemek ayıp değil, sormamak ayıptır.',
  'Birlikten kuvvet doğar.',
  'Dost kara günde belli olur.',
  'Hayırlı komşu, hayırsız akrabadan iyidir.',
  'İşleyen demir pas tutmaz.',
  'Sakla samanı gelir zamanı.',
  'Taşıma su ile değirmen dönmez.',
  'Üzüm üzüme baka baka kararır.',
  'Tatlı dil yılanı deliğinden çıkarır.',
  'Çalışmak ibadetin yarısıdır.',
  'El elden üstündür.',
  'Gülme komşuna gelir başına.',
  'Nerede birlik orada dirlik.',
  'Söz gümüşse sükut altındır.',
  'Güzel söz can azığıdır.',
  'Her yokuşun bir inişi vardır.',
  'İyilik eden iyilik bulur.',
  'Küçük adımlar büyük yolculuklar başlatır.',
  'Dağ dağa kavuşmaz, insan insana kavuşur.',
  'Korkak bezirgan ne kâr eder ne zarar.',
  'Rüzgar eken fırtına biçer.',
  'İnsan yedisiyle yetmişinde birdir.',
  'Ağlamayan çocuğa meme vermezler.',
  'Atalarımızın sözü aklımızın süzgeci.',
  'Bıçak yarası geçer, dil yarası geçmez.',
  'Çok yaşayan değil, çok gezen bilir.',
  'Dervişin fikri neyse zikri odur.',
  'Gönül ne kahve ister ne kahvehane, gönül muhabbet ister.',
  'Her kuşun eti yenmez.',
  'İğneyi kendine batır, çuvaldızı başkasına.',
  'Kırk yıllık Kani, olur mu Yani.',
  'Meyveli ağacı taşlarlar.',
  'Nasihat isteyen çok, tutanı az.',
  'Olmaz olmaz deme, olmaz olmaz.',
  'Bakmakla öğrenilse kediler kasap olurdu.',
  'Yer demir, gök bakır olsa da ümidini kaybetme.',
  'Zaman her şeyin ilacıdır.'
];

var ONEMLI_GUNLER = {
  '01-01': 'Yılbaşı',
  '03-18': 'Çanakkale Zaferi',
  '04-23': 'Ulusal Egemenlik ve Çocuk Bayramı',
  '05-01': 'Emek ve Dayanışma Günü',
  '05-19': 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı',
  '07-15': '15 Temmuz Demokrasi ve Millî Birlik Günü',
  '08-30': 'Zafer Bayramı',
  '09-09': 'İzmir\'in Kurtuluşu',
  '10-29': 'Cumhuriyet Bayramı',
  '11-10': 'Atatürk\'ü Anma Günü',
  '11-24': 'Öğretmenler Günü'
};

// Ay fazı hesaplama (sinodik ay = ~29.53 gün, referans yeni ay: 6 Ocak 2000)
var AY_FAZLARI = [
  { ad: 'Yeni Ay',           ikon: '\uD83C\uDF11', tarim: 'Ekim ve dikim için uygun. Toprak üstü ürünlerde verimli dönem başlangıcı.' },
  { ad: 'Hilal (Büyüyen)',   ikon: '\uD83C\uDF12', tarim: 'Yapraklı sebzeler, tahıllar ve çiçek ekimi için ideal dönem.' },
  { ad: 'İlk Dördün',        ikon: '\uD83C\uDF13', tarim: 'Meyveli bitkiler, domates, biber, fasulye ekimi için en verimli dönem.' },
  { ad: 'Dolunaya Giden Ay', ikon: '\uD83C\uDF14', tarim: 'Meyve toplama, hasat ve aşılama için uygun. Bitki suyu yukarı çıkar.' },
  { ad: 'Dolunay',           ikon: '\uD83C\uDF15', tarim: 'Hasat, budama ve kök bitkiler ekimi için ideal. Aşılama yapılabilir.' },
  { ad: 'Küçülen Ay',        ikon: '\uD83C\uDF16', tarim: 'Kök sebzeler (soğan, patates, havuç) ekimi için uygun dönem.' },
  { ad: 'Son Dördün',        ikon: '\uD83C\uDF17', tarim: 'Budama, ot biçme ve zararlı ilaçlama için en uygun dönem.' },
  { ad: 'Hilal (Küçülen)',   ikon: '\uD83C\uDF18', tarim: 'Dinlenme dönemi. Toprak hazırlığı ve kompost çalışması yapılabilir.' }
];

function ayFaziHesapla(tarih) {
  var sinodikAy = 29.53058770576;
  var referans = new Date(2000, 0, 6, 18, 14, 0); // 6 Ocak 2000 18:14 UTC - bilinen yeni ay
  var farkGun = (tarih.getTime() - referans.getTime()) / 86400000;
  var faz = ((farkGun % sinodikAy) + sinodikAy) % sinodikAy;
  var idx = Math.round(faz / (sinodikAy / 8)) % 8;
  return { idx: idx, gun: Math.round(faz), toplam: Math.round(sinodikAy) };
}

function initTakvim() {
  var now = new Date();
  var gun = now.getDate();
  var ay = now.getMonth();
  var yil = now.getFullYear();
  var gunAdilar = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  var ayAdlar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  // Miladi tarih
  var gunNoEl = document.getElementById('takvim-gun-no');
  var ayYilEl = document.getElementById('takvim-ay-yil');
  var gunAdiEl = document.getElementById('takvim-gun-adi');
  if (gunNoEl) gunNoEl.textContent = gun;
  if (ayYilEl) ayYilEl.textContent = ayAdlar[ay] + ' ' + yil;
  if (gunAdiEl) gunAdiEl.textContent = gunAdilar[now.getDay()];

  // Ay durumu
  var ayFazi = ayFaziHesapla(now);
  var fazBilgi = AY_FAZLARI[ayFazi.idx];
  var ayIkonEl = document.getElementById('takvim-ay-ikon');
  var ayFazEl = document.getElementById('takvim-ay-faz');
  var ayTarimEl = document.getElementById('takvim-ay-tarim');
  if (ayIkonEl) ayIkonEl.textContent = fazBilgi.ikon;
  if (ayFazEl) ayFazEl.textContent = fazBilgi.ad;
  if (ayTarimEl) ayTarimEl.textContent = fazBilgi.tarim;

  // Günün sözü (günün sırasına göre)
  var yilGunu = Math.floor((now - new Date(yil, 0, 1)) / 86400000);
  var sozIdx = yilGunu % GUNUN_SOZLERI.length;
  var sozEl = document.getElementById('takvim-soz');
  if (sozEl) sozEl.textContent = GUNUN_SOZLERI[sozIdx];

  // Önemli gün kontrolü
  var mmdd = String(ay + 1).padStart(2, '0') + '-' + String(gun).padStart(2, '0');
  var onemliEl = document.getElementById('takvim-onemli-gun');
  var onemliTextEl = document.getElementById('takvim-onemli-gun-text');
  if (ONEMLI_GUNLER[mmdd] && onemliEl && onemliTextEl) {
    onemliTextEl.textContent = ONEMLI_GUNLER[mmdd];
    onemliEl.hidden = false;
  }

  // API çağrısı (sessionStorage cache)
  var cacheKey = 'takvim-cache-' + gun + '-' + (ay + 1) + '-' + yil;
  var cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(cacheKey)); } catch (_) {}

  if (cached) {
    takvimDoldur(cached);
  } else {
    var tarihStr = String(gun).padStart(2, '0') + '-' + String(ay + 1).padStart(2, '0') + '-' + yil;
    fetch('https://api.aladhan.com/v1/timings/' + tarihStr + '?latitude=' + HAVA_KOORD.lat + '&longitude=' + HAVA_KOORD.lon + '&method=13')
      .then(function(res) { if (!res.ok) throw new Error('API'); return res.json(); })
      .then(function(json) {
        if (json.code === 200 && json.data) {
          try { sessionStorage.setItem(cacheKey, JSON.stringify(json.data)); } catch (_) {}
          takvimDoldur(json.data);
        }
      })
      .catch(function() {
        // API hatası: miladi tarih + söz + önemli gün zaten çalışıyor
      });
  }
}

function takvimDoldur(data) {
  // Namaz vakitleri
  var timings = data.timings;
  if (timings) {
    var map = {
      'namaz-imsak': timings.Fajr,
      'namaz-gunes': timings.Sunrise,
      'namaz-ogle': timings.Dhuhr,
      'namaz-ikindi': timings.Asr,
      'namaz-aksam': timings.Maghrib,
      'namaz-yatsi': timings.Isha
    };
    Object.keys(map).forEach(function(id) {
      var el = document.getElementById(id);
      if (el && map[id]) {
        // Saat değerinden timezone kısmını temizle (ör: "05:43 (EET)" → "05:43")
        el.textContent = map[id].replace(/\s*\(.*\)/, '');
      }
    });
  }

  // Hicri tarih
  var hijri = data.date && data.date.hijri;
  if (hijri) {
    var hicriEl = document.getElementById('takvim-hicri');
    if (hicriEl) {
      var hicriAyIdx = parseInt(hijri.month.number, 10) - 1;
      var hicriAyAd = HICRI_AYLAR[hicriAyIdx] || hijri.month.en;
      hicriEl.textContent = hijri.day + ' ' + hicriAyAd + ' ' + hijri.year;
    }
  }
}

// ----- Splash Screen -----
function initSplash() {
  var splash = document.getElementById('splash-screen');
  if (!splash) return;
  // Daha önce bu oturumda gösterildiyse atla
  if (sessionStorage.getItem('ahmetli-splash-shown')) {
    splash.classList.add('is-hidden');
    splash.remove();
    return;
  }
  sessionStorage.setItem('ahmetli-splash-shown', '1');
  setTimeout(function() {
    splash.classList.add('is-hidden');
    setTimeout(function() { splash.remove(); }, 600);
  }, 1800);
}

// ----- Fotoğraf Blur Yükleme -----
function initImageBlurLoad() {
  var images = document.querySelectorAll('.uc-kart__img img, .haber-iki__img img, .manset__img-wrap img');
  images.forEach(function(img) {
    if (img.complete) return;
    img.classList.add('img-blur-load');
    img.addEventListener('load', function() {
      img.classList.add('is-loaded');
    });
    img.addEventListener('error', function() {
      img.classList.add('is-loaded');
    });
  });
}

// ----- Kategori Renk Sistemi -----
function initKategoriRenk() {
  var renkMap = {
    'gündem': 'kategori--gundem',
    'spor': 'kategori--spor',
    'ekonomi': 'kategori--ekonomi',
    'magazin': 'kategori--magazin',
    'kültür-sanat': 'kategori--kultur-sanat',
    'kültür sanat': 'kategori--kultur-sanat',
    'teknoloji': 'kategori--teknoloji',
    'yaşam': 'kategori--yasam'
  };
  var etiketler = document.querySelectorAll('.manset__kategori, .uc-kart__kategori, .haber-iki__kategori');
  etiketler.forEach(function(el) {
    var text = (el.textContent || '').trim().toLowerCase();
    var cls = renkMap[text];
    if (cls) el.classList.add(cls);
  });
}

// ----- Tarih Badge'leri -----
function initTarihBadge() {
  var metaEls = document.querySelectorAll('.uc-kart__meta, .haber-iki__meta, .manset__meta');
  metaEls.forEach(function(el) {
    var text = el.textContent || '';
    var badge = '';
    if (text.match(/az önce|dk önce|1 saat önce|2 saat önce|3 saat önce/i)) {
      badge = '<span class="tarih-badge tarih-badge--bugun">Bugün</span>';
    } else if (text.match(/\d+ saat önce/i)) {
      badge = '<span class="tarih-badge tarih-badge--bugun">Bugün</span>';
    } else if (text.match(/dün/i)) {
      badge = '<span class="tarih-badge tarih-badge--dun">Dün</span>';
    }
    if (badge) el.innerHTML = badge + el.innerHTML;
  });
}

// ----- Parallax Header -----
function initParallax() {
  var pattern = document.querySelector('.main-header__pattern');
  if (!pattern) return;
  function update() {
    var scrollY = window.scrollY;
    if (scrollY < 400) {
      pattern.style.transform = 'translateY(' + (scrollY * 0.3) + 'px)';
    }
  }
  window.addEventListener('scroll', update, { passive: true });
}

// ----- Sayfa Geçiş Animasyonu -----
function initPageTransitions() {
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    // Sadece aynı site linkleri
    if (!href || href.startsWith('#') || href.startsWith('javascript') || href.startsWith('mailto') || href.startsWith('tel') || href.startsWith('http') || link.target === '_blank') return;
    e.preventDefault();
    document.body.classList.add('is-leaving');
    setTimeout(function() {
      window.location.href = href;
    }, 250);
  });
}

// ----- Ripple Efekti -----
function initRipple() {
  var buttons = document.querySelectorAll('.nav-link, .search-btn, .newsletter-form__btn, .anket__btn, .whatsapp-hatti__btn');
  buttons.forEach(function(btn) {
    btn.classList.add('btn-ripple');
  });
}

// ----- Scroll Reveal Animasyonları -----
function initScrollReveal() {
  var items = document.querySelectorAll('.uc-kart__item, .haber-iki__item, .sidebar__box, .uzum-bolumu, .whatsapp-hatti, .vefat-bolumu, .newsletter');
  if (!items.length || !('IntersectionObserver' in window)) return;
  items.forEach(function(el) { el.classList.add('reveal'); });
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  items.forEach(function(el) { observer.observe(el); });
}

// ----- Nöbetçi Eczane -----
function initEczane() {
  var container = document.getElementById('eczane-icerik');
  if (!container) return;
  fetch('/api/eczane')
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var liste = result.data || [];
      if (liste.length === 0) {
        container.innerHTML = '<p class="eczane__bos">Nöbetçi eczane bilgisi girilmemiş.</p>';
        return;
      }
      container.innerHTML = liste.map(function(e) {
        return '<div class="eczane__item">'
          + '<span class="eczane__ad">' + escapeHtmlFront(e.ad) + '</span>'
          + '<span class="eczane__adres">' + escapeHtmlFront(e.adres) + '</span>'
          + (e.telefon ? '<a href="tel:' + e.telefon + '" class="eczane__tel">' + escapeHtmlFront(e.telefon) + '</a>' : '')
          + '</div>';
      }).join('');
    })
    .catch(function() {
      container.innerHTML = '<p class="eczane__bos">Bilgi yüklenemedi.</p>';
    });
}

// ----- Vefat Duyuruları -----
function initVefat() {
  var section = document.getElementById('vefat-section');
  var list = document.getElementById('vefat-list');
  if (!section || !list) return;
  fetch('/api/vefat')
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var items = result.data || [];
      if (items.length === 0) return;
      section.hidden = false;
      list.innerHTML = items.map(function(v) {
        return '<div class="vefat__item">'
          + '<div class="vefat__ad">' + escapeHtmlFront(v.ad) + '</div>'
          + '<div class="vefat__detay">' + escapeHtmlFront(v.detay || '') + '</div>'
          + '<div class="vefat__tarih">' + escapeHtmlFront(v.tarih || '') + '</div>'
          + '</div>';
      }).join('');
    })
    .catch(function() {});
}

// ----- Üzüm Piyasa Fiyatları -----
function initUzumFiyat() {
  var container = document.getElementById('uzum-fiyat-icerik');
  if (!container) return;
  fetch('/api/uzum-fiyat')
    .then(function(r) { return r.json(); })
    .then(function(result) {
      var liste = result.data || [];
      if (liste.length === 0) {
        container.innerHTML = '<p class="eczane__bos">Fiyat bilgisi girilmemiş.</p>';
        return;
      }
      var html = '<div class="uzum-fiyat__list">';
      liste.forEach(function(f) {
        html += '<div class="uzum-fiyat__item">'
          + '<span class="uzum-fiyat__ad">' + escapeHtmlFront(f.tur) + '</span>'
          + '<span class="uzum-fiyat__deger">' + escapeHtmlFront(f.fiyat) + ' TL/kg</span>'
          + '</div>';
      });
      html += '</div>';
      if (result.guncelleme) {
        html += '<p class="uzum-fiyat__guncelleme">Son güncelleme: ' + escapeHtmlFront(result.guncelleme) + '</p>';
      }
      container.innerHTML = html;
    })
    .catch(function() {
      container.innerHTML = '<p class="eczane__bos">Fiyat bilgisi yüklenemedi.</p>';
    });
}

// ----- Init -----
document.addEventListener('DOMContentLoaded', () => {
  initSplash();
  initDarkMode();
  setCurrentDate();
  setFooterYear();
  initReadingProgress();
  initImageBlurLoad();
  initHaberAksiyonlar();
  initNewsletter();
  initSearch();
  initSearchAPI();
  initSidebarTabs();
  initNavToggle();
  initYukariCik();
  initTakvim();
  initHavaDurumu();
  initSonDakika();
  initDovizAltin();
  initDynamicNews();
  initAnket();
  initVideoHaberler();
  loadReklamlar();
  initScrollReveal();
  initEczane();
  initVefat();
  initUzumFiyat();
  initKategoriRenk();
  initTarihBadge();
  initParallax();
  initPageTransitions();
  initRipple();
  // Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  }
});

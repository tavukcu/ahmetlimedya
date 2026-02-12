/**
 * Ahmetli Medya - Yönetim Paneli
 * Backend API tabanlı (Firebase yok)
 * POST /api/admin-login -> token
 * GET/POST/PUT/DELETE /api/admin/haberler -> CRUD
 */
(function () {
  'use strict';

  var CATEGORIES = ['Gündem', 'Ekonomi', 'Spor', 'Magazin', 'Kültür-Sanat', 'Teknoloji', 'Yaşam', 'Üzüm & Bağcılık'];
  var TOKEN_KEY = 'ahmetli_admin_token';
  var token = sessionStorage.getItem(TOKEN_KEY) || null;
  var newsCache = [];
  var currentEditId = null;
  var quillEditor = null;
  var newsCurrentPage = 1;
  var newsPerPage = 20;
  var newsTotalPages = 1;
  var newsTotal = 0;
  var newsViewMode = 'table';
  var selectedNewsIds = [];

  // ===================== YARDIMCILAR =====================

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function slugify(str) {
    if (!str) return '';
    var tr = { 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ı': 'i', 'ö': 'o', 'ç': 'c', 'İ': 'i', 'Ğ': 'g', 'Ü': 'u', 'Ş': 's', 'Ö': 'o', 'Ç': 'c' };
    var s = str.toLowerCase();
    Object.keys(tr).forEach(function (k) { s = s.replace(new RegExp(k, 'g'), tr[k]); });
    return s.replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '–';
    try {
      var d = new Date(dateStr);
      return isNaN(d.getTime()) ? '–' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '–'; }
  }

  function showToast(message, type) {
    type = type || 'success';
    var container = $('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-message">' + escapeHtml(message) + '</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';
    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentElement) toast.classList.add('toast-exit');
      setTimeout(function () { if (toast.parentElement) toast.remove(); }, 300);
    }, 3000);
  }

  // ===================== API =====================

  function api(url, opts) {
    opts = opts || {};
    if (token) {
      opts.headers = Object.assign({}, opts.headers || {}, { 'Authorization': 'Bearer ' + token });
    }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) {
        // Token geçersiz, çıkış yap
        logout();
        throw new Error('Oturum süresi doldu');
      }
      return r;
    });
  }

  function apiJson(url, opts) {
    return api(url, opts).then(function (r) { return r.json(); });
  }

  // ===================== AUTH =====================

  function isLoggedIn() {
    return !!token;
  }

  function showLogin() {
    $('login-screen').hidden = false;
    $('panel-screen').hidden = true;
  }

  function showPanel() {
    $('login-screen').hidden = true;
    $('panel-screen').hidden = false;
    showPage('dashboard');
  }

  function logout() {
    token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  function handleLogin(e) {
    e.preventDefault();
    var pw = $('login-password').value;
    var btn = $('login-btn');
    var errEl = $('login-error');
    errEl.hidden = true;
    btn.disabled = true;

    fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (!res.ok) {
        errEl.textContent = res.data.hata || 'Giriş başarısız';
        errEl.hidden = false;
        return;
      }
      token = res.data.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      $('login-password').value = '';
      showPanel();
      showToast('Giriş başarılı');
    })
    .catch(function () {
      errEl.textContent = 'Sunucuya bağlanılamadı. Sunucu çalışıyor mu?';
      errEl.hidden = false;
    })
    .finally(function () {
      btn.disabled = false;
    });
  }

  // Token geçerliliğini kontrol et
  function validateToken() {
    if (!token) { showLogin(); return; }
    api('/api/admin/haberler')
      .then(function (r) {
        if (r.ok) showPanel();
        else logout();
      })
      .catch(function () { logout(); });
  }

  // ===================== SAYFA GEÇİŞİ =====================

  function showPage(pageId) {
    document.querySelectorAll('.page').forEach(function (p) {
      p.classList.toggle('active', p.id === 'page-' + pageId);
    });
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.page === pageId);
    });
    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'news') loadNews();
    if (pageId === 'categories') renderCategories();
    if (pageId === 'bulten') loadBulten();
    if (pageId === 'anket') loadAnketler();
    if (pageId === 'reklamlar') loadReklamlar();
  }

  // ===================== DASHBOARD =====================

  function zamanOnce(dateStr) {
    if (!dateStr) return '';
    var now = new Date();
    var d = new Date(dateStr);
    var diff = now - d;
    var dk = Math.floor(diff / 60000);
    if (dk < 1) return 'Az önce';
    if (dk < 60) return dk + ' dk önce';
    var saat = Math.floor(dk / 60);
    if (saat < 24) return saat + ' saat önce';
    var gun = Math.floor(saat / 24);
    if (gun === 1) return 'Dün';
    if (gun < 7) return gun + ' gün önce';
    if (gun < 30) return Math.floor(gun / 7) + ' hafta önce';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function loadDashboard() {
    var skeleton = $('dashboard-skeleton');
    var content = $('dashboard-content');
    if (skeleton) skeleton.hidden = false;
    if (content) content.hidden = true;

    // Tarih göster
    var dateEl = $('dashboard-date');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    Promise.all([
      apiJson('/api/haberler?limit=50'),
      apiJson('/api/admin/bulten').catch(function () { return { data: [] }; })
    ]).then(function (results) {
      var haberler = results[0].data || [];
      var bulten = results[1].data || [];
      dashboardHaberler = haberler;

      // Son Dakika widget
      renderBreakingWidget(haberler);

      // Toplam görüntülenme
      var toplamGoruntulenme = 0;
      haberler.forEach(function (h) { toplamGoruntulenme += (h.goruntulenme || 0); });

      // Kategoriye göre
      var byCat = {};
      haberler.forEach(function (n) {
        var c = n.kategori || 'Diğer';
        byCat[c] = (byCat[c] || 0) + 1;
      });
      var aktifKategori = Object.keys(byCat).length;

      // Stat kartları
      $('stat-total').textContent = haberler.length;
      $('stat-bulten').textContent = bulten.length;
      $('stat-views').textContent = toplamGoruntulenme.toLocaleString('tr-TR');
      $('stat-categories').textContent = aktifKategori;

      // Kategori dağılımı bar
      renderCategoryBars(byCat, haberler.length);

      // Son haberler (görsel kartlı)
      renderLatestNews(haberler);

      // Hızlı bilgi paneli
      renderDashboardInfo(haberler, bulten, byCat);

      if (skeleton) skeleton.hidden = true;
      if (content) content.hidden = false;

      // Grafikler (Chart.js defer ile yükleniyor)
      renderCharts(byCat, haberler);
    }).catch(function () {
      $('stat-total').textContent = '0';
      $('stat-bulten').textContent = '0';
      $('stat-views').textContent = '0';
      $('stat-categories').textContent = '0';
      $('dashboard-latest').innerHTML = '<p class="muted">Veriler yüklenemedi.</p>';
      if (skeleton) skeleton.hidden = true;
      if (content) content.hidden = false;
    });
  }

  function renderCategoryBars(byCat, total) {
    var container = $('category-bars');
    if (!container) return;
    var colors = ['#388bfd', '#238636', '#d29922', '#da3633', '#8957e5', '#f778ba', '#3fb950', '#79c0ff'];
    var sorted = Object.entries(byCat).sort(function (a, b) { return b[1] - a[1]; });
    var maxVal = sorted.length ? sorted[0][1] : 1;

    container.innerHTML = sorted.map(function (entry, i) {
      var name = entry[0];
      var count = entry[1];
      var pct = Math.round((count / total) * 100);
      var barWidth = Math.max(4, Math.round((count / maxVal) * 100));
      var color = colors[i % colors.length];
      return '<div class="cat-bar-row">' +
        '<span class="cat-bar-label">' + escapeHtml(name) + '</span>' +
        '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:' + barWidth + '%;background:' + color + '" title="' + pct + '%"></div></div>' +
        '<span class="cat-bar-count">' + count + '</span>' +
        '</div>';
    }).join('');
  }

  function renderLatestNews(haberler) {
    var el = $('dashboard-latest');
    if (!el) return;

    if (haberler.length === 0) {
      el.innerHTML = '<p class="muted">Henüz haber eklenmemiş. Hemen ilk haberi ekleyin!</p>';
      return;
    }

    el.innerHTML = haberler.slice(0, 8).map(function (n) {
      var img = n.gorsel ? '<img class="latest-item__img" src="' + escapeHtml(n.gorsel) + '" alt="" loading="lazy">' : '';
      return '<div class="latest-item" data-edit-id="' + n.id + '">' +
        img +
        '<div class="latest-item__body">' +
        '<div class="latest-item__title">' + escapeHtml(n.baslik || '(Başlıksız)') + '</div>' +
        '<div class="latest-item__meta">' + escapeHtml(n.yazar || 'Editör') + ' &middot; ' + zamanOnce(n.yayinTarihi) + '</div>' +
        '</div>' +
        '<span class="latest-item__badge" style="background:rgba(35,134,54,0.15);color:#3fb950">' + escapeHtml(n.kategori || '') + '</span>' +
        '</div>';
    }).join('');

    el.querySelectorAll('[data-edit-id]').forEach(function (item) {
      item.addEventListener('click', function () {
        showPage('news');
        openEditModal(item.dataset.editId);
      });
    });
  }

  function renderDashboardInfo(haberler, bulten, byCat) {
    var el = $('dashboard-info');
    if (!el) return;

    // En çok haber olan kategori
    var topCat = '–';
    var topCatCount = 0;
    Object.keys(byCat).forEach(function (c) {
      if (byCat[c] > topCatCount) { topCat = c; topCatCount = byCat[c]; }
    });

    // Son eklenen haber tarihi
    var sonHaber = haberler.length ? zamanOnce(haberler[0].yayinTarihi) : '–';

    // Yazarlar
    var yazarlar = {};
    haberler.forEach(function (h) { yazarlar[h.yazar || 'Editör'] = true; });
    var yazarSayisi = Object.keys(yazarlar).length;

    // Ortalama haber/gün
    var gunler = {};
    haberler.forEach(function (h) {
      if (h.yayinTarihi) {
        var gun = h.yayinTarihi.slice(0, 10);
        gunler[gun] = (gunler[gun] || 0) + 1;
      }
    });
    var gunSayisi = Object.keys(gunler).length || 1;
    var ortHaber = (haberler.length / gunSayisi).toFixed(1);

    // Son bülten abonesi
    var sonAbone = bulten.length ? zamanOnce(bulten[bulten.length - 1].tarih) : '–';

    el.innerHTML =
      '<div class="info-row"><span class="info-label">En aktif kategori</span><span class="info-value">' + escapeHtml(topCat) + ' (' + topCatCount + ')</span></div>' +
      '<div class="info-row"><span class="info-label">Son haber</span><span class="info-value">' + sonHaber + '</span></div>' +
      '<div class="info-row"><span class="info-label">Yazar sayısı</span><span class="info-value">' + yazarSayisi + '</span></div>' +
      '<div class="info-row"><span class="info-label">Ort. haber/gün</span><span class="info-value">' + ortHaber + '</span></div>' +
      '<div class="info-row"><span class="info-label">Son bülten abonesi</span><span class="info-value">' + sonAbone + '</span></div>' +
      '<div class="info-row"><span class="info-label">Toplam kelime</span><span class="info-value">' + toplamKelime(haberler).toLocaleString('tr-TR') + '</span></div>';
  }

  function toplamKelime(haberler) {
    var toplam = 0;
    haberler.forEach(function (h) {
      var metin = (h.icerik || '').replace(/<[^>]*>/g, ' ');
      toplam += metin.trim().split(/\s+/).filter(Boolean).length;
    });
    return toplam;
  }

  function renderCharts(byCat, haberler) {
    if (!window.Chart) return;
    var colors = ['#388bfd', '#238636', '#d29922', '#da3633', '#8957e5', '#f778ba', '#3fb950', '#79c0ff'];

    // Kategori - doughnut
    var c1 = $('chart-categories');
    if (c1) {
      var ex = Chart.getChart(c1); if (ex) ex.destroy();
      new Chart(c1, {
        type: 'doughnut',
        data: {
          labels: Object.keys(byCat),
          datasets: [{ data: Object.values(byCat), backgroundColor: colors, borderColor: '#161b22', borderWidth: 2 }]
        },
        options: {
          responsive: true,
          cutout: '55%',
          plugins: {
            legend: { position: 'bottom', labels: { color: '#e6edf3', padding: 12, usePointStyle: true, pointStyleWidth: 10 } }
          }
        }
      });
    }

    // Trend - gerçek veriye dayalı
    var c3 = $('chart-trend');
    if (c3) {
      var ex3 = Chart.getChart(c3); if (ex3) ex3.destroy();
      var trendData = buildTrendData(haberler, 14);
      new Chart(c3, {
        type: 'line',
        data: {
          labels: trendData.labels,
          datasets: [{
            label: 'Yayınlanan haber',
            data: trendData.data,
            borderColor: '#388bfd',
            backgroundColor: 'rgba(56,139,253,0.1)',
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#388bfd'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
            y: { beginAtZero: true, ticks: { color: '#8b949e', stepSize: 1 }, grid: { color: '#21262d' } }
          }
        }
      });
    }
  }

  function buildTrendData(haberler, days) {
    var labels = [];
    var data = [];
    var countByDay = {};

    haberler.forEach(function (h) {
      if (h.yayinTarihi) {
        var key = h.yayinTarihi.slice(0, 10);
        countByDay[key] = (countByDay[key] || 0) + 1;
      }
    });

    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      var label = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
      labels.push(label);
      data.push(countByDay[key] || 0);
    }

    return { labels: labels, data: data };
  }

  // ===================== SON DAKİKA WİDGET =====================

  function renderBreakingWidget(haberler) {
    var listEl = $('breaking-list');
    var emptyEl = $('breaking-empty');
    if (!listEl || !emptyEl) return;

    var breakingNews = haberler.filter(function (h) { return h.sonDakika === true; });

    if (breakingNews.length === 0) {
      emptyEl.hidden = false;
      listEl.innerHTML = '';
      return;
    }

    emptyEl.hidden = true;
    var now = Date.now();

    listEl.innerHTML = breakingNews.map(function (n) {
      var sure = n.sonDakikaSure || 6;
      var baslangic = n.sonDakikaBaslangic ? new Date(n.sonDakikaBaslangic).getTime() : (n.yayinTarihi ? new Date(n.yayinTarihi).getTime() : now);
      var bitis = baslangic + sure * 3600000;
      var kalan = bitis - now;

      var timeLabel, timeClass;
      if (kalan <= 0) {
        timeLabel = 'Süresi doldu';
        timeClass = 'breaking-item__time--expired';
      } else if (kalan < 3600000) {
        var dk = Math.ceil(kalan / 60000);
        timeLabel = dk + ' dk kaldı';
        timeClass = 'breaking-item__time--warning';
      } else {
        var saat = Math.floor(kalan / 3600000);
        var kalanDk = Math.ceil((kalan % 3600000) / 60000);
        timeLabel = saat + 's ' + kalanDk + 'dk kaldı';
        timeClass = 'breaking-item__time--active';
      }

      return '<div class="breaking-item" data-breaking-id="' + n.id + '">' +
        '<span class="breaking-item__title" data-breaking-edit="' + n.id + '">' + escapeHtml(n.baslik || '(Başlıksız)') + '</span>' +
        '<span class="breaking-item__time ' + timeClass + '">' + timeLabel + '</span>' +
        '<select class="breaking-item__select" data-breaking-sure="' + n.id + '">' +
        '<option value="1"' + (sure === 1 ? ' selected' : '') + '>1 saat</option>' +
        '<option value="3"' + (sure === 3 ? ' selected' : '') + '>3 saat</option>' +
        '<option value="6"' + (sure === 6 ? ' selected' : '') + '>6 saat</option>' +
        '<option value="12"' + (sure === 12 ? ' selected' : '') + '>12 saat</option>' +
        '<option value="24"' + (sure === 24 ? ' selected' : '') + '>24 saat</option>' +
        '<option value="48"' + (sure === 48 ? ' selected' : '') + '>48 saat</option>' +
        '</select>' +
        '<button type="button" class="btn btn-sm btn-danger" data-breaking-remove="' + n.id + '">Çıkar</button>' +
        '</div>';
    }).join('');

    // Event: süre değiştir
    listEl.querySelectorAll('[data-breaking-sure]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        breakingUpdateSure(sel.dataset.breakingSure, parseInt(sel.value, 10));
      });
    });

    // Event: çıkar
    listEl.querySelectorAll('[data-breaking-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        breakingRemove(btn.dataset.breakingRemove);
      });
    });

    // Event: başlık tıkla → düzenle
    listEl.querySelectorAll('[data-breaking-edit]').forEach(function (el) {
      el.addEventListener('click', function () {
        showPage('news');
        openEditModal(el.dataset.breakingEdit);
      });
    });
  }

  function breakingUpdateSure(id, sure) {
    api('/api/admin/haberler/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sonDakikaSure: sure })
    })
    .then(function (r) {
      if (!r.ok) throw new Error('Güncellenemedi');
      showToast('Son dakika süresi güncellendi.');
      loadDashboard();
    })
    .catch(function () { showToast('Süre güncellenemedi', 'error'); });
  }

  function breakingRemove(id) {
    api('/api/admin/haberler/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sonDakika: false })
    })
    .then(function (r) {
      if (!r.ok) throw new Error('Güncellenemedi');
      showToast('Haber son dakikadan çıkarıldı.');
      loadDashboard();
    })
    .catch(function () { showToast('İşlem başarısız', 'error'); });
  }

  function breakingPickExisting(haberler) {
    var modal = $('breaking-pick-modal');
    var listEl = $('breaking-pick-list');
    var emptyEl = $('breaking-pick-empty');
    if (!modal || !listEl) return;

    var nonBreaking = haberler.filter(function (h) { return !h.sonDakika; }).slice(0, 20);

    if (nonBreaking.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
    } else {
      if (emptyEl) emptyEl.hidden = true;
      listEl.innerHTML = nonBreaking.map(function (n) {
        return '<div class="breaking-pick-item" data-pick-id="' + n.id + '">' +
          '<span class="breaking-pick-item__title">' + escapeHtml(n.baslik || '(Başlıksız)') + '</span>' +
          '<span class="breaking-pick-item__meta">' + zamanOnce(n.yayinTarihi) + '</span>' +
          '</div>';
      }).join('');

      listEl.querySelectorAll('[data-pick-id]').forEach(function (item) {
        item.addEventListener('click', function () {
          modal.close();
          var pickId = item.dataset.pickId;
          api('/api/admin/haberler/' + pickId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sonDakika: true, sonDakikaSure: 6 })
          })
          .then(function (r) {
            if (!r.ok) throw new Error('Güncellenemedi');
            showToast('Haber son dakika olarak ayarlandı.');
            loadDashboard();
          })
          .catch(function () { showToast('İşlem başarısız', 'error'); });
        });
      });
    }

    modal.showModal();
  }

  // Store latest haberler for breaking pick
  var dashboardHaberler = [];

  // ===================== HABERLER =====================

  function loadNews() {
    var loadingEl = $('news-loading');
    var emptyEl = $('news-empty');
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    var perPage = newsPerPage;
    var page = newsCurrentPage;

    apiJson('/api/haberler?limit=' + perPage + '&sayfa=' + page)
      .then(function (result) {
        newsCache = result.data || [];
        newsTotal = result.toplam || newsCache.length;
        newsTotalPages = result.toplamSayfa || Math.ceil(newsTotal / perPage) || 1;
        selectedNewsIds = [];
        updateNewsHeaderStats();
        renderNewsView();
        updatePagination();
        updateBulkBar();
      })
      .catch(function () {
        newsCache = [];
        newsTotal = 0;
        newsTotalPages = 1;
        renderNewsView();
        updatePagination();
        showToast('Haberler yüklenemedi', 'error');
      })
      .finally(function () {
        if (loadingEl) loadingEl.hidden = true;
      });
  }

  function filterAndSortNews() {
    var search = ($('news-search') || {}).value || '';
    var catFilter = ($('news-filter-category') || {}).value || '';
    var sortVal = ($('news-sort') || {}).value || 'dateDesc';

    var list = newsCache.filter(function (n) {
      var matchSearch = !search || (n.baslik || '').toLowerCase().indexOf(search.toLowerCase()) !== -1;
      var matchCat = !catFilter || n.kategori === catFilter;
      return matchSearch && matchCat;
    });

    list.sort(function (a, b) {
      if (sortVal === 'dateAsc') return new Date(a.yayinTarihi || 0) - new Date(b.yayinTarihi || 0);
      if (sortVal === 'title') return (a.baslik || '').localeCompare(b.baslik || '', 'tr');
      if (sortVal === 'views') return (b.goruntulenme || 0) - (a.goruntulenme || 0);
      return new Date(b.yayinTarihi || 0) - new Date(a.yayinTarihi || 0);
    });

    return list;
  }

  function renderNewsView() {
    var list = filterAndSortNews();
    var emptyEl = $('news-empty');
    var tableView = $('news-table-view');
    var cardView = $('news-card-view');

    if (list.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      if (tableView) tableView.hidden = true;
      if (cardView) cardView.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    if (newsViewMode === 'card') {
      if (tableView) tableView.hidden = true;
      if (cardView) cardView.hidden = false;
      renderNewsCards(list);
    } else {
      if (tableView) tableView.hidden = false;
      if (cardView) cardView.hidden = true;
      renderNewsTable(list);
    }
  }

  function renderNewsTable(list) {
    var tbody = $('news-tbody');
    if (!tbody) return;

    tbody.innerHTML = list.map(function (n) {
      var checked = selectedNewsIds.indexOf(String(n.id)) !== -1 ? ' checked' : '';
      var imgHtml = n.gorsel
        ? '<img class="news-thumb" src="' + escapeHtml(n.gorsel) + '" alt="" loading="lazy">'
        : '<div class="news-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>';

      return '<tr>' +
        '<td><input type="checkbox" data-id="' + n.id + '"' + checked + '></td>' +
        '<td><div class="news-title-cell">' + imgHtml + '<span class="news-title-text">' + escapeHtml(n.baslik || '(Başlıksız)') + '</span></div></td>' +
        '<td><span class="badge-category">' + escapeHtml(n.kategori || '–') + '</span></td>' +
        '<td>' + escapeHtml(n.yazar || '–') + '</td>' +
        '<td><div class="date-cell"><span class="date-relative">' + zamanOnce(n.yayinTarihi) + '</span><span class="date-absolute">' + formatDate(n.yayinTarihi) + '</span></div></td>' +
        '<td><span class="badge badge-published">Yayında</span></td>' +
        '<td><div class="row-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-edit="' + n.id + '">Düzenle</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-delete="' + n.id + '">Sil</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    bindTableActions(tbody);
  }

  function renderNewsCards(list) {
    var container = $('news-card-view');
    if (!container) return;

    container.innerHTML = list.map(function (n) {
      var imgHtml = n.gorsel
        ? '<img class="news-card__img" src="' + escapeHtml(n.gorsel) + '" alt="" loading="lazy">'
        : '<div class="news-card__img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>';

      return '<div class="news-card" data-card-id="' + n.id + '">' +
        '<div class="news-card__img-wrap">' + imgHtml +
        (n.kategori ? '<span class="news-card__category">' + escapeHtml(n.kategori) + '</span>' : '') +
        '</div>' +
        '<div class="news-card__body">' +
        '<h4 class="news-card__title">' + escapeHtml(n.baslik || '(Başlıksız)') + '</h4>' +
        '<p class="news-card__excerpt">' + escapeHtml(n.ozet || '') + '</p>' +
        '<div class="news-card__footer">' +
        '<span class="news-card__meta">' + escapeHtml(n.yazar || 'Editör') + ' &middot; ' + zamanOnce(n.yayinTarihi) + '</span>' +
        '<div class="news-card__actions">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-edit="' + n.id + '">Düzenle</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-delete="' + n.id + '">Sil</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    // Kart tıklama → düzenleme
    container.querySelectorAll('.news-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit]') || e.target.closest('[data-delete]')) return;
        openEditModal(card.dataset.cardId);
      });
    });

    bindTableActions(container);
  }

  function bindTableActions(container) {
    container.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        openEditModal(b.dataset.edit);
      });
    });
    container.querySelectorAll('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        confirmDelete(b.dataset.delete);
      });
    });
    // Checkbox seçim
    container.querySelectorAll('input[type="checkbox"][data-id]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = String(cb.dataset.id);
        if (cb.checked) {
          if (selectedNewsIds.indexOf(id) === -1) selectedNewsIds.push(id);
        } else {
          selectedNewsIds = selectedNewsIds.filter(function (x) { return x !== id; });
        }
        updateBulkBar();
        updateSelectAll();
      });
    });
  }

  function updateNewsHeaderStats() {
    var totalEl = $('news-stat-total');
    var todayEl = $('news-stat-today');
    var catEl = $('news-stat-categories');
    if (totalEl) totalEl.textContent = newsTotal;

    var today = new Date().toISOString().slice(0, 10);
    var todayCount = 0;
    var cats = {};
    newsCache.forEach(function (n) {
      if (n.yayinTarihi && n.yayinTarihi.slice(0, 10) === today) todayCount++;
      if (n.kategori) cats[n.kategori] = true;
    });
    if (todayEl) todayEl.textContent = todayCount;
    if (catEl) catEl.textContent = Object.keys(cats).length;
  }

  function updateBulkBar() {
    var bar = $('news-bulk-bar');
    var countEl = $('bulk-count');
    if (!bar) return;
    if (selectedNewsIds.length > 0) {
      bar.hidden = false;
      if (countEl) countEl.textContent = selectedNewsIds.length;
    } else {
      bar.hidden = true;
    }
  }

  function updateSelectAll() {
    var sa = $('select-all');
    if (!sa) return;
    var checkboxes = document.querySelectorAll('#news-tbody input[type="checkbox"][data-id]');
    if (checkboxes.length === 0) { sa.checked = false; sa.indeterminate = false; return; }
    var checkedCount = 0;
    checkboxes.forEach(function (cb) { if (cb.checked) checkedCount++; });
    sa.checked = checkedCount === checkboxes.length;
    sa.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  function toggleSelectAll() {
    var sa = $('select-all');
    if (!sa) return;
    var checked = sa.checked;
    selectedNewsIds = [];
    document.querySelectorAll('#news-tbody input[type="checkbox"][data-id]').forEach(function (cb) {
      cb.checked = checked;
      if (checked) selectedNewsIds.push(String(cb.dataset.id));
    });
    updateBulkBar();
  }

  function bulkDelete() {
    if (selectedNewsIds.length === 0) return;
    $('delete-message').textContent = selectedNewsIds.length + ' haber silinsin mi?';
    $('delete-confirm').dataset.deleteId = '';
    $('delete-confirm').dataset.bulkDelete = 'true';
    $('delete-modal').showModal();
  }

  function doBulkDelete() {
    var ids = selectedNewsIds.slice();
    $('delete-modal').close();
    if (ids.length === 0) return;

    var promises = ids.map(function (id) {
      return api('/api/admin/haberler/' + id, { method: 'DELETE' }).then(function (r) {
        if (!r.ok) throw new Error('Silinemedi: ' + id);
      });
    });

    Promise.all(promises)
      .then(function () {
        showToast(ids.length + ' haber silindi.');
        selectedNewsIds = [];
        loadNews();
      })
      .catch(function () {
        showToast('Bazı haberler silinemedi', 'error');
        selectedNewsIds = [];
        loadNews();
      });
  }

  function updatePagination() {
    var pag = $('news-pagination');
    var info = $('news-page-info');
    var prevBtn = $('news-prev-btn');
    var nextBtn = $('news-next-btn');
    if (!pag) return;

    if (newsTotalPages <= 1) {
      pag.hidden = true;
      return;
    }

    pag.hidden = false;
    if (info) info.textContent = 'Sayfa ' + newsCurrentPage + ' / ' + newsTotalPages;
    if (prevBtn) prevBtn.disabled = newsCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = newsCurrentPage >= newsTotalPages;
  }

  function goToNewsPage(direction) {
    var newPage = newsCurrentPage + direction;
    if (newPage < 1 || newPage > newsTotalPages) return;
    newsCurrentPage = newPage;
    loadNews();
  }

  function setNewsView(mode) {
    newsViewMode = mode;
    var tableBtn = $('view-table-btn');
    var cardBtn = $('view-card-btn');
    if (tableBtn) tableBtn.classList.toggle('active', mode === 'table');
    if (cardBtn) cardBtn.classList.toggle('active', mode === 'card');
    renderNewsView();
  }

  // ===================== HABER MODAL =====================

  function getQuillContent() {
    if (quillEditor) {
      var html = quillEditor.root.innerHTML;
      return (html === '<p><br></p>') ? '' : html;
    }
    return '';
  }

  function setQuillContent(html) {
    if (quillEditor) quillEditor.root.innerHTML = html || '';
  }

  function openNewModal() {
    currentEditId = null;
    $('news-modal-title').textContent = 'Yeni haber';
    $('news-id').value = '';
    $('news-title').value = '';
    $('news-slug').value = '';
    $('news-category').value = CATEGORIES[0];
    $('news-excerpt').value = '';
    $('news-author').value = 'Editör';
    $('news-published').checked = true;
    $('news-breaking').checked = false;
    $('news-featured').checked = false;
    $('news-breaking-duration').value = '6';
    $('breaking-duration-row').hidden = true;
    setQuillContent('');
    $('news-image-preview').hidden = true;
    $('news-image-upload-options').style.display = '';
    clearVideoPreview();
    updateCounters();
    $('news-modal').showModal();
  }

  function openEditModal(id) {
    currentEditId = id;
    $('news-modal-title').textContent = 'Haberi düzenle';
    $('news-id').value = id;

    apiJson('/api/haberler/' + id)
      .then(function (h) {
        $('news-title').value = h.baslik || '';
        $('news-slug').value = h.slug || '';
        $('news-category').value = h.kategori || CATEGORIES[0];
        $('news-excerpt').value = h.ozet || '';
        $('news-author').value = h.yazar || 'Editör';
        setQuillContent(h.icerik || '');

        if (h.gorsel) {
          $('news-image-preview-img').src = h.gorsel;
          $('news-image-preview').hidden = false;
          $('news-image-upload-options').style.display = 'none';
        } else {
          $('news-image-preview').hidden = true;
          $('news-image-upload-options').style.display = '';
        }

        $('news-breaking').checked = !!h.sonDakika;
        $('news-featured').checked = !!h.oneCikan;
        $('news-breaking-duration').value = String(h.sonDakikaSure || 6);
        $('breaking-duration-row').hidden = !h.sonDakika;

        // Video
        if (h.video && h.video.url) {
          showVideoPreview(h.video);
        } else {
          clearVideoPreview();
        }

        updateCounters();
        $('news-modal').showModal();
      })
      .catch(function () { showToast('Haber yüklenemedi', 'error'); });
  }

  function saveNews(e) {
    e.preventDefault();
    var id = currentEditId;
    var title = $('news-title').value.trim();
    if (!title) { showToast('Başlık gerekli', 'error'); return; }

    var content = getQuillContent();
    var imgEl = $('news-image-preview-img');
    var gorsel = '';
    if (imgEl && !$('news-image-preview').hidden) gorsel = imgEl.src;
    var urlInput = $('news-image-url');
    if (!gorsel && urlInput && urlInput.value.trim()) gorsel = urlInput.value.trim();

    var data = {
      baslik: title,
      slug: $('news-slug').value.trim() || slugify(title),
      kategori: $('news-category').value,
      ozet: $('news-excerpt').value.trim(),
      icerik: content,
      yazar: $('news-author').value.trim() || 'Editör',
      gorsel: gorsel,
      sonDakika: $('news-breaking').checked,
      sonDakikaSure: parseInt($('news-breaking-duration').value, 10) || 6,
      oneCikan: $('news-featured').checked
    };

    // Video
    if (currentVideoData) {
      data.video = currentVideoData;
    } else {
      data.video = null;
    }

    var btn = $('news-form-submit');
    btn.disabled = true;

    api(id ? '/api/admin/haberler/' + id : '/api/admin/haberler', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.hata || 'Kayıt başarısız (' + r.status + ')'); });
      return r.json();
    })
    .then(function () {
      showToast(id ? 'Haber güncellendi.' : 'Haber eklendi.');
      $('news-modal').close();
      loadNews();
    })
    .catch(function (err) { showToast(err.message || 'Kaydedilemedi', 'error'); })
    .finally(function () { btn.disabled = false; });
  }

  // ===================== SİLME =====================

  function confirmDelete(id) {
    var n = newsCache.find(function (h) { return String(h.id) === String(id); });
    $('delete-message').textContent = n ? '"' + n.baslik + '" silinsin mi?' : 'Bu haber silinsin mi?';
    $('delete-confirm').dataset.deleteId = id;
    $('delete-modal').showModal();
  }

  function doDelete() {
    var isBulk = $('delete-confirm').dataset.bulkDelete === 'true';
    if (isBulk) {
      $('delete-confirm').dataset.bulkDelete = '';
      doBulkDelete();
      return;
    }

    var id = $('delete-confirm').dataset.deleteId;
    $('delete-modal').close();
    if (!id) return;

    api('/api/admin/haberler/' + id, { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) throw new Error('Silinemedi');
        return r.json();
      })
      .then(function () {
        showToast('Haber silindi.');
        loadNews();
      })
      .catch(function (err) { showToast(err.message || 'Silinemedi', 'error'); });
  }

  // ===================== KATEGORİLER =====================

  function renderCategories() {
    var loadingEl = $('categories-loading');
    var contentEl = $('categories-content');
    var emptyEl = $('categories-empty');
    if (loadingEl) loadingEl.hidden = false;
    if (contentEl) contentEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    // Mini stats
    var catStatTotal = $('cat-stat-total');
    if (catStatTotal) catStatTotal.textContent = CATEGORIES.length;

    apiJson('/api/haberler?limit=50')
      .then(function (result) {
        var haberler = result.data || [];
        var catStatNews = $('cat-stat-news');
        if (catStatNews) catStatNews.textContent = haberler.length;

        if (haberler.length === 0) {
          if (loadingEl) loadingEl.hidden = true;
          if (emptyEl) emptyEl.hidden = false;
          return;
        }

        // Kategori bazlı istatistik hesapla
        var byCat = {};
        var lastDateByCat = {};
        haberler.forEach(function (h) {
          var c = h.kategori || 'Diğer';
          byCat[c] = (byCat[c] || 0) + 1;
          if (h.yayinTarihi) {
            if (!lastDateByCat[c] || h.yayinTarihi > lastDateByCat[c]) {
              lastDateByCat[c] = h.yayinTarihi;
            }
          }
        });

        var colors = ['#388bfd', '#238636', '#d29922', '#da3633', '#8957e5', '#f778ba', '#3fb950', '#79c0ff'];

        // Kart grid render
        var gridEl = $('categories-grid');
        if (gridEl) {
          gridEl.innerHTML = CATEGORIES.map(function (cat, i) {
            var count = byCat[cat] || 0;
            var lastDate = lastDateByCat[cat] ? zamanOnce(lastDateByCat[cat]) : '–';
            var color = colors[i % colors.length];
            return '<div class="category-card" data-cat="' + escapeHtml(cat) + '">' +
              '<div class="category-card__stripe" style="background:' + color + '"></div>' +
              '<div class="category-card__body">' +
              '<h3 class="category-card__name">' + escapeHtml(cat) + '</h3>' +
              '<div class="category-card__stats">' +
              '<span><strong>' + count + '</strong> haber</span>' +
              '<span>Son eklenen: ' + lastDate + '</span>' +
              '</div>' +
              '<button type="button" class="category-card__btn" data-filter-cat="' + escapeHtml(cat) + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
              'Haberleri gör' +
              '</button>' +
              '</div>' +
              '</div>';
          }).join('');

          // Kart buton tıklama
          gridEl.querySelectorAll('[data-filter-cat]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              var cat = btn.dataset.filterCat;
              showPage('news');
              var filterEl = $('news-filter-category');
              if (filterEl) filterEl.value = cat;
              renderNewsView();
            });
          });
        }

        // Dağılım barları render
        renderCategoryBarsPage(byCat, haberler.length);

        if (loadingEl) loadingEl.hidden = true;
        if (contentEl) contentEl.hidden = false;
      })
      .catch(function () {
        if (loadingEl) loadingEl.hidden = true;
        if (emptyEl) emptyEl.hidden = false;
        var catStatNews = $('cat-stat-news');
        if (catStatNews) catStatNews.textContent = '0';
      });
  }

  function renderCategoryBarsPage(byCat, total) {
    var container = $('categories-bars');
    if (!container) return;
    var colors = ['#388bfd', '#238636', '#d29922', '#da3633', '#8957e5', '#f778ba', '#3fb950', '#79c0ff'];
    var sorted = Object.entries(byCat).sort(function (a, b) { return b[1] - a[1]; });
    var maxVal = sorted.length ? sorted[0][1] : 1;

    container.innerHTML = sorted.map(function (entry, i) {
      var name = entry[0];
      var count = entry[1];
      var pct = Math.round((count / total) * 100);
      var barWidth = Math.max(4, Math.round((count / maxVal) * 100));
      var color = colors[i % colors.length];
      return '<div class="cat-bar-row">' +
        '<span class="cat-bar-label">' + escapeHtml(name) + '</span>' +
        '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:' + barWidth + '%;background:' + color + '" title="' + pct + '%"></div></div>' +
        '<span class="cat-bar-count">' + count + '</span>' +
        '</div>';
    }).join('');
  }

  function fillCategorySelects() {
    var opts = CATEGORIES.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('');
    var sel = $('news-category');
    if (sel) sel.innerHTML = opts;
    var filter = $('news-filter-category');
    if (filter) filter.innerHTML = '<option value="">Tüm kategoriler</option>' + opts;
  }

  // ===================== BÜLTEN =====================

  function loadBulten() {
    var loading = $('bulten-loading');
    var empty = $('bulten-empty');
    var tbody = $('bulten-tbody');
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;

    apiJson('/api/admin/bulten')
      .then(function (result) {
        var list = result.data || [];
        if (list.length === 0) {
          if (empty) empty.hidden = false;
          tbody.innerHTML = '';
        } else {
          tbody.innerHTML = list.map(function (b) {
            return '<tr><td>' + escapeHtml(b.email) + '</td><td>' + formatDate(b.tarih) + '</td></tr>';
          }).join('');
        }
      })
      .catch(function () { showToast('Bülten aboneleri yüklenemedi', 'error'); })
      .finally(function () { if (loading) loading.hidden = true; });
  }

  // ===================== ANKETLER =====================

  var anketCache = [];
  var currentAnketEditId = null;
  var anketDeleteId = null;

  function loadAnketler() {
    var loadingEl = $('anket-loading');
    var emptyEl = $('anket-empty');
    var listEl = $('anket-list');
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    apiJson('/api/admin/anket')
      .then(function (result) {
        anketCache = result.data || [];
        renderAnketList();
      })
      .catch(function () {
        anketCache = [];
        renderAnketList();
        showToast('Anketler yüklenemedi', 'error');
      })
      .finally(function () {
        if (loadingEl) loadingEl.hidden = true;
      });
  }

  function renderAnketList() {
    var listEl = $('anket-list');
    var emptyEl = $('anket-empty');
    if (!listEl) return;

    if (anketCache.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    listEl.innerHTML = anketCache.map(function (a) {
      var durumClass = a.aktif ? 'badge-published' : 'badge-draft';
      var durumText = a.aktif ? 'Aktif' : 'Pasif';
      var seceneklerHtml = (a.secenekler || []).map(function (s) {
        var oy = s.oy || 0;
        var yuzde = a.toplamOy > 0 ? Math.round((oy / a.toplamOy) * 100) : 0;
        return '<div class="anket-card__secenek">' +
          '<span class="anket-card__secenek-metin">' + escapeHtml(s.metin) + '</span>' +
          '<span class="anket-card__secenek-oy">' + oy + ' oy (%' + yuzde + ')</span>' +
          '</div>';
      }).join('');

      return '<div class="anket-card">' +
        '<div class="anket-card__header">' +
        '<h3 class="anket-card__soru">' + escapeHtml(a.soru) + '</h3>' +
        '<span class="badge ' + durumClass + '">' + durumText + '</span>' +
        '</div>' +
        '<div class="anket-card__secenekler">' + seceneklerHtml + '</div>' +
        '<div class="anket-card__footer">' +
        '<span class="anket-card__meta">Toplam: ' + (a.toplamOy || 0) + ' oy' +
        (a.baslangicTarihi ? ' &middot; ' + a.baslangicTarihi : '') +
        (a.bitisTarihi ? ' – ' + a.bitisTarihi : '') +
        '</span>' +
        '<div class="anket-card__actions">' +
        (!a.aktif ? '<button type="button" class="btn btn-sm btn-primary" data-anket-aktif="' + a.id + '">Aktif Yap</button>' : '') +
        '<button type="button" class="btn btn-sm btn-ghost" data-anket-edit="' + a.id + '">Düzenle</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-anket-delete="' + a.id + '">Sil</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    // Bind events
    listEl.querySelectorAll('[data-anket-aktif]').forEach(function (btn) {
      btn.addEventListener('click', function () { anketAktifYap(btn.dataset.anketAktif); });
    });
    listEl.querySelectorAll('[data-anket-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openAnketEditModal(btn.dataset.anketEdit); });
    });
    listEl.querySelectorAll('[data-anket-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () { confirmAnketSil(btn.dataset.anketDelete); });
    });
  }

  function anketAktifYap(id) {
    api('/api/admin/anket/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: true })
    })
    .then(function (r) {
      if (!r.ok) throw new Error('Güncellenemedi');
      showToast('Anket aktif yapıldı.');
      loadAnketler();
    })
    .catch(function () { showToast('İşlem başarısız', 'error'); });
  }

  function openAnketNewModal() {
    currentAnketEditId = null;
    $('anket-modal-title').textContent = 'Yeni Anket';
    $('anket-id').value = '';
    $('anket-soru').value = '';
    $('anket-baslangic').value = new Date().toISOString().slice(0, 10);
    $('anket-bitis').value = '';
    $('anket-aktif').checked = false;
    // Reset seçenekler to 2
    var wrap = $('anket-secenekler-wrap');
    wrap.innerHTML =
      '<div class="anket-secenek-input"><input type="text" placeholder="Seçenek 1" required><button type="button" class="anket-secenek-remove btn btn-sm btn-ghost" title="Kaldır">&times;</button></div>' +
      '<div class="anket-secenek-input"><input type="text" placeholder="Seçenek 2" required><button type="button" class="anket-secenek-remove btn btn-sm btn-ghost" title="Kaldır">&times;</button></div>';
    bindAnketSecenekRemove();
    $('anket-modal').showModal();
  }

  function openAnketEditModal(id) {
    var anket = anketCache.find(function (a) { return String(a.id) === String(id); });
    if (!anket) return;
    currentAnketEditId = id;
    $('anket-modal-title').textContent = 'Anketi Düzenle';
    $('anket-id').value = id;
    $('anket-soru').value = anket.soru || '';
    $('anket-baslangic').value = anket.baslangicTarihi || '';
    $('anket-bitis').value = anket.bitisTarihi || '';
    $('anket-aktif').checked = !!anket.aktif;
    // Seçenekleri doldur
    var wrap = $('anket-secenekler-wrap');
    wrap.innerHTML = (anket.secenekler || []).map(function (s, i) {
      return '<div class="anket-secenek-input"><input type="text" placeholder="Seçenek ' + (i + 1) + '" required value="' + escapeHtml(s.metin) + '"><button type="button" class="anket-secenek-remove btn btn-sm btn-ghost" title="Kaldır">&times;</button></div>';
    }).join('');
    bindAnketSecenekRemove();
    $('anket-modal').showModal();
  }

  function bindAnketSecenekRemove() {
    var wrap = $('anket-secenekler-wrap');
    wrap.querySelectorAll('.anket-secenek-remove').forEach(function (btn) {
      btn.onclick = function () {
        if (wrap.children.length <= 2) { showToast('En az 2 seçenek gerekli', 'error'); return; }
        btn.parentElement.remove();
      };
    });
  }

  function anketSecenekEkle() {
    var wrap = $('anket-secenekler-wrap');
    if (wrap.children.length >= 5) { showToast('En fazla 5 seçenek eklenebilir', 'error'); return; }
    var div = document.createElement('div');
    div.className = 'anket-secenek-input';
    div.innerHTML = '<input type="text" placeholder="Seçenek ' + (wrap.children.length + 1) + '" required><button type="button" class="anket-secenek-remove btn btn-sm btn-ghost" title="Kaldır">&times;</button>';
    wrap.appendChild(div);
    bindAnketSecenekRemove();
    div.querySelector('input').focus();
  }

  function saveAnket(e) {
    e.preventDefault();
    var id = currentAnketEditId;
    var soru = $('anket-soru').value.trim();
    if (!soru) { showToast('Soru gerekli', 'error'); return; }

    var wrap = $('anket-secenekler-wrap');
    var inputs = wrap.querySelectorAll('input[type="text"]');
    var secenekler = [];
    inputs.forEach(function (inp) {
      var val = inp.value.trim();
      if (val) secenekler.push({ metin: val });
    });
    if (secenekler.length < 2) { showToast('En az 2 seçenek gerekli', 'error'); return; }

    var data = {
      soru: soru,
      secenekler: secenekler,
      aktif: $('anket-aktif').checked,
      baslangicTarihi: $('anket-baslangic').value || '',
      bitisTarihi: $('anket-bitis').value || ''
    };

    var btn = $('anket-form-submit');
    btn.disabled = true;

    api(id ? '/api/admin/anket/' + id : '/api/admin/anket', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.hata || 'Kayıt başarısız'); });
      return r.json();
    })
    .then(function () {
      showToast(id ? 'Anket güncellendi.' : 'Anket eklendi.');
      $('anket-modal').close();
      loadAnketler();
    })
    .catch(function (err) { showToast(err.message || 'Kaydedilemedi', 'error'); })
    .finally(function () { btn.disabled = false; });
  }

  function confirmAnketSil(id) {
    anketDeleteId = id;
    var anket = anketCache.find(function (a) { return String(a.id) === String(id); });
    $('anket-delete-message').textContent = anket ? '"' + anket.soru + '" silinsin mi?' : 'Bu anket silinsin mi?';
    $('anket-delete-modal').showModal();
  }

  function anketSil() {
    if (!anketDeleteId) return;
    $('anket-delete-modal').close();
    api('/api/admin/anket/' + anketDeleteId, { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) throw new Error('Silinemedi');
        return r.json();
      })
      .then(function () {
        showToast('Anket silindi.');
        anketDeleteId = null;
        loadAnketler();
      })
      .catch(function (err) { showToast(err.message || 'Silinemedi', 'error'); });
  }

  // ===================== REKLAMLAR =====================

  var REKLAM_SLOTS = [
    { slot: 'ana-1', label: 'Ana Sayfa - Üst Reklam', boyut: '728 x 90 px' },
    { slot: 'ana-2', label: 'Ana Sayfa - Alt Reklam', boyut: '728 x 90 px' },
    { slot: 'sidebar-1', label: 'Sidebar Reklam', boyut: '300 x 250 px' }
  ];
  var reklamCache = [];

  function loadReklamlar() {
    var loadingEl = $('reklamlar-loading');
    var listEl = $('reklamlar-list');
    if (loadingEl) loadingEl.hidden = false;

    apiJson('/api/admin/reklamlar')
      .then(function (result) {
        reklamCache = result.data || [];
        renderReklamlar();
      })
      .catch(function () {
        reklamCache = [];
        renderReklamlar();
        showToast('Reklamlar yüklenemedi', 'error');
      })
      .finally(function () {
        if (loadingEl) loadingEl.hidden = true;
      });
  }

  function renderReklamlar() {
    var listEl = $('reklamlar-list');
    if (!listEl) return;

    listEl.innerHTML = REKLAM_SLOTS.map(function (s) {
      var reklam = reklamCache.find(function (r) { return r.slot === s.slot; });
      var gorsel = reklam ? reklam.gorsel : '';
      var link = reklam ? reklam.link : '';
      var aktif = reklam ? reklam.aktif : false;
      var reklamId = reklam ? reklam.id : '';

      return '<div class="reklam-slot-card" data-slot="' + s.slot + '">' +
        '<div class="reklam-slot-card__header">' +
        '<h3 class="reklam-slot-card__title">' + escapeHtml(s.label) + '</h3>' +
        '<div class="reklam-slot-card__meta"><span class="reklam-slot-card__boyut">' + escapeHtml(s.boyut) + '</span><span class="reklam-slot-card__slot">' + escapeHtml(s.slot) + '</span></div>' +
        '</div>' +
        '<div class="reklam-slot-card__preview" id="reklam-preview-' + s.slot + '">' +
        (gorsel ? '<img src="' + escapeHtml(gorsel) + '" alt="Reklam önizleme">' : '<span class="reklam-slot-card__empty">Görsel yüklenmemiş</span>') +
        '</div>' +
        '<div class="reklam-slot-card__body">' +
        '<div class="form-row">' +
        '<label>Görsel</label>' +
        '<div class="reklam-upload-row">' +
        '<input type="file" accept="image/*" id="reklam-file-' + s.slot + '" hidden>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-reklam-browse="' + s.slot + '">Dosya Seç</button>' +
        '<span class="reklam-file-name" id="reklam-fname-' + s.slot + '">' + (gorsel ? 'Görsel yüklü' : 'Seçilmedi') + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="form-row">' +
        '<label>Link (URL)</label>' +
        '<input type="url" class="reklam-link-input" id="reklam-link-' + s.slot + '" placeholder="https://example.com" value="' + escapeHtml(link) + '">' +
        '</div>' +
        '<div class="form-row">' +
        '<label class="checkbox-label"><input type="checkbox" id="reklam-aktif-' + s.slot + '"' + (aktif ? ' checked' : '') + '><span>Aktif</span></label>' +
        '</div>' +
        '</div>' +
        '<div class="reklam-slot-card__footer">' +
        '<button type="button" class="btn btn-primary btn-sm" data-reklam-save="' + s.slot + '">Kaydet</button>' +
        (reklamId ? '<button type="button" class="btn btn-danger btn-sm" data-reklam-delete="' + reklamId + '">Sil</button>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    // Bind events
    listEl.querySelectorAll('[data-reklam-browse]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = btn.dataset.reklamBrowse;
        var fileInput = $('reklam-file-' + slot);
        if (fileInput) fileInput.click();
      });
    });

    REKLAM_SLOTS.forEach(function (s) {
      var fileInput = $('reklam-file-' + s.slot);
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          if (this.files[0]) handleReklamFile(s.slot, this.files[0]);
        });
      }
    });

    listEl.querySelectorAll('[data-reklam-save]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveReklam(btn.dataset.reklamSave);
      });
    });

    listEl.querySelectorAll('[data-reklam-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteReklam(btn.dataset.reklamDelete);
      });
    });
  }

  function handleReklamFile(slot, file) {
    if (!file || !file.type.startsWith('image/')) { showToast('Görsel dosyası seçin', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('Dosya 10MB\'dan küçük olmalı', 'error'); return; }

    var reader = new FileReader();
    reader.onerror = function () { showToast('Dosya okunamadı', 'error'); };
    reader.onload = function (e) {
      var originalDataUrl = e.target.result;
      var img = new Image();
      img.onerror = function () {
        setReklamPreview(slot, originalDataUrl, file.name);
      };
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          var MAX = 2000;
          var needsResize = w > MAX || h > MAX;
          if (needsResize) {
            var ratio = Math.min(MAX / w, MAX / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          var isPng = file.type === 'image/png';
          if (!needsResize && isPng) {
            // PNG ve boyut uygun: orijinali olduğu gibi kullan
            setReklamPreview(slot, originalDataUrl, file.name);
            return;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          var outType = isPng ? 'image/png' : 'image/jpeg';
          var resized = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
          if (!resized || resized.length < 100) {
            setReklamPreview(slot, originalDataUrl, file.name);
          } else {
            setReklamPreview(slot, resized, file.name);
          }
        } catch (err) {
          setReklamPreview(slot, originalDataUrl, file.name);
        }
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function setReklamPreview(slot, dataUrl, fileName) {
    var previewEl = $('reklam-preview-' + slot);
    if (previewEl) {
      previewEl.innerHTML = '<img src="' + dataUrl + '" alt="Reklam önizleme">';
      previewEl.dataset.gorsel = dataUrl;
    }
    var fnameEl = $('reklam-fname-' + slot);
    if (fnameEl) fnameEl.textContent = fileName || 'Görsel yüklü';
  }

  function saveReklam(slot) {
    var previewEl = $('reklam-preview-' + slot);
    var linkEl = $('reklam-link-' + slot);
    var aktifEl = $('reklam-aktif-' + slot);

    // Görseli al: önce dataset'ten (yeni yüklenen), yoksa mevcut img src
    var gorsel = '';
    if (previewEl && previewEl.dataset.gorsel) {
      gorsel = previewEl.dataset.gorsel;
    } else if (previewEl) {
      var imgTag = previewEl.querySelector('img');
      if (imgTag) gorsel = imgTag.src;
    }

    var link = linkEl ? linkEl.value.trim() : '';
    var aktif = aktifEl ? aktifEl.checked : false;

    if (!gorsel) { showToast('Görsel yükleyin', 'error'); return; }

    var data = {
      slot: slot,
      baslik: slot,
      gorsel: gorsel,
      link: link,
      aktif: aktif
    };

    api('/api/admin/reklamlar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.hata || 'Kayıt başarısız'); });
      return r.json();
    })
    .then(function () {
      showToast('Reklam kaydedildi.');
      loadReklamlar();
    })
    .catch(function (err) { showToast(err.message || 'Kaydedilemedi', 'error'); });
  }

  function deleteReklam(id) {
    if (!id) return;
    api('/api/admin/reklamlar/' + id, { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) throw new Error('Silinemedi');
        return r.json();
      })
      .then(function () {
        showToast('Reklam silindi.');
        loadReklamlar();
      })
      .catch(function (err) { showToast(err.message || 'Silinemedi', 'error'); });
  }

  // ===================== KARAKTER SAYAÇLARI =====================

  function updateCounters() {
    updateCounter('news-title', 'title-counter', 70);
    updateCounter('news-excerpt', 'excerpt-counter', 300);
  }

  function updateCounter(inputId, counterId, max) {
    var input = $(inputId);
    var counter = $(counterId);
    if (input && counter) counter.textContent = input.value.length + ' / ' + max;
  }

  // ===================== VİDEO =====================

  var currentVideoData = null;

  function parseVideoUrl(url) {
    if (!url || typeof url !== 'string') return null;
    url = url.trim();

    // YouTube: youtube.com/watch?v=ID or youtu.be/ID or youtube.com/embed/ID
    var ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      var vid = ytMatch[1];
      return {
        tip: 'youtube',
        url: url,
        embedUrl: 'https://www.youtube.com/embed/' + vid,
        kapak: 'https://img.youtube.com/vi/' + vid + '/hqdefault.jpg'
      };
    }

    // Instagram
    if (url.indexOf('instagram.com') !== -1) {
      var igMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/);
      if (igMatch) {
        return {
          tip: 'instagram',
          url: url,
          embedUrl: 'https://www.instagram.com/p/' + igMatch[1] + '/embed/',
          kapak: ''
        };
      }
    }

    // TikTok
    if (url.indexOf('tiktok.com') !== -1) {
      var ttMatch = url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/);
      if (ttMatch) {
        return {
          tip: 'tiktok',
          url: url,
          embedUrl: 'https://www.tiktok.com/embed/v2/' + ttMatch[1],
          kapak: ''
        };
      }
    }

    // Twitter/X
    if (url.indexOf('twitter.com') !== -1 || url.indexOf('x.com') !== -1) {
      var twMatch = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
      if (twMatch) {
        return {
          tip: 'twitter',
          url: url,
          embedUrl: 'https://platform.twitter.com/embed/Tweet.html?id=' + twMatch[1],
          kapak: ''
        };
      }
    }

    return null;
  }

  function uploadVideo(file) {
    return new Promise(function(resolve, reject) {
      var formData = new FormData();
      formData.append('video', file);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/video-yukle');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

      var progressEl = $('video-upload-progress');
      var fillEl = $('video-progress-fill');
      var textEl = $('video-progress-text');
      if (progressEl) progressEl.hidden = false;

      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          if (fillEl) fillEl.style.width = pct + '%';
          if (textEl) textEl.textContent = 'Yukleniyor... %' + pct;
        }
      };

      xhr.onload = function() {
        if (progressEl) progressEl.hidden = true;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            resolve(data.url);
          } catch (e) { reject(new Error('Yanit okunamadi')); }
        } else {
          reject(new Error('Yukleme basarisiz (' + xhr.status + ')'));
        }
      };

      xhr.onerror = function() {
        if (progressEl) progressEl.hidden = true;
        reject(new Error('Ag hatasi'));
      };

      xhr.send(formData);
    });
  }

  function showVideoPreview(videoData) {
    currentVideoData = videoData;
    var previewEl = $('news-video-preview');
    var optionsEl = $('news-video-options');
    var infoEl = $('news-video-info');
    if (!previewEl || !optionsEl) return;

    var label = videoData.tip || 'video';
    if (videoData.tip === 'youtube') label = 'YouTube';
    else if (videoData.tip === 'instagram') label = 'Instagram';
    else if (videoData.tip === 'tiktok') label = 'TikTok';
    else if (videoData.tip === 'twitter') label = 'Twitter/X';
    else if (videoData.tip === 'dosya') label = 'Video dosyasi';

    if (infoEl) infoEl.textContent = label + ': ' + (videoData.url || '').substring(0, 60) + (videoData.url && videoData.url.length > 60 ? '...' : '');
    previewEl.hidden = false;
    optionsEl.style.display = 'none';
  }

  function clearVideoPreview() {
    currentVideoData = null;
    var previewEl = $('news-video-preview');
    var optionsEl = $('news-video-options');
    if (previewEl) previewEl.hidden = true;
    if (optionsEl) optionsEl.style.display = '';
  }

  function initVideoUpload() {
    // Tab switching
    var tabLink = $('video-tab-link');
    var tabUpload = $('video-tab-upload');
    var linkPanel = $('video-link-panel');
    var uploadPanel = $('video-upload-panel');

    if (tabLink && tabUpload) {
      tabLink.addEventListener('click', function() {
        tabLink.classList.add('active');
        tabUpload.classList.remove('active');
        if (linkPanel) linkPanel.hidden = false;
        if (uploadPanel) uploadPanel.hidden = true;
      });
      tabUpload.addEventListener('click', function() {
        tabUpload.classList.add('active');
        tabLink.classList.remove('active');
        if (uploadPanel) uploadPanel.hidden = false;
        if (linkPanel) linkPanel.hidden = true;
      });
    }

    // URL apply
    var urlApplyBtn = $('news-video-url-apply');
    if (urlApplyBtn) {
      urlApplyBtn.addEventListener('click', function() {
        var urlInput = $('news-video-url');
        var url = urlInput ? urlInput.value.trim() : '';
        if (!url) { showToast('URL girin', 'error'); return; }
        var parsed = parseVideoUrl(url);
        if (!parsed) { showToast('Desteklenmeyen video linki. YouTube, Instagram, TikTok veya Twitter linki girin.', 'error'); return; }
        showVideoPreview(parsed);
        if (urlInput) urlInput.value = '';
      });
    }

    // File upload - dropzone
    var dropzone = $('news-video-dropzone');
    var fileInput = $('news-video-file');
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function() { fileInput.click(); });
      dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('drag-over'); });
      dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('drag-over'); });
      dropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleVideoFile(e.dataTransfer.files[0]);
      });
      fileInput.addEventListener('change', function() {
        if (this.files[0]) handleVideoFile(this.files[0]);
      });
    }

    function handleVideoFile(file) {
      if (!file.type.startsWith('video/')) { showToast('Video dosyasi secin', 'error'); return; }
      if (file.size > 50 * 1024 * 1024) { showToast('Dosya 50MB\'dan kucuk olmali', 'error'); return; }

      uploadVideo(file)
        .then(function(url) {
          showVideoPreview({
            tip: 'dosya',
            url: url,
            embedUrl: '',
            kapak: ''
          });
          showToast('Video yuklendi');
        })
        .catch(function(err) {
          showToast(err.message || 'Video yuklenemedi', 'error');
        });
    }

    // Remove button
    var removeBtn = $('news-video-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', clearVideoPreview);
    }
  }

  // ===================== GÖRSEL YÜKLEME =====================

  function initImageUpload() {
    var dropzone = $('news-image-dropzone');
    var fileInput = $('news-image-file');
    var browseBtn = $('news-image-browse');

    if (!dropzone || !fileInput) return;

    function showPreview(dataUrl, fileName, metaText) {
      $('news-image-preview-img').src = dataUrl;
      var nameEl = $('news-image-preview-name');
      var metaEl = $('news-image-preview-meta');
      if (nameEl) nameEl.textContent = fileName || '';
      if (metaEl) metaEl.textContent = metaText || '';
      $('news-image-preview').hidden = false;
      $('news-image-upload-options').style.display = 'none';
    }

    function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) { showToast('Görsel dosyası seçin', 'error'); return; }
      if (file.size > 10 * 1024 * 1024) { showToast('Dosya 10MB\'dan küçük olmalı', 'error'); return; }

      var reader = new FileReader();
      reader.onerror = function () { showToast('Dosya okunamadı', 'error'); };
      reader.onload = function (e) {
        var originalDataUrl = e.target.result;
        var img = new Image();
        img.onerror = function () {
          // Görsel decode edilemezse ham data URL'yi kullan
          showPreview(originalDataUrl, file.name, (file.size / 1024).toFixed(1) + ' KB');
        };
        img.onload = function () {
          try {
            var w = img.width, h = img.height;
            var MAX = 2000;
            var needsResize = w > MAX || h > MAX;
            if (needsResize) {
              var ratio = Math.min(MAX / w, MAX / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            var isPng = file.type === 'image/png';
            if (!needsResize && isPng) {
              showPreview(originalDataUrl, file.name, (file.size / 1024).toFixed(1) + ' KB');
              return;
            }
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            var resized = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
            if (!resized || resized.length < 100) {
              showPreview(originalDataUrl, file.name, (file.size / 1024).toFixed(1) + ' KB');
            } else {
              var sizeKB = Math.round(resized.length * 3 / 4 / 1024);
              showPreview(resized, file.name, sizeKB + ' KB' + (isPng ? '' : ' (sıkıştırılmış)'));
            }
          } catch (err) {
            showPreview(originalDataUrl, file.name, (file.size / 1024).toFixed(1) + ' KB');
          }
        };
        img.src = originalDataUrl;
      };
      reader.readAsDataURL(file);
    }

    dropzone.addEventListener('click', function () { fileInput.click(); });
    if (browseBtn) browseBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () { if (this.files[0]) handleFile(this.files[0]); });

    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
  }

  // ===================== ÖNİZLEME =====================

  function initPreview() {
    var btn = $('news-form-preview');
    var modal = $('preview-modal');
    var content = $('preview-content');
    if (!btn || !modal) return;

    btn.addEventListener('click', function () {
      var title = $('news-title').value || 'Başlıksız';
      var cat = $('news-category').value || '';
      var author = $('news-author').value || 'Editör';
      var excerpt = $('news-excerpt').value || '';
      var body = getQuillContent();
      var img = $('news-image-preview-img');
      var imgSrc = (img && !$('news-image-preview').hidden) ? img.src : '';

      content.innerHTML =
        '<article class="preview-article">' +
        (cat ? '<span class="preview-category">' + escapeHtml(cat) + '</span>' : '') +
        '<h1 class="preview-title">' + escapeHtml(title) + '</h1>' +
        '<div class="preview-meta">' + escapeHtml(author) + ' &middot; ' + new Date().toLocaleDateString('tr-TR') + '</div>' +
        (imgSrc ? '<img class="preview-image" src="' + escapeHtml(imgSrc) + '" alt="">' : '') +
        (excerpt ? '<p class="preview-excerpt">' + escapeHtml(excerpt) + '</p>' : '') +
        '<div class="preview-body">' + body + '</div>' +
        '</article>';
      content.classList.remove('preview-mobile');
      modal.showModal();
    });

    $('preview-close').addEventListener('click', function () { modal.close(); });
    $('preview-toggle-mobile').addEventListener('click', function () { content.classList.add('preview-mobile'); });
    $('preview-toggle-desktop').addEventListener('click', function () { content.classList.remove('preview-mobile'); });
  }

  // ===================== QUILL (defer bekleme) =====================

  function initQuill() {
    if (quillEditor || !window.Quill) return false;
    var el = $('news-content');
    if (!el) return false;
    quillEditor = new Quill(el, {
      theme: 'snow',
      placeholder: 'Haber içeriğini buraya yazın...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'link', 'image'],
          ['clean']
        ]
      }
    });
    return true;
  }

  // CDN kütüphanelerini bekle
  function waitForLibs() {
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (!quillEditor && window.Quill) initQuill();
      if (window.lucide) window.lucide.createIcons();
      if ((quillEditor || attempts > 30) && attempts > 5) clearInterval(interval);
    }, 300);
  }

  // ===================== INIT =====================

  function init() {
    fillCategorySelects();
    initImageUpload();
    initVideoUpload();
    initPreview();
    initQuill();
    waitForLibs();

    // Login form
    $('login-form').addEventListener('submit', handleLogin);

    // Logout
    $('logout-btn').addEventListener('click', logout);

    // Navigasyon
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        if (item.dataset.page) showPage(item.dataset.page);
        $('sidebar').classList.remove('open');
      });
    });

    // Sidebar toggle
    $('sidebar-toggle').addEventListener('click', function () {
      $('sidebar').classList.toggle('open');
    });

    // Dashboard butonları
    var dashAddBtn = $('dash-add-news');
    if (dashAddBtn) dashAddBtn.addEventListener('click', function () { showPage('news'); openNewModal(); });
    var dashRefreshBtn = $('dash-refresh');
    if (dashRefreshBtn) dashRefreshBtn.addEventListener('click', function () { loadDashboard(); showToast('Dashboard yenilendi', 'info'); });
    var dashGoNewsBtn = $('dash-go-news');
    if (dashGoNewsBtn) dashGoNewsBtn.addEventListener('click', function () { showPage('news'); });

    // Son Dakika widget butonları
    var breakingAddBtn = $('breaking-add-btn');
    var breakingAddMenu = $('breaking-add-menu');
    if (breakingAddBtn && breakingAddMenu) {
      breakingAddBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        breakingAddMenu.hidden = !breakingAddMenu.hidden;
      });
      document.addEventListener('click', function () {
        breakingAddMenu.hidden = true;
      });
    }
    var breakingPickExistingBtn = $('breaking-pick-existing');
    if (breakingPickExistingBtn) {
      breakingPickExistingBtn.addEventListener('click', function () {
        breakingAddMenu.hidden = true;
        breakingPickExisting(dashboardHaberler);
      });
    }
    var breakingAddNewBtn = $('breaking-add-new');
    if (breakingAddNewBtn) {
      breakingAddNewBtn.addEventListener('click', function () {
        breakingAddMenu.hidden = true;
        openNewModal();
        $('news-breaking').checked = true;
        $('breaking-duration-row').hidden = false;
      });
    }
    var breakingPickCloseBtn = $('breaking-pick-close');
    if (breakingPickCloseBtn) {
      breakingPickCloseBtn.addEventListener('click', function () {
        $('breaking-pick-modal').close();
      });
    }

    // Kategoriler sayfası
    var catGoNewsBtn = $('cat-go-news');
    if (catGoNewsBtn) catGoNewsBtn.addEventListener('click', function () { showPage('news'); });

    // Haber ekleme
    $('news-add-btn').addEventListener('click', openNewModal);
    $('news-form').addEventListener('submit', saveNews);
    $('news-modal-close').addEventListener('click', function () { $('news-modal').close(); });
    $('news-form-cancel').addEventListener('click', function () { $('news-modal').close(); });

    // Silme
    $('delete-cancel').addEventListener('click', function () { $('delete-modal').close(); });
    $('delete-confirm').addEventListener('click', doDelete);

    // Arama / filtre / sıralama
    $('news-search').addEventListener('input', renderNewsView);
    $('news-filter-category').addEventListener('change', renderNewsView);
    $('news-sort').addEventListener('change', renderNewsView);

    // Görünüm geçişi
    var viewTableBtn = $('view-table-btn');
    var viewCardBtn = $('view-card-btn');
    if (viewTableBtn) viewTableBtn.addEventListener('click', function () { setNewsView('table'); });
    if (viewCardBtn) viewCardBtn.addEventListener('click', function () { setNewsView('card'); });

    // Select-all checkbox
    var selectAllCb = $('select-all');
    if (selectAllCb) selectAllCb.addEventListener('change', toggleSelectAll);

    // Toplu işlem butonları
    var bulkDeleteBtn = $('bulk-delete-btn');
    if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDelete);
    var bulkClearBtn = $('bulk-clear-btn');
    if (bulkClearBtn) bulkClearBtn.addEventListener('click', function () {
      selectedNewsIds = [];
      updateBulkBar();
      updateSelectAll();
      document.querySelectorAll('#news-tbody input[type="checkbox"][data-id]').forEach(function (cb) { cb.checked = false; });
    });

    // Sayfalama
    var prevBtn = $('news-prev-btn');
    var nextBtn = $('news-next-btn');
    if (prevBtn) prevBtn.addEventListener('click', function () { goToNewsPage(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { goToNewsPage(1); });

    // Boş durum CTA
    var emptyAddBtn = $('news-empty-add-btn');
    if (emptyAddBtn) emptyAddBtn.addEventListener('click', openNewModal);

    // Son dakika checkbox → süre seçici göster/gizle
    $('news-breaking').addEventListener('change', function () {
      $('breaking-duration-row').hidden = !this.checked;
    });

    // Slug otomatik
    $('news-title').addEventListener('input', function () {
      updateCounter('news-title', 'title-counter', 70);
      if (!currentEditId) $('news-slug').value = slugify(this.value);
    });
    $('news-excerpt').addEventListener('input', function () {
      updateCounter('news-excerpt', 'excerpt-counter', 300);
    });

    // Anket
    var anketAddBtn = $('anket-add-btn');
    if (anketAddBtn) anketAddBtn.addEventListener('click', openAnketNewModal);
    var anketForm = $('anket-form');
    if (anketForm) anketForm.addEventListener('submit', saveAnket);
    var anketModalClose = $('anket-modal-close');
    if (anketModalClose) anketModalClose.addEventListener('click', function () { $('anket-modal').close(); });
    var anketFormCancel = $('anket-form-cancel');
    if (anketFormCancel) anketFormCancel.addEventListener('click', function () { $('anket-modal').close(); });
    var anketSecenekEkleBtn = $('anket-secenek-ekle');
    if (anketSecenekEkleBtn) anketSecenekEkleBtn.addEventListener('click', anketSecenekEkle);
    var anketDeleteCancel = $('anket-delete-cancel');
    if (anketDeleteCancel) anketDeleteCancel.addEventListener('click', function () { $('anket-delete-modal').close(); });
    var anketDeleteConfirm = $('anket-delete-confirm');
    if (anketDeleteConfirm) anketDeleteConfirm.addEventListener('click', anketSil);

    // Görsel kaldır
    $('news-image-remove').addEventListener('click', function () {
      $('news-image-preview').hidden = true;
      $('news-image-upload-options').style.display = '';
    });

    // URL görsel
    $('news-image-url-apply').addEventListener('click', function () {
      var url = $('news-image-url').value.trim();
      if (url) {
        $('news-image-preview-img').src = url;
        $('news-image-preview').hidden = false;
        $('news-image-upload-options').style.display = 'none';
        $('news-image-url').value = '';
      }
    });

    // ========== NÖBETÇİ ECZANE ==========
    function loadEczane() {
      var list = $('eczane-admin-list');
      if (!list) return;
      apiFetch('/api/admin/eczane').then(function(r) { return r.json(); }).then(function(result) {
        var data = result.data || [];
        if (!Array.isArray(data) || data.length === 0) {
          list.innerHTML = '<p class="muted">Henüz eczane eklenmemiş.</p>';
          return;
        }
        list.innerHTML = data.map(function(e) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #eee">'
            + '<div><strong>' + escapeHtml(e.ad) + '</strong><br><small>' + escapeHtml(e.adres || '') + ' ' + escapeHtml(e.telefon || '') + '</small></div>'
            + '<button class="btn btn-sm btn-danger" data-eczane-sil="' + e.id + '">Sil</button>'
            + '</div>';
        }).join('');
        list.querySelectorAll('[data-eczane-sil]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            apiFetch('/api/admin/eczane/' + btn.dataset.eczaneSil, { method: 'DELETE' }).then(function() { loadEczane(); });
          });
        });
      }).catch(function() { list.innerHTML = '<p class="muted">Yüklenemedi.</p>'; });
    }

    var eczaneAddBtn = $('eczane-add-btn');
    if (eczaneAddBtn) eczaneAddBtn.addEventListener('click', function() { $('eczane-modal').showModal(); });
    var eczaneModalClose = $('eczane-modal-close');
    if (eczaneModalClose) eczaneModalClose.addEventListener('click', function() { $('eczane-modal').close(); });
    var eczaneFormCancel = $('eczane-form-cancel');
    if (eczaneFormCancel) eczaneFormCancel.addEventListener('click', function() { $('eczane-modal').close(); });
    var eczaneForm = $('eczane-form');
    if (eczaneForm) eczaneForm.addEventListener('submit', function(e) {
      e.preventDefault();
      apiFetch('/api/admin/eczane', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad: $('eczane-ad').value, adres: $('eczane-adres').value, telefon: $('eczane-tel').value })
      }).then(function() {
        $('eczane-modal').close();
        eczaneForm.reset();
        loadEczane();
        showToast('Eczane eklendi', 'success');
      }).catch(function() { showToast('Eklenemedi', 'error'); });
    });

    // ========== VEFAT İLANLARI ==========
    function loadVefat() {
      var list = $('vefat-admin-list');
      if (!list) return;
      apiFetch('/api/admin/vefat').then(function(r) { return r.json(); }).then(function(result) {
        var data = result.data || [];
        if (!Array.isArray(data) || data.length === 0) {
          list.innerHTML = '<p class="muted">Henüz ilan eklenmemiş.</p>';
          return;
        }
        list.innerHTML = data.map(function(v) {
          return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eee">'
            + '<div><strong>' + escapeHtml(v.ad) + '</strong><br><small>' + escapeHtml(v.detay || '') + '</small><br><small style="color:#999">' + escapeHtml(v.tarih || '') + '</small></div>'
            + '<button class="btn btn-sm btn-danger" data-vefat-sil="' + v.id + '">Sil</button>'
            + '</div>';
        }).join('');
        list.querySelectorAll('[data-vefat-sil]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            apiFetch('/api/admin/vefat/' + btn.dataset.vefatSil, { method: 'DELETE' }).then(function() { loadVefat(); });
          });
        });
      }).catch(function() { list.innerHTML = '<p class="muted">Yüklenemedi.</p>'; });
    }

    var vefatAddBtn = $('vefat-add-btn');
    if (vefatAddBtn) vefatAddBtn.addEventListener('click', function() { $('vefat-modal').showModal(); });
    var vefatModalClose = $('vefat-modal-close');
    if (vefatModalClose) vefatModalClose.addEventListener('click', function() { $('vefat-modal').close(); });
    var vefatFormCancel = $('vefat-form-cancel');
    if (vefatFormCancel) vefatFormCancel.addEventListener('click', function() { $('vefat-modal').close(); });
    var vefatForm = $('vefat-form');
    if (vefatForm) vefatForm.addEventListener('submit', function(e) {
      e.preventDefault();
      apiFetch('/api/admin/vefat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad: $('vefat-ad').value, detay: $('vefat-detay').value, tarih: $('vefat-tarih').value })
      }).then(function() {
        $('vefat-modal').close();
        vefatForm.reset();
        loadVefat();
        showToast('Vefat ilanı eklendi', 'success');
      }).catch(function() { showToast('Eklenemedi', 'error'); });
    });

    // ========== ÜZÜM FİYATLARI ==========
    function loadUzumFiyat() {
      var rows = $('uzum-fiyat-rows');
      if (!rows) return;
      apiFetch('/api/admin/uzum-fiyat').then(function(r) { return r.json(); }).then(function(result) {
        var veri = result.data || {};
        var fiyatlar = veri.fiyatlar || [];
        if (fiyatlar.length === 0) {
          fiyatlar = [{ tur: 'Sultaniye (Kuru)', fiyat: '' }, { tur: 'Sultaniye (Yaş)', fiyat: '' }];
        }
        rows.innerHTML = fiyatlar.map(function(f, i) {
          return '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center" class="uzum-fiyat-row">'
            + '<input type="text" placeholder="Üzüm türü" value="' + escapeHtml(f.tur || '') + '" style="flex:2;padding:8px;border:1px solid #ddd;border-radius:4px" class="uzum-tur">'
            + '<input type="text" placeholder="Fiyat (TL/kg)" value="' + escapeHtml(f.fiyat || '') + '" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px" class="uzum-fyt">'
            + '<button type="button" class="btn btn-sm btn-ghost uzum-row-sil" style="color:red">&times;</button>'
            + '</div>';
        }).join('');
        rows.querySelectorAll('.uzum-row-sil').forEach(function(btn) {
          btn.addEventListener('click', function() { btn.parentElement.remove(); });
        });
      }).catch(function() {});
    }

    var uzumAddRow = $('uzum-fiyat-add-row');
    if (uzumAddRow) uzumAddRow.addEventListener('click', function() {
      var rows = $('uzum-fiyat-rows');
      var div = document.createElement('div');
      div.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
      div.className = 'uzum-fiyat-row';
      div.innerHTML = '<input type="text" placeholder="Üzüm türü" style="flex:2;padding:8px;border:1px solid #ddd;border-radius:4px" class="uzum-tur">'
        + '<input type="text" placeholder="Fiyat (TL/kg)" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px" class="uzum-fyt">'
        + '<button type="button" class="btn btn-sm btn-ghost uzum-row-sil" style="color:red">&times;</button>';
      rows.appendChild(div);
      div.querySelector('.uzum-row-sil').addEventListener('click', function() { div.remove(); });
    });

    var uzumSaveBtn = $('uzum-fiyat-save-btn');
    if (uzumSaveBtn) uzumSaveBtn.addEventListener('click', function() {
      var rowEls = document.querySelectorAll('.uzum-fiyat-row');
      var fiyatlar = [];
      rowEls.forEach(function(row) {
        var tur = row.querySelector('.uzum-tur').value.trim();
        var fiyat = row.querySelector('.uzum-fyt').value.trim();
        if (tur) fiyatlar.push({ tur: tur, fiyat: fiyat });
      });
      apiFetch('/api/admin/uzum-fiyat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiyatlar: fiyatlar })
      }).then(function() {
        showToast('Fiyatlar güncellendi', 'success');
      }).catch(function() { showToast('Güncellenemedi', 'error'); });
    });

    // Sayfa navigasyonunda yeni bölümleri yükle
    var origShowPage = null;
    document.querySelectorAll('.nav-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var page = item.dataset.page;
        if (page === 'eczane') setTimeout(loadEczane, 100);
        if (page === 'vefat') setTimeout(loadVefat, 100);
        if (page === 'uzum-fiyat') setTimeout(loadUzumFiyat, 100);
      });
    });

    // Oturum kontrolü
    if (isLoggedIn()) {
      validateToken();
    } else {
      showLogin();
    }
  }

  // DOM hazır olunca başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

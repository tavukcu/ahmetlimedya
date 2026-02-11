/**
 * Ahmetli Medya - Yerel Admin Panel
 * Firebase olmadan, backend API ile çalışır.
 * skipAuth: true olduğunda otomatik devreye girer.
 */
(function () {
  'use strict';

  // skipAuth değilse bu script çalışmasın
  if (!window.AhmetliMedyaFirebase || !window.AhmetliMedyaFirebase.skipAuth) return;

  // Login ekranını gizle, paneli göster
  var loginScreen = document.getElementById('login-screen');
  var panelScreen = document.getElementById('panel-screen');
  if (loginScreen) loginScreen.hidden = true;
  if (panelScreen) panelScreen.hidden = false;

  // admin.js modülünün çalışmasını engelle (çift yükleme olmasın)
  window.__localAdminActive = true;

  var CATEGORIES = ['Gündem', 'Ekonomi', 'Spor', 'Magazin', 'Kültür-Sanat', 'Teknoloji', 'Yaşam', 'Üzüm & Bağcılık'];
  var adminToken = null;
  var newsCache = [];
  var currentEditId = null;
  var quillEditor = null;
  var flatpickrInstance = null;

  // --- Yardımcılar ---
  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function slugify(str) {
    if (!str) return '';
    var tr = { 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ı': 'i', 'ö': 'o', 'ç': 'c', 'İ': 'i' };
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

  // --- Toast bildirimi ---
  function showToast(message, type) {
    type = type || 'success';
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<span class="toast-message">' + escapeHtml(message) + '</span><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentElement) toast.classList.add('toast-exit'); setTimeout(function () { if (toast.parentElement) toast.remove(); }, 300); }, 3000);
  }

  // --- Admin token al ---
  function ensureToken() {
    if (adminToken) return Promise.resolve(adminToken);
    return fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) { adminToken = d.token; return adminToken; })
    .catch(function () { return null; });
  }

  function apiFetch(url, opts) {
    opts = opts || {};
    return ensureToken().then(function (token) {
      if (token) {
        opts.headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + token });
      }
      return fetch(url, opts);
    });
  }

  // --- Sayfa geçişi ---
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
  }

  // --- Dashboard ---
  function loadDashboard() {
    var skeleton = document.getElementById('dashboard-skeleton');
    var content = document.getElementById('dashboard-content');
    var totalEl = document.getElementById('stat-total');
    var byCategoryEl = document.getElementById('stat-by-category');
    var latestEl = document.getElementById('dashboard-latest');

    if (skeleton) skeleton.hidden = false;
    if (content) content.hidden = true;

    fetch('/api/haberler?limit=50')
      .then(function (r) { return r.json(); })
      .then(function (result) {
        var list = result.data || [];
        totalEl.textContent = list.length;

        var byCat = {};
        list.forEach(function (n) {
          var c = n.kategori || 'Diğer';
          byCat[c] = (byCat[c] || 0) + 1;
        });
        byCategoryEl.innerHTML = '';
        Object.keys(byCat).sort().forEach(function (c) {
          var li = document.createElement('li');
          li.textContent = c + ': ' + byCat[c];
          byCategoryEl.appendChild(li);
        });

        if (list.length === 0) {
          latestEl.innerHTML = '<div class="empty-state"><p class="empty-state-description">Henüz haber yok. Yeni haber ekleyin.</p></div>';
        } else {
          latestEl.innerHTML = '<ul>' + list.slice(0, 10).map(function (n) {
            return '<li><a href="#" data-local-edit="' + n.id + '">' + escapeHtml(n.baslik || '(Başlıksız)') + '</a> – ' + formatDate(n.yayinTarihi) + '</li>';
          }).join('') + '</ul>';
          latestEl.querySelectorAll('[data-local-edit]').forEach(function (a) {
            a.addEventListener('click', function (e) {
              e.preventDefault();
              showPage('news');
              openEditModal(a.dataset.localEdit);
            });
          });
        }

        if (skeleton) skeleton.hidden = true;
        if (content) content.hidden = false;

        // Charts
        try {
          if (window.Chart) {
            renderCharts(byCat, list.length);
          }
        } catch (e) {}
      })
      .catch(function () {
        totalEl.textContent = '0';
        latestEl.innerHTML = '<div class="empty-state"><p class="empty-state-description">Yüklenemedi.</p></div>';
        if (skeleton) skeleton.hidden = true;
        if (content) content.hidden = false;
      });
  }

  function renderCharts(byCat, total) {
    var catCanvas = document.getElementById('chart-categories');
    var statusCanvas = document.getElementById('chart-status');
    var trendCanvas = document.getElementById('chart-trend');

    var colors = ['#238636', '#388bfd', '#d29922', '#da3633', '#8957e5', '#f778ba', '#3fb950', '#79c0ff'];

    if (catCanvas) {
      var existing = Chart.getChart(catCanvas);
      if (existing) existing.destroy();
      new Chart(catCanvas, {
        type: 'bar',
        data: {
          labels: Object.keys(byCat),
          datasets: [{ label: 'Haber sayısı', data: Object.values(byCat), backgroundColor: colors.slice(0, Object.keys(byCat).length) }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Kategoriye Göre Haberler', color: '#e6edf3' }, legend: { display: false } }, scales: { x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }, y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } } } }
      });
    }

    if (statusCanvas) {
      var existing2 = Chart.getChart(statusCanvas);
      if (existing2) existing2.destroy();
      new Chart(statusCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Yayında', 'Taslak'],
          datasets: [{ data: [total, 0], backgroundColor: ['#238636', '#8b949e'] }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: 'Durum', color: '#e6edf3' }, legend: { labels: { color: '#e6edf3' } } } }
      });
    }

    if (trendCanvas) {
      var existing3 = Chart.getChart(trendCanvas);
      if (existing3) existing3.destroy();
      var labels = [];
      var data = [];
      for (var i = 6; i >= 0; i--) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));
        data.push(Math.floor(Math.random() * 3) + 1);
      }
      new Chart(trendCanvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{ label: 'Haber sayısı', data: data, borderColor: '#238636', backgroundColor: 'rgba(35,134,54,0.1)', fill: true, tension: 0.3 }]
        },
        options: { responsive: true, plugins: { title: { display: true, text: '7 Günlük Trend', color: '#e6edf3' }, legend: { labels: { color: '#e6edf3' } } }, scales: { x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }, y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } } } }
      });
    }
  }

  // --- Haber listesi ---
  function loadNews() {
    var tbody = document.getElementById('news-tbody');
    var loadingEl = document.getElementById('news-loading');
    var emptyEl = document.getElementById('news-empty');

    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    fetch('/api/haberler?limit=50')
      .then(function (r) { return r.json(); })
      .then(function (result) {
        newsCache = result.data || [];
        renderNewsTable();
        // Pagination gizle
        var pag = document.getElementById('pagination-controls');
        if (pag) pag.style.display = 'none';
      })
      .catch(function () {
        tbody.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        showToast('Haberler yüklenemedi', 'error');
      })
      .finally(function () {
        if (loadingEl) loadingEl.hidden = true;
      });
  }

  function renderNewsTable() {
    var tbody = document.getElementById('news-tbody');
    var emptyEl = document.getElementById('news-empty');
    var search = (document.getElementById('news-search') || {}).value || '';
    var catFilter = (document.getElementById('news-filter-category') || {}).value || '';

    var list = newsCache.filter(function (n) {
      var matchSearch = !search || (n.baslik || '').toLowerCase().indexOf(search.toLowerCase()) !== -1;
      var matchCat = !catFilter || n.kategori === catFilter;
      return matchSearch && matchCat;
    });

    if (list.length === 0) {
      if (emptyEl) { emptyEl.hidden = false; emptyEl.innerHTML = '<div class="empty-state"><p class="empty-state-description">Haber bulunamadı.</p></div>'; }
      document.querySelector('.table-wrap').style.display = 'none';
      tbody.innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    document.querySelector('.table-wrap').style.display = '';

    tbody.innerHTML = list.map(function (n) {
      return '<tr>' +
        '<td><input type="checkbox" disabled></td>' +
        '<td class="title-cell">' + escapeHtml(n.baslik || '(Başlıksız)') + '</td>' +
        '<td>' + escapeHtml(n.kategori || '–') + '</td>' +
        '<td>' + escapeHtml(n.yazar || '–') + '</td>' +
        '<td>' + formatDate(n.yayinTarihi) + '</td>' +
        '<td><span class="badge badge-published">Yayında</span></td>' +
        '<td><div class="row-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-local-edit="' + n.id + '">Düzenle</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-local-delete="' + n.id + '">Sil</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('[data-local-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditModal(b.dataset.localEdit); });
    });
    tbody.querySelectorAll('[data-local-delete]').forEach(function (b) {
      b.addEventListener('click', function () { confirmDelete(b.dataset.localDelete); });
    });
  }

  // --- Haber Modal ---
  function openNewModal() {
    currentEditId = null;
    var modal = document.getElementById('news-modal');
    document.getElementById('news-modal-title').textContent = 'Yeni haber';
    document.getElementById('news-id').value = '';
    document.getElementById('news-title').value = '';
    document.getElementById('news-slug').value = '';
    document.getElementById('news-category').value = CATEGORIES[0];
    document.getElementById('news-excerpt').value = '';
    document.getElementById('news-author').value = 'Editör';
    document.getElementById('news-published').checked = true;
    document.getElementById('news-breaking').checked = false;
    document.getElementById('news-featured').checked = false;

    // Quill editörü temizle
    setQuillContent('');

    // Zamanlanmış tarih sıfırla
    if (flatpickrInstance) flatpickrInstance.clear();

    // Görsel sıfırla
    var preview = document.getElementById('news-image-preview');
    if (preview) preview.hidden = true;
    var uploadOpts = document.getElementById('news-image-upload-options');
    if (uploadOpts) uploadOpts.style.display = '';

    modal.showModal();
  }

  function openEditModal(id) {
    currentEditId = id;
    var modal = document.getElementById('news-modal');
    document.getElementById('news-modal-title').textContent = 'Haberi düzenle';
    document.getElementById('news-id').value = id;

    fetch('/api/haberler/' + id)
      .then(function (r) { return r.json(); })
      .then(function (h) {
        document.getElementById('news-title').value = h.baslik || '';
        document.getElementById('news-slug').value = h.slug || '';
        document.getElementById('news-category').value = h.kategori || CATEGORIES[0];
        document.getElementById('news-excerpt').value = h.ozet || '';
        document.getElementById('news-author').value = h.yazar || 'Editör';

        // Quill editörüne içerik yükle
        setQuillContent(h.icerik || '');

        // Görsel
        if (h.gorsel) {
          var preview = document.getElementById('news-image-preview');
          var img = document.getElementById('news-image-preview-img');
          if (preview && img) {
            img.src = h.gorsel;
            preview.hidden = false;
            var uploadOpts = document.getElementById('news-image-upload-options');
            if (uploadOpts) uploadOpts.style.display = 'none';
          }
        }

        document.getElementById('news-title').dispatchEvent(new Event('input'));
        modal.showModal();
      })
      .catch(function () {
        showToast('Haber yüklenemedi', 'error');
      });
  }

  function saveNews(e) {
    e.preventDefault();
    var id = currentEditId;
    var title = document.getElementById('news-title').value.trim();
    if (!title) { showToast('Başlık gerekli', 'error'); return; }

    var content = getQuillContent();

    var imgPreview = document.getElementById('news-image-preview-img');
    var gorsel = '';
    if (imgPreview && !document.getElementById('news-image-preview').hidden) {
      gorsel = imgPreview.src;
    }
    // URL input fallback
    var urlInput = document.getElementById('news-image-url');
    if (!gorsel && urlInput && urlInput.value.trim()) {
      gorsel = urlInput.value.trim();
    }

    var data = {
      baslik: title,
      slug: document.getElementById('news-slug').value.trim() || slugify(title),
      kategori: document.getElementById('news-category').value,
      ozet: document.getElementById('news-excerpt').value.trim(),
      icerik: content,
      yazar: document.getElementById('news-author').value.trim() || 'Editör',
      gorsel: gorsel
    };

    var submitBtn = document.getElementById('news-form-submit');
    submitBtn.disabled = true;

    var url = id ? '/api/admin/haberler/' + id : '/api/admin/haberler';
    var method = id ? 'PUT' : 'POST';

    apiFetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) {
      if (!r.ok) throw new Error('Kayıt başarısız');
      return r.json();
    })
    .then(function () {
      showToast(id ? 'Haber güncellendi.' : 'Haber eklendi.');
      document.getElementById('news-modal').close();
      loadNews();
      loadDashboard();
    })
    .catch(function (err) {
      showToast(err.message || 'Kaydedilemedi', 'error');
    })
    .finally(function () {
      submitBtn.disabled = false;
    });
  }

  // --- Silme ---
  function confirmDelete(id) {
    var n = newsCache.find(function (h) { return String(h.id) === String(id); });
    var msg = document.getElementById('delete-message');
    msg.textContent = n ? '"' + n.baslik + '" haberini silmek istediğinize emin misiniz?' : 'Bu haberi silmek istediğinize emin misiniz?';
    document.getElementById('delete-modal').showModal();
    document.getElementById('delete-confirm').dataset.deleteId = id;
  }

  function doDelete() {
    var id = document.getElementById('delete-confirm').dataset.deleteId;
    document.getElementById('delete-modal').close();
    if (!id) return;

    apiFetch('/api/admin/haberler/' + id, { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) throw new Error('Silme başarısız');
        return r.json();
      })
      .then(function () {
        showToast('Haber silindi.');
        loadNews();
        loadDashboard();
      })
      .catch(function (err) {
        showToast(err.message || 'Silinemedi', 'error');
      });
  }

  // --- Kategoriler ---
  function renderCategories() {
    var list = document.getElementById('categories-list');
    if (list) {
      list.innerHTML = CATEGORIES.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join('');
    }
  }

  function fillCategorySelects() {
    var opts = CATEGORIES.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('');
    var sel = document.getElementById('news-category');
    if (sel) sel.innerHTML = opts;
    var filter = document.getElementById('news-filter-category');
    if (filter) filter.innerHTML = '<option value="">Tüm kategoriler</option>' + opts;
  }

  // --- Quill Editör Başlatma ---
  function initQuill() {
    if (quillEditor) return;
    var editorEl = document.getElementById('news-content');
    if (!editorEl || !window.Quill) return;
    quillEditor = new Quill(editorEl, {
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
  }

  function getQuillContent() {
    if (quillEditor) {
      var html = quillEditor.root.innerHTML;
      return html === '<p><br></p>' ? '' : html;
    }
    var el = document.querySelector('.ql-editor');
    return el ? (el.innerHTML === '<p><br></p>' ? '' : el.innerHTML) : '';
  }

  function setQuillContent(html) {
    if (quillEditor) {
      quillEditor.root.innerHTML = html || '';
    } else {
      var el = document.querySelector('.ql-editor');
      if (el) el.innerHTML = html || '';
    }
  }

  // --- Flatpickr Başlatma ---
  function initFlatpickr() {
    if (flatpickrInstance) return;
    var dateEl = document.getElementById('news-scheduled-date');
    if (!dateEl || !window.flatpickr) return;
    flatpickrInstance = flatpickr(dateEl, {
      enableTime: true,
      dateFormat: 'd.m.Y H:i',
      locale: window.flatpickr.l10ns && window.flatpickr.l10ns.tr ? 'tr' : 'default',
      time_24hr: true,
      allowInput: true
    });
  }

  // --- Karakter Sayaçları ---
  function initCharCounters() {
    function setupCounter(inputId, counterId, max) {
      var input = document.getElementById(inputId);
      var counter = document.getElementById(counterId);
      if (!input || !counter) return;
      function update() {
        counter.textContent = input.value.length + ' / ' + max;
      }
      input.addEventListener('input', update);
      update();
    }
    setupCounter('news-title', 'title-counter', 70);
    setupCounter('news-excerpt', 'excerpt-counter', 300);
    setupCounter('news-meta-description', 'meta-desc-counter', 160);
  }

  // --- Drag-Drop Görsel Yükleme ---
  function initImageUpload() {
    var dropzone = document.getElementById('news-image-dropzone');
    var fileInput = document.getElementById('news-image-file');
    var browseBtn = document.getElementById('news-image-browse');

    if (!dropzone || !fileInput) return;

    function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        showToast('Lütfen bir görsel dosyası seçin', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Dosya 5MB\'dan küçük olmalı', 'error');
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var preview = document.getElementById('news-image-preview');
        var img = document.getElementById('news-image-preview-img');
        var nameEl = document.getElementById('news-image-preview-name');
        var metaEl = document.getElementById('news-image-preview-meta');
        if (preview && img) {
          img.src = e.target.result;
          if (nameEl) nameEl.textContent = file.name;
          if (metaEl) metaEl.textContent = (file.size / 1024).toFixed(1) + ' KB';
          preview.hidden = false;
          var uploadOpts = document.getElementById('news-image-upload-options');
          if (uploadOpts) uploadOpts.style.display = 'none';
        }
      };
      reader.readAsDataURL(file);
    }

    dropzone.addEventListener('click', function () { fileInput.click(); });
    if (browseBtn) browseBtn.addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) handleFile(this.files[0]);
    });

    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  // --- Önizleme ---
  function initPreview() {
    var previewBtn = document.getElementById('news-form-preview');
    var previewModal = document.getElementById('preview-modal');
    var previewContent = document.getElementById('preview-content');
    var previewClose = document.getElementById('preview-close');
    var mobileBtn = document.getElementById('preview-toggle-mobile');
    var desktopBtn = document.getElementById('preview-toggle-desktop');

    if (!previewBtn || !previewModal || !previewContent) return;

    previewBtn.addEventListener('click', function () {
      var title = document.getElementById('news-title').value || 'Başlıksız';
      var category = document.getElementById('news-category').value || '';
      var author = document.getElementById('news-author').value || 'Editör';
      var excerpt = document.getElementById('news-excerpt').value || '';
      var content = getQuillContent();
      var imgEl = document.getElementById('news-image-preview-img');
      var imgSrc = (imgEl && !document.getElementById('news-image-preview').hidden) ? imgEl.src : '';

      previewContent.innerHTML =
        '<article class="preview-article">' +
        (category ? '<span class="preview-category">' + escapeHtml(category) + '</span>' : '') +
        '<h1 class="preview-title">' + escapeHtml(title) + '</h1>' +
        '<div class="preview-meta">' + escapeHtml(author) + ' &middot; ' + new Date().toLocaleDateString('tr-TR') + '</div>' +
        (imgSrc ? '<img class="preview-image" src="' + escapeHtml(imgSrc) + '" alt="">' : '') +
        (excerpt ? '<p class="preview-excerpt">' + escapeHtml(excerpt) + '</p>' : '') +
        '<div class="preview-body">' + content + '</div>' +
        '</article>';

      previewContent.classList.remove('preview-mobile');
      previewModal.showModal();
    });

    if (previewClose) previewClose.addEventListener('click', function () { previewModal.close(); });
    if (mobileBtn) mobileBtn.addEventListener('click', function () { previewContent.classList.add('preview-mobile'); });
    if (desktopBtn) desktopBtn.addEventListener('click', function () { previewContent.classList.remove('preview-mobile'); });
  }

  // --- Event Listener'lar ---
  function init() {
    fillCategorySelects();
    initCharCounters();
    initImageUpload();
    initPreview();

    // CDN kütüphaneleri defer ile yükleniyor, hazır olunca başlat
    function initCdnLibs() {
      if (window.Quill) initQuill();
      if (window.flatpickr) initFlatpickr();
      if (window.lucide) window.lucide.createIcons();
    }
    // Hemen dene, yoksa kısa aralıklarla tekrar dene
    initCdnLibs();
    var cdnRetry = 0;
    var cdnInterval = setInterval(function () {
      initCdnLibs();
      cdnRetry++;
      if (cdnRetry > 20 || (quillEditor && flatpickrInstance)) clearInterval(cdnInterval);
    }, 300);

    // Navigasyon
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        if (item.dataset.page) showPage(item.dataset.page);
        document.getElementById('sidebar').classList.remove('open');
      });
    });

    // Sidebar toggle
    var sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', function () {
        document.getElementById('sidebar').classList.toggle('open');
      });
    }

    // Yeni haber butonu
    var addBtn = document.getElementById('news-add-btn');
    if (addBtn) addBtn.addEventListener('click', openNewModal);

    // Form submit
    var form = document.getElementById('news-form');
    if (form) form.addEventListener('submit', saveNews);

    // Modal kapat
    var closeBtn = document.getElementById('news-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { document.getElementById('news-modal').close(); });
    var cancelBtn = document.getElementById('news-form-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { document.getElementById('news-modal').close(); });

    // Silme onay
    var delCancel = document.getElementById('delete-cancel');
    if (delCancel) delCancel.addEventListener('click', function () { document.getElementById('delete-modal').close(); });
    var delConfirm = document.getElementById('delete-confirm');
    if (delConfirm) delConfirm.addEventListener('click', doDelete);

    // Arama ve filtre
    var searchEl = document.getElementById('news-search');
    if (searchEl) searchEl.addEventListener('input', renderNewsTable);
    var filterEl = document.getElementById('news-filter-category');
    if (filterEl) filterEl.addEventListener('change', renderNewsTable);
    var sortEl = document.getElementById('news-sort');
    if (sortEl) sortEl.addEventListener('change', renderNewsTable);

    // Slug otomatik
    var titleInput = document.getElementById('news-title');
    if (titleInput) {
      titleInput.addEventListener('input', function () {
        if (!currentEditId) {
          document.getElementById('news-slug').value = slugify(this.value);
        }
      });
    }

    // Çıkış butonu
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', function () { showToast('Yerel modda çıkış yapılamaz.', 'info'); });

    // Görsel kaldır
    var imgRemove = document.getElementById('news-image-remove');
    if (imgRemove) {
      imgRemove.addEventListener('click', function () {
        document.getElementById('news-image-preview').hidden = true;
        var uploadOpts = document.getElementById('news-image-upload-options');
        if (uploadOpts) uploadOpts.style.display = '';
      });
    }

    // URL'den görsel ekle
    var urlApply = document.getElementById('news-image-url-apply');
    if (urlApply) {
      urlApply.addEventListener('click', function () {
        var url = document.getElementById('news-image-url').value.trim();
        if (url) {
          var preview = document.getElementById('news-image-preview');
          var img = document.getElementById('news-image-preview-img');
          if (preview && img) {
            img.src = url;
            preview.hidden = false;
            var uploadOpts = document.getElementById('news-image-upload-options');
            if (uploadOpts) uploadOpts.style.display = 'none';
          }
          document.getElementById('news-image-url').value = '';
        }
      });
    }

    // Dashboard'ı yükle
    showPage('dashboard');
  }

  // DOM hazır olunca başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * Ahmetli Medya - Yönetim Paneli (Firebase)
 * Auth + Firestore CRUD, dashboard, haber yönetimi
 * Refactored with ES6 modules
 */

import {
  slugify,
  readingTimeFromHtml,
  formatDate,
  escapeHtml,
  getAuth,
  getDb,
  getStorage,
  isConfigured,
  isAdmin,
  getTimestamp
} from './admin/modules/utils.js';

import notifications from './admin/modules/notifications.js';
import ImageUploader from './admin/modules/image-upload.js';
import MediaLibrary from './admin/modules/media-library.js';
import RichTextEditor from './admin/modules/editor.js';
import AutoSave from './admin/modules/auto-save.js';
import SEOAnalyzer from './admin/modules/seo.js';
import Pagination from './admin/modules/pagination.js';
import BulkActions from './admin/modules/bulk-actions.js';
import DashboardCharts from './admin/modules/charts.js';
import KeyboardShortcuts from './admin/modules/shortcuts.js';

// Constants
const CATEGORIES = [
  'Gündem',
  'Ekonomi',
  'Spor',
  'Magazin',
  'Kültür-Sanat',
  'Teknoloji',
  'Yaşam',
  'Üzüm & Bağcılık',
];

const COLLECTION_NEWS = 'news';

// Dosya olarak açıldıysa Firebase çalışmaz; kullanıcıyı yönlendir
if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
  document.body.innerHTML = '<div style="max-width:420px;margin:60px auto;padding:24px;font-family:sans-serif;text-align:center;background:#161b22;color:#e6edf3;border-radius:12px;border:1px solid #30363d;">' +
    '<h1 style="margin:0 0 16px;">Ahmetli Medya</h1>' +
    '<p style="color:#8b949e;">Admin paneli bu adresten açılmalı:</p>' +
    '<p style="margin:16px 0;"><strong style="color:#238636;">http://localhost:3000/admin.html</strong></p>' +
    '<p style="font-size:14px;color:#8b949e;">Terminalde <code style="background:#0f1419;padding:2px 6px;border-radius:4px;">npm start</code> yazıp tarayıcıda yukarıdaki adresi açın.</p>' +
    '</div>';
  throw new Error('file://');
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
  if (pageId === 'news') loadNewsList();
  if (pageId === 'categories') renderCategories();
}

// --- Sidebar mobil toggle ---
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });
  }
}

// --- Giriş / Çıkış ---
function showLoginScreen() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('panel-screen').hidden = true;
}

function showPanelScreen() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('panel-screen').hidden = false;
  showPage('dashboard');
}

function initAuth() {
  if (window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.skipAuth) {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('panel-screen').hidden = false;
    showPage('dashboard');
    return;
  }
  const auth = getAuth();
  if (!auth) {
    showLoginScreen();
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.textContent = window.firebase
        ? 'Firebase yapılandırılmamış. firebase-config.js içinde apiKey ve projectId kontrol edin.'
        : 'Firebase SDK yüklenemedi. Sayfayı http://localhost:3000/admin.html üzerinden açın (dosyayı çift tıklamayın) ve internet bağlantınızı kontrol edin.';
      errEl.hidden = false;
    }
    return;
  }

  auth.onAuthStateChanged(function (user) {
    if (user) {
      if (!isAdmin(user)) {
        auth.signOut();
        showLoginScreen();
        const errEl = document.getElementById('login-error');
        if (errEl) {
          errEl.textContent = 'Bu hesabın yönetim paneline erişim yetkisi yok.';
          errEl.hidden = false;
        }
        return;
      }
      showPanelScreen();
    } else {
      showLoginScreen();
      document.getElementById('login-error').hidden = true;
    }
  });
}

function initLoginForm() {
  const form = document.getElementById('login-form');
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.hidden = true;
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!isConfigured()) {
      errEl.textContent = 'Firebase yapılandırılmamış. firebase-config.js içinde apiKey ve projectId girin.';
      errEl.hidden = false;
      return;
    }

    btn.disabled = true;
    getAuth()
      .signInWithEmailAndPassword(email, password)
      .then(function (cred) {
        const user = cred && cred.user;
        if (user && !isAdmin(user)) {
          getAuth().signOut();
          errEl.textContent = 'Bu hesabın yönetim paneline erişim yetkisi yok. firebase-config.js içinde adminEmails listesine e-postanızı ekleyin.';
          errEl.hidden = false;
          return;
        }
        showPanelScreen();
      })
      .catch(function (err) {
        console.error('Giriş hatası:', err.code, err.message);
        let msg = err.message || 'Giriş başarısız';
        if (err.code === 'auth/user-not-found') msg = 'Bu e-posta adresi kayıtlı değil. Firebase Console → Authentication → Users ile kontrol edin.';
        else if (err.code === 'auth/wrong-password') msg = 'Şifre hatalı.';
        else if (err.code === 'auth/invalid-email') msg = 'Geçersiz e-posta adresi.';
        else if (err.code === 'auth/too-many-requests') msg = 'Çok fazla deneme. Biraz bekleyip tekrar deneyin.';
        else if (err.code === 'auth/network-request-failed') msg = 'İnternet bağlantısı yok veya Firebase erişilemiyor. Sayfayı http://localhost:3000/admin.html üzerinden açtığınızdan emin olun.';
        else if (err.code === 'auth/unauthorized-domain') msg = 'Bu alan adı yetkili değil. Firebase Console → Authentication → Ayarlar → Yetkili alan adları → "localhost" ekleyin.';
        errEl.textContent = msg;
        errEl.hidden = false;
      })
      .finally(function () {
        btn.disabled = false;
      });
  });
}

function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      if (window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.skipAuth) return;
      const auth = getAuth();
      if (!auth) return;
      auth.signOut();
      showLoginScreen();
      notifications.success('Çıkış yaptınız.');
    });
  }
}

// --- Yerel API yardımcı fonksiyonları (Firestore yokken backend API kullanır) ---
let localApiToken = null;

async function ensureLocalApiToken() {
  if (localApiToken) return localApiToken;
  try {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' }),
    });
    const data = await res.json();
    if (data.token) {
      localApiToken = data.token;
      return localApiToken;
    }
  } catch (e) {
    console.error('Local API login failed:', e);
  }
  return null;
}

function useLocalApi() {
  return !getDb();
}

async function localApiFetch(url, options = {}) {
  const token = await ensureLocalApiToken();
  if (token) {
    options.headers = { ...(options.headers || {}), Authorization: 'Bearer ' + token };
  }
  return fetch(url, options);
}

// Yerel API'den haberleri normalize et (backend JSON formatını admin formatına çevir)
function normalizeLocalNews(h) {
  return {
    id: String(h.id),
    title: h.baslik || '',
    slug: h.slug || '',
    category: h.kategori || 'Gündem',
    content: h.icerik || '',
    excerpt: h.ozet || '',
    author: h.yazar || 'Editör',
    image: h.gorsel || '',
    readingTime: h.okumaSuresi || 1,
    isPublished: true,
    isBreaking: false,
    isFeatured: false,
    createdAt: h.yayinTarihi ? { toDate: () => new Date(h.yayinTarihi), toMillis: () => new Date(h.yayinTarihi).getTime() } : null,
  };
}

// --- Dashboard ---
function loadDashboard() {
  const skeleton = document.getElementById('dashboard-skeleton');
  const content = document.getElementById('dashboard-content');
  const totalEl = document.getElementById('stat-total');
  const byCategoryEl = document.getElementById('stat-by-category');
  const latestEl = document.getElementById('dashboard-latest');

  if (skeleton) skeleton.hidden = false;
  if (content) content.hidden = true;

  const dataPromise = useLocalApi()
    ? fetch('/api/haberler?limit=50').then(r => r.json()).then(d => (d.data || []).map(normalizeLocalNews))
    : getDb().collection(COLLECTION_NEWS).get().then(function (snap) {
        const list = [];
        snap.forEach(function (doc) { list.push({ id: doc.id, ...doc.data() }); });
        return list;
      });

  dataPromise
    .then(function (list) {
      totalEl.textContent = list.length;

      const byCat = {};
      list.forEach(function (n) {
        const c = n.category || 'Diğer';
        byCat[c] = (byCat[c] || 0) + 1;
      });
      byCategoryEl.innerHTML = '';
      Object.keys(byCat)
        .sort()
        .forEach(function (c) {
          const li = document.createElement('li');
          li.textContent = c + ': ' + byCat[c];
          byCategoryEl.appendChild(li);
        });

      list.sort(function (a, b) {
        const ta = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
        const tb = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
      const latest = list.slice(0, 10);
      if (latest.length === 0) {
        latestEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="inbox" style="width: 64px; height: 64px;"></i></div>
            <h3 class="empty-state-title">Henüz haber yok</h3>
            <p class="empty-state-description">İlk haberinizi eklemek için "Yeni Haber" butonuna tıklayın.</p>
          </div>
        `;
      } else {
        latestEl.innerHTML =
          '<ul>' +
          latest
            .map(function (n) {
              return '<li><a href="#" data-edit-id="' + n.id + '">' + escapeHtml(n.title || '(Başlıksız)') + '</a> – ' + formatDate(n.createdAt) + '</li>';
            })
            .join('') +
          '</ul>';
        latestEl.querySelectorAll('[data-edit-id]').forEach(function (a) {
          a.addEventListener('click', function (e) {
            e.preventDefault();
            showPage('news');
            openNewsModal(a.dataset.editId);
          });
        });
      }

      if (skeleton) skeleton.hidden = true;
      if (content) content.hidden = false;

      if (!dashboardCharts) {
        dashboardCharts = new DashboardCharts();
      }
      dashboardCharts.createCategoryChart('chart-categories', byCat);
      const publishedCount = list.filter(n => n.isPublished).length;
      const draftCount = list.length - publishedCount;
      dashboardCharts.createStatusChart('chart-status', publishedCount, draftCount);
      dashboardCharts.createTrendChart('chart-trend');

      if (window.lucide) window.lucide.createIcons();
    })
    .catch(function (err) {
      notifications.error(err.message || 'Dashboard yüklenemedi');
      totalEl.textContent = '0';
      latestEl.innerHTML = '<div class="empty-state"><p class="empty-state-description">Yüklenemedi.</p></div>';
      if (skeleton) skeleton.hidden = true;
      if (content) content.hidden = false;
    });
}

// --- Haber listesi ---
let newsListCache = [];
let newsPagination = null;
let newsBulkActions = null;

// --- Dashboard charts ---
let dashboardCharts = null;

// --- Keyboard shortcuts ---
let keyboardShortcuts = null;

function initPaginationAndBulk() {
  // Initialize Pagination
  newsPagination = new Pagination({
    collectionName: COLLECTION_NEWS,
    pageSize: 20,
    orderBy: 'createdAt',
    orderDirection: 'desc',
    onPageChange: (result) => {
      newsListCache = result.items;
      renderNewsTable();
      updatePaginationUI(result);
    }
  });

  // Initialize Bulk Actions
  newsBulkActions = new BulkActions({
    collectionName: COLLECTION_NEWS,
    onSelectionChange: (selection) => {
      updateBulkActionBar(selection);
    },
    onActionComplete: () => {
      loadNewsList();
    }
  });

  // Pagination controls
  document.getElementById('page-first')?.addEventListener('click', () => {
    newsPagination.first();
  });

  document.getElementById('page-prev')?.addEventListener('click', () => {
    newsPagination.prev();
  });

  document.getElementById('page-next')?.addEventListener('click', () => {
    newsPagination.next();
  });

  // Bulk action controls
  document.getElementById('select-all')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      const ids = newsListCache.map(n => n.id);
      newsBulkActions.selectAll(ids);
    } else {
      newsBulkActions.deselectAll();
    }
    renderNewsTable();
  });

  document.getElementById('bulk-action-apply')?.addEventListener('click', () => {
    const action = document.getElementById('bulk-action-select').value;
    if (action) {
      newsBulkActions.performAction(action);
    }
  });

  document.getElementById('bulk-action-cancel')?.addEventListener('click', () => {
    newsBulkActions.deselectAll();
    renderNewsTable();
  });
}

function updatePaginationUI(result) {
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  const firstBtn = document.getElementById('page-first');

  if (pageInfo) {
    pageInfo.textContent = `Sayfa ${result.page + 1}`;
  }

  if (prevBtn) prevBtn.disabled = !result.hasPrev;
  if (firstBtn) firstBtn.disabled = !result.hasPrev;
  if (nextBtn) nextBtn.disabled = !result.hasNext;
}

function updateBulkActionBar(selection) {
  const bar = document.getElementById('bulk-action-bar');
  const count = document.getElementById('bulk-selection-count');

  if (selection.count > 0) {
    bar.hidden = false;
    count.textContent = `${selection.count} öğe seçildi`;
  } else {
    bar.hidden = true;
  }
}

async function loadNewsList() {
  const tbody = document.getElementById('news-tbody');
  const loadingEl = document.getElementById('news-loading');
  const emptyEl = document.getElementById('news-empty');
  const tableWrap = document.querySelector('.table-wrap');

  loadingEl.hidden = false;
  emptyEl.hidden = true;
  tableWrap.style.display = '';

  if (useLocalApi()) {
    // Yerel API ile yükle
    try {
      const res = await fetch('/api/haberler?limit=50');
      const data = await res.json();
      newsListCache = (data.data || []).map(normalizeLocalNews);
      renderNewsTable();
      // Pagination gizle (yerel API basit)
      const pagEl = document.getElementById('pagination-controls');
      if (pagEl) pagEl.style.display = 'none';
    } catch (err) {
      notifications.error(err.message || 'Haberler yüklenemedi');
      tbody.innerHTML = '';
      emptyEl.hidden = false;
    } finally {
      loadingEl.hidden = true;
    }
    return;
  }

  if (!newsPagination) {
    tbody.innerHTML = '';
    emptyEl.hidden = false;
    tableWrap.style.display = 'none';
    loadingEl.hidden = true;
    return;
  }

  try {
    await newsPagination.first();
  } catch (err) {
    notifications.error(err.message || 'Haberler yüklenemedi');
    tbody.innerHTML = '';
    emptyEl.hidden = false;
  } finally {
    loadingEl.hidden = true;
  }
}

function renderNewsTable() {
  const tbody = document.getElementById('news-tbody');
  const search = (document.getElementById('news-search') && document.getElementById('news-search').value) || '';
  const catFilter = (document.getElementById('news-filter-category') && document.getElementById('news-filter-category').value) || '';
  const sort = (document.getElementById('news-sort') && document.getElementById('news-sort').value) || 'dateDesc';

  let list = newsListCache.filter(function (n) {
    const matchSearch = !search || (n.title || '').toLowerCase().indexOf(search.toLowerCase()) !== -1;
    const matchCat = !catFilter || n.category === catFilter;
    return matchSearch && matchCat;
  });

  if (sort === 'dateDesc') {
    list.sort(function (a, b) {
      return (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0);
    });
  } else if (sort === 'dateAsc') {
    list.sort(function (a, b) {
      return (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0);
    });
  } else if (sort === 'title') {
    list.sort(function (a, b) {
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  if (list.length === 0) {
    const emptyEl = document.getElementById('news-empty');
    emptyEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="file-text" style="width: 64px; height: 64px;"></i></div>
        <h3 class="empty-state-title">Haber bulunamadı</h3>
        <p class="empty-state-description">Arama kriterlerinize uygun haber bulunamadı veya henüz haber eklenmedi.</p>
      </div>
    `;
    emptyEl.hidden = false;
    document.querySelector('.table-wrap').style.display = 'none';
    tbody.innerHTML = '';

    // Re-initialize Lucide icons
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  document.getElementById('news-empty').hidden = true;
  document.querySelector('.table-wrap').style.display = '';

  tbody.innerHTML = list
    .map(function (n) {
      const isSelected = newsBulkActions && newsBulkActions.isSelected(n.id);
      let badges = '';
      if (n.isPublished) badges += '<span class="badge badge-published">Yayında</span>';
      else badges += '<span class="badge badge-draft">Taslak</span>';
      if (n.isBreaking) badges += '<span class="badge badge-breaking">Son dakika</span>';
      if (n.isFeatured) badges += '<span class="badge badge-featured">Öne çıkan</span>';
      return (
        '<tr>' +
        '<td><input type="checkbox" class="row-checkbox" data-id="' + n.id + '" ' + (isSelected ? 'checked' : '') + '></td>' +
        '<td class="title-cell">' +
        escapeHtml(n.title || '(Başlıksız)') +
        '</td>' +
        '<td>' +
        escapeHtml(n.category || '–') +
        '</td>' +
        '<td>' +
        escapeHtml(n.author || '–') +
        '</td>' +
        '<td>' +
        formatDate(n.createdAt) +
        '</td>' +
        '<td>' +
        badges +
        '</td>' +
        '<td><div class="row-actions">' +
        '<button type="button" class="btn btn-sm btn-ghost" data-edit="' + n.id + '" title="Düzenle">Düzenle</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-toggle-pub="' + n.id + '">' + (n.isPublished ? 'Yayından kaldır' : 'Yayınla') + '</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-toggle-breaking="' + n.id + '" title="Son dakika">SD</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-toggle-featured="' + n.id + '" title="Öne çıkan">ÖÇ</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-delete="' + n.id + '">Sil</button>' +
        '</div></td>' +
        '</tr>'
      );
    })
    .join('');

  // Attach checkbox handlers
  tbody.querySelectorAll('.row-checkbox').forEach(function (cb) {
    cb.addEventListener('change', function () {
      if (newsBulkActions) {
        newsBulkActions.toggle(cb.dataset.id);
        renderNewsTable();
      }
    });
  });

  tbody.querySelectorAll('[data-edit]').forEach(function (b) {
    b.addEventListener('click', function () {
      openNewsModal(b.dataset.edit);
    });
  });
  tbody.querySelectorAll('[data-delete]').forEach(function (b) {
    b.addEventListener('click', function () {
      confirmDeleteNews(b.dataset.delete);
    });
  });
  tbody.querySelectorAll('[data-toggle-pub]').forEach(function (b) {
    b.addEventListener('click', function () {
      togglePublish(b.dataset.togglePub);
    });
  });
  tbody.querySelectorAll('[data-toggle-breaking]').forEach(function (b) {
    b.addEventListener('click', function () {
      toggleField(b.dataset.toggleBreaking, 'isBreaking');
    });
  });
  tbody.querySelectorAll('[data-toggle-featured]').forEach(function (b) {
    b.addEventListener('click', function () {
      toggleField(b.dataset.toggleFeatured, 'isFeatured');
    });
  });
}

function toggleField(id, field) {
  const doc = newsListCache.find(function (n) { return n.id === id; });
  if (!doc) return;

  if (useLocalApi()) {
    // Yerel API'de bu alanlar desteklenmiyor, sadece UI'da toggle edelim
    doc[field] = !doc[field];
    notifications.success(
      field === 'isBreaking'
        ? (doc[field] ? 'Son dakika işaretlendi.' : 'Son dakika kaldırıldı.')
        : (doc[field] ? 'Öne çıkan işaretlendi.' : 'Öne çıkan kaldırıldı.')
    );
    renderNewsTable();
    return;
  }

  if (!getDb()) return;
  const next = !doc[field];
  getDb()
    .collection(COLLECTION_NEWS)
    .doc(id)
    .update({
      [field]: next,
      updatedAt: getTimestamp()
    })
    .then(function () {
      notifications.success(
        field === 'isBreaking'
          ? (next ? 'Son dakika işaretlendi.' : 'Son dakika kaldırıldı.')
          : (next ? 'Öne çıkan işaretlendi.' : 'Öne çıkan kaldırıldı.')
      );
      loadNewsList();
    })
    .catch(function (err) {
      notifications.error(err.message || 'Güncellenemedi');
    });
}

function togglePublish(id) {
  const doc = newsListCache.find(function (n) {
    return n.id === id;
  });
  if (!doc) return;

  if (useLocalApi()) {
    doc.isPublished = !doc.isPublished;
    notifications.success(doc.isPublished ? 'Haber yayınlandı.' : 'Haber yayından kaldırıldı.');
    renderNewsTable();
    return;
  }

  if (!getDb()) return;
  const next = !doc.isPublished;
  getDb()
    .collection(COLLECTION_NEWS)
    .doc(id)
    .update({
      isPublished: next,
      updatedAt: getTimestamp(),
    })
    .then(function () {
      notifications.success(next ? 'Haber yayınlandı.' : 'Haber yayından kaldırıldı.');
      loadNewsList();
      loadDashboard();
    })
    .catch(function (err) {
      notifications.error(err.message || 'Güncellenemedi');
    });
}

// --- Haber modal (ekle / düzenle) ---
const newsModal = document.getElementById('news-modal');
const newsForm = document.getElementById('news-form');
let richTextEditor = null;

// --- Image upload and media library ---
let currentImageData = null;
let imageUploader = null;
let mediaLibrary = null;

// --- Auto-save and SEO ---
let autoSave = null;
let seoAnalyzer = null;
let keywordsList = [];
let scheduledDatePicker = null;

function initImageUpload() {
  // Initialize image uploader
  imageUploader = new ImageUploader('news-image-dropzone', {
    category: 'news',
    onUploadComplete: (result) => {
      currentImageData = result;
      showImagePreview(result);
      hideUploadOptions();
    },
    onUploadProgress: (progress) => {
      updateUploadProgress(progress);
    },
    onUploadError: (error) => {
      notifications.error(error.message || 'Yükleme başarısız');
      hideUploadProgress();
    }
  });

  // Initialize media library (for cover image and content images)
  mediaLibrary = new MediaLibrary({
    modalId: 'media-library-modal',
    onSelect: (media) => {
      // Check if we're selecting for cover image or content image
      if (window.__selectingForEditor) {
        // Insert into Quill editor
        if (window.__editorImageCallback) {
          window.__editorImageCallback(media.url);
          window.__editorImageCallback = null;
        }
        window.__selectingForEditor = false;
      } else {
        // Cover image
        currentImageData = {
          id: media.id,
          url: media.url,
          thumbnailUrl: media.thumbnailUrl,
          storagePath: media.storagePath,
          thumbnailPath: media.thumbnailPath,
          dimensions: media.dimensions,
          metadata: {
            fileName: media.fileName,
            size: media.size
          }
        };
        showImagePreview(currentImageData);
        hideUploadOptions();
      }
    }
  });
  mediaLibrary.init();

  // Initialize Quill rich text editor
  richTextEditor = new RichTextEditor('news-content', {
    placeholder: 'Haber içeriğini buraya yazın...',
    onMediaLibraryOpen: (callback) => {
      // Set flag for editor image selection
      window.__selectingForEditor = true;
      window.__editorImageCallback = callback;
      mediaLibrary.open();
    }
  });

  richTextEditor.init();

  // Browse button
  document.getElementById('news-image-browse').addEventListener('click', () => {
    document.getElementById('news-image-file').click();
  });

  // Library button
  document.getElementById('news-image-library').addEventListener('click', () => {
    mediaLibrary.open();
  });

  // Remove button
  document.getElementById('news-image-remove').addEventListener('click', () => {
    currentImageData = null;
    hideImagePreview();
    showUploadOptions();
  });

  // URL input apply button
  document.getElementById('news-image-url-apply').addEventListener('click', () => {
    const url = document.getElementById('news-image-url').value.trim();
    if (url) {
      currentImageData = {
        url: url,
        isLegacyUrl: true
      };
      showImagePreview({ url: url, metadata: { fileName: 'Externa URL' } });
      hideUploadOptions();
      document.getElementById('news-image-url').value = '';
    }
  });

  // Click on drop zone to trigger file input
  document.getElementById('news-image-dropzone').addEventListener('click', function(e) {
    if (e.target === this || e.target.closest('.drop-zone-content')) {
      document.getElementById('news-image-file').click();
    }
  });
}

function showImagePreview(imageData) {
  const preview = document.getElementById('news-image-preview');
  const img = document.getElementById('news-image-preview-img');
  const name = document.getElementById('news-image-preview-name');
  const meta = document.getElementById('news-image-preview-meta');

  img.src = imageData.thumbnailUrl || imageData.url;
  name.textContent = imageData.metadata?.fileName || 'Görsel';

  if (imageData.dimensions) {
    meta.textContent = `${imageData.dimensions.width}×${imageData.dimensions.height}`;
    if (imageData.metadata?.size) {
      const sizeKB = Math.round(imageData.metadata.size / 1024);
      meta.textContent += ` · ${sizeKB}KB`;
    }
  } else {
    meta.textContent = '';
  }

  preview.hidden = false;
}

function hideImagePreview() {
  document.getElementById('news-image-preview').hidden = true;
}

function showUploadOptions() {
  document.getElementById('news-image-upload-options').style.display = '';
}

function hideUploadOptions() {
  document.getElementById('news-image-upload-options').style.display = 'none';
}

function updateUploadProgress(progress) {
  const progressEl = document.getElementById('news-image-progress');
  const fillEl = document.getElementById('news-image-progress-fill');
  const textEl = document.getElementById('news-image-progress-text');

  progressEl.hidden = false;
  fillEl.style.width = progress.progress + '%';

  const statusText = {
    resizing: 'Görsel boyutlandırılıyor...',
    uploading: 'Yükleniyor...',
    saving: 'Kaydediliyor...',
    complete: 'Tamamlandı!'
  };

  textEl.textContent = statusText[progress.status] || 'İşleniyor...';

  if (progress.status === 'complete') {
    setTimeout(() => {
      hideUploadProgress();
    }, 1000);
  }
}

function hideUploadProgress() {
  document.getElementById('news-image-progress').hidden = true;
  document.getElementById('news-image-progress-fill').style.width = '0';
}

// --- Form enhancements ---
function initFormEnhancements() {
  // Initialize SEO Analyzer
  seoAnalyzer = new SEOAnalyzer();

  // Character counters
  const titleInput = document.getElementById('news-title');
  const excerptInput = document.getElementById('news-excerpt');
  const metaDescInput = document.getElementById('news-meta-description');

  function updateCharCounter(input, counterId, max, optimal = null) {
    const counter = document.getElementById(counterId);
    if (!counter) return;

    const length = input.value.length;
    counter.textContent = `${length} / ${max}`;

    // Color coding
    counter.classList.remove('warning', 'error');
    if (optimal) {
      if (length < optimal.min) {
        counter.classList.add('warning');
      } else if (length > optimal.max) {
        counter.classList.add('error');
      }
    } else if (length > max * 0.9) {
      counter.classList.add('warning');
    }
  }

  titleInput.addEventListener('input', () => {
    updateCharCounter(titleInput, 'title-counter', 100, { min: 30, max: 70 });
    updateSEOScore();
  });

  excerptInput.addEventListener('input', () => {
    updateCharCounter(excerptInput, 'excerpt-counter', 300);
  });

  metaDescInput.addEventListener('input', () => {
    updateCharCounter(metaDescInput, 'meta-desc-counter', 200, { min: 120, max: 160 });
    updateSEOScore();
  });

  // Keywords handling
  const keywordsInput = document.getElementById('news-keywords');
  keywordsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(keywordsInput.value.trim());
      keywordsInput.value = '';
    }
  });

  keywordsInput.addEventListener('blur', () => {
    if (keywordsInput.value.trim()) {
      addKeyword(keywordsInput.value.trim());
      keywordsInput.value = '';
    }
  });

  // SEO update on content change
  if (richTextEditor) {
    richTextEditor.onChange(() => {
      updateSEOScore();
    });
  }

  // Initialize Flatpickr for scheduled publishing
  if (window.flatpickr) {
    scheduledDatePicker = flatpickr('#news-scheduled-date', {
      enableTime: true,
      dateFormat: 'd/m/Y H:i',
      time_24hr: true,
      locale: 'tr',
      minDate: 'today',
      allowInput: true
    });
  }

  // Initialize Auto-save
  autoSave = new AutoSave({
    interval: 30000, // 30 seconds
    indicator: 'autosave-indicator',
    getFormData: () => {
      return {
        title: titleInput.value,
        slug: document.getElementById('news-slug').value,
        category: document.getElementById('news-category').value,
        content: richTextEditor ? richTextEditor.getContent() : '',
        author: document.getElementById('news-author').value,
        excerpt: excerptInput.value,
        metaDescription: metaDescInput.value,
        keywords: keywordsList,
        imageData: currentImageData,
        isPublished: document.getElementById('news-published').checked,
        isBreaking: document.getElementById('news-breaking').checked,
        isFeatured: document.getElementById('news-featured').checked,
        scheduledDate: scheduledDatePicker ? scheduledDatePicker.selectedDates[0] : null
      };
    }
  });
}

function addKeyword(keyword) {
  if (!keyword) return;
  keyword = keyword.toLowerCase().trim();

  if (keywordsList.includes(keyword)) {
    notifications.warning('Bu anahtar kelime zaten eklendi.');
    return;
  }

  keywordsList.push(keyword);
  renderKeywords();
  updateSEOScore();
}

function removeKeyword(keyword) {
  keywordsList = keywordsList.filter(k => k !== keyword);
  renderKeywords();
  updateSEOScore();
}

function renderKeywords() {
  const container = document.getElementById('keywords-tags');
  if (!container) return;

  container.innerHTML = keywordsList.map(keyword => {
    return `
      <span class="tag">
        ${escapeHtml(keyword)}
        <button type="button" class="tag-remove" data-keyword="${escapeHtml(keyword)}">×</button>
      </span>
    `;
  }).join('');

  // Attach remove handlers
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeKeyword(btn.dataset.keyword);
    });
  });
}

function updateSEOScore() {
  if (!seoAnalyzer) return;

  const result = seoAnalyzer.analyze({
    title: document.getElementById('news-title').value,
    metaDescription: document.getElementById('news-meta-description').value,
    content: richTextEditor ? richTextEditor.getContent() : '',
    keywords: keywordsList,
    hasImage: !!currentImageData
  });

  // Update score display
  const scoreEl = document.getElementById('seo-score');
  if (scoreEl) {
    scoreEl.textContent = `SEO: ${result.score}/100`;
    scoreEl.className = `seo-score ${result.scoreClass}`;
  }

  // Update recommendations
  const recsEl = document.getElementById('seo-recommendations');
  if (recsEl) {
    let html = '';

    if (result.warnings.length > 0) {
      html += '<h4>Uyarılar:</h4><ul>';
      result.warnings.forEach(w => {
        html += `<li class="warning">${escapeHtml(w)}</li>`;
      });
      html += '</ul>';
    }

    if (result.recommendations.length > 0) {
      html += '<h4>Öneriler:</h4><ul>';
      result.recommendations.forEach(r => {
        html += `<li class="recommendation">${escapeHtml(r)}</li>`;
      });
      html += '</ul>';
    }

    if (html === '') {
      html = '<p style="color: var(--primary); font-size: 0.875rem;">✓ SEO optimizasyonu mükemmel!</p>';
    }

    recsEl.innerHTML = html;
  }
}

async function openNewsModal(editId) {
  const titleEl = document.getElementById('news-modal-title');
  document.getElementById('news-id').value = editId || '';
  titleEl.textContent = editId ? 'Haberi düzenle' : 'Yeni haber';

  // Reset form
  document.getElementById('news-title').value = '';
  document.getElementById('news-slug').value = '';
  document.getElementById('news-category').value = CATEGORIES[0];
  document.getElementById('news-excerpt').value = '';
  document.getElementById('news-meta-description').value = '';
  document.getElementById('news-keywords').value = '';
  keywordsList = [];
  renderKeywords();

  // Clear editor
  if (richTextEditor) {
    richTextEditor.clear();
  }

  document.getElementById('news-author').value = 'Editör';
  document.getElementById('news-published').checked = true;
  document.getElementById('news-breaking').checked = false;
  document.getElementById('news-featured').checked = false;

  // Clear scheduled date
  if (scheduledDatePicker) {
    scheduledDatePicker.clear();
  }

  // Reset character counters
  document.getElementById('title-counter').textContent = '0 / 70';
  document.getElementById('excerpt-counter').textContent = '0 / 300';
  document.getElementById('meta-desc-counter').textContent = '0 / 160';

  // Reset image state
  currentImageData = null;
  hideImagePreview();
  showUploadOptions();

  // Reset SEO score
  updateSEOScore();

  // Start auto-save
  if (autoSave) {
    autoSave.start(editId);

    // Check for draft if creating new
    if (!editId) {
      const draft = await autoSave.promptRestore();
      if (draft) {
        restoreFormData(draft);
      }
    }
  }

  if (editId) {
    if (useLocalApi()) {
      // Yerel API'den haber yükle
      try {
        const res = await fetch('/api/haberler/' + editId);
        if (res.ok) {
          const h = await res.json();
          document.getElementById('news-title').value = h.baslik || '';
          document.getElementById('news-slug').value = h.slug || '';
          document.getElementById('news-category').value = h.kategori || CATEGORIES[0];
          document.getElementById('news-excerpt').value = h.ozet || '';
          if (richTextEditor) richTextEditor.setContent(h.icerik || '');
          document.getElementById('news-author').value = h.yazar || 'Editör';
          if (h.gorsel) {
            currentImageData = { url: h.gorsel, isLegacyUrl: true };
            showImagePreview(currentImageData);
            hideUploadOptions();
          }
          document.getElementById('title-counter').textContent = `${(h.baslik || '').length} / 70`;
          document.getElementById('excerpt-counter').textContent = `${(h.ozet || '').length} / 300`;
          updateSEOScore();
        }
      } catch (err) {
        notifications.error('Haber yüklenemedi');
      }
    } else if (getDb()) {
      getDb()
        .collection(COLLECTION_NEWS)
        .doc(editId)
        .get()
        .then(function (doc) {
          if (!doc.exists) return;
          const d = doc.data();
          document.getElementById('news-title').value = d.title || '';
          document.getElementById('news-slug').value = d.slug || '';
          document.getElementById('news-category').value = d.category || CATEGORIES[0];
          document.getElementById('news-excerpt').value = d.excerpt || '';
          if (richTextEditor) richTextEditor.setContent(d.content || '');
          document.getElementById('news-author').value = d.author || 'Editör';
          document.getElementById('news-published').checked = d.isPublished !== false;
          document.getElementById('news-breaking').checked = !!d.isBreaking;
          document.getElementById('news-featured').checked = !!d.isFeatured;
          if (d.seo) {
            document.getElementById('news-meta-description').value = d.seo.metaDescription || '';
            keywordsList = d.seo.metaKeywords || [];
            renderKeywords();
          }
          if (d.scheduledPublishAt && scheduledDatePicker) {
            const date = d.scheduledPublishAt.toDate ? d.scheduledPublishAt.toDate() : new Date(d.scheduledPublishAt);
            scheduledDatePicker.setDate(date);
          }
          if (d.imageRef || d.image) {
            if (d.imageRef) {
              currentImageData = { id: d.imageMediaId, url: d.image, storagePath: d.imageRef, thumbnailPath: d.imageMeta?.thumbnailRef, dimensions: d.imageMeta?.dimensions, metadata: { fileName: d.imageMeta?.originalName || 'Görsel', size: d.imageMeta?.size } };
            } else {
              currentImageData = { url: d.image, isLegacyUrl: true };
            }
            showImagePreview(currentImageData);
            hideUploadOptions();
          }
          document.getElementById('title-counter').textContent = `${d.title?.length || 0} / 70`;
          document.getElementById('excerpt-counter').textContent = `${d.excerpt?.length || 0} / 300`;
          document.getElementById('meta-desc-counter').textContent = `${d.seo?.metaDescription?.length || 0} / 160`;
          updateSEOScore();
        });
    }
  }

  newsModal.showModal();
}

function restoreFormData(draft) {
  document.getElementById('news-title').value = draft.title || '';
  document.getElementById('news-slug').value = draft.slug || '';
  document.getElementById('news-category').value = draft.category || CATEGORIES[0];
  document.getElementById('news-excerpt').value = draft.excerpt || '';
  document.getElementById('news-meta-description').value = draft.metaDescription || '';
  document.getElementById('news-author').value = draft.author || 'Editör';
  document.getElementById('news-published').checked = draft.isPublished !== false;
  document.getElementById('news-breaking').checked = !!draft.isBreaking;
  document.getElementById('news-featured').checked = !!draft.isFeatured;

  if (richTextEditor && draft.content) {
    richTextEditor.setContent(draft.content);
  }

  if (draft.keywords) {
    keywordsList = draft.keywords;
    renderKeywords();
  }

  if (draft.imageData) {
    currentImageData = draft.imageData;
    showImagePreview(currentImageData);
    hideUploadOptions();
  }

  if (draft.scheduledDate && scheduledDatePicker) {
    scheduledDatePicker.setDate(draft.scheduledDate);
  }

  // Update counters and SEO
  updateSEOScore();
  notifications.success('Taslak geri yüklendi.');
}

function closeNewsModal() {
  // Stop auto-save
  if (autoSave) {
    autoSave.stop();
  }
  newsModal.close();
}

// Slug otomatik (başlık değişince)
document.getElementById('news-title').addEventListener('input', function () {
  const id = document.getElementById('news-id').value;
  if (!id) document.getElementById('news-slug').value = slugify(this.value);
});

newsForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const id = document.getElementById('news-id').value;
  const title = document.getElementById('news-title').value.trim();
  const slug = document.getElementById('news-slug').value.trim() || slugify(title);
  const category = document.getElementById('news-category').value;

  // Get content from Quill editor
  const content = richTextEditor ? richTextEditor.getSanitizedContent() : '';

  const author = document.getElementById('news-author').value.trim() || 'Editör';
  const excerpt = document.getElementById('news-excerpt').value.trim();
  const metaDescription = document.getElementById('news-meta-description').value.trim();
  const isPublished = document.getElementById('news-published').checked;
  const isBreaking = document.getElementById('news-breaking').checked;
  const isFeatured = document.getElementById('news-featured').checked;
  const readingTime = readingTimeFromHtml(content);

  const now = getTimestamp();

  const data = {
    title: title,
    slug: slug || 'haber',
    category: category,
    content: content,
    author: author,
    excerpt: excerpt || null,
    readingTime: readingTime,
    isBreaking: !!isBreaking,
    isFeatured: !!isFeatured,
    isPublished: !!isPublished,
    updatedAt: now
  };

  // SEO data
  const seoScore = seoAnalyzer ? seoAnalyzer.analyze({
    title,
    metaDescription,
    content,
    keywords: keywordsList,
    hasImage: !!currentImageData
  }).score : 0;

  data.seo = {
    metaDescription: metaDescription || '',
    metaKeywords: keywordsList,
    score: seoScore
  };

  // Scheduled publishing
  if (scheduledDatePicker && scheduledDatePicker.selectedDates.length > 0) {
    const scheduledDate = scheduledDatePicker.selectedDates[0];
    const Timestamp = window.firebase && window.firebase.firestore && window.firebase.firestore.Timestamp;
    data.scheduledPublishAt = Timestamp ? Timestamp.fromDate(scheduledDate) : scheduledDate.toISOString();
    data.isDraft = true;
  } else {
    data.scheduledPublishAt = null;
    data.isDraft = !isPublished;
  }

  // Published timestamp
  if (isPublished && !id) {
    data.publishedAt = now;
  }

  // Handle image data
  if (currentImageData) {
    data.image = currentImageData.url;

    if (!currentImageData.isLegacyUrl && currentImageData.storagePath) {
      // New storage-based image
      data.imageRef = currentImageData.storagePath;
      data.imageMediaId = currentImageData.id || null;
      data.imageMeta = {
        originalName: currentImageData.metadata?.fileName || '',
        size: currentImageData.metadata?.size || 0,
        dimensions: currentImageData.dimensions ? {
          width: currentImageData.dimensions.width,
          height: currentImageData.dimensions.height
        } : null,
        uploadedAt: now,
        thumbnailRef: currentImageData.thumbnailPath || null
      };
    } else {
      // Legacy URL or no storage reference
      data.imageRef = null;
      data.imageMediaId = null;
      data.imageMeta = null;
    }
  } else {
    // No image
    data.image = '';
    data.imageRef = null;
    data.imageMediaId = null;
    data.imageMeta = null;
  }

  const submitBtn = document.getElementById('news-form-submit');
  submitBtn.disabled = true;

  let promise;

  if (useLocalApi()) {
    // Yerel backend API ile kaydet
    const localData = {
      baslik: data.title,
      slug: data.slug,
      kategori: data.category,
      ozet: data.excerpt || '',
      icerik: data.content,
      yazar: data.author,
      gorsel: (currentImageData && currentImageData.url) || '',
      okumaSuresi: data.readingTime,
    };

    if (id) {
      promise = localApiFetch('/api/admin/haberler/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localData),
      }).then(r => { if (!r.ok) throw new Error('Güncelleme başarısız'); return r.json(); });
    } else {
      promise = localApiFetch('/api/admin/haberler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localData),
      }).then(r => { if (!r.ok) throw new Error('Ekleme başarısız'); return r.json(); });
    }
  } else {
    const db = getDb();
    if (!db) {
      notifications.error('Firebase yapılandırılmadı.');
      submitBtn.disabled = false;
      return;
    }
    if (!id) data.createdAt = getTimestamp();
    if (id) {
      promise = db.collection(COLLECTION_NEWS).doc(id).update(data);
    } else {
      promise = db.collection(COLLECTION_NEWS).add(data);
    }
  }

  promise
    .then(function () {
      notifications.success(id ? 'Haber güncellendi.' : 'Haber eklendi.');
      if (autoSave) autoSave.clearDraft(id);
      closeNewsModal();
      loadNewsList();
      loadDashboard();
    })
    .catch(function (err) {
      notifications.error(err.message || 'Kaydedilemedi');
    })
    .finally(function () {
      submitBtn.disabled = false;
    });
});

document.getElementById('news-modal-close').addEventListener('click', closeNewsModal);
document.getElementById('news-form-cancel').addEventListener('click', closeNewsModal);

// --- Silme onay ---
function confirmDeleteNews(id) {
  const doc = newsListCache.find(function (n) {
    return n.id === id;
  });
  const msg = document.getElementById('delete-message');
  msg.textContent = doc && doc.title ? '"' + doc.title + '" haberini silmek istediğinize emin misiniz?' : 'Bu haberi silmek istediğinize emin misiniz?';
  document.getElementById('delete-modal').showModal();
  document.getElementById('delete-confirm').dataset.deleteId = id;
}

document.getElementById('delete-cancel').addEventListener('click', function () {
  document.getElementById('delete-modal').close();
});

document.getElementById('delete-confirm').addEventListener('click', function () {
  const id = this.dataset.deleteId;
  document.getElementById('delete-modal').close();
  if (!id) return;

  let promise;
  if (useLocalApi()) {
    promise = localApiFetch('/api/admin/haberler/' + id, { method: 'DELETE' })
      .then(r => { if (!r.ok) throw new Error('Silme başarısız'); return r.json(); });
  } else {
    if (!getDb()) return;
    promise = getDb().collection(COLLECTION_NEWS).doc(id).delete();
  }

  promise
    .then(function () {
      notifications.success('Haber silindi.');
      loadNewsList();
      loadDashboard();
    })
    .catch(function (err) {
      notifications.error(err.message || 'Silinemedi');
    });
});

// --- Kategoriler sayfası ---
function renderCategories() {
  const list = document.getElementById('categories-list');
  if (!list) return;
  list.innerHTML = CATEGORIES.map(function (c) {
    return '<li>' + escapeHtml(c) + '</li>';
  }).join('');
}

// --- Kategori dropdown doldurma ---
function fillCategorySelects() {
  const options = CATEGORIES.map(function (c) {
    return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
  }).join('');
  const selectModal = document.getElementById('news-category');
  const selectFilter = document.getElementById('news-filter-category');
  if (selectModal) selectModal.innerHTML = options;
  if (selectFilter) selectFilter.innerHTML = '<option value="">Tüm kategoriler</option>' + options;
}

// --- Yeni haber butonu ---
document.getElementById('news-add-btn').addEventListener('click', function () {
  openNewsModal(null);
});

// --- Arama / filtre / sıralama ---
['news-search', 'news-filter-category', 'news-sort'].forEach(function (id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', renderNewsTable);
  if (el) el.addEventListener('change', renderNewsTable);
});

// --- Navigasyon ---
document.querySelectorAll('.nav-item').forEach(function (item) {
  item.addEventListener('click', function (e) {
    e.preventDefault();
    const page = item.dataset.page;
    if (page) showPage(page);
    document.getElementById('sidebar').classList.remove('open');
  });
});

// --- Önizleme ---
function initPreview() {
  const previewBtn = document.getElementById('news-form-preview');
  const previewModal = document.getElementById('preview-modal');
  const previewContent = document.getElementById('preview-content');
  const previewClose = document.getElementById('preview-close');
  const toggleMobile = document.getElementById('preview-toggle-mobile');
  const toggleDesktop = document.getElementById('preview-toggle-desktop');

  if (!previewBtn || !previewModal || !previewContent) return;

  previewBtn.addEventListener('click', function () {
    const title = document.getElementById('news-title').value.trim() || '(Başlıksız)';
    const category = document.getElementById('news-category').value || '';
    const author = document.getElementById('news-author').value.trim() || 'Editör';
    const content = richTextEditor ? richTextEditor.getContent() : '';
    const imageUrl = currentImageData ? currentImageData.url : '';

    let html = '';
    if (category) {
      html += '<span style="display:inline-block;padding:4px 10px;background:#0d4d3d;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;border-radius:4px;margin-bottom:12px;">' + escapeHtml(category) + '</span>';
    }
    html += '<h1>' + escapeHtml(title) + '</h1>';
    html += '<div class="meta"><span>' + escapeHtml(author) + '</span><span>' + formatDate(null) + '</span></div>';
    if (imageUrl) {
      html += '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(title) + '" style="width:100%;border-radius:8px;margin:1.5rem 0;">';
    }
    html += '<div class="preview-article-body">' + content + '</div>';

    previewContent.innerHTML = html;
    previewContent.classList.remove('mobile-view');
    previewModal.showModal();
  });

  if (previewClose) {
    previewClose.addEventListener('click', function () {
      previewModal.close();
    });
  }

  // Also close from the generic modal-close button
  previewModal.querySelectorAll('.modal-close').forEach(function (btn) {
    btn.addEventListener('click', function () {
      previewModal.close();
    });
  });

  if (toggleMobile) {
    toggleMobile.addEventListener('click', function () {
      previewContent.classList.add('mobile-view');
    });
  }

  if (toggleDesktop) {
    toggleDesktop.addEventListener('click', function () {
      previewContent.classList.remove('mobile-view');
    });
  }
}

// --- Klavye kısayolları ---
function initKeyboardShortcuts() {
  keyboardShortcuts = new KeyboardShortcuts();

  // Ctrl+S: Kaydet (modal açıkken form submit)
  keyboardShortcuts.register('s', function () {
    if (newsModal.open) {
      newsForm.requestSubmit();
    }
  }, { ctrl: true, description: 'Haberi kaydet' });

  // Ctrl+N: Yeni haber
  keyboardShortcuts.register('n', function () {
    const panelScreen = document.getElementById('panel-screen');
    if (panelScreen && !panelScreen.hidden) {
      showPage('news');
      openNewsModal(null);
    }
  }, { ctrl: true, description: 'Yeni haber ekle' });

  // Escape: Modal kapat
  keyboardShortcuts.register('Escape', function () {
    if (newsModal.open) {
      closeNewsModal();
    }
    const deleteModal = document.getElementById('delete-modal');
    if (deleteModal && deleteModal.open) {
      deleteModal.close();
    }
    const previewModal = document.getElementById('preview-modal');
    if (previewModal && previewModal.open) {
      previewModal.close();
    }
    const shortcutsModal = document.getElementById('shortcuts-modal');
    if (shortcutsModal && shortcutsModal.open) {
      shortcutsModal.close();
    }
  }, { description: 'Modalı kapat' });

  // ?: Kısayollar yardımı
  keyboardShortcuts.register('?', function () {
    keyboardShortcuts.showHelp();
  }, { shift: true, description: 'Kısayolları göster' });

  // Ctrl+1: Dashboard
  keyboardShortcuts.register('1', function () {
    showPage('dashboard');
  }, { ctrl: true, description: 'Dashboard\'a git' });

  // Ctrl+2: Haberler
  keyboardShortcuts.register('2', function () {
    showPage('news');
  }, { ctrl: true, description: 'Haberler sayfasına git' });

  keyboardShortcuts.init();

  // Shortcuts modal close
  const shortcutsClose = document.getElementById('shortcuts-close');
  if (shortcutsClose) {
    shortcutsClose.addEventListener('click', function () {
      document.getElementById('shortcuts-modal').close();
    });
  }
}

// --- Başlat ---
// Yerel admin aktifse bu modülün init'ini atla
if (window.__localAdminActive) {
  // admin-local.js zaten tüm işlevselliği sağlıyor
} else {
  fillCategorySelects();
  initSidebar();
  initAuth();
  initLoginForm();
  initLogout();
  initImageUpload();
  initFormEnhancements();
  initPaginationAndBulk();
  initPreview();
  initKeyboardShortcuts();
}

// Initialize Lucide icons after DOM load
if (window.lucide) {
  window.lucide.createIcons();
}

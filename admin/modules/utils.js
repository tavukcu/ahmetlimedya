/**
 * Ahmetli Medya - Utility Functions
 * Shared helper functions for admin panel
 */

// --- Slug (başlıktan URL dostu metin) ---
export function slugify(str) {
  if (!str || typeof str !== 'string') return '';
  const tr = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c', İ: 'i' };
  let s = str.toLowerCase();
  Object.keys(tr).forEach(function (k) {
    s = s.replace(new RegExp(k, 'g'), tr[k]);
  });
  return s
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// --- Okuma süresi (dakika): yaklaşık 200 kelime/dakika ---
export function readingTimeFromHtml(html) {
  if (!html) return 1;
  const text = (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text ? text.split(' ').filter(Boolean).length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

// --- Tarih formatı (Türkçe) ---
export function formatDate(timestamp) {
  if (!timestamp) return '–';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return isNaN(d.getTime())
    ? '–'
    : d.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
}

// --- HTML escape ---
export function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// --- Firebase helpers ---
export function getAuth() {
  return window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.auth
    ? window.AhmetliMedyaFirebase.auth
    : null;
}

export function getDb() {
  return window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.db
    ? window.AhmetliMedyaFirebase.db
    : null;
}

export function getStorage() {
  return window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.storage
    ? window.AhmetliMedyaFirebase.storage
    : null;
}

export function isConfigured() {
  return window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.isConfigured === true;
}

// --- Admin check ---
export function isAdmin(user) {
  if (!user || !user.email) return false;
  const list = window.AhmetliMedyaFirebase && window.AhmetliMedyaFirebase.adminEmails;
  if (!list || !Array.isArray(list) || list.length === 0) return true;
  const email = (user.email || '').toLowerCase();
  return list.some(function (e) {
    return (e || '').toLowerCase() === email;
  });
}

// --- Firebase Timestamp helper ---
export function getTimestamp() {
  const Timestamp = window.firebase && window.firebase.firestore && window.firebase.firestore.Timestamp;
  return Timestamp ? Timestamp.now() : { toDate: function () { return new Date(); } };
}

// --- Debounce function ---
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- File size formatter ---
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// --- Image resize using Canvas ---
export function resizeImage(file, maxWidth, maxHeight, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve({
              blob,
              width,
              height,
              originalWidth: img.width,
              originalHeight: img.height
            });
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Görsel yüklenemedi'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

// --- Generate unique ID ---
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

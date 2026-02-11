/**
 * Ahmetli Medya - Media Library Module
 * Grid view, search, filter, select, delete
 */

import { getDb, formatDate, formatFileSize, escapeHtml } from './utils.js';
import { deleteImage } from './image-upload.js';
import notifications from './notifications.js';

export class MediaLibrary {
  constructor(options = {}) {
    this.modalId = options.modalId || 'media-library-modal';
    this.onSelect = options.onSelect || null;
    this.pageSize = options.pageSize || 20;
    this.currentPage = 0;
    this.totalItems = 0;
    this.mediaList = [];
    this.filteredList = [];
    this.selectedImage = null;
    this.searchQuery = '';
    this.categoryFilter = '';

    this.modal = null;
    this.gridContainer = null;
    this.searchInput = null;
    this.categorySelect = null;
  }

  init() {
    this.modal = document.getElementById(this.modalId);
    if (!this.modal) {
      console.error('Media library modal not found:', this.modalId);
      return;
    }

    this.gridContainer = this.modal.querySelector('.media-grid');
    this.searchInput = this.modal.querySelector('#media-search');
    this.categorySelect = this.modal.querySelector('#media-filter-category');

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Close modal
    const closeBtn = this.modal.querySelector('.modal-close');
    const cancelBtn = this.modal.querySelector('#media-modal-cancel');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Select button
    const selectBtn = this.modal.querySelector('#media-modal-select');
    if (selectBtn) {
      selectBtn.addEventListener('click', () => this.selectImage());
    }

    // Search
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.filterAndRender();
      });
    }

    // Category filter
    if (this.categorySelect) {
      this.categorySelect.addEventListener('change', (e) => {
        this.categoryFilter = e.target.value;
        this.filterAndRender();
      });
    }

    // Pagination
    const prevBtn = this.modal.querySelector('#media-prev-page');
    const nextBtn = this.modal.querySelector('#media-next-page');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.previousPage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextPage());
    }
  }

  async open() {
    if (!this.modal) {
      this.init();
    }

    this.selectedImage = null;
    this.currentPage = 0;
    await this.loadMedia();
    this.modal.showModal();
  }

  close() {
    if (this.modal) {
      this.modal.close();
    }
  }

  async loadMedia() {
    const db = getDb();
    if (!db) {
      this.gridContainer.innerHTML = '<p class="empty-message">Firebase yapılandırılmadı.</p>';
      return;
    }

    try {
      this.gridContainer.innerHTML = '<div class="loading">Yükleniyor...</div>';

      const snapshot = await db
        .collection('media_library')
        .orderBy('uploadedAt', 'desc')
        .get();

      this.mediaList = [];
      snapshot.forEach(doc => {
        this.mediaList.push({
          id: doc.id,
          ...doc.data()
        });
      });

      this.totalItems = this.mediaList.length;
      this.filterAndRender();
    } catch (error) {
      console.error('Load media error:', error);
      notifications.error('Medya kütüphanesi yüklenemedi.');
      this.gridContainer.innerHTML = '<p class="empty-message">Yüklenemedi.</p>';
    }
  }

  filterAndRender() {
    // Apply filters
    this.filteredList = this.mediaList.filter(item => {
      const matchSearch = !this.searchQuery ||
        item.fileName.toLowerCase().includes(this.searchQuery);
      const matchCategory = !this.categoryFilter ||
        item.category === this.categoryFilter;
      return matchSearch && matchCategory;
    });

    this.totalItems = this.filteredList.length;
    this.currentPage = 0; // Reset to first page on filter
    this.renderGrid();
  }

  renderGrid() {
    if (!this.gridContainer) return;

    if (this.filteredList.length === 0) {
      this.gridContainer.innerHTML = '<p class="empty-message">Görsel bulunamadı.</p>';
      this.updatePagination();
      return;
    }

    // Calculate pagination
    const start = this.currentPage * this.pageSize;
    const end = Math.min(start + this.pageSize, this.filteredList.length);
    const pageItems = this.filteredList.slice(start, end);

    // Render grid
    this.gridContainer.innerHTML = pageItems.map(item => {
      const usedCount = (item.usedIn || []).length;
      return `
        <div class="media-item" data-id="${item.id}">
          <div class="media-thumbnail">
            <img src="${escapeHtml(item.thumbnailUrl)}" alt="${escapeHtml(item.fileName)}" loading="lazy">
            <div class="media-overlay">
              <button type="button" class="btn btn-sm btn-primary media-select-btn" data-id="${item.id}">
                Seç
              </button>
              <button type="button" class="btn btn-sm btn-danger media-delete-btn" data-id="${item.id}" ${usedCount > 0 ? 'disabled title="Bu görsel kullanımda"' : ''}>
                Sil
              </button>
            </div>
          </div>
          <div class="media-info">
            <p class="media-filename" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</p>
            <p class="media-meta">
              ${item.dimensions.width}×${item.dimensions.height} · ${formatFileSize(item.size)}
            </p>
            ${usedCount > 0 ? `<p class="media-usage">${usedCount} haberde kullanılıyor</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach click handlers
    this.gridContainer.querySelectorAll('.media-select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.handleSelect(id);
      });
    });

    this.gridContainer.querySelectorAll('.media-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.handleDelete(id);
      });
    });

    // Click on media item to preview
    this.gridContainer.querySelectorAll('.media-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        this.handlePreview(id);
      });
    });

    this.updatePagination();
  }

  handleSelect(id) {
    const media = this.filteredList.find(item => item.id === id);
    if (media) {
      this.selectedImage = media;
      if (this.onSelect) {
        this.onSelect(media);
      }
      this.close();
    }
  }

  async handleDelete(id) {
    const media = this.filteredList.find(item => item.id === id);
    if (!media) return;

    const usedCount = (media.usedIn || []).length;
    if (usedCount > 0) {
      notifications.warning('Bu görsel hala kullanımda. Önce kullanıldığı haberlerden kaldırın.');
      return;
    }

    const confirmed = confirm(`"${media.fileName}" görselini silmek istediğinize emin misiniz?`);
    if (!confirmed) return;

    try {
      await deleteImage(media.id, media.storagePath, media.thumbnailPath);
      await this.loadMedia(); // Reload
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  handlePreview(id) {
    const media = this.filteredList.find(item => item.id === id);
    if (!media) return;

    // Highlight selected
    this.gridContainer.querySelectorAll('.media-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === id);
    });

    // Show preview (could be enhanced with a larger preview modal)
    this.selectedImage = media;
  }

  updatePagination() {
    const totalPages = Math.ceil(this.totalItems / this.pageSize);
    const pageInfo = this.modal.querySelector('#media-page-info');
    const prevBtn = this.modal.querySelector('#media-prev-page');
    const nextBtn = this.modal.querySelector('#media-next-page');

    if (pageInfo) {
      if (totalPages > 0) {
        pageInfo.textContent = `Sayfa ${this.currentPage + 1} / ${totalPages}`;
      } else {
        pageInfo.textContent = '';
      }
    }

    if (prevBtn) {
      prevBtn.disabled = this.currentPage === 0;
    }

    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= totalPages - 1;
    }
  }

  previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.renderGrid();
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.totalItems / this.pageSize);
    if (this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.renderGrid();
    }
  }

  selectImage() {
    if (this.selectedImage && this.onSelect) {
      this.onSelect(this.selectedImage);
    }
    this.close();
  }
}

export default MediaLibrary;

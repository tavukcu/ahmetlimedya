/**
 * Ahmetli Medya - Bulk Actions Module
 * Select multiple items and perform batch operations
 */

import { getDb, getTimestamp } from './utils.js';
import notifications from './notifications.js';

export class BulkActions {
  constructor(options = {}) {
    this.collectionName = options.collectionName || 'news';
    this.selectedIds = new Set();
    this.onSelectionChange = options.onSelectionChange || null;
    this.onActionComplete = options.onActionComplete || null;
  }

  selectAll(ids) {
    this.selectedIds = new Set(ids);
    this.notifySelectionChange();
  }

  deselectAll() {
    this.selectedIds.clear();
    this.notifySelectionChange();
  }

  toggle(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.notifySelectionChange();
  }

  isSelected(id) {
    return this.selectedIds.has(id);
  }

  getSelectedCount() {
    return this.selectedIds.size;
  }

  getSelectedIds() {
    return Array.from(this.selectedIds);
  }

  notifySelectionChange() {
    if (this.onSelectionChange) {
      this.onSelectionChange({
        count: this.getSelectedCount(),
        ids: this.getSelectedIds()
      });
    }
  }

  async performAction(action, options = {}) {
    const db = getDb();
    if (!db) {
      notifications.error('Firebase yapılandırılmadı.');
      return false;
    }

    const ids = this.getSelectedIds();
    if (ids.length === 0) {
      notifications.warning('Lütfen en az bir öğe seçin.');
      return false;
    }

    try {
      switch (action) {
        case 'publish':
          await this.bulkPublish(ids, true);
          break;
        case 'unpublish':
          await this.bulkPublish(ids, false);
          break;
        case 'delete':
          await this.bulkDelete(ids);
          break;
        case 'setBreaking':
          await this.bulkSetField(ids, 'isBreaking', true);
          break;
        case 'unsetBreaking':
          await this.bulkSetField(ids, 'isBreaking', false);
          break;
        case 'setFeatured':
          await this.bulkSetField(ids, 'isFeatured', true);
          break;
        case 'unsetFeatured':
          await this.bulkSetField(ids, 'isFeatured', false);
          break;
        default:
          notifications.error('Geçersiz işlem.');
          return false;
      }

      this.deselectAll();

      if (this.onActionComplete) {
        this.onActionComplete({ action, ids });
      }

      return true;
    } catch (error) {
      console.error('Bulk action error:', error);
      notifications.error(error.message || 'İşlem başarısız.');
      return false;
    }
  }

  async bulkPublish(ids, isPublished) {
    const db = getDb();
    const batch = db.batch();
    const now = getTimestamp();

    ids.forEach(id => {
      const docRef = db.collection(this.collectionName).doc(id);
      batch.update(docRef, {
        isPublished: isPublished,
        updatedAt: now,
        publishedAt: isPublished ? now : null
      });
    });

    await batch.commit();

    notifications.success(
      isPublished
        ? `${ids.length} haber yayınlandı.`
        : `${ids.length} haber yayından kaldırıldı.`
    );
  }

  async bulkSetField(ids, field, value) {
    const db = getDb();
    const batch = db.batch();
    const now = getTimestamp();

    ids.forEach(id => {
      const docRef = db.collection(this.collectionName).doc(id);
      batch.update(docRef, {
        [field]: value,
        updatedAt: now
      });
    });

    await batch.commit();

    const fieldNames = {
      isBreaking: 'Son dakika',
      isFeatured: 'Öne çıkan'
    };

    const fieldName = fieldNames[field] || field;
    notifications.success(
      value
        ? `${ids.length} haber ${fieldName} olarak işaretlendi.`
        : `${ids.length} haberden ${fieldName} kaldırıldı.`
    );
  }

  async bulkDelete(ids) {
    const confirmed = confirm(
      `${ids.length} haberi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
    );

    if (!confirmed) {
      return false;
    }

    const db = getDb();
    const batch = db.batch();

    ids.forEach(id => {
      const docRef = db.collection(this.collectionName).doc(id);
      batch.delete(docRef);
    });

    await batch.commit();
    notifications.success(`${ids.length} haber silindi.`);
  }
}

export default BulkActions;

/**
 * Ahmetli Medya - Auto-save Module
 * Automatically saves draft every 30 seconds
 */

import { getDb, getAuth, getTimestamp } from './utils.js';
import notifications from './notifications.js';

export class AutoSave {
  constructor(options = {}) {
    this.interval = options.interval || 30000; // 30 seconds
    this.collectionName = options.collectionName || 'drafts_autosave';
    this.getFormData = options.getFormData || null;
    this.newsId = options.newsId || null;
    this.timer = null;
    this.lastSavedData = null;
    this.isSaving = false;
    this.indicator = options.indicator || null;
  }

  start(newsId = null) {
    this.newsId = newsId;
    this.stop(); // Clear any existing timer

    this.timer = setInterval(() => {
      this.save();
    }, this.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async save() {
    if (this.isSaving) return;
    if (!this.getFormData) return;

    const db = getDb();
    const auth = getAuth();

    if (!db || !auth || !auth.currentUser) return;

    try {
      this.isSaving = true;
      this.updateIndicator('saving');

      const formData = this.getFormData();

      // Check if data has changed
      const dataStr = JSON.stringify(formData);
      if (dataStr === this.lastSavedData) {
        this.updateIndicator('saved');
        this.isSaving = false;
        return;
      }

      // Calculate expiry (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const draftData = {
        newsId: this.newsId || null,
        userId: auth.currentUser.uid,
        formData: formData,
        savedAt: getTimestamp(),
        expiresAt: window.firebase.firestore.Timestamp.fromDate(expiresAt)
      };

      // Use newsId_autosave as document ID or generate one
      const docId = this.newsId ? `${this.newsId}_autosave` : `new_${auth.currentUser.uid}_autosave`;

      await db.collection(this.collectionName).doc(docId).set(draftData);

      this.lastSavedData = dataStr;
      this.updateIndicator('saved');

      console.log('Auto-saved:', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Auto-save error:', error);
      this.updateIndicator('error');
    } finally {
      this.isSaving = false;
    }
  }

  async loadDraft(newsId = null) {
    const db = getDb();
    const auth = getAuth();

    if (!db || !auth || !auth.currentUser) return null;

    try {
      const docId = newsId ? `${newsId}_autosave` : `new_${auth.currentUser.uid}_autosave`;
      const doc = await db.collection(this.collectionName).doc(docId).get();

      if (doc.exists) {
        const data = doc.data();
        // Check if not expired
        if (data.expiresAt && data.expiresAt.toDate() > new Date()) {
          return data.formData;
        }
      }

      return null;
    } catch (error) {
      console.error('Load draft error:', error);
      return null;
    }
  }

  async clearDraft(newsId = null) {
    const db = getDb();
    const auth = getAuth();

    if (!db || !auth || !auth.currentUser) return;

    try {
      const docId = newsId ? `${newsId}_autosave` : `new_${auth.currentUser.uid}_autosave`;
      await db.collection(this.collectionName).doc(docId).delete();
      this.lastSavedData = null;
    } catch (error) {
      console.error('Clear draft error:', error);
    }
  }

  async promptRestore() {
    const draft = await this.loadDraft(this.newsId);

    if (draft) {
      return new Promise((resolve) => {
        const confirmed = confirm(
          'Kaydedilmemiş değişiklikler bulundu. Geri yüklemek ister misiniz?'
        );
        resolve(confirmed ? draft : null);
      });
    }

    return null;
  }

  updateIndicator(status) {
    if (!this.indicator) return;

    const indicator = document.getElementById(this.indicator);
    if (!indicator) return;

    switch (status) {
      case 'saving':
        indicator.textContent = 'Kaydediliyor...';
        indicator.className = 'autosave-indicator saving';
        break;
      case 'saved':
        indicator.textContent = 'Taslak kaydedildi';
        indicator.className = 'autosave-indicator saved';
        break;
      case 'error':
        indicator.textContent = 'Kaydetme hatası';
        indicator.className = 'autosave-indicator error';
        break;
      default:
        indicator.textContent = '';
        indicator.className = 'autosave-indicator';
    }
  }

  // Manual save
  async saveNow() {
    await this.save();
  }
}

export default AutoSave;

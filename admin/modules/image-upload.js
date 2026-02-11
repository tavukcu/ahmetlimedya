/**
 * Ahmetli Medya - Image Upload Module
 * Drag-drop upload, client-side resize, Firebase Storage integration
 */

import { getStorage, getDb, getTimestamp, resizeImage, formatFileSize, generateId } from './utils.js';
import notifications from './notifications.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAIN_IMAGE_MAX_WIDTH = 1920;
const MAIN_IMAGE_MAX_HEIGHT = 1080;
const MAIN_IMAGE_QUALITY = 0.85;
const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_HEIGHT = 200;
const THUMBNAIL_QUALITY = 0.80;

export class ImageUploader {
  constructor(dropZoneId, options = {}) {
    this.dropZone = document.getElementById(dropZoneId);
    this.onUploadComplete = options.onUploadComplete || null;
    this.onUploadProgress = options.onUploadProgress || null;
    this.onUploadError = options.onUploadError || null;
    this.category = options.category || 'news';

    if (this.dropZone) {
      this.init();
    }
  }

  init() {
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, this.preventDefaults, false);
    });

    // Highlight drop zone on drag over
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, () => {
        this.dropZone.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, () => {
        this.dropZone.classList.remove('drag-over');
      }, false);
    });

    // Handle drop
    this.dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      this.handleFiles(files);
    }, false);

    // Handle click to upload
    const fileInput = this.dropZone.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        this.handleFiles(e.target.files);
      });
    }
  }

  preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async handleFiles(files) {
    if (!files || files.length === 0) return;

    const file = files[0]; // Only handle first file

    // Validate file type
    if (!file.type.startsWith('image/')) {
      if (this.onUploadError) {
        this.onUploadError(new Error('Lütfen bir görsel dosyası seçin.'));
      } else {
        notifications.error('Lütfen bir görsel dosyası seçin.');
      }
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      if (this.onUploadError) {
        this.onUploadError(new Error(`Dosya boyutu en fazla ${formatFileSize(MAX_FILE_SIZE)} olabilir.`));
      } else {
        notifications.error(`Dosya boyutu en fazla ${formatFileSize(MAX_FILE_SIZE)} olabilir.`);
      }
      return;
    }

    try {
      await this.uploadImage(file);
    } catch (error) {
      console.error('Upload error:', error);
      if (this.onUploadError) {
        this.onUploadError(error);
      } else {
        notifications.error(error.message || 'Görsel yüklenemedi.');
      }
    }
  }

  async uploadImage(file) {
    const storage = getStorage();
    const db = getDb();

    if (!storage) {
      throw new Error('Firebase Storage yapılandırılmamış.');
    }

    // Generate unique ID for this upload
    const uploadId = generateId();
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${uploadId}.${fileExt}`;
    const thumbnailName = `${uploadId}_thumb.${fileExt}`;

    // Show progress
    if (this.onUploadProgress) {
      this.onUploadProgress({ status: 'resizing', progress: 0 });
    }

    // Resize main image
    const mainImage = await resizeImage(
      file,
      MAIN_IMAGE_MAX_WIDTH,
      MAIN_IMAGE_MAX_HEIGHT,
      MAIN_IMAGE_QUALITY
    );

    // Resize thumbnail
    const thumbnail = await resizeImage(
      file,
      THUMBNAIL_WIDTH,
      THUMBNAIL_HEIGHT,
      THUMBNAIL_QUALITY
    );

    if (this.onUploadProgress) {
      this.onUploadProgress({ status: 'uploading', progress: 25 });
    }

    // Upload main image
    const mainPath = `${this.category}/${fileName}`;
    const mainRef = storage.ref().child(mainPath);
    const mainUploadTask = mainRef.put(mainImage.blob);

    // Track progress
    mainUploadTask.on('state_changed',
      (snapshot) => {
        const progress = 25 + (snapshot.bytesTransferred / snapshot.totalBytes) * 50;
        if (this.onUploadProgress) {
          this.onUploadProgress({ status: 'uploading', progress: Math.round(progress) });
        }
      }
    );

    await mainUploadTask;
    const mainUrl = await mainRef.getDownloadURL();

    // Upload thumbnail
    if (this.onUploadProgress) {
      this.onUploadProgress({ status: 'uploading', progress: 75 });
    }

    const thumbnailPath = `thumbnails/${thumbnailName}`;
    const thumbnailRef = storage.ref().child(thumbnailPath);
    await thumbnailRef.put(thumbnail.blob);
    const thumbnailUrl = await thumbnailRef.getDownloadURL();

    if (this.onUploadProgress) {
      this.onUploadProgress({ status: 'saving', progress: 90 });
    }

    // Save metadata to Firestore media_library
    const mediaData = {
      fileName: file.name,
      storagePath: mainPath,
      url: mainUrl,
      thumbnailPath: thumbnailPath,
      thumbnailUrl: thumbnailUrl,
      category: this.category,
      dimensions: {
        width: mainImage.width,
        height: mainImage.height
      },
      originalDimensions: {
        width: mainImage.originalWidth,
        height: mainImage.originalHeight
      },
      size: mainImage.blob.size,
      mimeType: mainImage.blob.type,
      uploadedAt: getTimestamp(),
      usedIn: [],
      tags: []
    };

    let mediaId = null;
    if (db) {
      const docRef = await db.collection('media_library').add(mediaData);
      mediaId = docRef.id;
    }

    if (this.onUploadProgress) {
      this.onUploadProgress({ status: 'complete', progress: 100 });
    }

    const result = {
      id: mediaId,
      url: mainUrl,
      thumbnailUrl: thumbnailUrl,
      storagePath: mainPath,
      thumbnailPath: thumbnailPath,
      dimensions: mainImage,
      metadata: mediaData
    };

    if (this.onUploadComplete) {
      this.onUploadComplete(result);
    }

    notifications.success('Görsel başarıyla yüklendi.');

    return result;
  }
}

// Helper function to delete an image from storage and firestore
export async function deleteImage(mediaId, storagePath, thumbnailPath) {
  const storage = getStorage();
  const db = getDb();

  try {
    // Delete from storage
    if (storage && storagePath) {
      try {
        await storage.ref().child(storagePath).delete();
      } catch (error) {
        console.warn('Main image not found in storage:', error);
      }

      if (thumbnailPath) {
        try {
          await storage.ref().child(thumbnailPath).delete();
        } catch (error) {
          console.warn('Thumbnail not found in storage:', error);
        }
      }
    }

    // Delete from Firestore
    if (db && mediaId) {
      await db.collection('media_library').doc(mediaId).delete();
    }

    notifications.success('Görsel silindi.');
    return true;
  } catch (error) {
    console.error('Delete error:', error);
    notifications.error(error.message || 'Görsel silinemedi.');
    throw error;
  }
}

// Helper function to update media usage
export async function updateMediaUsage(mediaId, newsId, action = 'add') {
  const db = getDb();
  if (!db || !mediaId) return;

  try {
    const mediaDoc = await db.collection('media_library').doc(mediaId).get();
    if (!mediaDoc.exists) return;

    const data = mediaDoc.data();
    let usedIn = data.usedIn || [];

    if (action === 'add') {
      if (!usedIn.includes(newsId)) {
        usedIn.push(newsId);
      }
    } else if (action === 'remove') {
      usedIn = usedIn.filter(id => id !== newsId);
    }

    await db.collection('media_library').doc(mediaId).update({
      usedIn: usedIn
    });
  } catch (error) {
    console.error('Update media usage error:', error);
  }
}

export default ImageUploader;

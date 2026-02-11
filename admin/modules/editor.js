/**
 * Ahmetli Medya - Rich Text Editor Module
 * Quill.js integration with dark theme and media library support
 */

import notifications from './notifications.js';

export class RichTextEditor {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.quill = null;
    this.onMediaLibraryOpen = options.onMediaLibraryOpen || null;
    this.modules = options.modules || this.getDefaultModules();
    this.formats = options.formats || this.getDefaultFormats();
    this.placeholder = options.placeholder || 'Haber içeriğini buraya yazın...';
  }

  getDefaultModules() {
    return {
      toolbar: {
        container: [
          [{ 'header': [2, 3, 4, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'align': [] }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean']
        ],
        handlers: {
          'image': () => {
            if (this.onMediaLibraryOpen) {
              this.onMediaLibraryOpen((imageUrl) => {
                this.insertImage(imageUrl);
              });
            } else {
              // Fallback to default image handler
              const url = prompt('Görsel URL:');
              if (url) {
                this.insertImage(url);
              }
            }
          }
        }
      }
    };
  }

  getDefaultFormats() {
    return [
      'header',
      'bold', 'italic', 'underline', 'strike',
      'list', 'bullet',
      'align',
      'blockquote', 'code-block',
      'link', 'image'
    ];
  }

  init() {
    if (!window.Quill) {
      console.error('Quill is not loaded');
      notifications.error('Metin editörü yüklenemedi.');
      return false;
    }

    if (!this.container) {
      console.error('Editor container not found:', this.containerId);
      return false;
    }

    try {
      this.quill = new Quill(this.container, {
        theme: 'snow',
        modules: this.modules,
        formats: this.formats,
        placeholder: this.placeholder
      });

      // Apply dark theme
      this.applyDarkTheme();

      return true;
    } catch (error) {
      console.error('Quill initialization error:', error);
      notifications.error('Metin editörü başlatılamadı.');
      return false;
    }
  }

  applyDarkTheme() {
    // Dark theme is handled in CSS
    const editorElement = this.container.closest('.editor-wrapper');
    if (editorElement) {
      editorElement.classList.add('dark-theme');
    }
  }

  getContent() {
    if (!this.quill) return '';
    return this.quill.root.innerHTML;
  }

  setContent(html) {
    if (!this.quill) return;

    // Quill expects Delta format, but we can set HTML directly
    this.quill.root.innerHTML = html || '';
  }

  getText() {
    if (!this.quill) return '';
    return this.quill.getText();
  }

  getLength() {
    if (!this.quill) return 0;
    return this.quill.getLength();
  }

  clear() {
    if (!this.quill) return;
    this.quill.setText('');
  }

  insertImage(url) {
    if (!this.quill) return;

    const range = this.quill.getSelection(true);
    this.quill.insertEmbed(range.index, 'image', url);
    this.quill.setSelection(range.index + 1);
  }

  focus() {
    if (!this.quill) return;
    this.quill.focus();
  }

  enable(enabled = true) {
    if (!this.quill) return;
    this.quill.enable(enabled);
  }

  disable() {
    this.enable(false);
  }

  // Get plain text length for validation
  getTextLength() {
    if (!this.quill) return 0;
    return this.quill.getText().trim().length;
  }

  // Check if editor is empty
  isEmpty() {
    if (!this.quill) return true;
    const text = this.quill.getText().trim();
    return text.length === 0;
  }

  // On change event
  onChange(callback) {
    if (!this.quill) return;
    this.quill.on('text-change', (delta, oldDelta, source) => {
      if (callback) {
        callback({
          html: this.getContent(),
          text: this.getText(),
          length: this.getLength()
        });
      }
    });
  }

  // Sanitize content (remove dangerous scripts)
  sanitizeContent(html) {
    if (!html) return '';

    // Remove script tags
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove on* event handlers
    html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    return html;
  }

  // Get sanitized content
  getSanitizedContent() {
    const html = this.getContent();
    return this.sanitizeContent(html);
  }
}

export default RichTextEditor;

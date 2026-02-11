/**
 * Ahmetli Medya - Enhanced Toast Notifications
 * Queue system, multiple types, action buttons, auto-dismiss
 */

class NotificationManager {
  constructor(containerId = 'toast-container') {
    this.container = document.getElementById(containerId);
    this.queue = [];
    this.maxVisible = 3;
    this.defaultDuration = 3000;
  }

  /**
   * Show a notification
   * @param {string} message - Message to display
   * @param {string} type - 'success' | 'error' | 'warning' | 'info'
   * @param {object} options - { duration, action, onAction, persistent }
   */
  show(message, type = 'success', options = {}) {
    const notification = {
      id: this._generateId(),
      message,
      type,
      duration: options.duration || this.defaultDuration,
      action: options.action || null,
      onAction: options.onAction || null,
      persistent: options.persistent || false,
      timestamp: Date.now()
    };

    this.queue.push(notification);
    this._processQueue();

    return notification.id;
  }

  // Convenience methods
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }

  error(message, options = {}) {
    return this.show(message, 'error', options);
  }

  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.show(message, 'info', options);
  }

  // Remove specific notification
  remove(id) {
    const index = this.queue.findIndex(n => n.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }

    const element = document.querySelector(`[data-toast-id="${id}"]`);
    if (element) {
      element.classList.add('toast-exit');
      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }, 200);
    }
  }

  // Clear all notifications
  clearAll() {
    this.queue = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  _processQueue() {
    if (!this.container) return;

    const visible = this.container.querySelectorAll('.toast').length;

    if (visible >= this.maxVisible) return;

    const toShow = this.queue.slice(visible, this.maxVisible);

    toShow.forEach(notification => {
      this._renderNotification(notification);
    });
  }

  _renderNotification(notification) {
    const el = document.createElement('div');
    el.className = `toast toast-${notification.type}`;
    el.setAttribute('data-toast-id', notification.id);
    el.setAttribute('role', 'alert');

    // Icon
    const icon = this._getIcon(notification.type);

    // Message container
    const content = document.createElement('div');
    content.className = 'toast-content';

    const iconEl = document.createElement('span');
    iconEl.className = 'toast-icon';
    iconEl.innerHTML = icon;

    const messageEl = document.createElement('span');
    messageEl.className = 'toast-message';
    messageEl.textContent = notification.message;

    content.appendChild(iconEl);
    content.appendChild(messageEl);
    el.appendChild(content);

    // Action button
    if (notification.action && notification.onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-action';
      actionBtn.textContent = notification.action;
      actionBtn.onclick = () => {
        notification.onAction();
        this.remove(notification.id);
      };
      el.appendChild(actionBtn);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Kapat');
    closeBtn.onclick = () => this.remove(notification.id);
    el.appendChild(closeBtn);

    this.container.appendChild(el);

    // Auto dismiss (unless persistent)
    if (!notification.persistent && notification.duration > 0) {
      setTimeout(() => {
        this.remove(notification.id);
        this._processQueue();
      }, notification.duration);
    }
  }

  _getIcon(type) {
    const icons = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
      warning: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
      info: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
    };
    return icons[type] || icons.info;
  }

  _generateId() {
    return 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// Create global instance
const notifications = new NotificationManager();

// Export for module usage
export default notifications;

// Also expose globally for backward compatibility
if (typeof window !== 'undefined') {
  window.notifications = notifications;
}

// Legacy toast function for backward compatibility
export function toast(message, type = 'success') {
  return notifications.show(message, type);
}

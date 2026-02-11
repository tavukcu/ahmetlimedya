/**
 * Ahmetli Medya - Keyboard Shortcuts Module
 * Global keyboard shortcuts for admin panel
 */

export class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    this.modKey = this.isMac ? 'metaKey' : 'ctrlKey';
    this.modKeyName = this.isMac ? '⌘' : 'Ctrl';
    this.enabled = true;
  }

  register(key, callback, options = {}) {
    const {
      ctrl = false,
      shift = false,
      alt = false,
      description = ''
    } = options;

    const shortcut = {
      key: key.toLowerCase(),
      ctrl,
      shift,
      alt,
      callback,
      description
    };

    const id = this.getShortcutId(key, ctrl, shift, alt);
    this.shortcuts.set(id, shortcut);
  }

  getShortcutId(key, ctrl, shift, alt) {
    return `${ctrl ? 'ctrl+' : ''}${shift ? 'shift+' : ''}${alt ? 'alt+' : ''}${key.toLowerCase()}`;
  }

  init() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;

      // Don't trigger shortcuts when typing in inputs (except Escape and Ctrl+S)
      const isInput = e.target.tagName === 'INPUT' ||
                      e.target.tagName === 'TEXTAREA' ||
                      e.target.isContentEditable;

      if (isInput && e.key !== 'Escape' && !(e[this.modKey] && e.key.toLowerCase() === 's')) {
        return;
      }

      const id = this.getShortcutId(
        e.key,
        e[this.modKey],
        e.shiftKey,
        e.altKey
      );

      const shortcut = this.shortcuts.get(id);
      if (shortcut) {
        e.preventDefault();
        shortcut.callback(e);
      }
    });
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  getShortcutLabel(key, ctrl, shift, alt) {
    const parts = [];
    if (ctrl) parts.push(this.modKeyName);
    if (shift) parts.push('Shift');
    if (alt) parts.push('Alt');
    parts.push(key.toUpperCase());
    return parts.join('+');
  }

  getAllShortcuts() {
    const list = [];
    this.shortcuts.forEach((shortcut, id) => {
      list.push({
        id,
        label: this.getShortcutLabel(
          shortcut.key,
          shortcut.ctrl,
          shortcut.shift,
          shortcut.alt
        ),
        description: shortcut.description
      });
    });
    return list;
  }

  showHelp() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) {
      const list = this.getAllShortcuts();
      const tbody = modal.querySelector('#shortcuts-list');
      if (tbody) {
        tbody.innerHTML = list.map(s => {
          return `
            <tr>
              <td><kbd>${s.label}</kbd></td>
              <td>${s.description}</td>
            </tr>
          `;
        }).join('');
      }
      modal.showModal();
    }
  }
}

export default KeyboardShortcuts;

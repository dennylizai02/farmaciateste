import { getElement, createElement } from './domUtils.js';

export function showNotification(msg, type = 'error') {
  const container = getElement('toast-container');
  if (!container) return;

  const toast = createElement('div', `toast toast-${type}`);
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

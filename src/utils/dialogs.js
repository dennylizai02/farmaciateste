import { getElement, setText } from './domUtils.js';

let activeConfirmResolver = null;

export function closeConfirmModal() {
  const overlay = getElement('confirm-overlay');
  if (overlay) overlay.style.display = 'none';
  if (typeof activeConfirmResolver === 'function') {
    activeConfirmResolver(false);
    activeConfirmResolver = null;
  }
}

export function showConfirm(msg, title = 'Confirmar Operação') {
  return new Promise((resolve) => {
    const overlay = getElement('confirm-overlay');
    if (!overlay) {
      resolve(confirm(msg));
      return;
    }

    activeConfirmResolver = resolve;
    setText('confirm-title', title);
    setText('confirm-msg', msg);
    overlay.style.display = 'flex';

    const okBtn = getElement('confirm-ok-btn');
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newOkBtn.onclick = () => {
      if (overlay) overlay.style.display = 'none';
      if (typeof activeConfirmResolver === 'function') {
        activeConfirmResolver(true);
        activeConfirmResolver = null;
      }
    };

    window.closeConfirmModal = closeConfirmModal;
  });
}

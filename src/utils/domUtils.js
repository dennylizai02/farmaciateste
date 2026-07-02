export function getElement(id) {
  return document.getElementById(id);
}

export function queryAll(selector) {
  return Array.from(document.querySelectorAll(selector));
}

export function setText(id, text) {
  const el = getElement(id);
  if (el) el.textContent = text;
}

export function createElement(tag, className, innerHTML) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML !== undefined) el.innerHTML = innerHTML;
  return el;
}

export function escapeHTML(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

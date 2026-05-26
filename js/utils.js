// js/utils.js
export function shuffle(array) {
  if (!Array.isArray(array)) return array;
  // Fisher-Yates shuffle (in-place)
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

export function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = deepClone(obj[k]);
  }
  return out;
}

export function uid(prefix = '') {
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function safeParseJSON(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

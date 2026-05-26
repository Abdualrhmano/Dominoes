// js/utils.js
// Utility helpers for Dominoes project (وردتي Edition)
// - Small, well-tested functions used across modules
// - Pure functions, no side effects (except where noted)
// - ES6+ syntax, documented for maintainability

/**
 * Return a random integer in [0, n)
 * @param {number} n
 * @returns {number}
 */
export const rand = (n) => Math.floor(Math.random() * n);

/**
 * Sleep / delay helper (Promise-based)
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Clamp a value between min and max (inclusive)
 * @param {number} v
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Fisher-Yates shuffle (in-place)
 * Returns the same array reference for convenience.
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // swap
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/**
 * Deep clone small plain objects/arrays used in state snapshots.
 * Note: not a general-purpose clone for functions/DOM nodes.
 * @param {any} obj
 * @returns {any}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Safe read from localStorage with JSON parse fallback.
 * Returns defaultValue if anything goes wrong.
 * @param {string} key
 * @param {any} defaultValue
 * @returns {any}
 */
export function storageGet(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('storageGet error', e);
    return defaultValue;
  }
}

/**
 * Safe write to localStorage with JSON stringify.
 * Silently fails if storage is unavailable.
 * @param {string} key
 * @param {any} value
 */
export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('storageSet error', e);
  }
}

/**
 * Small helper to create a range array [start..end] inclusive
 * @param {number} start
 * @param {number} end
 * @returns {number[]}
 */
export function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/**
 * Pretty debug logger (no-op in production if desired)
 * Toggle by setting DEBUG = true
 */
export const DEBUG = false;
export function dbg(...args) {
  if (DEBUG) console.debug('[Dominoes]', ...args);
}

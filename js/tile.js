// js/tile.js
// Tile model for Dominoes (وردتي Edition)
// - Lightweight class representing a domino tile
// - Immutable-ish API: methods return new Tile instances when flipping/cloning
// - Used by GameEngine and UI modules
//
// Usage:
//   import Tile from './tile.js';
//   const t = new Tile(6,6);
//   t.sum(); // 12
//   t.isDouble(); // true
//   const f = t.flipped(); // new Tile(6,6) (same for doubles)
//   const c = t.clone(); // new Tile(6,6)

export default class Tile {
  /**
   * Create a Tile
   * @param {number} a - left pip count (0..6)
   * @param {number} b - right pip count (0..6)
   */
  constructor(a, b) {
    // Validate inputs (defensive)
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      throw new TypeError('Tile pip values must be integers');
    }
    if (a < 0 || a > 6 || b < 0 || b > 6) {
      throw new RangeError('Tile pip values must be between 0 and 6');
    }

    this.a = a;
    this.b = b;
    // id is stable string used across modules and for learning keys
    this.id = `${a}-${b}`;
    // freeze to discourage accidental mutation
    Object.freeze(this);
  }

  /**
   * Sum of pips
   * @returns {number}
   */
  sum() {
    return this.a + this.b;
  }

  /**
   * Is this tile a double (a === b)
   * @returns {boolean}
   */
  isDouble() {
    return this.a === this.b;
  }

  /**
   * Return a shallow clone (new Tile instance)
   * @returns {Tile}
   */
  clone() {
    return new Tile(this.a, this.b);
  }

  /**
   * Return a flipped tile (a and b swapped)
   * @returns {Tile}
   */
  flipped() {
    return new Tile(this.b, this.a);
  }

  /**
   * Serialize to plain object (useful for snapshots & storage)
   * @returns {{a:number,b:number,id:string}}
   */
  toJSON() {
    return { a: this.a, b: this.b, id: this.id };
  }

  /**
   * Create Tile from plain object {a,b} or {a,b,id}
   * @param {{a:number,b:number}} obj
   * @returns {Tile}
   */
  static from(obj) {
    if (!obj || typeof obj.a !== 'number' || typeof obj.b !== 'number') {
      throw new TypeError('Invalid tile object');
    }
    return new Tile(obj.a, obj.b);
  }
}

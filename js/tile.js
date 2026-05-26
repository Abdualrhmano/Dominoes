// js/tile.js
export default class Tile {
  constructor(a, b) {
    this.a = Number(a);
    this.b = Number(b);
    this.id = `${Math.min(this.a, this.b)}-${Math.max(this.a, this.b)}`;
  }

  isDouble() {
    return this.a === this.b;
  }

  sum() {
    return this.a + this.b;
  }

  clone() {
    const t = new Tile(this.a, this.b);
    // preserve original orientation if needed by caller
    t.a = this.a;
    t.b = this.b;
    t.id = this.id;
    return t;
  }

  // Ensure tile can be serialized/deserialized safely
  toJSON() {
    return { a: this.a, b: this.b, id: this.id };
  }

  static fromJSON(obj) {
    if (!obj) return null;
    const t = new Tile(obj.a, obj.b);
    t.id = obj.id || `${Math.min(t.a, t.b)}-${Math.max(t.a, t.b)}`;
    return t;
  }
}

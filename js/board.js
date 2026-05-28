// js/board.js
// 2D board renderer and placement engine.
// Exports default Board class that manages absolute positioning of tiles on a 2D plane.
// Board computes x/y positions for each logical train entry and handles spinner/double orientation.

export default class Board {
  constructor(opts = {}){
    this.container = opts.container;
    this.tileW = opts.tileWidth || 96;
    this.tileH = opts.tileHeight || 56;
    this.gap = opts.gap || 12;
    this.onPlaceRequest = opts.onPlaceRequest || function(){ return { success:false }; };
    this.grid = []; // logical grid occupancy map
    this.origin = { x: Math.floor((this.container.clientWidth)/2), y: Math.floor((this.container.clientHeight)/2) };
    this.placedElements = new Map(); // map tile.id -> DOM element
    this._init();
  }

  _init(){
    this.container.style.position = 'relative';
    this.container.innerHTML = ''; // board will render tiles absolutely
    // responsive origin recalculation
    window.addEventListener('resize', ()=> {
      this.origin = { x: Math.floor((this.container.clientWidth)/2), y: Math.floor((this.container.clientHeight)/2) };
      // reflow existing tiles
      if(this.lastState) this.updateFromState(this.lastState);
    });
  }

  // Convert logical train to 2D coordinates.
  // Simple snake algorithm: start at origin, place tiles along direction; when near edge, turn clockwise.
  computeLayout(train){
    const layout = [];
    if(!train || train.length === 0) return layout;
    // Start at center
    let x = this.origin.x;
    let y = this.origin.y;
    // initial direction to the right
    let dir = { x: 1, y: 0 };
    const stepX = this.tileW + this.gap;
    const stepY = this.tileH + this.gap;
    // We'll place first tile at origin
    for(let i=0;i<train.length;i++){
      const t = train[i];
      // If tile is double, rotate perpendicular to dir
      const isDouble = t.isDouble;
      const rot = isDouble ? 0 : (dir.x !== 0 ? 90 : 0); // 90 for horizontal non-double
      layout.push({ id: t.id, a:t.a, b:t.b, owner:t.owner, isDouble, rot, x, y, dir:{...dir}, index:i, spinner: !!t.spinner });
      // compute next position
      // attempt to step in same direction
      let nx = x + dir.x * stepX;
      let ny = y + dir.y * stepY;
      // if next would be outside container bounds, turn clockwise (right -> down -> left -> up)
      const padding = 40;
      const withinX = nx > padding && nx < (this.container.clientWidth - padding);
      const withinY = ny > padding && ny < (this.container.clientHeight - padding);
      if(!withinX || !withinY){
        // rotate clockwise
        const newDir = { x: dir.y, y: -dir.x };
        dir = newDir;
        nx = x + dir.x * stepX;
        ny = y + dir.y * stepY;
      }
      x = nx; y = ny;
    }
    return layout;
  }

  // Render the train tiles on board
  updateFromState(state){
    this.lastState = state;
    // compute layout
    const layout = this.computeLayout(state.train);
    // remove elements not in layout
    const ids = new Set(layout.map(l=>l.id));
    for(const [id,el] of this.placedElements.entries()){
      if(!ids.has(id)){
        el.remove();
        this.placedElements.delete(id);
      }
    }
    // create/update elements
    layout.forEach(item=>{
      let el = this.placedElements.get(item.id);
      if(!el){
        el = this._createTileElement(item);
        this.container.appendChild(el);
        this.placedElements.set(item.id, el);
      }
      // animate to new position
      this._moveTileElement(el, item.x - this.tileW/2, item.y - this.tileH/2, item.rot, item.isDouble);
    });
  }

  _createTileElement(item){
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.id = item.id;
    // halves
    const left = document.createElement('div'); left.className = 'half pips-'+item.a;
    for(let i=0;i<this._pipCount(item.a);i++){ const p=document.createElement('div'); p.className='pip'; left.appendChild(p); }
    const div = document.createElement('div'); div.className='divider';
    const stud = document.createElement('div'); stud.className='stud'; div.appendChild(stud);
    const right = document.createElement('div'); right.className = 'half pips-'+item.b;
    for(let i=0;i<this._pipCount(item.b);i++){ const p=document.createElement('div'); p.className='pip'; right.appendChild(p); }
    el.appendChild(left); el.appendChild(div); el.appendChild(right);
    el.style.position = 'absolute';
    el.style.left = `${this.origin.x - this.tileW/2}px`;
    el.style.top = `${this.origin.y - this.tileH/2}px`;
    el.style.width = `${this.tileW}px`;
    el.style.height = `${this.tileH}px`;
    el.style.transition = 'transform 260ms cubic-bezier(.2,.9,.3,1), left 260ms linear, top 260ms linear';
    return el;
  }

  _moveTileElement(el, left, top, rot, isDouble){
    // apply transform and position
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    // rotation: doubles are vertical (0deg), non-doubles horizontal (90deg) depending on rot param
    const r = isDouble ? 0 : 90;
    el.style.transform = `rotate(${r}deg) translateZ(0)`;
  }

  _pipCount(n){ return n===0 ? 1 : n; }

  // Provide a helper to compute drop side based on pointer coords
  computeDropSide(clientX, clientY){
    const rect = this.container.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    if(clientX < cx - rect.width*0.15) return 'left';
    if(clientX > cx + rect.width*0.15) return 'right';
    return 'middle';
  }

  // Called by UI when user attempts to place tile at coords
  requestPlace(handIndex, side, clientX, clientY){
    const coords = { x: clientX, y: clientY };
    return this.onPlaceRequest(handIndex, side, coords);
  }
}

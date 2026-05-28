// js/ui.js
// DOM manipulation, hand rendering, drag & drop logic, modals, micro-interactions.
// Exports default UI class.

export default class UI {
  constructor(opts = {}){
    this.engine = opts.engine;
    this.board = opts.board;
    this.audio = opts.audio;
    this.elements = opts.elements || {};
    this.playerHandEl = this.elements.playerHand;
    this.boneyardCountEl = this.elements.boneyardCount;
    this.boneStackEl = this.elements.boneStack;
    this.roundNumberEl = this.elements.roundNumber;
    this.playerScoreEl = this.elements.playerScore;
    this.aiScoreEl = this.elements.aiScore;
    this.turnIndicatorEl = this.elements.turnIndicator;
    this.statusTextEl = this.elements.statusText;
    this.modalRoot = this.elements.modalRoot;
    this.confettiCanvas = this.elements.confettiCanvas;
    this.firstMoveTooltip = this.elements.firstMoveTooltip;

    this._bindEngineEvents();
    this._bindBoardUI();
  }

  _bindEngineEvents(){
    this.engine.on('state', (s)=> this.updateFromState(s));
    this.engine.on('tilePlaced', (info)=> {
      this.flashStatus(`${info.by === 'player' ? 'You' : 'AI'} played ${info.tile.a}-${info.tile.b}`);
      this.board.updateFromState(this.engine.getState());
    });
    this.engine.on('draw', ()=> {
      this.updateFromState(this.engine.getState());
    });
    this.engine.on('victory', (winner)=> {
      this.showVictory(winner);
    });
  }

  _bindBoardUI(){
    // attach click on boneyard
    if(this.boneStackEl){
      this.boneStackEl.addEventListener('click', ()=>{
        if(this.engine.canPlayerDraw()){
          const tile = this.engine.playerDrawTile();
          if(tile){
            this.flashStatus('You drew a tile');
            this.audio.play('slide', { gain: 0.08 });
          } else {
            this.flashStatus('Boneyard empty');
            this.audio.play('error', { gain: 0.06 });
          }
        }
      });
    }

    // attach pointer events for hand (delegated)
    this.playerHandEl.addEventListener('pointerdown', (e)=>{
      const tileEl = e.target.closest('.domino, .tile, .hand-tile');
      if(!tileEl) return;
      // start drag handled in bindHandInteractions
    });
  }

  // Called by engine state updates
  updateFromState(state){
    this._renderHand(state.hands.player);
    this._updateBoneyard(state.boneyard.length);
    this._updateScores(state.scores);
    this._updateRound(state.round);
    this._updateTurn(state.currentTurn);
    // board update handled by board module (main wires it too)
  }

  _renderHand(hand){
    // clear
    this.playerHandEl.innerHTML = '';
    hand.forEach((tile, idx)=>{
      const el = document.createElement('div');
      el.className = 'domino hand-tile';
      el.dataset.index = idx;
      el.dataset.tileId = tile.id;
      el.style.width = `${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-w')) || 96}px`;
      el.style.height = `${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-h')) || 56}px`;
      // build halves
      const left = document.createElement('div'); left.className = 'half pips-'+tile.a;
      for(let i=0;i<this._pipCount(tile.a);i++){ const p=document.createElement('div'); p.className='pip'; left.appendChild(p); }
      const div = document.createElement('div'); div.className = 'divider';
      const stud = document.createElement('div'); stud.className='stud'; div.appendChild(stud);
      const right = document.createElement('div'); right.className = 'half pips-'+tile.b;
      for(let i=0;i<this._pipCount(tile.b);i++){ const p=document.createElement('div'); p.className='pip'; right.appendChild(p); }
      el.appendChild(left); el.appendChild(div); el.appendChild(right);

      // attach interactions: hover tilt, pointer drag
      el.addEventListener('pointermove', (ev)=> this._onTilePointerMove(ev, el));
      el.addEventListener('pointerleave', ()=> this._onTilePointerLeave(el));
      el.addEventListener('pointerdown', (ev)=> this._onTilePointerDown(ev, el, idx));
      el.addEventListener('click', (ev)=> this._onTileClick(ev, el, idx));

      this.playerHandEl.appendChild(el);
    });
  }

  _pipCount(n){ return n===0 ? 1 : n; }

  _updateBoneyard(count){
    if(this.boneyardCountEl) this.boneyardCountEl.textContent = count;
  }

  _updateScores(scores){
    if(this.playerScoreEl) this.playerScoreEl.textContent = scores.player;
    if(this.aiScoreEl) this.aiScoreEl.textContent = scores.ai;
  }

  _updateRound(r){
    if(this.roundNumberEl) this.roundNumberEl.textContent = r;
  }

  _updateTurn(turn){
    if(this.turnIndicatorEl) this.turnIndicatorEl.textContent = turn === 'player' ? 'Your turn' : 'AI turn';
    if(this.statusTextEl) this.statusTextEl.textContent = turn === 'player' ? 'Make a move' : 'AI is thinking';
  }

  flashStatus(msg){
    if(this.statusTextEl) this.statusTextEl.textContent = msg;
    setTimeout(()=> {
      const s = this.engine.getState();
      this._updateTurn(s.currentTurn);
    }, 1400);
  }

  showVictory(winner){
    // simple modal
    this.modalRoot.innerHTML = '';
    const modal = document.createElement('div'); modal.className = 'modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = 2000;
    const card = document.createElement('div'); card.className = 'modal-card';
    card.innerHTML = `<h2>${winner === 'player' ? 'Champion — You!' : 'Champion — AI'}</h2>
      <p style="color:var(--muted)">Match finished — final score</p>
      <div style="font-size:20px; font-weight:900; margin:8px 0; color:var(--accent);">You: ${this.engine.scores.player} • AI: ${this.engine.scores.ai}</div>
      <div style="display:flex; gap:12px; justify-content:center; margin-top:12px;">
        <button id="play-again" class="btn">Play Again</button>
        <button id="close-match" class="btn">Close</button>
      </div>`;
    modal.appendChild(card);
    this.modalRoot.appendChild(modal);
    this.modalRoot.style.display = 'block';
    this.modalRoot.setAttribute('aria-hidden','false');

    card.querySelector('#play-again').addEventListener('click', ()=>{
      this.modalRoot.style.display = 'none';
      this.modalRoot.innerHTML = '';
      this.engine.startRound(true);
    });
    card.querySelector('#close-match').addEventListener('click', ()=>{
      this.modalRoot.style.display = 'none';
      this.modalRoot.innerHTML = '';
    });
  }

  // Micro-interactions: tilt on pointer move
  _onTilePointerMove(e, el){
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const dx = (e.clientX - cx) / rect.width;
    const dy = (e.clientY - cy) / rect.height;
    const rx = dy * 6;
    const ry = -dx * 8;
    el.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(8px)`;
  }
  _onTilePointerLeave(el){
    el.style.transform = `perspective(800px) rotateX(2deg) rotateY(-1deg) translateZ(0)`;
  }

  // Drag & drop with inertia and snap-to-grid
  _onTilePointerDown(e, el, handIndex){
    if(this.engine.currentTurn !== 'player' || this.engine.animLock) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    const startX = e.clientX;
    const startY = e.clientY;
    const origRect = el.getBoundingClientRect();
    const offsetX = startX - origRect.left;
    const offsetY = startY - origRect.top;

    const move = (ev)=>{
      el.style.position = 'fixed';
      el.style.left = `${ev.clientX - offsetX}px`;
      el.style.top = `${ev.clientY - offsetY}px`;
      // highlight drop side on board
      const side = this.board.computeDropSide(ev.clientX, ev.clientY);
      // visual hint
      const hintLeft = document.getElementById('hint-left');
      const hintRight = document.getElementById('hint-right');
      if(hintLeft && hintRight){
        hintLeft.classList.remove('show'); hintRight.classList.remove('show');
        if(side === 'left') hintLeft.classList.add('show');
        if(side === 'right') hintRight.classList.add('show');
      }
    };

    const up = (ev)=>{
      el.releasePointerCapture(e.pointerId);
      el.classList.remove('dragging');
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      // compute drop side and request placement
      const side = this.board.computeDropSide(ev.clientX, ev.clientY);
      const result = this.board.requestPlace(handIndex, side, ev.clientX, ev.clientY);
      if(result && result.success){
        // animate snap: board will re-render; remove element from hand UI
        this.audio.play('clack', { gain: 0.12 });
      } else {
        // snap back with inertia
        el.style.transition = 'left 260ms cubic-bezier(.2,.9,.3,1), top 260ms cubic-bezier(.2,.9,.3,1), transform 260ms';
        el.style.left = '';
        el.style.top = '';
        setTimeout(()=> { el.style.transition = ''; }, 300);
        this.audio.play('error', { gain: 0.06 });
      }
      // clear hints
      const hintLeft = document.getElementById('hint-left');
      const hintRight = document.getElementById('hint-right');
      if(hintLeft) hintLeft.classList.remove('show');
      if(hintRight) hintRight.classList.remove('show');
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once:true });
  }

  _onTileClick(e, el, handIndex){
    // simple click to play: compute drop side from center of board
    const rect = this.board.container.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const side = (e.clientX < cx) ? 'left' : 'right';
    const result = this.board.requestPlace(handIndex, side, e.clientX, e.clientY);
    if(result && result.success){
      this.audio.play('clack', { gain: 0.12 });
    } else {
      this.flashStatus('Tile not playable');
      this.audio.play('error', { gain: 0.06 });
    }
  }

}

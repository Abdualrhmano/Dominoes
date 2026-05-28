// js/engine.js
// Pure game logic, state machine, scoring, and strict domino rules.
// Exports default Engine class with event emitter interface.

export default class Engine {
  constructor(opts = {}) {
    this.targetScore = opts.targetScore || 101;
    this._listeners = new Map();
    this._initState();
  }

  _initState(){
    this.deck = [];
    this.boneyard = [];
    this.hands = { player: [], ai: [] };
    this.train = []; // array of placed tiles with metadata {a,b,id,owner,rot,x,y,dir,isDouble,spinnerGroup}
    this.currentTurn = null;
    this.round = 1;
    this.scores = { player:0, ai:0 };
    this.roundStarter = null;
    this.roundWinner = null;
    this.animLock = false;
    this.highestDoubleTile = null;
    this.highestDoubleOwner = null;
    this.roundFirstMove = true;
  }

  // Simple event emitter
  on(evt, fn){ if(!this._listeners.has(evt)) this._listeners.set(evt,[]); this._listeners.get(evt).push(fn); }
  off(evt, fn){ if(!this._listeners.has(evt)) return; this._listeners.set(evt, this._listeners.get(evt).filter(f=>f!==fn)); }
  emit(evt, payload){ (this._listeners.get(evt) || []).forEach(f=>{ try{ f(payload); }catch(e){console.error(e);} }); }

  // Build standard double-six deck
  buildDeck(){
    const arr=[];
    for(let i=0;i<=6;i++) for(let j=i;j<=6;j++) arr.push({a:i,b:j,id:`${i}-${j}`});
    return arr;
  }

  shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  }

  initMatch(){
    this.scores = { player:0, ai:0 };
    this.round = 1;
    this.emit('state', this.getState());
    this.startRound(true);
  }

  resetMatch(){
    this.initMatch();
  }

  startRound(isInitial=false, prevWinner=null){
    this.deck = this.buildDeck();
    this.shuffle(this.deck);
    this.boneyard = [...this.deck];
    this.train = [];
    this.hands = { player: [], ai: [] };
    // deal 7 each
    for(let i=0;i<7;i++){
      this.hands.player.push(this.boneyard.pop());
      this.hands.ai.push(this.boneyard.pop());
    }
    this.updateHighestDouble();
    this.roundFirstMove = true;
    if(isInitial) this.roundStarter = this.determineStarter();
    else if(prevWinner) this.roundStarter = prevWinner;
    this.currentTurn = this.roundStarter;
    this.emit('roundStart', { round: this.round, starter: this.roundStarter, highestDouble: this.highestDoubleTile });
    this.emit('state', this.getState());
  }

  determineStarter(){
    const all = [...this.hands.player.map(t=>({...t,owner:'player'})), ...this.hands.ai.map(t=>({...t,owner:'ai'}))];
    const doubles = all.filter(t=>t.a===t.b);
    if(doubles.length){
      doubles.sort((x,y)=> y.a - x.a);
      return doubles[0].owner;
    }
    all.sort((x,y)=> (y.a+y.b) - (x.a+x.b));
    return all[0].owner;
  }

  updateHighestDouble(){
    const all = [...this.hands.player.map(t=>({...t,owner:'player'})), ...this.hands.ai.map(t=>({...t,owner:'ai'}))];
    const doubles = all.filter(t=>t.a===t.b);
    if(doubles.length===0){ this.highestDoubleTile = null; this.highestDoubleOwner = null; return; }
    doubles.sort((x,y)=> y.a - x.a);
    this.highestDoubleTile = { a: doubles[0].a, b: doubles[0].b, id: doubles[0].id };
    this.highestDoubleOwner = doubles[0].owner;
  }

  // Public API for UI/Board to attempt a placement from player
  attemptPlaceFromPlayer(handIndex, side, coords){
    if(this.currentTurn !== 'player' || this.animLock) return { success:false, reason:'not-your-turn' };
    const tile = this.hands.player[handIndex];
    if(!tile) return { success:false, reason:'no-tile' };
    if(!this.isTilePlayable(tile, 'player')) return { success:false, reason:'not-playable' };
    // Validate placement in 2D board: coords and side are advisory; engine will accept and compute placement metadata
    const placement = this._placeTile(tile, 'player', side, coords);
    if(placement){
      // remove from hand
      this.hands.player.splice(handIndex,1);
      this.roundFirstMove = false;
      this.emit('tilePlaced', { tile: placement, by:'player' });
      this._afterPlacement('player');
      return { success:true, tile: placement };
    }
    return { success:false, reason:'invalid-placement' };
  }

  // Internal placement: compute rot, isDouble, owner, spinner handling
  _placeTile(tile, owner, side='right', coords=null){
    const placed = { ...tile, owner, isDouble: tile.a===tile.b, rot: 0, id: tile.id };
    // Determine orientation and coordinates based on current train and board rules.
    // For modularity, we store minimal info here; board.js will compute exact x/y from train index and direction.
    // We maintain logical chain: if train empty -> place as first tile (or spinner if double)
    if(this.train.length === 0){
      placed.rot = placed.isDouble ? 0 : 90; // convention: non-double horizontal (90), double vertical (0)
      placed.dir = { x: 1, y: 0 }; // initial direction to the right
      placed.index = 0;
      placed.spinner = placed.isDouble ? true : false;
      this.train.push(placed);
      return placed;
    }

    // If spinner exists, allow branching: find spinner index
    const spinnerIndex = this.train.findIndex(t=>t.isDouble && t.spinner);
    if(spinnerIndex >= 0){
      // If placing on spinner, we allow placement on any exposed side.
      // For simplicity, append to end or unshift depending on side param.
      if(side === 'left'){
        placed.rot = placed.isDouble ? 0 : 90;
        placed.dir = { x: -1, y: 0 };
        placed.index = -1; // left end
        this.train.unshift(placed);
      } else {
        placed.rot = placed.isDouble ? 0 : 90;
        placed.dir = { x: 1, y: 0 };
        placed.index = this.train.length;
        this.train.push(placed);
      }
      return placed;
    }

    // Normal chain: match left or right end
    const leftEnd = this.train[0];
    const rightEnd = this.train[this.train.length-1];
    const leftVal = leftEnd.a;
    const rightVal = rightEnd.b;

    // Determine which side the tile matches
    const canLeft = (tile.a === leftVal || tile.b === leftVal);
    const canRight = (tile.a === rightVal || tile.b === rightVal);

    // If both possible, prefer side param
    let targetSide = null;
    if(canLeft && !canRight) targetSide = 'left';
    else if(canRight && !canLeft) targetSide = 'right';
    else if(canLeft && canRight) targetSide = side || 'right';
    else return null; // not playable

    // For doubles: place perpendicular to chain (spinner behavior if first double)
    if(targetSide === 'left'){
      // orient to connect to leftEnd
      if(tile.a === leftVal) { /* tile.a connects to left */ }
      else { /* swap */ }
      placed.rot = placed.isDouble ? 0 : 90;
      placed.dir = { x: -1, y: 0 };
      this.train.unshift(placed);
    } else {
      placed.rot = placed.isDouble ? 0 : 90;
      placed.dir = { x: 1, y: 0 };
      this.train.push(placed);
    }

    // If placed is a double and train length > 1 and no spinner yet, mark spinner
    if(placed.isDouble && !this.train.some(t=>t.spinner)){
      placed.spinner = true;
    }

    return placed;
  }

  _afterPlacement(who){
    // scoring and round end checks
    this.emit('state', this.getState());
    // check for empty hand
    if(this.hands.player.length === 0 || this.hands.ai.length === 0){
      const winner = this.hands.player.length === 0 ? 'player' : 'ai';
      this.roundWinner = winner;
      const loser = winner === 'player' ? 'ai' : 'player';
      const points = this.sumPips(this.hands[loser]);
      this.scores[winner] += points;
      this.emit('roundEnd', { winner, points });
      this.emit('victory', winner);
      return;
    }

    // check blocked game
    const playerPlayable = this.getPlayableTiles(this.hands.player).length > 0;
    const aiPlayable = this.getPlayableTiles(this.hands.ai).length > 0;
    if(!playerPlayable && !aiPlayable && this.boneyard.length === 0){
      const playerPips = this.sumPips(this.hands.player);
      const aiPips = this.sumPips(this.hands.ai);
      let winner = null, points = 0;
      if(playerPips < aiPips){ winner = 'player'; points = aiPips - playerPips; }
      else if(aiPips < playerPips){ winner = 'ai'; points = playerPips - aiPips; }
      if(winner){
        this.scores[winner] += points;
        this.roundWinner = winner;
        this.emit('roundEnd', { winner, points, reason:'blocked' });
        this.emit('victory', winner);
        return;
      } else {
        this.emit('roundEnd', { winner:null, points:0, reason:'tie' });
        return;
      }
    }

    // switch turn
    this.currentTurn = (who === 'player') ? 'ai' : 'player';
    this.emit('state', this.getState());
    if(this.currentTurn === 'ai') setTimeout(()=> this._aiPlay(), 500);
  }

  // AI logic preserved from original: draw if no playable, else choose highest scoring tile
  _aiPlay(){
    if(this.animLock) return;
    // if first move and AI owns highest double, force play it
    if(this.train.length === 0 && this.roundFirstMove && this.highestDoubleTile && this.highestDoubleOwner === 'ai'){
      const idx = this.hands.ai.findIndex(t=>t.id === this.highestDoubleTile.id);
      if(idx >= 0){
        const tile = this.hands.ai[idx];
        const placement = this._placeTile(tile, 'ai', 'right', null);
        if(placement){
          this.hands.ai.splice(idx,1);
          this.roundFirstMove = false;
          this.emit('tilePlaced', { tile: placement, by:'ai' });
          this._afterPlacement('ai');
          return;
        }
      }
    }

    const playable = this.getPlayableTiles(this.hands.ai);
    if(playable.length === 0){
      if(this.boneyard.length > 0){
        this.draw('ai');
        setTimeout(()=> this._aiPlay(), 400);
        return;
      } else {
        this.currentTurn = 'player';
        this.emit('state', this.getState());
        this.emit('pass', { who:'ai' });
        return;
      }
    }

    playable.sort((x,y)=>{
      const xScore = (x.a===x.b?100:0) + (x.a+x.b);
      const yScore = (y.a===y.b?100:0) + (y.a+y.b);
      return yScore - xScore;
    });

    const chosen = playable[0];
    const idx = this.hands.ai.findIndex(t=>t.id===chosen.id);
    const placement = this._placeTile(chosen, 'ai', 'right', null);
    if(placement){
      this.hands.ai.splice(idx,1);
      this.emit('tilePlaced', { tile: placement, by:'ai' });
      this._afterPlacement('ai');
    }
  }

  // Draw from boneyard
  draw(who){
    if(this.boneyard.length === 0) return null;
    const tile = this.boneyard.pop();
    if(who === 'player') this.hands.player.push(tile);
    else this.hands.ai.push(tile);
    this.emit('draw', { who, tile });
    this.emit('state', this.getState());
    return tile;
  }

  playerDraw(){
    return this.draw('player');
  }

  canPlayerDraw(){
    return this.boneyard.length > 0 && this.currentTurn === 'player' && !this.animLock;
  }

  // Utility: playable check (respects highest-double first-move rule)
  isTilePlayable(tile, who){
    if(this.train.length === 0 && this.roundFirstMove && this.highestDoubleTile){
      if(this.highestDoubleOwner === who) return tile.id === this.highestDoubleTile.id;
      return false;
    }
    if(this.train.length === 0) return true;
    const leftEnd = this.train[0].a;
    const rightEnd = this.train[this.train.length-1].b;
    return tile.a === leftEnd || tile.b === leftEnd || tile.a === rightEnd || tile.b === rightEnd;
  }

  getPlayableTiles(hand){
    return hand.filter(t => this.isTilePlayable(t, hand === this.hands.player ? 'player' : 'ai'));
  }

  sumPips(hand){ return hand.reduce((s,t)=> s + t.a + t.b, 0); }

  // Expose state snapshot
  getState(){
    return {
      round: this.round,
      scores: {...this.scores},
      hands: { player: [...this.hands.player], ai: [...this.hands.ai] },
      boneyard: [...this.boneyard],
      train: [...this.train],
      currentTurn: this.currentTurn,
      highestDoubleTile: this.highestDoubleTile,
      highestDoubleOwner: this.highestDoubleOwner,
      animLock: this.animLock,
      roundFirstMove: this.roundFirstMove
    };
  }

  // External API helpers used by UI/main
  attemptPlaceFromAI(index, side){ /* optional */ }
  playerDrawTile(){ return this.playerDraw(); }
}

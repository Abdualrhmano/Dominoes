let model = null;

const rand = (n) => Math.floor(Math.random() * n);
const sumPips = (t) => (t.a + t.b);
const isDouble = (t) => t.a === t.b;

function playableTiles(hand, train) {
  if (!train || train.length === 0) return hand.slice();
  const left = train[0].a;
  const right = train[train.length - 1].b;
  return hand.filter(t => t.a === left || t.b === left || t.a === right || t.b === right);
}

function chooseSide(tile, train, playerHand = []) {
  if (!train || train.length === 0) return 'right';
  const left = train[0].a;
  const right = train[train.length - 1].b;
  const canLeft = tile.a === left || tile.b === left;
  const canRight = tile.a === right || tile.b === right;
  if (canLeft && !canRight) return 'left';
  if (canRight && !canLeft) return 'right';
  if (model && model.endPreference) {
    const leftEndAfter = (tile.a === left) ? tile.b : tile.a;
    const rightEndAfter = (tile.a === right) ? tile.b : tile.a;
    const leftScore = model.endPreference[leftEndAfter] || 1.0;
    const rightScore = model.endPreference[rightEndAfter] || 1.0;
    return leftScore <= rightScore ? 'left' : 'right';
  }
  const leftEndAfter = (tile.a === left) ? tile.b : tile.a;
  const rightEndAfter = (tile.a === right) ? tile.b : tile.a;
  return leftEndAfter <= rightEndAfter ? 'left' : 'right';
}

function scoreTile(tile) {
  let score = sumPips(tile);
  if (isDouble(tile)) score += 50;
  if (model && model.tileWeights && typeof model.tileWeights[tile.id] === 'number') {
    score += model.tileWeights[tile.id] * 8;
  }
  return score;
}

function selectMove(state, mode = 'hard') {
  const aiHand = (state.hands && state.hands.ai) ? state.hands.ai : [];
  const train = state.train || [];
  const playable = playableTiles(aiHand, train);
  if (!playable.length) return null;
  if (mode === 'easy') {
    const idx = rand(playable.length);
    const tile = playable[idx];
    const side = chooseSide(tile, train, state.hands.player || []);
    return { tile, side };
  }
  const scored = playable.map(t => ({ tile: t, score: scoreTile(t) }));
  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const threshold = 6;
  const close = scored.filter(s => (bestScore - s.score) < threshold).map(s => s.tile);
  const chosen = close[rand(close.length)];
  const side = chooseSide(chosen, train, state.hands.player || []);
  return { tile: chosen, side };
}

self.onmessage = function (ev) {
  const msg = ev.data || {};
  const { type, requestId } = msg;
  try {
    if (type === 'init') {
      model = msg.model || null;
      self.postMessage({ type: 'initAck', ok: true, requestId });
      return;
    }
    if (type === 'move') {
      const state = msg.state || {};
      const mode = msg.mode || 'hard';
      const move = selectMove(state, mode);
      if (move) {
        const tile = move.tile;
        self.postMessage({ type: 'moveResult', move: { tile: { a: tile.a, b: tile.b, id: tile.id }, side: move.side }, requestId });
      } else {
        self.postMessage({ type: 'moveResult', move: null, requestId });
      }
      return;
    }
    if (type === 'updateModel') {
      model = msg.model || model;
      self.postMessage({ type: 'updateAck', ok: true, requestId });
      return;
    }
    self.postMessage({ type: 'error', message: 'Unknown message type', requestId });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err), requestId });
  }
};

self.postMessage({ type: 'ready' });

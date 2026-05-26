// worker/ai-worker.js
// Web Worker for "وردتي" AI (optional performance offload)
// - Listens for messages from main thread and responds with move decisions.
// - Designed to accept a lightweight model snapshot (tileWeights, endPreference) to apply learned preferences.
// - Message protocol:
//     postMessage({ type: 'init', model: <modelSnapshot> })         // optional: provide learned model
//     postMessage({ type: 'move', state: <stateSnapshot>, mode: 'easy'|'hard'|'learned' })
//   Worker responds with:
//     postMessage({ type: 'moveResult', move: { tile: {a,b,id}, side } | null, requestId })
// - Stateless by default; stores provided model in-memory for faster decisions.
// - No DOM access; pure computation. Keep logic lightweight to avoid blocking worker thread.
//
// Notes:
// - stateSnapshot should be plain JSON-friendly objects:
//     { hands: { ai: [{a,b,id},...], player: [...] }, train: [{a,b,id},...], boneyardCount: number, scores: {...} }
// - The worker does not persist model to localStorage; persistence remains the responsibility of the main thread.

(() => {
  'use strict';

  // In-worker model (optional). If not provided, worker uses heuristic-only decisions.
  let model = null;

  // Utility helpers (small, self-contained)
  const rand = (n) => Math.floor(Math.random() * n);
  const sumPips = (t) => (t.a + t.b);
  const isDouble = (t) => t.a === t.b;

  // Compute playable tiles from a hand given the train
  function playableTiles(hand, train) {
    if (!train || train.length === 0) return hand.slice();
    const left = train[0].a;
    const right = train[train.length - 1].b;
    return hand.filter(t => t.a === left || t.b === left || t.a === right || t.b === right);
  }

  // Choose side heuristic (left/right) using optional model.endPreference
  function chooseSide(tile, train, playerHand = []) {
    if (!train || train.length === 0) return 'right';
    const left = train[0].a;
    const right = train[train.length - 1].b;
    const canLeft = tile.a === left || tile.b === left;
    const canRight = tile.a === right || tile.b === right;
    if (canLeft && !canRight) return 'left';
    if (canRight && !canLeft) return 'right';

    // both possible: use model endPreference if available
    if (model && model.endPreference) {
      const leftEndAfter = (tile.a === left) ? tile.b : tile.a;
      const rightEndAfter = (tile.a === right) ? tile.b : tile.a;
      const leftScore = model.endPreference[leftEndAfter] || 1.0;
      const rightScore = model.endPreference[rightEndAfter] || 1.0;
      return leftScore <= rightScore ? 'left' : 'right';
    }

    // fallback: prefer side that yields lower pip value (less common)
    const leftEndAfter = (tile.a === left) ? tile.b : tile.a;
    const rightEndAfter = (tile.a === right) ? tile.b : tile.a;
    return leftEndAfter <= rightEndAfter ? 'left' : 'right';
  }

  // Score tile using heuristic + optional learned weight
  function scoreTile(tile, playerHand = []) {
    // heuristic: doubles heavy bonus + pip sum
    let score = sumPips(tile);
    if (isDouble(tile)) score += 50;
    // learned weight
    if (model && model.tileWeights && typeof model.tileWeights[tile.id] === 'number') {
      // scale learned weight modestly
      score += model.tileWeights[tile.id] * 8;
    }
    return score;
  }

  // Main move selection logic
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

    // Hard / learned: score tiles and pick best (with small randomness among close scores)
    let bestScore = -Infinity;
    let scored = playable.map(t => {
      const s = scoreTile(t, state.hands.player || []);
      return { tile: t, score: s };
    });

    // sort descending
    scored.sort((a, b) => b.score - a.score);
    bestScore = scored[0].score;

    // collect close candidates (within threshold)
    const threshold = 6; // tunable
    const close = scored.filter(s => (bestScore - s.score) < threshold).map(s => s.tile);
    const chosen = close[rand(close.length)];
    const side = chooseSide(chosen, train, state.hands.player || []);
    return { tile: chosen, side };
  }

  // Message handler
  self.onmessage = function (ev) {
    const msg = ev.data || {};
    const { type, requestId } = msg;

    try {
      if (type === 'init') {
        // Accept model snapshot (tileWeights, endPreference)
        model = msg.model || null;
        // Acknowledge
        self.postMessage({ type: 'initAck', ok: true, requestId });
        return;
      }

      if (type === 'move') {
        const state = msg.state || {};
        const mode = msg.mode || 'hard';
        const move = selectMove(state, mode);
        // Return plain JSON-friendly move (tile as plain object)
        if (move) {
          const tile = move.tile;
          self.postMessage({ type: 'moveResult', move: { tile: { a: tile.a, b: tile.b, id: tile.id }, side: move.side }, requestId });
        } else {
          self.postMessage({ type: 'moveResult', move: null, requestId });
        }
        return;
      }

      if (type === 'updateModel') {
        // Optionally accept incremental model updates from main thread
        model = msg.model || model;
        self.postMessage({ type: 'updateAck', ok: true, requestId });
        return;
      }

      // Unknown message type
      self.postMessage({ type: 'error', message: 'Unknown message type', requestId });
    } catch (err) {
      // Ensure worker never throws uncaught exceptions to main thread
      self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err), requestId });
    }
  };

  // Worker ready
  self.postMessage({ type: 'ready' });
})();

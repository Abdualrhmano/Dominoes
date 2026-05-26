// js/main.js
// Entry point with Web Worker integration for "وردتي"
// - Uses worker/ai-worker.js for AI move decisions (optional fallback to in-thread AI)
// - Robust requestId handling, timeout, and fallback
// - Exposes debug hooks and syncs learned model to worker

import UI from './ui.js';
import GameEngine from './engine.js';
import * as WardatiAI from './ai.js'; // for model snapshot & fallback

// Create UI and Engine instances
const ui = new UI();
const engine = new GameEngine(ui, { targetScore: 101 });

// --- Worker setup ---
let aiWorker = null;
let workerReady = false;
const WORKER_PATH = 'worker/ai-worker.js';
const WORKER_TIMEOUT_MS = 1200; // time to wait for worker response before fallback

// Map requestId -> { resolve, reject, timeoutId }
const pendingRequests = new Map();

function initWorker() {
  try {
    aiWorker = new Worker(WORKER_PATH);
  } catch (err) {
    console.warn('Failed to create AI worker, falling back to main-thread AI', err);
    aiWorker = null;
    workerReady = false;
    return;
  }

  aiWorker.onmessage = (e) => {
    const msg = e.data || {};
    const { type, requestId } = msg;

    if (type === 'ready' || type === 'initAck') {
      workerReady = true;
      console.info('وردتي worker ready');
      return;
    }

    if (type === 'moveResult') {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.resolve(msg.move);
        pendingRequests.delete(requestId);
      }
      return;
    }

    if (type === 'error') {
      const pending = pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(msg.message || 'Worker error'));
        pendingRequests.delete(requestId);
      }
      return;
    }

    // other messages ignored
  };

  aiWorker.onerror = (err) => {
    console.warn('AI worker error', err);
    workerReady = false;
    // reject all pending
    for (const [id, pending] of pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('Worker crashed'));
      pendingRequests.delete(id);
    }
  };

  // Send initial model snapshot to worker (non-blocking)
  try {
    const model = WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null;
    if (model) aiWorker.postMessage({ type: 'init', model });
  } catch (e) {
    console.warn('Failed to send model to worker', e);
  }
}

// Helper: ask worker for a move, returns Promise resolving to move or null
function askWorkerForMove(snapshot, mode) {
  return new Promise((resolve, reject) => {
    if (!aiWorker || !workerReady) {
      return reject(new Error('Worker not available'));
    }
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
    // Setup timeout fallback
    const timeoutId = setTimeout(() => {
      // Timeout: reject and cleanup
      if (pendingRequests.has(requestId)) {
        pendingRequests.get(requestId).reject(new Error('Worker timeout'));
        pendingRequests.delete(requestId);
      }
    }, WORKER_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, timeoutId });
    // Post message
    try {
      aiWorker.postMessage({ type: 'move', state: snapshot, mode, requestId });
    } catch (e) {
      clearTimeout(timeoutId);
      pendingRequests.delete(requestId);
      reject(e);
    }
  });
}

// Initialize worker immediately
initWorker();

// --- Wire UI callbacks to engine actions ---

ui.onTileClick = async (tile) => {
  if (engine.sm.phase !== 'playing' || engine.sm.turn !== 'player') {
    ui.announce('ليس دورك الآن');
    return;
  }

  if (!engine.isTilePlayable(tile, 'player')) {
    if (engine.state.roundFirstMove && engine.state.highestDouble && engine.state.highestDouble.owner === 'player') {
      ui.showTooltip(`يجب أن تبدأ بأعلى دبل لديك: ${engine.state.highestDouble.tile.id}`);
      return;
    }
    ui.announce('القطعة غير قابلة لللعب');
    return;
  }

  let side = 'right';
  if (engine.state.train.length > 0) {
    const leftEnd = engine.state.train[0].a;
    const rightEnd = engine.state.train[engine.state.train.length - 1].b;
    const canLeft = tile.a === leftEnd || tile.b === leftEnd;
    const canRight = tile.a === rightEnd || tile.b === rightEnd;
    if (canLeft && !canRight) side = 'left';
    else if (canRight && !canLeft) side = 'right';
    else side = 'right';
  }

  await engine.placeTile(tile, 'player', side);
};

ui.onDraw = () => {
  if (engine.sm.phase !== 'playing' || engine.sm.turn !== 'player') {
    ui.announce('لا يمكنك السحب الآن');
    return;
  }
  if (engine.state.boneyard.length === 0) {
    ui.announce('البونيارد فارغ');
    return;
  }
  const tile = engine.draw('player');
  ui.renderHand(engine.state.hands.player);
  const playable = engine.isTilePlayable(tile, 'player');
  if (playable) ui.announce('سحبت قطعة قابلة للعب');
  else ui.announce('سحبت قطعة غير قابلة للعب');
};

ui.onEndTurn = () => {
  engine.endPlayerTurn();
};

ui.onReset = () => {
  if (confirm('إعادة المباراة؟ سيتم إعادة النقاط والجولات.')) {
    engine.resetMatch();
    // re-init worker model sync
    try {
      const model = WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null;
      if (aiWorker && model) aiWorker.postMessage({ type: 'init', model });
    } catch (e) { /* ignore */ }
  }
};

ui.onAIModeChange = (mode) => {
  engine.setAIMode(mode);
  ui.announce(`وضع وردتي: ${mode}`);
};

// --- Engine AI scheduling override to use worker when available ---
// We patch engine.scheduleAI to prefer worker, with fallback to WardatiAI.chooseMove

const originalScheduleAI = engine.scheduleAI.bind(engine);

engine.scheduleAI = function (delay = 500) {
  if (this.state.animLock) return;
  setTimeout(async () => {
    if (this.sm.phase !== 'playing' || this.sm.turn !== 'ai') return;

    // If first move and AI owns highest double, force it
    if (this.state.train.length === 0 && this.state.roundFirstMove && this.state.highestDouble && this.state.highestDouble.owner === 'ai') {
      const tile = this.state.highestDouble.tile;
      await this.placeTile(tile, 'ai', 'right');
      return;
    }

    // Prepare snapshot
    const snapshot = {
      hands: {
        ai: this.state.hands.ai.map(t => ({ a: t.a, b: t.b, id: t.id })),
        player: this.state.hands.player.map(t => ({ a: t.a, b: t.b, id: t.id }))
      },
      train: this.state.train.map(t => ({ a: t.a, b: t.b, id: t.id })),
      boneyardCount: this.state.boneyard.length,
      scores: { ...this.state.scores },
      round: this.state.round
    };

    const mode = this.state.aiMode || 'learned';

    // Try worker first
    if (aiWorker && workerReady) {
      try {
        const move = await askWorkerForMove(snapshot, mode);
        if (move) {
          // Worker returns plain tile object; convert to Tile-like object expected by engine.placeTile
          await this.placeTile(move.tile, 'ai', move.side);
          return;
        } else {
          // No playable move returned: draw or pass
          if (this.state.boneyard.length > 0) {
            this.draw('ai');
            this.scheduleAI(300);
          } else {
            this.ui.announce('وردتي تمرر الدور');
            this.sm.turn = 'player';
            this.ui.updateStatus('دورك');
          }
          return;
        }
      } catch (err) {
        // Worker failed or timed out: fallback to in-thread AI
        console.warn('Worker failed or timed out, falling back to in-thread AI:', err);
      }
    }

    // Fallback: use WardatiAI.chooseMove (in main thread)
    try {
      const move = WardatiAI.chooseMove ? WardatiAI.chooseMove(snapshot, mode) : null;
      if (!move) {
        if (this.state.boneyard.length > 0) {
          this.draw('ai');
          this.scheduleAI(300);
        } else {
          this.ui.announce('وردتي تمرر الدور');
          this.sm.turn = 'player';
          this.ui.updateStatus('دورك');
        }
        return;
      }
      await this.placeTile(move.tile, 'ai', move.side);
    } catch (e) {
      console.error('Fallback AI failed', e);
      // As last resort, try simple heuristic inline
      const playable = this.getPlayableTiles(this.state.hands.ai, 'ai');
      if (!playable.length) {
        if (this.state.boneyard.length > 0) {
          this.draw('ai');
          this.scheduleAI(300);
        } else {
          this.ui.announce('وردتي تمرر الدور');
          this.sm.turn = 'player';
          this.ui.updateStatus('دورك');
        }
        return;
      }
      playable.sort((x, y) => ((y.a === y.b ? 100 : 0) + y.sum()) - ((x.a === x.b ? 100 : 0) + x.sum()));
      const chosen = playable[0];
      const side = WardatiAI.chooseSide ? WardatiAI.chooseSide(chosen, snapshot.train, snapshot.hands.player) : 'right';
      await this.placeTile(chosen, 'ai', side);
    }
  }, delay);
};

// --- Sync model updates to worker after each round (listen for nextRound/playAgain events) ---
document.addEventListener('nextRound', () => {
  // After UI triggers nextRound, engine.startRound will be called by engine logic.
  // Sync model to worker (best-effort, non-blocking)
  try {
    const model = WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null;
    if (aiWorker && model) aiWorker.postMessage({ type: 'updateModel', model });
  } catch (e) { /* ignore */ }
});

document.addEventListener('playAgain', () => {
  try {
    const model = WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null;
    if (aiWorker && model) aiWorker.postMessage({ type: 'updateModel', model });
  } catch (e) { /* ignore */ }
});

// --- Modal events (unchanged) ---
document.addEventListener('nextRound', () => {
  engine.state.round++;
  let starter = engine.state.starter || 'player';
  starter = engine.state.scores.player > engine.state.scores.ai ? 'player' : 'ai';
  engine.startRound(false, starter);
});
document.addEventListener('playAgain', () => {
  engine.startMatch();
});

// Start the first match
engine.startMatch();

// Expose debug hooks
window.__Dominoes = {
  engine,
  ui,
  WardatiAI,
  getAIModel: () => WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null,
  resetAIModel: (name) => WardatiAI.resetModel ? WardatiAI.resetModel(name) : null,
  // worker debug
  _aiWorker: () => aiWorker,
  _pendingRequests: () => Array.from(pendingRequests.keys())
};

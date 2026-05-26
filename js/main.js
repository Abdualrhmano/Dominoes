// js/main.js
// Entry point for Dominoes (وردتي Edition)
// - ES Module
// - Wires UI <-> Engine, sets up callbacks, and bootstraps the match
// - Keeps code minimal here; engine and ui contain the heavy logic
//
// Responsibilities:
// 1. Instantiate UI and GameEngine
// 2. Attach UI callbacks to engine methods (play, draw, end turn, reset, ai mode)
// 3. Listen for modal events (nextRound, playAgain) and route to engine
// 4. Expose debug hooks for development
//
// Usage: included in index.html as <script type="module" src="js/main.js"></script>

import UI from './ui.js';
import GameEngine from './engine.js';
import * as WardatiAI from './ai.js'; // optional: for debug / model inspection

// Create UI and Engine instances
const ui = new UI();
const engine = new GameEngine(ui, { targetScore: 101 });

// --- Wire UI callbacks to engine actions ---

// Player clicks a tile in their hand
ui.onTileClick = async (tile) => {
  // Guard: only allow when playing and it's player's turn
  if (engine.sm.phase !== 'playing' || engine.sm.turn !== 'player') {
    ui.announce('ليس دورك الآن');
    return;
  }

  // Enforce first-move highest-double rule via engine validation
  if (!engine.isTilePlayable(tile, 'player')) {
    if (engine.state.roundFirstMove && engine.state.highestDouble && engine.state.highestDouble.owner === 'player') {
      ui.showTooltip(`يجب أن تبدأ بأعلى دبل لديك: ${engine.state.highestDouble.tile.id}`);
      return;
    }
    ui.announce('القطعة غير قابلة للعب');
    return;
  }

  // Auto-select side: prefer right; if only left valid, choose left
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

  // Attempt placement
  await engine.placeTile(tile, 'player', side);
};

// Draw button or boneyard click
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

// End turn button
ui.onEndTurn = () => {
  engine.endPlayerTurn();
};

// Reset match button
ui.onReset = () => {
  if (confirm('إعادة المباراة؟ سيتم إعادة النقاط والجولات.')) {
    engine.resetMatch();
  }
};

// AI mode select (easy | hard | learned)
ui.onAIModeChange = (mode) => {
  engine.setAIMode(mode);
  ui.announce(`وضع وردتي: ${mode}`);
};

// Modal events (dispatched by UI)
document.addEventListener('nextRound', () => {
  // increment round counter and start next round
  engine.state.round++;
  // Starter logic: winner of previous round starts; if none, alternate or default to player
  // For simplicity, choose the last round winner if available, else alternate
  let starter = engine.state.starter || 'player';
  // If scores changed, prefer the higher scorer as starter (simple heuristic)
  starter = engine.state.scores.player > engine.state.scores.ai ? 'player' : 'ai';
  engine.startRound(false, starter);
});

document.addEventListener('playAgain', () => {
  engine.startMatch();
});

// Keyboard shortcuts (redundant with UI but convenient)
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
  if (e.key === 'd' || e.key === 'D') ui.onDraw && ui.onDraw();
  if (e.key === 'e' || e.key === 'E') ui.onEndTurn && ui.onEndTurn();
  if (e.key === 'r' || e.key === 'R') {
    if (confirm('إعادة المباراة؟')) ui.onReset && ui.onReset();
  }
});

// Start the first match
engine.startMatch();

// Expose debug hooks for development in console
window.__Dominoes = {
  engine,
  ui,
  WardatiAI,
  // helper to inspect AI model quickly
  getAIModel: () => WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null,
  resetAIModel: (name) => WardatiAI.resetModel ? WardatiAI.resetModel(name) : null
};

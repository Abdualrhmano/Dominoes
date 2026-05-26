// js/main.js
import UI from './ui.js';
import GameEngine from './engine.js';
import * as WardatiAI from './ai.js';

const ui = new UI();
const engine = new GameEngine(ui, { targetScore: 101 });

window.addEventListener('openGame', () => {
  // ensure UI reflects current AI model and mode
  ui.setAIMode(engine.state.aiMode);
  ui.updateScoreboard(engine.state.scores, engine.state.round);
  ui.updateBoneyardCount(engine.state.boneyard.length);
  ui.renderAll(engine.state);
});

// Landing controls
const landingStart = document.getElementById('start-game');
const goToGame = document.getElementById('go-to-game');
const appRoot = document.getElementById('app');
const landingRoot = document.getElementById('landing');

function showGame() {
  if (landingRoot) landingRoot.hidden = true;
  if (appRoot) appRoot.hidden = false;
  window.dispatchEvent(new Event('openGame'));
}
if (landingStart) landingStart.addEventListener('click', showGame);
if (goToGame) goToGame.addEventListener('click', showGame);

// Wire UI callbacks to engine
ui.onTileClick = async (tile) => {
  if (engine.sm.phase !== 'playing' || engine.sm.turn !== 'player') {
    ui.announce('ليس دورك الآن');
    return;
  }
  if (!engine.isTilePlayable(tile, 'player')) {
    ui.announce('القطعة غير قابلة لللعب');
    return;
  }
  await engine.placeTile(tile, 'player', 'right');
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
  engine.draw('player');
};

ui.onEndTurn = () => {
  engine.endPlayerTurn();
};

ui.onResetMatch = () => {
  if (confirm('إعادة المباراة؟ سيتم إعادة النقاط والجولات.')) {
    engine.resetMatch();
  }
};

ui.onAIModeChange = (mode) => {
  engine.setAIMode(mode);
  ui.announce(`وضع وردتي: ${mode}`);
};

// Model controls (export/import/reset/sync)
const exportBtn = document.getElementById('export-model');
const importBtn = document.getElementById('import-model');
const resetModelBtn = document.getElementById('reset-model');
const syncModelBtn = document.getElementById('sync-model');

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    try {
      const model = WardatiAI.getModelSnapshot();
      const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wardati-model.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      ui.announce('تم تصدير النموذج محلياً');
    } catch (e) {
      console.warn(e);
      ui.announce('فشل تصدير النموذج');
    }
  });
}

if (importBtn) {
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const ok = WardatiAI.importModel(json);
        if (ok) {
          ui.announce('تم استيراد النموذج');
          // sync to engine state
          engine.state.aiModel = WardatiAI.getModelSnapshot();
        } else {
          ui.announce('ملف النموذج غير صالح');
        }
      } catch (err) {
        console.warn(err);
        ui.announce('فشل استيراد الملف');
      }
    };
    input.click();
  });
}

if (resetModelBtn) {
  resetModelBtn.addEventListener('click', () => {
    if (!confirm('هل تريد إعادة تهيئة نموذج وردتي إلى الافتراضي؟')) return;
    WardatiAI.resetModel();
    engine.state.aiModel = WardatiAI.getModelSnapshot();
    ui.announce('تمت إعادة تهيئة نموذج وردتي');
  });
}

if (syncModelBtn) {
  syncModelBtn.addEventListener('click', () => {
    try {
      engine.state.aiModel = WardatiAI.getModelSnapshot();
      ui.announce('تمت مزامنة نموذج وردتي محلياً');
    } catch (e) {
      console.warn(e);
      ui.announce('فشل مزامنة النموذج');
    }
  });
}

// Ensure engine updates UI on lifecycle events
document.addEventListener('nextRound', () => {
  engine.state.round++;
  engine.startRound(false, engine.state.starter);
});

document.addEventListener('playAgain', () => {
  engine.startMatch();
});

// Expose debug hooks
window.__Dominoes = {
  engine,
  ui,
  WardatiAI,
  getAIModel: () => WardatiAI.getModelSnapshot ? WardatiAI.getModelSnapshot() : null,
  resetAIModel: (name) => WardatiAI.resetModel ? WardatiAI.resetModel(name) : null
};

// Start match when user opens game automatically
window.addEventListener('openGame', () => {
  try {
    engine.startMatch();
  } catch (e) {
    console.error('Failed to start match', e);
  }
});

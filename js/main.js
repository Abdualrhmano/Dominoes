/**
 * js/main.js
 * Orchestrator: initializes modules and wires them together.
 *
 * This file is intentionally lightweight: it imports the engine, board, ui and audio modules,
 * initializes them in the correct order, and exposes a small debug API.
 *
 * NOTE: The remaining modules (engine.js, board.js, ui.js, audio.js) will be provided next.
 */

import Engine from './engine.js';
import Board from './board.js';
import UI from './ui.js';
import AudioManager from './audio.js';

(async function bootstrap(){
  'use strict';

  // Initialize audio first (resume on user gesture inside UI if needed)
  const audio = new AudioManager();
  // set a conservative master volume
  audio.setMasterVolume(0.9);

  // Initialize game engine (pure logic, no DOM)
  const engine = new Engine({
    targetScore: 101,
    onStateChange: (state) => {
      // engine will call this when core state changes (round, scores, hands, train)
      // UI will subscribe separately; this is a lightweight hook for logging
      // console.debug('engine state changed', state);
    }
  });

  // Initialize board renderer (2D board, placement, spinner logic)
  const board = new Board({
    container: document.getElementById('board-canvas'),
    tileWidth: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-w')) || 96,
    tileHeight: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-h')) || 56,
    onPlaceRequest: (handIndex, side, coords) => {
      // UI/Board will call this when user attempts to place a tile at coords/side
      // Delegate to engine to validate and perform placement
      const result = engine.attemptPlaceFromPlayer(handIndex, side, coords);
      if(result.success){
        audio.play('clack', { gain: 0.12, pitch: 1 + (result.tile.a + result.tile.b)/24 });
      } else {
        audio.play('error', { gain: 0.06 });
      }
      return result;
    }
  });

  // Initialize UI (DOM rendering, drag/drop, modals)
  const ui = new UI({
    engine,
    board,
    audio,
    elements: {
      playerHand: document.getElementById('player-hand'),
      boneyardCount: document.getElementById('boneyard-count'),
      boneStack: document.getElementById('bone-stack'),
      roundNumber: document.getElementById('round-number'),
      playerScore: document.getElementById('player-score'),
      aiScore: document.getElementById('ai-score'),
      turnIndicator: document.getElementById('turn-indicator'),
      statusText: document.getElementById('status-text'),
      modalRoot: document.getElementById('modal-root'),
      confettiCanvas: document.getElementById('confetti'),
      firstMoveTooltip: document.getElementById('first-move-tooltip')
    }
  });

  // Wire engine events to UI and board
  engine.on('state', (state) => {
    ui.updateFromState(state);
    board.updateFromState(state);
  });

  engine.on('roundStart', (info) => {
    audio.play('shuffle', { loop: true, gain: 0.06 });
    setTimeout(()=> audio.stop('shuffle'), 900);
  });

  engine.on('tilePlaced', (info) => {
    audio.play('clack', { gain: 0.12, pitch: 1 + (info.tile.a + info.tile.b)/24 });
  });

  engine.on('draw', (who) => {
    audio.play('slide', { gain: 0.08 });
  });

  engine.on('victory', (winner) => {
    audio.play('fanfare', { gain: 0.18 });
    ui.showVictory(winner);
  });

  // Attach UI controls
  document.getElementById('reset-match').addEventListener('click', () => {
    if(confirm('Reset match and scores?')) {
      engine.resetMatch();
    }
  });

  document.getElementById('bone-stack').addEventListener('click', () => {
    if(engine.canPlayerDraw()){
      const tile = engine.playerDraw();
      if(tile) {
        ui.flashStatus('You drew a tile');
        audio.play('slide', { gain: 0.08 });
      } else {
        ui.flashStatus('Boneyard empty');
        audio.play('error', { gain: 0.06 });
      }
    }
  });

  // Start the match
  engine.initMatch();

  // Expose debug handles
  window.DOMINO = { engine, board, ui, audio };

})();

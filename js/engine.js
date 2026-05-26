// js/engine.js
// GameEngine (integrates with "وردتي" AI learning module)
// - ES Module
// - Responsible for core game state, rules, round lifecycle, scoring
// - Integrates with ai.js: calls chooseMove(...) for AI decisions and learnFromRound(...) after each round
// - Records a moves history per round to feed the learning module
//
// Expected external API (UI layer):
//   const engine = new GameEngine(ui);
//   engine.startMatch();
//   engine.placeTile(tile, 'player', side);
//   engine.draw('player');
//   engine.endPlayerTurn();
//   engine.setAIMode('hard'|'easy'|'learned');
//   engine.resetMatch();
//
// Notes:
// - The engine does not manipulate DOM directly; it calls UI callbacks (ui.renderTrain, ui.renderHand, ui.showRoundModal, etc).
// - The engine keeps a per-round moves log: chronological moves with { who, tileId, side } entries.
// - At round end, engine composes a summary and calls AI.learnFromRound(summary).
// - The AI module is expected to export: init(modelName), chooseMove(state, mode), learnFromRound(summary), getModelSnapshot(), etc.

import Tile from './tile.js';
import { shuffle, sleep } from './utils.js';
import * as WardatiAI from './ai.js'; // "وردتي" learning AI

export default class GameEngine {
  /**
   * @param {Object} ui - UI bridge implementing rendering and interaction helpers
   *                      (renderTrain, renderHand, updateBoneyardCount, updateScoreboard, showRoundModal, showMatchVictory, announce, showTooltip, scrollTrainToEnd)
   * @param {Object} opts - optional config { targetScore }
   */
  constructor(ui, opts = {}) {
    this.ui = ui;
    this.TARGET_SCORE = opts.targetScore || 101;

    // Core state
    this.state = {
      deck: [],
      boneyard: [],
      hands: { player: [], ai: [] },
      train: [], // placed Tile instances
      scores: { player: 0, ai: 0 },
      round: 1,
      starter: null,
      highestDouble: null,
      roundFirstMove: true,
      animLock: false,
      aiMode: 'learned' // default: use learned mode (falls back to hard if model absent)
    };

    // Lightweight state machine
    this.sm = { phase: 'setup', turn: null };

    // Moves history for learning (cleared each round)
    this.currentRoundMoves = []; // { who: 'player'|'ai', tileId: 'a-b', side: 'left'|'right' }

    // Animation timing (sync with CSS)
    this.motion = { snapMs: 360 };

    // Initialize Wardati AI model (load from localStorage)
    WardatiAI.init('wardati_v1');

    // Bind event hooks (UI will set callbacks to engine methods externally)
  }

  /* =========================
     Deck & dealing utilities
     ========================= */

  buildDeck() {
    const deck = [];
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) {
        deck.push(new Tile(a, b));
      }
    }
    return deck;
  }

  shuffleDeck() {
    this.state.deck = shuffle(this.state.deck);
  }

  dealHands() {
    this.state.hands.player = [];
    this.state.hands.ai = [];
    for (let i = 0; i < 7; i++) {
      this.state.hands.player.push(this.state.boneyard.pop());
      this.state.hands.ai.push(this.state.boneyard.pop());
    }
  }

  /* =========================
     Match & round lifecycle
     ========================= */

  startMatch() {
    // Reset scores and round counter
    this.state.scores = { player: 0, ai: 0 };
    this.state.round = 1;
    this.ui.updateScoreboard(this.state.scores, this.state.round);
    this.startRound(true);
  }

  startRound(isInitial = false, prevWinner = null) {
    // Reset deck, boneyard, train, hands
    this.state.deck = this.buildDeck();
    shuffle(this.state.deck);
    this.state.boneyard = [...this.state.deck];
    this.state.train = [];
    this.dealHands();

    // Compute highest double and starter
    this.state.highestDouble = this.findHighestDouble();
    if (isInitial) this.state.starter = this.determineStarter();
    else this.state.starter = prevWinner || this.state.starter || 'player';

    // Round flags
    this.state.roundFirstMove = true;
    this.state.animLock = false;

    // Reset moves history
    this.currentRoundMoves = [];

    // UI render
    this.ui.renderAll(this.state);
    this.ui.updateBoneyardCount(this.state.boneyard.length);
    this.ui.updateScoreboard(this.state.scores, this.state.round);

    // Start playing phase
    this.sm.phase = 'playing';
    this.sm.turn = this.state.starter;
    this.ui.updateStatus(this.sm.turn === 'player' ? 'دورك' : 'دور وردتي');

    // If AI starts, schedule AI
    if (this.sm.turn === 'ai') {
      this.ui.announce('وردتي تبدأ الجولة');
      this.scheduleAI(700);
    } else {
      // If player must play highest double, show tooltip
      if (this.state.highestDouble && this.state.highestDouble.owner === 'player') {
        this.ui.showTooltip(`يجب أن تبدأ بأعلى دبل لديك: ${this.state.highestDouble.tile.id}`);
      }
    }
  }

  findHighestDouble() {
    const all = [
      ...this.state.hands.player.map(t => ({ tile: t, owner: 'player' })),
      ...this.state.hands.ai.map(t => ({ tile: t, owner: 'ai' }))
    ];
    const doubles = all.filter(x => x.tile.isDouble());
    if (!doubles.length) return null;
    doubles.sort((x, y) => y.tile.a - x.tile.a);
    return doubles[0]; // { tile, owner }
  }

  determineStarter() {
    const all = [
      ...this.state.hands.player.map(t => ({ tile: t, owner: 'player' })),
      ...this.state.hands.ai.map(t => ({ tile: t, owner: 'ai' }))
    ];
    const doubles = all.filter(x => x.tile.isDouble());
    if (doubles.length) {
      doubles.sort((x, y) => y.tile.a - x.tile.a);
      return doubles[0].owner;
    }
    all.sort((x, y) => (y.tile.sum() - x.tile.sum()));
    return all[0].owner;
  }

  /* =========================
     Validation & placement
     ========================= */

  isTilePlayable(tile, who) {
    // Enforce first-move highest double rule
    if (this.state.train.length === 0 && this.state.roundFirstMove && this.state.highestDouble) {
      if (this.state.highestDouble.owner === who) {
        return tile.id === this.state.highestDouble.tile.id;
      } else {
        return false;
      }
    }
    if (this.state.train.length === 0) return true;
    const left = this.state.train[0].a;
    const right = this.state.train[this.state.train.length - 1].b;
    return tile.a === left || tile.b === left || tile.a === right || tile.b === right;
  }

  getPlayableTiles(hand, who) {
    return hand.filter(t => this.isTilePlayable(t, who));
  }

  /**
   * Place a tile for a player or AI.
   * Records the move in currentRoundMoves for learning.
   * Returns true if placement succeeded.
   */
  async placeTile(tile, who, side = 'right') {
    if (this.state.animLock) return false;
    const hand = who === 'player' ? this.state.hands.player : this.state.hands.ai;
    const idx = hand.findIndex(t => t.id === tile.id);
    if (idx === -1 && who === 'player') return false; // not in player's hand
    if (!this.isTilePlayable(tile, who)) return false;

    this.state.animLock = true;

    // Remove from hand
    if (who === 'player') hand.splice(idx, 1);
    else {
      const aiIdx = this.state.hands.ai.findIndex(t => t.id === tile.id);
      if (aiIdx >= 0) this.state.hands.ai.splice(aiIdx, 1);
    }

    // Orient and place
    const placed = tile.clone();
    if (this.state.train.length === 0) {
      this.state.train.push(placed);
    } else if (side === 'left') {
      const leftEnd = this.state.train[0].a;
      if (placed.b !== leftEnd) [placed.a, placed.b] = [placed.b, placed.a];
      this.state.train.unshift(placed);
    } else {
      const rightEnd = this.state.train[this.state.train.length - 1].b;
      if (placed.a !== rightEnd) [placed.a, placed.b] = [placed.b, placed.a];
      this.state.train.push(placed);
    }

    // Record move for learning
    this.currentRoundMoves.push({ who, tileId: tile.id, side });

    // After first placement, clear first-move flag
    if (this.state.roundFirstMove) this.state.roundFirstMove = false;

    // Render and announce
    this.ui.renderTrain(this.state.train);
    this.ui.renderHand(this.state.hands.player);
    this.ui.updateBoneyardCount(this.state.boneyard.length);
    this.ui.announce(`${who === 'player' ? 'اللاعب' : 'وردتي'} لعب ${tile.id}`);

    // Wait for snap animation then scroll
    await sleep(this.motion.snapMs + 40);
    this.ui.scrollTrainToEnd(side);

    this.state.animLock = false;

    // Check round end
    const roundOver = this.checkRoundEnd();
    if (!roundOver) {
      // Switch turn
      this.sm.turn = this.sm.turn === 'player' ? 'ai' : 'player';
      this.ui.updateStatus(this.sm.turn === 'player' ? 'دورك' : 'دور وردتي');
      if (this.sm.turn === 'ai') this.scheduleAI(450);
    }
    return true;
  }

  draw(who) {
    if (!this.state.boneyard.length) return null;
    const tile = this.state.boneyard.pop();
    if (who === 'player') {
      this.state.hands.player.push(tile);
      this.ui.renderHand(this.state.hands.player);
    } else {
      this.state.hands.ai.push(tile);
    }
    this.ui.updateBoneyardCount(this.state.boneyard.length);
    this.ui.announce(`${who === 'player' ? 'اللاعب' : 'وردتي'} سحب قطعة`);
    // Record draw as a move (optional) - we record only placements for learning to keep model focused
    return tile;
  }

  checkRoundEnd() {
    // Domino (empty hand)
    if (this.state.hands.player.length === 0 || this.state.hands.ai.length === 0) {
      const winner = this.state.hands.player.length === 0 ? 'player' : 'ai';
      const loser = winner === 'player' ? 'ai' : 'player';
      const points = this.sumPips(this.state.hands[loser]);
      this.state.scores[winner] += points;
      this.ui.updateScoreboard(this.state.scores, this.state.round);
      this.sm.phase = 'roundEnd';
      this.onRoundEnd(winner, points, 'domino');
      return true;
    }

    // Blocked: no playable tiles for both and boneyard empty
    const playerPlayable = this.getPlayableTiles(this.state.hands.player, 'player').length > 0;
    const aiPlayable = this.getPlayableTiles(this.state.hands.ai, 'ai').length > 0;
    if (!playerPlayable && !aiPlayable && this.state.boneyard.length === 0) {
      const playerPips = this.sumPips(this.state.hands.player);
      const aiPips = this.sumPips(this.state.hands.ai);
      let winner = null, points = 0;
      if (playerPips < aiPips) { winner = 'player'; points = aiPips - playerPips; }
      else if (aiPips < playerPips) { winner = 'ai'; points = playerPips - aiPips; }
      if (winner) {
        this.state.scores[winner] += points;
        this.ui.updateScoreboard(this.state.scores, this.state.round);
        this.sm.phase = 'roundEnd';
        this.onRoundEnd(winner, points, 'blocked');
      } else {
        this.sm.phase = 'roundEnd';
        this.onRoundEnd(null, 0, 'blocked-tie');
      }
      return true;
    }
    return false;
  }

  sumPips(hand) {
    return hand.reduce((s, t) => s + t.a + t.b, 0);
  }

  /* =========================
     Round & Match end handling (learning integration)
     ========================= */

  onRoundEnd(winner, points, reason) {
    // Build summary for learning
    const summary = {
      winner, // 'player'|'ai'|null
      reason,
      moves: this.currentRoundMoves.slice(), // chronological moves
      finalState: this._snapshotStateForLearning()
    };

    // Call learning asynchronously (do not block UI)
    try {
      WardatiAI.learnFromRound(summary);
    } catch (e) {
      console.warn('وردتي: learning failed', e);
    }

    // Show round modal via UI
    this.ui.showRoundModal(winner, points, reason, this.state.scores);

    // If match reached target, trigger match end
    if (this.state.scores.player >= this.TARGET_SCORE || this.state.scores.ai >= this.TARGET_SCORE) {
      const champ = this.state.scores.player >= this.TARGET_SCORE ? 'player' : 'ai';
      this.onMatchEnd(champ);
    }
  }

  onMatchEnd(champion) {
    this.sm.phase = 'matchEnd';
    this.ui.showMatchVictory(champion, this.state.scores);
  }

  _snapshotStateForLearning() {
    // Provide a compact snapshot for AI learning (no DOM)
    return {
      train: this.state.train.map(t => ({ a: t.a, b: t.b, id: t.id })),
      hands: {
        player: this.state.hands.player.map(t => ({ a: t.a, b: t.b, id: t.id })),
        ai: this.state.hands.ai.map(t => ({ a: t.a, b: t.b, id: t.id }))
      },
      boneyardCount: this.state.boneyard.length,
      scores: { ...this.state.scores },
      round: this.state.round
    };
  }

  /* =========================
     AI scheduling & decision
     ========================= */

  scheduleAI(delay = 500) {
    if (this.state.animLock) return;
    setTimeout(async () => {
      if (this.sm.phase !== 'playing' || this.sm.turn !== 'ai') return;

      // If first move and AI owns highest double, force it
      if (this.state.train.length === 0 && this.state.roundFirstMove && this.state.highestDouble && this.state.highestDouble.owner === 'ai') {
        const tile = this.state.highestDouble.tile;
        await this.placeTile(tile, 'ai', 'right');
        return;
      }

      // Prepare a shallow state snapshot for AI
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

      // Choose move via WardatiAI
      let move = null;
      try {
        move = WardatiAI.chooseMove(snapshot, this.state.aiMode || 'learned');
      } catch (e) {
        console.warn('وردتي: chooseMove failed, falling back to heuristic', e);
      }

      // Fallback: if AI returns null or throws, try a simple heuristic
      if (!move) {
        // simple heuristic: play highest double or highest sum
        const playable = this.getPlayableTiles(this.state.hands.ai, 'ai');
        if (!playable.length) {
          // draw until playable or boneyard empty
          if (this.state.boneyard.length > 0) {
            this.draw('ai');
            this.scheduleAI(300);
          } else {
            // pass turn
            this.ui.announce('وردتي تمرر الدور');
            this.sm.turn = 'player';
            this.ui.updateStatus('دورك');
          }
          return;
        }
        playable.sort((x, y) => ((y.a === y.b ? 100 : 0) + y.sum()) - ((x.a === x.b ? 100 : 0) + x.sum()));
        const chosen = playable[0];
        const side = WardatiAI.chooseSide ? WardatiAI.chooseSide(chosen, snapshot.train, snapshot.hands.player) : 'right';
        move = { tile: chosen, side };
      }

      // Place the chosen tile
      await this.placeTile(move.tile, 'ai', move.side);
    }, delay);
  }

  /* =========================
     Player actions & utilities
     ========================= */

  endPlayerTurn() {
    if (this.sm.phase !== 'playing' || this.sm.turn !== 'player') return;
    this.sm.turn = 'ai';
    this.ui.updateStatus('دور وردتي');
    this.scheduleAI(400);
  }

  resetMatch() {
    this.sm.phase = 'setup';
    this.startMatch();
  }

  setAIMode(mode) {
    // Accept 'easy', 'hard', 'learned'
    this.state.aiMode = mode === 'easy' ? 'easy' : (mode === 'hard' ? 'hard' : 'learned');
    // If learned but model missing, WardatiAI.chooseMove will fallback internally
  }
}

// js/engine.js
import Tile from './tile.js';
import { shuffle, sleep } from './utils.js';
import * as WardatiAI from './ai.js';

export default class GameEngine {
  constructor(ui, opts = {}) {
    if (!ui) throw new Error('GameEngine requires a UI bridge instance');
    this.ui = ui;
    this.TARGET_SCORE = Number(opts.targetScore) || 101;

    this.state = {
      deck: [],
      boneyard: [],
      hands: { player: [], ai: [] },
      train: [],
      scores: { player: 0, ai: 0 },
      round: 1,
      starter: null,
      highestDouble: null,
      roundFirstMove: true,
      animLock: false,
      aiMode: 'learned',
      aiModel: null
    };

    this.sm = { phase: 'setup', turn: null };
    this.currentRoundMoves = [];
    this.motion = { snapMs: 360 };
    WardatiAI.init('wardati_v1');
  }

  buildDeck() {
    const deck = [];
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) deck.push(new Tile(a, b));
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

  startMatch() {
    this.state.scores = { player: 0, ai: 0 };
    this.state.round = 1;
    this.ui.updateScoreboard(this.state.scores, this.state.round);
    this.startRound(true);
  }

  startRound(isInitial = false, prevWinner = null) {
    this.state.deck = this.buildDeck();
    this.shuffleDeck();
    this.state.boneyard = [...this.state.deck];
    this.state.train = [];
    this.dealHands();

    this.state.highestDouble = this.findHighestDouble();
    if (isInitial) this.state.starter = this.determineStarter();
    else this.state.starter = prevWinner || this.state.starter || 'player';

    this.state.roundFirstMove = true;
    this.state.animLock = false;
    this.currentRoundMoves = [];

    this.ui.renderAll(this.state);
    this.ui.updateBoneyardCount(this.state.boneyard.length);
    this.ui.updateScoreboard(this.state.scores, this.state.round);

    this.sm.phase = 'playing';
    this.sm.turn = this.state.starter;
    this.ui.updateStatus(this.sm.turn === 'player' ? 'دورك' : 'دور وردتي');

    if (this.sm.turn === 'ai') {
      this.ui.announce('وردتي تبدأ الجولة');
      this.scheduleAI(700);
    } else if (this.state.highestDouble && this.state.highestDouble.owner === 'player') {
      this.ui.showTooltip(`يجب أن تبدأ بأعلى دبل لديك: ${this.state.highestDouble.tile.id}`);
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
    return doubles[0];
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

  isTilePlayable(tile, who) {
    if (!tile || !who) return false;
    if (this.state.train.length === 0 && this.state.roundFirstMove && this.state.highestDouble) {
      if (this.state.highestDouble.owner === who) return tile.id === this.state.highestDouble.tile.id;
      return false;
    }
    if (this.state.train.length === 0) return true;
    const left = this.state.train[0].a;
    const right = this.state.train[this.state.train.length - 1].b;
    return tile.a === left || tile.b === left || tile.a === right || tile.b === right;
  }

  getPlayableTiles(hand, who) {
    if (!Array.isArray(hand)) return [];
    return hand.filter(t => this.isTilePlayable(t, who));
  }

  async placeTile(tile, who, side = 'right') {
    if (this.state.animLock) return false;
    if (!tile || !who) return false;

    const hand = who === 'player' ? this.state.hands.player : this.state.hands.ai;
    const idx = hand.findIndex(t => t.id === tile.id);
    if (who === 'player' && idx === -1) return false;
    if (!this.isTilePlayable(tile, who)) return false;

    this.state.animLock = true;

    try {
      if (who === 'player') hand.splice(idx, 1);
      else {
        const aiIdx = this.state.hands.ai.findIndex(t => t.id === tile.id);
        if (aiIdx >= 0) this.state.hands.ai.splice(aiIdx, 1);
      }

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

      this.currentRoundMoves.push({ who, tileId: tile.id, side });

      if (this.state.roundFirstMove) this.state.roundFirstMove = false;

      this.ui.renderTrain(this.state.train);
      this.ui.renderHand(this.state.hands.player);
      this.ui.updateBoneyardCount(this.state.boneyard.length);
      this.ui.announce(`${who === 'player' ? 'اللاعب' : 'وردتي'} لعب ${tile.id}`);

      await sleep(this.motion.snapMs + 40);
      this.ui.scrollTrainToEnd(side);
    } catch (err) {
      console.error('placeTile error', err);
    } finally {
      this.state.animLock = false;
    }

    const roundOver = this.checkRoundEnd();
    if (!roundOver) {
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
    return tile;
  }

  checkRoundEnd() {
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
    if (!Array.isArray(hand)) return 0;
    return hand.reduce((s, t) => s + t.a + t.b, 0);
  }

  onRoundEnd(winner, points, reason) {
    const summary = {
      winner,
      reason,
      moves: this.currentRoundMoves.slice(),
      finalState: this._snapshotStateForLearning()
    };

    try {
      WardatiAI.learnFromRound(summary);
    } catch (e) {
      console.warn('WardatiAI.learnFromRound failed', e);
    }

    try {
      const snapshot = WardatiAI.getModelSnapshot();
      this.state.aiModel = snapshot;
      try { localStorage.setItem('dominoes_ai_embedded', JSON.stringify(snapshot)); } catch (e) {}
    } catch (e) {}

    this.ui.showRoundModal(winner, points, reason, this.state.scores);

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

  scheduleAI(delay = 500) {
    if (this.state.animLock) return;
    setTimeout(async () => {
      if (this.sm.phase !== 'playing' || this.sm.turn !== 'ai') return;

      if (this.state.train.length === 0 && this.state.roundFirstMove && this.state.highestDouble && this.state.highestDouble.owner === 'ai') {
        const tile = this.state.highestDouble.tile;
        await this.placeTile(tile, 'ai', 'right');
        return;
      }

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

      let move = null;
      try {
        const choosePromise = Promise.resolve(WardatiAI.chooseMove(snapshot, this.state.aiMode || 'learned'));
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('AI timeout')), 1200));
        move = await Promise.race([choosePromise, timeout]);
      } catch (e) {
        console.warn('AI chooseMove failed or timed out, falling back to heuristic', e);
        move = null;
      }

      if (!move) {
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
        move = { tile: chosen, side };
      }

      if (move && move.tile) await this.placeTile(move.tile, 'ai', move.side);
    }, delay);
  }

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
    this.state.aiMode = mode === 'easy' ? 'easy' : (mode === 'hard' ? 'hard' : 'learned');
  }
      }

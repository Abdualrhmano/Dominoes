// js/ai.js
// AI module for Dominoes — "وردتي" (learns from each round)
// - Exports functions used by GameEngine to request moves and to update learning after rounds.
// - Uses a lightweight, explainable learning model stored in localStorage.
// - Supports two modes: 'easy' (random), 'hard' (heuristic + learned weights).
//
// Design goals:
// 1. Keep AI pure (no DOM). Provide deterministic, testable functions.
// 2. Learning is incremental and interpretable: we track weights for tile choices and end-state preferences.
// 3. Persist model in localStorage so "وردتي" improves across sessions.
// 4. Provide API: init(modelName), chooseMove(state, mode), learnFromRound(summary).
//
// Usage (example):
// import * as AI from './ai.js';
// AI.init('wardati-v1');
// const move = AI.chooseMove(state, 'hard'); // { tile, side } or null
// After round: AI.learnFromRound({ winner: 'player'|'ai'|null, reason, stateSnapshot, movesHistory });
//
// NOTE: state objects passed in should be shallow snapshots (no DOM nodes).

/* =========================
   Utilities (internal)
   ========================= */
const STORAGE_PREFIX = 'dominoes_ai_wardati_';
const DEFAULT_MODEL_NAME = 'wardati_v1';
const MAX_PIP = 6;

/**
 * Safe deep clone for small game state objects (tiles are plain objects {a,b,id})
 */
function cloneState(state) {
  return {
    train: state.train.map(t => ({ a: t.a, b: t.b, id: t.id })),
    hands: {
      player: state.hands.player.map(t => ({ a: t.a, b: t.b, id: t.id })),
      ai: state.hands.ai.map(t => ({ a: t.a, b: t.b, id: t.id }))
    },
    boneyardCount: state.boneyard ? state.boneyard.length : (state.boneyardCount ?? 0),
    scores: { ...state.scores },
    round: state.round
  };
}

/* =========================
   Learning Model
   - Simple, interpretable model:
     * tileWeights: map tileId -> weight (preference to play that tile when playable)
     * endPreference: map pipValue (0..6) -> weight (preference to create ends with certain pip)
     * meta: gamesPlayed, roundsSeen, lastUpdated
   - Update rule:
     * When AI wins a round, increase weights for moves it played in that round.
     * When AI loses, slightly decrease weights for moves it played.
     * Also update endPreference based on final board ends and whether that correlated with win.
   - Normalization: keep weights bounded to avoid runaway values.
   ========================= */

function defaultModel() {
  const tileWeights = {};
  // initialize all double-six tiles
  for (let a = 0; a <= MAX_PIP; a++) {
    for (let b = a; b <= MAX_PIP; b++) {
      const id = `${a}-${b}`;
      tileWeights[id] = 1.0; // neutral starting weight
    }
  }
  const endPreference = Array(MAX_PIP + 1).fill(1.0); // neutral
  return {
    tileWeights,
    endPreference,
    meta: {
      gamesPlayed: 0,
      roundsSeen: 0,
      lastUpdated: Date.now()
    }
  };
}

/* =========================
   Persistence helpers
   ========================= */
let MODEL_NAME = DEFAULT_MODEL_NAME;
let model = null;

function storageKey(name) {
  return STORAGE_PREFIX + name;
}

function saveModel() {
  try {
    const key = storageKey(MODEL_NAME);
    localStorage.setItem(key, JSON.stringify(model));
    // update timestamp
    model.meta.lastUpdated = Date.now();
  } catch (e) {
    // localStorage may be unavailable in some contexts; fail silently
    console.warn('وردتي: failed to save model', e);
  }
}

function loadModel(name) {
  try {
    const key = storageKey(name);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic validation
    if (parsed && parsed.tileWeights && parsed.endPreference) return parsed;
    return null;
  } catch (e) {
    console.warn('وردتي: failed to load model', e);
    return null;
  }
}

/* =========================
   Public API: init(modelName)
   - Loads model from storage or creates default.
   ========================= */
export function init(modelName = DEFAULT_MODEL_NAME) {
  MODEL_NAME = modelName || DEFAULT_MODEL_NAME;
  const loaded = loadModel(MODEL_NAME);
  if (loaded) {
    model = loaded;
  } else {
    model = defaultModel();
    saveModel();
  }
  return model;
}

/* =========================
   Helper: getPlayableTiles
   - Given a hand and train, return playable tiles (shallow objects)
   ========================= */
export function playableTiles(hand, train) {
  if (!train || train.length === 0) return hand.slice();
  const left = train[0].a;
  const right = train[train.length - 1].b;
  return hand.filter(t => t.a === left || t.b === left || t.a === right || t.b === right);
}

/* =========================
   Helper: chooseSide
   - Heuristic to choose left/right when both valid.
   - Uses model.endPreference to prefer ends less common in player's hand.
   ========================= */
export function chooseSide(tile, train, playerHand = []) {
  if (!train || train.length === 0) return 'right';
  const left = train[0].a;
  const right = train[train.length - 1].b;
  const canLeft = tile.a === left || tile.b === left;
  const canRight = tile.a === right || tile.b === right;
  if (canLeft && !canRight) return 'left';
  if (canRight && !canLeft) return 'right';
  // both possible: evaluate endPreference for resulting ends
  // if placed on left, new left becomes the tile side that is not matching left
  const leftEndAfter = (tile.a === left) ? tile.b : tile.a;
  const rightEndAfter = (tile.a === right) ? tile.b : tile.a;
  const leftScore = model.endPreference[leftEndAfter] || 1.0;
  const rightScore = model.endPreference[rightEndAfter] || 1.0;
  // prefer side that yields lower endScore (i.e., less favorable to opponent)
  return leftScore <= rightScore ? 'left' : 'right';
}

/* =========================
   Move selection: chooseMove(state, mode)
   - mode: 'easy' | 'hard' | 'learned' (alias for hard)
   - returns { tile, side } or null if no playable tile
   - state: { hands: { ai:[], player:[] }, train:[], boneyard:[], ... }
   ========================= */
export function chooseMove(state, mode = 'hard') {
  if (!model) init(); // ensure model loaded

  const aiHand = state.hands.ai;
  const train = state.train || [];
  const playable = playableTiles(aiHand, train);
  if (!playable.length) return null;

  if (mode === 'easy') {
    // random choice
    const idx = Math.floor(Math.random() * playable.length);
    const tile = playable[idx];
    const side = chooseSide(tile, train, state.hands.player);
    return { tile, side };
  }

  // Hard/learned mode: combine heuristic score and learned tile weight
  // Score = alpha * heuristicScore + beta * learnedWeight
  const alpha = 0.7; // heuristic importance
  const beta = 0.3;  // learned weight importance

  // Heuristic: doubles get bonus, higher pip sum preferred
  function heuristicScore(tile) {
    let s = tile.a + tile.b;
    if (tile.a === tile.b) s += 50;
    return s;
  }

  // Evaluate each playable tile
  let best = null;
  let bestScore = -Infinity;
  for (const tile of playable) {
    const h = heuristicScore(tile);
    const w = model.tileWeights[tile.id] || 1.0;
    const combined = alpha * h + beta * w * 10; // scale learned weight
    if (combined > bestScore) {
      bestScore = combined;
      best = tile;
    }
  }

  // If multiple close scores, add small randomness to diversify learning
  const close = playable.filter(t => {
    const h = heuristicScore(t);
    const w = model.tileWeights[t.id] || 1.0;
    const combined = alpha * h + beta * w * 10;
    return (bestScore - combined) < 6; // threshold
  });
  const chosen = close[Math.floor(Math.random() * close.length)];

  const side = chooseSide(chosen, train, state.hands.player);
  return { tile: chosen, side };
}

/* =========================
   Learning update: learnFromRound(summary)
   - summary: {
   * winner: 'player'|'ai'|null,
   * reason: 'domino'|'blocked'|'blocked-tie'|...,
   * moves: [ { who:'ai'|'player', tileId:'a-b', side:'left'|'right' } ], // chronological
   * finalState: clone of state at round end (optional)
   }
   - We update model.tileWeights and model.endPreference based on outcome.
   ========================= */
export function learnFromRound(summary) {
  if (!model) init();
  if (!summary || !summary.moves) return;

  model.meta.roundsSeen = (model.meta.roundsSeen || 0) + 1;

  // Determine reward: +1 for AI win, -1 for AI loss, 0 for tie
  let reward = 0;
  if (summary.winner === 'ai') reward = 1;
  else if (summary.winner === 'player') reward = -1;
  else reward = 0;

  // Learning rates
  const lrPositive = 0.12; // when AI wins, stronger reinforcement
  const lrNegative = 0.06; // when AI loses, smaller penalty
  const lrNeutral = 0.02;

  // Update tile weights for moves AI played
  const aiMoves = summary.moves.filter(m => m.who === 'ai');
  for (const mv of aiMoves) {
    const id = mv.tileId;
    if (!model.tileWeights[id]) model.tileWeights[id] = 1.0;
    if (reward > 0) {
      model.tileWeights[id] += lrPositive * Math.abs(reward) * (1 + Math.random() * 0.06);
    } else if (reward < 0) {
      model.tileWeights[id] = Math.max(0.1, model.tileWeights[id] - lrNegative * Math.abs(reward) * (1 + Math.random() * 0.04));
    } else {
      // small drift
      model.tileWeights[id] += (Math.random() - 0.5) * lrNeutral;
      model.tileWeights[id] = Math.max(0.1, model.tileWeights[id]);
    }
  }

  // Update endPreference: if finalState provided, analyze final ends
  if (summary.finalState && summary.finalState.train && summary.finalState.train.length) {
    const train = summary.finalState.train;
    const leftEnd = train[0].a;
    const rightEnd = train[train.length - 1].b;
    // If AI won, increase preference for ends that appeared; if lost, decrease
    const delta = reward > 0 ? 0.08 : (reward < 0 ? -0.04 : 0.01 * (Math.random() - 0.5));
    model.endPreference[leftEnd] = Math.max(0.1, (model.endPreference[leftEnd] || 1.0) + delta);
    model.endPreference[rightEnd] = Math.max(0.1, (model.endPreference[rightEnd] || 1.0) + delta);
  }

  // Normalize tile weights to keep them in reasonable range (0.1 .. 10)
  for (const k in model.tileWeights) {
    model.tileWeights[k] = Math.max(0.1, Math.min(10, model.tileWeights[k]));
  }
  // Normalize endPreference similarly
  for (let i = 0; i < model.endPreference.length; i++) {
    model.endPreference[i] = Math.max(0.1, Math.min(10, model.endPreference[i]));
  }

  // Meta updates
  model.meta.roundsSeen += 0; // already incremented
  model.meta.lastUpdated = Date.now();

  // Persist model
  saveModel();
}

/* =========================
   Utility: exportModel / importModel
   - For debugging or manual tuning, allow exporting/importing model JSON
   ========================= */
export function exportModel() {
  if (!model) init();
  return JSON.parse(JSON.stringify(model));
}

export function importModel(json) {
  try {
    // basic validation
    if (json && json.tileWeights && json.endPreference) {
      model = json;
      saveModel();
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* =========================
   Small helper: resetModel(name)
   - Resets to default model and saves
   ========================= */
export function resetModel(name = MODEL_NAME) {
  MODEL_NAME = name || DEFAULT_MODEL_NAME;
  model = defaultModel();
  saveModel();
  return model;
}

/* =========================
   Expose current model (read-only copy)
   ========================= */
export function getModelSnapshot() {
  if (!model) init();
  return JSON.parse(JSON.stringify(model));
}

/* =========================
   Initialize default model on module load (non-blocking)
   - This ensures model exists if user forgets to call init()
   ========================= */
try {
  if (!model) init(DEFAULT_MODEL_NAME);
} catch (e) {
  // ignore storage errors
  model = defaultModel();
}

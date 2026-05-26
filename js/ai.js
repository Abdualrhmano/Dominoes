// js/ai.js
const STORAGE_PREFIX = 'dominoes_ai_wardati_';
const DEFAULT_MODEL_NAME = 'wardati_v1';
const MAX_PIP = 6;
let MODEL_NAME = DEFAULT_MODEL_NAME;
let model = null;
let replayBuffer = [];

function storageKey(name) {
  return STORAGE_PREFIX + name;
}

function defaultModel() {
  const tileWeights = {};
  for (let a = 0; a <= MAX_PIP; a++) {
    for (let b = a; b <= MAX_PIP; b++) {
      const id = `${a}-${b}`;
      tileWeights[id] = 1.0;
    }
  }
  const endPreference = Array(MAX_PIP + 1).fill(1.0);
  return {
    tileWeights,
    endPreference,
    meta: { gamesPlayed: 0, roundsSeen: 0, lastUpdated: Date.now() }
  };
}

function saveModel() {
  try {
    const key = storageKey(MODEL_NAME);
    localStorage.setItem(key, JSON.stringify(model));
    model.meta.lastUpdated = Date.now();
  } catch (e) {
    console.warn('Wardati: failed to save model', e);
  }
}

function loadModel(name) {
  try {
    const key = storageKey(name);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tileWeights && parsed.endPreference) return parsed;
    return null;
  } catch (e) {
    console.warn('Wardati: failed to load model', e);
    return null;
  }
}

export function init(modelName = DEFAULT_MODEL_NAME) {
  MODEL_NAME = modelName || DEFAULT_MODEL_NAME;
  const loaded = loadModel(MODEL_NAME);
  if (loaded) model = loaded;
  else {
    model = defaultModel();
    saveModel();
  }
  return getModelSnapshot();
}

export function getModelSnapshot() {
  if (!model) init();
  return JSON.parse(JSON.stringify(model));
}

export function resetModel(name = MODEL_NAME) {
  MODEL_NAME = name || DEFAULT_MODEL_NAME;
  model = defaultModel();
  saveModel();
  replayBuffer = [];
  return getModelSnapshot();
}

export function importModel(json) {
  try {
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

export function exportModel() {
  if (!model) init();
  return JSON.parse(JSON.stringify(model));
}

export function playableTiles(hand, train) {
  if (!Array.isArray(hand)) return [];
  if (!train || train.length === 0) return hand.slice();
  const left = train[0].a;
  const right = train[train.length - 1].b;
  return hand.filter(t => t.a === left || t.b === left || t.a === right || t.b === right);
}

export function chooseSide(tile, train, playerHand = []) {
  if (!train || train.length === 0) return 'right';
  const left = train[0].a;
  const right = train[train.length - 1].b;
  const canLeft = tile.a === left || tile.b === left;
  const canRight = tile.a === right || tile.b === right;
  if (canLeft && !canRight) return 'left';
  if (canRight && !canLeft) return 'right';
  const leftEndAfter = (tile.a === left) ? tile.b : tile.a;
  const rightEndAfter = (tile.a === right) ? tile.b : tile.a;
  const leftScore = (model && model.endPreference[leftEndAfter]) || 1.0;
  const rightScore = (model && model.endPreference[rightEndAfter]) || 1.0;
  return leftScore <= rightScore ? 'left' : 'right';
}

function heuristicScore(tile) {
  let s = tile.a + tile.b;
  if (tile.a === tile.b) s += 50;
  return s;
}

export function chooseMove(state, mode = 'hard') {
  if (!model) init();
  if (!state || !state.hands || !Array.isArray(state.hands.ai)) return null;
  const aiHand = state.hands.ai;
  const train = state.train || [];
  const playable = playableTiles(aiHand, train);
  if (!playable.length) return null;
  if (mode === 'easy') {
    const idx = Math.floor(Math.random() * playable.length);
    const tile = playable[idx];
    const side = chooseSide(tile, train, state.hands.player || []);
    return { tile, side };
  }
  const alpha = 0.7;
  const beta = 0.3;
  let best = null;
  let bestScore = -Infinity;
  for (const tile of playable) {
    const h = heuristicScore(tile);
    const w = model.tileWeights[tile.id] || 1.0;
    const combined = alpha * h + beta * w * 10;
    if (combined > bestScore) {
      bestScore = combined;
      best = tile;
    }
  }
  const close = playable.filter(t => {
    const h = heuristicScore(t);
    const w = model.tileWeights[t.id] || 1.0;
    const combined = alpha * h + beta * w * 10;
    return (bestScore - combined) < 6;
  });
  const chosen = close[Math.floor(Math.random() * close.length)];
  const side = chooseSide(chosen, train, state.hands.player || []);
  return { tile: chosen, side };
}

export function learnFromRound(summary) {
  if (!model) init();
  if (!summary || !Array.isArray(summary.moves)) return;
  model.meta.roundsSeen = (model.meta.roundsSeen || 0) + 1;
  model.meta.gamesPlayed = (model.meta.gamesPlayed || 0);
  let reward = 0;
  if (summary.winner === 'ai') reward = 1;
  else if (summary.winner === 'player') reward = -1;
  const lrPositive = 0.12;
  const lrNegative = 0.06;
  const lrNeutral = 0.02;
  const aiMoves = summary.moves.filter(m => m.who === 'ai');
  for (const mv of aiMoves) {
    const id = mv.tileId;
    if (!model.tileWeights[id]) model.tileWeights[id] = 1.0;
    if (reward > 0) {
      model.tileWeights[id] += lrPositive * Math.abs(reward) * (1 + Math.random() * 0.06);
    } else if (reward < 0) {
      model.tileWeights[id] = Math.max(0.1, model.tileWeights[id] - lrNegative * Math.abs(reward) * (1 + Math.random() * 0.04));
    } else {
      model.tileWeights[id] += (Math.random() - 0.5) * lrNeutral;
      model.tileWeights[id] = Math.max(0.1, model.tileWeights[id]);
    }
  }
  if (summary.finalState && summary.finalState.train && summary.finalState.train.length) {
    const train = summary.finalState.train;
    const leftEnd = train[0].a;
    const rightEnd = train[train.length - 1].b;
    const delta = reward > 0 ? 0.08 : (reward < 0 ? -0.04 : 0.01 * (Math.random() - 0.5));
    model.endPreference[leftEnd] = Math.max(0.1, (model.endPreference[leftEnd] || 1.0) + delta);
    model.endPreference[rightEnd] = Math.max(0.1, (model.endPreference[rightEnd] || 1.0) + delta);
  }

  if (reward < 0 && aiMoves.length) {
    const critical = aiMoves.slice(-3);
    for (const mv of critical) {
      const id = mv.tileId;
      model.tileWeights[id] = Math.max(0.1, model.tileWeights[id] - lrNegative * 2);
    }
  }

  for (const k in model.tileWeights) {
    model.tileWeights[k] = Math.max(0.1, Math.min(10, model.tileWeights[k]));
  }
  for (let i = 0; i < model.endPreference.length; i++) {
    model.endPreference[i] = Math.max(0.1, Math.min(10, model.endPreference[i]));
  }

  pushExperience({
    state: summary.finalState || null,
    moves: summary.moves.slice(),
    reward,
    timestamp: Date.now()
  });

  model.meta.lastUpdated = Date.now();
  saveModel();
}

function pushExperience(exp) {
  replayBuffer.push(exp);
  if (replayBuffer.length > 2000) replayBuffer.shift();
}

export function replayTrain(batchSize = 32) {
  if (!model) init();
  const n = Math.min(batchSize, replayBuffer.length);
  if (n === 0) return;
  for (let i = 0; i < n; i++) {
    const e = replayBuffer[Math.floor(Math.random() * replayBuffer.length)];
    if (!e || !e.moves) continue;
    const aiMoves = e.moves.filter(m => m.who === 'ai');
    for (const mv of aiMoves) {
      const id = mv.tileId;
      if (!model.tileWeights[id]) model.tileWeights[id] = 1.0;
      model.tileWeights[id] += (e.reward * 0.02) * (1 + Math.random() * 0.02);
      model.tileWeights[id] = Math.max(0.1, Math.min(10, model.tileWeights[id]));
    }
  }
  saveModel();
}

try {
  if (!model) init(DEFAULT_MODEL_NAME);
} catch (e) {
  model = defaultModel();
                     }

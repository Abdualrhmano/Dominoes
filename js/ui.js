// js/ui.js
// UI module for Dominoes (وردتي Edition)
// - ES Module
// - Responsible for DOM rendering, event wiring, accessibility, and lightweight UI utilities
// - Does NOT contain game rules; delegates actions to callbacks set by main.js / engine
// - Designed for high performance: uses DocumentFragment, minimal reflows, transform/opacity animations
//
// Public API (instance methods / callbacks):
//   ui = new UI();
//   ui.onTileClick = (tile) => { ... };
//   ui.onDraw = () => { ... };
//   ui.onEndTurn = () => { ... };
//   ui.onReset = () => { ... };
//   ui.onAIModeChange = (mode) => { ... };
//   ui.renderAll(state);
//   ui.renderTrain(train);
//   ui.renderHand(hand);
//   ui.updateBoneyardCount(n);
//   ui.updateScoreboard(scores, round);
//   ui.updateStatus(text);
//   ui.announce(text);
//   ui.showTooltip(msg, duration);
//   ui.showRoundModal(...);
//   ui.showMatchVictory(...);
//   ui.scrollTrainToEnd(side);
//   ui.startConfetti(); ui.stopConfetti();

export default class UI {
  constructor(selectors = {}) {
    // DOM references (ids from index.html)
    this.trainWrap = document.getElementById(selectors.trainWrap || 'train-wrap');
    this.playerHand = document.getElementById(selectors.playerHand || 'player-hand');
    this.boneStack = document.getElementById(selectors.boneStack || 'bone-stack');
    this.boneyardCount = document.getElementById(selectors.boneyardCount || 'boneyard-count');
    this.playerScoreEl = document.getElementById(selectors.playerScore || 'player-score');
    this.aiScoreEl = document.getElementById(selectors.aiScore || 'ai-score');
    this.roundNumberEl = document.getElementById(selectors.roundNumber || 'round-number');
    this.statusEl = document.getElementById(selectors.status || 'status');
    this.modalRoot = document.getElementById(selectors.modalRoot || 'modal-root');
    this.placementHints = document.getElementById('placement-hints');
    this.hintLeft = document.getElementById('hint-left');
    this.hintRight = document.getElementById('hint-right');
    this.liveAnnouncer = document.getElementById('live-announcer');
    this.confettiCanvas = document.getElementById('confetti');

    // Callbacks to be assigned by consumer (main.js / engine)
    this.onTileClick = null;
    this.onDraw = null;
    this.onEndTurn = null;
    this.onReset = null;
    this.onAIModeChange = null;

    // Internal state
    this._confettiRAF = null;
    this._confettiPieces = null;

    // Wire controls
    this._setupControls();
    // Accessibility: keyboard shortcuts
    this._setupShortcuts();
    // Resize handler for confetti canvas
    window.addEventListener('resize', () => {
      if (this.confettiCanvas && this.confettiCanvas.style.display !== 'none') {
        this.confettiCanvas.width = window.innerWidth;
        this.confettiCanvas.height = window.innerHeight;
      }
    });
  }

  /* -------------------------
     Setup UI controls
     ------------------------- */
  _setupControls() {
    const drawBtn = document.getElementById('draw-btn');
    const endTurnBtn = document.getElementById('end-turn-btn');
    const resetBtn = document.getElementById('reset-match');
    const aiModeSelect = document.getElementById('ai-mode');

    if (drawBtn) drawBtn.addEventListener('click', () => { if (this.onDraw) this.onDraw(); });
    if (endTurnBtn) endTurnBtn.addEventListener('click', () => { if (this.onEndTurn) this.onEndTurn(); });
    if (this.boneStack) this.boneStack.addEventListener('click', () => { if (this.onDraw) this.onDraw(); });
    if (resetBtn) resetBtn.addEventListener('click', () => { if (this.onReset) this.onReset(); });
    if (aiModeSelect) aiModeSelect.addEventListener('change', (e) => { if (this.onAIModeChange) this.onAIModeChange(e.target.value); });
  }

  _setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Avoid interfering with form inputs
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'd' || e.key === 'D') { if (this.onDraw) this.onDraw(); }
      if (e.key === 'e' || e.key === 'E') { if (this.onEndTurn) this.onEndTurn(); }
      if (e.key === 'r' || e.key === 'R') { if (this.onReset && confirm('إعادة المباراة؟')) this.onReset(); }
    });
  }

  /* -------------------------
     Rendering: train & hand
     ------------------------- */

  // Render everything from a state snapshot
  renderAll(state) {
    this.renderTrain(state.train || []);
    this.renderHand(state.hands.player || []);
    this.updateBoneyardCount(state.boneyard ? state.boneyard.length : (state.boneyardCount ?? 0));
    this.updateScoreboard(state.scores || { player: 0, ai: 0 }, state.round || 1);
  }

  // Render train (placed tiles)
  renderTrain(train) {
    // Use DocumentFragment to minimize reflows
    const frag = document.createDocumentFragment();
    for (let i = 0; i < train.length; i++) {
      const tile = train[i];
      const el = this._createTileElement(tile, false);
      // Add snap animation class and slight stagger
      el.classList.add('anim-snap');
      el.style.transitionDelay = `${i * 18}ms`;
      frag.appendChild(el);
    }
    // Replace content
    this.trainWrap.innerHTML = '';
    this.trainWrap.appendChild(frag);
  }

  // Render player's hand
  renderHand(hand) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < hand.length; i++) {
      const tile = hand[i];
      const el = this._createTileElement(tile, true);
      el.tabIndex = 0;
      el.dataset.index = i;
      // Event handlers
      el.addEventListener('click', () => { if (this.onTileClick) this.onTileClick(tile); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (this.onTileClick) this.onTileClick(tile); }
      });
      frag.appendChild(el);
    }
    this.playerHand.innerHTML = '';
    this.playerHand.appendChild(frag);
  }

  // Create tile DOM element (visual only)
  _createTileElement(tile, isHand = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tile';
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('aria-label', `قطعة ${tile.a} و ${tile.b}`);

    // left half
    const left = document.createElement('div');
    left.className = 'half pips-' + tile.a;
    for (let i = 0; i < this._pipCount(tile.a); i++) {
      const p = document.createElement('div');
      p.className = 'pip';
      left.appendChild(p);
    }

    // divider
    const div = document.createElement('div');
    div.className = 'divider';

    // right half
    const right = document.createElement('div');
    right.className = 'half pips-' + tile.b;
    for (let i = 0; i < this._pipCount(tile.b); i++) {
      const p = document.createElement('div');
      p.className = 'pip';
      right.appendChild(p);
    }

    wrapper.appendChild(left);
    wrapper.appendChild(div);
    wrapper.appendChild(right);

    return wrapper;
  }

  _pipCount(n) { return n === 0 ? 1 : n; }

  /* -------------------------
     Small UI updates
     ------------------------- */

  updateBoneyardCount(n) {
    if (this.boneyardCount) this.boneyardCount.textContent = n;
  }

  updateScoreboard(scores, round) {
    if (this.playerScoreEl) this.playerScoreEl.textContent = scores.player;
    if (this.aiScoreEl) this.aiScoreEl.textContent = scores.ai;
    if (this.roundNumberEl) this.roundNumberEl.textContent = round;
  }

  updateStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  announce(text) {
    if (!this.liveAnnouncer) return;
    this.liveAnnouncer.textContent = text;
    // Clear after short time to keep aria-live fresh
    setTimeout(() => { this.liveAnnouncer.textContent = ''; }, 1400);
  }

  /* -------------------------
     Placement hints (left/right)
     ------------------------- */
  showPlacementHints(canLeft, canRight) {
    if (canLeft) this.hintLeft.classList.add('show'); else this.hintLeft.classList.remove('show');
    if (canRight) this.hintRight.classList.add('show'); else this.hintRight.classList.remove('show');
  }

  hidePlacementHints() {
    this.hintLeft.classList.remove('show');
    this.hintRight.classList.remove('show');
  }

  /* -------------------------
     Modals & tooltips
     ------------------------- */

  showTooltip(msg, duration = 3000) {
    const tip = document.createElement('div');
    tip.className = 'modal-backdrop';
    tip.innerHTML = `<div class="modal center" style="padding:10px; max-width:420px;"><div style="color:var(--muted)">${msg}</div></div>`;
    document.body.appendChild(tip);
    setTimeout(() => { tip.remove(); }, duration);
  }

  showRoundModal(winner, points, reason, scores) {
    this.modalRoot.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const card = document.createElement('div');
    card.className = 'modal';

    const title = winner ? (winner === 'player' ? 'فائز الجولة — أنت' : 'فائز الجولة — وردتي') : 'نتيجة الجولة';
    const reasonText = reason === 'domino' ? 'أفرغ اليد' : (reason === 'blocked' ? 'اللعبة أغلقت' : 'تعادل في الإغلاق');

    card.innerHTML = `
      <h2 style="color:var(--accent-gold); margin:0 0 8px 0;">${title}</h2>
      <div class="muted" style="margin-bottom:12px;">${reasonText}</div>
      <div style="font-weight:800; font-size:18px; margin-bottom:12px;">${points > 0 ? `نقاط مكتسبة: ${points}` : 'لا نقاط'}</div>
      <div style="margin-bottom:12px; color:var(--muted);">المجموع — أنت: <strong>${scores.player}</strong> • وردتي: <strong>${scores.ai}</strong></div>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="next-round" class="btn primary">الجولة التالية</button>
        <button id="close-modal" class="btn">إغلاق</button>
      </div>
    `;
    backdrop.appendChild(card);
    this.modalRoot.appendChild(backdrop);
    this.modalRoot.setAttribute('aria-hidden', 'false');

    const nextBtn = document.getElementById('next-round');
    const closeBtn = document.getElementById('close-modal');

    if (nextBtn) nextBtn.addEventListener('click', () => {
      backdrop.remove();
      this.modalRoot.innerHTML = '';
      this.modalRoot.setAttribute('aria-hidden', 'true');
      document.dispatchEvent(new CustomEvent('nextRound'));
    });
    if (closeBtn) closeBtn.addEventListener('click', () => {
      backdrop.remove();
      this.modalRoot.innerHTML = '';
      this.modalRoot.setAttribute('aria-hidden', 'true');
    });
  }

  showMatchVictory(champion, scores) {
    this.modalRoot.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const card = document.createElement('div');
    card.className = 'modal';

    const title = champion === 'player' ? 'البطل — أنت!' : 'البطل — وردتي';
    card.innerHTML = `
      <h2 style="color:var(--accent-gold); margin:0 0 8px 0;">${title}</h2>
      <div class="muted" style="margin-bottom:12px;">انتهت المباراة</div>
      <div style="font-weight:900; font-size:20px; margin-bottom:12px; color:var(--accent-gold);">أنت: ${scores.player} • وردتي: ${scores.ai}</div>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="play-again" class="btn primary">العب مرة أخرى</button>
        <button id="close-match" class="btn">إغلاق</button>
      </div>
    `;
    backdrop.appendChild(card);
    this.modalRoot.appendChild(backdrop);
    this.modalRoot.setAttribute('aria-hidden', 'false');

    // Start confetti
    this.startConfetti();

    const playBtn = document.getElementById('play-again');
    const closeBtn = document.getElementById('close-match');

    if (playBtn) playBtn.addEventListener('click', () => {
      this.stopConfetti();
      backdrop.remove();
      this.modalRoot.innerHTML = '';
      this.modalRoot.setAttribute('aria-hidden', 'true');
      document.dispatchEvent(new CustomEvent('playAgain'));
    });
    if (closeBtn) closeBtn.addEventListener('click', () => {
      this.stopConfetti();
      backdrop.remove();
      this.modalRoot.innerHTML = '';
      this.modalRoot.setAttribute('aria-hidden', 'true');
    });
  }

  /* -------------------------
     Scrolling & visual helpers
     ------------------------- */

  scrollTrainToEnd(side = 'right') {
    try {
      if (side === 'right') this.trainWrap.scrollTo({ left: this.trainWrap.scrollWidth, behavior: 'smooth' });
      else this.trainWrap.scrollTo({ left: 0, behavior: 'smooth' });
    } catch (e) {
      // ignore
    }
  }

  /* -------------------------
     Confetti (lightweight)
     ------------------------- */

  startConfetti() {
    const canvas = this.confettiCanvas;
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const pieces = [];
    const colors = ['#ffd166', '#7ef9ff', '#ff7ab6', '#9bffb8', '#ffd1a9'];
    for (let i = 0; i < 80; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: 6 + Math.random() * 10,
        h: 6 + Math.random() * 10,
        vx: -2 + Math.random() * 4,
        vy: 2 + Math.random() * 6,
        r: Math.random() * 360,
        vr: -6 + Math.random() * 12,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 0.8 + Math.random() * 0.2
      });
    }
    this._confettiPieces = pieces;
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        if (p.y > canvas.height + 40) {
          p.y = -40;
          p.x = Math.random() * canvas.width;
        }
      }
      this._confettiRAF = requestAnimationFrame(loop);
    };
    loop();
    // auto-stop after 6s
    setTimeout(() => this.stopConfetti(), 6000);
  }

  stopConfetti() {
    if (this._confettiRAF) cancelAnimationFrame(this._confettiRAF);
    if (this.confettiCanvas) this.confettiCanvas.style.display = 'none';
    this._confettiPieces = null;
    this._confettiRAF = null;
  }
}

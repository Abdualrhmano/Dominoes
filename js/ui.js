// js/ui.js
export default class UI {
  constructor() {
    this.root = document.getElementById('app');
    this.trainWrap = document.getElementById('train-wrap');
    this.playerHandEl = document.getElementById('player-hand');
    this.boneyardCountEl = document.getElementById('boneyard-count');
    this.playerScoreEl = document.getElementById('player-score');
    this.aiScoreEl = document.getElementById('ai-score');
    this.roundNumberEl = document.getElementById('round-number');
    this.statusEl = document.getElementById('status');
    this.liveAnnouncer = document.getElementById('live-announcer');
    this.boneStack = document.getElementById('bone-stack');

    this.onTileClick = null;
    this.onDraw = null;
    this.onEndTurn = null;
    this.onResetMatch = null;
    this.onAIModeChange = null;

    this._bindControls();
  }

  _bindControls() {
    const drawBtn = document.getElementById('draw-btn');
    const endBtn = document.getElementById('end-turn-btn');
    const resetMatch = document.getElementById('reset-match');
    const aiMode = document.getElementById('ai-mode');
    const boneStack = this.boneStack;

    if (drawBtn) drawBtn.addEventListener('click', () => this.onDraw && this.onDraw());
    if (endBtn) endBtn.addEventListener('click', () => this.onEndTurn && this.onEndTurn());
    if (resetMatch) resetMatch.addEventListener('click', () => this.onResetMatch && this.onResetMatch());
    if (aiMode) aiMode.addEventListener('change', (e) => this.onAIModeChange && this.onAIModeChange(e.target.value));
    if (boneStack) boneStack.addEventListener('click', () => this.onDraw && this.onDraw());
  }

  setAIMode(mode) {
    const sel = document.getElementById('ai-mode');
    if (sel) sel.value = mode;
    const selLanding = document.getElementById('ai-mode-landing');
    if (selLanding) selLanding.value = mode;
  }

  updateScoreboard(scores = { player: 0, ai: 0 }, round = 1) {
    if (this.playerScoreEl) this.playerScoreEl.textContent = String(scores.player || 0);
    if (this.aiScoreEl) this.aiScoreEl.textContent = String(scores.ai || 0);
    if (this.roundNumberEl) this.roundNumberEl.textContent = String(round || 1);
  }

  updateBoneyardCount(count = 0) {
    if (this.boneyardCountEl) this.boneyardCountEl.textContent = String(count);
  }

  updateStatus(text = '') {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  announce(text = '') {
    if (this.liveAnnouncer) {
      this.liveAnnouncer.textContent = text;
      // briefly clear to allow repeated announcements
      setTimeout(() => { this.liveAnnouncer.textContent = ''; }, 1200);
    }
  }

  showTooltip(text) {
    // simple ephemeral tooltip using status area
    const prev = this.statusEl && this.statusEl.textContent;
    this.updateStatus(text);
    setTimeout(() => { this.updateStatus(prev || ''); }, 2500);
  }

  renderAll(state) {
    this.renderTrain(state.train || []);
    this.renderHand(state.hands ? state.hands.player : []);
    this.updateBoneyardCount(state.boneyard ? state.boneyard.length : (state.boneyardCount || 0));
    this.updateScoreboard(state.scores || { player: 0, ai: 0 }, state.round || 1);
  }

  renderTrain(train = []) {
    if (!this.trainWrap) return;
    this.trainWrap.innerHTML = '';
    for (let i = 0; i < train.length; i++) {
      const t = train[i];
      const el = this._createTileElement(t, false);
      el.classList.add('placed');
      this.trainWrap.appendChild(el);
    }
    // scroll to end
    this.scrollTrainToEnd('right');
  }

  renderHand(hand = []) {
    if (!this.playerHandEl) return;
    this.playerHandEl.innerHTML = '';
    for (const tile of hand) {
      const el = this._createTileElement(tile, true);
      el.tabIndex = 0;
      el.addEventListener('click', () => this.onTileClick && this.onTileClick(tile));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.onTileClick && this.onTileClick(tile);
        }
      });
      this.playerHandEl.appendChild(el);
    }
  }

  _createTileElement(tile, interactive = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tile';
    wrapper.setAttribute('data-id', tile.id || `${tile.a}-${tile.b}`);
    wrapper.setAttribute('role', interactive ? 'button' : 'img');
    wrapper.setAttribute('aria-label', `قطعة ${tile.a} و ${tile.b}`);

    const left = document.createElement('div');
    left.className = 'half';
    const divider = document.createElement('div');
    divider.className = 'divider';
    const right = document.createElement('div');
    right.className = 'half';

    // render pips for left half and right half
    this._renderPips(left, tile.a);
    this._renderPips(right, tile.b);

    wrapper.appendChild(left);
    wrapper.appendChild(divider);
    wrapper.appendChild(right);

    return wrapper;
  }

  _renderPips(container, value) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    grid.style.gap = '4px';
    grid.style.alignItems = 'center';
    grid.style.justifyItems = 'center';
    grid.style.width = '100%';
    grid.style.height = '100%';

    // simple mapping to show pips in 3x2 layout (visual only)
    const positions = [0,1,2,3,4,5];
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement('div');
      dot.className = 'pip';
      dot.style.opacity = '0';
      grid.appendChild(dot);
    }

    // show pips according to value (0..6)
    const dots = container.querySelectorAll('.pip');
    const showIndices = this._pipIndicesForValue(value);
    showIndices.forEach(idx => {
      if (dots[idx]) dots[idx].style.opacity = '1';
    });

    container.appendChild(grid);
  }

  _pipIndicesForValue(v) {
    // map 0..6 to indices in 6-slot grid (0..5)
    // layout:
    // [0][1][2]
    // [3][4][5]
    // We'll approximate classic pip patterns
    switch (v) {
      case 0: return [];
      case 1: return [4];
      case 2: return [0,5];
      case 3: return [0,4,5];
      case 4: return [0,2,3,5];
      case 5: return [0,2,3,4,5];
      case 6: return [0,1,2,3,4,5];
      default: return [];
    }
  }

  scrollTrainToEnd(side = 'right') {
    if (!this.trainWrap) return;
    if (side === 'right') {
      this.trainWrap.scrollLeft = this.trainWrap.scrollWidth;
    } else {
      this.trainWrap.scrollLeft = 0;
    }
  }

  showRoundModal(winner, points, reason, scores) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;
    modalRoot.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h2');
    title.textContent = winner ? (winner === 'player' ? 'فاز اللاعب' : 'فازت وردتي') : 'تعادل';
    const body = document.createElement('p');
    body.textContent = winner ? `النقاط: ${points}` : 'الجولة انتهت بالتعادل';
    const scoreSummary = document.createElement('div');
    scoreSummary.className = 'muted';
    scoreSummary.textContent = `النتيجة الآن — لاعب: ${scores.player} — وردتي: ${scores.ai}`;

    const actions = document.createElement('div');
    actions.style.marginTop = '12px';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn primary';
    nextBtn.textContent = 'الجولة التالية';
    nextBtn.addEventListener('click', () => {
      modalRoot.innerHTML = '';
      modalRoot.setAttribute('aria-hidden', 'true');
      document.dispatchEvent(new Event('nextRound'));
    });

    const matchBtn = document.createElement('button');
    matchBtn.className = 'btn';
    matchBtn.textContent = 'إعادة المباراة';
    matchBtn.addEventListener('click', () => {
      modalRoot.innerHTML = '';
      modalRoot.setAttribute('aria-hidden', 'true');
      document.dispatchEvent(new Event('playAgain'));
    });

    actions.appendChild(nextBtn);
    actions.appendChild(matchBtn);

    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(scoreSummary);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.appendChild(backdrop);
    modalRoot.setAttribute('aria-hidden', 'false');
  }

  showMatchVictory(champion, scores) {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;
    modalRoot.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';

    const title = document.createElement('h2');
    title.textContent = champion === 'player' ? 'مبروك — فزت بالمباراة' : 'وردتي فازت بالمباراة';
    const body = document.createElement('p');
    body.textContent = `النتيجة النهائية — لاعب: ${scores.player} — وردتي: ${scores.ai}`;

    const actions = document.createElement('div');
    actions.style.marginTop = '12px';
    const playAgain = document.createElement('button');
    playAgain.className = 'btn primary';
    playAgain.textContent = 'العب مرة أخرى';
    playAgain.addEventListener('click', () => {
      modalRoot.innerHTML = '';
      modalRoot.setAttribute('aria-hidden', 'true');
      document.dispatchEvent(new Event('playAgain'));
    });

    actions.appendChild(playAgain);

    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.appendChild(backdrop);
    modalRoot.setAttribute('aria-hidden', 'false');

    // confetti (simple)
    this._fireConfetti();
  }

  _fireConfetti() {
    const canvas = document.getElementById('confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -Math.random() * 200,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 4,
        size: 6 + Math.random() * 8,
        color: ['#ffd166','#00a6c7','#ff6b6b','#8ce99a'][Math.floor(Math.random()*4)],
        rot: Math.random() * Math.PI * 2
      });
    }
    let t = 0;
    const loop = () => {
      t++;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 0.1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
      }
      if (t < 120) requestAnimationFrame(loop);
      else {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        canvas.style.display = 'none';
      }
    };
    loop();
  }
  }

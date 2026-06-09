// ═══════════════════════════════════════════════
//  game.js  –  Shared logic for all three levels
// ═══════════════════════════════════════════════

// ── Constants ────────────────────────────────
const CIRCLE_START_SIZE  = 14;   // px diameter
const CIRCLE_MAX_SIZE    = 90;   // px – circle disappears when it reaches this
const CIRCLE_GROW_SPEED  = 0.045; // px per ms * 60fps ≈ px/frame
const SPAWN_INTERVAL_MS  = 1200; // ms between new circle spawns
const MAX_CIRCLES        = 6;    // max simultaneous circles on screen

// Letter pool fetched from API and stored here
let letterPool = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                  'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Active circles array – every level uses this
let activeCircles = [];

// Game state
let score        = 0;
let gameRunning  = false;
let animFrameId  = null;
let spawnTimerId = null;
let lastTimestamp = 0;

// DOM references (set by each level's init)
let arena, scoreEl, goalFill, flash;

// Callbacks set by each level
let onHit     = () => {};
let onMiss    = () => {};
let onCircleExpired = () => {};
let onCircleCreated = () => {};

// ── Fetch letter pool from quotable API ──────
// We use the quote to seed our letter pool with
// the quote's words turned into unique letters.
async function fetchLetterPool() {
  try {
    const res  = await fetch('https://api.quotable.io/random?minLength=60&maxLength=120');
    const data = await res.json();

    // Extract unique uppercase letters from the quote content
    const letters = [...new Set(
      data.content
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .split('')
    )].sort();

    if (letters.length >= 10) {
      letterPool = letters;
    }

    return data; // also return full quote for homepage use
  } catch {
    // fallback – keep default letterPool
    return null;
  }
}

// ── Circle factory ───────────────────────────
function createCircle(x, y, letter = null) {
  const size = CIRCLE_START_SIZE;

  // DOM
  const el = document.createElement('div');
  el.className = 'circle';
  el.style.left   = x + 'px';
  el.style.top    = y + 'px';
  el.style.width  = size + 'px';
  el.style.height = size + 'px';

  const inner = document.createElement('div');
  inner.className = 'circle-inner';

  const ageRing = document.createElement('div');
  ageRing.className = 'circle-age-ring';

  el.appendChild(inner);
  el.appendChild(ageRing);

  if (letter) {
    const letterEl = document.createElement('span');
    letterEl.className = 'circle-letter';
    letterEl.textContent = letter;
    el.appendChild(letterEl);
  }

  arena.appendChild(el);

  const obj = { el, x, y, size, letter, hovered: false, id: Math.random() };
  activeCircles.push(obj);
  onCircleCreated(obj);
  return obj;
}

// ── Remove a circle from DOM + array ─────────
function removeCircle(circleObj) {
  if (circleObj.el && circleObj.el.parentNode) {
    circleObj.el.parentNode.removeChild(circleObj.el);
  }
  const idx = activeCircles.indexOf(circleObj);
  if (idx !== -1) activeCircles.splice(idx, 1);
}

// ── Clear all circles ─────────────────────────
function clearAllCircles() {
  // copy array because removeCircle mutates it
  [...activeCircles].forEach(removeCircle);
}

// ── Random spawn position ─────────────────────
function randomSpawnPos() {
  const margin = CIRCLE_MAX_SIZE;
  const w = arena.clientWidth;
  const h = arena.clientHeight;
  return {
    x: margin + Math.random() * (w - margin * 2),
    y: margin + Math.random() * (h - margin * 2)
  };
}

// ── Random letter from pool ───────────────────
function randomLetter() {
  return letterPool[Math.floor(Math.random() * letterPool.length)];
}

// ── Spawn one circle (called by interval) ────
function spawnCircle(withLetter) {
  if (!gameRunning) return;
  if (activeCircles.length >= MAX_CIRCLES) return;

  const pos    = randomSpawnPos();
  const letter = withLetter ? randomLetter() : null;
  createCircle(pos.x, pos.y, letter);
}

// ── Main grow loop ────────────────────────────
function growLoop(timestamp) {
  if (!gameRunning) return;

  const delta = Math.min(timestamp - lastTimestamp, 50); // cap at 50ms
  lastTimestamp = timestamp;

  const toRemove = [];

  activeCircles.forEach(c => {
    c.size += CIRCLE_GROW_SPEED * delta;

    if (c.size >= CIRCLE_MAX_SIZE) {
      toRemove.push(c);
      return;
    }

    // Update DOM
    c.el.style.width  = c.size + 'px';
    c.el.style.height = c.size + 'px';

    // Update age ring rotation (0..360 as circle grows)
    const progress = (c.size - CIRCLE_START_SIZE) / (CIRCLE_MAX_SIZE - CIRCLE_START_SIZE);
    c.el.querySelector('.circle-age-ring').style.transform =
      `rotate(${progress * 360}deg)`;

    // Scale letter font inside circle
    const lEl = c.el.querySelector('.circle-letter');
    if (lEl) {
      lEl.style.fontSize = Math.max(10, c.size * 0.38) + 'px';
    }
  });

  // Handle expired circles
  toRemove.forEach(c => {
    removeCircle(c);
    onCircleExpired(c);
  });

  animFrameId = requestAnimationFrame(growLoop);
}

// ── Hit test: is (px,py) inside circle? ───────
function circleAtPoint(px, py) {
  for (let i = activeCircles.length - 1; i >= 0; i--) {
    const c = activeCircles[i];
    const dx = px - c.x;
    const dy = py - c.y;
    const r  = c.size / 2;
    if (dx*dx + dy*dy <= r*r) return c;
  }
  return null;
}

// ── Flash feedback ────────────────────────────
function showFlash(type) {
  if (!flash) return;
  flash.className = `flash ${type} show`;
  setTimeout(() => flash.classList.remove('show'), 120);
}

// ── Score popup ───────────────────────────────
function showScorePop(x, y, text = '+1') {
  const el = document.createElement('div');
  el.className = 'score-pop';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  arena.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// ── Miss indicator ────────────────────────────
function showMissX(x, y) {
  const el = document.createElement('div');
  el.className = 'miss-x';
  el.textContent = '✕';
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  arena.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

// ── Update HUD ────────────────────────────────
function updateHUD(goal) {
  if (scoreEl) scoreEl.textContent = score;
  if (goalFill) goalFill.style.width = Math.min(100, (score / goal) * 100) + '%';
}

// ── Start / Stop game loop ────────────────────
function startGameLoop(withLetter) {
  gameRunning  = true;
  lastTimestamp = performance.now();
  animFrameId  = requestAnimationFrame(growLoop);

  // spawn first circle immediately
  spawnCircle(withLetter);

  spawnTimerId = setInterval(() => spawnCircle(withLetter), SPAWN_INTERVAL_MS);
}

function stopGameLoop() {
  gameRunning = false;
  if (animFrameId)  cancelAnimationFrame(animFrameId);
  if (spawnTimerId) clearInterval(spawnTimerId);
  clearAllCircles();
}

// ── Save / load high scores ───────────────────
function getHighScores() {
  try {
    return JSON.parse(localStorage.getItem('aimgame_scores') || '{}');
  } catch { return {}; }
}

function saveHighScore(level, val) {
  const scores = getHighScores();
  if ((scores[level] || 0) < val) {
    scores[level] = val;
    localStorage.setItem('aimgame_scores', JSON.stringify(scores));
  }
}

// ── Unlock tracking ───────────────────────────
function getUnlocked() {
  try {
    return JSON.parse(localStorage.getItem('aimgame_unlocked') || '[1]');
  } catch { return [1]; }
}

function unlockLevel(n) {
  const ul = getUnlocked();
  if (!ul.includes(n)) {
    ul.push(n);
    localStorage.setItem('aimgame_unlocked', JSON.stringify(ul));
  }
}

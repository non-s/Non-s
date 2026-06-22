// Matrix rain background
const canvas = document.getElementById('matrix');
const ctx = canvas?.getContext('2d');
const MATRIX_CELL = 16;
let cols = 0;
let drops = [];

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const nextCols = Math.ceil(canvas.width / MATRIX_CELL);
  drops = Array.from({ length: nextCols }, (_, i) => drops[i] || 1);
  cols = nextCols;
}
resize();
window.addEventListener('resize', resize);

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

function drawMatrix() {
  if (!ctx || !canvas) return;
  ctx.fillStyle = 'rgba(13,17,23,0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#00ff41';
  ctx.font = '14px Fira Code';
  drops.forEach((y, i) => {
    const char = chars[Math.floor(Math.random() * chars.length)];
    ctx.fillText(char, i * 16, y * 16);
    if (y * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
    drops[i]++;
  });
}
if (ctx) setInterval(drawMatrix, 60);

// Typing animation
const phrases = ['cat about.txt', 'ls /projects/', 'git log --oneline', './run.sh'];
let pIdx = 0;
let cIdx = 0;
let deleting = false;
const typedEl = document.getElementById('typed');

function typeLoop() {
  const phrase = phrases[pIdx];
  if (!deleting) {
    typedEl.textContent = phrase.slice(0, ++cIdx);
    if (cIdx === phrase.length) {
      deleting = true;
      setTimeout(typeLoop, 1800);
      return;
    }
  } else {
    typedEl.textContent = phrase.slice(0, --cIdx);
    if (cIdx === 0) {
      deleting = false;
      pIdx = (pIdx + 1) % phrases.length;
    }
  }
  setTimeout(typeLoop, deleting ? 50 : 90);
}
if (typedEl) typeLoop();

// Firebase Realtime Database presence: visitors online now.
const PRESENCE_TTL_MS = 120000;
const PRESENCE_HEARTBEAT_MS = 45000;
const PRESENCE_MAX_VIEWERS = 500;
const HUB_SID = createSessionId();

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `sid-${Date.now().toString(36)}-${Math.round(performance.now() * 1000).toString(36)}`;
}

function setVisitorStatus(text) {
  const el = document.getElementById('visitorCount');
  if (el) el.textContent = text;
}

function setVisitorCount(count) {
  const suffix = count === 1 ? 'pessoa online agora' : 'pessoas online agora';
  setVisitorStatus(`● ${count} ${suffix}`);
}

(async function initPresence() {
  try {
    if (!window.firebase || !window.firebaseConfig) throw new Error('Firebase nao carregado.');
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(window.firebaseConfig);
    const credential = await firebase.auth().signInAnonymously();
    const userId = credential.user?.uid || firebase.auth().currentUser?.uid || HUB_SID;
    const db = firebase.database(app);
    const presenceRoot = db.ref('non_s_presence');
    const visitorRef = presenceRoot.child(userId);
    const connectedRef = db.ref('.info/connected');
    let heartbeatTimer = null;
    let presenceQuery = null;
    let presenceListener = null;

    const writeHeartbeat = () => visitorRef.set({ t: firebase.database.ServerValue.TIMESTAMP });
    const stopHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    };

    const subscribePresence = () => {
      if (presenceQuery && presenceListener) presenceQuery.off('value', presenceListener);
      presenceQuery = presenceRoot
        .orderByChild('t')
        .startAt(Date.now() - PRESENCE_TTL_MS)
        .limitToLast(PRESENCE_MAX_VIEWERS);
      presenceListener = snapshot => setVisitorCount(snapshot.numChildren());
      presenceQuery.on('value', presenceListener, err => handleError(err, 'Firebase presence read'));
    };

    connectedRef.on('value', snapshot => {
      if (!snapshot.val()) {
        stopHeartbeat();
        return;
      }
      visitorRef.onDisconnect().remove();
      writeHeartbeat().catch(err => handleError(err, 'Firebase presence heartbeat'));
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        writeHeartbeat().catch(err => handleError(err, 'Firebase presence heartbeat'));
      }, PRESENCE_HEARTBEAT_MS);
    });

    subscribePresence();
    setInterval(subscribePresence, PRESENCE_TTL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        writeHeartbeat().catch(err => handleError(err, 'Firebase presence resume'));
      }
    });
    window.addEventListener('pagehide', () => {
      stopHeartbeat();
      visitorRef.remove().catch(() => {});
    });
  } catch (err) {
    handleError(err, 'Firebase presence');
  }
})();

/** Handles errors. @param {Error} err @param {string} [context] */
function handleError(err, context) {
  const msg = (err && err.message) || String(err) || 'Erro inesperado';
  console.error('[handleError]', context, err);
  setVisitorStatus('● online');
}

/** Returns true if every string value is non-empty after trim. @param {...string} values */
function validateRequired(...values) {
  return values.every(v => typeof v === 'string' && v.trim().length > 0);
}

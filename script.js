// Matrix rain background
const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const cols = Math.floor(canvas.width / 16);
const drops = Array(cols).fill(1);

function drawMatrix() {
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
setInterval(drawMatrix, 60);

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
typeLoop();

// Firebase Realtime Database presence: visitors online now.
const HUB_SID = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

(async () => {
  try {
    const app = firebase.initializeApp(window.firebaseConfig);
    await firebase.auth().signInAnonymously();
    const db = firebase.database(app);
    const visitorRef = db.ref(`non_s_presence/${HUB_SID}`);
    const connectedRef = db.ref('.info/connected');

    connectedRef.on('value', snapshot => {
      if (!snapshot.val()) return;
      visitorRef.onDisconnect().remove();
      visitorRef.set({ t: firebase.database.ServerValue.TIMESTAMP });
    });

    db.ref('non_s_presence').on('value', snapshot => {
      const n = snapshot.numChildren();
      const el = document.getElementById('visitorCount');
      if (el) el.innerHTML = `<i class="fas fa-circle"></i> ${n} ${n === 1 ? 'pessoa' : 'pessoas'} online agora`;
    });
  } catch (err) {
    handleError(err, 'Firebase presence');
  }
})();

/** Handles errors. @param {Error} err @param {string} [context] */
function handleError(err, context) {
  const msg = (err && err.message) || String(err) || 'Erro inesperado';
  console.error('[handleError]', context, err);
  const el = document.getElementById('visitorCount');
  if (el) el.innerHTML = '<i class="fas fa-circle"></i> online';
}

/** Returns true if every string value is non-empty after trim. @param {...string} values */
function validateRequired(...values) {
  return values.every(v => typeof v === 'string' && v.trim().length > 0);
}

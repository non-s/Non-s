// Matrix rain background
const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ01アABCDEF0123456789'.split('');
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
let pIdx = 0, cIdx = 0, deleting = false;
const typedEl = document.getElementById('typed');

function typeLoop() {
  const phrase = phrases[pIdx];
  if (!deleting) {
    typedEl.textContent = phrase.slice(0, ++cIdx);
    if (cIdx === phrase.length) { deleting = true; setTimeout(typeLoop, 1800); return; }
  } else {
    typedEl.textContent = phrase.slice(0, --cIdx);
    if (cIdx === 0) { deleting = false; pIdx = (pIdx + 1) % phrases.length; }
  }
  setTimeout(typeLoop, deleting ? 50 : 90);
}
typeLoop();

/* ── Supabase — visitantes online em tempo real ── */
const SUPABASE_URL      = 'https://bvquyfzllqnbfxncsacn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cXV5ZnpsbHFuYmZ4bmNzYWNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxODU1MzQsImV4cCI6MjA5Mzc2MTUzNH0.xa_rs4bVLoTv58P7U8rDOaPjo1Dqt60q8cR-IWFpbug';
const sbHub = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const HUB_SID = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

(async () => {
    await sbHub.auth.signInAnonymously();
    const ch = sbHub.channel('hub-visitors', { config: { presence: { key: HUB_SID } } });
    ch.on('presence', { event: 'sync' }, () => {
        const n = Object.keys(ch.presenceState()).length;
        const el = document.getElementById('visitorCount');
        if (el) el.innerHTML = `<i class="fas fa-circle"></i> ${n} ${n === 1 ? 'pessoa' : 'pessoas'} online agora`;
    });
    ch.subscribe(async s => { if (s === 'SUBSCRIBED') await ch.track({ t: Date.now() }); });
})();

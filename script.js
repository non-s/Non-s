// Matrix rain background
const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ01アABCDEF0123456789'.split('');
let cols, drops;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const newCols = Math.floor(canvas.width / 16);
  if (newCols !== cols) {
    cols = newCols;
    drops = Array(cols).fill(1);
  }
}
resize();
window.addEventListener('resize', resize);

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

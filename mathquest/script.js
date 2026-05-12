/* ─── Configuração do Supabase ─────────────────────────────────────────────
 * Substitua pelos valores do seu projeto Supabase.
 * Settings → API → Project URL e anon public key.
 * A chave anon é pública por design — o RLS protege os dados no servidor.
 * ─────────────────────────────────────────────────────────────────────── */
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── Estado ────────────────────────────────────────────────────────────── */
const state = {
    userId:        null,
    nickname:      '',
    xp:            0,
    stars:         {},          // { '1': 3, '2': 2, ... }
    achievements:  [],
    currentPhase:  null,
    questions:     [],
    qIndex:        0,
    hearts:        3,
    correct:       0,
    answered:      false,
    earnedXp:      0,
    muted:         localStorage.getItem('mq_muted') === '1',
};

/* ─── Utilitários ───────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rand    = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick    = arr   => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr   => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep   = ms    => new Promise(r => setTimeout(r, ms));

/* ─── Toast ─────────────────────────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = 'info') {
    const el = $('toast');
    el.textContent = msg;
    el.className   = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ─── Som (Web Audio simples — sem assets) ─────────────────────────────── */
const audioCtx = (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } })();
function beep(freq = 440, duration = 0.15, type = 'sine', vol = 0.12) {
    if (state.muted || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    o.stop(audioCtx.currentTime + duration + 0.02);
}
const sndCorrect = () => { beep(660, 0.08); setTimeout(() => beep(880, 0.15), 80); };
const sndWrong   = () => beep(180, 0.22, 'square', .08);
const sndStar    = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', .1), i * 90)); };
const sndUnlock  = () => { [392, 523, 659].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'sine', .1), i * 100)); };

/* ─── Regiões (mapa) ────────────────────────────────────────────────────── */
const REGIONS = [
    { id: 1, name: 'Vila dos Números',      year: '1º ano', color: '#7dd3a8', icon: '🏘️',  desc: 'Primeiros passos: contar, reconhecer e comparar.' },
    { id: 2, name: 'Bosque das Operações',  year: '2º ano', color: '#69b8e5', icon: '🌳',  desc: 'Somas, subtrações e família dos números.' },
    { id: 3, name: 'Vale das Tabuadas',     year: '3º ano', color: '#f0c75e', icon: '🌾',  desc: 'Multiplicação, divisão e dinheiro.' },
    { id: 4, name: 'Caverna das Frações',   year: '4º ano', color: '#e88c4a', icon: '🕳️',  desc: 'Pedaços do todo e medidas.' },
    { id: 5, name: 'Lago dos Decimais',     year: '5º ano', color: '#5fc8c8', icon: '🏞️',  desc: 'Vírgulas, porcentagens e áreas.' },
    { id: 6, name: 'Montanha dos Inteiros', year: '6º ano', color: '#a78bdc', icon: '⛰️',  desc: 'Negativos, MMC e primeiras equações.' },
    { id: 7, name: 'Deserto das Equações',  year: '7º ano', color: '#c89669', icon: '🏜️',  desc: 'X dos dois lados, razão e proporção.' },
    { id: 8, name: 'Templo das Potências',  year: '8º ano', color: '#e26d6d', icon: '🏛️',  desc: 'Potências, raízes e álgebra.' },
    { id: 9, name: 'Cidadela do Mestre',    year: '9º ano', color: '#f0c419', icon: '🏰',  desc: 'Funções, Bhaskara e Pitágoras.' },
];

/* ─── Geradores de questões ───────────────────────────────────────────────
 * Toda fase declara um gerador. O gerador retorna 5 questões.
 * Question = { stem, options[4], correctIndex, explain? }
 * ──────────────────────────────────────────────────────────────────────── */

function makeChoice(correct, distractors) {
    const correctStr = String(correct);
    const opts = shuffle([correctStr, ...distractors.map(String)]);
    return { options: opts, correctIndex: opts.indexOf(correctStr) };
}

function nearDistr(correct, spread = 5, n = 3, allowNeg = false) {
    const set = new Set();
    let guard = 0;
    while (set.size < n && guard++ < 50) {
        const v = correct + (rand(-spread, spread) || spread);
        if (v !== correct && (allowNeg || v >= 0)) set.add(v);
    }
    while (set.size < n) set.add(correct + set.size + 1);
    return [...set];
}

const Q = (count, fn) => () => Array.from({ length: count }, fn);

/* ── 1º ano — Vila dos Números ─────────────────────────────────────────── */
const g_count = (min, max) => Q(5, () => {
    const n = rand(min, max);
    return { stem: `Quantas bolinhas você vê?<div class="dots">${'<span>●</span>'.repeat(n)}</div>`,
             ...makeChoice(n, nearDistr(n, 3)) };
});

const g_zero = () => Q(5, () => {
    const items = [
        { stem: 'Quantos elefantes verdes existem nesta sala?<div class="dots"></div>', ans: 0 },
        { stem: 'Se eu tenho 2 maçãs e como as 2, quantas sobram?', ans: 0 },
        { stem: 'Quantos números vêm antes do 1?', ans: 0 },
        { stem: 'Um saco vazio tem quantas bolas?', ans: 0 },
        { stem: 'Quantos meses do ano têm 32 dias?', ans: 0 },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, [1, 2, 3]) };
});

const g_compare = (min, max) => Q(5, () => {
    const a = rand(min, max), b = rand(min, max);
    const sym = a > b ? '>' : a < b ? '<' : '=';
    const opts = ['>', '<', '='];
    return { stem: `Qual sinal completa? &nbsp; <b>${a} ☐ ${b}</b>`,
             options: opts, correctIndex: opts.indexOf(sym) };
});

const g_pattern = (low, step) => Q(5, () => {
    const s0 = rand(low, low + 10);
    const seq = [s0, s0 + step, s0 + 2 * step, s0 + 3 * step];
    const next = s0 + 4 * step;
    return { stem: `Qual número vem a seguir? <b>${seq.join(', ')}, ?</b>`,
             ...makeChoice(next, nearDistr(next, step + 2)) };
});

const g_orderAsc = (min, max) => Q(5, () => {
    const nums = shuffle([rand(min, max), rand(min, max), rand(min, max), rand(min, max)]);
    while (new Set(nums).size < 4) nums[rand(0, 3)] = rand(min, max);
    const sorted = [...nums].sort((a, b) => a - b).join(', ');
    const opts = shuffle([sorted, [...nums].reverse().join(', '),
                          [...nums].sort((a, b) => b - a).join(', '),
                          nums.join(', ')]);
    return { stem: `Coloque em ordem <b>crescente</b>: ${nums.join(', ')}`,
             options: opts, correctIndex: opts.indexOf(sorted) };
});

const g_orderDesc = (min, max) => Q(5, () => {
    const nums = shuffle([rand(min, max), rand(min, max), rand(min, max), rand(min, max)]);
    while (new Set(nums).size < 4) nums[rand(0, 3)] = rand(min, max);
    const sorted = [...nums].sort((a, b) => b - a).join(', ');
    const opts = shuffle([sorted, [...nums].sort((a, b) => a - b).join(', '),
                          nums.join(', '),
                          [...nums].reverse().join(', ')]);
    return { stem: `Coloque em ordem <b>decrescente</b>: ${nums.join(', ')}`,
             options: opts, correctIndex: opts.indexOf(sorted) };
});

const g_before = (min, max) => Q(5, () => {
    const n = rand(min + 1, max);
    return { stem: `Qual número vem <b>antes</b> de ${n}?`, ...makeChoice(n - 1, nearDistr(n - 1, 3)) };
});

const g_after = (min, max) => Q(5, () => {
    const n = rand(min, max - 1);
    return { stem: `Qual número vem <b>depois</b> de ${n}?`, ...makeChoice(n + 1, nearDistr(n + 1, 3)) };
});

const g_shapes = () => Q(5, () => {
    const items = [
        { stem: 'Qual forma tem 3 lados?', ans: 'Triângulo', d: ['Quadrado', 'Círculo', 'Pentágono'] },
        { stem: 'Qual forma tem 4 lados iguais?', ans: 'Quadrado', d: ['Triângulo', 'Retângulo', 'Círculo'] },
        { stem: 'Qual forma não tem lados retos?', ans: 'Círculo', d: ['Triângulo', 'Quadrado', 'Hexágono'] },
        { stem: 'Quantos lados tem um pentágono?', ans: 5, d: [3, 4, 6] },
        { stem: 'Quantos lados tem um hexágono?', ans: 6, d: [4, 5, 7] },
        { stem: 'Quantos lados tem um quadrado?', ans: 4, d: [3, 5, 6] },
        { stem: 'Quantos lados tem um triângulo?', ans: 3, d: [4, 2, 5] },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d) };
});

const g_dezena = () => Q(5, () => {
    const items = [
        { stem: 'Quantas unidades formam 1 dezena?', ans: 10, d: [5, 8, 100] },
        { stem: 'Em 23, quantas dezenas há?', ans: 2, d: [3, 20, 23] },
        { stem: 'Em 47, quantas unidades há (algarismo das unidades)?', ans: 7, d: [4, 40, 47] },
        { stem: 'Quanto é 3 dezenas + 5 unidades?', ans: 35, d: [8, 53, 30] },
        { stem: 'Quanto é 7 dezenas?', ans: 70, d: [7, 17, 77] },
    ];
    const it = pick(items);
    return { stem: it.stem, ...makeChoice(it.ans, it.d) };
});

/* ── 2º ano — Bosque das Operações ─────────────────────────────────────── */
const g_add = (maxA, maxB, minA = 1, minB = 1) => Q(5, () => {
    const a = rand(minA, maxA), b = rand(minB, maxB);
    const c = a + b;
    return { stem: `<b>${a} + ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, Math.ceil(c / 4)))) };
});

const g_sub = (maxA, maxB, minA = 2) => Q(5, () => {
    let a = rand(minA, maxA), b = rand(1, Math.min(a - 1, maxB));
    const c = a - b;
    return { stem: `<b>${a} − ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 3)) };
});

const g_parity = () => Q(5, () => {
    const n = rand(1, 99);
    const opts = ['Par', 'Ímpar'];
    return { stem: `O número <b>${n}</b> é par ou ímpar?`, options: opts, correctIndex: n % 2 ? 1 : 0 };
});

const g_double = (max = 50) => Q(5, () => {
    const n = rand(1, max);
    return { stem: `Qual é o <b>dobro</b> de ${n}?`, ...makeChoice(n * 2, nearDistr(n * 2, 4)) };
});

const g_half = (max = 50) => Q(5, () => {
    const n = rand(1, max) * 2;
    return { stem: `Qual é a <b>metade</b> de ${n}?`, ...makeChoice(n / 2, nearDistr(n / 2, 4)) };
});

const g_add3 = (max) => Q(5, () => {
    const a = rand(1, max), b = rand(1, max), c = rand(1, max);
    const r = a + b + c;
    return { stem: `<b>${a} + ${b} + ${c}</b> = ?`, ...makeChoice(r, nearDistr(r, 4)) };
});

const g_seqStep = (step) => Q(5, () => {
    const s0 = rand(step, step * 10);
    const seq = [s0, s0 + step, s0 + 2 * step, s0 + 3 * step];
    const next = s0 + 4 * step;
    return { stem: `Sequência de ${step} em ${step}: ${seq.join(', ')}, ?`, ...makeChoice(next, nearDistr(next, step + 2)) };
});

const g_decomp = () => Q(5, () => {
    const n = rand(11, 99);
    const d = Math.floor(n / 10), u = n % 10;
    const ans = `${d} dezenas e ${u} unidades`;
    const d1 = `${u} dezenas e ${d} unidades`;
    const d2 = `${d + 1} dezenas e ${u} unidades`;
    const d3 = `${d} dezenas e ${(u + 1) % 10} unidades`;
    const opts = shuffle([ans, d1, d2, d3]);
    return { stem: `Decomponha o número <b>${n}</b>:`, options: opts, correctIndex: opts.indexOf(ans) };
});

const g_wordSimple = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 9), b = rand(2, 9); return { s: `Ana tem ${a} balas e ganhou ${b}. Quantas balas ela tem agora?`, r: a + b }; },
        () => { const a = rand(5, 20), b = rand(1, 4); return { s: `Tinha ${a} pássaros, ${b} voaram. Quantos restaram?`, r: a - b }; },
        () => { const a = rand(2, 9), b = rand(2, 5); return { s: `${b} caixas com ${a} maçãs cada. Total de maçãs?`, r: a * b }; },
        () => { const b = rand(2, 5), q = rand(2, 6); const a = b * q; return { s: `${a} doces divididos igualmente entre ${b} amigos. Quantos cada um recebe?`, r: q }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, nearDistr(it.r, 4)) };
});

/* ── 3º ano — Vale das Tabuadas ────────────────────────────────────────── */
const g_addCarry = () => Q(5, () => {
    let a, b;
    do { a = rand(10, 99); b = rand(10, 99); } while ((a % 10) + (b % 10) < 10);
    const c = a + b;
    return { stem: `<b>${a} + ${b}</b> = ?  <small>(com reserva)</small>`, ...makeChoice(c, nearDistr(c, 5)) };
});

const g_subBorrow = () => Q(5, () => {
    let a, b;
    do { a = rand(30, 99); b = rand(10, a - 1); } while ((a % 10) >= (b % 10));
    const c = a - b;
    return { stem: `<b>${a} − ${b}</b> = ?  <small>(com empréstimo)</small>`, ...makeChoice(c, nearDistr(c, 5)) };
});

const g_table = (n) => Q(5, () => {
    const k = rand(1, 10);
    const c = n * k;
    return { stem: `<b>${n} × ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, n + 2))) };
});

const g_tableMix = (low, high) => Q(5, () => {
    const a = rand(low, high), b = rand(1, 10);
    const c = a * b;
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(3, a + 2))) };
});

const g_divExact = (divisorMax) => Q(5, () => {
    const b = rand(2, divisorMax);
    const q = rand(2, 10);
    const a = b * q;
    return { stem: `<b>${a} ÷ ${b}</b> = ?`, ...makeChoice(q, nearDistr(q, 3)) };
});

const g_money = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 9), b = rand(1, 9); return { s: `R$ ${a},00 + R$ ${b},00 = ?`, r: `R$ ${a + b},00`, d: [`R$ ${a + b + 1},00`, `R$ ${a + b - 1},00`, `R$ ${a * b},00`] }; },
        () => { const a = rand(5, 20), b = rand(1, a - 1); return { s: `Paguei R$ ${a},00 num produto de R$ ${b},00. Troco?`, r: `R$ ${a - b},00`, d: [`R$ ${a + b},00`, `R$ ${b - 1},00`, `R$ ${a - b + 1},00`] }; },
        () => { const c = rand(2, 9), v = rand(2, 5); return { s: `${c} pacotes de R$ ${v},00. Quanto pagar?`, r: `R$ ${c * v},00`, d: [`R$ ${c + v},00`, `R$ ${c * v + 1},00`, `R$ ${c * v - 2},00`] }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

/* ── 4º ano — Caverna das Frações ─────────────────────────────────────── */
const g_mult10 = () => Q(5, () => {
    const n = rand(2, 999);
    const k = pick([10, 100, 1000]);
    const c = n * k;
    return { stem: `<b>${n} × ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, k * 2)) };
});

const g_mult2x1 = () => Q(5, () => {
    const a = rand(11, 99), b = rand(2, 9);
    const c = a * b;
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 8)) };
});

const g_mult2x2 = () => Q(5, () => {
    const a = rand(11, 30), b = rand(11, 30);
    const c = a * b;
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(c, nearDistr(c, 20)) };
});

const g_divRest = () => Q(5, () => {
    const b = rand(3, 9), q = rand(3, 12), r = rand(1, b - 1);
    const a = b * q + r;
    const ans = `${q} resto ${r}`;
    const d = [`${q + 1} resto ${r}`, `${q} resto ${r + 1}`, `${q - 1} resto ${b - r}`];
    const opts = shuffle([ans, ...d]);
    return { stem: `<b>${a} ÷ ${b}</b> = ? (com resto)`, options: opts, correctIndex: opts.indexOf(ans) };
});

const g_div2dig = () => Q(5, () => {
    const b = rand(2, 9);
    const q = rand(11, 50);
    const a = b * q;
    return { stem: `<b>${a} ÷ ${b}</b> = ?`, ...makeChoice(q, nearDistr(q, 5)) };
});

const g_fracVisual = () => Q(5, () => {
    const den = pick([2, 3, 4, 5, 6, 8]);
    const num = rand(1, den - 1);
    const blocks = '<span class="frac-on">█</span>'.repeat(num) + '<span class="frac-off">█</span>'.repeat(den - num);
    const correct = `${num}/${den}`;
    const distr = [`${den - num}/${den}`, `${num}/${den + 1}`, `${num + 1}/${den}`].filter(x => x !== correct);
    while (distr.length < 3) distr.push(`${num + distr.length + 1}/${den + 1}`);
    return { stem: `Qual fração representa a parte preenchida?<div class="frac-bar">${blocks}</div>`,
             ...makeChoice(correct, distr.slice(0, 3)) };
});

const g_fracTerm = () => Q(5, () => {
    const items = [
        { s: 'Em 3/7, qual é o <b>numerador</b>?', r: 3, d: [7, 4, 10] },
        { s: 'Em 3/7, qual é o <b>denominador</b>?', r: 7, d: [3, 10, 4] },
        { s: 'O denominador indica:', r: 'em quantas partes o todo foi dividido', d: ['as partes pintadas', 'a parte total', 'os números primos'] },
        { s: 'O numerador indica:', r: 'as partes consideradas', d: ['o todo dividido', 'a parte vazia', 'sempre 1'] },
        { s: 'Que fração é "meio"?', r: '1/2', d: ['2/1', '1/4', '2/2'] },
        { s: 'Que fração é "um terço"?', r: '1/3', d: ['3/1', '1/2', '2/3'] },
        { s: 'Que fração é "três quartos"?', r: '3/4', d: ['4/3', '1/4', '2/4'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_fracEquiv = () => Q(5, () => {
    const den = pick([2, 3, 4, 5]);
    const num = rand(1, den - 1);
    const k = rand(2, 4);
    return { stem: `Qual fração é <b>equivalente</b> a ${num}/${den}?`,
             ...makeChoice(`${num * k}/${den * k}`, [`${num + 1}/${den + 1}`, `${num * k}/${den + k}`, `${num + k}/${den * k}`]) };
});

const g_fracCompareSameDen = () => Q(5, () => {
    const den = pick([4, 5, 6, 8]);
    let a = rand(1, den - 1), b = rand(1, den - 1);
    while (a === b) b = rand(1, den - 1);
    const greater = a > b ? `${a}/${den}` : `${b}/${den}`;
    return { stem: `Qual é <b>maior</b>? ${a}/${den} ou ${b}/${den}?`,
             ...makeChoice(greater, [`${a}/${den}` === greater ? `${b}/${den}` : `${a}/${den}`, 'São iguais', `${den - a}/${den}`]) };
});

const g_fracAddSame = () => Q(5, () => {
    const den = pick([4, 5, 6, 7, 8]);
    const a = rand(1, Math.floor(den / 2)), b = rand(1, den - a - 1);
    return { stem: `<b>${a}/${den} + ${b}/${den}</b> = ?`,
             ...makeChoice(`${a + b}/${den}`, [`${a + b}/${den * 2}`, `${a * b}/${den}`, `${a + b + 1}/${den}`]) };
});

const g_units = () => Q(5, () => {
    const items = [
        { s: 'Quantos centímetros em 1 metro?', r: 100, d: [10, 1000, 50] },
        { s: 'Quantos metros em 1 quilômetro?', r: 1000, d: [100, 10, 10000] },
        { s: 'Quantos milímetros em 1 centímetro?', r: 10, d: [100, 1, 1000] },
        { s: 'Quantos gramas em 1 quilograma?', r: 1000, d: [100, 10, 10000] },
        { s: '2,5 metros em centímetros:', r: 250, d: [25, 2500, 2050] },
        { s: '3 km em metros:', r: 3000, d: [300, 30, 30000] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_perimeter = () => Q(5, () => {
    const items = [
        () => { const a = rand(2, 20), b = rand(2, 20); return { s: `Perímetro de retângulo ${a} × ${b} cm:`, r: 2 * (a + b), d: nearDistr(2 * (a + b), 6) }; },
        () => { const l = rand(2, 30); return { s: `Perímetro de quadrado de lado ${l} cm:`, r: 4 * l, d: nearDistr(4 * l, 5) }; },
        () => { const a = rand(3, 9), b = rand(3, 9), c = rand(3, 9); return { s: `Perímetro de triângulo de lados ${a}, ${b} e ${c} cm:`, r: a + b + c, d: nearDistr(a + b + c, 4) }; },
    ];
    const it = pick(items)();
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_time = () => Q(5, () => {
    const items = [
        { s: 'Quantos minutos em 1 hora?', r: 60, d: [30, 100, 24] },
        { s: 'Quantos segundos em 1 minuto?', r: 60, d: [30, 100, 24] },
        { s: 'Quantas horas em 1 dia?', r: 24, d: [12, 60, 48] },
        { s: 'Quantos dias em uma semana?', r: 7, d: [5, 10, 30] },
        { s: 'Quantos meses em 1 ano?', r: 12, d: [10, 30, 365] },
        { s: '90 minutos = quantas horas?', r: '1h30', d: ['1h09', '9h', '90h'] },
        { s: '2 horas = quantos minutos?', r: 120, d: [60, 200, 180] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

/* ── 5º ano — Lago dos Decimais ────────────────────────────────────────── */
const g_fracProperImproper = () => Q(5, () => {
    const items = [
        { s: 'A fração 5/3 é:', r: 'imprópria', d: ['própria', 'aparente', 'mista'] },
        { s: 'A fração 2/5 é:', r: 'própria', d: ['imprópria', 'aparente', 'mista'] },
        { s: 'A fração 4/4 é:', r: 'aparente', d: ['própria', 'imprópria', 'mista'] },
        { s: 'A fração 7/2 é:', r: 'imprópria', d: ['própria', 'aparente', 'mista'] },
        { s: 'Fração própria significa:', r: 'numerador menor que denominador', d: ['numerador maior', 'iguais', 'sempre 1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_decRead = () => Q(5, () => {
    const items = [
        { s: 'Como se lê <b>0,5</b>?', r: 'cinco décimos', d: ['cinco centésimos', 'cinco', 'meio centavo'] },
        { s: 'Como se lê <b>0,25</b>?', r: 'vinte e cinco centésimos', d: ['vinte e cinco décimos', 'dois e cinco', '25 milésimos'] },
        { s: 'O número 1,5 está entre:', r: '1 e 2', d: ['0 e 1', '5 e 6', '10 e 15'] },
        { s: 'Qual é maior: 0,7 ou 0,69?', r: '0,7', d: ['0,69', 'iguais', 'depende'] },
        { s: 'Qual é maior: 0,3 ou 0,30?', r: 'iguais', d: ['0,3', '0,30', 'nenhum'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_decCompare = () => Q(5, () => {
    const a = (rand(1, 99) / 10).toFixed(1);
    let b = (rand(1, 99) / 10).toFixed(1);
    while (b === a) b = (rand(1, 99) / 10).toFixed(1);
    const big = parseFloat(a) > parseFloat(b) ? a : b;
    return { stem: `Qual é <b>maior</b>: ${a} ou ${b}?`, ...makeChoice(big, [a === big ? b : a, 'São iguais', '0']) };
});

const g_decAdd = () => Q(5, () => {
    const a = rand(10, 99) / 10, b = rand(10, 99) / 10;
    const c = +(a + b).toFixed(1);
    return { stem: `<b>${a.toFixed(1)} + ${b.toFixed(1)}</b> = ?`,
             ...makeChoice(c.toFixed(1), nearDistr(Math.round(c * 10), 8).map(x => (x / 10).toFixed(1))) };
});

const g_decSub = () => Q(5, () => {
    let a = rand(50, 99) / 10, b = rand(10, 49) / 10;
    if (b > a) [a, b] = [b, a];
    const c = +(a - b).toFixed(1);
    return { stem: `<b>${a.toFixed(1)} − ${b.toFixed(1)}</b> = ?`,
             ...makeChoice(c.toFixed(1), nearDistr(Math.round(c * 10), 8).map(x => (x / 10).toFixed(1))) };
});

const g_decMult10 = () => Q(5, () => {
    const n = (rand(15, 99) / 10).toFixed(1);
    const k = pick([10, 100, 1000]);
    const c = parseFloat(n) * k;
    return { stem: `<b>${n} × ${k}</b> = ?`, ...makeChoice(c, nearDistr(c, k)) };
});

const g_percentEasy = () => Q(5, () => {
    const p = pick([10, 25, 50, 75, 100]);
    const n = pick([20, 40, 80, 100, 200, 400]);
    const c = (n * p) / 100;
    return { stem: `Quanto é <b>${p}% de ${n}</b>?`, ...makeChoice(c, nearDistr(c, n / 10)) };
});

const g_percentApply = () => Q(5, () => {
    const p = pick([10, 15, 20, 25, 30, 50]);
    const n = pick([50, 80, 100, 150, 200, 250, 300]);
    const c = Math.round((n * p) / 100 * 100) / 100;
    return { stem: `${p}% de R$ ${n},00 vale quanto?`, ...makeChoice(`R$ ${c.toFixed(2)}`, nearDistr(c, n / 10).map(x => `R$ ${x.toFixed(2)}`)) };
});

const g_areaSquare = () => Q(5, () => {
    const l = rand(2, 20);
    const c = l * l;
    return { stem: `Área de quadrado de lado <b>${l} cm</b>:`, ...makeChoice(`${c} cm²`, nearDistr(c, 8).map(x => `${x} cm²`)) };
});

const g_areaRect = () => Q(5, () => {
    const a = rand(3, 20), b = rand(3, 20);
    const c = a * b;
    return { stem: `Área de retângulo <b>${a} × ${b} cm</b>:`, ...makeChoice(`${c} cm²`, nearDistr(c, 10).map(x => `${x} cm²`)) };
});

const g_volumeCube = () => Q(5, () => {
    const l = rand(2, 10);
    const c = l * l * l;
    return { stem: `Volume de cubo de aresta <b>${l} cm</b>:`, ...makeChoice(`${c} cm³`, nearDistr(c, 12).map(x => `${x} cm³`)) };
});

const g_volumePar = () => Q(5, () => {
    const a = rand(2, 8), b = rand(2, 8), c = rand(2, 8);
    const v = a * b * c;
    return { stem: `Volume do paralelepípedo <b>${a} × ${b} × ${c} cm</b>:`, ...makeChoice(`${v} cm³`, nearDistr(v, 20).map(x => `${x} cm³`)) };
});

const g_mean = () => Q(5, () => {
    const n = pick([2, 3, 4]);
    const nums = Array.from({ length: n }, () => rand(2, 20));
    const s = nums.reduce((a, b) => a + b, 0);
    while (s % n !== 0) { nums[0] = rand(2, 20); break; }
    const sum = nums.reduce((a, b) => a + b, 0);
    const ans = sum / n;
    const intAns = Math.round(ans * 10) / 10;
    return { stem: `Média de ${nums.join(', ')} =?`, ...makeChoice(intAns, nearDistr(intAns, 4)) };
});

const g_probSimple = () => Q(5, () => {
    const items = [
        { s: 'Numa moeda, qual a chance de cair cara?', r: '1/2', d: ['1/4', '1/3', '1'] },
        { s: 'Num dado, qual a chance de sair 3?', r: '1/6', d: ['1/3', '1/2', '3/6'] },
        { s: 'Num dado, chance de sair número par?', r: '1/2', d: ['1/3', '1/6', '2/3'] },
        { s: '20 bolas, 5 vermelhas. Chance de tirar vermelha?', r: '1/4', d: ['1/5', '5/15', '1/20'] },
        { s: 'Probabilidade do evento certo:', r: '1', d: ['0', '1/2', 'depende'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

/* ── 6º ano — Montanha dos Inteiros ────────────────────────────────────── */
const g_negLine = () => Q(5, () => {
    const items = [
        { s: 'Qual é maior: -3 ou -5?', r: '-3', d: ['-5', 'iguais', '0'] },
        { s: 'Qual é maior: -1 ou 1?', r: '1', d: ['-1', 'iguais', 'depende'] },
        { s: 'Na reta, qual fica mais à esquerda: -7 ou -2?', r: '-7', d: ['-2', 'iguais', 'nenhum'] },
        { s: 'O oposto de 4 é:', r: -4, d: [4, 0, 14] },
        { s: 'Módulo de -8 é:', r: 8, d: [-8, 0, 18] },
        { s: 'Qual é o menor: -10, -3, 0, 5?', r: -10, d: [-3, 0, 5] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_negAdd = () => Q(5, () => {
    const a = rand(-20, 20), b = rand(-20, 20);
    const c = a + b;
    const str = `(${a}) + (${b})`.replace(/\+ \(-/g, '− (').replace(/\(-/g, '(−');
    return { stem: `<b>${a} + (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 6, 3, true)) };
});

const g_negSub = () => Q(5, () => {
    const a = rand(-20, 20), b = rand(-20, 20);
    const c = a - b;
    return { stem: `<b>${a} − (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 6, 3, true)) };
});

const g_negMult = () => Q(5, () => {
    const a = rand(-12, 12) || 1, b = rand(-12, 12) || 1;
    const c = a * b;
    return { stem: `<b>(${a}) × (${b})</b> = ?`, ...makeChoice(c, nearDistr(c, 10, 3, true)) };
});

const g_negDiv = () => Q(5, () => {
    const b = rand(2, 9) * pick([-1, 1]);
    const q = rand(2, 9) * pick([-1, 1]);
    const a = b * q;
    return { stem: `<b>(${a}) ÷ (${b})</b> = ?`, ...makeChoice(q, nearDistr(q, 4, 3, true)) };
});

const g_mmc = () => Q(5, () => {
    const pairs = [[4, 6, 12], [3, 5, 15], [6, 8, 24], [4, 10, 20], [9, 12, 36], [5, 7, 35], [8, 12, 24], [2, 3, 6], [6, 9, 18], [4, 5, 20]];
    const [a, b, m] = pick(pairs);
    return { stem: `<b>MMC(${a}, ${b})</b> = ?`, ...makeChoice(m, nearDistr(m, 6)) };
});

const g_mdc = () => Q(5, () => {
    const pairs = [[12, 18, 6], [20, 30, 10], [24, 36, 12], [15, 25, 5], [14, 21, 7], [8, 12, 4], [9, 27, 9], [16, 24, 8], [10, 15, 5], [18, 24, 6]];
    const [a, b, m] = pick(pairs);
    return { stem: `<b>MDC(${a}, ${b})</b> = ?`, ...makeChoice(m, nearDistr(m, 4)) };
});

const g_fracAddDiff = () => Q(5, () => {
    const pairs = [['1/2', '1/3', '5/6'], ['1/4', '1/2', '3/4'], ['2/3', '1/6', '5/6'], ['1/3', '1/4', '7/12'], ['3/4', '1/8', '7/8'], ['1/5', '1/2', '7/10']];
    const [a, b, r] = pick(pairs);
    return { stem: `<b>${a} + ${b}</b> = ?`, ...makeChoice(r, ['1/5', '2/12', '3/7', '4/9'].filter(x => x !== r).slice(0, 3)) };
});

const g_fracMult = () => Q(5, () => {
    const items = [['1/2', '1/3', '1/6'], ['2/3', '3/4', '1/2'], ['1/2', '1/4', '1/8'], ['3/5', '1/2', '3/10'], ['2/5', '5/6', '1/3']];
    const [a, b, r] = pick(items);
    return { stem: `<b>${a} × ${b}</b> = ?`, ...makeChoice(r, ['2/12', '5/9', '3/8', '7/15'].filter(x => x !== r).slice(0, 3)) };
});

const g_fracDiv = () => Q(5, () => {
    const items = [['1/2', '1/4', '2'], ['3/4', '1/2', '3/2'], ['2/3', '1/3', '2'], ['1/2', '1/2', '1']];
    const [a, b, r] = pick(items);
    return { stem: `<b>${a} ÷ ${b}</b> = ?`, ...makeChoice(r, ['1/4', '1/8', '3/4', '4'].filter(x => x !== r).slice(0, 3)) };
});

const g_eq1 = () => Q(5, () => {
    const x = rand(1, 20), a = rand(1, 20);
    const types = [
        { s: `x + ${a} = ${x + a}`, r: x },
        { s: `x − ${a} = ${x - a}`, r: x },
        { s: `${a + x} = x + ${a}`, r: x },
    ];
    const t = pick(types);
    return { stem: `Resolva: <b>${t.s}</b>. x = ?`, ...makeChoice(t.r, nearDistr(t.r, 4)) };
});

const g_eqMult = () => Q(5, () => {
    const x = rand(2, 10), a = rand(2, 9);
    const types = [
        { s: `${a}x = ${a * x}`, r: x },
        { s: `x/${a} = ${Math.floor(x)}`, r: a * Math.floor(x) },
        { s: `${a}x − ${a} = ${a * x - a}`, r: x },
    ];
    const t = pick(types);
    return { stem: `Resolva: <b>${t.s}</b>. x = ?`, ...makeChoice(t.r, nearDistr(t.r, 4)) };
});

const g_ratioBasic = () => Q(5, () => {
    const items = [
        { s: 'Numa sala há 12 meninas e 8 meninos. Razão meninas:meninos?', r: '3:2', d: ['2:3', '12:8', '8:12'] },
        { s: 'Razão de 6 para 9 (simplificada):', r: '2:3', d: ['3:2', '6:9', '1:1'] },
        { s: 'Razão de 10 para 5:', r: '2:1', d: ['1:2', '5:10', '10:5'] },
        { s: 'Razão de 4 para 16 (simplificada):', r: '1:4', d: ['4:1', '4:16', '2:8'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

/* ── 7º ano — Deserto das Equações ─────────────────────────────────────── */
const g_eq2sides = () => Q(5, () => {
    const x = rand(1, 10), a = rand(2, 6), b = rand(2, 6), c = rand(1, 10);
    // ax + c = bx + (ax+c - bx)  => valor à direita
    if (a === b) return { stem: 'Resolva: 2x + 3 = x + 7. x = ?', ...makeChoice(4, [3, 5, 6]) };
    const left = a * x + c;
    const rightConst = left - b * x;
    return { stem: `Resolva: <b>${a}x + ${c} = ${b}x + ${rightConst}</b>. x = ?`, ...makeChoice(x, nearDistr(x, 4)) };
});

const g_eqParen = () => Q(5, () => {
    const items = [
        { s: '2(x + 3) = 14', r: 4 }, { s: '3(x − 1) = 12', r: 5 }, { s: '2(x − 4) = 6', r: 7 },
        { s: '5(x + 2) = 35', r: 5 }, { s: '4(x + 1) = 20', r: 4 }, { s: '3(2x + 1) = 21', r: 3 },
    ];
    const it = pick(items);
    return { stem: `Resolva: <b>${it.s}</b>. x = ?`, ...makeChoice(it.r, nearDistr(it.r, 4)) };
});

const g_eqFrac = () => Q(5, () => {
    const items = [
        { s: 'x/2 + 1 = 4', r: 6 }, { s: 'x/3 − 2 = 1', r: 9 }, { s: '2x/3 = 6', r: 9 },
        { s: 'x/4 = 3', r: 12 }, { s: 'x/5 + 1 = 3', r: 10 },
    ];
    const it = pick(items);
    return { stem: `Resolva: <b>${it.s}</b>. x = ?`, ...makeChoice(it.r, nearDistr(it.r, 4)) };
});

const g_proportion = () => Q(5, () => {
    const a = rand(2, 9), b = rand(2, 9), k = rand(2, 6);
    const c = a * k, d = b * k;
    const items = [
        { s: `${a}/${b} = x/${d}. x = ?`, r: c },
        { s: `${a}/${b} = ${c}/x. x = ?`, r: d },
        { s: `x/${b} = ${c}/${d}. x = ?`, r: a },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, nearDistr(it.r, 5)) };
});

const g_rule3 = () => Q(5, () => {
    const items = [
        () => { const u = rand(2, 9), v = rand(2, 9), k = rand(2, 6); return { s: `Se ${u} caixas custam R$ ${u * v},00, quanto custam ${u * k} caixas?`, r: u * v * k }; },
        () => { const km = rand(50, 200), h = rand(2, 5); return { s: `Carro a ${km} km/h percorre quantos km em ${h} h?`, r: km * h }; },
        () => { const a = rand(2, 6), b = rand(2, 9); return { s: `${a} laranjas custam R$ ${a * b},00. Quanto custam ${a + 3} laranjas?`, r: (a + 3) * b }; },
    ];
    const it = pick(items)();
    return { stem: `<b>Regra de 3:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 8)) };
});

const g_rule3Inv = () => Q(5, () => {
    const items = [
        { s: '6 operários fazem obra em 10 dias. Quantos dias para 12 operários?', r: 5 },
        { s: '4 torneiras enchem tanque em 6h. Tempo com 8 torneiras?', r: 3 },
        { s: '3 máquinas em 8h. Tempo com 6 máquinas?', r: 4 },
        { s: '5 pintores em 12 dias. Tempo com 10 pintores?', r: 6 },
    ];
    const it = pick(items);
    return { stem: `<b>Inversa:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 4)) };
});

const g_discount = () => Q(5, () => {
    const v = pick([100, 150, 200, 250, 300, 500]);
    const p = pick([10, 15, 20, 25, 30]);
    const c = v - (v * p) / 100;
    return { stem: `Produto de R$ ${v} com desconto de ${p}%. Valor final?`, ...makeChoice(`R$ ${c}`, nearDistr(c, 30).map(x => `R$ ${x}`)) };
});

const g_increase = () => Q(5, () => {
    const v = pick([100, 200, 300, 400, 500]);
    const p = pick([10, 15, 20, 25, 30, 50]);
    const c = v + (v * p) / 100;
    return { stem: `R$ ${v} com aumento de ${p}%. Valor final?`, ...makeChoice(`R$ ${c}`, nearDistr(c, 40).map(x => `R$ ${x}`)) };
});

const g_interestSimple = () => Q(5, () => {
    const c = pick([1000, 2000, 5000]);
    const i = pick([1, 2, 5, 10]);
    const t = pick([3, 6, 12]);
    const j = (c * i * t) / 100;
    return { stem: `Capital R$ ${c}, taxa ${i}% ao mês, ${t} meses. Juros simples = ?`, ...makeChoice(`R$ ${j}`, nearDistr(j, 100).map(x => `R$ ${x}`)) };
});

const g_angles = () => Q(5, () => {
    const items = [
        { s: 'Ângulo de 90° é:', r: 'reto', d: ['agudo', 'obtuso', 'raso'] },
        { s: 'Ângulo menor que 90°:', r: 'agudo', d: ['reto', 'obtuso', 'raso'] },
        { s: 'Ângulo de 180°:', r: 'raso', d: ['reto', 'obtuso', 'agudo'] },
        { s: 'Soma dos ângulos internos de um triângulo:', r: '180°', d: ['90°', '360°', '270°'] },
        { s: 'Soma dos ângulos de um quadrilátero:', r: '360°', d: ['180°', '270°', '90°'] },
        { s: 'Dois ângulos somando 90° são:', r: 'complementares', d: ['suplementares', 'opostos', 'iguais'] },
        { s: 'Dois ângulos somando 180° são:', r: 'suplementares', d: ['complementares', 'opostos', 'paralelos'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_areaTri = () => Q(5, () => {
    const b = rand(2, 20), h = rand(2, 20);
    const c = (b * h) / 2;
    return { stem: `Área de triângulo base <b>${b}</b> cm e altura <b>${h}</b> cm:`, ...makeChoice(`${c} cm²`, nearDistr(c, 8).map(x => `${x} cm²`)) };
});

const g_areaPar = () => Q(5, () => {
    const b = rand(3, 20), h = rand(2, 15);
    const c = b * h;
    return { stem: `Área de paralelogramo base ${b} altura ${h}:`, ...makeChoice(`${c} cm²`, nearDistr(c, 10).map(x => `${x} cm²`)) };
});

const g_areaTrap = () => Q(5, () => {
    const B = rand(6, 15), b = rand(2, 5), h = rand(2, 10);
    const c = ((B + b) * h) / 2;
    return { stem: `Área de trapézio (B=${B}, b=${b}, h=${h}):`, ...makeChoice(`${c} cm²`, nearDistr(c, 8).map(x => `${x} cm²`)) };
});

const g_circle = () => Q(5, () => {
    const r = rand(2, 10);
    const items = [
        { s: `Comprimento do círculo de raio ${r} cm (use π=3,14):`, r: +(2 * 3.14 * r).toFixed(2) },
        { s: `Área do círculo de raio ${r} cm (use π=3,14):`, r: +(3.14 * r * r).toFixed(2) },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, nearDistr(Math.round(it.r), 10).map(x => x.toString())) };
});

/* ── 8º ano — Templo das Potências ─────────────────────────────────────── */
const g_power = () => Q(5, () => {
    const b = rand(2, 9), e = rand(2, 4);
    const c = Math.pow(b, e);
    return { stem: `<b>${b}<sup>${e}</sup></b> = ?`, ...makeChoice(c, nearDistr(c, Math.max(5, c / 4))) };
});

const g_powerProp = () => Q(5, () => {
    const items = [
        { s: 'a³ × a⁵ = ?', r: 'a⁸', d: ['a²', 'a¹⁵', '2a⁸'] },
        { s: 'x⁷ ÷ x³ = ?', r: 'x⁴', d: ['x¹⁰', 'x²¹', 'x'] },
        { s: '(a²)³ = ?', r: 'a⁶', d: ['a⁵', 'a²³', 'a'] },
        { s: 'x⁰ = ?', r: '1', d: ['0', 'x', 'indefinido'] },
        { s: '2³ × 2⁴ = ?', r: '2⁷', d: ['2¹²', '4⁷', '2¹'] },
        { s: '(2³)² = ?', r: '2⁶', d: ['2⁵', '4³', '6'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_sciNotation = () => Q(5, () => {
    const items = [
        { s: '500 em notação científica:', r: '5 × 10²', d: ['5 × 10³', '50 × 10', '5,0 × 10⁻²'] },
        { s: '3.000.000 em notação científica:', r: '3 × 10⁶', d: ['3 × 10⁵', '30 × 10⁵', '3 × 10⁷'] },
        { s: '0,005 em notação científica:', r: '5 × 10⁻³', d: ['5 × 10³', '0,5 × 10⁻²', '5 × 10⁻²'] },
        { s: '7,2 × 10² = ?', r: '720', d: ['72', '7200', '0,72'] },
        { s: '4,5 × 10⁻¹ = ?', r: '0,45', d: ['45', '4,5', '0,045'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_sqrt = () => Q(5, () => {
    const r = rand(2, 15);
    const n = r * r;
    return { stem: `<b>√${n}</b> = ?`, ...makeChoice(r, nearDistr(r, 4)) };
});

const g_cubeRoot = () => Q(5, () => {
    const r = rand(2, 9);
    const n = r * r * r;
    return { stem: `<b>∛${n}</b> = ?`, ...makeChoice(r, nearDistr(r, 3)) };
});

const g_sqrtAprox = () => Q(5, () => {
    const items = [
        { s: '√50 está entre:', r: '7 e 8', d: ['6 e 7', '8 e 9', '4 e 5'] },
        { s: '√30 está entre:', r: '5 e 6', d: ['4 e 5', '6 e 7', '3 e 4'] },
        { s: '√90 está entre:', r: '9 e 10', d: ['8 e 9', '10 e 11', '7 e 8'] },
        { s: '√20 está entre:', r: '4 e 5', d: ['3 e 4', '5 e 6', '6 e 7'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_algebraVal = () => Q(5, () => {
    const x = rand(2, 6);
    const items = [
        { s: `2x + 3 (com x=${x})`, r: 2 * x + 3 },
        { s: `x² − 1 (com x=${x})`, r: x * x - 1 },
        { s: `3x − 2 (com x=${x})`, r: 3 * x - 2 },
        { s: `x² + x (com x=${x})`, r: x * x + x },
    ];
    const it = pick(items);
    return { stem: `Valor numérico de ${it.s}:`, ...makeChoice(it.r, nearDistr(it.r, 5)) };
});

const g_monoSum = () => Q(5, () => {
    const items = [
        { s: '3x + 5x', r: '8x', d: ['15x', '8', '8x²'] },
        { s: '7a − 2a', r: '5a', d: ['9a', '5', '14a'] },
        { s: '2x² + 5x²', r: '7x²', d: ['10x⁴', '7x', '7x⁴'] },
        { s: '4y + y', r: '5y', d: ['4y²', '5', '4y + 1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_monoMult = () => Q(5, () => {
    const items = [
        { s: '3x · 2x', r: '6x²', d: ['5x²', '6x', '5x'] },
        { s: '4a · 3b', r: '12ab', d: ['7ab', '12a', '12b'] },
        { s: '2x² · 5x', r: '10x³', d: ['7x³', '10x²', '10x'] },
        { s: '6y · y²', r: '6y³', d: ['6y²', '7y³', 'y⁶'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_squarePlus = () => Q(5, () => {
    const items = [
        { s: '(a + b)² = ?', r: 'a² + 2ab + b²', d: ['a² + b²', 'a² − b²', 'a² + ab + b²'] },
        { s: '(x + 3)² = ?', r: 'x² + 6x + 9', d: ['x² + 9', 'x² − 6x + 9', 'x² + 3x + 9'] },
        { s: '(2 + y)² = ?', r: 'y² + 4y + 4', d: ['y² + 4', '2y² + 4', '4 + y²'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_squareMinus = () => Q(5, () => {
    const items = [
        { s: '(a − b)² = ?', r: 'a² − 2ab + b²', d: ['a² + b²', 'a² − b²', 'a² + 2ab − b²'] },
        { s: '(x − 2)² = ?', r: 'x² − 4x + 4', d: ['x² − 4', 'x² + 4x + 4', 'x² − 2x + 4'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_diffSquares = () => Q(5, () => {
    const items = [
        { s: '(a + b)(a − b) = ?', r: 'a² − b²', d: ['a² + b²', 'a² + 2ab + b²', '(a − b)²'] },
        { s: '(x + 3)(x − 3) = ?', r: 'x² − 9', d: ['x² + 9', 'x² − 6x + 9', 'x² − 6'] },
        { s: '(y + 5)(y − 5) = ?', r: 'y² − 25', d: ['y² + 25', '(y − 5)²', 'y² − 10'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_factor = () => Q(5, () => {
    const items = [
        { s: 'Fatore: 2x + 4', r: '2(x + 2)', d: ['x(2 + 4)', '2x · 4', '(x + 2)(x + 2)'] },
        { s: 'Fatore: 3x² − 6x', r: '3x(x − 2)', d: ['3x² − 6x', 'x(3x − 6)', '3(x² − 2)'] },
        { s: 'Fatore: 5a + 10', r: '5(a + 2)', d: ['(a + 2)(a + 5)', '5a · 2', 'a(5 + 10)'] },
        { s: 'Fatore: x² − 9', r: '(x + 3)(x − 3)', d: ['(x − 3)²', '(x + 3)²', 'x(x − 9)'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_sysSubst = () => Q(5, () => {
    const items = [
        { s: '{ x + y = 7 ;  x − y = 1 }', r: 'x=4, y=3', d: ['x=3, y=4', 'x=5, y=2', 'x=6, y=1'] },
        { s: '{ x + y = 10 ; x − y = 4 }', r: 'x=7, y=3', d: ['x=3, y=7', 'x=6, y=4', 'x=5, y=5'] },
        { s: '{ 2x + y = 9 ; x + y = 5 }', r: 'x=4, y=1', d: ['x=1, y=4', 'x=3, y=2', 'x=2, y=3'] },
    ];
    const it = pick(items);
    return { stem: `Sistema: ${it.s}`, ...makeChoice(it.r, it.d) };
});

const g_thales = () => Q(5, () => {
    const items = [
        { s: '3/x = 6/8. x = ?', r: 4 }, { s: '5/10 = x/12. x = ?', r: 6 },
        { s: '4/x = 8/14. x = ?', r: 7 }, { s: '2/3 = x/9. x = ?', r: 6 },
    ];
    const it = pick(items);
    return { stem: `<b>Tales:</b> ${it.s}`, ...makeChoice(it.r, nearDistr(it.r, 4)) };
});

/* ── 9º ano — Cidadela do Mestre ───────────────────────────────────────── */
const g_funcAfim = () => Q(5, () => {
    const items = [
        { s: 'Em f(x) = 2x + 3, qual o coeficiente angular?', r: 2, d: [3, 5, -2] },
        { s: 'Em f(x) = 2x + 3, qual o coeficiente linear?', r: 3, d: [2, -3, 0] },
        { s: 'f(x) = 3x − 6. f(0) = ?', r: -6, d: [0, 3, 6] },
        { s: 'f(x) = 3x − 6. f(2) = ?', r: 0, d: [6, -6, 12] },
        { s: 'A função afim tem a forma:', r: 'f(x) = ax + b', d: ['f(x) = ax²', 'f(x) = a/x', 'f(x) = aˣ'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_funcRoot = () => Q(5, () => {
    const a = rand(1, 6), b = rand(2, 20);
    const r = b / a;
    if (b % a !== 0) return { stem: `Raiz de f(x) = ${a}x − ${a * 3}`, ...makeChoice(3, [0, a, -3]) };
    return { stem: `Raiz de f(x) = ${a}x − ${b}`, ...makeChoice(r, nearDistr(r, 4)) };
});

const g_funcGraph = () => Q(5, () => {
    const items = [
        { s: 'Gráfico de função afim é:', r: 'uma reta', d: ['parábola', 'hipérbole', 'circunferência'] },
        { s: 'Quando a > 0, f(x) = ax + b é:', r: 'crescente', d: ['decrescente', 'constante', 'oscilante'] },
        { s: 'Quando a < 0, f(x) = ax + b é:', r: 'decrescente', d: ['crescente', 'constante', 'paralela ao eixo x'] },
        { s: 'A reta passa pelo eixo y no ponto:', r: '(0, b)', d: ['(b, 0)', '(0, 0)', '(a, b)'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_bhaskaraDelta = () => Q(5, () => {
    const items = [
        { s: 'x² − 5x + 6 = 0. Δ = ?', r: 1, d: [25, -1, 11] },
        { s: 'x² + 2x − 3 = 0. Δ = ?', r: 16, d: [4, -8, 12] },
        { s: '2x² + 3x − 2 = 0. Δ = ?', r: 25, d: [9, -7, 17] },
        { s: 'x² − 4x + 4 = 0. Δ = ?', r: 0, d: [16, -16, 8] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_bhaskaraRoots = () => Q(5, () => {
    const items = [
        { s: 'x² − 5x + 6 = 0. Raízes?', r: '2 e 3', d: ['1 e 6', '−2 e −3', '5 e 6'] },
        { s: 'x² − 7x + 12 = 0. Raízes?', r: '3 e 4', d: ['2 e 6', '1 e 12', '−3 e −4'] },
        { s: 'x² + x − 6 = 0. Raízes?', r: '2 e −3', d: ['−2 e 3', '1 e −6', '6 e −1'] },
        { s: 'x² − 9 = 0. Raízes?', r: '3 e −3', d: ['9 e −9', '3 e 9', '0 e 9'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_sumProd = () => Q(5, () => {
    const items = [
        { s: 'x² − 5x + 6 = 0. Soma das raízes?', r: 5, d: [-5, 6, 1] },
        { s: 'x² − 5x + 6 = 0. Produto das raízes?', r: 6, d: [5, -6, 1] },
        { s: 'x² + 3x − 10 = 0. Soma?', r: -3, d: [3, -10, 10] },
        { s: 'Soma = −b/a, produto = c/a. Em x²+2x−8: soma?', r: -2, d: [2, -8, 8] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_vertex = () => Q(5, () => {
    const items = [
        { s: 'f(x) = x² − 4x + 3. xᵥ = ?', r: 2, d: [-2, 4, 3] },
        { s: 'f(x) = x² − 6x + 5. xᵥ = ?', r: 3, d: [-3, 6, 5] },
        { s: 'f(x) = 2x² − 4x. xᵥ = ?', r: 1, d: [-1, 2, 0] },
        { s: 'Vértice da parábola: xᵥ = ?', r: '−b/(2a)', d: ['−b/a', 'b/(2a)', '−c/a'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_pythCat = () => Q(5, () => {
    const items = [
        [3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [9, 12, 15], [7, 24, 25],
    ];
    const [a, b, c] = pick(items);
    const role = pick(['hip', 'catA', 'catB']);
    if (role === 'hip') return { stem: `Catetos ${a} e ${b}. Hipotenusa?`, ...makeChoice(c, nearDistr(c, 5)) };
    if (role === 'catA') return { stem: `Hipotenusa ${c}, um cateto ${b}. Outro cateto?`, ...makeChoice(a, nearDistr(a, 4)) };
    return { stem: `Hipotenusa ${c}, um cateto ${a}. Outro cateto?`, ...makeChoice(b, nearDistr(b, 5)) };
});

const g_trigSpecial = () => Q(5, () => {
    const items = [
        { s: 'sen 30° = ?', r: '1/2', d: ['√3/2', '√2/2', '1'] },
        { s: 'cos 60° = ?', r: '1/2', d: ['√3/2', '√2/2', '1'] },
        { s: 'sen 45° = ?', r: '√2/2', d: ['1/2', '√3/2', '1'] },
        { s: 'cos 30° = ?', r: '√3/2', d: ['1/2', '√2/2', '0'] },
        { s: 'tg 45° = ?', r: '1', d: ['0', '√2', '√3'] },
        { s: 'sen 90° = ?', r: '1', d: ['0', '1/2', '√3/2'] },
        { s: 'cos 0° = ?', r: '1', d: ['0', '1/2', '√2/2'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_similar = () => Q(5, () => {
    const items = [
        { s: 'Triângulos semelhantes têm lados ___:', r: 'proporcionais', d: ['iguais', 'perpendiculares', 'paralelos'] },
        { s: 'Razão de semelhança 1:2. Áreas?', r: '1:4', d: ['1:2', '2:1', '1:8'] },
        { s: 'Razão de semelhança 2:3. Áreas?', r: '4:9', d: ['2:3', '6:9', '8:27'] },
        { s: 'Triângulos semelhantes têm ângulos ___:', r: 'iguais', d: ['proporcionais', 'opostos', 'retos'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_polygon = () => Q(5, () => {
    const items = [
        { s: 'Ângulo interno do triângulo equilátero:', r: '60°', d: ['90°', '120°', '180°'] },
        { s: 'Ângulo interno do quadrado:', r: '90°', d: ['60°', '120°', '180°'] },
        { s: 'Ângulo interno do hexágono regular:', r: '120°', d: ['60°', '90°', '150°'] },
        { s: 'Soma dos ângulos internos do pentágono:', r: '540°', d: ['360°', '720°', '180°'] },
        { s: 'Soma dos internos: (n−2)·180°. n=8?', r: '1080°', d: ['900°', '1260°', '720°'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_probComp = () => Q(5, () => {
    const items = [
        { s: 'Duas moedas. Probabilidade de duas caras?', r: '1/4', d: ['1/2', '1/3', '2/4'] },
        { s: 'Dois dados. Probabilidade de soma 7?', r: '6/36', d: ['1/6', '7/36', '5/36'] },
        { s: 'Tirar 2 ases num baralho (sem reposição):', r: '1/221', d: ['1/52', '1/13', '1/26'] },
        { s: 'Eventos independentes: P(A e B) =', r: 'P(A) · P(B)', d: ['P(A) + P(B)', 'P(A) − P(B)', '1'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_stats = () => Q(5, () => {
    const items = [
        { s: 'Dados: 2, 4, 4, 6, 8. Média?', r: '4,8', d: ['4', '5', '6'] },
        { s: 'Dados: 2, 4, 4, 6, 8. Mediana?', r: '4', d: ['4,8', '6', '2'] },
        { s: 'Dados: 2, 4, 4, 6, 8. Moda?', r: '4', d: ['4,8', '6', 'não há'] },
        { s: 'Dados: 1, 3, 5, 7, 9. Mediana?', r: '5', d: ['4', '6', '3'] },
        { s: 'Dados: 10, 20, 30. Média?', r: '20', d: ['15', '30', '60'] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_irrational = () => Q(5, () => {
    const items = [
        { s: '√x = 5. x = ?', r: 25, d: [5, 10, 125] },
        { s: '√(x + 1) = 3. x = ?', r: 8, d: [9, 2, 3] },
        { s: '√(2x) = 4. x = ?', r: 8, d: [4, 16, 2] },
        { s: '√(x − 5) = 2. x = ?', r: 9, d: [4, 7, 3] },
    ];
    const it = pick(items);
    return { stem: it.s, ...makeChoice(it.r, it.d) };
});

const g_master = () => () => {
    // mix de tudo
    const pool = [g_pythCat(), g_bhaskaraRoots(), g_funcAfim(), g_trigSpecial(), g_sysSubst(), g_diffSquares(), g_percentApply(), g_areaTri(), g_power(), g_eq2sides()];
    const qs = pool.flatMap(g => g()).sort(() => Math.random() - 0.5).slice(0, 8);
    return qs;
};

/* ─── 181 fases ──────────────────────────────────────────────────────────
 * Cada fase: { id, region, name, gen }.
 * region indica a região no mapa (1..9).
 * ───────────────────────────────────────────────────────────────────────── */
const PHASES = [
    // ── 1º ano — Vila dos Números (1-20) ──
    { id: 1,  region: 1, name: 'Contar até 5',           gen: g_count(1, 5) },
    { id: 2,  region: 1, name: 'Contar até 10',          gen: g_count(3, 10) },
    { id: 3,  region: 1, name: 'O número zero',          gen: g_zero() },
    { id: 4,  region: 1, name: 'Contar até 15',          gen: g_count(5, 15) },
    { id: 5,  region: 1, name: 'Contar até 20',          gen: g_count(10, 20) },
    { id: 6,  region: 1, name: 'Maior e menor (1-10)',   gen: g_compare(0, 10) },
    { id: 7,  region: 1, name: 'Comparar até 20',        gen: g_compare(0, 20) },
    { id: 8,  region: 1, name: 'Sequência +1',           gen: g_pattern(0, 1) },
    { id: 9,  region: 1, name: 'Sequência +2',           gen: g_pattern(0, 2) },
    { id: 10, region: 1, name: 'Ordem crescente',        gen: g_orderAsc(1, 20) },
    { id: 11, region: 1, name: 'Ordem decrescente',      gen: g_orderDesc(1, 20) },
    { id: 12, region: 1, name: 'Número antes',           gen: g_before(1, 30) },
    { id: 13, region: 1, name: 'Número depois',          gen: g_after(0, 29) },
    { id: 14, region: 1, name: 'Formas geométricas',     gen: g_shapes() },
    { id: 15, region: 1, name: 'Mais lados, mais formas', gen: g_shapes() },
    { id: 16, region: 1, name: 'Sequência +5',           gen: g_pattern(0, 5) },
    { id: 17, region: 1, name: 'Sequência +10',          gen: g_pattern(0, 10) },
    { id: 18, region: 1, name: 'Dezenas e unidades',     gen: g_dezena() },
    { id: 19, region: 1, name: 'Comparar até 50',        gen: g_compare(0, 50) },
    { id: 20, region: 1, name: '⭐ Desafio da Vila',     gen: () => shuffle([...g_count(1, 20)(), ...g_compare(0, 30)(), ...g_shapes()()]).slice(0, 6) },

    // ── 2º ano — Bosque das Operações (21-40) ──
    { id: 21, region: 2, name: 'Soma até 10',            gen: g_add(5, 5) },
    { id: 22, region: 2, name: 'Soma até 20',            gen: g_add(10, 10) },
    { id: 23, region: 2, name: 'Subtração até 10',       gen: g_sub(10, 5) },
    { id: 24, region: 2, name: 'Subtração até 20',       gen: g_sub(20, 10) },
    { id: 25, region: 2, name: 'Soma até 50',            gen: g_add(30, 20) },
    { id: 26, region: 2, name: 'Subtração até 50',       gen: g_sub(50, 30) },
    { id: 27, region: 2, name: 'Par ou ímpar',           gen: g_parity() },
    { id: 28, region: 2, name: 'Dobro',                  gen: g_double(30) },
    { id: 29, region: 2, name: 'Metade',                 gen: g_half(30) },
    { id: 30, region: 2, name: 'Soma de 3 parcelas',     gen: g_add3(10) },
    { id: 31, region: 2, name: 'Soma até 100',           gen: g_add(50, 50) },
    { id: 32, region: 2, name: 'Subtração até 100',      gen: g_sub(100, 50) },
    { id: 33, region: 2, name: 'Antecessor/sucessor 100', gen: () => shuffle([...g_before(20, 100)(), ...g_after(20, 99)()]).slice(0, 5) },
    { id: 34, region: 2, name: 'Sequência de 5 em 5',    gen: g_seqStep(5) },
    { id: 35, region: 2, name: 'Sequência de 10 em 10',  gen: g_seqStep(10) },
    { id: 36, region: 2, name: 'Decomposição',           gen: g_decomp() },
    { id: 37, region: 2, name: 'Comparar até 100',       gen: g_compare(0, 100) },
    { id: 38, region: 2, name: 'Problemas (soma/sub)',   gen: g_wordSimple() },
    { id: 39, region: 2, name: 'Dobro avançado',         gen: g_double(50) },
    { id: 40, region: 2, name: '⭐ Desafio do Bosque',    gen: () => shuffle([...g_add(50, 50)(), ...g_sub(100, 50)(), ...g_parity()()]).slice(0, 6) },

    // ── 3º ano — Vale das Tabuadas (41-60) ──
    { id: 41, region: 3, name: 'Soma com reserva',       gen: g_addCarry() },
    { id: 42, region: 3, name: 'Subtração com empréstimo', gen: g_subBorrow() },
    { id: 43, region: 3, name: 'Tabuada do 2',           gen: g_table(2) },
    { id: 44, region: 3, name: 'Tabuada do 3',           gen: g_table(3) },
    { id: 45, region: 3, name: 'Tabuada do 4',           gen: g_table(4) },
    { id: 46, region: 3, name: 'Tabuada do 5',           gen: g_table(5) },
    { id: 47, region: 3, name: 'Tabuada do 6',           gen: g_table(6) },
    { id: 48, region: 3, name: 'Tabuada do 7',           gen: g_table(7) },
    { id: 49, region: 3, name: 'Tabuada do 8',           gen: g_table(8) },
    { id: 50, region: 3, name: 'Tabuada do 9',           gen: g_table(9) },
    { id: 51, region: 3, name: 'Tabuada do 10',          gen: g_table(10) },
    { id: 52, region: 3, name: 'Multiplicação mista',    gen: g_tableMix(2, 9) },
    { id: 53, region: 3, name: 'Divisão por 2',          gen: g_divExact(2) },
    { id: 54, region: 3, name: 'Divisão por 3, 4, 5',    gen: g_divExact(5) },
    { id: 55, region: 3, name: 'Divisão por 6 a 9',      gen: g_divExact(9) },
    { id: 56, region: 3, name: 'Divisão mista',          gen: g_divExact(10) },
    { id: 57, region: 3, name: 'Dinheiro: somar reais',  gen: g_money() },
    { id: 58, region: 3, name: 'Troco',                  gen: g_money() },
    { id: 59, region: 3, name: 'Problemas com mult/div', gen: g_wordSimple() },
    { id: 60, region: 3, name: '⭐ Desafio do Vale',      gen: () => shuffle([...g_tableMix(2, 9)(), ...g_divExact(9)(), ...g_money()()]).slice(0, 6) },

    // ── 4º ano — Caverna das Frações (61-80) ──
    { id: 61, region: 4, name: 'Multiplicação por 10/100', gen: g_mult10() },
    { id: 62, region: 4, name: 'Multiplicação 2 × 1',    gen: g_mult2x1() },
    { id: 63, region: 4, name: 'Multiplicação 2 × 2',    gen: g_mult2x2() },
    { id: 64, region: 4, name: 'Divisão com resto',      gen: g_divRest() },
    { id: 65, region: 4, name: 'Divisão de 2 dígitos',   gen: g_div2dig() },
    { id: 66, region: 4, name: 'O que é uma fração',     gen: g_fracTerm() },
    { id: 67, region: 4, name: 'Fração visual',          gen: g_fracVisual() },
    { id: 68, region: 4, name: 'Metade, terço, quarto',  gen: g_fracTerm() },
    { id: 69, region: 4, name: 'Frações equivalentes',   gen: g_fracEquiv() },
    { id: 70, region: 4, name: 'Comparar frações iguais', gen: g_fracCompareSameDen() },
    { id: 71, region: 4, name: 'Soma de frações iguais', gen: g_fracAddSame() },
    { id: 72, region: 4, name: 'Unidades de medida',     gen: g_units() },
    { id: 73, region: 4, name: 'Conversão de unidades',  gen: g_units() },
    { id: 74, region: 4, name: 'Perímetro',              gen: g_perimeter() },
    { id: 75, region: 4, name: 'Tempo: horas e min',     gen: g_time() },
    { id: 76, region: 4, name: 'Tempo: conversões',      gen: g_time() },
    { id: 77, region: 4, name: 'Problemas com frações',  gen: g_fracVisual() },
    { id: 78, region: 4, name: 'Divisão 2 dígitos avançada', gen: g_div2dig() },
    { id: 79, region: 4, name: 'Mistura caverna',        gen: () => shuffle([...g_mult2x1()(), ...g_fracVisual()()]).slice(0, 6) },
    { id: 80, region: 4, name: '⭐ Desafio da Caverna',  gen: () => shuffle([...g_fracVisual()(), ...g_perimeter()(), ...g_mult2x2()()]).slice(0, 6) },

    // ── 5º ano — Lago dos Decimais (81-100) ──
    { id: 81,  region: 5, name: 'Frações próprias/impróprias', gen: g_fracProperImproper() },
    { id: 82,  region: 5, name: 'Equivalentes avançadas', gen: g_fracEquiv() },
    { id: 83,  region: 5, name: 'Decimais: leitura',     gen: g_decRead() },
    { id: 84,  region: 5, name: 'Comparar decimais',     gen: g_decCompare() },
    { id: 85,  region: 5, name: 'Soma de decimais',      gen: g_decAdd() },
    { id: 86,  region: 5, name: 'Subtração de decimais', gen: g_decSub() },
    { id: 87,  region: 5, name: 'Decimais × 10, 100',    gen: g_decMult10() },
    { id: 88,  region: 5, name: 'Porcentagem básica',    gen: g_percentEasy() },
    { id: 89,  region: 5, name: '10%, 50%, 100%',        gen: g_percentEasy() },
    { id: 90,  region: 5, name: 'Porcentagem aplicada',  gen: g_percentApply() },
    { id: 91,  region: 5, name: 'Área do quadrado',      gen: g_areaSquare() },
    { id: 92,  region: 5, name: 'Área do retângulo',     gen: g_areaRect() },
    { id: 93,  region: 5, name: 'Volume do cubo',        gen: g_volumeCube() },
    { id: 94,  region: 5, name: 'Volume do paralelepípedo', gen: g_volumePar() },
    { id: 95,  region: 5, name: 'Probabilidade simples', gen: g_probSimple() },
    { id: 96,  region: 5, name: 'Média aritmética',      gen: g_mean() },
    { id: 97,  region: 5, name: 'Decimais misturados',   gen: () => shuffle([...g_decAdd()(), ...g_decSub()()]).slice(0, 6) },
    { id: 98,  region: 5, name: 'Porcentagem real',      gen: g_percentApply() },
    { id: 99,  region: 5, name: 'Geometria mista',       gen: () => shuffle([...g_areaRect()(), ...g_volumeCube()()]).slice(0, 6) },
    { id: 100, region: 5, name: '⭐ Desafio do Lago',     gen: () => shuffle([...g_decAdd()(), ...g_percentApply()(), ...g_areaRect()()]).slice(0, 6) },

    // ── 6º ano — Montanha dos Inteiros (101-120) ──
    { id: 101, region: 6, name: 'Reta dos inteiros',     gen: g_negLine() },
    { id: 102, region: 6, name: 'Soma com negativos',    gen: g_negAdd() },
    { id: 103, region: 6, name: 'Subtração de negativos', gen: g_negSub() },
    { id: 104, region: 6, name: 'Mult. com negativos',   gen: g_negMult() },
    { id: 105, region: 6, name: 'Divisão com negativos', gen: g_negDiv() },
    { id: 106, region: 6, name: 'Sinais misturados',     gen: () => shuffle([...g_negAdd()(), ...g_negMult()()]).slice(0, 6) },
    { id: 107, region: 6, name: 'MMC',                   gen: g_mmc() },
    { id: 108, region: 6, name: 'MDC',                   gen: g_mdc() },
    { id: 109, region: 6, name: 'Soma de frações ≠',     gen: g_fracAddDiff() },
    { id: 110, region: 6, name: 'Subtração de frações',  gen: g_fracAddDiff() },
    { id: 111, region: 6, name: 'Multiplicação fracion.', gen: g_fracMult() },
    { id: 112, region: 6, name: 'Divisão fracionária',   gen: g_fracDiv() },
    { id: 113, region: 6, name: 'Equação x + a = b',     gen: g_eq1() },
    { id: 114, region: 6, name: 'Equação x − a = b',     gen: g_eq1() },
    { id: 115, region: 6, name: 'Equação ax = b',        gen: g_eqMult() },
    { id: 116, region: 6, name: 'Equação x/a = b',       gen: g_eqMult() },
    { id: 117, region: 6, name: 'Porcentagem como fração', gen: g_percentEasy() },
    { id: 118, region: 6, name: 'Razão simples',         gen: g_ratioBasic() },
    { id: 119, region: 6, name: 'Operações mistas',      gen: () => shuffle([...g_negAdd()(), ...g_fracMult()(), ...g_eq1()()]).slice(0, 6) },
    { id: 120, region: 6, name: '⭐ Desafio da Montanha', gen: () => shuffle([...g_negMult()(), ...g_fracAddDiff()(), ...g_eqMult()()]).slice(0, 6) },

    // ── 7º ano — Deserto das Equações (121-140) ──
    { id: 121, region: 7, name: 'Equação 2 passos',      gen: g_eqMult() },
    { id: 122, region: 7, name: 'X dos dois lados',      gen: g_eq2sides() },
    { id: 123, region: 7, name: 'Equação com parênteses', gen: g_eqParen() },
    { id: 124, region: 7, name: 'Equação fracionária',   gen: g_eqFrac() },
    { id: 125, region: 7, name: 'Razão',                 gen: g_ratioBasic() },
    { id: 126, region: 7, name: 'Proporção',             gen: g_proportion() },
    { id: 127, region: 7, name: 'Regra de 3 direta',     gen: g_rule3() },
    { id: 128, region: 7, name: 'Regra de 3 inversa',    gen: g_rule3Inv() },
    { id: 129, region: 7, name: 'Desconto percentual',   gen: g_discount() },
    { id: 130, region: 7, name: 'Aumento percentual',    gen: g_increase() },
    { id: 131, region: 7, name: 'Juros simples',         gen: g_interestSimple() },
    { id: 132, region: 7, name: 'Tipos de ângulos',      gen: g_angles() },
    { id: 133, region: 7, name: 'Soma de ângulos',       gen: g_angles() },
    { id: 134, region: 7, name: 'Área de triângulo',     gen: g_areaTri() },
    { id: 135, region: 7, name: 'Área de paralelogramo', gen: g_areaPar() },
    { id: 136, region: 7, name: 'Área de trapézio',      gen: g_areaTrap() },
    { id: 137, region: 7, name: 'Círculo',               gen: g_circle() },
    { id: 138, region: 7, name: 'Problemas geométricos', gen: () => shuffle([...g_areaTri()(), ...g_areaPar()()]).slice(0, 6) },
    { id: 139, region: 7, name: 'Operações algébricas',  gen: () => shuffle([...g_eq2sides()(), ...g_proportion()()]).slice(0, 6) },
    { id: 140, region: 7, name: '⭐ Desafio do Deserto',  gen: () => shuffle([...g_eq2sides()(), ...g_rule3()(), ...g_discount()()]).slice(0, 6) },

    // ── 8º ano — Templo das Potências (141-160) ──
    { id: 141, region: 8, name: 'Potências básicas',     gen: g_power() },
    { id: 142, region: 8, name: 'Base inteira',          gen: g_power() },
    { id: 143, region: 8, name: 'Propriedades I',        gen: g_powerProp() },
    { id: 144, region: 8, name: 'Propriedades II',       gen: g_powerProp() },
    { id: 145, region: 8, name: 'Potência de potência',  gen: g_powerProp() },
    { id: 146, region: 8, name: 'Notação científica',    gen: g_sciNotation() },
    { id: 147, region: 8, name: 'Raiz quadrada',         gen: g_sqrt() },
    { id: 148, region: 8, name: 'Raiz aproximada',       gen: g_sqrtAprox() },
    { id: 149, region: 8, name: 'Raiz cúbica',           gen: g_cubeRoot() },
    { id: 150, region: 8, name: 'Valor numérico',        gen: g_algebraVal() },
    { id: 151, region: 8, name: 'Soma de monômios',      gen: g_monoSum() },
    { id: 152, region: 8, name: 'Multiplicação monômios', gen: g_monoMult() },
    { id: 153, region: 8, name: '(a + b)²',              gen: g_squarePlus() },
    { id: 154, region: 8, name: '(a − b)²',              gen: g_squareMinus() },
    { id: 155, region: 8, name: '(a + b)(a − b)',        gen: g_diffSquares() },
    { id: 156, region: 8, name: 'Fatoração',             gen: g_factor() },
    { id: 157, region: 8, name: 'Sistemas substituição', gen: g_sysSubst() },
    { id: 158, region: 8, name: 'Sistemas adição',       gen: g_sysSubst() },
    { id: 159, region: 8, name: 'Teorema de Tales',      gen: g_thales() },
    { id: 160, region: 8, name: '⭐ Desafio do Templo',  gen: () => shuffle([...g_power()(), ...g_diffSquares()(), ...g_sysSubst()()]).slice(0, 6) },

    // ── 9º ano — Cidadela do Mestre (161-181) ──
    { id: 161, region: 9, name: 'Função afim',           gen: g_funcAfim() },
    { id: 162, region: 9, name: 'Coeficientes da afim',  gen: g_funcAfim() },
    { id: 163, region: 9, name: 'Raiz da função afim',   gen: g_funcRoot() },
    { id: 164, region: 9, name: 'Gráfico da afim',       gen: g_funcGraph() },
    { id: 165, region: 9, name: 'Eq. 2º grau: forma',    gen: g_bhaskaraRoots() },
    { id: 166, region: 9, name: 'Discriminante (Δ)',     gen: g_bhaskaraDelta() },
    { id: 167, region: 9, name: 'Bhaskara: raízes',      gen: g_bhaskaraRoots() },
    { id: 168, region: 9, name: 'Soma e produto',        gen: g_sumProd() },
    { id: 169, region: 9, name: 'Vértice da parábola',   gen: g_vertex() },
    { id: 170, region: 9, name: 'Pitágoras: hipotenusa', gen: g_pythCat() },
    { id: 171, region: 9, name: 'Pitágoras: cateto',     gen: g_pythCat() },
    { id: 172, region: 9, name: 'Semelhança',            gen: g_similar() },
    { id: 173, region: 9, name: 'Trigonometria especial', gen: g_trigSpecial() },
    { id: 174, region: 9, name: 'Seno, cosseno e tg',    gen: g_trigSpecial() },
    { id: 175, region: 9, name: 'Polígonos regulares',   gen: g_polygon() },
    { id: 176, region: 9, name: 'Probabilidade composta', gen: g_probComp() },
    { id: 177, region: 9, name: 'Estatística I',         gen: g_stats() },
    { id: 178, region: 9, name: 'Estatística II',        gen: g_stats() },
    { id: 179, region: 9, name: 'Equações irracionais',  gen: g_irrational() },
    { id: 180, region: 9, name: 'Mistura final',         gen: () => shuffle([...g_bhaskaraRoots()(), ...g_pythCat()(), ...g_trigSpecial()()]).slice(0, 6) },
    { id: 181, region: 9, name: '🏆 Desafio Mestre',     gen: g_master() },
];

/* ─── Conquistas ────────────────────────────────────────────────────────── */
const ACHIEVEMENTS = [
    { id: 'first_phase',  name: 'Primeiro passo',         desc: 'Complete sua primeira fase',      check: s => Object.keys(s.stars).length >= 1 },
    { id: 'ten_phases',   name: 'Aquecido',               desc: '10 fases concluídas',             check: s => Object.keys(s.stars).length >= 10 },
    { id: 'thirty_phases', name: 'Em chamas',             desc: '30 fases concluídas',             check: s => Object.keys(s.stars).length >= 30 },
    { id: 'hundred_phases', name: 'Caminho longo',        desc: '100 fases concluídas',            check: s => Object.keys(s.stars).length >= 100 },
    { id: 'all_phases',   name: 'Mestre da matemática',   desc: 'Todas as 181 fases',              check: s => Object.keys(s.stars).length >= 181 },
    { id: 'perfectionist', name: 'Perfeccionista',        desc: '10 fases com 3 estrelas',         check: s => Object.values(s.stars).filter(x => x === 3).length >= 10 },
    { id: 'star_collector', name: 'Coletor de estrelas',  desc: '300 estrelas no total',           check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 300 },
    { id: 'all_stars',    name: 'Brilhantíssimo',         desc: 'Todas as estrelas (543)',         check: s => Object.values(s.stars).reduce((a, b) => a + b, 0) >= 543 },
    { id: 'region_1',     name: 'Numerologista',          desc: 'Conclua toda a Vila dos Números', check: s => PHASES.filter(p => p.region === 1).every(p => s.stars[p.id]) },
    { id: 'region_9',     name: 'Coroado',                desc: 'Conclua toda a Cidadela',         check: s => PHASES.filter(p => p.region === 9).every(p => s.stars[p.id]) },
    { id: 'xp_1000',      name: 'Mil XP',                 desc: 'Acumule 1000 XP',                 check: s => s.xp >= 1000 },
    { id: 'xp_5000',      name: '5K XP',                  desc: 'Acumule 5000 XP',                 check: s => s.xp >= 5000 },
];

/* ─── Persistência ─────────────────────────────────────────────────────── */
const localKey = id => `mq_progress_${id || 'anon'}`;

function saveLocal() {
    if (!state.userId) return;
    localStorage.setItem(localKey(state.userId), JSON.stringify({
        nickname: state.nickname, xp: state.xp, stars: state.stars, achievements: state.achievements,
    }));
}

function loadLocal() {
    const raw = localStorage.getItem(localKey(state.userId));
    if (!raw) return false;
    try {
        const d = JSON.parse(raw);
        state.nickname     = d.nickname     || state.nickname;
        state.xp           = d.xp           || 0;
        state.stars        = d.stars        || {};
        state.achievements = d.achievements || [];
        return true;
    } catch { return false; }
}

async function saveRemote() {
    if (!state.userId) return;
    try {
        await sb.from('mathquest_progress').upsert({
            user_id:      state.userId,
            nickname:     state.nickname,
            xp:           state.xp,
            stars:        state.stars,
            achievements: state.achievements,
            updated_at:   new Date().toISOString(),
        });
    } catch (e) { /* offline: ok, vai sincronizar depois */ }
}

async function loadRemote() {
    if (!state.userId) return false;
    const { data, error } = await sb.from('mathquest_progress')
        .select('nickname, xp, stars, achievements')
        .eq('user_id', state.userId).maybeSingle();
    if (error || !data) return false;
    state.nickname     = data.nickname     || state.nickname;
    state.xp           = data.xp           || 0;
    state.stars        = data.stars        || {};
    state.achievements = data.achievements || [];
    return true;
}

const persist = () => { saveLocal(); saveRemote(); };

/* ─── Auth anônima ─────────────────────────────────────────────────────── */
async function initAuth() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            state.userId = session.user.id;
        } else {
            const { data, error } = await sb.auth.signInAnonymously();
            if (error) throw error;
            state.userId = data.user?.id;
        }
    } catch (e) {
        // Modo offline: usa um ID local persistente
        let local = localStorage.getItem('mq_localuid');
        if (!local) { local = 'local-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('mq_localuid', local); }
        state.userId = local;
        toast('Jogando offline — progresso salvo neste dispositivo.', 'warn');
    }
}

/* ─── Desbloqueio e estrelas ───────────────────────────────────────────── */
function isUnlocked(phaseId) {
    if (phaseId === 1) return true;
    return Boolean(state.stars[phaseId - 1]);
}

function starsFor(phaseId) {
    return state.stars[phaseId] || 0;
}

function totalStars() {
    return Object.values(state.stars).reduce((a, b) => a + b, 0);
}

function completedCount() {
    return Object.keys(state.stars).length;
}

/* ─── Renderização: header HUD ─────────────────────────────────────────── */
function renderHud() {
    $('hudNick').textContent      = state.nickname || 'Aluno(a)';
    $('hudXp').textContent        = state.xp;
    $('hudStars').textContent     = totalStars();
    $('hudPhases').textContent    = `${completedCount()}/181`;
    $('btnMute').textContent      = state.muted ? '🔇' : '🔊';
}

/* ─── Renderização: mapa ───────────────────────────────────────────────── */
function renderMap() {
    const root = $('map');
    root.innerHTML = '';
    REGIONS.forEach(reg => {
        const phases = PHASES.filter(p => p.region === reg.id);
        const total  = phases.length;
        const got    = phases.filter(p => state.stars[p.id]).length;
        const wrap = document.createElement('section');
        wrap.className = 'region';
        wrap.style.setProperty('--rcolor', reg.color);
        wrap.innerHTML = `
            <header class="region-head">
                <div class="region-icon">${reg.icon}</div>
                <div>
                    <h2>${esc(reg.name)} <small>${reg.year}</small></h2>
                    <p>${esc(reg.desc)}</p>
                </div>
                <div class="region-progress">${got}/${total}</div>
            </header>
            <div class="phases" id="reg-${reg.id}"></div>
        `;
        root.appendChild(wrap);
        const node = wrap.querySelector('.phases');
        phases.forEach((p, idx) => {
            const unlocked = isUnlocked(p.id);
            const stars = starsFor(p.id);
            const el = document.createElement('button');
            el.className = `phase ${unlocked ? 'unlocked' : 'locked'} ${stars ? 'done' : ''}`;
            el.style.setProperty('--side', idx % 2 === 0 ? '-30px' : '30px');
            el.innerHTML = `
                <span class="phase-num">${p.id}</span>
                <span class="phase-name">${esc(p.name)}</span>
                <span class="phase-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
            `;
            el.disabled = !unlocked;
            el.title = unlocked ? `Fase ${p.id}: ${p.name}` : 'Complete a fase anterior para desbloquear';
            el.addEventListener('click', () => unlocked && startPhase(p));
            node.appendChild(el);
        });
    });
    renderHud();
}

/* ─── Tela de fase ─────────────────────────────────────────────────────── */
function startPhase(phase) {
    state.currentPhase = phase;
    state.questions    = phase.gen();
    state.qIndex       = 0;
    state.correct      = 0;
    state.hearts       = 3;
    state.earnedXp     = 0;
    state.answered     = false;
    $('mapView').style.display = 'none';
    $('phaseView').style.display = '';
    renderQuestion();
}

function renderQuestion() {
    const q = state.questions[state.qIndex];
    $('phaseTitle').textContent = `${state.currentPhase.id}. ${state.currentPhase.name}`;
    $('phaseProg').textContent  = `${state.qIndex + 1} / ${state.questions.length}`;
    $('hearts').innerHTML       = '❤'.repeat(state.hearts) + '<span class="lost">❤</span>'.repeat(3 - state.hearts);
    $('qStem').innerHTML        = q.stem;
    const opts = $('qOpts'); opts.innerHTML = '';
    q.options.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'opt';
        b.innerHTML = esc(opt);
        b.addEventListener('click', () => answer(i));
        opts.appendChild(b);
    });
    state.answered = false;
    $('btnNext').style.display = 'none';
}

function answer(i) {
    if (state.answered) return;
    state.answered = true;
    const q = state.questions[state.qIndex];
    const buttons = $('qOpts').querySelectorAll('.opt');
    buttons.forEach((b, idx) => {
        b.disabled = true;
        if (idx === q.correctIndex) b.classList.add('correct');
        if (idx === i && i !== q.correctIndex) b.classList.add('wrong');
    });
    if (i === q.correctIndex) {
        state.correct++;
        state.earnedXp += 10;
        sndCorrect();
        toast('Acertou!', 'success');
    } else {
        state.hearts--;
        sndWrong();
        toast('Errou.', 'error');
    }
    if (state.hearts <= 0) return setTimeout(() => endPhase(false), 700);
    if (state.qIndex >= state.questions.length - 1) return setTimeout(() => endPhase(true), 700);
    $('btnNext').style.display = '';
}

function nextQuestion() {
    state.qIndex++;
    renderQuestion();
}

function endPhase(completed) {
    const total = state.questions.length;
    const pct   = state.correct / total;
    let stars = 0;
    if (completed) {
        if (pct >= 1)    stars = 3;
        else if (pct >= 0.8) stars = 2;
        else if (pct >= 0.5) stars = 1;
        else stars = 0;
    }
    // mantém o melhor desempenho histórico da fase
    const prev = state.stars[state.currentPhase.id] || 0;
    if (stars > prev) state.stars[state.currentPhase.id] = stars;
    if (completed) state.xp += state.earnedXp;
    // bônus por estrelas novas
    if (stars > prev) state.xp += (stars - prev) * 25;

    checkAchievements();
    persist();
    if (stars > 0) sndStar();

    $('resultStars').innerHTML = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('resultMsg').textContent = stars >= 3 ? 'Perfeito!' : stars >= 2 ? 'Muito bem!' : stars >= 1 ? 'Boa!' : 'Tente de novo!';
    $('resultDetail').innerHTML = `
        Acertos: <b>${state.correct}/${total}</b> ·
        XP ganho: <b>+${state.earnedXp + (stars > prev ? (stars - prev) * 25 : 0)}</b>
    `;
    $('resultView').style.display = '';
    $('phaseView').style.display  = 'none';
    if (completed && stars > 0 && state.currentPhase.id < 181 && !state.stars[state.currentPhase.id + 1]) {
        setTimeout(() => { sndUnlock(); toast('Nova fase desbloqueada!', 'success'); }, 800);
    }
}

function backToMap() {
    $('resultView').style.display = 'none';
    $('phaseView').style.display  = 'none';
    $('mapView').style.display    = '';
    renderMap();
    const next = $(`reg-${state.currentPhase.region}`);
    if (next) next.parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function retryPhase() {
    startPhase(state.currentPhase);
    $('resultView').style.display = 'none';
}

/* ─── Conquistas ───────────────────────────────────────────────────────── */
function checkAchievements() {
    const newly = [];
    ACHIEVEMENTS.forEach(a => {
        if (!state.achievements.includes(a.id) && a.check(state)) {
            state.achievements.push(a.id);
            newly.push(a);
        }
    });
    if (newly.length) {
        newly.forEach((a, i) => setTimeout(() => toast(`🏅 ${a.name}: ${a.desc}`, 'success'), i * 1600 + 1200));
    }
}

function renderAchievements() {
    const root = $('achList'); root.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
        const got = state.achievements.includes(a.id);
        const el = document.createElement('div');
        el.className = `ach ${got ? 'got' : ''}`;
        el.innerHTML = `<div class="ach-icon">${got ? '🏅' : '🔒'}</div>
                        <div><b>${esc(a.name)}</b><br><small>${esc(a.desc)}</small></div>`;
        root.appendChild(el);
    });
}

/* ─── Boas-vindas (cadastra apelido) ───────────────────────────────────── */
function showWelcome() {
    $('welcome').style.display = '';
    $('app').style.display     = 'none';
}

function hideWelcome() {
    $('welcome').style.display = 'none';
    $('app').style.display     = '';
}

async function startGame() {
    const nick = $('nickInput').value.trim();
    if (!nick) { $('welcomeError').textContent = 'Digite seu nome para começar.'; return; }
    if (nick.length > 30) { $('welcomeError').textContent = 'Nome longo demais (máx. 30).'; return; }
    state.nickname = nick;
    persist();
    hideWelcome();
    renderMap();
}

/* ─── Inicialização ────────────────────────────────────────────────────── */
async function init() {
    $('loader').style.display = '';
    await initAuth();
    const remote = await loadRemote();
    if (!remote) loadLocal();
    if (!state.nickname) {
        $('loader').style.display = 'none';
        showWelcome();
    } else {
        hideWelcome();
        renderMap();
        $('loader').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Bind UI
    $('btnStart')      .addEventListener('click', startGame);
    $('nickInput')     .addEventListener('keydown', e => e.key === 'Enter' && startGame());
    $('btnNext')       .addEventListener('click', nextQuestion);
    $('btnBackMap')    .addEventListener('click', () => { if (confirm('Sair da fase? O progresso desta tentativa será perdido.')) backToMap(); });
    $('btnBackFromRes').addEventListener('click', backToMap);
    $('btnRetry')      .addEventListener('click', retryPhase);
    $('btnMute')       .addEventListener('click', () => {
        state.muted = !state.muted;
        localStorage.setItem('mq_muted', state.muted ? '1' : '0');
        renderHud();
    });
    $('btnAch')        .addEventListener('click', () => {
        renderAchievements();
        $('achDrawer').classList.toggle('open');
    });
    $('btnCloseAch')   .addEventListener('click', () => $('achDrawer').classList.remove('open'));
    $('btnSwapName')   .addEventListener('click', () => {
        const n = prompt('Novo nome:', state.nickname);
        if (n && n.trim()) { state.nickname = n.trim().slice(0, 30); persist(); renderHud(); }
    });
    // Service Worker
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    init();
});

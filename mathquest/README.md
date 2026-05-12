# MathQuest — Aprenda matemática jogando

Jogo educacional de matemática em **mundo aberto** para alunos do **1º ao 9º ano**. 181 fases progressivas, do reconhecimento de números até Bhaskara, Pitágoras e trigonometria.

Demo: https://non-s.github.io/MathQuest

Tecnologias: HTML + CSS + JavaScript (sem framework) · Supabase Auth (anônimo) + Postgres · GitHub Pages.

---

## O que é

181 fases divididas em 9 regiões. Cada região é um ano escolar. Cada fase tem 5–8 questões geradas algoritmicamente — o aluno nunca vê a mesma sequência duas vezes. A pontuação vai de 0 a 3 estrelas por fase, baseado em acertos; cada fase desbloqueia a próxima ao ganhar pelo menos 1 estrela.

| Região                        | Ano  | Fases | Habilidades-chave                                |
|-------------------------------|------|-------|--------------------------------------------------|
| 🏘️ Vila dos Números           | 1º   | 1–20  | Contar, comparar, sequenciar, formas             |
| 🌳 Bosque das Operações       | 2º   | 21–40 | Soma/sub até 100, par/ímpar, dobro/metade        |
| 🌾 Vale das Tabuadas          | 3º   | 41–60 | Mult/div, tabuadas 2–10, dinheiro                |
| 🕳️ Caverna das Frações        | 4º   | 61–80 | Frações iniciais, perímetro, unidades, tempo     |
| 🏞️ Lago dos Decimais          | 5º   | 81–100 | Decimais, %, área, volume, probabilidade        |
| ⛰️ Montanha dos Inteiros      | 6º   | 101–120 | Negativos, MMC/MDC, frações, equações 1 passo  |
| 🏜️ Deserto das Equações       | 7º   | 121–140 | Equações 2 lados, razão, regra de 3, %, áreas  |
| 🏛️ Templo das Potências       | 8º   | 141–160 | Potências, raízes, álgebra, produtos notáveis  |
| 🏰 Cidadela do Mestre         | 9º   | 161–181 | Funções, Bhaskara, Pitágoras, trigonometria    |

---

## Configuração em 4 passos

### 1. Crie um projeto Supabase

Em [supabase.com](https://supabase.com): novo projeto. Anote **URL do projeto** e **chave anon** em *Settings → API*.

### 2. Habilite o auth anônimo

*Authentication → Providers → Anonymous Sign-ins* → **Enable**. Sem cadastro, sem e-mail, sem senha — o aluno entra com um apelido e o Supabase emite um JWT vinculado à sessão.

### 3. Execute o schema

No *SQL Editor*:

```sql
CREATE TABLE mathquest_progress (
    user_id      UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    nickname     TEXT,
    xp           INT DEFAULT 0,
    stars        JSONB DEFAULT '{}'::jsonb,   -- { "1": 3, "2": 2, ... }
    achievements TEXT[] DEFAULT '{}',
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mathquest_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own progress"  ON mathquest_progress
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "write own progress" ON mathquest_progress
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own progress" ON mathquest_progress
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

A política é literal: cada aluno só lê e escreve a própria linha. Mesmo que o JS do navegador seja adulterado, o banco devolve 403 em qualquer tentativa de tocar outro `user_id`.

### 4. Cole suas credenciais

Em `script.js`:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

A chave anon é pública por design — quem protege é o RLS.

---

## Arquitetura

### Geradores de questão, não banco de questões

Cada fase declara um *gerador*: uma função que produz N questões com parâmetros aleatórios mas controlados:

```js
const g_table = (n) => Q(5, () => {
    const k = rand(1, 10), c = n * k;
    return { stem: `${n} × ${k} = ?`, ...makeChoice(c, nearDistr(c, n + 2)) };
});
```

Vantagens:

- A fase 43 ("tabuada do 2") gera 5 questões novas a cada tentativa — o aluno aprende o conceito, não memoriza a posição da resposta.
- Distratores próximos do valor correto (`nearDistr`) forçam o aluno a calcular, não a chutar por extremos.
- O arquivo `script.js` cabe em ~84KB porque é todo composição de funções.

### Auth anônimo + localStorage como espelho

O fluxo:

1. `sb.auth.signInAnonymously()` na primeira visita — gera um `user_id` persistente no navegador.
2. Progresso é salvo no Supabase em todo final de fase, e também em `localStorage` como cache local.
3. Na inicialização, lê primeiro do remoto. Se offline, cai pra cópia local. PWA garante que dá pra jogar sem rede.

Resultado: o aluno não cria conta, mas seu progresso sobrevive a fechar o navegador. Trocar de dispositivo perde o progresso (intencional — sem cadastro, sem rastreabilidade).

### Mapa: CSS Grid + variáveis por região

Sem canvas, sem SVG complexo. Cada região é um `<section>` com `--rcolor` próprio, e cada fase é um `<button>` posicionado em zig-zag via `--side` aplicada inline. O resultado parece um *world map* sem nenhum framework de UI.

```css
.phase { margin-left: var(--side, 0); }
```

```js
el.style.setProperty('--side', idx % 2 === 0 ? '-30px' : '30px');
```

### Som via Web Audio, sem assets

`AudioContext` + osciladores curtos. Acerto = duas notas ascendentes, erro = onda quadrada grave, estrela = arpejo de 4 notas. Zero arquivo de áudio para baixar.

### Acessibilidade básica

- `:focus-visible` com borda laranja
- `aria` implícito via `<button>`s reais (sem `<div onclick>`)
- Contraste alto (texto `#e6edf3` sobre `#0d1117`)
- Funciona com teclado: ↵ entra, ← volta

### Prevenção de XSS

Toda string que vai pro `innerHTML` passa por `esc()` — escape de `& < > "`. Apelido do aluno, descrições de fases, opções de resposta: tudo escapado.

---

## Sistema de progressão

- **XP**: 10 por acerto + bônus de 25 por nova estrela ganha.
- **Estrelas**: 100% acerto → 3⭐, ≥80% → 2⭐, ≥50% → 1⭐, abaixo → 0⭐.
- **Vidas**: 3 corações por fase. Acabou? Reinicia a fase com 0⭐.
- **Desbloqueio**: fase N+1 só destrava ao ganhar ao menos 1⭐ na fase N. A fase 181 ("Desafio Mestre") exige completar todas as anteriores.
- **Conquistas**: 12 medalhas (primeiro passo, perfeccionista, 100 fases, coletor de estrelas etc.).

---

## Arquivos

```
mathquest/
├── index.html      — boas-vindas, HUD, mapa, fase, resultado, drawer de conquistas
├── style.css       — tema escuro, mapa por região, animações
├── script.js       — geradores, fases, mapa, auth, Supabase, som
├── manifest.json   — PWA (instalável no celular)
├── sw.js           — service worker (cache offline-first)
├── icon.svg        — ícone do app
├── 404.html        — fallback SPA do GitHub Pages
├── robots.txt
└── README.md
```

Sem etapa de build. Sem bundler. Sem framework. Sem dependência de runtime além do Supabase JS via CDN.

---

[Portfolio](https://github.com/non-s/Portfolio) · [TakStud](https://github.com/non-s/TakStud) · [Uplift](https://github.com/non-s/Uplift)

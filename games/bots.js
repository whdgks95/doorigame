// 컴퓨터 플레이어 (이지 / 미디움 / 하드 / 인세인 / AI)
// 봇은 사람과 똑같이 자기 시점 view만 보고 판단합니다. (상대 카드, 숨은 공식 등을 몰래 보지 않음)
// plan(gameId, view, level, mem, game) → { delay(ms), action } 또는 null(지금 할 일 없음)
const { rint, pick, shuffle } = require('./util');
const formulas = require('./formulas');

const LEVELS = ['easy', 'medium', 'hard', 'insane', 'ai'];
const LEVEL_NAMES = { easy: '이지', medium: '미디움', hard: '하드', insane: '인세인', ai: 'AI' };
const chance = p => Math.random() < p;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const think = L => [1700, 1400, 1100, 900, 700][L] + rint(0, 700);
const PLANS = {};

function plan(gameId, view, level, mem, game) {
  if (!view || view.over) return null;
  const L = Math.max(0, LEVELS.indexOf(level));
  const base = gameId.replace(/_plus$/, '');
  const f = PLANS[base];
  return f ? f(view, L, mem, game) : null;
}

/* ───────── 흑과 백 / 그림자 입찰 ───────── */

// AI용 흑과 백 몬테카를로 탐색: 후보 점수마다 남은 경기를 여러 번 시뮬레이션해서 승률이 가장 높은 점수 선택
function bwRollout(my, op, mw, ow, round, meFirst, colorOf, rounds) {
  while (round <= rounds && mw < 5 && ow < 5) {
    const remain = rounds - round + 1;
    if (mw > ow + remain || ow > mw + remain) break;
    const bud = (p, need) => p / Math.max(1, Math.min(need, remain));
    const firstBet = p => clamp(Math.round(bud(p, 5) * (0.5 + Math.random() * 0.9) * (Math.random() < 0.2 ? 0.1 : 1)), 0, p);
    const secondBet = (p, c, need) => {
      const [lo, hi] = c;
      const cost = hi + 1;
      if (cost <= p && cost <= bud(p, need) * 1.3 && cost - (lo + hi) / 2 <= 7) return cost;
      return 0;
    };
    let a, b;
    if (meFirst) { a = firstBet(my); b = secondBet(op, colorOf(a), 5 - ow); }
    else { b = firstBet(op); a = secondBet(my, colorOf(b), 5 - mw); }
    a = Math.min(a, my); b = Math.min(b, op);
    my -= a; op -= b;
    if (a > b) { mw++; meFirst = true; } else if (b > a) { ow++; meFirst = false; }
    round++;
  }
  return mw > ow ? 1 : mw === ow ? 0.5 : 0;
}
function bwSearch(v, oMin, oMax, rangeOf) {
  const colorOf = n => rangeOf(v.plus ? (n <= 9 ? '흑' : n <= 29 ? '회' : '백') : (n <= 9 ? '흑' : '백'));
  const pts = v.myPts, mw = v.wins[0], ow = v.wins[1];
  const cands = new Set([0, 1, 2, 3, 5, 7, 9, 10, 11, 12, 15, 18, 20, 25, 29, 30, 31, 35, 40, 50, oMax + 1, oMin + 1]);
  let shownLo = 0, shownHi = 99;
  if (!v.iAmFirst) { [shownLo, shownHi] = rangeOf(v.oppColor || '흑'); shownHi = Math.min(shownHi, oMax); shownLo = Math.min(shownLo, shownHi); for (let x = shownLo; x <= shownHi + 1; x += Math.max(1, Math.floor((shownHi - shownLo) / 6))) cands.add(x + 1); cands.add(shownHi + 1); }
  const SIMS = 140;
  let best = 0, bestScore = -1;
  for (const b of [...cands].filter(x => x >= 0 && x <= pts)) {
    let score = 0;
    for (let k = 0; k < SIMS; k++) {
      const op = rint(oMin, Math.max(oMin, oMax));
      let oppBet;
      if (!v.iAmFirst) oppBet = rint(Math.min(shownLo, op), Math.min(shownHi, op));
      else {
        // 상대(후)는 내 색만 보고 반응
        const [lo, hi] = colorOf(b);
        const cost = hi + 1, remain = v.rounds - v.round + 1;
        const bud = op / Math.max(1, Math.min(5 - ow, remain));
        oppBet = cost <= op && cost <= bud * 1.3 && cost - (lo + hi) / 2 <= 7 ? cost : (Math.random() < 0.15 ? rint(lo, Math.min(op, hi)) : 0);
      }
      oppBet = Math.min(oppBet, op);
      const nm = pts - b, no = op - oppBet;
      let w1 = mw, w2 = ow, meFirst = v.iAmFirst;
      if (b > oppBet) { w1++; meFirst = true; } else if (oppBet > b) { w2++; meFirst = false; }
      score += bwRollout(nm, no, w1, w2, v.round + 1, meFirst, colorOf, v.rounds);
    }
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return best;
}

PLANS.blackwhite = (v, L) => {
  if (!v.myTurn) return null;
  const pts = v.myPts;
  const range = c => (c === '흑' ? [0, 9] : c === '회' ? [10, 29] : v.plus ? [30, 99] : [10, 99]);
  const lampRange = n => [[0, 0], [1, 19], [20, 39], [40, 59], [60, 79], [80, 99]][n];
  // 상대 남은 점수 범위 추론
  let oMin = 99, oMax = 99;
  for (const l of v.log) {
    let [lo, hi] = range(l.oppColor);
    if (L >= 3) { // 승패 결과까지 쓰면 상대가 낸 점수 범위가 훨씬 좁아짐
      if (l.result === 'win') hi = Math.min(hi, l.myBet - 1);
      else if (l.result === 'lose') lo = Math.max(lo, l.myBet + 1);
      else { lo = hi = l.myBet; }
      if (lo > hi) [lo, hi] = range(l.oppColor);
    }
    oMax -= lo; oMin -= hi;
  }
  oMin = Math.max(0, oMin);
  const [lmLo, lmHi] = lampRange(v.oppLamps);
  oMin = Math.max(oMin, lmLo); oMax = Math.min(oMax, lmHi);
  if (oMin > oMax) { oMin = lmLo; oMax = lmHi; }
  const needWins = Math.max(1, 5 - v.wins[0]);
  const oppNeed = Math.max(1, 5 - v.wins[1]);
  const roundsLeft = v.rounds - v.round + 1;
  const mustWin = v.wins[1] - v.wins[0] >= roundsLeft - 1 && roundsLeft <= needWins + 1;
  const budget = pts / Math.max(1, Math.min(needWins, roundsLeft));
  const reserve = Math.max(0, needWins - 1); // 남은 승리용으로 최소 1점씩
  let amount, disguise;
  if (L === 0) amount = rint(0, Math.min(pts, 25));
  else if (L <= 2) {
    if (!v.iAmFirst) {
      let [lo, hi] = range(v.oppColor || '흑');
      if (L >= 2) { hi = Math.min(hi, oMax); lo = Math.min(lo, hi); }
      const winCost = hi + 1;
      const allow = budget * [1, 1.2, 1.4][L] + (mustWin ? pts : 0);
      const overpay = winCost - (lo + hi) / 2; // 상대가 쓴 것보다 얼마나 더 내야 하나
      if (winCost <= pts && winCost <= allow && (L < 2 || mustWin || overpay <= 7)) amount = winCost;
      else if (L >= 2 && !v.plus && lo + 1 <= Math.min(pts, budget) && chance(0.35)) amount = Math.min(pts, rint(lo + 1, Math.max(lo + 1, Math.min(budget, Math.floor((lo + hi) / 2) + 1))));
      else amount = 0;
    } else {
      amount = Math.round(budget * (0.6 + Math.random() * 0.7));
      if (L >= 2 && oMax + 1 <= pts && oMax + 1 <= budget * (v.plus ? 1.2 : 1.6)) amount = Math.max(amount, oMax + 1);
      if (mustWin) amount = Math.min(pts, Math.max(amount, oMax + 1));
    }
  } else {
    // 인세인 / AI
    const oppBudget = (oMin + oMax) / 2 / oppNeed;
    // AI 전용: 지난 라운드로 상대 성향 학습
    let trickRate = L === 4 ? 0.3 : 0.25;
    const firstBets = {}; // 상대가 선일 때 색별로 실제 낸 점수의 상한 추정
    if (L === 4) {
      const tricks = v.log.filter(l => l.iWentFirst && l.myBet >= 10 && l.myBet <= 12);
      if (tricks.length >= 2) {
        const folds = tricks.filter(l => l.result === 'win').length / tricks.length;
        trickRate = folds >= 0.6 ? 0.55 : folds <= 0.3 ? 0.08 : 0.3;
      }
      for (const l of v.log.filter(x => !x.iWentFirst)) {
        let [lo2, hi2] = range(l.oppColor);
        if (l.result === 'win') hi2 = Math.min(hi2, l.myBet - 1); else if (l.result === 'lose') lo2 = Math.max(lo2, l.myBet + 1); else lo2 = hi2 = l.myBet;
        (firstBets[l.oppColor] = firstBets[l.oppColor] || []).push(lo2 > hi2 ? range(l.oppColor)[1] : hi2);
      }
    }
    if (!v.iAmFirst) {
      let shown = v.oppColor || '흑';
      // 상대 위장 토큰이 지금 막 쓰였는지 감지 (토큰은 없어졌는데 지난 기록엔 위장이 없음)
      const usedNow = v.plus && !v.disguiseLeft[1] && !v.log.some(l => l.disguise === 'opp');
      let lo, hi;
      if (usedNow) { lo = 0; hi = oMax; const [slo, shi] = range(shown); if (slo === 0) lo = 10; else if (shi >= oMax) hi = slo - 1; }
      else [lo, hi] = range(shown);
      hi = Math.min(hi, oMax); lo = Math.min(lo, hi);
      // AI: 이 색으로 상대가 실제로 낸 점수 이력이 있으면 그 근처로 상한을 좁혀 봄
      const seen = !usedNow && firstBets[shown];
      if (seen && seen.length >= 2 && chance(0.6)) hi = Math.min(hi, Math.max(lo, Math.max(...seen) + 2));
      const winCost = hi + 1;
      const allow = (L === 4 ? 1.9 : 1.7) * Math.max(budget, oppBudget * 0.8) + (mustWin ? pts : 0);
      const overpay = winCost - (lo + hi) / 2;
      if (winCost <= pts - reserve && winCost <= allow && overpay <= (L === 4 ? 6 : 7)) amount = winCost;
      else if (mustWin && winCost <= pts) amount = winCost;
      else if (lo + 1 <= pts - reserve && lo + 1 <= budget && (lo + hi) / 2 < budget * 1.2 && chance(v.plus ? 0.25 : L === 4 ? 0.45 : 0.35)) amount = Math.min(pts - reserve, budget, Math.round(lo + (hi - lo) * 0.6) + 1);
      else amount = 0; // 상대가 크게 낸 판은 버려서 점수 차 벌리기
    } else {
      const sure = oMax + 1;
      if (sure <= pts - reserve && sure <= budget * (L === 4 ? 2.2 : 1.8)) amount = sure; // 확실한 승리
      else {
        const r = Math.random();
        const lowWhite = 10; // 색 경계값: 비싸 보이는 색의 가장 싼 점수 (기본: 백, 심화: 회)
        if (r < trickRate) amount = lowWhite + rint(0, 2);
        else if (r < 0.45) amount = rint(0, 3); // 미끼 (상대가 크게 쓰게 유도)
        else amount = Math.round(Math.max(budget, oppBudget + 1) * (0.85 + Math.random() * 0.35));
      }
      if (mustWin) amount = Math.max(amount, Math.min(pts, sure));
      if (v.plus && v.disguiseLeft[0] && amount >= 30 && chance(0.75)) disguise = '흑';
      else if (v.plus && L === 4 && v.disguiseLeft[0] && amount <= 9 && chance(0.25) && roundsLeft > 3) disguise = '백';
    }
    if (L === 4) {
      const searched = bwSearch(v, oMin, oMax, range);
      // 탐색 결과를 쓰되, 가끔은 섞어서 읽히지 않게
      if (!chance(0.15)) amount = searched;
      if (v.plus && v.iAmFirst && v.disguiseLeft[0] && amount >= 30 && chance(0.6)) disguise = '흑';
      else if (disguise && amount < 30 && disguise === '흑') disguise = undefined;
    }
  }
  amount = clamp(Math.round(amount), 0, pts);
  const realColor = v.plus ? (amount <= 9 ? '흑' : amount <= 29 ? '회' : '백') : (amount <= 9 ? '흑' : '백');
  if (!v.plus || !v.iAmFirst || !v.disguiseLeft[0] || disguise === realColor) disguise = undefined;
  return { delay: think(L), action: { type: 'bet', amount, disguise } };
};

/* ───────── 결! 합! / 삼합 스피드 ───────── */
PLANS.gyulhap = (v, L, mem, g) => {
  const ids = v.board.map(t => t.shape + t.color * 3 + t.bg * 9);
  const left = g.allHaps(ids).filter(k => !v.claimed.includes(k));
  const [a, b] = [[12000, 20000], [7500, 12000], [4500, 7500], [2600, 4200], [1500, 2600]][L];
  const delay = rint(a, b) * (v.plus ? 1.2 : 1);
  const N = v.board.length;
  if (left.length) {
    if (chance([0.25, 0.1, 0.04, 0, 0][L])) { // 실수
      const c = shuffle([...Array(N).keys()].map(k => k + 1)).slice(0, 3);
      return { delay, action: { type: 'hap', cells: c } };
    }
    if (L === 0 && chance(0.03)) return { delay, action: { type: 'gyul' } };
    return { delay, action: { type: 'hap', cells: pick(left).split('-').map(Number) } };
  }
  return { delay: delay * 0.8, action: { type: 'gyul' } };
};

/* ───────── 인디언 포커 / 이마 포커 ───────── */
PLANS.indian = (v, L, mem, g) => {
  if (!v.myTurn) return null;
  const legal = [{ type: 'call' }, { type: 'fold' }];
  if (v.maxRaise >= 1) legal.push({ type: 'raise', amount: rint(1, Math.min(5, v.maxRaise)) });
  if (L === 0) {
    const a = pick(legal);
    if (a.type === 'fold' && v.need === 0) return { delay: think(L), action: { type: 'call' } };
    return { delay: think(L), action: a };
  }
  // 내 카드 확률 분포: 남은 덱 추정
  let deck = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...(v.plus ? [99] : [])];
  const remove = c => { const k = deck.indexOf(c); if (k >= 0) deck.splice(k, 1); };
  if (L >= 2) {
    const total = deck.length;
    const usedRounds = Math.max(0, Math.round((total - v.deckLeft - 2) / 2));
    v.history.slice(-usedRounds).forEach(r => { if (usedRounds) { remove(r.myCard); remove(r.oppCard); } });
  }
  remove(v.oppCard);
  if (!deck.length) deck = [5];
  let p = deck.reduce((s, c) => { const r = g.cmp(c, v.oppCard); return s + (r > 0 ? 1 : r === 0 ? 0.5 : 0); }, 0) / deck.length;
  const p10 = deck.filter(c => c === 10).length / deck.length;
  // 상대가 크게 걸면 내 카드가 약하다는 신호 (상대는 내 카드를 봄)
  const oppRaise = v.actions.filter(a => !a.mine && a.type === 'raise').reduce((s, a) => s + a.amount, 0);
  if (L >= 3) p *= 1 - Math.min(0.5, oppRaise * (L === 4 ? 0.06 : 0.04));
  const need = v.need, pot = v.pot;
  const foldCost = L >= 3 ? p10 * 10 : 0;
  const callEV = p * (pot + need) - need;
  const raiseAt = [1, 0.74, 0.7, 0.67, 0.65][L];
  let action;
  if (v.maxRaise >= 1 && p >= raiseAt) {
    const amt = clamp(Math.round((p - 0.45) * [0, 10, 14, 18, 20][L] * (0.7 + Math.random() * 0.6)), 1, v.maxRaise);
    action = { type: 'raise', amount: amt };
  } else if (L >= 3 && need === 0 && p < 0.3 && v.maxRaise >= 1 && chance(0.12)) {
    action = { type: 'raise', amount: clamp(rint(2, 4), 1, v.maxRaise) }; // 블러프
  } else if (need === 0) action = { type: 'call' };
  else if (L === 1) action = p > 0.42 ? { type: 'call' } : { type: 'fold' };
  else action = callEV > -foldCost - 0.5 ? { type: 'call' } : { type: 'fold' };
  return { delay: think(L), action };
};

/* ───────── 십이장기 / 미니 왕국전 (알파베타 탐색) ───────── */
const VAL = { K: 0, R: 5, B: 4, G: 6, P: 1.6, N: 4.2 };
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]], DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const KN = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];
const WIN = 10000;
function jgDirs(t, f) {
  switch (t) {
    case 'K': return [...ORTH, ...DIAG]; case 'R': return ORTH; case 'B': return DIAG;
    case 'P': return [[f, 0]]; case 'G': return [...ORTH, [f, -1], [f, 1]]; case 'N': return KN;
  }
  return [];
}
function jgSearchRoot(v, depth, timeLimit) {
  // 0 = 나(봇), 1 = 상대
  const board = v.board.map(row => row.map(p => p && { t: p.t, o: p.mine ? 0 : 1 }));
  const hands = [v.myHand.slice(), v.oppHand.slice()];
  const fwd = [v.flip ? 1 : -1, v.flip ? -1 : 1];
  const enemyRow = [v.myEnemyRow, 3 - v.myEnemyRow];
  const start = Date.now();
  let aborted = false;
  function kingOn(s) { for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const p = board[r][c]; if (p && p.t === 'K' && p.o === s) return [r, c]; } return null; }
  function gen(s) {
    const moves = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const p = board[r][c];
      if (!p || p.o !== s) continue;
      for (const [dr, dc] of jgDirs(p.t, fwd[s])) {
        const tr = r + dr, tc = c + dc;
        if (tr < 0 || tr > 3 || tc < 0 || tc > 2) continue;
        const q = board[tr][tc];
        if (q && q.o === s) continue;
        moves.push({ k: 'm', fr: r, fc: c, tr, tc, cap: q ? q.t : null });
      }
    }
    const seen = new Set();
    for (const t of hands[s]) {
      if (seen.has(t)) continue; seen.add(t);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) if (!board[r][c] && r !== enemyRow[s]) moves.push({ k: 'd', t, tr: r, tc: c });
    }
    // 잡는 수 먼저 (가지치기 효율)
    moves.sort((a, b) => (b.cap ? (b.cap === 'K' ? 100 : VAL[b.cap]) : 0) - (a.cap ? (a.cap === 'K' ? 100 : VAL[a.cap]) : 0));
    return moves;
  }
  function make(s, m) {
    const undo = { m };
    if (m.k === 'm') {
      const p = board[m.fr][m.fc];
      undo.p = p; undo.cap = board[m.tr][m.tc]; undo.oldT = p.t;
      if (undo.cap) hands[s].push(undo.cap.t === 'G' ? 'P' : undo.cap.t);
      board[m.tr][m.tc] = p; board[m.fr][m.fc] = null;
      if (p.t === 'P' && m.tr === enemyRow[s]) p.t = 'G';
    } else {
      hands[s].splice(hands[s].indexOf(m.t), 1);
      board[m.tr][m.tc] = { t: m.t, o: s };
    }
    return undo;
  }
  function unmake(s, u) {
    const m = u.m;
    if (m.k === 'm') {
      u.p.t = u.oldT;
      board[m.fr][m.fc] = u.p; board[m.tr][m.tc] = u.cap;
      if (u.cap) hands[s].splice(hands[s].lastIndexOf(u.cap.t === 'G' ? 'P' : u.cap.t), 1);
    } else { board[m.tr][m.tc] = null; hands[s].push(m.t); }
  }
  function evaluate(s) {
    let sc = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const p = board[r][c]; if (!p) continue;
      let val = VAL[p.t];
      if (p.t === 'K') { const dist = Math.abs(r - enemyRow[p.o]); val = (3 - dist) * 0.35; }
      sc += p.o === s ? val : -val;
    }
    for (const t of hands[s]) sc += VAL[t] * 0.85;
    for (const t of hands[1 - s]) sc -= VAL[t] * 0.85;
    return sc;
  }
  function negamax(s, d, alpha, beta, ply) {
    if (timeLimit && Date.now() - start > timeLimit) { aborted = true; return 0; }
    const myK = kingOn(s), opK = kingOn(1 - s);
    if (!myK) return -WIN + ply;
    if (!opK) return WIN - ply;
    if (myK[0] === enemyRow[s]) return WIN - ply; // 내 왕이 적진에서 버팀
    if (d === 0) return evaluate(s);
    const moves = gen(s);
    if (!moves.length) return evaluate(s);
    let best = -Infinity;
    for (const m of moves) {
      if (m.cap === 'K') return WIN - ply;
      const u = make(s, m);
      const sc = -negamax(1 - s, d - 1, -beta, -alpha, ply + 1);
      unmake(s, u);
      if (aborted) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }
  let rootOrder = null;
  function searchDepth(d) {
    let moves = gen(0);
    if (!rootOrder) rootOrder = shuffle(moves.slice());
    // 이전 깊이의 최선수를 먼저 (가지치기 효율), 나머지는 섞인 순서
    moves = rootOrder;
    let best = null, bestSc = -Infinity;
    for (const m of moves) {
      if (m.cap === 'K') return { m, sc: WIN };
      const u = make(0, m);
      const sc = -negamax(1, d - 1, -Infinity, -bestSc, 1);
      unmake(0, u);
      if (aborted) return null;
      if (sc > bestSc) { bestSc = sc; best = m; }
    }
    if (best) rootOrder = [best, ...rootOrder.filter(x => x !== best)];
    return { m: best, sc: bestSc };
  }
  if (!timeLimit) return searchDepth(depth);
  let res = null;
  for (let d = 1; d <= depth; d++) {
    const r = searchDepth(d);
    if (!r || aborted) break;
    res = r;
    if (r.sc >= WIN - 50) break;
  }
  return res;
}
PLANS.janggi12 = (v, L) => {
  if (!v.myTurn) return null;
  let res;
  if (L === 0 && chance(0.5)) {
    res = jgSearchRoot(v, 1);
    // 절반은 아무 수나
    const all = [];
    const f = v.flip ? 1 : -1;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const p = v.board[r][c];
      if (p && p.mine) for (const [dr, dc] of jgDirs(p.t, f)) { const a = r + dr, b = c + dc; if (a >= 0 && a < 4 && b >= 0 && b < 3 && !(v.board[a][b] && v.board[a][b].mine)) all.push({ k: 'm', fr: r, fc: c, tr: a, tc: b }); }
    }
    if (all.length) res = { m: pick(all) };
  } else {
    const depth = [1, 2, 3, 4, 7][L];
    res = jgSearchRoot(v, depth, L === 4 ? 1500 : L === 3 ? 2500 : 0);
  }
  if (!res || !res.m) return null;
  const m = res.m;
  const action = m.k === 'm' ? { type: 'move', from: [m.fr, m.fc], to: [m.tr, m.tc] } : { type: 'drop', piece: m.t, to: [m.tr, m.tc] };
  return { delay: think(L), action };
};

/* ───────── 미스터리 사인 / 숨은 공식 ───────── */
let POOL = null;
const SIMPLE = ['linear', 'linMinus', 'prodPlus', 'prodMinus', 'shiftProd', 'sqPlus', 'sqSum', 'sqDiff', 'absDiff', 'maxMin', 'maxMinus', 'concat', 'concatRev', 'avgFloor'];
function pool() {
  if (POOL) return POOL;
  const map = new Map();
  for (const fam of formulas.FAMILY_NAMES) {
    for (let k = 0; k < 6000; k++) {
      const [desc, f] = formulas.FAMILIES[fam]();
      if (!map.has(desc)) map.set(desc, { desc, family: fam, f });
    }
  }
  POOL = [...map.values()];
  return POOL;
}
const safe = (f, a, b) => { try { const z = f(a, b); return Number.isFinite(z) ? z : NaN; } catch (e) { return NaN; } };
function candidates(v, L) {
  const fams = L <= 1 ? SIMPLE : null;
  const list = pool().filter(c => (!fams || fams.includes(c.family)) && v.hints.every(h => safe(c.f, h.x, h.y) === h.z));
  return list;
}
PLANS.mysterysign = (v, L, mem) => {
  const key = `${v.round}:${v.hints.length}:${v.phase}`;
  if (v.phase === 'propose' && v.myPropose) {
    let n = rint(1, 20);
    if (L >= 2) {
      const probes = [1, 2, 3, 5, 7, 10, 11, 12, 13, 20, 25, 37, 50, 100, 123];
      if (L >= 3 && v.hints.length) {
        // 남은 후보 공식들을 가장 잘 갈라놓는 숫자 고르기
        const cands = candidates(v, L).slice(0, 400);
        let bestN = n, bestSplit = -1;
        for (const x of probes) {
          let split = 0;
          for (const y of [2, 7, 13]) {
            const outs = new Set(cands.map(c => (v.slot === 0 ? safe(c.f, x, y) : safe(c.f, v.frontNumber || y, x))));
            split += outs.size;
          }
          if (split > bestSplit) { bestSplit = split; bestN = x; }
        }
        n = bestN;
      } else n = pick(probes);
    }
    return { delay: think(L) + 800, action: { type: 'propose', n } };
  }
  if (v.phase === 'ruleGuess' && v.choices) {
    let k = rint(0, v.choices.length - 1);
    if (L >= 2) {
      const descs = new Set(candidates(v, 4).map(c => c.desc));
      const hit = v.choices.findIndex(c => descs.has(c));
      if (hit >= 0 && chance([0, 0.5, 0.8, 0.95, 1][L])) k = hit;
    }
    return { delay: think(L) + 1500, action: { type: 'ruleGuess', k } };
  }
  if (v.phase === 'answer' && v.canAnswer && v.hints.length) {
    // 같은 힌트 상태에서 한 번만 판단 (생각하는 시간 흉내)
    if (!mem.ms || mem.ms.key !== key) {
      const cands = candidates(v, L);
      const counts = new Map();
      for (const c of cands) { const z = safe(c.f, v.problem.a, v.problem.b); if (Number.isFinite(z)) counts.set(z, (counts.get(z) || 0) + 1); }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const total = cands.length;
      const share = sorted.length ? sorted[0][1] / total : 0;
      const needShare = [0.5, 0.95, 1, 0.97, 0.9][L];
      const minHints = [4, 3, 2, 1, 1][L];
      let answer = null;
      if (sorted.length && share >= needShare && v.hints.length >= minHints) answer = sorted[0][0];
      if (answer !== null && L === 0 && chance(0.3)) answer += pick([-2, -1, 1, 2, 10]);
      const [a, b] = answer !== null ? [[45000, 90000], [25000, 50000], [12000, 25000], [6000, 12000], [3000, 7000]][L] : [[40000, 70000], [25000, 40000], [15000, 25000], [8000, 14000], [5000, 9000]][L];
      mem.ms = { key, answer, delay: rint(a, b), at: Date.now() };
    }
    const m = mem.ms;
    const wait = Math.max(300, m.delay - (Date.now() - m.at));
    if (m.answer !== null) return { delay: wait, action: { type: 'answer', n: m.answer } };
    if (!v.myPassed) return { delay: wait, action: { type: 'pass' } };
    return null;
  }
  return null;
};

/* ───────── 미스터리 넘버 / 숫자 금고 ───────── */

// 상대 줄의 숨은 타일 값 분포: 정렬 규칙과 이미 아는 타일을 모두 만족하는 배치를 DP로 세어 칸별 확률 계산
function dvProb(opp, used, maxN, skip = new Set(), raw = false, excl = new Map()) {
  const ord = (n, c) => n * 2 + (c === 'W' ? 1 : 0);
  const K = (maxN + 1) * 2;
  // 각 칸이 가질 수 있는 key 목록
  const slots = opp.map((t, i) => {
    if (skip.has(i)) return null;
    if (t.revealed) return t.n === 'J' ? null : [ord(t.n, t.c)];
    const ks = [];
    const ex = excl.get(i);
    for (let n = 0; n <= maxN; n++) if (!used.has(`${n}${t.c}`) && !(ex && ex.has(n))) ks.push(ord(n, t.c));
    return ks;
  }).map((ks, i) => ({ ks, hidden: !opp[i].revealed }));
  const real = slots.filter(s => s.ks); // 조커(공개된) 칸 제외
  const idxMap = slots.map((s, i) => (s.ks ? i : -1)).filter(i => i >= 0);
  const m = real.length;
  if (!m) return raw ? { total: 1, res: [] } : [];
  // forward[i][key] = 0..i 칸을 증가 순서로 채우고 i칸이 key인 경우의 수
  const fw = Array.from({ length: m }, () => new Float64Array(K));
  const bw = Array.from({ length: m }, () => new Float64Array(K));
  real[0].ks.forEach(k => (fw[0][k] = 1));
  for (let i = 1; i < m; i++) {
    let run = 0; const pre = new Float64Array(K);
    for (let k = 0; k < K; k++) { pre[k] = run; run += fw[i - 1][k]; }
    real[i].ks.forEach(k => (fw[i][k] = pre[k]));
  }
  real[m - 1].ks.forEach(k => (bw[m - 1][k] = 1));
  for (let i = m - 2; i >= 0; i--) {
    let run = 0; const suf = new Float64Array(K);
    for (let k = K - 1; k >= 0; k--) { suf[k] = run; run += bw[i + 1][k]; }
    real[i].ks.forEach(k => (bw[i][k] = suf[k]));
  }
  let total = 0; for (let k = 0; k < K; k++) total += fw[m - 1][k];
  if (!total) return raw ? { total: 0, res: [] } : null;
  const res = [];
  real.forEach((sl, i) => {
    if (!sl.hidden) return;
    const dist = [];
    sl.ks.forEach(k => { const c = fw[i][k] * bw[i][k]; if (c > 0) dist.push([Math.floor(k / 2), raw ? c : c / total]); });
    res.push([idxMap[i], dist]);
  });
  return raw ? { total, res } : res;
}
// 조커가 섞인 경우: 숨은 칸 중 어디가 조커일지 모든 경우를 따져 가중 합산
function dvProbJoker(opp, used, maxN, jokerColors, excl = new Map()) {
  const hidden = opp.map((t, i) => (!t.revealed ? i : -1)).filter(i => i >= 0);
  const subsets = [[]];
  const canJ = i => jokerColors.includes(opp[i].c) && !(excl.get(i) && excl.get(i).has('J'));
  for (const i of hidden) if (canJ(i)) subsets.push([i]);
  for (const a of hidden) for (const b of hidden) if (a < b && jokerColors.length === 2 && opp[a].c !== opp[b].c && canJ(a) && canJ(b)) subsets.push([a, b]);
  const acc = new Map(); // idx -> Map(n|'J' -> weight)
  let grand = 0;
  for (const sub of subsets) {
    const r = dvProb(opp, used, maxN, new Set(sub), true, excl);
    if (!r || !r.total) continue;
    grand += r.total;
    for (const i of sub) { const m = acc.get(i) || new Map(); m.set('J', (m.get('J') || 0) + r.total); acc.set(i, m); }
    for (const [i, dist] of r.res) { const m = acc.get(i) || new Map(); for (const [n, c] of dist) m.set(n, (m.get(n) || 0) + c); acc.set(i, m); }
  }
  if (!grand) return null;
  return [...acc.entries()].map(([i, m]) => [i, [...m.entries()].map(([n, c]) => [n, c / grand])]);
}


// 상대 줄이 바뀌었을 때(새 타일 삽입) 예전 칸 번호 → 지금 칸 번호 대응
function dvAlign(prev, cur) {
  const same = (a, b) => a.c === b.c && (!a.revealed || (b.revealed && a.n === b.n));
  if (cur.length === prev.length) return prev.every((t, i) => same(t, cur[i])) ? prev.map((_, i) => i) : null;
  if (cur.length !== prev.length + 1) return null;
  const js = [];
  for (let j = 0; j < cur.length; j++) {
    const rest = cur.filter((_, k) => k !== j);
    if (prev.every((t, i) => same(t, rest[i]))) js.push(j);
  }
  if (!js.length) return null;
  const lo = Math.min(...js), hi = Math.max(...js);
  return prev.map((_, i) => (i < lo ? i : i >= hi ? i + 1 : -1));
}

PLANS.davinci = (v, L, mem) => {
  if (!v.myTurn) return null;
  const opp = v.oppHand;
  if (v.phase === 'penalty') {
    const hidden = v.myHand.map((t, k) => (!t.revealed ? k : -1)).filter(k => k >= 0);
    return { delay: think(L), action: { type: 'reveal', idx: pick(hidden) } };
  }
  const maxN = v.maxN;
  const used = new Set();
  const keyOf = (n, c) => `${n}${c}`;
  [...v.myHand, ...opp.filter(t => t.revealed)].forEach(t => { if (t.n !== 'J') used.add(keyOf(t.n, t.c)); });
  if (v.pending && v.pending.n !== 'J') used.add(keyOf(v.pending.n, v.pending.c));
  const jokersKnown = [...v.myHand, ...opp.filter(t => t.revealed), ...(v.pending ? [v.pending] : [])].filter(t => t.n === 'J').length;
  const jokersLeft = v.plus ? 2 - jokersKnown : 0;
  // 위치별 가능한 숫자 계산 (정렬 규칙: 작은 수가 왼쪽, 같은 수면 검정이 왼쪽)
  const ord = (n, c) => n * 2 + (c === 'W' ? 1 : 0);
  const lb = [], ub = [];
  let cur = -1;
  opp.forEach((t, k) => {
    if (t.revealed) { if (t.n !== 'J') cur = ord(t.n, t.c); lb[k] = null; return; }
    let low = cur + 1;
    if ((low % 2 === 1) !== (t.c === 'W')) low++;
    lb[k] = low;
    if (L >= 2 && !v.plus) cur = low; // 숨은 타일끼리도 순서 전파
  });
  cur = (maxN + 1) * 2;
  for (let k = opp.length - 1; k >= 0; k--) {
    const t = opp[k];
    if (t.revealed) { if (t.n !== 'J') cur = ord(t.n, t.c); ub[k] = null; continue; }
    let high = cur - 1;
    if ((high % 2 === 1) !== (t.c === 'W')) high--;
    ub[k] = high;
    if (L >= 2 && !v.plus) cur = high;
  }
  const cands = opp.map((t, k) => {
    if (t.revealed) return null;
    const list = [];
    for (let n = 0; n <= maxN; n++) {
      if (L >= 1 && used.has(keyOf(n, t.c))) continue;
      if (L >= 2) { const o = ord(n, t.c); if (o < lb[k] || o > ub[k]) continue; }
      list.push(n);
    }
    if (jokersLeft > 0 && (L >= 2 || chance(0.1))) list.push('J');
    if (L === 0) return [...Array(maxN + 1).keys()];
    return list.length ? list : [...Array(maxN + 1).keys()];
  });
  const options = cands.map((c, k) => ({ k, c })).filter(o => o.c);
  options.sort((a, b) => a.c.length - b.c.length);
  let target = L <= 1 ? pick(options) : options[0];
  let probGuess = null, bestP = 0;
  // AI: 내가 틀린 추리를 기억 ("이 칸은 7이 아님")
  let excl = new Map();
  if (L === 4) {
    const d = mem.dv || (mem.dv = { snap: null, excl: new Map(), last: null });
    if (d.last) {
      const hit = v.log.slice().reverse().find(l => l.mine && !l.bonus && l.idx === d.last.idx && l.n === d.last.n);
      if (hit && !hit.ok) { const set = d.excl.get(d.last.idx) || new Set(); set.add(d.last.n); d.excl.set(d.last.idx, set); }
      d.last = null;
    }
    if (d.snap) {
      const map = dvAlign(d.snap, opp);
      const next = new Map();
      if (map) for (const [i, set] of d.excl) if (map[i] >= 0) next.set(map[i], set);
      d.excl = next;
    }
    excl = d.excl;
  }
  if (L >= 3) {
    const jokerColors = v.plus ? ['B', 'W'].filter(c => ![...v.myHand, ...opp.filter(t => t.revealed), ...(v.pending ? [v.pending] : [])].some(t => t.n === 'J' && t.c === c)) : [];
    const dp = jokerColors.length ? dvProbJoker(opp, used, maxN, jokerColors, excl) : dvProb(opp, used, maxN, new Set(), false, excl);
    if (dp) {
      for (const [k, dist] of dp) for (const [n, p] of dist) if (p > bestP + 1e-9 || (Math.abs(p - bestP) < 1e-9 && chance(0.5))) { bestP = p; probGuess = { k, n }; }
    }
  }
  if (probGuess) {
    if (v.phase === 'continue') {
      // 확률이 낮으면 멈춤 (숫자 금고: 3번 맞혔으면 멈춰서 한 턴 더)
      const need = L === 4 ? (opp.filter(t => !t.revealed).length <= 2 ? 0.34 : 0.5) : 0.5;
      if (v.plus && v.streak >= 3 && bestP < 0.99) return { delay: think(L), action: { type: 'stop' } };
      if (bestP < need) return { delay: think(L), action: { type: 'stop' } };
    }
    if (L === 4) { mem.dv.snap = opp.map(t => ({ ...t })); mem.dv.last = { idx: probGuess.k, n: probGuess.n }; }
    return { delay: think(L), action: { type: 'guess', idx: probGuess.k, n: probGuess.n } };
  }
  if (v.phase === 'continue') {
    const limit = [99, 3, 2, 2, 2][L];
    if (L === 0 && chance(0.5)) return { delay: think(L), action: { type: 'stop' } };
    if (v.plus && L >= 3 && v.streak >= 3 && target.c.length > 1) return { delay: think(L), action: { type: 'stop' } };
    if (target.c.length > limit) return { delay: think(L), action: { type: 'stop' } };
  }
  // 조커가 남았으면 숫자 후보와 조커를 비율대로
  let guess = pick(target.c);
  return { delay: think(L), action: { type: 'guess', idx: target.k, n: guess } };
};

/* ───────── 시크릿 다이스 / 훼방 주사위 ───────── */
const SD_BASE = { ones: 2, twos: 4, threes: 6, fours: 8, fives: 10, sixes: 12, total: 18, oddEven: 4, fullHouse: 5, straight4: 7, straight5: 6, four: 3, fiveJoker: 20 };
function multisets(k) {
  if (k === 1) return [1, 2, 3, 4, 5, 6].map(a => [a]);
  const r = []; for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) r.push([a, b]); return r;
}
function sdBest(g, cats, sheet, dice, L) {
  let best = -Infinity, bestCat = null;
  for (const c of cats) {
    if (sheet[c] !== undefined) continue;
    const raw = g.score(c, dice);
    const val = L >= 2 ? raw - SD_BASE[c] : raw;
    if (val > best) { best = val; bestCat = c; }
  }
  return { best, cat: bestCat };
}
// 상대(방해하는 쪽)가 고를 법한 숫자: 주 플레이어가 무엇을 내든 최고 점수를 가장 낮추는 조합
function sdSpoil(g, cats, mainSheet, fixed, kSub, kMain) {
  let best = null, bestWorst = Infinity;
  for (const mine of multisets(kSub)) {
    let worst = -Infinity;
    for (const mp of multisets(kMain)) worst = Math.max(worst, sdBest(g, cats, mainSheet, [...fixed, ...mine, ...mp], 2).best);
    if (worst < bestWorst) { bestWorst = worst; best = mine; }
  }
  return best;
}
// 주 플레이어가 고를 법한 숫자: 평균적으로 가장 좋은 조합
function sdMainPick(g, cats, mainSheet, fixed, kMain, kSub) {
  let best = null, bestEV = -Infinity;
  for (const mine of multisets(kMain)) {
    const vals = multisets(kSub).map(op => sdBest(g, cats, mainSheet, [...fixed, ...mine, ...op], 2).best);
    const ev = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (ev > bestEV) { bestEV = ev; best = mine; }
  }
  return best;
}
PLANS.secretdice = (v, L, mem, g) => {
  const cats = v.cats;
  const mySheet = v.sheets[0], oppSheet = v.sheets[1];
  const W = [0, 0, 0, 0.45, v.plus ? 0.85 : 0.7][L]; // 상대 예측을 얼마나 믿을지
  // 내가 주 플레이어일 때 my 조합의 가치 = (예측된 상대 숫자 기준 점수)와 (모든 경우 평균)의 혼합
  const mainValue = (fixed, mine, k, m, predicted) => {
    const vals = multisets(m).map(op => sdBest(g, cats, mySheet, [...fixed, ...mine, ...op], L).best);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (!W || !predicted) return avg;
    return W * sdBest(g, cats, mySheet, [...fixed, ...mine, ...predicted], L).best + (1 - W) * avg;
  };
  if (v.phase === 'fix' && v.isMain) {
    if (L === 0) return { delay: think(L), action: { type: 'fix', idx: shuffle([0, 1, 2]).slice(0, rint(1, 2)) } };
    if (L === 1) { const mx = Math.max(...v.dealer); return { delay: think(L), action: { type: 'fix', idx: [v.dealer.indexOf(mx)] } }; }
    const subsets = [[0], [1], [2], [0, 1], [0, 2], [1, 2]];
    if (!v.threeUsed[0]) subsets.push([0, 1, 2]);
    let best = null, bestEV = -Infinity;
    for (const sub of subsets) {
      const fixed = sub.map(k => v.dealer[k]);
      const k = sub.length === 1 ? 2 : 1, m = sub.length === 3 ? 1 : 2;
      const predicted = W ? sdSpoil(g, cats, mySheet, fixed, m, k) : null;
      let ev = -Infinity;
      for (const mine of multisets(k)) ev = Math.max(ev, mainValue(fixed, mine, k, m, predicted));
      if (sub.length === 3) ev -= L >= 4 ? 3 : 5; // 한 번뿐인 3개 고정은 아껴 쓰기
      if (ev > bestEV) { bestEV = ev; best = sub; }
    }
    return { delay: think(L), action: { type: 'fix', idx: best } };
  }
  if (v.phase === 'pick' && !v.myPick) {
    const fixed = v.fixed.map(k => v.dealer[k]);
    const k = v.myNeed, m = v.oppNeed;
    let nums;
    if (L === 0) nums = Array.from({ length: k }, () => rint(1, 6));
    else if (v.isMain) {
      if (L === 1) nums = Array(k).fill(Math.max(...fixed));
      else {
        const predicted = W ? sdSpoil(g, cats, mySheet, fixed, m, k) : null;
        let bestEV = -Infinity;
        for (const mine of multisets(k)) { const ev = mainValue(fixed, mine, k, m, predicted); if (ev > bestEV) { bestEV = ev; nums = mine; } }
      }
    } else {
      // 상대(주 플레이어)의 족보를 망치는 숫자
      if (L === 1) nums = Array.from({ length: k }, () => pick([1, 2, 6].filter(x => !fixed.includes(x)).concat([1])));
      else {
        const predMain = W ? sdMainPick(g, cats, oppSheet, fixed, m, k) : null;
        let bestScore = Infinity;
        for (const mine of multisets(k)) {
          let worst = -Infinity;
          for (const mp of multisets(m)) worst = Math.max(worst, sdBest(g, cats, oppSheet, [...fixed, ...mine, ...mp], 2).best);
          const vsPred = predMain ? sdBest(g, cats, oppSheet, [...fixed, ...mine, ...predMain], 2).best : worst;
          const sc = W ? W * vsPred + (1 - W) * worst : worst;
          if (sc < bestScore) { bestScore = sc; nums = mine; }
        }
      }
    }
    return { delay: think(L) + 600, action: { type: 'pick', nums: nums.slice(0, k) } };
  }
  if (v.phase === 'seal' && !v.isMain) {
    if (L === 0) return { delay: think(L), action: chance(0.3) ? { type: 'seal', idx: rint(0, 4) } : { type: 'noseal' } };
    const dice = v.dice.map(d => d.v);
    const cur = sdBest(g, cats, oppSheet, dice, 2).best;
    let bestK = -1, bestRed = -Infinity;
    dice.forEach((_, k) => {
      let s = 0; for (let x = 1; x <= 6; x++) { const d2 = dice.slice(); d2[k] = x; s += sdBest(g, cats, oppSheet, d2, 2).best; }
      const red = cur - s / 6;
      if (red > bestRed) { bestRed = red; bestK = k; }
    });
    // 남은 봉인과 남은 라운드를 보고 큰 손해만 막기
    const roundsLeftAsSub = Math.max(1, Math.ceil((v.rounds - v.round + 1) / 2));
    const scarcity = v.seals[0] / roundsLeftAsSub; // 1 이상이면 넉넉
    const th = [99, 8, 5, 6, 5][L] - (L >= 3 ? Math.min(3, scarcity * 2) : 0);
    return { delay: think(L), action: bestRed >= th ? { type: 'seal', idx: bestK } : { type: 'noseal' } };
  }
  if (v.phase === 'score' && v.isMain) {
    const dice = v.dice.map(d => d.v);
    const open = cats.filter(c => mySheet[c] === undefined);
    const cat = L === 0 ? pick(open) : sdBest(g, cats, mySheet, dice, L).cat;
    return { delay: think(L), action: { type: 'score', cat } };
  }
  return null;
};

/* ───────── 야찌 ───────── */
const YZ_BASE = { ones: 2, twos: 5, threes: 8.5, fours: 12, fives: 15.5, sixes: 19, threeKind: 21, fourKind: 13, fullHouse: 22, smallStraight: 24, largeStraight: 28, yahtzee: 15, chance: 22 };
const YZ_UP = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
// 인세인/AI용 가치 평가: 상단 보너스(63점) 진행도와 특수 칸을 0점으로 날리는 손해를 반영
function yzVal(g, c, dice, sheet) {
  const raw = g.score(c, dice, sheet);
  const up = YZ_UP.indexOf(c);
  const filled = g.CATS.filter(x => sheet[x] !== undefined).length;
  const late = filled / 13; // 게임 후반일수록 0점 손해가 작아짐
  if (up >= 0) {
    const face = up + 1, par = 3 * face;
    const upperSum = YZ_UP.reduce((a, x) => a + (sheet[x] || 0), 0);
    const upperLeft = YZ_UP.filter(x => sheet[x] === undefined && x !== c);
    const parLeft = upperLeft.reduce((a, x) => a + 3 * (YZ_UP.indexOf(x) + 1), 0);
    let bonus = 0;
    if (upperSum < 63) {
      if (upperSum + raw >= 63) bonus = 35;
      else if (upperSum + raw + parLeft >= 63) bonus = 35 * 0.55 + (raw - par) * 1.5;
      else bonus = (raw - par) * 0.6;
    }
    return raw - par + bonus * 0.8 - (raw === 0 ? face * 0.5 : 0);
  }
  switch (c) {
    case 'threeKind': return raw ? raw - 17 : -14 * (1 - late);
    case 'fourKind': return raw ? raw - 9 : -7 * (1 - late);
    case 'fullHouse': return raw ? 6 : -17 * (1 - late);
    case 'smallStraight': return raw ? 8 : -20 * (1 - late);
    case 'largeStraight': return raw ? 14 : -17 * (1 - late);
    case 'yahtzee': return raw ? 60 : -10 * (1 - late);
    case 'chance': return raw - 23 + (raw ? 0 : 0);
  }
  return raw;
}
function yzBest(g, sheet, dice, L) {
  let best = -Infinity, cat = null;
  for (const c of g.CATS) {
    if (sheet[c] !== undefined) continue;
    if (L >= 3) { const val = yzVal(g, c, dice, sheet); if (val > best) { best = val; cat = c; } continue; }
    let val = g.score(c, dice, sheet);
    if (L >= 2) {
      val -= YZ_BASE[c];
      const up = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(c);
      if (up >= 0 && dice.filter(d => d === up + 1).length >= 3) val += 4; // 상단 보너스 노리기
      if (c === 'yahtzee' && val > 0) val += 30;
    }
    if (val > best) { best = val; cat = c; }
  }
  return { best, cat };
}
PLANS.yahtzee = (v, L, mem, g) => {
  if (!v.myTurn) return null;
  const sheet = v.sheets[0];
  if (!v.rolled) return { delay: think(L), action: { type: 'roll' } };
  const dice = v.dice;
  if (L === 0) {
    if (v.rollsLeft > 0 && chance(0.5)) return { delay: think(L), action: { type: 'roll', held: dice.map(() => chance(0.5)) } };
    const open = g.CATS.filter(c => sheet[c] === undefined);
    return { delay: think(L), action: { type: 'score', cat: pick(open) } };
  }
  const now = yzBest(g, sheet, dice, L);
  if (v.rollsLeft > 0) {
    let held;
    if (L === 1) {
      const cnt = [0, 0, 0, 0, 0, 0, 0]; dice.forEach(d => cnt[d]++);
      const top = cnt.indexOf(Math.max(...cnt));
      held = dice.map(d => d === top);
      if (held.every(Boolean)) return { delay: think(L), action: { type: 'score', cat: now.cat } };
    } else {
      const samples = [0, 0, 60, 160, 350][L];
      let bestEV = now.best, bestMask = null;
      for (let mask = 0; mask < 31; mask++) {
        const h = [0, 1, 2, 3, 4].map(k => !!(mask & (1 << k)));
        let s = 0;
        for (let t = 0; t < samples; t++) {
          let d = dice.map((x, k) => (h[k] ? x : 1 + Math.floor(Math.random() * 6)));
          if (v.rollsLeft === 2 && L >= 3) {
            // 한 번 더 굴릴 수 있으면: 가장 많은 숫자를 남기고 다시 굴림 (간단한 2단계 예측)
            const cnt = [0, 0, 0, 0, 0, 0, 0]; d.forEach(x => cnt[x]++);
            const top = cnt.indexOf(Math.max(...cnt));
            const d2 = d.map(x => (x === top ? x : 1 + Math.floor(Math.random() * 6)));
            s += Math.max(yzBest(g, sheet, d, L).best, yzBest(g, sheet, d2, L).best * 0.9 + yzBest(g, sheet, d, L).best * 0.1);
          } else s += yzBest(g, sheet, d, L).best;
        }
        const ev = s / samples;
        if (ev > bestEV + 0.3) { bestEV = ev; bestMask = h; }
      }
      if (!bestMask) return { delay: think(L), action: { type: 'score', cat: now.cat } };
      held = bestMask;
    }
    return { delay: think(L), action: { type: 'roll', held } };
  }
  return { delay: think(L), action: { type: 'score', cat: now.cat } };
};

/* ───────── 기억 포커 ───────── */
PLANS.memorypoker = (v, L, mem, g) => {
  if (v.phase === 'memorize') {
    if (!mem.mp || mem.mp.round !== v.round) {
      const n = [5, 9, 13, 16, 16][L];
      const idx = shuffle([...Array(16).keys()]).slice(0, n);
      const known = {};
      for (const k of idx) {
        let card = v.board[k];
        if (L === 3 && chance(0.06)) card = { r: rint(2, 14), s: rint(0, 3) }; // 가끔 잘못 기억
        known[k] = card;
      }
      mem.mp = { round: v.round, known };
    }
    if (!v.ready[0]) return { delay: rint(4000, 9000), action: { type: 'ready' } };
    return null;
  }
  if (v.phase === 'choose' && !v.myPick) {
    const known = (mem.mp && mem.mp.round === v.round) ? mem.mp.known : {};
    const ks = Object.keys(known).map(Number);
    let best = null, bestEv = null;
    if (L === 0 && chance(0.5)) best = shuffle([...Array(16).keys()]).slice(0, 2);
    else {
      for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) {
        const ev = g.eval5([known[ks[a]], known[ks[b]], ...v.shared]);
        if (!bestEv || g.cmpEval(ev, bestEv) > 0) { bestEv = ev; best = [ks[a], ks[b]]; }
      }
    }
    if (!best) {
      const pool2 = shuffle([...Array(16).keys()]);
      best = ks.length ? [ks[0], pool2.find(x => x !== ks[0])] : pool2.slice(0, 2);
    }
    return { delay: rint([12000, 9000, 6000, 4000, 3000][L], [25000, 18000, 12000, 8000, 6000][L]), action: { type: 'pick', idx: best } };
  }
  return null;
};

module.exports = { plan, LEVELS, LEVEL_NAMES, pool };

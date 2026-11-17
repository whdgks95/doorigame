// 시크릿 다이스 (기본) / 훼방 주사위 (심화)
// 매 라운드: 딜러가 주사위 3개를 굴림 → 주 플레이어가 1~3개 고정
//  - 1개 고정: 주 플레이어 2개, 상대 2개 / 2개 고정: 주 1개, 상대 2개 / 3개 고정: 각 1개 (게임당 한 번)
// → 주사위 5개 완성 → 주 플레이어가 자기 점수표 빈칸 하나에 기록. 주 플레이어는 번갈아 맡음.
// 연속(스트레이트)은 6과 1이 이어진 것으로 봄: 6-1-2-3 = 4연속, 5-6-1-2-3 = 5연속.
// 심화: 5개가 완성되면 상대가 주사위 1개를 '봉인'해서 다시 굴리게 할 수 있음(게임당 3번).
//       '총합' 칸 대신 '홀짝' 칸(5개가 모두 홀수 또는 모두 짝수면 25점).
const { coin } = require('./util');

const TURN_MS = 40000;
const SPECIAL = { fullHouse: 20, straight4: 20, straight5: 30, four: 20, five: 50, joker: 20, oddEven: 25 };
const roll = () => 1 + Math.floor(Math.random() * 6);
const SEALS = 3;

function counts(d) { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => c[v]++); return c; }
// 6 다음은 1로 이어지는 원형 연속
function hasCyclicRun(d, len) {
  const c = counts(d);
  for (let start = 1; start <= 6; start++) {
    let ok = true;
    for (let k = 0; k < len; k++) { const v = ((start - 1 + k) % 6) + 1; if (!c[v]) { ok = false; break; } }
    if (ok) return true;
  }
  return false;
}

function make(plus) {
  const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', plus ? 'oddEven' : 'total', 'fullHouse', 'straight4', 'straight5', 'four', 'fiveJoker'];
  function score(cat, d) {
    const c = counts(d), sum = d.reduce((a, b) => a + b, 0);
    const k = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(cat);
    if (k >= 0) return c[k + 1] * (k + 1);
    switch (cat) {
      case 'total': return sum;
      case 'oddEven': return d.every(v => v % 2 === 1) || d.every(v => v % 2 === 0) ? SPECIAL.oddEven : 0;
      case 'fullHouse': { const n = c.filter(x => x > 0).sort(); return n.length === 2 && n[0] === 2 && n[1] === 3 ? SPECIAL.fullHouse : 0; }
      case 'straight4': return hasCyclicRun(d, 4) ? SPECIAL.straight4 : 0;
      case 'straight5': return hasCyclicRun(d, 5) ? SPECIAL.straight5 : 0;
      case 'four': return c.some(x => x >= 4) ? SPECIAL.four : 0;
      case 'fiveJoker': return c.some(x => x === 5) ? SPECIAL.five : SPECIAL.joker;
    }
    return 0;
  }
  const total = sheet => CATS.reduce((a, c) => a + (sheet[c] || 0), 0);
  const needFor = (fixedCount, isMain) => (fixedCount === 1 ? 2 : fixedCount === 2 ? (isMain ? 1 : 2) : 1);

  function newRound(s) {
    s.dealer = [roll(), roll(), roll()];
    s.fixed = null; s.picks = [null, null]; s.dice = null; s.sealed = null;
    s.phase = 'fix';
    s.deadline = Date.now() + TURN_MS;
  }
  function reveal(s) {
    const m = s.main;
    s.dice = [
      ...s.fixed.map(k => ({ v: s.dealer[k], from: 'fixed' })),
      ...s.picks[m].map(v => ({ v, from: 'main' })),
      ...s.picks[1 - m].map(v => ({ v, from: 'sub' })),
    ];
    s.events.push({ round: s.round, type: 'reveal', main: m, dice: s.dice.map(d => d.v), picks: [s.picks[0], s.picks[1]] });
    s.phase = plus && s.seals[1 - m] > 0 ? 'seal' : 'score';
    s.deadline = Date.now() + TURN_MS;
  }
  function record(s, cat) {
    const m = s.main;
    const v = score(cat, s.dice.map(d => d.v));
    s.sheets[m][cat] = v;
    s.events.push({ round: s.round, type: 'score', main: m, cat, v, dice: s.dice.map(d => d.v) });
    const done = sh => CATS.every(c => sh[c] !== undefined);
    if (done(s.sheets[0]) && done(s.sheets[1])) {
      const t0 = total(s.sheets[0]), t1 = total(s.sheets[1]);
      s.over = { winner: t0 > t1 ? 0 : t1 > t0 ? 1 : -1 };
      s.deadline = null;
      return;
    }
    s.round++;
    s.main = 1 - m;
    if (done(s.sheets[s.main])) s.main = m;
    s.autoNote = null;
    newRound(s);
  }

  const api = {
    id: plus ? 'secretdice_plus' : 'secretdice',
    name: plus ? '훼방 주사위' : '시크릿 다이스',
    score, CATS, SPECIAL, hasCyclicRun,
    init() {
      const s = { round: 1, main: coin(), sheets: [{}, {}], threeUsed: [false, false], seals: [SEALS, SEALS], events: [], over: null };
      newRound(s);
      return s;
    },
    action(s, i, a) {
      if (s.over) return '게임이 끝났어요.';
      const isMain = i === s.main;
      if (a.type === 'fix') {
        if (s.phase !== 'fix') return '지금은 고정할 수 없어요.';
        if (!isMain) return '주 플레이어가 고정할 주사위를 고르는 중이에요.';
        const idx = Array.isArray(a.idx) ? a.idx.map(Number) : [];
        if (idx.length < 1 || idx.length > 3 || new Set(idx).size !== idx.length || idx.some(k => ![0, 1, 2].includes(k))) return '고정할 주사위를 1~3개 골라야 해요.';
        if (idx.length === 3 && s.threeUsed[i]) return '3개 고정은 게임에서 한 번만 쓸 수 있어요.';
        if (idx.length === 3) s.threeUsed[i] = true;
        s.fixed = idx.sort();
        s.events.push({ round: s.round, type: 'fix', main: i, dealer: s.dealer.slice(), fixed: s.fixed.map(k => s.dealer[k]) });
        s.phase = 'pick';
        s.deadline = Date.now() + TURN_MS;
        s.autoNote = null;
        return null;
      }
      if (a.type === 'pick') {
        if (s.phase !== 'pick') return '지금은 숫자를 낼 수 없어요.';
        if (s.picks[i]) return '이미 숫자를 냈어요.';
        const need = needFor(s.fixed.length, isMain);
        const nums = Array.isArray(a.nums) ? a.nums.map(Number) : [];
        if (nums.length !== need || nums.some(n => !Number.isInteger(n) || n < 1 || n > 6)) return `1~6 사이 숫자 ${need}개를 내야 해요.`;
        s.picks[i] = nums;
        if (s.picks[0] && s.picks[1]) reveal(s);
        return null;
      }
      if (a.type === 'seal' || a.type === 'noseal') {
        if (s.phase !== 'seal') return '지금은 봉인할 수 없어요.';
        if (isMain) return '상대가 봉인할지 고르는 중이에요.';
        if (a.type === 'seal') {
          const k = Number(a.idx);
          if (!Number.isInteger(k) || !s.dice[k]) return '봉인할 주사위를 골라야 해요.';
          const before = s.dice[k].v;
          s.dice[k] = { v: roll(), from: s.dice[k].from, sealed: true, before };
          s.seals[i]--;
          s.events.push({ round: s.round, type: 'seal', who: i, before, after: s.dice[k].v });
        }
        s.phase = 'score';
        s.deadline = Date.now() + TURN_MS;
        return null;
      }
      if (a.type === 'score') {
        if (s.phase !== 'score') return '지금은 점수를 기록할 수 없어요.';
        if (!isMain) return '주 플레이어가 점수를 기록하는 중이에요.';
        if (!CATS.includes(a.cat)) return '알 수 없는 항목이에요.';
        if (s.sheets[i][a.cat] !== undefined) return '이미 기록한 항목이에요.';
        record(s, a.cat);
        return null;
      }
      return '알 수 없는 행동이에요.';
    },
    timeout(s) {
      if (s.over) return;
      if (s.phase === 'fix') { api.action(s, s.main, { type: 'fix', idx: [0] }); s.autoNote = '시간 초과로 주사위 1개가 자동 고정됐어요.'; return; }
      if (s.phase === 'pick') {
        [0, 1].forEach(p => { if (!s.picks[p]) s.picks[p] = Array.from({ length: needFor(s.fixed.length, p === s.main) }, roll); });
        reveal(s);
        s.autoNote = '시간 초과로 숫자가 무작위로 정해졌어요.';
        return;
      }
      if (s.phase === 'seal') { api.action(s, 1 - s.main, { type: 'noseal' }); s.autoNote = '시간 초과로 봉인 없이 넘어갔어요.'; return; }
      if (s.phase === 'score') {
        const sheet = s.sheets[s.main];
        const open = CATS.filter(c => sheet[c] === undefined);
        const dv = s.dice.map(d => d.v);
        const best = open.reduce((b, c) => (score(c, dv) > score(b, dv) ? c : b), open[0]);
        record(s, best);
        s.autoNote = '시간 초과로 가장 높은 점수 칸에 자동 기록됐어요.';
      }
    },
    view(s, i) {
      const o = 1 - i;
      const isMain = i === s.main;
      return {
        plus, cats: CATS,
        round: s.round, rounds: CATS.length * 2,
        isMain, phase: s.phase,
        dealer: s.dealer, fixed: s.fixed,
        myNeed: s.fixed ? needFor(s.fixed.length, isMain) : null,
        oppNeed: s.fixed ? needFor(s.fixed.length, !isMain) : null,
        myPick: s.picks[i], oppPicked: !!s.picks[o],
        dice: s.dice,
        sheets: [s.sheets[i], s.sheets[o]],
        totals: [total(s.sheets[i]), total(s.sheets[o])],
        threeUsed: [s.threeUsed[i], s.threeUsed[o]],
        seals: [s.seals[i], s.seals[o]],
        preview: s.phase === 'score' && isMain ? Object.fromEntries(CATS.map(c => [c, score(c, s.dice.map(d => d.v))])) : null,
        events: s.events.slice(-60).map(e => ({ ...e, mineMain: e.main === i, mine: e.who === i, myPick: e.picks ? e.picks[i] : undefined, oppPick: e.picks ? e.picks[o] : undefined })),
        autoNote: s.autoNote || null,
        deadline: s.over ? null : s.deadline,
        waitingFor: s.over ? null : s.phase === 'pick' ? [!s.picks[i], !s.picks[o]] : s.phase === 'seal' ? [!isMain, isMain] : [isMain, !isMain],
        over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose' },
      };
    },
  };
  return api;
}

module.exports = [make(false), make(true)];

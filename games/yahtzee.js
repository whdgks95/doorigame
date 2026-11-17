// 야찌 (정식 13칸 규칙)
// 차례마다 주사위 5개를 최대 3번 굴리고(원하는 주사위는 고정) 점수표 빈칸 하나에 기록.
// 상단(1~6) 합계 63점 이상이면 +35. 야찌(5개 같음)를 이미 50점으로 기록한 뒤 또 야찌가 나오면 +100 보너스,
// 이때는 풀하우스·스트레이트를 조커로 만점 기록 가능.
const { coin } = require('./util');

const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'threeKind', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];
const UPPER = CATS.slice(0, 6);
const TURN_MS = 60000;
const roll1 = () => 1 + Math.floor(Math.random() * 6);

function counts(d) { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => c[v]++); return c; }
function score(cat, d, sheet = {}) {
  const c = counts(d), sum = d.reduce((a, b) => a + b, 0);
  const has = vals => vals.every(v => c[v] > 0);
  const isY = c.some(x => x === 5);
  const joker = isY && sheet.yahtzee === 50;
  const k = UPPER.indexOf(cat);
  if (k >= 0) return c[k + 1] * (k + 1);
  switch (cat) {
    case 'threeKind': return c.some(x => x >= 3) ? sum : 0;
    case 'fourKind': return c.some(x => x >= 4) ? sum : 0;
    case 'fullHouse': { const n = c.filter(x => x > 0).sort(); return (n.length === 2 && n[0] === 2 && n[1] === 3) || joker ? 25 : 0; }
    case 'smallStraight': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) || joker ? 30 : 0;
    case 'largeStraight': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) || joker ? 40 : 0;
    case 'yahtzee': return isY ? 50 : 0;
    case 'chance': return sum;
  }
  return 0;
}
function totals(sheet) {
  const upper = UPPER.reduce((a, c) => a + (sheet[c] || 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const yBonus = (sheet._yBonus || 0) * 100;
  const total = CATS.reduce((a, c) => a + (sheet[c] || 0), 0) + bonus + yBonus;
  return { upper, bonus, yBonus, total };
}

const api = {
  id: 'yahtzee',
  name: '야찌',
  score, CATS, totals,
  init() {
    return { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rollsLeft: 3, turn: coin(), sheets: [{}, {}], log: [], deadline: Date.now() + TURN_MS, over: null };
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (s.turn !== i) return '상대 차례예요.';
    if (a.type === 'roll') {
      if (s.rollsLeft <= 0) return '이번 턴에는 더 굴릴 수 없어요.';
      const first = s.rollsLeft === 3;
      const held = Array.isArray(a.held) ? a.held.map(Boolean) : [];
      s.held = first ? [false, false, false, false, false] : [0, 1, 2, 3, 4].map(k => !!held[k]);
      s.dice = s.dice.map((v, k) => (s.held[k] ? v : roll1()));
      s.rollsLeft--;
      return null;
    }
    if (a.type === 'score') {
      if (s.rollsLeft === 3) return '먼저 주사위를 굴려야 해요.';
      if (!CATS.includes(a.cat)) return '알 수 없는 항목이에요.';
      const sheet = s.sheets[i];
      if (sheet[a.cat] !== undefined) return '이미 기록한 항목이에요.';
      const isY = counts(s.dice).some(x => x === 5);
      let yb = false;
      if (isY && sheet.yahtzee === 50) { sheet._yBonus = (sheet._yBonus || 0) + 1; yb = true; }
      const v = score(a.cat, s.dice, sheet);
      sheet[a.cat] = v;
      s.log.push({ who: i, cat: a.cat, v, dice: s.dice.slice(), yBonus: yb });
      const done = sh => CATS.every(c => sh[c] !== undefined);
      if (done(s.sheets[0]) && done(s.sheets[1])) {
        const t0 = totals(s.sheets[0]).total, t1 = totals(s.sheets[1]).total;
        s.over = { winner: t0 > t1 ? 0 : t1 > t0 ? 1 : -1 };
        s.deadline = null;
        return null;
      }
      s.turn = 1 - i;
      s.dice = [0, 0, 0, 0, 0];
      s.held = [false, false, false, false, false];
      s.rollsLeft = 3;
      s.deadline = Date.now() + TURN_MS;
      return null;
    }
    return '알 수 없는 행동이에요.';
  },
  timeout(s) {
    if (s.over) return;
    const i = s.turn;
    if (s.rollsLeft === 3) api.action(s, i, { type: 'roll' });
    const sheet = s.sheets[i];
    const open = CATS.filter(c => sheet[c] === undefined);
    const best = open.reduce((b, c) => (score(c, s.dice, sheet) > score(b, s.dice, sheet) ? c : b), open[0]);
    api.action(s, i, { type: 'score', cat: best });
    s.log[s.log.length - 1].timeout = true;
  },
  view(s, i) {
    const o = 1 - i;
    const rolled = s.rollsLeft < 3;
    const strip = sh => Object.fromEntries(Object.entries(sh).filter(([k]) => !k.startsWith('_')));
    return {
      dice: s.dice, held: s.held, rollsLeft: s.rollsLeft, rolled,
      myTurn: !s.over && s.turn === i,
      sheets: [strip(s.sheets[i]), strip(s.sheets[o])],
      totals: [totals(s.sheets[i]), totals(s.sheets[o])],
      preview: rolled && s.turn === i ? Object.fromEntries(CATS.map(c => [c, score(c, s.dice, s.sheets[i])])) : null,
      log: s.log.slice(-40).map(l => ({ ...l, mine: l.who === i })),
      deadline: s.over ? null : s.deadline,
      over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

module.exports = api;

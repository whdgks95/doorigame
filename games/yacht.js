// 시크릿 다이스 (피의 게임2, 요트 다이스 방식)
const { coin } = require('./util');

const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
const UPPER = CATS.slice(0, 6);
const roll1 = () => 1 + Math.floor(Math.random() * 6);

function score(cat, d) {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  d.forEach(v => cnt[v]++);
  const sum = d.reduce((a, b) => a + b, 0);
  const has = vals => vals.every(v => cnt[v] > 0);
  const k = UPPER.indexOf(cat);
  if (k >= 0) return cnt[k + 1] * (k + 1);
  switch (cat) {
    case 'choice': return sum;
    case 'fourKind': return cnt.some(c => c >= 4) ? sum : 0;
    case 'fullHouse': { const c = cnt.filter(x => x > 0).sort(); return c.length === 2 && c[0] === 2 && c[1] === 3 ? sum : 0; }
    case 'smallStraight': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 15 : 0;
    case 'largeStraight': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 30 : 0;
    case 'yacht': return cnt.some(c => c === 5) ? 50 : 0;
  }
  return 0;
}

function totals(sheet) {
  const upper = UPPER.reduce((a, c) => a + (sheet[c] || 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const all = CATS.reduce((a, c) => a + (sheet[c] || 0), 0) + bonus;
  return { upper, bonus, total: all };
}

module.exports = {
  id: 'yacht',
  name: '시크릿 다이스',
  score, CATS,
  init() {
    return { dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rollsLeft: 3, turn: coin(), sheets: [{}, {}], log: [], over: null };
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
      if (s.sheets[i][a.cat] !== undefined) return '이미 기록한 항목이에요.';
      const v = score(a.cat, s.dice);
      s.sheets[i][a.cat] = v;
      s.log.push({ who: i, cat: a.cat, v, dice: s.dice.slice() });
      const done = sh => CATS.every(c => sh[c] !== undefined);
      if (done(s.sheets[0]) && done(s.sheets[1])) {
        const t0 = totals(s.sheets[0]).total, t1 = totals(s.sheets[1]).total;
        s.over = { winner: t0 > t1 ? 0 : t1 > t0 ? 1 : -1 };
        return null;
      }
      s.turn = 1 - i;
      s.dice = [0, 0, 0, 0, 0];
      s.held = [false, false, false, false, false];
      s.rollsLeft = 3;
      return null;
    }
    return '알 수 없는 행동이에요.';
  },
  view(s, i) {
    const o = 1 - i;
    const rolled = s.rollsLeft < 3;
    return {
      dice: s.dice, held: s.held, rollsLeft: s.rollsLeft, rolled,
      myTurn: !s.over && s.turn === i,
      sheets: [s.sheets[i], s.sheets[o]],
      totals: [totals(s.sheets[i]), totals(s.sheets[o])],
      preview: rolled ? Object.fromEntries(CATS.map(c => [c, score(c, s.dice)])) : null,
      last: s.log.length ? { ...s.log[s.log.length - 1], mine: s.log[s.log.length - 1].who === i } : null,
      over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

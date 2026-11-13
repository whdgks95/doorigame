// 시크릿 다이스 (피의 게임2 데스매치)
// 매 라운드: 딜러가 주사위 3개를 굴림 → 주 플레이어가 1~3개 고정
//  - 1개 고정: 주 플레이어 2개, 상대 2개 숫자를 비공개로 냄
//  - 2개 고정: 주 플레이어 1개, 상대 2개
//  - 3개 고정: 주 플레이어 1개, 상대 1개 (게임당 한 번만)
// → 주사위 5개 완성 → 주 플레이어가 자기 점수표의 빈칸 하나에 기록. 주 플레이어는 번갈아 맡음.
const { coin } = require('./util');

const TURN_MS = 40000;
// 특수 족보 점수 (방송 기록 기준 20점, 확인되지 않은 값은 바꾸기 쉽게 상수로 둠)
const SPECIAL = { fullHouse: 20, straight4: 20, straight5: 30, four: 20, five: 50, joker: 20 };
const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'total', 'fullHouse', 'straight4', 'straight5', 'four', 'fiveJoker'];
const roll = () => 1 + Math.floor(Math.random() * 6);

function counts(d) { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => c[v]++); return c; }
function score(cat, d) {
  const c = counts(d), sum = d.reduce((a, b) => a + b, 0);
  const has = vals => vals.every(v => c[v] > 0);
  const k = CATS.indexOf(cat);
  if (k >= 0 && k < 6) return c[k + 1] * (k + 1);
  switch (cat) {
    case 'total': return sum;
    case 'fullHouse': { const n = c.filter(x => x > 0).sort(); return n.length === 2 && n[0] === 2 && n[1] === 3 ? SPECIAL.fullHouse : 0; }
    case 'straight4': return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? SPECIAL.straight4 : 0;
    case 'straight5': return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? SPECIAL.straight5 : 0;
    case 'four': return c.some(x => x >= 4) ? SPECIAL.four : 0;
    case 'fiveJoker': return c.some(x => x === 5) ? SPECIAL.five : SPECIAL.joker; // 5개 같으면 5 다이스, 아니면 조커
  }
  return 0;
}
const total = sheet => CATS.reduce((a, c) => a + (sheet[c] || 0), 0);
const needFor = (fixedCount, isMain) => (fixedCount === 1 ? 2 : fixedCount === 2 ? (isMain ? 1 : 2) : 1);

function newRound(s) {
  s.dealer = [roll(), roll(), roll()];
  s.fixed = null;
  s.picks = [null, null];
  s.dice = null;
  s.phase = 'fix';
  s.deadline = Date.now() + TURN_MS;
}

const api = {
  id: 'secretdice',
  name: '시크릿 다이스',
  score, CATS, SPECIAL,
  init() {
    const s = { round: 1, main: coin(), sheets: [{}, {}], threeUsed: [false, false], log: [], over: null };
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
      s.phase = 'pick';
      s.deadline = Date.now() + TURN_MS;
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
  // 시간 초과 시 자동 진행
  timeout(s) {
    if (s.over) return;
    if (s.phase === 'fix') { s.fixed = [0]; s.phase = 'pick'; s.deadline = Date.now() + TURN_MS; s.autoNote = '시간 초과로 주사위 1개가 자동 고정됐어요.'; return; }
    if (s.phase === 'pick') {
      [0, 1].forEach(p => { if (!s.picks[p]) s.picks[p] = Array.from({ length: needFor(s.fixed.length, p === s.main) }, roll); });
      s.autoNote = '시간 초과로 숫자가 무작위로 정해졌어요.';
      reveal(s);
      return;
    }
    if (s.phase === 'score') {
      const sheet = s.sheets[s.main];
      const open = CATS.filter(c => sheet[c] === undefined);
      const best = open.reduce((b, c) => (score(c, s.dice) > score(b, s.dice) ? c : b), open[0]);
      record(s, best);
      s.autoNote = '시간 초과로 가장 높은 점수 칸에 자동 기록됐어요.';
    }
  },
  view(s, i) {
    const o = 1 - i;
    const isMain = i === s.main;
    const showPicks = s.phase === 'score' || !!s.over;
    return {
      round: s.round, rounds: CATS.length * 2,
      isMain, phase: s.phase,
      dealer: s.dealer, fixed: s.fixed,
      myNeed: s.fixed ? needFor(s.fixed.length, isMain) : null,
      oppNeed: s.fixed ? needFor(s.fixed.length, !isMain) : null,
      myPick: s.picks[i], oppPicked: !!s.picks[o],
      oppPick: showPicks ? s.picks[o] : null,
      dice: s.dice, // [{v, from:'fixed'|'main'|'sub'}]
      sheets: [s.sheets[i], s.sheets[o]],
      totals: [total(s.sheets[i]), total(s.sheets[o])],
      threeUsed: [s.threeUsed[i], s.threeUsed[o]],
      preview: s.phase === 'score' && isMain ? Object.fromEntries(CATS.map(c => [c, score(c, s.dice.map(d => d.v))])) : null,
      last: s.log.length ? (l => ({ ...l, mine: l.main === i }))(s.log[s.log.length - 1]) : null,
      autoNote: s.autoNote || null,
      deadline: s.over ? null : s.deadline,
      waitingFor: s.over ? null : s.phase === 'pick' ? [!s.picks[i], !s.picks[o]] : [isMain, !isMain],
      over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

function reveal(s) {
  const m = s.main;
  s.dice = [
    ...s.fixed.map(k => ({ v: s.dealer[k], from: 'fixed' })),
    ...s.picks[m].map(v => ({ v, from: 'main' })),
    ...s.picks[1 - m].map(v => ({ v, from: 'sub' })),
  ];
  s.phase = 'score';
  s.deadline = Date.now() + TURN_MS;
}

function record(s, cat) {
  const m = s.main;
  const v = score(cat, s.dice.map(d => d.v));
  s.sheets[m][cat] = v;
  s.log.push({ round: s.round, main: m, cat, v, dice: s.dice.map(d => d.v) });
  const done = sh => CATS.every(c => sh[c] !== undefined);
  if (done(s.sheets[0]) && done(s.sheets[1])) {
    const t0 = total(s.sheets[0]), t1 = total(s.sheets[1]);
    s.over = { winner: t0 > t1 ? 0 : t1 > t0 ? 1 : -1 };
    s.deadline = null;
    return;
  }
  s.round++;
  s.main = 1 - m;
  if (done(s.sheets[s.main])) s.main = m; // 안전장치
  s.autoNote = null;
  newRound(s);
}

module.exports = api;

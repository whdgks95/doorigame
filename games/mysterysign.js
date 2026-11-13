// 미스터리 사인 (더 지니어스 그랜드파이널)
// 매 라운드 무작위 규칙 하나와 문제 "a ? b"가 출제됨.
// 두 사람이 번갈아 앞/뒤 숫자를 내면 "x ? y = 결과" 힌트가 공개되고,
// 힌트당 최대 3분 안에 문제의 답을 먼저 맞히면 +1, 틀리면 -1 (그 힌트에서는 더 못 맞힘).
// 두 사람 모두 패스하면(틀린 사람은 자동 패스) 다음 힌트로 넘어감.
const { coin } = require('./util');

const ROUNDS = 11;
const MAX_HINTS = 8;
const PROPOSE_MS = 30000;
const ANSWER_MS = 180000; // 힌트 하나당 최대 3분
const ROUND_END_MS = 8000;

const digits = n => String(Math.abs(n)).split('').map(Number);
const dsum = n => digits(n).reduce((a, b) => a + b, 0);
const LOOPS = [1, 0, 0, 0, 0, 0, 1, 0, 2, 1]; // 숫자 안의 동그라미 개수
const loops = n => digits(n).reduce((a, d) => a + LOOPS[d], 0);
const isPrime = n => { if (n < 2) return false; for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const divCount = n => { let c = 0; for (let k = 1; k <= n; k++) if (n % k === 0) c++; return c; };
const lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
const countBetween = (a, b, f) => { let c = 0; for (let k = lo(a, b) + 1; k < hi(a, b); k++) if (f(k)) c++; return c; };

// [설명, 함수]  — 새 규칙은 여기에 추가하면 됩니다.
const RULES = [
  ['두 수의 합', (a, b) => a + b],
  ['두 수의 곱', (a, b) => a * b],
  ['두 수의 차 (큰 수 - 작은 수)', (a, b) => Math.abs(a - b)],
  ['두 수의 제곱의 합', (a, b) => a * a + b * b],
  ['두 수 중 큰 수', (a, b) => hi(a, b)],
  ['두 수 중 작은 수', (a, b) => lo(a, b)],
  ['앞 수를 뒤 수로 나눈 나머지', (a, b) => a % b],
  ['앞 수를 뒤 수로 나눈 몫', (a, b) => Math.floor(a / b)],
  ['앞 수 × 2 + 뒤 수', (a, b) => 2 * a + b],
  ['두 수의 곱 + 두 수의 합', (a, b) => a * b + a + b],
  ['두 수의 곱 - 두 수의 합', (a, b) => a * b - a - b],
  ['앞 수의 제곱 - 뒤 수', (a, b) => a * a - b],
  ['두 수의 모든 자릿수의 합', (a, b) => dsum(a) + dsum(b)],
  ['두 수에 들어 있는 동그라미 개수 (0·6·9는 1개, 8은 2개)', (a, b) => loops(a) + loops(b)],
  ['두 수 사이에 있는 소수의 개수', (a, b) => countBetween(a, b, isPrime)],
  ['두 수 사이에 있는 짝수의 개수', (a, b) => countBetween(a, b, k => k % 2 === 0)],
  ['두 수 사이에 있는 정수의 개수', (a, b) => Math.max(0, Math.abs(a - b) - 1)],
  ['두 수의 최대공약수', (a, b) => gcd(a, b)],
  ['두 수의 최소공배수', (a, b) => (a * b) / gcd(a, b)],
  ['두 수의 합의 일의 자리', (a, b) => (a + b) % 10],
  ['두 수의 곱의 일의 자리', (a, b) => (a * b) % 10],
  ['두 수를 이어 붙인 수', (a, b) => Number(`${a}${b}`)],
  ['뒤 수와 앞 수를 이어 붙인 수', (a, b) => Number(`${b}${a}`)],
  ['두 수의 자릿수 개수의 합', (a, b) => digits(a).length + digits(b).length],
  ['두 수의 약수 개수의 합', (a, b) => divCount(a) + divCount(b)],
  ['두 수의 합 × 2', (a, b) => 2 * (a + b)],
  ['두 수의 곱 + 뒤 수', (a, b) => a * b + b],
  ['두 수의 평균을 내림한 값', (a, b) => Math.floor((a + b) / 2)],
];

const rint = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function newRound(s) {
  // 같은 게임에서 규칙이 겹치지 않게
  const pool = RULES.map((_, k) => k).filter(k => !s.usedRules.includes(k));
  s.rule = pool[Math.floor(Math.random() * pool.length)];
  s.usedRules.push(s.rule);
  s.problem = { a: rint(2, 30), b: rint(2, 30) };
  s.hints = [];
  s.attempts = [];
  s.front = s.round === 1 ? s.front : 1 - s.front;
  startPropose(s);
}
function startPropose(s) {
  s.phase = 'propose';
  s.proposal = [null, null]; // [앞 숫자, 뒤 숫자]
  s.locked = [false, false];
  s.passed = [false, false];
  s.deadline = Date.now() + PROPOSE_MS;
}
function compute(s, a, b) { return RULES[s.rule][1](a, b); }

function nextHintOrEnd(s) {
  if (s.hints.length >= MAX_HINTS) return endRound(s, -1);
  s.front = 1 - s.front; // 앞 숫자 내는 사람 교대
  startPropose(s);
}
function endRound(s, solver) {
  s.result = { round: s.round, solver, rule: RULES[s.rule][0], problem: s.problem, answer: compute(s, s.problem.a, s.problem.b) };
  s.history.push(s.result);
  s.phase = 'roundEnd';
  s.deadline = Date.now() + ROUND_END_MS;
  const remaining = s.rounds - s.round;
  const [p0, p1] = s.scores;
  if (s.round >= s.rounds && p0 !== p1) s.over = { winner: p0 > p1 ? 0 : 1 };
  else if (s.round < s.rounds && Math.abs(p0 - p1) > remaining) s.over = { winner: p0 > p1 ? 0 : 1 };
  else if (s.round >= s.rounds && p0 === p1) s.rounds++; // 동점이면 연장 라운드
  if (s.over) s.deadline = null;
}

module.exports = {
  id: 'mysterysign',
  name: '미스터리 사인',
  RULES,
  init() {
    const s = { round: 1, rounds: ROUNDS, scores: [0, 0], front: coin(), usedRules: [], history: [], result: null, over: null };
    newRound(s);
    return s;
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    s.note = null;
    if (a.type === 'propose') {
      if (s.phase !== 'propose') return '지금은 숫자를 낼 수 없어요.';
      const slot = s.proposal[0] === null ? 0 : 1;
      const who = slot === 0 ? s.front : 1 - s.front;
      if (i !== who) return slot === 0 ? '상대가 앞 숫자를 내는 중이에요.' : '상대가 뒤 숫자를 내는 중이에요.';
      const n = Number(a.n);
      if (!Number.isInteger(n) || n < 1 || n > 999) return '1~999 사이의 정수를 내야 해요. (0 제외)';
      s.proposal[slot] = n;
      if (slot === 0) { s.deadline = Date.now() + PROPOSE_MS; return null; }
      const [x, y] = s.proposal;
      s.hints.push({ x, y, z: compute(s, x, y) });
      s.phase = 'answer';
      s.deadline = Date.now() + ANSWER_MS;
      return null;
    }
    if (a.type === 'answer') {
      if (s.phase !== 'answer') return '지금은 정답을 말할 수 없어요.';
      if (s.locked[i]) return '이번 힌트에서는 이미 틀려서 기회가 상대에게 넘어갔어요.';
      const n = Number(a.n);
      if (!Number.isInteger(n) || Math.abs(n) > 1e9) return '정수로 답해 주세요.';
      const ok = n === compute(s, s.problem.a, s.problem.b);
      s.attempts.push({ who: i, n, ok, hint: s.hints.length });
      if (ok) { s.scores[i]++; endRound(s, i); return null; }
      s.scores[i]--;
      s.locked[i] = true;
      s.passed[i] = true; // 틀린 사람은 자동 패스
      if (s.passed[0] && s.passed[1]) nextHintOrEnd(s);
      return null;
    }
    if (a.type === 'pass') {
      if (s.phase !== 'answer') return '지금은 패스할 수 없어요.';
      if (s.passed[i]) return '이미 패스했어요.';
      s.passed[i] = true;
      if (s.passed[0] && s.passed[1]) nextHintOrEnd(s);
      return null;
    }
    return '알 수 없는 행동이에요.';
  },
  timeout(s) {
    if (s.over) return;
    if (s.phase === 'propose') {
      // 숫자를 안 내면 무작위 숫자
      const slot = s.proposal[0] === null ? 0 : 1;
      this.action(s, slot === 0 ? s.front : 1 - s.front, { type: 'propose', n: rint(1, 20) });
      s.note = '시간 초과로 숫자가 무작위로 정해졌어요.';
      return;
    }
    if (s.phase === 'answer') { s.note = null; nextHintOrEnd(s); return; }
    if (s.phase === 'roundEnd') { s.note = null; s.round++; s.result = null; newRound(s); }
  },
  view(s, i) {
    const o = 1 - i;
    const slot = s.phase === 'propose' ? (s.proposal[0] === null ? 0 : 1) : null;
    const proposer = slot === null ? null : slot === 0 ? s.front : 1 - s.front;
    return {
      round: s.round, rounds: s.rounds,
      scores: [s.scores[i], s.scores[o]],
      problem: s.problem,
      hints: s.hints, maxHints: MAX_HINTS,
      phase: s.phase,
      iAmFront: s.front === i,
      slot, myPropose: proposer === i,
      frontNumber: s.phase === 'propose' ? s.proposal[0] : null,
      canAnswer: s.phase === 'answer' && !s.locked[i],
      oppLocked: s.locked[o], myLocked: s.locked[i],
      myPassed: !!(s.passed && s.passed[i]), oppPassed: !!(s.passed && s.passed[o]),
      attempts: s.attempts.map(t => ({ mine: t.who === i, n: t.n, ok: t.ok, hint: t.hint })),
      result: s.result && { ...s.result, solver: s.result.solver === -1 ? 'none' : s.result.solver === i ? 'me' : 'opp' },
      history: s.history.map(h => ({ round: h.round, rule: h.rule, problem: h.problem, answer: h.answer, solver: h.solver === -1 ? 'none' : h.solver === i ? 'me' : 'opp' })),
      deadline: s.over ? null : s.deadline,
      note: s.note || null,
      over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

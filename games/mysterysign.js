// 미스터리 사인 (기본) / 숨은 공식 (심화)
// 매 라운드 무작위 공식 하나와 문제 "a ? b"가 출제됨. 공식은 수천 가지 중에서 뽑고,
// 한 게임 안에서는 같은 '공식 틀'이 다시 나오지 않으며 최근 나온 공식도 피함.
// 두 사람이 번갈아 앞/뒤 숫자를 내면 "x ? y = 결과" 힌트가 공개되고,
// 힌트당 최대 3분 안에 답을 먼저 맞히면 +1, 틀리면 -1 (그 힌트에서는 더 못 맞힘).
// 둘 다 패스하면(틀린 사람은 자동 패스) 다음 힌트. 라운드당 힌트 최대 8개.
// 심화: 힌트가 만들어질 때마다 앞 숫자를 낸 사람이 0.5점을 판에 검(판돈).
//       정답자는 +1과 판돈을 모두 가져가고, 이어서 공식 4지선다를 맞히면 +1 보너스.
const { coin, rint, shuffle } = require('./util');
const formulas = require('./formulas');

const ROUNDS = 11;
const MAX_HINTS = 8;
const PROPOSE_MS = 30000;
const ANSWER_MS = 180000;
const RULE_GUESS_MS = 20000;
const ROUND_END_MS = 8000;
const STAKE = 0.5;

function make(plus) {
  function newRound(s) {
    const r = formulas.generate(s.usedFamilies);
    s.usedFamilies.push(r.family);
    s.rule = r;
    s.problem = { a: rint(2, 40), b: rint(2, 40) };
    s.hints = []; s.attempts = []; s.pot = 0; s.choices = null;
    s.front = s.round === 1 ? s.front : 1 - s.front;
    startPropose(s);
  }
  function startPropose(s) {
    s.phase = 'propose';
    s.proposal = [null, null];
    s.locked = [false, false];
    s.passed = [false, false];
    s.deadline = Date.now() + PROPOSE_MS;
  }
  const answerOf = s => s.rule.f(s.problem.a, s.problem.b);
  function nextHintOrEnd(s) {
    if (s.hints.length >= MAX_HINTS) return endRound(s, -1);
    s.front = 1 - s.front;
    startPropose(s);
  }
  function endRound(s, solver) {
    s.result = { round: s.round, solver, rule: s.rule.desc, problem: s.problem, answer: answerOf(s), pot: s.pot, bonus: null };
    s.history.push(s.result);
    if (plus && solver >= 0) {
      // 공식 맞히기 4지선다
      const others = [];
      while (others.length < 3) { const r = formulas.generate([s.rule.family, ...others.map(o => o.family)]); others.push(r); }
      s.choices = shuffle([s.rule.desc, ...others.map(o => o.desc)]);
      s.phase = 'ruleGuess';
      s.solver = solver;
      s.deadline = Date.now() + RULE_GUESS_MS;
      return;
    }
    finishRound(s);
  }
  function finishRound(s) {
    s.phase = 'roundEnd';
    s.deadline = Date.now() + ROUND_END_MS;
    const remaining = s.rounds - s.round;
    const [p0, p1] = s.scores;
    const maxSwing = plus ? 4 : 1; // 남은 라운드당 최대 점수 차 변화(대략)
    if (s.round >= s.rounds && p0 !== p1) s.over = { winner: p0 > p1 ? 0 : 1 };
    else if (s.round < s.rounds && Math.abs(p0 - p1) > remaining * maxSwing) s.over = { winner: p0 > p1 ? 0 : 1 };
    else if (s.round >= s.rounds && p0 === p1) s.rounds++;
    if (s.over) s.deadline = null;
  }

  const api = {
    id: plus ? 'mysterysign_plus' : 'mysterysign',
    name: plus ? '숨은 공식' : '미스터리 사인',
    init() {
      const s = { round: 1, rounds: ROUNDS, scores: [0, 0], front: coin(), usedFamilies: [], history: [], events: [], result: null, over: null };
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
        const z = s.rule.f(x, y);
        s.hints.push({ x, y, z });
        if (plus) { s.scores[s.front] -= STAKE; s.pot += STAKE; }
        s.events.push({ round: s.round, type: 'hint', x, y, z, front: s.front, stake: plus ? STAKE : 0 });
        s.phase = 'answer';
        s.deadline = Date.now() + ANSWER_MS;
        return null;
      }
      if (a.type === 'answer') {
        if (s.phase !== 'answer') return '지금은 정답을 말할 수 없어요.';
        if (s.locked[i]) return '이번 힌트에서는 이미 틀려서 기회가 상대에게 넘어갔어요.';
        const n = Number(a.n);
        if (!Number.isInteger(n) || Math.abs(n) > 1e9) return '정수로 답해 주세요.';
        const ok = n === answerOf(s);
        s.attempts.push({ who: i, n, ok, hint: s.hints.length });
        s.events.push({ round: s.round, type: 'answer', who: i, n, ok });
        if (ok) { s.scores[i] += 1 + s.pot; endRound(s, i); return null; }
        s.scores[i]--;
        s.locked[i] = true;
        s.passed[i] = true;
        if (s.passed[0] && s.passed[1]) nextHintOrEnd(s);
        return null;
      }
      if (a.type === 'pass') {
        if (s.phase !== 'answer') return '지금은 패스할 수 없어요.';
        if (s.passed[i]) return '이미 패스했어요.';
        s.passed[i] = true;
        s.events.push({ round: s.round, type: 'pass', who: i });
        if (s.passed[0] && s.passed[1]) nextHintOrEnd(s);
        return null;
      }
      if (a.type === 'ruleGuess') {
        if (s.phase !== 'ruleGuess') return '지금은 공식을 고를 수 없어요.';
        if (i !== s.solver) return '정답자가 공식을 고르는 중이에요.';
        const k = Number(a.k);
        if (!Number.isInteger(k) || !s.choices[k]) return '보기 중에서 골라 주세요.';
        const ok = s.choices[k] === s.rule.desc;
        if (ok) s.scores[i] += 1;
        s.result.bonus = ok ? 'ok' : 'no';
        s.events.push({ round: s.round, type: 'ruleGuess', who: i, ok });
        finishRound(s);
        return null;
      }
      return '알 수 없는 행동이에요.';
    },
    timeout(s) {
      if (s.over) return;
      if (s.phase === 'propose') {
        const slot = s.proposal[0] === null ? 0 : 1;
        api.action(s, slot === 0 ? s.front : 1 - s.front, { type: 'propose', n: rint(1, 20) });
        s.note = '시간 초과로 숫자가 무작위로 정해졌어요.';
        return;
      }
      if (s.phase === 'answer') { s.note = null; nextHintOrEnd(s); return; }
      if (s.phase === 'ruleGuess') { s.result.bonus = 'no'; finishRound(s); return; }
      if (s.phase === 'roundEnd') { s.note = null; s.round++; s.result = null; newRound(s); }
    },
    view(s, i) {
      const o = 1 - i;
      const slot = s.phase === 'propose' ? (s.proposal[0] === null ? 0 : 1) : null;
      const proposer = slot === null ? null : slot === 0 ? s.front : 1 - s.front;
      const showRule = s.phase === 'roundEnd' || !!s.over;
      return {
        plus,
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
        myPassed: !!s.passed[i], oppPassed: !!s.passed[o],
        pot: s.pot || 0,
        choices: s.phase === 'ruleGuess' && s.solver === i ? s.choices : null,
        ruleGuessing: s.phase === 'ruleGuess' ? (s.solver === i ? 'me' : 'opp') : null,
        attempts: s.attempts.map(t => ({ mine: t.who === i, n: t.n, ok: t.ok, hint: t.hint })),
        result: showRule && s.result ? { ...s.result, solver: s.result.solver === -1 ? 'none' : s.result.solver === i ? 'me' : 'opp' }
          : (s.result && s.phase === 'ruleGuess' ? { solver: s.result.solver === i ? 'me' : 'opp', answer: s.result.answer, problem: s.result.problem, hidden: true } : null),
        history: s.history.filter(h => showRule || h !== s.result).map(h => ({ round: h.round, rule: h.rule, problem: h.problem, answer: h.answer, bonus: h.bonus, solver: h.solver === -1 ? 'none' : h.solver === i ? 'me' : 'opp' })),
        events: s.events.slice(-60).map(e => ({ ...e, mine: e.who === i, iFront: e.front === i })),
        deadline: s.over ? null : s.deadline,
        note: s.note || null,
        over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
      };
    },
  };
  return api;
}

module.exports = [make(false), make(true)];

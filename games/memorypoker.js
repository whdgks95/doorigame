// 기억 포커 (데블스 플랜: 데드 어게인 1일차 미니게임 규칙)
// 1) 52장 덱에서 16장을 4×4로 펼쳐 일정 시간 공개 → 외우기 (둘 다 '다 외웠어요'를 누르면 바로 넘어감)
// 2) 카드가 모두 뒤집히고 공유 카드 3장 공개
// 3) 각자 16칸 중 2칸을 비공개로 고름 (같은 카드를 골라도 됨)
// 4) 고른 2장 + 공유 3장 = 5장으로 족보 비교. 높은 쪽이 라운드 승리. 완전히 같으면 새 카드로 재대결.
// 3라운드를 먼저 이기면 승리.
const { shuffle, rint } = require('./util');

const MEMO_MS = 60000;
const CHOOSE_MS = 60000;
const RESULT_MS = 9000;
const TARGET = 3;
const HANDS = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

function deck() { const d = []; for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s }); return shuffle(d); }

// 정확히 5장 평가 → [족보 번호, 비교용 숫자들...]
function eval5(cards) {
  const rs = cards.map(c => c.r).sort((a, b) => b - a);
  const flush = cards.every(c => c.s === cards[0].s);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs.join() === '14,5,4,3,2') straightHigh = 5; // A-2-3-4-5
  }
  const cnt = {}; rs.forEach(r => (cnt[r] = (cnt[r] || 0) + 1));
  const groups = Object.entries(cnt).map(([r, c]) => [c, Number(r)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map(g => g[1]);
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, ...byGroup];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...byGroup];
  if (flush) return [5, ...rs];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...byGroup];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...byGroup];
  if (groups[0][0] === 2) return [1, ...byGroup];
  return [0, ...rs];
}
function cmpEval(a, b) {
  for (let k = 0; k < Math.max(a.length, b.length); k++) { const d = (a[k] || 0) - (b[k] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

function deal(s) {
  const d = deck();
  s.board = d.slice(0, 16);
  s.shared = d.slice(16, 19);
  s.picks = [null, null];
  s.ready = [false, false];
  s.phase = 'memorize';
  s.deadline = Date.now() + MEMO_MS;
}
function startChoose(s) { s.phase = 'choose'; s.deadline = Date.now() + CHOOSE_MS; }
function resolve(s) {
  const hands = s.picks.map(p => [...p.map(k => s.board[k]), ...s.shared]);
  const ev = hands.map(eval5);
  const c = cmpEval(ev[0], ev[1]);
  const winner = c > 0 ? 0 : c < 0 ? 1 : -1;
  if (winner >= 0) s.wins[winner]++;
  s.result = { round: s.round, picks: s.picks.map(p => p.slice()), cards: s.picks.map(p => p.map(k => s.board[k])), shared: s.shared, hands: ev.map(e => HANDS[e[0]]), winner };
  s.history.push(s.result);
  s.phase = 'result';
  if (s.wins[0] >= TARGET || s.wins[1] >= TARGET) { s.over = { winner: s.wins[0] >= TARGET ? 0 : 1 }; s.deadline = null; }
  else s.deadline = Date.now() + RESULT_MS;
}

const api = {
  id: 'memorypoker',
  name: '기억 포커',
  eval5, cmpEval, HANDS,
  init() {
    const s = { round: 1, wins: [0, 0], history: [], result: null, over: null };
    deal(s);
    return s;
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (a.type === 'ready') {
      if (s.phase !== 'memorize') return '지금은 외우는 시간이 아니에요.';
      s.ready[i] = true;
      if (s.ready[0] && s.ready[1]) startChoose(s);
      return null;
    }
    if (a.type === 'pick') {
      if (s.phase !== 'choose') return '지금은 카드를 고를 수 없어요.';
      if (s.picks[i]) return '이미 골랐어요.';
      const idx = Array.isArray(a.idx) ? a.idx.map(Number) : [];
      if (idx.length !== 2 || idx[0] === idx[1] || idx.some(k => !Number.isInteger(k) || k < 0 || k > 15)) return '서로 다른 칸 2개를 골라야 해요.';
      s.picks[i] = idx;
      if (s.picks[0] && s.picks[1]) resolve(s);
      return null;
    }
    return '알 수 없는 행동이에요.';
  },
  timeout(s) {
    if (s.over) return;
    if (s.phase === 'memorize') { startChoose(s); return; }
    if (s.phase === 'choose') {
      [0, 1].forEach(p => { if (!s.picks[p]) { const a = rint(0, 15); let b = rint(0, 15); while (b === a) b = rint(0, 15); s.picks[p] = [a, b]; s.autoPick = (s.autoPick || []).concat(p); } });
      resolve(s);
      return;
    }
    if (s.phase === 'result') { s.round++; s.result = null; s.autoPick = []; deal(s); }
  },
  view(s, i) {
    const o = 1 - i;
    const showBoard = s.phase === 'memorize' || s.phase === 'result' || !!s.over;
    const mapRes = r => r && ({ round: r.round, myPick: r.picks[i], oppPick: r.picks[o], myCards: r.cards[i], oppCards: r.cards[o], shared: r.shared, myHand: r.hands[i], oppHand: r.hands[o], result: r.winner === -1 ? 'draw' : r.winner === i ? 'win' : 'lose' });
    return {
      round: s.round, wins: [s.wins[i], s.wins[o]], target: TARGET,
      phase: s.phase,
      board: showBoard ? s.board : null,
      shared: s.phase === 'memorize' ? null : s.shared,
      myPick: s.picks[i], oppPicked: !!s.picks[o],
      ready: [s.ready[i], s.ready[o]],
      result: mapRes(s.result),
      history: s.history.slice(-20).map(mapRes),
      memoMs: MEMO_MS, chooseMs: CHOOSE_MS, resultMs: RESULT_MS,
      deadline: s.over ? null : s.deadline,
      over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

module.exports = api;

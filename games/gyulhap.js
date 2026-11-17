// 결! 합! (기본) / 삼합 스피드 (심화)
// 심화: 타일 12장(4×3), 같은 사람이 연속으로 합을 맞히면 두 번째부터 +2 (콤보). '결'은 '클리어'.
const { shuffle } = require('./util');

const ROUNDS = 3;
const attrs = id => [id % 3, Math.floor(id / 3) % 3, Math.floor(id / 9)]; // 모양, 색, 배경
const isHap = (a, b, c) => {
  const A = attrs(a), B = attrs(b), C = attrs(c);
  return [0, 1, 2].every(k => (A[k] + B[k] + C[k]) % 3 === 0);
};
const keyOf = cells => cells.slice().sort((p, q) => p - q).join('-');

function allHaps(board) {
  const res = [], n = board.length;
  for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) for (let z = y + 1; z < n; z++)
    if (isHap(board[x], board[y], board[z])) res.push(keyOf([x + 1, y + 1, z + 1]));
  return res;
}

function make(plus) {
  const N = plus ? 12 : 9;
  const newBoard = () => {
    let board;
    do { board = shuffle([...Array(27).keys()]).slice(0, N); } while (allHaps(board).length === 0);
    return board;
  };
  return {
    id: plus ? 'gyulhap_plus' : 'gyulhap',
    name: plus ? '삼합 스피드' : '결! 합!',
    isHap, allHaps, keyOf,
    init() {
      return { round: 1, rounds: ROUNDS, board: newBoard(), claimed: [], scores: [0, 0], streak: { who: -1, count: 0 }, log: [], over: null };
    },
    action(s, i, a) {
      if (s.over) return '게임이 끝났어요.';
      if (a.type === 'hap') {
        const cells = Array.isArray(a.cells) ? a.cells.map(Number) : [];
        if (cells.length !== 3 || new Set(cells).size !== 3 || cells.some(c => !Number.isInteger(c) || c < 1 || c > N))
          return '서로 다른 타일 3개를 골라야 해요.';
        const key = keyOf(cells);
        const ok = isHap(...cells.map(c => s.board[c - 1]));
        let reason = null;
        if (!ok) reason = '합이 아님';
        else if (s.claimed.includes(key)) reason = '이미 나온 합';
        let delta;
        if (reason) { delta = -1; if (s.streak.who === i) s.streak = { who: -1, count: 0 }; }
        else {
          s.claimed.push(key);
          s.streak = s.streak.who === i ? { who: i, count: s.streak.count + 1 } : { who: i, count: 1 };
          delta = plus && s.streak.count >= 2 ? 2 : 1;
        }
        s.scores[i] += delta;
        s.log.push({ round: s.round, who: i, kind: 'hap', cells: key, ok: !reason, delta, reason, combo: plus && !reason && s.streak.count >= 2 ? s.streak.count : 0, at: Date.now() });
        return null;
      }
      if (a.type === 'gyul') {
        const left = allHaps(s.board).filter(k => !s.claimed.includes(k));
        const ok = left.length === 0;
        const delta = ok ? 3 : -1;
        s.scores[i] += delta;
        s.streak = { who: -1, count: 0 };
        s.log.push({ round: s.round, who: i, kind: 'gyul', ok, delta, reason: ok ? null : `합이 ${left.length}개 남음`, at: Date.now() });
        if (ok) {
          s.round++;
          if (s.round > s.rounds) {
            if (s.scores[0] === s.scores[1]) s.rounds++;
            else { s.over = { winner: s.scores[0] > s.scores[1] ? 0 : 1 }; return null; }
          }
          s.board = newBoard();
          s.claimed = [];
        }
        return null;
      }
      return '알 수 없는 행동이에요.';
    },
    view(s, i) {
      return {
        plus, cols: plus ? 4 : 3,
        round: Math.min(s.round, s.rounds), rounds: s.rounds,
        board: s.board.map(id => { const [shape, color, bg] = attrs(id); return { shape, color, bg }; }),
        claimed: s.claimed,
        scores: [s.scores[i], s.scores[1 - i]],
        log: s.log.slice(-40).map(l => ({ ...l, mine: l.who === i })),
        over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
      };
    },
  };
}

module.exports = [make(false), make(true)];

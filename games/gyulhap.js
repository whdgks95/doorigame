// 결! 합! (더 지니어스 데스매치)
const { shuffle } = require('./util');

const ROUNDS = 3;
const attrs = id => [id % 3, Math.floor(id / 3) % 3, Math.floor(id / 9)]; // 모양, 색, 배경
const isHap = (a, b, c) => {
  const A = attrs(a), B = attrs(b), C = attrs(c);
  return [0, 1, 2].every(k => (A[k] + B[k] + C[k]) % 3 === 0);
};

function allHaps(board) {
  const res = [];
  for (let x = 0; x < 9; x++) for (let y = x + 1; y < 9; y++) for (let z = y + 1; z < 9; z++)
    if (isHap(board[x], board[y], board[z])) res.push(`${x + 1}${y + 1}${z + 1}`);
  return res;
}

function newBoard() {
  let board;
  do { board = shuffle([...Array(27).keys()]).slice(0, 9); } while (allHaps(board).length === 0);
  return board;
}

module.exports = {
  id: 'gyulhap',
  name: '결! 합!',
  isHap, allHaps,
  init() {
    return { round: 1, rounds: ROUNDS, board: newBoard(), claimed: [], scores: [0, 0], log: [], over: null };
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (a.type === 'hap') {
      const cells = Array.isArray(a.cells) ? a.cells.map(Number) : [];
      if (cells.length !== 3 || new Set(cells).size !== 3 || cells.some(c => !Number.isInteger(c) || c < 1 || c > 9))
        return '서로 다른 타일 3개를 골라야 해요.';
      const key = cells.slice().sort((p, q) => p - q).join('');
      const ok = isHap(...cells.map(c => s.board[c - 1]));
      let reason = null;
      if (!ok) reason = '합이 아님';
      else if (s.claimed.includes(key)) reason = '이미 나온 합';
      const delta = reason ? -1 : 1;
      if (!reason) s.claimed.push(key);
      s.scores[i] += delta;
      s.log.push({ round: s.round, who: i, kind: 'hap', cells: key, ok: !reason, delta, reason });
      return null;
    }
    if (a.type === 'gyul') {
      const left = allHaps(s.board).filter(k => !s.claimed.includes(k));
      const ok = left.length === 0;
      const delta = ok ? 3 : -1;
      s.scores[i] += delta;
      s.log.push({ round: s.round, who: i, kind: 'gyul', ok, delta, reason: ok ? null : `합이 ${left.length}개 남음` });
      if (ok) {
        s.round++;
        if (s.round > s.rounds) {
          if (s.scores[0] === s.scores[1]) s.rounds++; // 동점이면 연장 라운드
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
      round: Math.min(s.round, s.rounds), rounds: s.rounds,
      board: s.board.map(id => { const [shape, color, bg] = attrs(id); return { shape, color, bg }; }),
      claimed: s.claimed,
      scores: [s.scores[i], s.scores[1 - i]],
      log: s.log.slice(-30).map(l => ({ ...l, mine: l.who === i })),
      over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

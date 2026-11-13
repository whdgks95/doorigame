// 십이장기 (더 지니어스 데스매치)
// 판: 4행 x 3열. 0번 플레이어는 아래(3행)에서 위로, 1번 플레이어는 위(0행)에서 아래로.
const { coin } = require('./util');

const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const fwd = o => (o === 0 ? -1 : 1);
const enemyRow = o => (o === 0 ? 0 : 3);
const MAX_PLIES = 200;

function dirs(p) {
  const f = fwd(p.o);
  switch (p.t) {
    case 'K': return [...ORTH, ...DIAG];
    case 'R': return ORTH;            // 장(將)
    case 'B': return DIAG;            // 상(相)
    case 'P': return [[f, 0]];        // 자(子)
    case 'G': return [...ORTH, [f, -1], [f, 1]]; // 후(侯)
  }
  return [];
}

const inBoard = (r, c) => r >= 0 && r < 4 && c >= 0 && c < 3;

module.exports = {
  id: 'janggi12',
  name: '십이장기',
  init() {
    const b = Array.from({ length: 4 }, () => [null, null, null]);
    b[3] = [{ t: 'R', o: 0 }, { t: 'K', o: 0 }, { t: 'B', o: 0 }];
    b[2][1] = { t: 'P', o: 0 };
    b[0] = [{ t: 'B', o: 1 }, { t: 'K', o: 1 }, { t: 'R', o: 1 }];
    b[1][1] = { t: 'P', o: 1 };
    return { board: b, hands: [[], []], turn: coin(), plies: 0, lastMove: null, over: null };
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (s.turn !== i) return '상대 차례예요.';
    const b = s.board;
    if (a.type === 'move') {
      const [fr, fc] = a.from || [], [tr, tc] = a.to || [];
      if (![fr, fc, tr, tc].every(Number.isInteger) || !inBoard(fr, fc) || !inBoard(tr, tc)) return '잘못된 위치예요.';
      const p = b[fr][fc];
      if (!p || p.o !== i) return '내 말을 골라야 해요.';
      if (!dirs(p).some(([dr, dc]) => fr + dr === tr && fc + dc === tc)) return '그 말은 거기로 갈 수 없어요.';
      const target = b[tr][tc];
      if (target && target.o === i) return '내 말이 있는 칸이에요.';
      if (target) {
        if (target.t === 'K') { b[tr][tc] = p; b[fr][fc] = null; s.lastMove = { from: [fr, fc], to: [tr, tc] }; s.over = { winner: i, reason: '왕을 잡음' }; return null; }
        s.hands[i].push(target.t === 'G' ? 'P' : target.t);
      }
      b[tr][tc] = p; b[fr][fc] = null;
      if (p.t === 'P' && tr === enemyRow(i)) p.t = 'G';
      s.lastMove = { from: [fr, fc], to: [tr, tc] };
    } else if (a.type === 'drop') {
      const [tr, tc] = a.to || [];
      if (![tr, tc].every(Number.isInteger) || !inBoard(tr, tc)) return '잘못된 위치예요.';
      const k = s.hands[i].indexOf(a.piece);
      if (k === -1) return '그 말을 갖고 있지 않아요.';
      if (b[tr][tc]) return '빈 칸에만 놓을 수 있어요.';
      if (tr === enemyRow(i)) return '상대 진영(맨 끝 줄)에는 놓을 수 없어요.';
      s.hands[i].splice(k, 1);
      b[tr][tc] = { t: a.piece, o: i };
      s.lastMove = { from: null, to: [tr, tc] };
    } else return '알 수 없는 행동이에요.';

    s.plies++;
    s.turn = 1 - i;
    // 상대 진영에 들어간 왕이 한 턴을 버티면 승리
    const j = s.turn;
    const er = enemyRow(j);
    if (b[er].some(p => p && p.t === 'K' && p.o === j)) { s.over = { winner: j, reason: '왕이 상대 진영에서 버팀' }; return null; }
    if (s.plies >= MAX_PLIES) s.over = { winner: -1, reason: '수 제한(200수) 무승부' };
    return null;
  },
  view(s, i) {
    return {
      board: s.board.map(row => row.map(p => p && { t: p.t, mine: p.o === i })),
      flip: i === 1,
      myHand: s.hands[i], oppHand: s.hands[1 - i],
      myTurn: !s.over && s.turn === i,
      lastMove: s.lastMove,
      myEnemyRow: enemyRow(i),
      over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose', reason: s.over.reason },
    };
  },
};

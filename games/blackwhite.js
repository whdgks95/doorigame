// 흑과 백 (더 지니어스 데스매치)
const { coin, isInt } = require('./util');

const ROUNDS = 9;
const color = n => (n <= 9 ? '흑' : '백');
const lamps = p => (p >= 80 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 20 ? 2 : p > 0 ? 1 : 0);

module.exports = {
  id: 'blackwhite',
  name: '흑과 백',
  init() {
    return { pts: [99, 99], wins: [0, 0], round: 1, first: coin(), phase: 'first', bet: [null, null], log: [], over: null };
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (a.type !== 'bet') return '알 수 없는 행동이에요.';
    const turn = s.phase === 'first' ? s.first : 1 - s.first;
    if (i !== turn) return '상대 차례예요.';
    const amt = Number(a.amount);
    if (!isInt(amt) || amt < 0 || amt > s.pts[i]) return `0부터 ${s.pts[i]} 사이의 정수를 내야 해요.`;
    s.bet[i] = amt;
    if (s.phase === 'first') { s.phase = 'second'; return null; }

    const f = s.first, b = s.bet;
    s.pts[0] -= b[0]; s.pts[1] -= b[1];
    const winner = b[0] > b[1] ? 0 : b[1] > b[0] ? 1 : -1;
    if (winner >= 0) s.wins[winner]++;
    s.log.push({ round: s.round, first: f, bets: [b[0], b[1]], winner });
    if (winner >= 0) s.first = winner;
    s.round++;
    s.bet = [null, null];
    s.phase = 'first';

    const remaining = ROUNDS - (s.round - 1);
    const [w0, w1] = s.wins;
    if (w0 >= 5 || w1 >= 5 || remaining <= 0 || w0 > w1 + remaining || w1 > w0 + remaining) {
      s.over = { winner: w0 > w1 ? 0 : w1 > w0 ? 1 : -1 };
    }
    return null;
  },
  view(s, i) {
    const o = 1 - i;
    const turn = s.phase === 'first' ? s.first : 1 - s.first;
    return {
      round: Math.min(s.round, ROUNDS), rounds: ROUNDS,
      myPts: s.pts[i], myLamps: lamps(s.pts[i]), oppLamps: lamps(s.pts[o]),
      wins: [s.wins[i], s.wins[o]],
      myTurn: !s.over && turn === i,
      iAmFirst: s.first === i,
      oppColor: s.phase === 'second' && s.first === o ? color(s.bet[o]) : null,
      log: s.log.map(l => ({
        round: l.round, iWentFirst: l.first === i,
        myBet: l.bets[i], myColor: color(l.bets[i]), oppColor: color(l.bets[o]),
        result: l.winner === -1 ? 'draw' : l.winner === i ? 'win' : 'lose',
      })),
      over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose' },
      // 게임이 끝나면 전체 기록 공개
      reveal: s.over ? s.log.map(l => ({ round: l.round, my: l.bets[i], opp: l.bets[o] })) : null,
    };
  },
};

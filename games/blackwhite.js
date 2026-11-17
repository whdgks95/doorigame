// 흑과 백 (기본) / 그림자 입찰 (심화)
// 심화: 색이 3단계(0~9 흑, 10~29 회, 30+ 백)이고, 각자 게임당 한 번 '위장 토큰'으로
//       선 플레이어일 때 상대에게 실제와 다른 색을 보여줄 수 있음.
const { coin, isInt } = require('./util');

const ROUNDS = 9;
const lamps = p => (p >= 80 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 20 ? 2 : p > 0 ? 1 : 0);

function make(plus) {
  const color = plus ? (n => (n <= 9 ? '흑' : n <= 29 ? '회' : '백')) : (n => (n <= 9 ? '흑' : '백'));
  const COLORS = plus ? ['흑', '회', '백'] : ['흑', '백'];
  return {
    id: plus ? 'blackwhite_plus' : 'blackwhite',
    name: plus ? '그림자 입찰' : '흑과 백',
    init() {
      return { pts: [99, 99], wins: [0, 0], round: 1, first: coin(), phase: 'first', bet: [null, null], shown: null, disguiseUsed: [false, false], disguised: false, log: [], over: null };
    },
    action(s, i, a) {
      if (s.over) return '게임이 끝났어요.';
      if (a.type !== 'bet') return '알 수 없는 행동이에요.';
      const turn = s.phase === 'first' ? s.first : 1 - s.first;
      if (i !== turn) return '상대 차례예요.';
      const amt = Number(a.amount);
      if (!isInt(amt) || amt < 0 || amt > s.pts[i]) return `0부터 ${s.pts[i]} 사이의 정수를 내야 해요.`;
      if (s.phase === 'first') {
        if (plus && a.disguise) {
          if (s.disguiseUsed[i]) return '위장 토큰은 이미 썼어요.';
          if (!COLORS.includes(a.disguise) || a.disguise === color(amt)) return '실제와 다른 색을 골라야 해요.';
          s.disguiseUsed[i] = true;
          s.shown = a.disguise;
          s.disguised = true;
        } else { s.shown = color(amt); s.disguised = false; }
        s.bet[i] = amt;
        s.phase = 'second';
        return null;
      }
      s.bet[i] = amt;
      const f = s.first, b = s.bet;
      s.pts[0] -= b[0]; s.pts[1] -= b[1];
      const winner = b[0] > b[1] ? 0 : b[1] > b[0] ? 1 : -1;
      if (winner >= 0) s.wins[winner]++;
      s.log.push({ round: s.round, first: f, bets: [b[0], b[1]], winner, disguised: s.disguised, shown: s.shown });
      if (winner >= 0) s.first = winner;
      s.round++;
      s.bet = [null, null];
      s.shown = null; s.disguised = false;
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
        plus, colors: COLORS,
        round: Math.min(s.round, ROUNDS), rounds: ROUNDS,
        myPts: s.pts[i], myLamps: lamps(s.pts[i]), oppLamps: lamps(s.pts[o]),
        wins: [s.wins[i], s.wins[o]],
        myTurn: !s.over && turn === i,
        iAmFirst: s.first === i,
        oppColor: s.phase === 'second' && s.first === o ? s.shown : null,
        disguiseLeft: [!s.disguiseUsed[i], !s.disguiseUsed[o]],
        log: s.log.map(l => ({
          round: l.round, iWentFirst: l.first === i,
          myBet: l.bets[i], myColor: color(l.bets[i]), oppColor: color(l.bets[o]),
          result: l.winner === -1 ? 'draw' : l.winner === i ? 'win' : 'lose',
          disguise: l.disguised ? (l.first === i ? 'me' : 'opp') : null, shown: l.shown,
        })),
        over: s.over && { result: s.over.winner === -1 ? 'draw' : s.over.winner === i ? 'win' : 'lose' },
        reveal: s.over ? s.log.map(l => ({ round: l.round, my: l.bets[i], opp: l.bets[o] })) : null,
      };
    },
  };
}

module.exports = [make(false), make(true)];

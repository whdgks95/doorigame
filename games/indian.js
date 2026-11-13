// 인디언 포커 (더 지니어스 데스매치)
const { shuffle, coin, isInt } = require('./util');

const START_CHIPS = 30;
const newDeck = () => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

function startRound(s) {
  if (s.chips[0] <= 0 || s.chips[1] <= 0) {
    s.over = { winner: s.chips[0] > 0 ? 0 : 1 };
    return;
  }
  if (s.deck.length < 2) { s.deck = newDeck(); s.reshuffled = true; } else s.reshuffled = false;
  s.round++;
  s.cards = [s.deck.pop(), s.deck.pop()];
  s.contrib = [1, 1];
  s.chips[0]--; s.chips[1]--;
  s.starter = s.round === 1 ? s.starter : 1 - s.starter;
  s.toAct = s.starter;
  s.acted = [false, false];
}

function endRound(s, winner, reason) {
  const pot = s.contrib[0] + s.contrib[1];
  let penalty = 0;
  if (winner === -1) { s.chips[0] += s.contrib[0]; s.chips[1] += s.contrib[1]; }
  else {
    s.chips[winner] += pot;
    if (reason === 'fold' && s.cards[1 - winner] === 10) {
      penalty = Math.min(10, s.chips[1 - winner]);
      s.chips[1 - winner] -= penalty;
      s.chips[winner] += penalty;
    }
  }
  s.last = { round: s.round, cards: s.cards.slice(), winner, reason, pot, penalty };
  s.log.push(s.last);
  startRound(s);
}

module.exports = {
  id: 'indian',
  name: '인디언 포커',
  init() {
    const s = { deck: newDeck(), chips: [START_CHIPS, START_CHIPS], round: 0, starter: coin(), last: null, log: [], over: null };
    startRound(s);
    return s;
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (s.toAct !== i) return '상대 차례예요.';
    const o = 1 - i;
    const need = s.contrib[o] - s.contrib[i];
    if (a.type === 'fold') { endRound(s, o, 'fold'); return null; }
    if (a.type === 'call') {
      const pay = Math.min(need, s.chips[i]);
      s.chips[i] -= pay; s.contrib[i] += pay;
      if (pay < need) { // 올인으로 다 못 맞춘 경우, 상대 초과분 돌려줌
        const back = s.contrib[o] - s.contrib[i];
        s.contrib[o] -= back; s.chips[o] += back;
      }
      s.acted[i] = true;
      if (need > 0 || s.acted[o]) {
        const w = s.cards[0] > s.cards[1] ? 0 : s.cards[1] > s.cards[0] ? 1 : -1;
        endRound(s, w, 'showdown');
      } else s.toAct = o; // 체크
      return null;
    }
    if (a.type === 'raise') {
      const x = Number(a.amount);
      const maxRaise = Math.min(s.chips[i] - need, s.chips[o]);
      if (maxRaise < 1) return '더 올릴 수 있는 칩이 없어요.';
      if (!isInt(x) || x < 1 || x > maxRaise) return `1부터 ${maxRaise} 사이로 올릴 수 있어요.`;
      const pay = need + x;
      s.chips[i] -= pay; s.contrib[i] += pay;
      s.acted[i] = true;
      s.toAct = o;
      return null;
    }
    return '알 수 없는 행동이에요.';
  },
  view(s, i) {
    const o = 1 - i;
    const need = s.over ? 0 : s.contrib[o] - s.contrib[i];
    return {
      round: s.round,
      oppCard: s.over ? null : s.cards[o],
      myChips: s.chips[i], oppChips: s.chips[o],
      myBet: s.contrib[i], oppBet: s.contrib[o],
      pot: s.contrib[0] + s.contrib[1],
      myTurn: !s.over && s.toAct === i,
      need,
      maxRaise: Math.max(0, Math.min(s.chips[i] - need, s.chips[o])),
      deckLeft: s.deck.length,
      reshuffled: s.reshuffled,
      last: s.last && {
        round: s.last.round, myCard: s.last.cards[i], oppCard: s.last.cards[o],
        result: s.last.winner === -1 ? 'draw' : s.last.winner === i ? 'win' : 'lose',
        reason: s.last.reason, pot: s.last.pot, penalty: s.last.penalty,
        folder: s.last.reason === 'fold' ? (s.last.winner === i ? 'opp' : 'me') : null,
      },
      over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

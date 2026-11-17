// 인디언 포커 (기본) / 이마 포커 (심화)
// 심화: 조커 1장 추가(총 21장). 조커는 모든 카드를 이기지만 1에게만 진다.
const { shuffle, coin, isInt } = require('./util');

const START_CHIPS = 30;
const TURN_MS = 30000;
const JOKER = 99;

function make(plus) {
  const newDeck = () => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...(plus ? [JOKER] : [])]);
  // a가 이기면 1, 지면 -1, 같으면 0
  const cmp = (a, b) => {
    if (a === b) return 0;
    if (a === JOKER) return b === 1 ? -1 : 1;
    if (b === JOKER) return a === 1 ? 1 : -1;
    return a > b ? 1 : -1;
  };

  function startRound(s) {
    if (s.chips[0] <= 0 || s.chips[1] <= 0) { s.over = { winner: s.chips[0] > 0 ? 0 : 1 }; s.deadline = null; return; }
    if (s.deck.length < 2) { s.deck = newDeck(); s.reshuffled = true; } else s.reshuffled = false;
    s.round++;
    s.cards = [s.deck.pop(), s.deck.pop()];
    s.contrib = [1, 1];
    s.chips[0]--; s.chips[1]--;
    s.starter = s.round === 1 ? s.starter : 1 - s.starter;
    s.toAct = s.starter;
    s.acted = [false, false];
    s.actions = [];
    s.deadline = Date.now() + TURN_MS;
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
    s.last = { round: s.round, cards: s.cards.slice(), winner, reason, pot, penalty, actions: s.actions.slice() };
    s.log.push(s.last);
    startRound(s);
  }

  function act(s, i, a) {
    const o = 1 - i;
    const need = s.contrib[o] - s.contrib[i];
    if (a.type === 'fold') { s.actions.push({ who: i, type: 'fold', timeout: !!a.timeout }); endRound(s, o, 'fold'); return null; }
    if (a.type === 'call') {
      const pay = Math.min(need, s.chips[i]);
      s.chips[i] -= pay; s.contrib[i] += pay;
      if (pay < need) { const back = s.contrib[o] - s.contrib[i]; s.contrib[o] -= back; s.chips[o] += back; }
      s.acted[i] = true;
      s.actions.push({ who: i, type: need > 0 ? 'call' : 'check', amount: pay, timeout: !!a.timeout });
      if (need > 0 || s.acted[o]) {
        const c = cmp(s.cards[0], s.cards[1]);
        endRound(s, c > 0 ? 0 : c < 0 ? 1 : -1, 'showdown');
      } else { s.toAct = o; s.deadline = Date.now() + TURN_MS; }
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
      s.actions.push({ who: i, type: 'raise', amount: x, paid: pay });
      s.toAct = o;
      s.deadline = Date.now() + TURN_MS;
      return null;
    }
    return '알 수 없는 행동이에요.';
  }

  return {
    id: plus ? 'indian_plus' : 'indian',
    name: plus ? '이마 포커' : '인디언 포커',
    TURN_MS, cmp,
    init() {
      const s = { deck: newDeck(), chips: [START_CHIPS, START_CHIPS], round: 0, starter: coin(), last: null, log: [], over: null };
      startRound(s);
      return s;
    },
    action(s, i, a) {
      if (s.over) return '게임이 끝났어요.';
      if (s.toAct !== i) return '상대 차례예요.';
      return act(s, i, a);
    },
    timeout(s) {
      if (s.over) return;
      const i = s.toAct, need = s.contrib[1 - i] - s.contrib[i];
      act(s, i, { type: need > 0 ? 'fold' : 'call', timeout: true });
    },
    view(s, i) {
      const o = 1 - i;
      const need = s.over ? 0 : s.contrib[o] - s.contrib[i];
      const mapAct = a => ({ ...a, mine: a.who === i });
      const mapRound = r => ({
        round: r.round, myCard: r.cards[i], oppCard: r.cards[o],
        result: r.winner === -1 ? 'draw' : r.winner === i ? 'win' : 'lose',
        reason: r.reason, pot: r.pot, penalty: r.penalty,
        folder: r.reason === 'fold' ? (r.winner === i ? 'opp' : 'me') : null,
        actions: r.actions.map(mapAct),
      });
      return {
        plus,
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
        actions: s.over ? [] : s.actions.map(mapAct),
        deadline: s.over ? null : s.deadline,
        last: s.last && mapRound(s.last),
        history: s.log.slice(-30).map(mapRound),
        over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
      };
    },
  };
}

module.exports = [make(false), make(true)];

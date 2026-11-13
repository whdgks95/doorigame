// 미스터리 넘버 (피의 게임2, 다빈치 코드 방식)
const { shuffle, coin } = require('./util');

const order = t => t.n * 2 + (t.c === 'B' ? 0 : 1); // 같은 숫자면 검정이 왼쪽
function insert(hand, tile) {
  let k = 0;
  while (k < hand.length && order(hand[k]) < order(tile)) k++;
  hand.splice(k, 0, tile);
  return k;
}
const allRevealed = h => h.every(t => t.revealed);

function startTurn(s) {
  s.pending = s.pile.length ? s.pile.pop() : null;
  s.phase = 'guess';
}

module.exports = {
  id: 'davinci',
  name: '미스터리 넘버',
  init() {
    const pile = [];
    for (let n = 0; n <= 11; n++) { pile.push({ n, c: 'B' }); pile.push({ n, c: 'W' }); }
    shuffle(pile);
    const hands = [[], []];
    for (let k = 0; k < 4; k++) for (const h of hands) insert(h, { ...pile.pop(), revealed: false });
    const s = { pile, hands, turn: coin(), pending: null, phase: 'guess', log: [], over: null };
    startTurn(s);
    return s;
  },
  action(s, i, a) {
    if (s.over) return '게임이 끝났어요.';
    if (s.turn !== i) return '상대 차례예요.';
    const me = s.hands[i], opp = s.hands[1 - i];
    const endTurn = () => { s.turn = 1 - i; startTurn(s); };

    if (a.type === 'guess') {
      if (s.phase !== 'guess' && s.phase !== 'continue') return '지금은 추리할 수 없어요.';
      const idx = Number(a.idx), n = Number(a.n);
      if (!Number.isInteger(idx) || !opp[idx] || opp[idx].revealed) return '공개되지 않은 상대 타일을 골라야 해요.';
      if (!Number.isInteger(n) || n < 0 || n > 11) return '0~11 중에서 골라야 해요.';
      const ok = opp[idx].n === n;
      s.log.push({ who: i, idx, n, c: opp[idx].c, ok });
      if (ok) {
        opp[idx].revealed = true;
        if (allRevealed(opp)) { if (s.pending) insert(me, { ...s.pending, revealed: false }); s.pending = null; s.over = { winner: i }; return null; }
        s.phase = 'continue';
        return null;
      }
      // 틀림
      if (s.pending) {
        const pos = insert(me, { ...s.pending, revealed: true });
        s.log[s.log.length - 1].penaltyPos = pos;
        s.pending = null;
        if (allRevealed(me)) { s.over = { winner: 1 - i }; return null; }
        endTurn();
      } else {
        s.phase = 'penalty'; // 더미가 없으면 내 타일 하나를 직접 공개
      }
      return null;
    }
    if (a.type === 'stop') {
      if (s.phase !== 'continue') return '지금은 멈출 수 없어요.';
      if (s.pending) insert(me, { ...s.pending, revealed: false });
      s.pending = null;
      endTurn();
      return null;
    }
    if (a.type === 'reveal') {
      if (s.phase !== 'penalty') return '지금은 공개할 필요가 없어요.';
      const idx = Number(a.idx);
      if (!me[idx] || me[idx].revealed) return '내 비공개 타일을 골라야 해요.';
      me[idx].revealed = true;
      if (allRevealed(me)) { s.over = { winner: 1 - i }; return null; }
      endTurn();
      return null;
    }
    return '알 수 없는 행동이에요.';
  },
  view(s, i) {
    const o = 1 - i;
    const showAll = !!s.over;
    return {
      myHand: s.hands[i].map(t => ({ n: t.n, c: t.c, revealed: t.revealed })),
      oppHand: s.hands[o].map(t => (t.revealed || showAll ? { n: t.n, c: t.c, revealed: t.revealed } : { c: t.c, revealed: false })),
      myTurn: !s.over && s.turn === i,
      pending: s.turn === i ? s.pending : null,
      oppHasPending: s.turn === o && !!s.pending,
      oppPendingColor: s.turn === o && s.pending ? s.pending.c : null,
      phase: s.phase,
      pile: s.pile.length,
      log: s.log.slice(-12).map(l => ({ mine: l.who === i, idx: l.idx, n: l.n, c: l.c, ok: l.ok })),
      over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
    };
  },
};

// 미스터리 넘버 (기본, 다빈치 코드 방식) / 숫자 금고 (심화)
// 심화: 숫자 0~9(검정·흰색) + 조커 2장. 조커는 줄의 아무 위치에 들어가며 'J'로 맞혀야 함.
//       한 턴에 3번 이상 맞히고 멈추면 한 턴을 더 함.
const { shuffle, coin, rint } = require('./util');

const order = t => t.n * 2 + (t.c === 'B' ? 0 : 1); // 같은 숫자면 검정이 왼쪽
function insert(hand, tile) {
  if (tile.joker) { const k = rint(0, hand.length); hand.splice(k, 0, tile); return k; }
  let k = 0;
  while (k < hand.length && (hand[k].joker || order(hand[k]) < order(tile))) k++;
  // 바로 앞이 조커들이고 그 앞 숫자가 더 크면 조커 앞으로 (정렬 유지)
  hand.splice(k, 0, tile);
  return k;
}
const allRevealed = h => h.every(t => t.revealed);

function make(plus) {
  const MAXN = plus ? 9 : 11;
  function startTurn(s) {
    s.pending = s.pile.length ? s.pile.pop() : null;
    s.phase = 'guess';
    s.streak = 0;
  }
  return {
    id: plus ? 'davinci_plus' : 'davinci',
    name: plus ? '숫자 금고' : '미스터리 넘버',
    insert,
    init() {
      const pile = [];
      for (let n = 0; n <= MAXN; n++) { pile.push({ n, c: 'B' }); pile.push({ n, c: 'W' }); }
      if (plus) { pile.push({ n: -1, c: 'B', joker: true }); pile.push({ n: -1, c: 'W', joker: true }); }
      shuffle(pile);
      const hands = [[], []];
      for (let k = 0; k < 4; k++) for (const h of hands) insert(h, { ...pile.pop(), revealed: false });
      const s = { pile, hands, turn: coin(), pending: null, phase: 'guess', streak: 0, log: [], over: null };
      startTurn(s);
      return s;
    },
    action(s, i, a) {
      if (s.over) return '게임이 끝났어요.';
      if (s.turn !== i) return '상대 차례예요.';
      const me = s.hands[i], opp = s.hands[1 - i];
      const endTurn = (bonus) => {
        if (bonus) { s.log.push({ who: i, bonus: true }); startTurn(s); return; }
        s.turn = 1 - i; startTurn(s);
      };
      if (a.type === 'guess') {
        if (s.phase !== 'guess' && s.phase !== 'continue') return '지금은 추리할 수 없어요.';
        const idx = Number(a.idx);
        const isJ = plus && a.n === 'J';
        const n = isJ ? 'J' : Number(a.n);
        if (!Number.isInteger(idx) || !opp[idx] || opp[idx].revealed) return '공개되지 않은 상대 타일을 골라야 해요.';
        if (!isJ && (!Number.isInteger(n) || n < 0 || n > MAXN)) return `0~${MAXN} 중에서 골라야 해요.`;
        const t = opp[idx];
        const ok = isJ ? !!t.joker : (!t.joker && t.n === n);
        s.log.push({ who: i, idx, n, c: t.c, ok });
        if (ok) {
          t.revealed = true;
          s.streak++;
          if (allRevealed(opp)) { if (s.pending) insert(me, { ...s.pending, revealed: false }); s.pending = null; s.over = { winner: i }; return null; }
          s.phase = 'continue';
          return null;
        }
        if (s.pending) {
          insert(me, { ...s.pending, revealed: true });
          s.pending = null;
          if (allRevealed(me)) { s.over = { winner: 1 - i }; return null; }
          endTurn(false);
        } else s.phase = 'penalty';
        return null;
      }
      if (a.type === 'stop') {
        if (s.phase !== 'continue') return '지금은 멈출 수 없어요.';
        if (s.pending) insert(me, { ...s.pending, revealed: false });
        s.pending = null;
        endTurn(plus && s.streak >= 3);
        return null;
      }
      if (a.type === 'reveal') {
        if (s.phase !== 'penalty') return '지금은 공개할 필요가 없어요.';
        const idx = Number(a.idx);
        if (!me[idx] || me[idx].revealed) return '내 비공개 타일을 골라야 해요.';
        me[idx].revealed = true;
        if (allRevealed(me)) { s.over = { winner: 1 - i }; return null; }
        endTurn(false);
        return null;
      }
      return '알 수 없는 행동이에요.';
    },
    view(s, i) {
      const o = 1 - i;
      const showAll = !!s.over;
      const pub = t => ({ n: t.joker ? 'J' : t.n, c: t.c, revealed: t.revealed, joker: !!t.joker });
      return {
        plus, maxN: MAXN,
        myHand: s.hands[i].map(pub),
        oppHand: s.hands[o].map(t => (t.revealed || showAll ? pub(t) : { c: t.c, revealed: false })),
        myTurn: !s.over && s.turn === i,
        pending: s.turn === i && s.pending ? pub(s.pending) : null,
        oppHasPending: s.turn === o && !!s.pending,
        oppPendingColor: s.turn === o && s.pending ? s.pending.c : null,
        phase: s.phase, streak: s.turn === i ? s.streak : 0,
        pile: s.pile.length,
        log: s.log.slice(-40).map(l => ({ mine: l.who === i, idx: l.idx, n: l.n, c: l.c, ok: l.ok, bonus: !!l.bonus })),
        over: s.over && { result: s.over.winner === i ? 'win' : 'lose' },
      };
    },
  };
}

module.exports = [make(false), make(true)];

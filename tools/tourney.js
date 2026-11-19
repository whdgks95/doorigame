// 봇 vs 봇 대전: 두 봇의 계획 중 delay가 짧은 쪽이 먼저 행동(실시간 게임 반영)
const games = require('../games');
const bots = require(process.env.BOTS || '../games/bots');
const [,, gid, la, lb, nArg] = process.argv;
const N = Number(nArg || 30);
function play(gid, lv) {
  const g = games[gid]; const s = g.init(); const mem = [{}, {}];
  for (let step = 0; step < 4000 && !s.over; step++) {
    const plans = [0, 1].map(i => bots.plan(gid, g.view(s, i), lv[i], mem[i], g));
    let who = -1;
    if (plans[0] && plans[1]) who = plans[0].delay <= plans[1].delay ? 0 : 1;
    else if (plans[0]) who = 0; else if (plans[1]) who = 1;
    if (who < 0) { if (g.timeout) { g.timeout.call(g, s); continue; } break; }
    const err = g.action(s, who, plans[who].action);
    if (err) { if (g.timeout) g.timeout.call(g, s); }
  }
  return s.over ? s.over.winner : -2;
}
let w = [0, 0, 0], unfinished = 0;
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  // 자리 바꿔가며
  const swap = k % 2 === 1;
  const r = play(gid, swap ? [lb, la] : [la, lb]);
  if (r === -2) { unfinished++; continue; }
  if (r === -1) w[2]++;
  else w[(r === 0) !== swap ? 0 : 1]++;
}
console.log(`${gid.padEnd(17)} ${la} vs ${lb}: ${w[0]}승 ${w[1]}패 ${w[2]}무${unfinished ? ' 미완료 ' + unfinished : ''}  (${((Date.now() - t0) / N / 1000).toFixed(2)}s/판)`);

// 관리자 전용 통계 (서버 메모리에 저장 → 서버가 재시작/절전하면 초기화됨)
// 오래 쌓이는 방문자 통계는 구글 애널리틱스(GA4)에서 보세요.
const startedAt = Date.now();
const KST = 9 * 60 * 60 * 1000;
const dayKey = (t = Date.now()) => new Date(t + KST).toISOString().slice(0, 10); // 한국 날짜

const days = new Map(); // 날짜 → 그날 통계
function today() {
  const k = dayKey();
  if (!days.has(k)) {
    days.set(k, { date: k, pageViews: 0, homeViews: 0, roomViews: 0, players: new Set(), roomsCreated: 0, botRooms: 0, gamesStarted: 0, gamesFinished: 0, byGame: {}, byLevel: {} });
    // 최근 14일만 보관
    const keys = [...days.keys()].sort();
    while (keys.length > 14) days.delete(keys.shift());
  }
  return days.get(k);
}
const bump = (obj, key, field) => { obj[key] = obj[key] || { rooms: 0, started: 0, finished: 0 }; obj[key][field]++; };

module.exports = {
  pageView(kind) { const d = today(); d.pageViews++; if (kind === 'home') d.homeViews++; else d.roomViews++; },
  playerJoined(token) { today().players.add(token); },
  roomCreated(gameId, botLevel) {
    const d = today(); d.roomsCreated++; bump(d.byGame, gameId, 'rooms');
    if (botLevel) { d.botRooms++; d.byLevel[botLevel] = (d.byLevel[botLevel] || 0) + 1; }
  },
  gameStarted(gameId) { const d = today(); d.gamesStarted++; bump(d.byGame, gameId, 'started'); },
  gameFinished(gameId) { const d = today(); d.gamesFinished++; bump(d.byGame, gameId, 'finished'); },
  snapshot(live) {
    return {
      serverStartedAt: new Date(startedAt).toISOString(),
      uptimeMinutes: Math.round((Date.now() - startedAt) / 60000),
      live,
      days: [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).map(d => ({ ...d, players: d.players.size })),
    };
  },
};

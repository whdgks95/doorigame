// 두리게임 (doorigame) - 둘이 하는 두뇌 게임 서버
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const games = require('./games');
const bots = require('./games/bots');
const stats = require('./stats');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 아무도 없는 방은 6시간 뒤 정리

const app = express();
app.use(express.json());
// ── 방문자 분석(GA4): 환경 변수 GA_ID(G-로 시작)가 있을 때만 페이지에 코드 삽입. 통계는 GA 대시보드(본인 계정)에서만 보임
const GA_ID = (process.env.GA_ID || '').trim();
const gaSnippet = /^G-[A-Z0-9]+$/i.test(GA_ID)
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`
  : '';
const htmlCache = {};
function sendPage(res, file) {
  if (!htmlCache[file]) htmlCache[file] = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  res.type('html').send(htmlCache[file].replace('<!--ANALYTICS-->', gaSnippet));
}

// ── 관리자 통계 페이지: /admin (환경 변수 ADMIN_PASSWORD를 설정해야 열림. 설정 안 하면 404)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const failed = new Map(); // IP별 로그인 실패 (무차별 대입 방지)
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(404).send('Not found');
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const f = failed.get(ip) || { n: 0, until: 0 };
  if (Date.now() < f.until) return res.status(429).send('잠시 후 다시 시도하세요.');
  const [type, b64] = (req.headers.authorization || '').split(' ');
  const pass = type === 'Basic' && b64 ? Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':') : '';
  const a = Buffer.from(pass), b = Buffer.from(ADMIN_PASSWORD);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) { failed.delete(ip); res.set('X-Robots-Tag', 'noindex'); return next(); }
  if (pass) { f.n++; if (f.n >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.n = 0; } failed.set(ip, f); }
  res.set('WWW-Authenticate', 'Basic realm="doorigame-admin", charset="UTF-8"').status(401).send('관리자 비밀번호가 필요해요.');
}
function liveStats() {
  const list = [...rooms.values()];
  const humansOnline = list.reduce((n, r) => n + r.players.filter(p => p.socketId && !p.bot).length, 0);
  const byGame = {};
  for (const r of list) if (r.status === 'playing' && r.players.some(p => p.socketId && !p.bot)) byGame[r.gameId] = (byGame[r.gameId] || 0) + 1;
  return {
    connections: io.engine.clientsCount,
    playersInRooms: humansOnline,
    roomsPlaying: list.filter(r => r.status === 'playing').length,
    roomsWaiting: list.filter(r => r.status === 'waiting').length,
    botRoomsPlaying: list.filter(r => r.status === 'playing' && r.bot).length,
    playingByGame: byGame,
  };
}
app.get('/admin/stats.json', adminAuth, (req, res) => res.json(stats.snapshot(liveStats())));
app.get('/admin', adminAuth, (req, res) => {
  const s = stats.snapshot(liveStats());
  const L = s.live;
  const NAMES = Object.fromEntries(Object.values(games).map(g => [g.id, g.name + (g.id.endsWith('_plus') ? ' (심화)' : '')]));
  const LV = { easy: '이지', medium: '미디움', hard: '하드', insane: '인세인', ai: 'AI' };
  const esc = x => String(x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const dayRows = s.days.map(d => `<tr><td>${d.date}</td><td>${d.pageViews}</td><td>${d.players}</td><td>${d.roomsCreated}</td><td>${d.botRooms}</td><td>${d.gamesStarted}</td><td>${d.gamesFinished}</td></tr>`).join('');
  const t = s.days[0];
  const gameRows = t ? Object.entries(t.byGame).sort((a, b) => b[1].started - a[1].started).map(([k, v]) => `<tr><td>${esc(NAMES[k] || k)}</td><td>${v.rooms}</td><td>${v.started}</td><td>${v.finished}</td></tr>`).join('') : '';
  const lvRows = t ? Object.entries(t.byLevel).map(([k, v]) => `<span class="pill">${LV[k] || k} ${v}</span>`).join(' ') : '';
  const live = Object.entries(L.playingByGame).map(([k, v]) => `<span class="pill">${esc(NAMES[k] || k)} ${v}</span>`).join(' ') || '<span class="muted">없음</span>';
  res.type('html').send(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="15"><title>두리게임 관리자 통계</title>
<style>body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#0f1117;color:#e8eaf0;margin:0;padding:20px;max-width:900px;margin:auto}
h1{font-size:22px}h2{font-size:16px;margin-top:28px;color:#f5b942}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{background:#181b24;border:1px solid #2c3140;border-radius:12px;padding:14px}.card b{display:block;font-size:30px}.card span{color:#8b92a5;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #2c3140;padding:7px;text-align:center}th{color:#8b92a5;font-weight:500}td:first-child,th:first-child{text-align:left}
.pill{display:inline-block;background:#20242f;border-radius:99px;padding:4px 10px;margin:2px;font-size:13px}.muted{color:#8b92a5;font-size:13px}</style></head><body>
<h1>📊 두리게임 관리자 통계</h1>
<p class="muted">15초마다 새로고침 · 서버 켜진 지 ${s.uptimeMinutes}분 · 서버가 재시작/절전하면 아래 숫자는 초기화돼요 (누적 방문자는 GA4에서 확인)</p>
<h2>지금</h2>
<div class="cards">
<div class="card"><b>${L.playersInRooms}</b><span>게임방에 있는 사람</span></div>
<div class="card"><b>${L.connections}</b><span>사이트 접속 연결 수</span></div>
<div class="card"><b>${L.roomsPlaying}</b><span>진행 중인 방 (컴퓨터 ${L.botRoomsPlaying})</span></div>
<div class="card"><b>${L.roomsWaiting}</b><span>상대 기다리는 방</span></div>
</div>
<p>진행 중인 게임: ${live}</p>
<h2>날짜별 (한국 시간)</h2>
<table><tr><th>날짜</th><th>페이지뷰</th><th>플레이어(명)</th><th>방 생성</th><th>컴퓨터 방</th><th>게임 시작</th><th>끝까지 한 판</th></tr>${dayRows || '<tr><td colspan="7" class="muted">아직 기록이 없어요</td></tr>'}</table>
<h2>오늘 게임별</h2>
<table><tr><th>게임</th><th>방 생성</th><th>시작</th><th>완료</th></tr>${gameRows || '<tr><td colspan="4" class="muted">아직 없어요</td></tr>'}</table>
<h2>오늘 고른 컴퓨터 난이도</h2><p>${lvRows || '<span class="muted">아직 없어요</span>'}</p>
</body></html>`);
});

app.get(['/', '/index.html'], (req, res) => { stats.pageView('home'); sendPage(res, 'index.html'); });
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, any>} */
const rooms = new Map();

function newRoomId() {
  let id;
  do { id = crypto.randomBytes(4).toString('hex'); } while (rooms.has(id));
  return id;
}

app.post('/api/rooms', (req, res) => {
  const game = games[req.body && req.body.gameId];
  if (!game) return res.status(400).json({ error: 'unknown_game' });
  const level = req.body && req.body.bot;
  if (level && !bots.LEVELS.includes(level)) return res.status(400).json({ error: 'unknown_level' });
  const id = newRoomId();
  rooms.set(id, {
    id, gameId: game.id, players: [], state: null,
    status: 'waiting', rematch: [false, false], lastActive: Date.now(),
    // 컴퓨터 대전: 사람이 0번, 컴퓨터가 1번 자리
    bot: level ? { level, index: 1, mem: {}, errors: 0, name: `🤖 ${bots.LEVEL_NAMES[level]}` } : null,
  });
  stats.roomCreated(game.id, level);
  res.json({ roomId: id });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  res.json({ gameId: room.gameId, players: room.players.length });
});

app.get('/r/:id', (req, res) => { stats.pageView('room'); sendPage(res, 'room.html'); });

function startGame(room) {
  if (room.bot) { clearTimeout(room.botTimer); room.botTimer = null; room.bot.mem = {}; room.bot.errors = 0; }
  room.state = games[room.gameId].init();
  room.status = 'playing';
  room.countedOver = false;
  stats.gameStarted(room.gameId);
  room.rematch = [false, false];
  schedule(room);
}

// 턴 제한 시간: 게임 상태에 deadline이 있으면 시간이 지났을 때 game.timeout()으로 자동 진행
function schedule(room) {
  clearTimeout(room.timer);
  const game = games[room.gameId];
  if (room.status !== 'playing' || !game.timeout || !room.state || !room.state.deadline) return;
  const deadline = room.state.deadline;
  room.timer = setTimeout(() => {
    if (room.status !== 'playing' || room.state.deadline !== deadline) return;
    try { game.timeout(room.state); } catch (e) { console.error(e); return; }
    if (room.state.over) room.status = 'over';
    broadcast(room);
    schedule(room);
  }, Math.max(0, deadline - Date.now()) + 300);
}

// 컴퓨터 플레이어: 할 일이 있으면 '생각하는 시간' 뒤에 최신 상태로 다시 판단해서 행동
function botTick(room) {
  if (!room.bot || room.status !== 'playing' || room.botTimer) return;
  const game = games[room.gameId], B = room.bot.index;
  let p;
  try { p = bots.plan(room.gameId, game.view(room.state, B), room.bot.level, room.bot.mem, game); }
  catch (e) { console.error('bot plan error', e); return; }
  if (!p) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!rooms.has(room.id) || room.status !== 'playing') return;
    let p2;
    try { p2 = bots.plan(room.gameId, game.view(room.state, B), room.bot.level, room.bot.mem, game); }
    catch (e) { console.error('bot plan error', e); return; }
    if (p2) {
      let err;
      try { err = game.action(room.state, B, p2.action); } catch (e) { console.error(e); err = 'error'; }
      if (err) { if (++room.bot.errors > 20) return; }
      else room.bot.errors = 0;
      if (room.state.over) room.status = 'over';
      room.lastActive = Date.now();
      broadcast(room);
      schedule(room);
      if (!err) return;
    }
    botTick(room);
  }, Math.max(200, p.delay));
}

function broadcast(room) {
  if (room.status === 'over' && !room.countedOver) { room.countedOver = true; stats.gameFinished(room.gameId); }
  if (room.bot && room.status === 'over') room.rematch[room.bot.index] = true; // 컴퓨터는 항상 다시 하기 OK
  setImmediate(() => botTick(room));
  const game = games[room.gameId];
  room.players.forEach((p, i) => {
    if (!p.socketId) return;
    const sock = io.sockets.sockets.get(p.socketId);
    if (!sock) return;
    sock.emit('state', {
      room: {
        id: room.id,
        gameId: room.gameId,
        status: room.status,
        you: i,
        players: room.players.map(q => ({ name: q.name, online: !!q.socketId, bot: !!q.bot })),
        rematch: room.rematch,
        serverNow: Date.now(),
      },
      view: room.state ? game.view(room.state, i) : null,
    });
  });
}

io.on('connection', socket => {
  socket.on('join', (msg, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const { roomId, token } = msg || {};
    const room = rooms.get(roomId);
    if (!room) return ack({ error: 'not_found' });
    if (typeof token !== 'string' || token.length < 8 || token.length > 64) return ack({ error: 'bad_token' });
    const name = String((msg && msg.name) || '').trim().slice(0, 12) || '플레이어';

    let idx = room.players.findIndex(p => p.token === token);
    if (idx === -1) {
      const humanSeats = room.bot ? 1 : 2;
      if (room.players.filter(p => !p.bot).length >= humanSeats) return ack({ error: 'full' });
      room.players.push({ token, name, socketId: null });
      idx = room.players.length - 1;
      if (room.bot && !room.players.some(p => p.bot)) room.players.push({ token: 'BOT', name: room.bot.name, socketId: 'BOT', bot: true });
    }
    const player = room.players[idx];
    // 같은 사람이 다른 탭에서 다시 들어오면 이전 탭은 내보냄
    if (player.socketId && player.socketId !== socket.id) {
      const old = io.sockets.sockets.get(player.socketId);
      if (old) { old.emit('kicked'); old.leave(room.id); old.data = {}; }
    }
    player.socketId = socket.id;
    player.name = name;
    stats.playerJoined(token);
    socket.data = { roomId, idx };
    socket.join(roomId);
    room.lastActive = Date.now();

    if (room.players.length === 2 && room.status === 'waiting') startGame(room);
    ack({ ok: true, you: idx });
    broadcast(room);
  });

  socket.on('action', (action, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const { roomId, idx } = socket.data || {};
    const room = rooms.get(roomId);
    if (!room || idx === undefined) return ack({ error: '방에 들어와 있지 않아요.' });
    if (room.status !== 'playing') return ack({ error: '진행 중인 게임이 없어요.' });
    const game = games[room.gameId];
    let err;
    try { err = game.action(room.state, idx, action || {}); }
    catch (e) { console.error(e); err = '처리 중 오류가 났어요.'; }
    if (err) return ack({ error: err });
    if (room.state.over) room.status = 'over';
    room.lastActive = Date.now();
    schedule(room);
    ack({ ok: true });
    broadcast(room);
  });

  socket.on('rematch', () => {
    const { roomId, idx } = socket.data || {};
    const room = rooms.get(roomId);
    if (!room || idx === undefined || room.status !== 'over') return;
    room.rematch[idx] = true;
    if (room.rematch[0] && room.rematch[1]) startGame(room);
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const { roomId, idx } = socket.data || {};
    const room = rooms.get(roomId);
    if (!room || idx === undefined) return;
    const p = room.players[idx];
    if (p && p.socketId === socket.id) p.socketId = null;
    room.lastActive = Date.now();
    broadcast(room);
  });
});

// 오래 비어 있는 방 정리
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const anyoneOnline = room.players.some(p => p.socketId && !p.bot);
    if (!anyoneOnline && now - room.lastActive > ROOM_TTL_MS) { clearTimeout(room.timer); clearTimeout(room.botTimer); rooms.delete(id); }
  }
}, 10 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`두리게임 서버 실행 중: http://localhost:${PORT}`));
}

module.exports = { server, rooms };

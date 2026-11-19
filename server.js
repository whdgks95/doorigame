// 두리게임 (doorigame) - 둘이 하는 두뇌 게임 서버
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const games = require('./games');
const bots = require('./games/bots');

const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 아무도 없는 방은 6시간 뒤 정리

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  res.json({ roomId: id });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  res.json({ gameId: room.gameId, players: room.players.length });
});

app.get('/r/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

function startGame(room) {
  if (room.bot) { clearTimeout(room.botTimer); room.botTimer = null; room.bot.mem = {}; room.bot.errors = 0; }
  room.state = games[room.gameId].init();
  room.status = 'playing';
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

(function () {
  const app = document.getElementById('app');
  const roomId = location.pathname.split('/').filter(Boolean)[1];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  let token = store.get('doori_token');
  if (!token) { token = randomToken(); store.set('doori_token', token); }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.esc = esc;

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hide');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hide'), 2500);
  }

  function centerMsg(emoji, title, text) {
    app.innerHTML = `<div class="center-msg"><div class="emoji">${emoji}</div><h2>${title}</h2><p class="muted">${text}</p><p><a href="/"><button class="primary">홈으로</button></a></p></div>`;
  }

  if (!roomId) return centerMsg('🤔', '방 주소가 올바르지 않아요', '홈에서 방을 새로 만들어 주세요.');

  const socket = io();
  let state = null;
  let joined = false;
  let stopped = false;

  function join() {
    socket.emit('join', { roomId, token, name: store.get('doori_name') || '' }, res => {
      if (res.error === 'not_found') { stopped = true; socket.disconnect(); return centerMsg('🔍', '방을 찾을 수 없어요', '방이 사라졌거나 주소가 잘못됐어요. 홈에서 새 방을 만들어 주세요.'); }
      if (res.error === 'full') { stopped = true; socket.disconnect(); return centerMsg('🚪', '방이 가득 찼어요', '이 방은 이미 두 명이 들어와 있어요. (2/2)<br>새 방을 만들어 친구와 대결해 보세요!'); }
      if (res.error) return centerMsg('⚠️', '입장하지 못했어요', esc(res.error));
      if (!joined && !store.get('doori_name')) askName();
      joined = true;
    });
  }
  socket.on('connect', () => { if (!stopped) join(); });
  socket.on('kicked', () => { stopped = true; socket.disconnect(); centerMsg('📑', '다른 창에서 이 방에 들어왔어요', '한 사람은 한 창에서만 플레이할 수 있어요. 이 창은 닫아도 됩니다.'); });
  socket.on('disconnect', () => { if (!stopped && state) toast('연결이 끊겼어요. 다시 연결하는 중...'); });
  socket.on('state', s => {
    state = s;
    if (s.room.serverNow) window.CLOCK_OFFSET = s.room.serverNow - Date.now();
    render();
    tickTimers();
  });

  // 턴 타이머 표시 갱신
  function tickTimers() {
    const now = Date.now() + (window.CLOCK_OFFSET || 0);
    document.querySelectorAll('.turn-timer[data-deadline]').forEach(t => {
      const total = Number(t.dataset.total) || 30000;
      const left = Math.max(0, Number(t.dataset.deadline) - now);
      const sec = Math.ceil(left / 1000);
      const fill = t.querySelector('.tt-fill');
      if (fill) fill.style.width = (100 * left / total).toFixed(1) + '%';
      const label = t.querySelector('.tt-sec');
      if (label) label.textContent = sec + '초';
      t.classList.toggle('warn', sec <= 10 && sec > 5);
      t.classList.toggle('danger', sec <= 5);
    });
  }
  setInterval(tickTimers, 100);

  function askName() {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h2>닉네임을 정해 주세요</h2>
      <p class="muted">상대에게 보이는 이름이에요. (최대 12자)</p>
      <form id="nf" class="row" style="justify-content:flex-start">
        <input id="nn" maxlength="12" placeholder="예) 홍진호" autofocus style="flex:1">
        <button class="primary">확인</button></form></div>`;
    document.body.appendChild(bg);
    const input = bg.querySelector('#nn');
    input.focus();
    bg.querySelector('#nf').onsubmit = e => {
      e.preventDefault();
      const name = input.value.trim().slice(0, 12);
      if (!name) return input.focus();
      store.set('doori_name', name);
      bg.remove();
      socket.emit('join', { roomId, token, name }, () => {});
    };
  }

  function showHelp() {
    const g = GAME_BY_ID[state.room.gameId];
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal"><h2>${g.icon} ${g.name} 플레이 방법</h2><div class="help">${g.help}</div>
      <p style="text-align:right"><button class="primary" id="hc">닫기</button></p></div>`;
    bg.onclick = e => { if (e.target === bg || e.target.id === 'hc') bg.remove(); };
    document.body.appendChild(bg);
  }

  async function copyLink() {
    const url = location.origin + '/r/' + roomId;
    try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요! 친구에게 보내 주세요.'); }
    catch (e) {
      const input = document.getElementById('link');
      input.select(); document.execCommand && document.execCommand('copy');
      toast('링크를 복사했어요!');
    }
  }

  const ctx = {
    send(action) {
      socket.emit('action', action, res => { if (res && res.error) toast(res.error); });
    },
    toast,
  };

  function render() {
    const { room, view } = state;
    const g = GAME_BY_ID[room.gameId];
    document.title = `${g.name} - 두리게임`;
    const me = room.players[room.you], opp = room.players[1 - room.you];
    const chip = (p, isMe) => p
      ? `<div class="pchip ${isMe ? 'me' : ''}"><span class="dot ${p.online ? 'on' : ''}"></span>${esc(p.name)}${isMe ? ' (나)' : ''}</div>`
      : `<div class="pchip"><span class="dot"></span>대기 중...</div>`;

    // 상단 바는 한 번만 만들고 갱신
    if (!document.getElementById('roombar')) {
      app.innerHTML = `
        <div class="roombar" id="roombar">
          <span class="gname">${g.icon} ${g.name}</span>
          <input class="link" id="link" readonly value="${esc(location.origin + '/r/' + roomId)}">
          <button class="primary" id="copy">링크 복사</button>
          <button class="ghost" id="helpBtn">📖 플레이 방법</button>
          <div class="players" id="players"></div>
        </div>
        <main class="stage"><div id="banner"></div><div id="game"></div></main>`;
      document.getElementById('copy').onclick = copyLink;
      document.getElementById('helpBtn').onclick = showHelp;
      document.getElementById('link').onclick = e => e.target.select();
    }
    document.getElementById('players').innerHTML = chip(me, true) + '<span class="vs">VS</span>' + chip(opp, false);

    const banner = document.getElementById('banner');
    const game = document.getElementById('game');

    if (room.status === 'waiting') {
      banner.innerHTML = '';
      game.innerHTML = `<div class="waiting panel"><div class="big">⏳ 상대를 기다리는 중이에요</div>
        <p>위의 <b>링크 복사</b> 버튼을 눌러 친구에게 보내 주세요.<br>친구가 들어오면 바로 게임이 시작됩니다.</p>
        <p><button class="primary" id="copy2">링크 복사</button></p></div>`;
      document.getElementById('copy2').onclick = copyLink;
      return;
    }

    if (room.status === 'over' && view && view.over) {
      const r = view.over.result;
      const label = r === 'win' ? '🏆 승리!' : r === 'lose' ? '😵 패배' : '🤝 무승부';
      const iReady = room.rematch[room.you], oppReady = room.rematch[1 - room.you];
      banner.innerHTML = `<div class="result-banner ${r}"><div class="r">${label}</div>
        ${view.over.reason ? `<div class="muted">${esc(view.over.reason)}</div>` : ''}
        <div class="row" style="margin-top:12px">
          <button class="primary" id="rematch" ${iReady ? 'disabled' : ''}>${iReady ? '상대를 기다리는 중...' : '다시 하기'}</button>
          <a href="/"><button class="ghost">다른 게임 하기</button></a>
        </div>
        ${oppReady && !iReady ? '<div class="small" style="margin-top:8px;color:var(--accent2)">상대가 다시 하기를 원해요!</div>' : ''}
        </div>`;
      const rb = document.getElementById('rematch');
      if (rb) rb.onclick = () => socket.emit('rematch');
    } else banner.innerHTML = '';

    const renderer = window.RENDERERS[room.gameId];
    if (opp && !opp.online && room.status === 'playing') {
      banner.innerHTML = `<div class="panel small" style="text-align:center;color:var(--accent2)">상대의 연결이 끊겼어요. 다시 들어오면 이어서 할 수 있어요.</div>`;
    }
    renderer(game, view, ctx);
  }
})();

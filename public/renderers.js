// 게임별 화면 그리기. 서버에서 받은 view(내 시점 정보)만으로 그립니다.
// 심화 버전(…_plus)은 기본 화면 함수를 같이 쓰고, view.plus 로 차이를 그립니다.
window.RENDERERS = {};
const R = window.RENDERERS;
const statusHtml = (text, mine) => `<div class="status ${mine ? 'my' : ''}">${text}</div>`;
// 턴 타이머 (room.js가 0.1초마다 갱신)
const timerHtml = (deadline, mine, total, label) => deadline
  ? `<div class="turn-timer ${mine ? 'mine' : 'opp'}" data-deadline="${deadline}" data-total="${total}">
      <div class="tt-label">${mine ? '⏱' : '⏳'} ${label}</div><div class="tt-bar"><div class="tt-fill"></div></div><div class="tt-sec"></div></div>`
  : '';
const serverNow = () => Date.now() + (window.CLOCK_OFFSET || 0);
const who = mine => (mine ? '<b class="me-c">나</b>' : '<b class="opp-c">상대</b>');

// ── 기록(로그)
// PC: 화면 아래에 전체 기록 패널. 모바일: 맨 아래 고정 줄에 최근 3줄, 누르면 전체 기록 시트.
window.SHOW_EXTRA = false;
window.toggleExtra = () => {
  window.SHOW_EXTRA = !window.SHOW_EXTRA;
  document.querySelectorAll('.extra').forEach(e => e.classList.toggle('show', window.SHOW_EXTRA));
};
const logHtml = (lines, extra = '', label = '전체 기록') => `
  <div class="logbar" onclick="toggleExtra()">
    ${lines.slice(0, 3).map(l => `<div class="ll">${l}</div>`).join('') || '<div class="ll muted">아직 기록이 없어요</div>'}
    <span class="ll-more">전체 ▲</span>
  </div>
  <div class="extra ${window.SHOW_EXTRA ? 'show' : ''}">
    <div class="extra-head"><b>${label}</b><button type="button" onclick="toggleExtra()">닫기 ✕</button></div>
    <div class="panel feed"><div class="muted small feed-title">기록 (최신순)</div>${lines.map(l => `<div>${l}</div>`).join('') || '<div class="muted">아직 기록이 없어요</div>'}</div>
    ${extra}
  </div>`;
// 나 : 라운드 : 상대 점수판
const scoreBar = (me, center, opp, meCls = 'win', oppCls = 'lose', centerLabel = '라운드') => `
  <div class="panel scorebar"><div class="row" style="justify-content:space-around">
    <div class="sb-cell"><div class="muted small">나</div><div class="score-big ${meCls}">${me}</div></div>
    <div class="sb-cell"><div class="muted small">${centerLabel}</div><div class="score-big">${center}</div></div>
    <div class="sb-cell"><div class="muted small">상대</div><div class="score-big ${oppCls}">${opp}</div></div>
  </div></div>`;
const resultWord = r => (r === 'win' ? '<b class="win">승</b>' : r === 'lose' ? '<b class="lose">패</b>' : '무');
const fmt = n => (Number.isInteger(n) ? n : n.toFixed(1));

/* ───────── 흑과 백 / 그림자 입찰 ───────── */
let bwDraft = '', bwDisguise = '';
R.blackwhite = R.blackwhite_plus = (el, v, ctx) => {
  const lamps = n => `<div class="lamps">${[0, 1, 2, 3, 4].map(k => `<div class="lamp ${k < n ? 'on' : ''}"></div>`).join('')}</div>`;
  const colorOf = n => (v.plus ? (n <= 9 ? '흑' : n <= 29 ? '회' : '백') : (n <= 9 ? '흑' : '백'));
  let st = '';
  if (!v.over) st = v.myTurn
    ? (v.iAmFirst ? '내가 선이에요. 낼 점수를 정하세요.' : '상대가 낸 색을 보고 점수를 정하세요.')
    : (v.iAmFirst ? '상대가 점수를 고르는 중...' : '상대(선)가 점수를 고르는 중...');
  const oppTile = v.oppColor ? `<div class="bw-tile ${v.oppColor}">${v.oppColor}</div>` : `<div class="bw-tile unknown">?</div>`;
  const canDisguise = v.plus && v.myTurn && v.iAmFirst && v.disguiseLeft[0];
  const legend = v.plus ? '0~9 흑 · 10~29 회 · 30+ 백' : '0~9 흑 · 10+ 백';
  const lines = [];
  if (v.oppColor) lines.push(`${who(false)}가 <span class="chip-b ${v.oppColor}"></span> ${v.oppColor} 타일을 냈어요`);
  v.log.slice().reverse().forEach(l => lines.push(`R${l.round} ${l.iWentFirst ? '(내가 선)' : '(상대 선)'}: 나 ${l.myBet}점 <span class="chip-b ${l.myColor}"></span> vs 상대 <span class="chip-b ${l.oppColor}"></span>${l.disguise ? ` · <b style="color:var(--accent2)">${l.disguise === 'me' ? '내' : '상대'} 위장(${l.shown}로 보임)</b>` : ''} → ${resultWord(l.result)}`));
  const table = `<div class="panel"><table class="log">
      <tr><th>R</th><th>선</th><th>내 점수</th><th>내 색</th><th>상대 색</th>${v.reveal ? '<th>상대 점수</th>' : ''}<th>결과</th></tr>
      ${v.log.map((l, k) => `<tr><td>${l.round}</td><td>${l.iWentFirst ? '나' : '상대'}</td><td>${l.myBet}</td>
        <td><span class="chip-b ${l.myColor}"></span></td><td><span class="chip-b ${l.oppColor}"></span>${l.disguise ? ' 🎭' : ''}</td>
        ${v.reveal ? `<td>${v.reveal[k].opp}</td>` : ''}<td>${resultWord(l.result)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">아직 기록이 없어요</td></tr>'}
    </table></div>`;
  el.innerHTML = `
    ${statusHtml(st, v.myTurn)}
    <div class="panel scorebar"><div class="row" style="justify-content:space-around">
      <div style="text-align:center"><div class="muted small">내 남은 점수</div><div class="score-big">${v.myPts}</div>${lamps(v.myLamps)}</div>
      <div style="text-align:center"><div class="muted small">라운드</div><div class="score-big">${v.round}<span class="muted of">/${v.rounds}</span></div>
        <div>나 <b class="win">${v.wins[0]}승</b> : <b class="lose">${v.wins[1]}승</b> 상대</div></div>
      <div style="text-align:center"><div class="muted small">상대 남은 점수</div><div class="score-big">??</div>${lamps(v.oppLamps)}</div>
    </div></div>
    <div class="panel"><div class="row">
      <div style="text-align:center"><div class="muted small" style="margin-bottom:6px">상대가 낸 타일</div>${oppTile}</div>
      ${v.myTurn ? `<form id="bwf" class="bw-form">
        <div class="row" style="gap:8px"><input id="bwi" type="number" min="0" max="${v.myPts}" inputmode="numeric" placeholder="0~${v.myPts}" value="${esc(bwDraft)}" class="bw-input">
        <button class="primary">점수 내기</button></div>
        ${canDisguise ? `<div class="bw-disguise"><span class="small">🎭 위장(1회):</span>
          <select id="bwd"><option value="">안 함</option>${v.colors.map(c => `<option ${bwDisguise === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` : ''}
      </form>` : ''}
    </div>
    <div class="muted small" style="text-align:center;margin-top:6px">${legend}${v.plus ? ` · 위장 토큰: 나 ${v.disguiseLeft[0] ? '○' : '✗'} / 상대 ${v.disguiseLeft[1] ? '○' : '✗'}` : ''}</div></div>
    ${logHtml(lines, table, '라운드 기록')}`;
  const f = document.getElementById('bwf');
  if (f) {
    const inp = document.getElementById('bwi');
    inp.oninput = () => (bwDraft = inp.value);
    const sel = document.getElementById('bwd');
    if (sel) sel.onchange = () => (bwDisguise = sel.value);
    f.onsubmit = e => {
      e.preventDefault();
      const n = Number(inp.value);
      if (inp.value === '' || !Number.isInteger(n) || n < 0 || n > v.myPts) return ctx.toast(`0~${v.myPts} 사이 정수를 입력하세요.`);
      const dis = sel ? sel.value : '';
      if (dis && dis === colorOf(n)) return ctx.toast('위장은 실제와 다른 색으로 골라야 해요.');
      if (!confirm(`${n}점을 낼까요? (${colorOf(n)})${dis ? `\n상대에게는 "${dis}"로 보여요.` : ''}`)) return;
      bwDraft = ''; bwDisguise = '';
      ctx.send({ type: 'bet', amount: n, disguise: dis || undefined });
    };
  }
};

/* ───────── 결! 합! / 삼합 스피드 ───────── */
let ghSel = [], ghBoardKey = '', ghKeysBound = false, ghFlashTimer = null;
const FLASH_MS = 5000;
R.gyulhap = R.gyulhap_plus = (el, v, ctx) => {
  const key = JSON.stringify(v.board) + v.round;
  if (key !== ghBoardKey) { ghSel = []; ghBoardKey = key; }
  const COLORS = ['#e5484d', '#3b82f6', '#f5c518'], BGS = ['#f4f4f4', '#9aa0a6', '#1c1c1c'];
  const gyulWord = v.plus ? '클리어' : '결';
  const shapeSvg = (s, c) => {
    const fill = COLORS[c];
    if (s === 0) return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="${fill}"/></svg>`;
    if (s === 1) return `<svg viewBox="0 0 100 100"><polygon points="50,8 94,90 6,90" fill="${fill}"/></svg>`;
    return `<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="${fill}"/></svg>`;
  };
  const cellsOf = l => l.cells.split('-').join('·');
  const lines = v.log.slice().reverse().map(l => `${who(l.mine)} ${l.kind === 'hap' ? `합! ${cellsOf(l)}` : `${gyulWord}!`}
    → <b class="${l.ok ? 'win' : 'lose'}">${l.delta > 0 ? '+' : ''}${l.delta}</b>${l.combo ? ` <b style="color:var(--accent2)">콤보 ${l.combo}</b>` : ''}${l.reason ? ` <span class="muted">(${l.reason})</span>` : ''} <span class="muted small">R${l.round}</span>`);
  const draw = () => {
    // 방금(5초 이내) 나온 합 칸 표시: 맞으면 초록, 틀리면 빨강 — 나와 상대 모두
    const now = serverNow();
    const recent = v.log.slice().reverse().find(l => l.kind === 'hap' && l.round === v.round && now - l.at < FLASH_MS);
    const flash = recent ? { cells: recent.cells.split('-').map(Number), ok: recent.ok, mine: recent.mine } : null;
    clearTimeout(ghFlashTimer);
    if (recent) ghFlashTimer = setTimeout(() => window.rerender && window.rerender(), FLASH_MS - (now - recent.at) + 50);
    const lastGyul = v.log.slice().reverse().find(l => l.kind === 'gyul' && now - l.at < FLASH_MS);
    el.innerHTML = `
      ${v.over ? '' : statusHtml(`차례 없음! "합"을 먼저 찾아 외치세요.<span class="desk-only"> (숫자키 1~9 선택, Enter = 합)</span>`, true)}
      ${scoreBar(v.scores[0], `${v.round}<span class="muted of">/${v.rounds}</span>`, v.scores[1])}
      ${lastGyul ? `<div class="flash-msg ${lastGyul.ok ? 'ok' : 'bad'}">${lastGyul.mine ? '내가' : '상대가'} ${gyulWord}! → ${lastGyul.ok ? '성공 +3 (새 판)' : '실패 -1'}</div>` : ''}
      <div class="panel">
        <div class="gh-board ${v.plus ? 'wide' : ''}" style="grid-template-columns:repeat(${v.cols},1fr)">${v.board.map((t, k) => {
          const fl = flash && flash.cells.includes(k + 1) ? (flash.ok ? 'flash-ok' : 'flash-bad') : '';
          return `<button class="gh-tile ${ghSel.includes(k + 1) ? 'sel' : ''} ${fl}" data-n="${k + 1}" style="background:${BGS[t.bg]}">
            <span class="num">${k + 1}</span>${shapeSvg(t.shape, t.color)}${fl ? `<span class="who-tag">${flash.mine ? '나' : '상대'}</span>` : ''}</button>`;
        }).join('')}</div>
        <div class="row gh-btns">
          <button class="primary" id="hap" ${ghSel.length === 3 && !v.over ? '' : 'disabled'}>합!</button>
          <button id="gyul" ${v.over ? 'disabled' : ''} style="background:#3b2f8f">${gyulWord}!</button>
          <button class="ghost" id="clr">해제</button>
        </div>
        <div class="claimed-list" style="margin-top:8px">${v.claimed.map(c => `<span>${c.split('-').join('·')}</span>`).join('') || '<span class="muted small" style="background:none">이번 라운드에 나온 합이 여기 쌓여요</span>'}</div>
      </div>
      ${logHtml(lines, '', '합 기록')}`;
    el.querySelectorAll('.gh-tile').forEach(b => (b.onclick = () => toggle(Number(b.dataset.n))));
    document.getElementById('hap').onclick = submitHap;
    document.getElementById('gyul').onclick = () => ctx.send({ type: 'gyul' });
    document.getElementById('clr').onclick = () => { ghSel = []; draw(); };
  };
  const toggle = n => {
    if (v.over) return;
    if (ghSel.includes(n)) ghSel = ghSel.filter(x => x !== n);
    else if (ghSel.length < 3) ghSel.push(n);
    draw();
  };
  const submitHap = () => {
    if (ghSel.length !== 3) return;
    ctx.send({ type: 'hap', cells: ghSel });
    ghSel = [];
    draw();
  };
  R.gyulhap._toggle = toggle; R.gyulhap._submit = submitHap;
  if (!ghKeysBound) {
    ghKeysBound = true;
    document.addEventListener('keydown', e => {
      if (!document.querySelector('.gh-board') || e.target.tagName === 'INPUT') return;
      if (/^[1-9]$/.test(e.key)) R.gyulhap._toggle(Number(e.key));
      else if (e.key === 'Enter') R.gyulhap._submit();
    });
  }
  draw();
};

/* ───────── 인디언 포커 / 이마 포커 ───────── */
let ipDraft = '';
const chipStacks = n => {
  const tens = Math.floor(n / 10), fives = Math.floor((n % 10) / 5), ones = n % 5;
  const stack = (cnt, cls) => cnt ? `<div class="chipstack">${Array(Math.min(cnt, 10)).fill(`<div class="chipdisc ${cls}"></div>`).join('')}</div>` : '';
  return `<div class="chips">${stack(tens, 'c10')}${stack(fives, 'c5')}${stack(ones, 'c1')}</div>`;
};
const cardTxt = c => (c === 99 ? '🃏' : c);
const actText = a => {
  const t = a.timeout ? ' (시간 초과)' : '';
  if (a.type === 'raise') return `${who(a.mine)}: 레이즈 +${a.amount}`;
  if (a.type === 'call') return `${who(a.mine)}: 콜 ${a.amount}${t}`;
  if (a.type === 'check') return `${who(a.mine)}: 체크${t}`;
  return `${who(a.mine)}: 다이${t}`;
};
R.indian = R.indian_plus = (el, v, ctx) => {
  const last = v.last;
  const lines = [...v.actions.slice().reverse().map(actText)];
  v.history.slice().reverse().forEach(r => lines.push(`R${r.round} 결과: 나 <b>${cardTxt(r.myCard)}</b> vs 상대 <b>${cardTxt(r.oppCard)}</b> → ${resultWord(r.result)} ${r.reason === 'fold' ? `(${r.folder === 'me' ? '내가' : '상대가'} 다이)` : '(공개)'} · 판돈 ${r.pot}${r.penalty ? ` · 벌칙 ${r.penalty}` : ''}`));
  el.innerHTML = `
    ${v.over ? '' : timerHtml(v.deadline, v.myTurn, 30000, v.myTurn ? '내 차례' : '상대 차례')}
    ${last ? `<div class="panel small lastline">
      지난 판: 내 카드 <b>${cardTxt(last.myCard)}</b> vs 상대 카드 <b>${cardTxt(last.oppCard)}</b> →
      ${resultWord(last.result)} ${last.reason === 'fold' ? `(${last.folder === 'me' ? '내가' : '상대가'} 다이)` : '(카드 공개)'}
      · 판돈 ${last.pot}${last.penalty ? ` · <b class="lose">10 들고 다이 벌칙 ${last.penalty}개</b>` : ''}</div>` : ''}
    <div class="ip-table">
      <div class="ip-who desk-only">상대</div>
      <div class="ip-side">
        <div class="pcard ${v.oppCard === 99 ? 'joker' : ''}">${v.oppCard == null ? '-' : cardTxt(v.oppCard)}</div>
        <div class="ip-bet ${v.need > 0 ? 'hot' : ''}"><div class="lbl">상대가 건 칩</div><div class="num">${v.oppBet}</div>${chipStacks(v.oppBet)}</div>
        <div class="ip-bank"><div class="lbl">상대 보유</div><div class="num">${v.oppChips}</div></div>
      </div>
      <div class="ip-center">
        <div class="ip-potrow"><span class="muted small">판돈</span> <span class="ip-pot">${v.pot}</span></div>
        ${v.myTurn && v.need > 0 ? `<div class="ip-callout">상대가 ${v.need}개 더 걸었어요!</div>` : ''}
        <div class="muted small ip-meta">라운드 ${v.round} · 남은 카드 ${v.deckLeft}장${v.plus ? ' · 🃏조커는 1에게만 짐' : ''}${v.reshuffled ? ' · <b style="color:var(--accent2)">카드를 새로 섞었어요</b>' : ''}</div>
      </div>
      <div class="ip-side">
        <div class="pcard back">?</div>
        <div class="ip-bet"><div class="lbl">내가 건 칩</div><div class="num">${v.myBet}</div>${chipStacks(v.myBet)}</div>
        <div class="ip-bank"><div class="lbl">내 보유</div><div class="num">${v.myChips}</div></div>
      </div>
      <div class="ip-who desk-only" style="margin-top:6px">나 (내 카드는 안 보여요)</div>
    </div>
    ${v.myTurn ? `<div class="panel ip-panel"><div class="ip-controls">
      <button id="fold" class="big" style="background:#5a2323">다이</button>
      <button id="call" class="big">${v.need > 0 ? `콜 (${Math.min(v.need, v.myChips)}개)` : '체크'}</button>
      <form id="rf" class="row" style="gap:6px">
        <div class="ip-quick">${[1, 3, 5].filter(x => x <= v.maxRaise).map(x => `<button type="button" data-q="${x}">+${x}</button>`).join('')}
          ${v.maxRaise >= 1 ? `<button type="button" data-q="${v.maxRaise}">올인</button>` : ''}</div>
        <input id="ri" type="number" min="1" max="${v.maxRaise}" value="${esc(ipDraft)}" placeholder="1~${v.maxRaise}" style="width:90px" ${v.maxRaise < 1 ? 'disabled' : ''}>
        <button class="primary big" ${v.maxRaise < 1 ? 'disabled' : ''}>레이즈</button>
      </form></div>
      <div class="muted small desk-only" style="text-align:center;margin-top:8px">레이즈 = 상대만큼 맞춘 뒤 입력한 개수만큼 더 걸기 · 시간이 지나면 ${v.need > 0 ? '자동 다이' : '자동 체크'}</div></div>` : ''}
    ${logHtml(lines, '', '베팅 기록')}`;
  if (v.myTurn) {
    document.getElementById('fold').onclick = () => {
      if (confirm('다이할까요? 내 카드가 10이면 칩 10개 벌칙이 있어요.')) ctx.send({ type: 'fold' });
    };
    document.getElementById('call').onclick = () => ctx.send({ type: 'call' });
    const ri = document.getElementById('ri');
    ri.oninput = () => (ipDraft = ri.value);
    el.querySelectorAll('[data-q]').forEach(b => (b.onclick = () => { ri.value = b.dataset.q; ipDraft = ri.value; }));
    document.getElementById('rf').onsubmit = e => {
      e.preventDefault();
      const x = Number(ri.value);
      if (!Number.isInteger(x) || x < 1 || x > v.maxRaise) return ctx.toast(`1~${v.maxRaise} 사이로 입력하세요.`);
      ipDraft = '';
      ctx.send({ type: 'raise', amount: x });
    };
  }
};

/* ───────── 십이장기 / 미니 왕국전 ───────── */
let jgSel = null, jgKey = '';
R.janggi12 = R.janggi12_plus = (el, v, ctx) => {
  const key = JSON.stringify(v.lastMove) + v.myTurn;
  if (key !== jgKey) { jgSel = null; jgKey = key; }
  const NAME = { K: ['王', '왕'], R: ['將', '장'], B: ['相', '상'], P: ['子', '자'], G: ['侯', '후'], N: ['騎', '기사'] };
  const myFwd = v.flip ? 1 : -1;
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]], DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KN = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];
  const dirs = t => ({ K: [...ORTH, ...DIAG], R: ORTH, B: DIAG, P: [[myFwd, 0]], G: [...ORTH, [myFwd, -1], [myFwd, 1]], N: KN }[t]);
  const pos = ([r, c]) => `${['A', 'B', 'C'][v.flip ? 2 - c : c]}${v.flip ? r + 1 : 4 - r}`;
  const lines = v.moves.slice().reverse().map(m => m.kind === 'drop'
    ? `${who(m.mine)}: 포로 ${NAME[m.t][1]}를 ${pos(m.to)}에 놓음`
    : `${who(m.mine)}: ${NAME[m.t][1]} ${pos(m.from)}→${pos(m.to)}${m.cap ? ` · <b class="${m.mine ? 'win' : 'lose'}">${NAME[m.cap][1]} 잡음</b>` : ''}${m.promo ? ' · 후로 승격' : ''}`);
  const targets = () => {
    const res = [];
    if (!jgSel || !v.myTurn) return res;
    if (jgSel.hand) {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) if (!v.board[r][c] && r !== v.myEnemyRow) res.push(r + ',' + c);
    } else {
      const p = v.board[jgSel.r][jgSel.c];
      for (const [dr, dc] of dirs(p.t)) {
        const r = jgSel.r + dr, c = jgSel.c + dc;
        if (r < 0 || r > 3 || c < 0 || c > 2) continue;
        const t = v.board[r][c];
        if (!t || !t.mine) res.push(r + ',' + c);
      }
    }
    return res;
  };
  const piece = (p, extra = '') => `<div class="jg-piece ${p.mine ? 'mine' : 'opp'} ${extra}">${NAME[p.t][0]}<small>${NAME[p.t][1]}</small></div>`;
  const draw = () => {
    const tg = targets();
    const rows = v.flip ? [3, 2, 1, 0] : [0, 1, 2, 3];
    const cols = v.flip ? [2, 1, 0] : [0, 1, 2];
    const lm = v.lastMove;
    const isLast = (r, c) => lm && ((lm.to[0] === r && lm.to[1] === c) || (lm.from && lm.from[0] === r && lm.from[1] === c));
    const myBack = 3 - v.myEnemyRow;
    el.innerHTML = `
      ${v.over ? '' : statusHtml(v.myTurn ? '내 차례예요. <span class="desk-only">(파란 말이 내 말)</span>' : '상대 차례예요...', v.myTurn)}
      <div class="jg-wrap">
        <div>
          <div class="muted small" style="text-align:center">상대 포로</div>
          <div class="jg-hand">${v.oppHand.map(t => piece({ t, mine: false })).join('') || '<span class="muted small">없음</span>'}</div>
          <div class="jg-board">${rows.map(r => cols.map(c => {
            const p = v.board[r][c];
            const cls = ['jg-cell', r === v.myEnemyRow ? 'enemy' : r === myBack ? 'mine-zone' : '', isLast(r, c) ? 'last' : '',
              tg.includes(r + ',' + c) ? 'target' : '', jgSel && !jgSel.hand && jgSel.r === r && jgSel.c === c ? 'sel' : ''].join(' ');
            return `<div class="${cls}" data-r="${r}" data-c="${c}">${p ? piece(p) : ''}</div>`;
          }).join('')).join('')}</div>
          <div class="muted small" style="text-align:center;margin-top:6px">내 포로 (눌러서 놓기)</div>
          <div class="jg-hand" id="myhand">${v.myHand.map((t, k) => piece({ t, mine: true }, jgSel && jgSel.hand && jgSel.k === k ? 'sel' : '').replace('class="jg-piece', `data-k="${k}" class="jg-piece`)).join('') || '<span class="muted small">없음</span>'}</div>
        </div>
      </div>
      ${logHtml(lines, '', '수 기록')}`;
    el.querySelectorAll('.jg-cell').forEach(cell => (cell.onclick = () => clickCell(Number(cell.dataset.r), Number(cell.dataset.c), tg)));
    el.querySelectorAll('#myhand .jg-piece').forEach(pe => (pe.onclick = () => {
      if (!v.myTurn) return;
      const k = Number(pe.dataset.k);
      jgSel = jgSel && jgSel.hand && jgSel.k === k ? null : { hand: true, k, piece: v.myHand[k] };
      draw();
    }));
  };
  const clickCell = (r, c, tg) => {
    if (!v.myTurn) return;
    if (jgSel && tg.includes(r + ',' + c)) {
      if (jgSel.hand) ctx.send({ type: 'drop', piece: jgSel.piece, to: [r, c] });
      else ctx.send({ type: 'move', from: [jgSel.r, jgSel.c], to: [r, c] });
      jgSel = null;
      return;
    }
    const p = v.board[r][c];
    jgSel = p && p.mine ? { r, c } : null;
    draw();
  };
  draw();
};

/* ───────── 미스터리 사인 / 숨은 공식 ───────── */
let msDraft = '', msPropDraft = '', msKey = '';
R.mysterysign = R.mysterysign_plus = (el, v, ctx) => {
  const key = v.round + ':' + v.hints.length + ':' + v.phase + ':' + v.slot;
  if (key !== msKey) { msPropDraft = ''; if (v.phase !== 'answer') msDraft = ''; msKey = key; }
  const solverText = r => r.solver === 'me' ? '<b class="win">내가 맞혔어요!</b>' : r.solver === 'opp' ? '<b class="lose">상대가 맞혔어요</b>' : '<span class="muted">아무도 못 맞혔어요 (무효)</span>';
  let st = '', mineTurn = false, timerLabel = '', timerTotal = 30000;
  if (v.phase === 'propose') {
    mineTurn = v.myPropose;
    const part = v.slot === 0 ? '앞' : '뒤';
    st = v.myPropose ? `힌트를 만들 <b>${part} 숫자</b>를 내세요.${v.plus && v.slot === 0 ? ' (판돈 0.5점)' : ''}` : `상대가 ${part} 숫자를 고르는 중...`;
    timerLabel = v.myPropose ? `${part} 숫자 내기` : '상대 차례';
  } else if (v.phase === 'answer') {
    mineTurn = v.canAnswer; timerTotal = 180000;
    st = !v.canAnswer ? '틀려서 이번 힌트의 기회는 상대에게 넘어갔어요.'
      : v.oppLocked ? '상대가 틀렸어요! 이제 나만 맞힐 수 있어요.'
      : v.myPassed ? '패스했어요. 상대도 패스하면 다음 힌트!'
      : '답을 알면 정답, 모르면 패스!';
    timerLabel = '이번 힌트 남은 시간';
  } else if (v.phase === 'ruleGuess') {
    mineTurn = v.ruleGuessing === 'me'; timerTotal = 20000;
    st = mineTurn ? '정답! 보너스: 진짜 공식을 골라 보세요 (+1)' : '상대가 정답! 공식 맞히기 보너스 도전 중...';
    timerLabel = '공식 맞히기';
  } else if (v.phase === 'roundEnd') { timerLabel = '다음 라운드까지'; timerTotal = 8000; }
  const lines = v.events.slice().reverse().map(e => {
    if (e.type === 'hint') return `R${e.round} 힌트: <b>${e.x} ? ${e.y} = ${e.z}</b>${e.stake ? ` <span class="muted">(${e.iFront ? '나' : '상대'} 판돈 ${e.stake})</span>` : ''}`;
    if (e.type === 'answer') return `${who(e.mine)}: ${e.n} → <b class="${e.ok ? 'win' : 'lose'}">${e.ok ? '정답' : '오답 -1'}</b>`;
    if (e.type === 'pass') return `${who(e.mine)}: 패스`;
    if (e.type === 'ruleGuess') return `${who(e.mine)}: 공식 맞히기 ${e.ok ? '<b class="win">성공 +1</b>' : '<b class="lose">실패</b>'}`;
    return '';
  });
  const historyTable = v.history.length ? `<div class="panel"><div class="muted small" style="margin-bottom:6px">지난 라운드 공식</div><table class="log">
      <tr><th>R</th><th>공식</th><th>문제</th><th>결과</th></tr>
      ${v.history.map(h => `<tr><td>${h.round}</td><td style="text-align:left">${esc(h.rule)}</td><td>${h.problem.a} ? ${h.problem.b} = ${h.answer}</td><td>${h.solver === 'me' ? '<b class="win">나</b>' : h.solver === 'opp' ? '<b class="lose">상대</b>' : '무효'}${h.bonus === 'ok' ? ' +보너스' : ''}</td></tr>`).join('')}</table></div>` : '';
  el.innerHTML = `
    ${v.over ? '' : timerHtml(v.deadline, mineTurn, timerTotal, timerLabel)}
    ${scoreBar(fmt(v.scores[0]), `${v.round}<span class="muted of">/${v.rounds}</span>`, fmt(v.scores[1]))}
    ${v.result && !v.result.hidden ? `<div class="ms-reveal"><div>${solverText(v.result)}${v.result.pot ? ` <span class="small">(판돈 ${fmt(v.result.pot)})</span>` : ''}${v.result.bonus === 'ok' ? ' <b class="win">공식 보너스 +1</b>' : ''}</div>
      <div class="rule">공식: ${esc(v.result.rule)}</div>
      <div>정답 ${v.result.problem.a} ? ${v.result.problem.b} = <b>${v.result.answer}</b></div></div>` : ''}
    ${v.over ? '' : statusHtml(st, mineTurn)}
    ${v.note ? `<div class="panel small" style="text-align:center;color:var(--accent2)">${v.note}</div>` : ''}
    ${v.choices ? `<div class="panel ms-choices">${v.choices.map((c, k) => `<button data-k="${k}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div class="panel">
      <div class="ms-problem">${v.problem.a}<span class="sign">?</span>${v.problem.b} = <span class="q">${v.result ? v.result.answer : '?'}</span></div>
      ${v.plus && v.pot ? `<div style="text-align:center" class="small">이번 라운드 판돈: <b style="color:var(--accent2)">${fmt(v.pot)}점</b> (정답자가 가져가요)</div>` : ''}
      ${v.phase === 'answer' ? `<form id="af" class="ms-answer">
        <input id="ai" type="number" inputmode="numeric" placeholder="정답" value="${esc(msDraft)}" ${v.canAnswer ? '' : 'disabled'}>
        <button class="primary" ${v.canAnswer ? '' : 'disabled'}>정답!</button>
        <button type="button" id="pass" ${v.myPassed ? 'disabled' : ''} style="background:#3b2f8f">${v.myPassed ? '패스함 ✓' : '패스'}</button></form>
        <div class="row small ms-who">
          <span>나: ${v.myLocked ? '<b class="lose">오답 (자동 패스)</b>' : v.myPassed ? '<b style="color:var(--accent2)">패스</b>' : '고민 중'}</span>
          <span>상대: ${v.oppLocked ? '<b class="lose">오답 (자동 패스)</b>' : v.oppPassed ? '<b style="color:var(--accent2)">패스</b>' : '고민 중'}</span></div>` : ''}
      ${v.phase === 'propose' ? `<div style="text-align:center;margin-top:6px">
        <div class="ms-hint" style="display:inline-block;min-width:220px">${v.frontNumber ?? (v.slot === 0 && v.myPropose ? '<span class="q">앞</span>' : '□')}<span class="sign">?</span>${v.slot === 1 && v.myPropose ? '<span class="q">뒤</span>' : '□'} = □</div>
        ${v.myPropose ? `<form id="pf" class="ms-answer" style="margin-top:10px">
          <input id="pi" type="number" min="1" max="999" placeholder="1~999" value="${esc(msPropDraft)}">
          <button class="primary">${v.slot === 0 ? '앞' : '뒤'} 숫자 내기</button></form>` : ''}</div>` : ''}
    </div>
    <div class="panel">
      <div class="muted small" style="margin-bottom:6px">공개된 힌트 (${v.hints.length}/${v.maxHints})</div>
      <div class="ms-hints">${v.hints.map((h, k) => `<div class="ms-hint ${k === v.hints.length - 1 && v.phase === 'answer' ? 'new' : ''}"><small>힌트 ${k + 1}</small>${h.x}<span class="sign">?</span>${h.y} = ${h.z}</div>`).join('') || '<div class="muted">아직 힌트가 없어요. 숫자를 넣어 공식을 알아내세요!</div>'}</div>
    </div>
    ${logHtml(lines, historyTable, '진행 기록')}`;
  const af = document.getElementById('af');
  if (af) {
    const ai = document.getElementById('ai');
    ai.oninput = () => (msDraft = ai.value);
    if (v.canAnswer && window.innerWidth > 760) ai.focus();
    af.onsubmit = e => {
      e.preventDefault();
      if (ai.value === '' || !Number.isInteger(Number(ai.value))) return ctx.toast('정수를 입력하세요.');
      ctx.send({ type: 'answer', n: Number(ai.value) });
      msDraft = '';
    };
  }
  const passBtn = document.getElementById('pass');
  if (passBtn) passBtn.onclick = () => ctx.send({ type: 'pass' });
  el.querySelectorAll('.ms-choices button').forEach(b => (b.onclick = () => ctx.send({ type: 'ruleGuess', k: Number(b.dataset.k) })));
  const pf = document.getElementById('pf');
  if (pf) {
    const pi = document.getElementById('pi');
    pi.oninput = () => (msPropDraft = pi.value);
    if (window.innerWidth > 760) pi.focus();
    pf.onsubmit = e => {
      e.preventDefault();
      const n = Number(pi.value);
      if (!Number.isInteger(n) || n < 1 || n > 999) return ctx.toast('1~999 사이 정수를 입력하세요. (0 제외)');
      ctx.send({ type: 'propose', n });
    };
  }
};

/* ───────── 미스터리 넘버 / 숫자 금고 ───────── */
let dvSel = null, dvKey = '';
R.davinci = R.davinci_plus = (el, v, ctx) => {
  const key = JSON.stringify(v.oppHand) + v.myTurn + v.phase;
  if (key !== dvKey) { dvSel = null; dvKey = key; }
  const canGuess = v.myTurn && (v.phase === 'guess' || v.phase === 'continue');
  const penalty = v.myTurn && v.phase === 'penalty';
  let st = '';
  if (!v.over) {
    if (!v.myTurn) st = '상대가 추리하는 중...';
    else if (v.phase === 'guess') st = '상대 타일 하나를 골라 숫자를 추리하세요.';
    else if (v.phase === 'continue') st = `정답! 한 번 더 추리하거나 멈출 수 있어요.${v.plus ? ` (이번 턴 ${v.streak}번 맞힘${v.streak >= 3 ? ' → 멈추면 한 턴 더!' : ''})` : ''}`;
    else if (penalty) st = '틀렸어요. 더미가 비어서 내 타일 하나를 골라 공개해야 해요.';
  }
  const colorChip = c => `<span class="chip-b ${c === 'B' ? '흑' : '백'}"></span>`;
  const lines = v.log.slice().reverse().map(l => l.bonus ? `${who(l.mine)}: 3번 이상 맞혀서 <b style="color:var(--accent2)">한 턴 더!</b>`
    : `${who(l.mine)}: ${l.mine ? '상대' : '내'} ${l.idx + 1}번 타일(${colorChip(l.c)})은 ${l.n}? → <b class="${l.ok ? 'win' : 'lose'}">${l.ok ? '정답' : '오답'}</b>`);
  const pad = [...Array(v.maxN + 1).keys(), ...(v.plus ? ['J'] : [])];
  const draw = () => {
    el.innerHTML = `
      ${statusHtml(st, v.myTurn)}
      <div class="panel">
        <div class="muted small dv-cap">상대 타일 ${v.oppHasPending ? `· 상대가 가져온 타일: ${colorChip(v.oppPendingColor)}` : ''}</div>
        <div class="dv-row">${v.oppHand.map((t, k) => `
          <div class="dv-tile ${t.c} ${t.revealed ? 'open' : ''} ${canGuess && !t.revealed ? 'clickable' : ''} ${dvSel === k ? 'sel' : ''}" data-k="${k}">
            ${t.n !== undefined ? t.n : '<span class="q">?</span>'}<span class="tag">${k + 1}번${t.revealed ? ' 공개' : ''}</span></div>`).join('')}</div>
        <div class="dv-gap"></div>
        ${canGuess && dvSel !== null ? `<div style="text-align:center;margin-bottom:6px">${dvSel + 1}번 타일의 숫자는?</div>
          <div class="numpad ${v.plus ? 'p11' : ''}">${pad.map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>` : ''}
        ${v.myTurn && v.phase === 'continue' ? `<div class="row" style="margin-top:10px"><button class="primary" id="stop">멈추기 (턴 넘기기)</button></div>` : ''}
      </div>
      <div class="panel">
        <div class="row dv-mine-head">
          ${v.pending ? `<span class="muted small">가져온 타일</span><div class="dv-tile small ${v.pending.c}">${v.pending.n}</div>` : ''}
          <span class="muted small">내 타일 (빨간 테두리 = 공개됨) · 더미 ${v.pile}장</span>
        </div>
        <div class="dv-row">${v.myHand.map((t, k) => `
          <div class="dv-tile ${t.c} ${t.revealed ? 'open' : ''} ${penalty && !t.revealed ? 'clickable' : ''}" data-mk="${k}">${t.n}<span class="tag">${t.revealed ? '공개' : '비공개'}</span></div>`).join('')}</div>
        <div class="dv-gap"></div>
      </div>
      ${logHtml(lines, '', '추리 기록')}`;
    if (canGuess) el.querySelectorAll('.dv-tile[data-k]').forEach(t => (t.onclick = () => {
      const k = Number(t.dataset.k);
      if (v.oppHand[k].revealed) return;
      dvSel = dvSel === k ? null : k; draw();
    }));
    el.querySelectorAll('.numpad button').forEach(b => (b.onclick = () => {
      const n = b.dataset.n === 'J' ? 'J' : Number(b.dataset.n);
      ctx.send({ type: 'guess', idx: dvSel, n }); dvSel = null;
    }));
    const stop = document.getElementById('stop');
    if (stop) stop.onclick = () => ctx.send({ type: 'stop' });
    if (penalty) el.querySelectorAll('.dv-tile[data-mk]').forEach(t => (t.onclick = () => {
      const k = Number(t.dataset.mk);
      if (v.myHand[k].revealed) return;
      if (confirm(`내 ${k + 1}번 타일(${v.myHand[k].n})을 공개할까요?`)) ctx.send({ type: 'reveal', idx: k });
    }));
  };
  draw();
};

/* ───────── 시크릿 다이스 / 훼방 주사위 ───────── */
let sdSel = [], sdDraft = [], sdKey = '';
const SD_LABEL = { ones: '1', twos: '2', threes: '3', fours: '4', fives: '5', sixes: '6', total: '총합', oddEven: '홀짝', fullHouse: '2·3 다이스', straight4: '4연속', straight5: '5연속', four: '4 다이스', fiveJoker: '5다이스/조커' };
R.secretdice = R.secretdice_plus = (el, v, ctx) => {
  const key = v.round + v.phase;
  if (key !== sdKey) { sdSel = []; sdDraft = []; sdKey = key; }
  const CATS = v.cats;
  const role = v.isMain ? '<span class="role main">주 플레이어: 나</span>' : '<span class="role sub">주 플레이어: 상대</span>';
  const myWait = v.waitingFor && v.waitingFor[0];
  let st = '';
  if (!v.over) {
    if (v.phase === 'fix') st = v.isMain ? '딜러 주사위 중 고정할 주사위를 고르세요.' : '상대가 고정할 주사위를 고르는 중...';
    else if (v.phase === 'pick') st = v.myPick ? (v.oppPicked ? '공개 중...' : '상대가 숫자를 고르는 중...') : `낼 숫자 ${v.myNeed}개를 고르세요. (상대에게 비공개)`;
    else if (v.phase === 'seal') st = v.isMain ? '상대가 봉인할 주사위를 고르는 중...' : `봉인할 주사위를 고르면 다시 굴려져요. (남은 봉인 ${v.seals[0]}번)`;
    else if (v.phase === 'score') st = v.isMain ? '점수표에서 칸을 고르세요.' : '상대가 점수를 기록하는 중...';
  }
  const fixInfo = n => n === 1 ? '나 2개 · 상대 2개' : n === 2 ? '나 1개 · 상대 2개' : '나 1개 · 상대 1개';
  const srcLabel = { fixed: '고정', main: v.isMain ? '내 숫자' : '상대 숫자', sub: v.isMain ? '상대 숫자' : '내 숫자' };
  const lines = v.events.slice().reverse().map(e => {
    if (e.type === 'fix') return `R${e.round} ${e.mineMain ? '내가' : '상대가'} 딜러 ${e.dealer.join('·')} 중 <b>${e.fixed.join('·')}</b> 고정`;
    if (e.type === 'reveal') return `R${e.round} 공개: 나 [${(e.myPick || []).join('·')}] 상대 [${(e.oppPick || []).join('·')}] → <b>${e.dice.join(' ')}</b>`;
    if (e.type === 'seal') return `R${e.round} ${e.mine ? '내가' : '상대가'} 봉인: ${e.before} → <b>${e.after}</b>`;
    if (e.type === 'score') return `R${e.round} ${who(e.mineMain)}: <b>${SD_LABEL[e.cat]}</b>에 <b>${e.v}점</b> (${e.dice.join(' ')})`;
    return '';
  });
  const draw = () => {
    let body = '';
    if (v.phase === 'fix') {
      const n = sdSel.length;
      body = `<div class="muted small sd-cap">딜러가 던진 주사위</div>
        <div class="sd-dice">${v.dealer.map((d, k) => `<div class="sd-die ${v.isMain ? 'click' : ''} ${sdSel.includes(k) ? 'sel' : ''}" data-k="${k}">${d}</div>`).join('')}</div>
        ${v.isMain ? `<div class="fix-opts">${[1, 2, 3].map(c => `<div class="${n === c ? 'on' : ''} ${c === 3 && v.threeUsed[0] ? 'off' : ''}"><b>${c}개 고정</b><br>${fixInfo(c)}${c === 3 ? ' (1회)' : ''}</div>`).join('')}</div>
          <div class="row" style="margin-top:10px"><button class="primary" id="fix" ${n >= 1 && !(n === 3 && v.threeUsed[0]) ? '' : 'disabled'}>${n ? n + '개 고정하기' : '주사위를 눌러 고르세요'}</button></div>` : ''}`;
    } else if (v.phase === 'pick') {
      const fixedDice = v.fixed.map(k => v.dealer[k]);
      const mine = v.myPick || sdDraft;
      body = `<div class="muted small sd-cap">고정 주사위 + 두 사람이 낼 숫자</div>
        <div class="sd-dice">
          ${fixedDice.map(d => `<div class="sd-die fixed">${d}<span class="src">고정</span></div>`).join('')}
          ${Array.from({ length: v.myNeed }, (_, k) => `<div class="sd-die ${mine[k] ? 'main' : 'empty'}">${mine[k] || '?'}<span class="src">내 숫자</span></div>`).join('')}
          ${Array.from({ length: v.oppNeed }, () => `<div class="sd-die empty">${v.oppPicked ? '✓' : '?'}<span class="src">상대 숫자</span></div>`).join('')}
        </div>
        <div class="sd-gap"></div>
        ${v.myPick ? `<div style="text-align:center" class="muted">숫자를 냈어요. ${v.oppPicked ? '' : '상대를 기다리는 중...'}</div>` : `
          <div class="sd-pad">${[1, 2, 3, 4, 5, 6].map(n => `<button data-n="${n}" ${sdDraft.length >= v.myNeed ? 'disabled' : ''}>${n}</button>`).join('')}</div>
          <div class="row" style="margin-top:8px"><button class="ghost" id="undo" ${sdDraft.length ? '' : 'disabled'}>지우기</button>
            <button class="primary" id="submit" ${sdDraft.length === v.myNeed ? '' : 'disabled'}>비공개로 내기</button></div>`}
        <div style="text-align:center;margin-top:6px" class="small">상대: ${v.oppPicked ? '<b class="win">제출 완료</b>' : '고르는 중...'}</div>`;
    } else if (v.phase === 'seal' || v.phase === 'score') {
      const sealing = v.phase === 'seal' && !v.isMain;
      body = `<div class="muted small sd-cap">완성된 주사위 5개${v.phase === 'score' && v.isMain ? ' → 아래 점수표에서 칸을 누르세요' : ''}${sealing ? ' → 봉인할 주사위를 누르세요' : ''}</div>
        <div class="sd-dice">${v.dice.map((d, k) => `<div class="sd-die ${d.from} ${sealing ? 'click' : ''} ${d.sealed ? 'sealed' : ''}" data-seal="${k}">${d.v}<span class="src">${d.sealed ? `봉인(${d.before}→)` : srcLabel[d.from]}</span></div>`).join('')}</div>
        <div class="sd-gap"></div>
        ${sealing ? `<div class="row"><button class="ghost" id="noseal">봉인 안 함</button></div>` : ''}`;
    }
    const row = c => {
      const mine = v.sheets[0][c], opp = v.sheets[1][c];
      const pick = v.preview && mine === undefined;
      return `<tr class="${pick ? 'pick' : ''}" data-c="${c}"><td>${SD_LABEL[c]}</td>
        <td class="me">${mine !== undefined ? mine : pick ? `<span class="preview">${v.preview[c]}</span>` : ''}</td>
        <td>${opp !== undefined ? opp : ''}</td></tr>`;
    };
    el.innerHTML = `
      ${v.over ? '' : timerHtml(v.deadline, myWait, 40000, myWait ? '내 차례' : '상대 차례')}
      <div class="row sd-info">${v.over ? '' : role}
        <span class="muted small">R ${Math.min(v.round, v.rounds)}/${v.rounds} · 3개고정 나 ${v.threeUsed[0] ? '✗' : '○'} 상대 ${v.threeUsed[1] ? '✗' : '○'}${v.plus ? ` · 봉인 나 ${v.seals[0]} 상대 ${v.seals[1]}` : ''}</span></div>
      ${statusHtml(st, myWait)}
      ${v.autoNote ? `<div class="panel small" style="text-align:center;color:var(--accent2)">${v.autoNote}</div>` : ''}
      ${v.over ? '' : `<div class="panel">${body}</div>`}
      <div class="panel sd-sheets">
        <table class="sheet"><tr><th>항목</th><th>나</th><th>상대</th></tr>${CATS.slice(0, 7).map(row).join('')}</table>
        <table class="sheet"><tr><th>항목</th><th>나</th><th>상대</th></tr>${CATS.slice(7).map(row).join('')}
          <tr class="sum"><td>총점</td><td>${v.totals[0]}</td><td>${v.totals[1]}</td></tr></table>
      </div>
      ${logHtml(lines, '', '진행 기록')}`;
    if (v.phase === 'fix') el.querySelectorAll('.sd-die.click').forEach(d => (d.onclick = () => {
      const k = Number(d.dataset.k);
      sdSel = sdSel.includes(k) ? sdSel.filter(x => x !== k) : [...sdSel, k];
      draw();
    }));
    if (v.phase === 'seal' && !v.isMain) el.querySelectorAll('.sd-die.click').forEach(d => (d.onclick = () => {
      const k = Number(d.dataset.seal);
      if (confirm(`${v.dice[k].v} 주사위를 봉인해서 다시 굴릴까요? (남은 봉인 ${v.seals[0]}번)`)) ctx.send({ type: 'seal', idx: k });
    }));
    const ns = document.getElementById('noseal');
    if (ns) ns.onclick = () => ctx.send({ type: 'noseal' });
    const fix = document.getElementById('fix');
    if (fix) fix.onclick = () => {
      if (sdSel.length === 3 && !confirm('3개 고정은 게임에서 한 번만 쓸 수 있어요. 지금 쓸까요?')) return;
      ctx.send({ type: 'fix', idx: sdSel });
    };
    el.querySelectorAll('.sd-pad button').forEach(b => (b.onclick = () => { if (sdDraft.length < v.myNeed) { sdDraft.push(Number(b.dataset.n)); draw(); } }));
    const undo = document.getElementById('undo');
    if (undo) undo.onclick = () => { sdDraft.pop(); draw(); };
    const sub = document.getElementById('submit');
    if (sub) sub.onclick = () => ctx.send({ type: 'pick', nums: sdDraft });
    el.querySelectorAll('tr.pick').forEach(tr => (tr.onclick = () => {
      const c = tr.dataset.c;
      if (confirm(`${SD_LABEL[c]}에 ${v.preview[c]}점을 기록할까요?`)) ctx.send({ type: 'score', cat: c });
    }));
  };
  draw();
};

/* ───────── 야찌 ───────── */
let yzHeld = [false, false, false, false, false], yzKey = '';
const YZ_LABEL = { ones: '1', twos: '2', threes: '3', fours: '4', fives: '5', sixes: '6', threeKind: '쓰리 오브 어 카인드', fourKind: '포 오브 어 카인드', fullHouse: '풀하우스', smallStraight: '스몰 스트레이트', largeStraight: '라지 스트레이트', yahtzee: '야찌', chance: '찬스' };
R.yahtzee = (el, v, ctx) => {
  const key = v.rollsLeft + JSON.stringify(v.dice) + v.myTurn;
  if (key !== yzKey) { yzHeld = v.held.slice(); yzKey = key; }
  const CATS = Object.keys(YZ_LABEL);
  const canPick = v.myTurn && v.rolled;
  let st = '';
  if (!v.over) st = v.myTurn ? (v.rolled ? `주사위를 눌러 고정하고 다시 굴리거나, 점수표에서 칸을 고르세요. (남은 굴림 ${v.rollsLeft}회)` : '주사위를 굴리세요!') : '상대 차례예요...';
  const lines = v.log.slice().reverse().map(l => `${who(l.mine)}: <b>${YZ_LABEL[l.cat]}</b>에 <b>${l.v}점</b> (${l.dice.join(' ')})${l.yBonus ? ' <b style="color:var(--accent2)">야찌 보너스 +100!</b>' : ''}${l.timeout ? ' <span class="muted">(시간 초과)</span>' : ''}`);
  const draw = () => {
    const row = c => {
      const mine = v.sheets[0][c], opp = v.sheets[1][c];
      const pick = canPick && mine === undefined;
      return `<tr class="${pick ? 'pick' : ''}" data-c="${c}"><td>${YZ_LABEL[c]}</td>
        <td class="me">${mine !== undefined ? mine : pick ? `<span class="preview">${v.preview[c]}</span>` : ''}</td>
        <td>${opp !== undefined ? opp : ''}</td></tr>`;
    };
    el.innerHTML = `
      ${v.over ? '' : timerHtml(v.deadline, v.myTurn, 60000, v.myTurn ? '내 차례' : '상대 차례')}
      ${statusHtml(st, v.myTurn)}
      <div class="panel">
        <div class="dice">${v.dice.map((d, k) => `<div class="die ${d ? '' : 'blank'} ${yzHeld[k] && v.rolled ? 'held' : ''}" data-k="${k}">${d || '?'}</div>`).join('')}</div>
        <div class="row" style="margin-top:10px">
          <button class="primary" id="roll" ${v.myTurn && v.rollsLeft > 0 ? '' : 'disabled'}>🎲 굴리기 (${v.rollsLeft}회 남음)</button>
        </div>
      </div>
      <div class="panel sd-sheets">
        <table class="sheet"><tr><th>항목</th><th>나</th><th>상대</th></tr>${CATS.slice(0, 6).map(row).join('')}
          <tr class="sum"><td>보너스(63↑)</td><td>${v.totals[0].upper}/63${v.totals[0].bonus ? ' +35' : ''}</td><td>${v.totals[1].upper}/63${v.totals[1].bonus ? ' +35' : ''}</td></tr></table>
        <table class="sheet"><tr><th>항목</th><th>나</th><th>상대</th></tr>${CATS.slice(6).map(row).join('')}
          <tr class="sum"><td>총점</td><td>${v.totals[0].total}</td><td>${v.totals[1].total}</td></tr></table>
      </div>
      ${logHtml(lines, '', '점수 기록')}`;
    if (canPick && v.rollsLeft > 0) el.querySelectorAll('.die').forEach(d => (d.onclick = () => { const k = Number(d.dataset.k); yzHeld[k] = !yzHeld[k]; draw(); }));
    document.getElementById('roll').onclick = () => ctx.send({ type: 'roll', held: yzHeld });
    el.querySelectorAll('tr.pick').forEach(tr => (tr.onclick = () => {
      const c = tr.dataset.c;
      if (confirm(`${YZ_LABEL[c]}에 ${v.preview[c]}점을 기록할까요?`)) ctx.send({ type: 'score', cat: c });
    }));
  };
  draw();
};

/* ───────── 기억 포커 ───────── */
let mpSel = [], mpKey = '';
const RANK = r => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[r] || String(r));
const SUIT = ['♠', '♥', '♦', '♣'];
const cardHtml = (c, cls = '') => `<div class="pk ${c.s === 1 || c.s === 2 ? 'red' : ''} ${cls}"><b>${RANK(c.r)}</b><span>${SUIT[c.s]}</span></div>`;
const cardsInline = cs => cs.map(c => `<span class="pk-in ${c.s === 1 || c.s === 2 ? 'red' : ''}">${RANK(c.r)}${SUIT[c.s]}</span>`).join(' ');
R.memorypoker = (el, v, ctx) => {
  const key = v.round + v.phase;
  if (key !== mpKey) { mpSel = []; mpKey = key; }
  const L = k => 'ABCDEFGHIJKLMNOP'[k];
  let st = '', mine = false, total = v.memoMs, label = '';
  if (!v.over) {
    if (v.phase === 'memorize') { st = '16장의 위치를 외우세요!'; mine = !v.ready[0]; label = '외우기'; }
    else if (v.phase === 'choose') { st = v.myPick ? (v.oppPicked ? '공개 중...' : '상대가 고르는 중...') : '공유 카드와 최고의 족보가 될 2칸을 고르세요'; mine = !v.myPick; total = v.chooseMs; label = '고르기'; }
    else if (v.phase === 'result') { st = '라운드 결과'; total = v.resultMs; label = '다음 라운드까지'; }
  }
  const lines = v.history.slice().reverse().map(h => `R${h.round}: 나 ${cardsInline(h.myCards)} <b>${h.myHand}</b> vs 상대 ${cardsInline(h.oppCards)} <b>${h.oppHand}</b> → ${h.result === 'draw' ? '무승부(재대결)' : resultWord(h.result)}`);
  const draw = () => {
    const res = v.result;
    const grid = Array.from({ length: 16 }, (_, k) => {
      const card = v.board && v.board[k];
      const myMark = res ? res.myPick.includes(k) : (v.myPick ? v.myPick.includes(k) : mpSel.includes(k));
      const oppMark = res && res.oppPick.includes(k);
      const cls = [myMark ? 'mark-me' : '', oppMark ? 'mark-opp' : '', v.phase === 'choose' && !v.myPick ? 'click' : ''].join(' ');
      return `<div class="pk-cell ${cls}" data-k="${k}"><span class="pk-lbl">${L(k)}</span>${card ? cardHtml(card) : `<div class="pk back"></div>`}
        ${myMark || oppMark ? `<span class="pk-tags">${myMark ? '<i class="t-me">나</i>' : ''}${oppMark ? '<i class="t-opp">상대</i>' : ''}</span>` : ''}</div>`;
    }).join('');
    el.innerHTML = `
      ${v.over ? '' : timerHtml(v.deadline, mine, total, label)}
      ${scoreBar(v.wins[0], `${v.round}`, v.wins[1], 'win', 'lose', `라운드 (${v.target}승 먼저)`)}
      ${statusHtml(st, mine)}
      ${v.shared ? `<div class="pk-shared ${v.result ? 'in-result' : ''}"><span class="muted small">공유 카드</span>${v.shared.map(c => cardHtml(c, 'sm')).join('')}</div>` : ''}
      ${res ? `<div class="panel pk-result ${res.result}">
        <div class="mob-only-block">공유: ${cardsInline(res.shared)}</div>
        <div>나: ${cardsInline(res.myCards)} + 공유 → <b>${res.myHand}</b></div>
        <div>상대: ${cardsInline(res.oppCards)} + 공유 → <b>${res.oppHand}</b></div>
        <div class="r">${res.result === 'win' ? '🏆 이번 라운드 승리!' : res.result === 'lose' ? '😵 이번 라운드 패배' : '🤝 같은 족보 — 새 카드로 다시!'}</div></div>` : ''}
      <div class="pk-grid">${grid}</div>
      <div class="row" style="margin-top:8px">
        ${v.phase === 'memorize' && !v.over ? `<button class="primary" id="ready" ${v.ready[0] ? 'disabled' : ''}>${v.ready[0] ? '상대를 기다리는 중...' : '다 외웠어요'}</button><span class="small muted">상대: ${v.ready[1] ? '다 외움 ✓' : '외우는 중'}</span>` : ''}
        ${v.phase === 'choose' && !v.myPick ? `<button class="primary" id="pick" ${mpSel.length === 2 ? '' : 'disabled'}>${mpSel.length === 2 ? `${L(mpSel[0])}, ${L(mpSel[1])} 선택 완료` : `2칸을 고르세요 (${mpSel.length}/2)`}</button>` : ''}
        ${v.phase === 'choose' ? `<span class="small muted">상대: ${v.oppPicked ? '선택 완료 ✓' : '고르는 중'}</span>` : ''}
      </div>
      ${logHtml(lines, '', '라운드 기록')}`;
    if (v.phase === 'choose' && !v.myPick) el.querySelectorAll('.pk-cell.click').forEach(c => (c.onclick = () => {
      const k = Number(c.dataset.k);
      if (mpSel.includes(k)) mpSel = mpSel.filter(x => x !== k);
      else if (mpSel.length < 2) mpSel.push(k);
      draw();
    }));
    const rd = document.getElementById('ready');
    if (rd) rd.onclick = () => ctx.send({ type: 'ready' });
    const pk = document.getElementById('pick');
    if (pk) pk.onclick = () => ctx.send({ type: 'pick', idx: mpSel });
  };
  draw();
};

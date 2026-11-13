// 게임별 화면 그리기. 서버에서 받은 view(내 시점 정보)만으로 그립니다.
window.RENDERERS = {};
const R = window.RENDERERS;
const statusHtml = (text, mine) => `<div class="status ${mine ? 'my' : ''}">${text}</div>`;
const resultWord = r => (r === 'win' ? '<b class="win">승</b>' : r === 'lose' ? '<b class="lose">패</b>' : '무');

/* ───────── 흑과 백 ───────── */
let bwDraft = '';
R.blackwhite = (el, v, ctx) => {
  const lamps = n => `<div class="lamps">${[0, 1, 2, 3, 4].map(k => `<div class="lamp ${k < n ? 'on' : ''}"></div>`).join('')}</div>`;
  let st = '';
  if (!v.over) st = v.myTurn
    ? (v.iAmFirst ? '내가 선이에요. 낼 점수를 정하세요.' : '상대가 낸 색을 보고 점수를 정하세요.')
    : (v.iAmFirst ? '상대가 점수를 고르는 중...' : '상대(선)가 점수를 고르는 중...');
  const oppTile = v.oppColor
    ? `<div class="bw-tile ${v.oppColor}">${v.oppColor}</div>`
    : `<div class="bw-tile unknown">?</div>`;
  el.innerHTML = `
    ${statusHtml(st, v.myTurn)}
    <div class="panel"><div class="row" style="justify-content:space-around">
      <div style="text-align:center"><div class="muted small">내 남은 점수</div><div class="score-big">${v.myPts}</div>${lamps(v.myLamps)}</div>
      <div style="text-align:center"><div class="muted small">라운드</div><div class="score-big">${v.round}<span class="muted" style="font-size:20px">/${v.rounds}</span></div>
        <div>나 <b class="win">${v.wins[0]}승</b> : <b class="lose">${v.wins[1]}승</b> 상대</div></div>
      <div style="text-align:center"><div class="muted small">상대 남은 점수</div><div class="score-big">??</div>${lamps(v.oppLamps)}</div>
    </div></div>
    <div class="panel"><div class="row">
      <div style="text-align:center"><div class="muted small" style="margin-bottom:6px">상대가 낸 타일</div>${oppTile}</div>
      ${v.myTurn ? `<form id="bwf" class="row">
        <input id="bwi" type="number" min="0" max="${v.myPts}" inputmode="numeric" placeholder="0~${v.myPts}" value="${esc(bwDraft)}" style="width:120px;font-size:22px;text-align:center">
        <button class="primary">점수 내기</button></form>` : ''}
    </div></div>
    <div class="panel"><table class="log">
      <tr><th>라운드</th><th>선</th><th>내가 낸 점수</th><th>내 색</th><th>상대 색</th>${v.reveal ? '<th>상대 점수</th>' : ''}<th>결과</th></tr>
      ${v.log.map((l, k) => `<tr><td>${l.round}</td><td>${l.iWentFirst ? '나' : '상대'}</td><td>${l.myBet}</td>
        <td><span class="chip-b ${l.myColor}"></span></td><td><span class="chip-b ${l.oppColor}"></span></td>
        ${v.reveal ? `<td>${v.reveal[k].opp}</td>` : ''}<td>${resultWord(l.result)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">아직 기록이 없어요</td></tr>'}
    </table></div>`;
  const f = document.getElementById('bwf');
  if (f) {
    const inp = document.getElementById('bwi');
    inp.oninput = () => (bwDraft = inp.value);
    f.onsubmit = e => {
      e.preventDefault();
      const n = Number(inp.value);
      if (inp.value === '' || !Number.isInteger(n) || n < 0 || n > v.myPts) return ctx.toast(`0~${v.myPts} 사이 정수를 입력하세요.`);
      if (!confirm(`${n}점을 낼까요? (${n <= 9 ? '흑' : '백'})`)) return;
      bwDraft = '';
      ctx.send({ type: 'bet', amount: n });
    };
  }
};

/* ───────── 결! 합! ───────── */
let ghSel = [], ghBoardKey = '', ghKeysBound = false, ghSend = null;
R.gyulhap = (el, v, ctx) => {
  const key = JSON.stringify(v.board) + v.round;
  if (key !== ghBoardKey) { ghSel = []; ghBoardKey = key; }
  ghSend = ctx;
  const COLORS = ['#e5484d', '#3b82f6', '#f5c518'], BGS = ['#f4f4f4', '#9aa0a6', '#1c1c1c'];
  const shapeSvg = (s, c) => {
    const fill = COLORS[c];
    if (s === 0) return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="${fill}"/></svg>`;
    if (s === 1) return `<svg viewBox="0 0 100 100"><polygon points="50,8 94,90 6,90" fill="${fill}"/></svg>`;
    return `<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="${fill}"/></svg>`;
  };
  const draw = () => {
    el.innerHTML = `
      ${v.over ? '' : statusHtml('차례는 없어요! "합"을 먼저 찾아서 외치세요. (숫자키 1~9로 고르고 Enter = 합)', true)}
      <div class="panel"><div class="row" style="justify-content:space-around">
        <div style="text-align:center"><div class="muted small">나</div><div class="score-big win">${v.scores[0]}</div></div>
        <div style="text-align:center"><div class="muted small">라운드</div><div class="score-big">${v.round}<span class="muted" style="font-size:20px">/${v.rounds}</span></div></div>
        <div style="text-align:center"><div class="muted small">상대</div><div class="score-big lose">${v.scores[1]}</div></div>
      </div></div>
      <div class="panel">
        <div class="gh-board">${v.board.map((t, k) => `
          <button class="gh-tile ${ghSel.includes(k + 1) ? 'sel' : ''}" data-n="${k + 1}" style="background:${BGS[t.bg]}">
            <span class="num">${k + 1}</span>${shapeSvg(t.shape, t.color)}</button>`).join('')}</div>
        <div class="row" style="margin-top:16px">
          <button class="primary" id="hap" ${ghSel.length === 3 && !v.over ? '' : 'disabled'} style="font-size:20px;padding:12px 36px">합!</button>
          <button id="gyul" ${v.over ? 'disabled' : ''} style="font-size:20px;padding:12px 36px;background:#3b2f8f">결!</button>
          <button class="ghost" id="clr">선택 해제</button>
        </div>
      </div>
      <div class="panel"><div class="muted small" style="margin-bottom:6px">이번 라운드에 나온 합</div>
        <div class="claimed-list">${v.claimed.map(c => `<span>${c.split('').join('·')}</span>`).join('') || '<span class="muted" style="background:none">아직 없어요</span>'}</div></div>
      <div class="panel feed">${v.log.slice().reverse().map(l => `<div>
        <b>${l.mine ? '나' : '상대'}</b> ${l.kind === 'hap' ? `합! ${l.cells.split('').join('·')}` : '결!'}
        → <b class="${l.ok ? 'win' : 'lose'}">${l.delta > 0 ? '+' : ''}${l.delta}</b> ${l.reason ? `<span class="muted">(${l.reason})</span>` : ''}
        <span class="muted small">R${l.round}</span></div>`).join('') || '<div class="muted">기록이 여기에 표시돼요</div>'}</div>`;
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

/* ───────── 인디언 포커 ───────── */
let ipDraft = '';
R.indian = (el, v, ctx) => {
  let st = '';
  if (!v.over) st = v.myTurn ? (v.need > 0 ? `상대가 ${v.need}개 더 걸었어요. 콜 / 레이즈 / 다이?` : '내 차례예요. 체크하거나 레이즈하세요.') : '상대가 고민 중...';
  const last = v.last;
  el.innerHTML = `
    ${statusHtml(st, v.myTurn)}
    ${last ? `<div class="panel small" style="text-align:center">
      지난 라운드(${last.round}): 내 카드 <b>${last.myCard}</b> vs 상대 카드 <b>${last.oppCard}</b> →
      ${resultWord(last.result)} ${last.reason === 'fold' ? `(${last.folder === 'me' ? '내가' : '상대가'} 다이)` : '(승부)'}
      · 판돈 ${last.pot}${last.penalty ? ` · <b class="lose">10 다이 벌칙 ${last.penalty}개</b>` : ''}</div>` : ''}
    <div class="panel"><div class="row" style="justify-content:space-around;align-items:flex-start">
      <div style="text-align:center">
        <div class="muted small" style="margin-bottom:8px">상대 카드</div>
        <div class="pcard" style="margin:0 auto">${v.oppCard ?? '-'}</div>
        <div style="margin-top:10px">상대 칩 <b>${v.oppChips}</b></div>
        <div class="muted small">이번 판에 건 칩 ${v.oppBet}</div>
      </div>
      <div style="text-align:center;align-self:center">
        <div class="muted small">판돈</div><div class="score-big" style="color:var(--accent2)">${v.pot}</div>
        <div class="muted small">라운드 ${v.round} · 남은 카드 ${v.deckLeft}장</div>
        ${v.reshuffled ? '<div class="small" style="color:var(--accent2)">카드를 새로 섞었어요</div>' : ''}
      </div>
      <div style="text-align:center">
        <div class="muted small" style="margin-bottom:8px">내 카드 (안 보여요)</div>
        <div class="pcard back" style="margin:0 auto">?</div>
        <div style="margin-top:10px">내 칩 <b>${v.myChips}</b></div>
        <div class="muted small">이번 판에 건 칩 ${v.myBet}</div>
      </div>
    </div></div>
    ${v.myTurn ? `<div class="panel"><div class="row">
      <button id="fold" style="background:#5a2323">다이</button>
      <button id="call">${v.need > 0 ? `콜 (${Math.min(v.need, v.myChips)}개)` : '체크'}</button>
      <form id="rf" class="row" style="gap:8px">
        <input id="ri" type="number" min="1" max="${v.maxRaise}" value="${esc(ipDraft)}" placeholder="1~${v.maxRaise}" style="width:110px" ${v.maxRaise < 1 ? 'disabled' : ''}>
        <button class="primary" ${v.maxRaise < 1 ? 'disabled' : ''}>레이즈</button>
      </form></div>
      <div class="muted small" style="text-align:center;margin-top:8px">레이즈 = 상대만큼 맞춘 뒤 입력한 개수만큼 더 걸기</div></div>` : ''}`;
  if (v.myTurn) {
    document.getElementById('fold').onclick = () => {
      if (confirm('다이할까요? 내 카드가 10이면 칩 10개 벌칙이 있어요.')) ctx.send({ type: 'fold' });
    };
    document.getElementById('call').onclick = () => ctx.send({ type: 'call' });
    const ri = document.getElementById('ri');
    ri.oninput = () => (ipDraft = ri.value);
    document.getElementById('rf').onsubmit = e => {
      e.preventDefault();
      const x = Number(ri.value);
      if (!Number.isInteger(x) || x < 1 || x > v.maxRaise) return ctx.toast(`1~${v.maxRaise} 사이로 입력하세요.`);
      ipDraft = '';
      ctx.send({ type: 'raise', amount: x });
    };
  }
};

/* ───────── 십이장기 ───────── */
let jgSel = null, jgKey = '';
R.janggi12 = (el, v, ctx) => {
  const key = JSON.stringify(v.lastMove) + v.myTurn;
  if (key !== jgKey) { jgSel = null; jgKey = key; }
  const NAME = { K: ['王', '왕'], R: ['將', '장'], B: ['相', '상'], P: ['子', '자'], G: ['侯', '후'] };
  const myFwd = v.flip ? 1 : -1;
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]], DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const dirs = t => ({ K: [...ORTH, ...DIAG], R: ORTH, B: DIAG, P: [[myFwd, 0]], G: [...ORTH, [myFwd, -1], [myFwd, 1]] }[t]);
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
      ${v.over ? '' : statusHtml(v.myTurn ? '내 차례예요. (파란 말이 내 말)' : '상대 차례예요...', v.myTurn)}
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
      </div>`;
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

/* ───────── 미스터리 넘버 ───────── */
let dvSel = null, dvKey = '';
R.davinci = (el, v, ctx) => {
  const key = JSON.stringify(v.oppHand) + v.myTurn + v.phase;
  if (key !== dvKey) { dvSel = null; dvKey = key; }
  const canGuess = v.myTurn && (v.phase === 'guess' || v.phase === 'continue');
  const penalty = v.myTurn && v.phase === 'penalty';
  let st = '';
  if (!v.over) {
    if (!v.myTurn) st = '상대가 추리하는 중...';
    else if (v.phase === 'guess') st = '상대 타일 하나를 골라 숫자를 추리하세요.';
    else if (v.phase === 'continue') st = '정답! 한 번 더 추리하거나 멈출 수 있어요.';
    else if (penalty) st = '틀렸어요. 더미가 비어서 내 타일 하나를 골라 공개해야 해요.';
  }
  const draw = () => {
    el.innerHTML = `
      ${statusHtml(st, v.myTurn)}
      <div class="panel">
        <div class="muted small" style="text-align:center;margin-bottom:10px">상대 타일 ${v.oppHasPending ? `· 상대가 가져온 타일: <span class="chip-b ${v.oppPendingColor === 'B' ? '흑' : '백'}"></span>` : ''}</div>
        <div class="dv-row">${v.oppHand.map((t, k) => `
          <div class="dv-tile ${t.c} ${t.revealed ? 'open' : ''} ${canGuess && !t.revealed ? 'clickable' : ''} ${dvSel === k ? 'sel' : ''}" data-k="${k}">
            ${t.n !== undefined ? t.n : '<span class="q">?</span>'}<span class="tag">${k + 1}번${t.revealed ? ' 공개' : ''}</span></div>`).join('')}</div>
        <div style="height:24px"></div>
        ${canGuess && dvSel !== null ? `<div style="text-align:center;margin-bottom:8px">${dvSel + 1}번 타일의 숫자는?</div>
          <div class="numpad">${[...Array(12).keys()].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>` : ''}
        ${v.myTurn && v.phase === 'continue' ? `<div class="row" style="margin-top:12px"><button class="primary" id="stop">멈추기 (턴 넘기기)</button></div>` : ''}
      </div>
      <div class="panel">
        <div class="row" style="margin-bottom:12px">
          ${v.pending ? `<div style="text-align:center"><div class="muted small">이번에 가져온 타일</div><div class="dv-tile ${v.pending.c}" style="margin:6px auto 0">${v.pending.n}</div></div>` : ''}
          <div class="muted small">더미 남은 타일 ${v.pile}장</div>
        </div>
        <div class="muted small" style="text-align:center;margin-bottom:10px">내 타일 (빨간 테두리 = 상대에게 공개됨)</div>
        <div class="dv-row">${v.myHand.map((t, k) => `
          <div class="dv-tile ${t.c} ${t.revealed ? 'open' : ''} ${penalty && !t.revealed ? 'clickable' : ''}" data-mk="${k}">${t.n}<span class="tag">${t.revealed ? '공개' : '비공개'}</span></div>`).join('')}</div>
        <div style="height:16px"></div>
      </div>
      <div class="panel feed">${v.log.slice().reverse().map(l => `<div><b>${l.mine ? '나' : '상대'}</b>:
        ${l.mine ? '상대' : '내'} ${l.idx + 1}번 타일(<span class="chip-b ${l.c === 'B' ? '흑' : '백'}"></span>)은 ${l.n}? → <b class="${l.ok ? 'win' : 'lose'}">${l.ok ? '정답' : '오답'}</b></div>`).join('') || '<div class="muted">추리 기록이 여기에 표시돼요</div>'}</div>`;
    if (canGuess) el.querySelectorAll('.dv-tile[data-k]').forEach(t => (t.onclick = () => {
      const k = Number(t.dataset.k);
      if (v.oppHand[k].revealed) return;
      dvSel = dvSel === k ? null : k; draw();
    }));
    el.querySelectorAll('.numpad button').forEach(b => (b.onclick = () => { ctx.send({ type: 'guess', idx: dvSel, n: Number(b.dataset.n) }); dvSel = null; }));
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

/* ───────── 시크릿 다이스 ───────── */
let ytHeld = [false, false, false, false, false], ytKey = '';
R.yacht = (el, v, ctx) => {
  const key = v.rollsLeft + JSON.stringify(v.dice) + v.myTurn;
  if (key !== ytKey) { ytHeld = v.held.slice(); ytKey = key; }
  const LABEL = { ones: '1 (에이스)', twos: '2', threes: '3', fours: '4', fives: '5', sixes: '6', choice: '초이스', fourKind: '포 오브 어 카인드', fullHouse: '풀하우스', smallStraight: '스몰 스트레이트', largeStraight: '라지 스트레이트', yacht: '요트' };
  const CATS = Object.keys(LABEL);
  const PIPS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const canPick = v.myTurn && v.rolled;
  let st = '';
  if (!v.over) st = v.myTurn ? (v.rolled ? `주사위를 눌러 고정하고 다시 굴리거나, 점수표에서 항목을 고르세요. (남은 굴림 ${v.rollsLeft}회)` : '주사위를 굴리세요!') : '상대 차례예요...';
  const draw = () => {
    const row = c => {
      const mine = v.sheets[0][c], opp = v.sheets[1][c];
      const pick = canPick && mine === undefined;
      return `<tr class="${pick ? 'pick' : ''}" data-c="${c}"><td>${LABEL[c]}</td>
        <td class="me">${mine !== undefined ? mine : pick ? `<span class="preview">${v.preview[c]}</span>` : ''}</td>
        <td>${opp !== undefined ? opp : ''}</td></tr>`;
    };
    el.innerHTML = `
      ${statusHtml(st, v.myTurn)}
      ${v.last && !v.last.mine && !v.over ? `<div class="panel small" style="text-align:center">상대가 <b>${LABEL[v.last.cat]}</b>에 <b>${v.last.v}점</b>을 기록했어요 (${v.last.dice.map(d => PIPS[d]).join(' ')})</div>` : ''}
      <div class="panel">
        <div class="dice">${v.dice.map((d, k) => `<div class="die ${d ? '' : 'blank'} ${ytHeld[k] && v.rolled ? 'held' : ''}" data-k="${k}">${d ? d : '?'}</div>`).join('')}</div>
        <div class="row" style="margin-top:14px">
          <button class="primary" id="roll" ${v.myTurn && v.rollsLeft > 0 ? '' : 'disabled'}>🎲 굴리기 (${v.rollsLeft}회 남음)</button>
        </div>
        ${canPick ? '<div class="muted small" style="text-align:center;margin-top:8px">노란 테두리 주사위는 고정돼요</div>' : ''}
      </div>
      <div class="panel"><table class="sheet">
        <tr><th>항목</th><th>나</th><th>상대</th></tr>
        ${CATS.slice(0, 6).map(row).join('')}
        <tr class="sum"><td>소계 (보너스 63점 이상)</td><td>${v.totals[0].upper}/63</td><td>${v.totals[1].upper}/63</td></tr>
        <tr class="sum"><td>보너스 +35</td><td>${v.totals[0].bonus}</td><td>${v.totals[1].bonus}</td></tr>
        ${CATS.slice(6).map(row).join('')}
        <tr class="sum"><td>총점</td><td>${v.totals[0].total}</td><td>${v.totals[1].total}</td></tr>
      </table></div>`;
    if (canPick && v.rollsLeft > 0) el.querySelectorAll('.die').forEach(d => (d.onclick = () => { const k = Number(d.dataset.k); ytHeld[k] = !ytHeld[k]; draw(); }));
    document.getElementById('roll').onclick = () => ctx.send({ type: 'roll', held: ytHeld });
    el.querySelectorAll('tr.pick').forEach(tr => (tr.onclick = () => {
      const c = tr.dataset.c;
      if (confirm(`${LABEL[c]}에 ${v.preview[c]}점을 기록할까요?`)) ctx.send({ type: 'score', cat: c });
    }));
  };
  draw();
};

// 아침 모험 — 질문 → 마음 날씨 → 루틴 여행 순서로 하루를 시작하는 앱.
// 주소마다 한 아이(/somi/, /sobin/)가 열리고, 학년(저학년/고학년)에 따라 문구와 기능이 다르다.
(function () {
  'use strict';
  const D = window.MQ;
  const KID = D.KIDS[window.MQ_KID];
  if (!KID) { document.body.textContent = '주소가 잘못됐어요.'; return; }
  const HIGH = KID.grade >= 3;   // 고학년: 글로 쓰기, 걸린 시간 기록 / 저학년: 소리로 읽어주기
  const KEY = 'morning-quest-v2';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  document.body.classList.add(HIGH ? 'high' : 'low');

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayIdx = (k) => { const [y, m, d] = k.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };

  // 테스트용: 주소 뒤에 ?date=2026-10-08 을 붙이면 그 날짜로 동작한다.
  const TODAY = (() => {
    const q = new URLSearchParams(location.search).get('date');
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : fmt(new Date());
  })();

  // ---------- 저장 (이 기기의 브라우저 안에, 아이별로 따로) ----------
  let S = load();
  function load() {
    try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && o.kids) return o; } catch (e) { /* 새로 시작 */ }
    return { sound: true, kids: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가여도 계속 동작 */ } }
  const me = () => S.kids[KID.id] || (S.kids[KID.id] = { days: {} });
  const blank = () => ({ answer: null, mood: null, steps: 0, done: false, sticker: null, t0: null, secs: null });
  const getDay = (k) => me().days[k] || blank();
  function upd(k, fn) { const days = me().days; const d = days[k] || (days[k] = blank()); fn(d); d.at = Date.now(); save(); markDirty(k); }

  // ---------- 엄마 화면으로 보내기 ----------
  // 바뀐 날을 Supabase 에 올린다 (쓰기 전용). 인터넷이 없거나 아직 설정 전이면 '보낼 것'으로 남겨뒀다가
  // 다음에 다시 시도하므로, 앱은 어떤 경우에도 멈추지 않는다. ?date= 테스트 때는 보내지 않는다.
  const CLOUD = window.MQ_CLOUD;
  const LIVE = !new URLSearchParams(location.search).has('date');
  let pushTimer, flushing = false;
  function markDirty(k) {
    if (!CLOUD || !LIVE) return;
    (me().dirty || (me().dirty = {}))[k] = Date.now() + Math.random();
    save();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, 1200);
  }
  async function flush() {
    if (flushing || !CLOUD || !LIVE) return;
    const keys = Object.keys(me().dirty || {});
    if (!keys.length) return;
    flushing = true;
    try {
      for (const k of keys) {
        const mark = me().dirty[k];
        const r = await fetch(`${CLOUD.url}/rest/v1/rpc/mq_save`, {
          method: 'POST', keepalive: true,
          headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_kid: KID.id, p_day: k, p_data: me().days[k] || null })
        });
        // 400 = 서버가 거절한 기록(너무 오래됨 등): 다시 보내도 소용없으니 버린다. 404/5xx/오프라인은 나중에 재시도.
        if (r.ok || r.status === 400) { if (me().dirty[k] === mark) delete me().dirty[k]; save(); } else break;
      }
    } catch (e) { /* 오프라인 — 다음에 다시 */ }
    flushing = false;
  }

  // 엄마가 확인 화면에서 "오늘 다시 시작"을 눌렀는지 서버에 물어본다 (읽는 건 '눌렀던 시각' 하나뿐).
  // 눌렀다면 이 기기의 오늘 기록을 지우고 처음 화면으로 돌아간다.
  async function pollReset() {
    if (!CLOUD || !LIVE || document.hidden) return;
    try {
      const r = await fetch(`${CLOUD.url}/rest/v1/rpc/mq_poll_reset`, {
        method: 'POST',
        headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_kid: KID.id, p_day: TODAY })
      });
      if (!r.ok) return;
      const ts = await r.json();
      if (!ts) return;
      const seen = me().resetSeen || (me().resetSeen = {});
      if (seen[TODAY] === ts) return;
      seen[TODAY] = ts;
      const d = me().days[TODAY];
      // 지우기 요청 뒤에 아이가 이미 새로 시작했다면(기록이 요청보다 새것) 그대로 둔다
      if (d && (!d.at || new Date(ts).getTime() > d.at)) {
        delete me().days[TODAY];
        save(); markDirty(TODAY);   // 서버에 늦게 올라온 낡은 기록이 되살아났다면 같이 지운다
        ui.pending = null; ui.typing = false; ui.lock = false; closeModal(); ui.tab = 'today'; render();
      } else save();
    } catch (e) { /* 오프라인이면 다음에 */ }
  }

  const totalDone = () => Object.values(me().days).filter((d) => d.done).length;
  function streak() {
    const d = parse(TODAY);
    if (!getDay(TODAY).done) d.setDate(d.getDate() - 1);
    let n = 0;
    while (getDay(fmt(d)).done) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function curHat() {
    const t = totalDone();
    let h = D.HATS[0];
    D.HATS.forEach((x) => { if (t >= x.days) h = x; });
    return h;
  }
  // 받침 유무에 맞춰 "소미야" / "민준아" 처럼 부른다.
  function call(name) {
    const c = name.charCodeAt(name.length - 1);
    const batchim = c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
    return name + (batchim ? '아' : '야');
  }
  const pool = () => (HIGH ? D.QUESTIONS_HIGH : D.QUESTIONS_LOW);
  const curQ = () => pool()[dayIdx(TODAY) % pool().length];
  const moodOf = (id) => D.MOODS.find((m) => m.id === id);
  const stepAsk = (i) => (HIGH ? D.STEPS[i].ask4 : D.STEPS[i].ask);
  const stepDone = (i) => (HIGH ? D.STEPS[i].done4 : D.STEPS[i].done);
  const moodSay = (m) => (HIGH ? m.say4 : m.say);
  const fmtDur = (s) => (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`);

  // 이 아이의 가장 빠른 완주 기록 (오늘은 제외)
  function bestSecs() {
    const v = Object.entries(me().days).filter(([k, d]) => k !== TODAY && d.done && d.secs).map(([, d]) => d.secs);
    return v.length ? Math.min.apply(null, v) : null;
  }

  // ---------- 소리 ----------
  let ac;
  function tone(notes) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.11;
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.24);
      });
    } catch (e) { /* 소리 없이도 괜찮다 */ }
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F000}-\u{1FFFF}☀-➿️]/gu, ''));
    u.lang = 'ko-KR'; u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  // ---------- 화면 상태 ----------
  const t0 = parse(TODAY);
  const ui = { tab: 'today', pending: null, typing: false, say: '', ly: t0.getFullYear(), lm: t0.getMonth(), sel: TODAY };

  const heroHtml = (cls) =>
    `<div class="${cls}">${curHat().icon ? `<span class="hat">${curHat().icon}</span>` : ''}${KID.pet}</div>`;
  const bubble = (text) =>
    `<div class="bubble"><p id="bubbleText">${esc(text)}</p><button class="spk" data-act="speak" aria-label="소리로 듣기">🔊</button></div>`;
  const greet = () => `${new Date().getHours() < 11 ? '좋은 아침' : '안녕'}, ${call(KID.name)}!`;

  function chips() {
    $('#chips').innerHTML =
      `<span class="chip">${KID.pet} ${esc(KID.name)}</span>` +
      (streak() >= 2 ? `<span class="chip">🔥 ${streak()}</span>` : '') +
      `<span class="chip">⭐ ${totalDone()}</span>` +
      `<button class="gear" data-act="settings" aria-label="설정">⚙️</button>`;
  }

  function render() {
    chips();
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === ui.tab));
    $('#screen').innerHTML = ui.tab === 'today' ? renderToday() : renderLog();
    const d = getDay(TODAY);
    if (ui.tab === 'today' && $('#hero') && d.steps === D.STEPS.length && !d.done) setTimeout(finish, 700);
    if (ui.tab === 'today' && $('#hero') && d.steps === 1 && !d.gameDone) setTimeout(offerGame, 600);
  }

  // ---------- 오늘: 질문 → 마음 날씨 → 루틴 여행 ----------
  function renderToday() {
    const d = getDay(TODAY);
    if (ui.pending === 'q-ack' && d.answer) return renderQAck(d);
    if (!d.answer) return renderQ();
    if (ui.pending === 'mood-ack' && d.mood) return renderMoodAck(d);
    if (!d.mood) return renderMood();
    return renderJourney(d);
  }

  function renderQ() {
    const q = curQ();
    const hello = `${greet()} 오늘의 질문! ${q.q}`;
    // 두 아이 모두 고르거나 글로 쓴다.
    if (ui.typing) {
      return `<div class="stage">${heroHtml('hero-big')}</div>${bubble(hello)}
        <form class="form" id="typeForm">
          <input id="typeInput" maxlength="60" placeholder="내 생각을 써봐" autocomplete="off">
          <button class="big go" type="submit">✅ 이렇게 대답할래</button>
          <button class="big" type="button" data-act="untype" style="min-height:48px;font-size:1rem">← 고르기로 돌아가기</button>
        </form>`;
    }
    return `<div class="stage">${heroHtml('hero-big')}</div>${bubble(hello)}
      <div class="grid">
        ${q.a.map((c, i) => `<button class="big" data-act="pickQ" data-i="${i}"><span class="e">${c[0]}</span>${esc(c[1])}</button>`).join('')}
        <button class="big wide" data-act="typeQ">✍️ 내 생각을 직접 쓸래</button>
      </div>`;
  }

  function renderQAck(d) {
    const r = HIGH ? D.REACTIONS_HIGH : D.REACTIONS_LOW;
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(r[(dayIdx(TODAY) + d.answer.label.length) % r.length])}
      <div class="grid"><button class="big picked wide" style="min-height:72px"><span class="e">${d.answer.icon}</span>${esc(d.answer.label)}</button></div>
      <button class="big go" data-act="nextQ">다음 ▶ 마음 날씨 알려줘</button>`;
  }

  function renderMood() {
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(HIGH ? '지금 마음은 어떤 날씨야?' : '오늘 네 마음은 어떤 날씨야?')}
      <div class="moods">
        ${D.MOODS.map((m) => `<button class="big" data-act="pickMood" data-id="${m.id}"><span class="e">${m.icon}</span>${m.label}</button>`).join('')}
      </div>`;
  }

  function renderMoodAck(d) {
    const m = moodOf(d.mood);
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(moodSay(m))}
      <div class="grid"><button class="big picked wide" style="min-height:72px"><span class="e">${m.icon}</span>${m.label}</button></div>
      <button class="big go" data-act="nextMood">🚩 모험 떠나기!</button>`;
  }

  // ---------- 루틴 여행 ----------
  const pos = (i) => `left:${(D.POS[i][0] / 3).toFixed(2)}%;top:${(D.POS[i][1] / 4.4).toFixed(2)}%`;
  function trailPath() {
    const P = D.POS;
    let s = `M${P[0][0]} ${P[0][1]}`;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], my = (a[1] + b[1]) / 2;
      s += ` C${a[0]} ${my} ${b[0]} ${my} ${b[0]} ${b[1]}`;
    }
    return s;
  }
  const nodeState = (i, d) => (i < d.steps ? 'done' : i === d.steps && !d.done ? 'cur' : 'lock');

  function journeySay(d) {
    if (d.done) return `오늘 모험 끝! 정말 멋졌어. 내일 아침에 또 만나자 ${curHat().icon || '👋'}`;
    if (d.steps === 0) return `${call(KID.name)}, 모험 출발! ${stepAsk(0)}`;
    if (d.steps === D.STEPS.length) return '마지막까지 왔어! 이제 도착이야!';
    return stepAsk(d.steps);
  }

  function renderJourney(d) {
    ui.say = journeySay(d);
    const idx = d.done ? D.POS.length - 1 : d.steps;
    const nodes = D.STEPS.map((s, i) =>
      `<button class="node ${nodeState(i, d)}" data-act="step" data-i="${i}" style="${pos(i + 1)}" aria-label="${s.label}"><span>${s.icon}</span><span class="nl">${s.label}</span></button>`).join('');
    return `${bubble(ui.say)}
      <div class="map">
        <svg class="trail" viewBox="0 0 300 440" preserveAspectRatio="none" aria-hidden="true">
          <path d="${trailPath()}" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="1 14" stroke-linecap="round"/>
        </svg>
        <span class="deco" style="left:6%;top:4%">☁️</span><span class="deco" style="left:70%;top:14%">☁️</span>
        <span class="deco" style="left:80%;top:48%">🌳</span><span class="deco" style="left:4%;top:60%">🌷</span>
        <span class="deco" style="left:44%;top:82%">🌼</span><span class="deco" style="left:4%;top:28%">🦋</span>
        <div class="start" style="${pos(0)}">🚩<small>출발</small></div>
        ${nodes}
        <div class="goal ${d.done ? 'on' : ''}" style="${pos(D.POS.length - 1)}">🏰<small>하루 시작!</small></div>
        <div id="hero" class="hero" style="${pos(idx)}">${heroHtml('face')}</div>
      </div>`;
  }

  // 화면을 다시 그리지 않고 제자리에서 바꿔야 아침이가 깡충 뛰는 움직임이 보인다.
  function updateJourney() {
    const hero = $('#hero');
    if (!hero) return;
    const d = getDay(TODAY);
    const idx = d.done ? D.POS.length - 1 : d.steps;
    hero.style.left = (D.POS[idx][0] / 3).toFixed(2) + '%';
    hero.style.top = (D.POS[idx][1] / 4.4).toFixed(2) + '%';
    hero.classList.remove('hop'); void hero.offsetWidth; hero.classList.add('hop');
    document.querySelectorAll('.node').forEach((n) => { n.className = 'node ' + nodeState(+n.dataset.i, d); });
    $('.goal').classList.toggle('on', d.done);
    $('#bubbleText').textContent = ui.say;
  }

  function doStep(i) {
    const d = getDay(TODAY);
    if (d.done || i !== d.steps) return;
    const last = i === D.STEPS.length - 1;
    upd(TODAY, (x) => { x.steps = i + 1; if (!x.t0) x.t0 = Date.now(); (x.times || (x.times = []))[i] = Date.now(); });
    ui.say = stepDone(i) + ' ' + (last ? '마지막까지 왔어!' : stepAsk(i + 1));
    tone([523 + i * 60, 659 + i * 60]);
    updateJourney();
    if (last) setTimeout(finish, 1100);
    if (i === 0) setTimeout(offerGame, 1000);   // 일어나기 직후, 밥 먹기 전
  }

  // ---------- 미니게임 (일어나기 → 밥먹기 사이, 하루 한 번 제안) ----------
  function offerGame() {
    const d = getDay(TODAY);
    if (!window.MQGame || d.gameDone || d.done || d.steps !== 1 || ui.tab !== 'today' || !$('#hero') || !$('#modal').hidden) return;
    openModal(`<div class="pop">
      <div class="sticker">${KID.pet}💤</div>
      <h2>잠깐! 준비운동 시간</h2>
      <p>잠꾸러기 친구들을 깨워볼까? (20초)</p>
      <button class="big go" data-act="gameStart">🎮 친구들 깨우기</button>
      <button class="big" data-act="gameSkip" style="min-height:48px">밥 먹으러 갈래</button>
    </div>`);
  }
  function gameDone(r) {
    ui.lock = false; closeModal();
    upd(TODAY, (x) => { x.gameDone = true; if (r) { x.game = { score: r.best, plays: r.plays }; x.gameMs = (x.gameMs || 0) + r.ms; } });
    ui.say = stepAsk(1); updateJourney();
  }

  function finish() {
    if (getDay(TODAY).done) return;
    const n = totalDone(), before = curHat(), best = bestSecs();
    const sticker = D.STICKERS[n % D.STICKERS.length];
    let secs = null, record = false;
    upd(TODAY, (x) => {
      x.done = true; x.sticker = sticker; x.doneAt = Date.now();
      // 걸린 시간에서 미니게임에 쓴 시간은 뺀다
      const took = x.t0 ? Math.round((Date.now() - x.t0 - (x.gameMs || 0)) / 1000) : 0;
      if (took > 0 && took < 3 * 3600) { x.secs = took; secs = took; record = best !== null && took < best; }
    });
    const after = curHat();
    ui.say = journeySay(getDay(TODAY));
    chips();
    updateJourney();
    if (ui.tab !== 'today') return;
    confetti();
    tone([523, 659, 784, 1047]);
    setTimeout(() => showReward(sticker, after !== before ? after : null, secs, record), 900);
  }

  function showReward(sticker, newHat, secs, record) {
    const n = totalDone(), s = streak();
    const next = D.HATS.find((h) => h.days > n);
    openModal(`<div class="pop">
      <div class="sticker">${sticker}</div>
      <h2>오늘의 스티커!</h2>
      <p>${n}번째 모험을 끝냈어요${s >= 2 ? ` · 🔥 ${s}일 연속` : ''}</p>
      ${HIGH && secs ? `<p>⏱️ ${fmtDur(secs)} 만에 도착!${record ? ' <b>🏅 나의 새 기록!</b>' : ''}</p>` : ''}
      ${newHat ? `<p><b>🎁 새 선물! 아침이가 ${newHat.icon} ${newHat.name}을(를) 썼어요!</b></p>` : ''}
      ${next ? `<p>다음 선물까지 ${next.days - n}번 남았어요 ${next.icon}</p>` : ''}
      <button class="big go" data-act="closeModal">좋아요! 🎉</button>
    </div>`);
  }

  function confetti() {
    const box = $('#confetti'), set = ['🎉', '⭐', '🌈', '✨', '🎈', '🍀'];
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('span');
      s.textContent = set[i % set.length];
      s.style.cssText = `left:${Math.random() * 100}%;font-size:${18 + Math.random() * 22}px;` +
        `animation-duration:${2.4 + Math.random() * 2}s;animation-delay:${Math.random() * 0.8}s`;
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 5200);
  }

  // ---------- 기록 ----------
  function renderLog() {
    const y = ui.ly, m = ui.lm;
    const lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    let cells = DOW.map((w) => `<div class="dow">${w}</div>`).join('') + '<div class="day empty"></div>'.repeat(lead);
    for (let n = 1; n <= days; n++) {
      const k = `${y}-${pad(m + 1)}-${pad(n)}`, d = getDay(k);
      cells += `<button class="day ${k === TODAY ? 'today' : ''} ${k === ui.sel ? 'sel' : ''}" data-act="day" data-k="${k}">
        <span>${n}</span><span class="dm">${d.mood ? moodOf(d.mood).icon : ''}</span><span class="ds">${d.done ? d.sticker || '⭐' : ''}</span></button>`;
    }
    const hats = D.HATS.filter((h) => h.days > 0).map((h) =>
      `<div class="hat-item ${totalDone() >= h.days ? '' : 'lock'}"><span class="e">${h.icon}</span>${h.days}일</div>`).join('');
    const best = HIGH ? Object.values(me().days).filter((d) => d.secs).map((d) => d.secs) : [];
    return `<div class="panel">
        <div class="cal-head"><button data-act="prevM" aria-label="이전 달">◀</button><h2 style="margin:0">${y}년 ${m + 1}월</h2><button data-act="nextM" aria-label="다음 달">▶</button></div>
        <div class="cal">${cells}</div>
      </div>
      ${renderDetail()}
      <div class="panel"><h2>🎁 아침이 선물 (모험 ${totalDone()}번 완료)</h2><div class="hats">${hats}</div>
        ${best.length ? `<p style="margin:10px 0 0">🏅 나의 최고 기록: <b>${fmtDur(Math.min.apply(null, best))}</b></p>` : ''}</div>`;
  }

  function renderDetail() {
    const k = ui.sel;
    if (!k) return '';
    const d = getDay(k), dt = parse(k);
    const head = `<h2>${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})</h2>`;
    if (!d.answer && !d.mood && !d.steps) return `<div class="panel detail">${head}<p>아직 기록이 없어요.</p></div>`;
    const steps = D.STEPS.map((s, i) => `<span class="${i < d.steps ? '' : 'off'}" title="${s.label}">${s.icon}</span>`).join('');
    return `<div class="panel detail">${head}
      ${d.answer ? `<p>💬 ${esc(d.answer.q)}<br><b>${d.answer.icon} ${esc(d.answer.label)}</b></p>` : ''}
      ${d.mood ? `<p>마음 날씨: <b>${moodOf(d.mood).icon} ${moodOf(d.mood).label}</b></p>` : ''}
      <div class="steps-row">${steps}${d.done ? `<span>${d.sticker || '⭐'}</span>` : ''}</div>
      ${HIGH && d.secs ? `<p>⏱️ ${fmtDur(d.secs)} 만에 도착</p>` : ''}</div>`;
  }

  // ---------- 설정 팝업 ----------
  function openModal(html) { const m = $('#modal'); m.innerHTML = html; m.hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  function openSettings() {
    openModal(`<div class="pop">
      <h2>⚙️ 설정</h2>
      <label><input id="setSound" type="checkbox" ${S.sound ? 'checked' : ''}> 효과음 켜기</label>
      <button class="big go" data-act="saveSettings">저장</button>
      <button class="big danger" data-act="resetAll">${esc(KID.name)} 기록 모두 지우기</button>
      <button class="big" data-act="closeModal" style="min-height:48px">닫기</button>
    </div>`);
  }

  function answer(icon, label) {
    upd(TODAY, (d) => { d.answer = { icon, label, q: curQ().q }; d.answerAt = Date.now(); });
    ui.pending = 'q-ack'; ui.typing = false; tone([523, 659]); render();
  }

  // ---------- 이벤트 ----------
  const ACT = {
    tab: (b) => { ui.tab = b.dataset.t; render(); },
    pickQ: (b) => { const c = curQ().a[+b.dataset.i]; answer(c[0], c[1]); },
    typeQ: () => { ui.typing = true; render(); const i = $('#typeInput'); if (i) i.focus(); },
    untype: () => { ui.typing = false; render(); },
    nextQ: () => { ui.pending = null; render(); },
    pickMood: (b) => { upd(TODAY, (d) => { d.mood = b.dataset.id; d.moodAt = Date.now(); }); ui.pending = 'mood-ack'; tone([494, 659]); render(); },
    nextMood: () => { ui.pending = null; render(); },
    step: (b) => doStep(+b.dataset.i),
    gameStart: () => { ui.lock = true; window.MQGame.start($('#modal .pop'), { high: HIGH, tone }, gameDone); },
    gameSkip: () => gameDone(null),
    speak: () => speak($('#bubbleText').textContent),
    settings: openSettings,
    closeModal,
    saveSettings: () => { S.sound = $('#setSound').checked; save(); closeModal(); },
    resetAll: () => {
      if (!confirm(`${KID.name}의 지난 기록이 모두 사라져요. 정말 지울까요?`)) return;
      // 이 기기의 기록만 지운다. 엄마 화면에 이미 올라간 지난 기록은 그대로 남는다.
      me().days = {}; me().dirty = {}; save(); ui.pending = null; closeModal(); render();
    },
    day: (b) => { ui.sel = b.dataset.k; render(); },
    prevM: () => { if (--ui.lm < 0) { ui.lm = 11; ui.ly--; } render(); },
    nextM: () => { if (++ui.lm > 11) { ui.lm = 0; ui.ly++; } render(); }
  };

  document.addEventListener('click', (e) => {
    if (e.target.id === 'modal') { if (!ui.lock) closeModal(); return; }   // 게임 중에는 바깥을 눌러도 닫히지 않는다
    const b = e.target.closest('[data-act]');
    if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b);
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'typeForm') return;
    e.preventDefault();
    const text = $('#typeInput').value.trim();
    if (text) answer('✍️', text); else $('#typeInput').focus();
  });

  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { flush(); pollReset(); });
  setInterval(pollReset, 15000);
  render();
  flush();
  pollReset();
})();

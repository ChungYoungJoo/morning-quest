// 아침·저녁 모험 — 질문 → 마음 날씨 → 루틴 여행. 아침(일어나서 밥 먹기 전까지)과 저녁(저녁 먹고 자기 전까지) 두 가지.
// 주소마다 한 아이(/somi/, /sobin/)가 열리고, 학년(저학년/고학년)에 따라 문구와 기능이 다르다.
(function () {
  'use strict';
  const LOG_SRC = document.currentScript ? document.currentScript.src.replace(/app\.js.*$/, 'log.js') : '../log.js';
  const D = window.MQ;
  const KID = D.KIDS[window.MQ_KID];
  if (!KID) { document.body.textContent = '주소가 잘못됐어요.'; return; }
  const HIGH = KID.grade >= 3;   // 고학년: 걸린 시간 기록, 🐝 함정 / 저학년: 큰 글씨
  const KEY = 'morning-quest-v2';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const PARTS = ['am', 'pm'];
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

  // 아침/저녁마다 다른 것들 (단계, 길 위치, 질문, 도착 문구, 꾸밈)
  const P = (part) => (part === 'pm'
    ? { steps: D.STEPS_PM, pos: D.POS_PM, deco: D.DECO_PM, goal: ['🌙', '잘 자요!'], icon: '🌙', label: '저녁',
        qs: HIGH ? D.QUESTIONS_PM_HIGH : D.QUESTIONS_PM_LOW }
    : { steps: D.STEPS, pos: D.POS, deco: D.DECO_AM, goal: ['🏰', '하루 시작!'], icon: '🌅', label: '아침',
        qs: HIGH ? D.QUESTIONS_HIGH : D.QUESTIONS_LOW });

  // ---------- 저장 (이 기기의 브라우저 안에, 아이별로 따로) ----------
  let S = load();
  function load() {
    try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && o.kids) return o; } catch (e) { /* 새로 시작 */ }
    return { sound: true, kids: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장 불가여도 계속 동작 */ } }
  // 아침 기록은 days, 저녁 기록은 pmDays (날짜 → 기록)
  const me = () => { const k = S.kids[KID.id] || (S.kids[KID.id] = { days: {} }); if (!k.pmDays) k.pmDays = {}; return k; };
  const recs = (part) => (part === 'pm' ? me().pmDays : me().days);
  const blank = () => ({ answer: null, mood: null, steps: 0, done: false, sticker: null, t0: null, secs: null, v: 2 });
  const getDay = (k, part) => recs(part)[k] || blank();
  // late: 그날이 지난 뒤(다음날)에 체크한 기록
  function upd(k, fn, part) { const m = recs(part); const d = m[k] || (m[k] = blank()); fn(d); d.at = Date.now(); if (k !== TODAY) d.late = true; save(); markDirty(k, part); }

  // 저녁에서 '영어책 1권'(5번째 칸)을 뺐다. v 가 없는 예전 저녁 기록은 그 칸을 빼서 맞춘다.
  function fixPm(d) {
    if (d.v >= 2) return;
    if ((d.steps || 0) >= 5) d.steps -= 1;
    if (d.times && d.times.length > 4) d.times.splice(4, 1);
    d.v = 2;
  }
  Object.values(me().pmDays).forEach(fixPm);
  save();
  const curPart = () => (ui.tab === 'pm' ? 'pm' : 'am');   // 지금 보고 있는 모험 (기록 탭에서는 아침으로 본다)

  // 끝낸 모험 수(아침+저녁)와 연속일(아침이든 저녁이든 하나라도 끝낸 날)
  const totalDone = () => PARTS.reduce((n, p) => n + Object.values(recs(p)).filter((d) => d.done).length, 0);
  const dayActive = (k) => PARTS.some((p) => getDay(k, p).done);
  function streak() {
    const d = parse(TODAY);
    if (!dayActive(TODAY)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (dayActive(fmt(d))) { n++; d.setDate(d.getDate() - 1); }
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
  const curQ = (part) => { const qs = P(part).qs; return qs[dayIdx(ui.day) % qs.length]; };
  const moodOf = (id) => D.MOODS.find((m) => m.id === id);
  const stepAsk = (part, i) => { const s = P(part).steps[i]; return HIGH ? s.ask4 : s.ask; };
  const stepDone = (part, i) => { const s = P(part).steps[i]; return HIGH ? s.done4 : s.done; };
  const moodSay = (m, part) => (part === 'pm' ? D.PM_SAY[m.id] : HIGH ? m.say4 : m.say);
  const fmtDur = (s) => (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`);

  // 이 아이의 가장 빠른 완주 기록 (오늘은 제외)
  function bestSecs(part) {
    const v = Object.entries(recs(part)).filter(([k, d]) => k !== ui.day && d.done && d.secs).map(([, d]) => d.secs);
    return v.length ? Math.min.apply(null, v) : null;
  }

  // ---------- 엄마 화면으로 보내기 ----------
  // 바뀐 기록을 Supabase 에 올린다 (쓰기 전용). 인터넷이 없거나 아직 설정 전이면 '보낼 것'으로 남겨뒀다가
  // 다음에 다시 시도하므로, 앱은 어떤 경우에도 멈추지 않는다. ?date= 테스트 때는 보내지 않는다.
  const CLOUD = window.MQ_CLOUD;
  const LIVE = !new URLSearchParams(location.search).has('date');
  let pushTimer, flushing = false;
  function markDirty(k, part) {
    if (!CLOUD || !LIVE) return;
    (me().dirty || (me().dirty = {}))[`${part}|${k}`] = Date.now() + Math.random();
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
      for (const key of keys) {
        const mark = me().dirty[key];
        const [part, k] = key.indexOf('|') > 0 ? key.split('|') : ['am', key];   // 예전 형식(날짜만)은 아침
        const r = await fetch(`${CLOUD.url}/rest/v1/rpc/mq_save`, {
          method: 'POST', keepalive: true,
          headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_kid: KID.id, p_day: k, p_data: recs(part)[k] || null, p_part: part })
        });
        // 400 = 서버가 거절한 기록(너무 오래됨 등): 다시 보내도 소용없으니 버린다. 404/5xx/오프라인은 나중에 재시도.
        if (r.ok || r.status === 400) { if (me().dirty[key] === mark) delete me().dirty[key]; save(); } else break;
      }
    } catch (e) { /* 오프라인 — 다음에 다시 */ }
    flushing = false;
  }

  // 엄마가 확인 화면에서 "다시 시작"·"기록 모두 지우기"를 눌렀는지 서버에 물어본다 (읽는 건 '눌렀던 시각'뿐).
  // 눌렀다면 이 기기의 해당 기록을 지우고 처음 화면으로 돌아간다.
  async function pollReset() {
    if (!CLOUD || !LIVE || document.hidden) return;
    try {
      const r = await fetch(`${CLOUD.url}/rest/v1/rpc/mq_poll_resets`, {
        method: 'POST',
        headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_kid: KID.id, p_day: TODAY })
      });
      if (!r.ok) return;
      const res = await r.json();          // { day: 아침 다시 시작 시각, pm: 저녁 다시 시작 시각, all: 모두 지우기 시각 } (없으면 null)
      if (!res) return;
      const seen = me().resetSeen || (me().resetSeen = {});
      const wipe = [];                     // 이 기기에서 지울 [part, 날짜]
      // 지우기 요청 뒤에 아이가 이미 새로 시작했다면(기록이 요청보다 새것) 그 기록은 그대로 둔다
      const older = (part, k, ts) => { const d = recs(part)[k]; return d && (!d.at || new Date(ts).getTime() > d.at); };
      if (res.all && seen.ALL !== res.all) {
        seen.ALL = res.all;
        PARTS.forEach((p) => Object.keys(recs(p)).forEach((k) => { if (older(p, k, res.all)) wipe.push([p, k]); }));
      }
      [['am', res.day], ['pm', res.pm]].forEach(([p, ts]) => {
        const sk = `${p}|${TODAY}`;
        if (ts && seen[sk] !== ts) {
          seen[sk] = ts;
          if (older(p, TODAY, ts) && !wipe.some((w) => w[0] === p && w[1] === TODAY)) wipe.push([p, TODAY]);
        }
      });
      save();
      if (!wipe.length) return;
      wipe.forEach(([p, k]) => { delete recs(p)[k]; markDirty(k, p); });   // 서버에 늦게 올라온 낡은 기록이 되살아났다면 같이 지운다
      ui.pending = null; ui.typing = false; ui.lock = false; closeModal(); ui.sel = TODAY; render();
    } catch (e) { /* 오프라인이면 다음에 */ }
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
  const YEST = (() => { const d = parse(TODAY); d.setDate(d.getDate() - 1); return fmt(d); })();
  // tab: 'am' 아침 / 'pm' 저녁 / 'log' 기록. 열 때는 시간에 맞는 쪽으로 시작하고, 이후엔 아이가 직접 고른다.
  // day: 지금 체크하는 날 (오늘 또는 어제). 어제 못 한 것을 다음날 이어서 할 수 있다.
  const ui = { tab: new Date().getHours() < 15 ? 'am' : 'pm', day: TODAY, pending: null, typing: false, say: '', ly: t0.getFullYear(), lm: t0.getMonth(), sel: TODAY };

  const heroHtml = (cls) =>
    `<div class="${cls}">${curHat().icon ? `<span class="hat">${curHat().icon}</span>` : ''}${KID.pet}</div>`;
  const bubble = (text) =>
    `<div class="bubble"><p id="bubbleText">${esc(text)}</p><button class="spk" data-act="speak" aria-label="소리로 듣기">🔊</button></div>`;
  const greet = (part) => (part === 'pm'
    ? `오늘 하루 수고했어, ${call(KID.name)}!`
    : `${new Date().getHours() < 11 ? '좋은 아침' : '안녕'}, ${call(KID.name)}!`);

  function chips() {
    $('#chips').innerHTML =
      `<span class="chip">${KID.pet} ${esc(KID.name)}</span>` +
      (streak() >= 2 ? `<span class="chip">🔥 ${streak()}</span>` : '') +
      `<span class="chip">⭐ ${totalDone()}</span>` +
      `<button class="gear" data-act="settings" aria-label="설정">⚙️</button>`;
  }

  function render() {
    chips();
    const part = curPart(), log = ui.tab === 'log';
    document.body.classList.toggle('pm', ui.tab === 'pm');
    document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === ui.tab));
    $('#title').textContent = log ? '📒 나의 기록' : `${P(part).icon} ${P(part).label} 모험`;
    $('#screen').innerHTML = log ? renderLogTab() : renderDayBar(part) + renderToday(part);
    updateLockIcon();
    if (log || !$('#hero')) return;
    const d = getDay(ui.day, part), day = ui.day;
    if (d.steps === P(part).steps.length && !d.done) setTimeout(() => finish(part, day), 700);
    if (part === 'am' && d.steps === 1 && !d.gameDone) setTimeout(offerGame, 600);
  }

  // 기록 탭은 처음 열 때 log.js 를 불러온다 (app.js 를 가볍게 두려고 나눈 파일)
  let logRender = null, logLoading = false;
  function renderLogTab() {
    if (window.MQLog) {
      logRender = logRender || window.MQLog({ D, PARTS, DOW, HIGH, TODAY, ui, P, getDay, recs, moodOf, totalDone, fmtDur, esc, pad, parse });
      return logRender();
    }
    if (!logLoading) {
      logLoading = true;
      const s = document.createElement('script');
      s.src = LOG_SRC;
      s.onload = () => { if (ui.tab === 'log') render(); };
      s.onerror = () => { logLoading = false; };
      document.head.appendChild(s);
    }
    return '<div class="panel"><p>기록을 불러오는 중이에요…</p></div>';
  }

  // 저녁 모험은 그날 아침 모험을 끝내야 열린다 (이미 끝낸 저녁이면 계속 볼 수 있다)
  const pmLocked = () => !getDay(ui.day, 'am').done && !getDay(ui.day, 'pm').done;
  function updateLockIcon() {
    const s = document.querySelector('.nav button[data-t=pm] span');
    if (s) s.textContent = pmLocked() ? '🔒' : '🌙';
  }
  function renderLocked() {
    const am = getDay(ui.day, 'am'), yest = ui.day !== TODAY;
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(`${call(KID.name)}, 저녁 모험은 ${yest ? '어제' : '오늘'} 아침 모험을 끝내야 열려요! 먼저 아침 모험부터 해볼까?`)}
      <div class="panel" style="text-align:center">🔒 ${yest ? '어제 ' : ''}아침 모험 <b>${am.steps || 0}/${P('am').steps.length}</b></div>
      <button class="big go" data-act="goAm">🌅 아침 모험하러 가기</button>`;
  }

  // 오늘 / 어제 고르기. 어제 칸에는 그 모험이 아직 안 끝났으면 📝, 끝났으면 ✅ 를 붙인다.
  const yestLabel = (part) => { const y = parse(YEST); return `어제 (${y.getMonth() + 1}/${y.getDate()}) ${getDay(YEST, part).done ? '✅' : '📝'}`; };
  function renderDayBar(part) {
    return `<div class="daybar">
      <button class="${ui.day === TODAY ? 'on' : ''}" data-act="setDay" data-d="${TODAY}">📅 오늘</button>
      <button class="${ui.day === YEST ? 'on' : ''}" data-act="setDay" data-d="${YEST}">${yestLabel(part)}</button>
    </div>${ui.day === YEST ? `<div class="notice yest">📅 어제 ${P(part).label} 모험을 이어서 하고 있어요. 어제 날짜로 기록돼요.</div>` : ''}`;
  }

  // ---------- 오늘: 질문 → 마음 날씨 → 루틴 여행 ----------
  function renderToday(part) {
    if (part === 'pm' && pmLocked()) return renderLocked();
    const d = getDay(ui.day, part);
    if (ui.pending === 'q-ack' && d.answer) return renderQAck(d, part);
    if (!d.answer) return renderQ(part);
    if (ui.pending === 'mood-ack' && d.mood) return renderMoodAck(d, part);
    if (!d.mood) return renderMood(part);
    return renderJourney(d, part);
  }

  function renderQ(part) {
    const q = curQ(part);
    const hello = ui.day === TODAY ? `${greet(part)} 오늘의 질문! ${q.q}`
      : `${call(KID.name)}, 어제 ${P(part).label} 모험을 이어서 해볼까? 어제의 질문! ${q.q}`;
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

  function renderQAck(d, part) {
    const r = HIGH ? D.REACTIONS_HIGH : D.REACTIONS_LOW;
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(r[(dayIdx(ui.day) + d.answer.label.length) % r.length])}
      <div class="grid"><button class="big picked wide" style="min-height:72px"><span class="e">${d.answer.icon}</span>${esc(d.answer.label)}</button></div>
      <button class="big go" data-act="nextQ">다음 ▶ 마음 날씨 알려줘</button>`;
  }

  function renderMood(part) {
    const ask = part === 'pm' ? '오늘 하루 마음은 어떤 날씨였어?' : HIGH ? '지금 마음은 어떤 날씨야?' : '오늘 네 마음은 어떤 날씨야?';
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(ask)}
      <div class="moods">
        ${D.MOODS.map((m) => `<button class="big" data-act="pickMood" data-id="${m.id}"><span class="e">${m.icon}</span>${m.label}</button>`).join('')}
      </div>`;
  }

  function renderMoodAck(d, part) {
    const m = moodOf(d.mood);
    return `<div class="stage">${heroHtml('hero-big')}</div>
      ${bubble(moodSay(m, part))}
      <div class="grid"><button class="big picked wide" style="min-height:72px"><span class="e">${m.icon}</span>${m.label}</button></div>
      <button class="big go" data-act="nextMood">${part === 'pm' ? '🌙 저녁 모험 떠나기!' : '🚩 모험 떠나기!'}</button>`;
  }

  // ---------- 루틴 여행 ----------
  const pos = (part, i) => { const p = P(part).pos[i]; return `left:${(p[0] / 3).toFixed(2)}%;top:${(p[1] / 4.4).toFixed(2)}%`; };
  function trailPath(part) {
    const Q = P(part).pos;
    let s = `M${Q[0][0]} ${Q[0][1]}`;
    for (let i = 1; i < Q.length; i++) {
      const a = Q[i - 1], b = Q[i], my = (a[1] + b[1]) / 2;
      s += ` C${a[0]} ${my} ${b[0]} ${my} ${b[0]} ${b[1]}`;
    }
    return s;
  }
  const nodeState = (i, d) => (i < d.steps ? 'done' : i === d.steps && !d.done ? 'cur' : 'lock');
  const heroIdx = (d, part) => (d.done ? P(part).pos.length - 1 : d.steps);

  function journeySay(d, part) {
    if (d.done && ui.day !== TODAY) return `어제 ${P(part).label} 모험도 끝! 잘했어. 오늘 모험도 하러 갈까? ${curHat().icon || '🌟'}`;
    if (d.done) return part === 'pm'
      ? `오늘 하루 끝! 정말 수고했어. 잘 자, 내일 아침에 만나자 ${curHat().icon || '🌙'}`
      : `오늘 모험 끝! 정말 멋졌어. 내일 아침에 또 만나자 ${curHat().icon || '👋'}`;
    if (d.steps === 0) return `${call(KID.name)}, ${part === 'pm' ? '저녁 ' : ''}모험 출발! ${stepAsk(part, 0)}`;
    if (d.steps === P(part).steps.length) return '마지막까지 왔어! 이제 도착이야!';
    return stepAsk(part, d.steps);
  }

  function renderJourney(d, part) {
    const C = P(part);
    ui.say = journeySay(d, part);
    const nodes = C.steps.map((s, i) =>
      `<button class="node ${nodeState(i, d)}" data-act="step" data-i="${i}" style="${pos(part, i + 1)}" aria-label="${s.label}"><span>${s.icon}</span><span class="nl">${s.label}</span></button>`).join('');
    return `${bubble(ui.say)}
      <div class="map">
        <svg class="trail" viewBox="0 0 300 440" preserveAspectRatio="none" aria-hidden="true">
          <path d="${trailPath(part)}" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="1 14" stroke-linecap="round"/>
        </svg>
        ${C.deco.map((x) => `<span class="deco" style="left:${x[1]}%;top:${x[2]}%">${x[0]}</span>`).join('')}
        <div class="start" style="${pos(part, 0)}">🚩<small>출발</small></div>
        ${nodes}
        <div class="goal ${d.done ? 'on' : ''}" style="${pos(part, C.pos.length - 1)}">${C.goal[0]}<small>${C.goal[1]}</small></div>
        <div id="hero" class="hero" style="${pos(part, heroIdx(d, part))}">${heroHtml('face')}</div>
      </div>`;
  }

  // 화면을 다시 그리지 않고 제자리에서 바꿔야 아침이가 깡충 뛰는 움직임이 보인다.
  function updateJourney(part, day) {
    const hero = $('#hero');
    if (!hero || ui.tab !== part || ui.day !== (day || ui.day)) return;   // 그 사이 다른 탭·날짜로 옮겼으면 건드리지 않는다
    const d = getDay(ui.day, part);
    const p = P(part).pos[heroIdx(d, part)];
    hero.style.left = (p[0] / 3).toFixed(2) + '%';
    hero.style.top = (p[1] / 4.4).toFixed(2) + '%';
    hero.classList.remove('hop'); void hero.offsetWidth; hero.classList.add('hop');
    document.querySelectorAll('.node').forEach((n) => { n.className = 'node ' + nodeState(+n.dataset.i, d); });
    $('.goal').classList.toggle('on', d.done);
    $('#bubbleText').textContent = ui.say;
  }

  function doStep(i) {
    const part = curPart(), C = P(part), day = ui.day, d = getDay(day, part);
    if (d.done || i !== d.steps || (part === 'pm' && pmLocked())) return;
    const last = i === C.steps.length - 1;
    upd(day, (x) => { x.steps = i + 1; if (!x.t0) x.t0 = Date.now(); (x.times || (x.times = []))[i] = Date.now(); }, part);
    ui.say = stepDone(part, i) + ' ' + (last ? (part === 'pm' ? '' : '마지막까지 왔어!') : stepAsk(part, i + 1));
    tone([523 + i * 50, 659 + i * 50]);
    updateJourney(part, day);
    if (last) setTimeout(() => finish(part, day), 1100);
    if (part === 'am' && i === 0) setTimeout(offerGame, 1000);   // 아침: 일어나기 직후, 밥 먹기 전
  }

  // ---------- 미니게임 (아침 일어나기 → 밥먹기 사이, 하루 한 번 제안) ----------
  function offerGame() {
    const d = getDay(ui.day, 'am');
    // 어제 아침을 뒤늦게 채울 때는 게임을 권하지 않는다
    if (!window.MQGame || ui.day !== TODAY || d.gameDone || d.done || d.steps !== 1 || ui.tab !== 'am' || !$('#hero') || !$('#modal').hidden) return;
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
    upd(ui.day, (x) => { x.gameDone = true; if (r) { x.game = { score: r.best, plays: r.plays }; x.gameMs = (x.gameMs || 0) + r.ms; } }, 'am');
    ui.say = stepAsk('am', 1); updateJourney('am');
  }

  function finish(part, day) {
    if (getDay(day, part).done) return;
    const n = totalDone(), before = curHat(), best = bestSecs(part);
    const sticker = D.STICKERS[n % D.STICKERS.length];
    let secs = null, record = false;
    upd(day, (x) => {
      x.done = true; x.sticker = sticker; x.doneAt = Date.now();
      // 걸린 시간에서 미니게임에 쓴 시간은 뺀다. 다음날 이어서 한 기록은 시간 기록에서 제외한다.
      const took = x.t0 ? Math.round((Date.now() - x.t0 - (x.gameMs || 0)) / 1000) : 0;
      if (day === TODAY && took > 0 && took < 3 * 3600) { x.secs = took; secs = took; record = best !== null && took < best; }
    }, part);
    const after = curHat();
    chips(); updateLockIcon();
    if (ui.tab !== part || ui.day !== day) return;   // 그 사이 다른 탭·날짜로 옮겼으면 기록만 남기고 조용히 끝낸다
    ui.say = journeySay(getDay(day, part), part);
    updateJourney(part, day);
    const yb = document.querySelector(`.daybar button[data-d="${YEST}"]`);
    if (yb) yb.textContent = yestLabel(part);
    confetti();
    tone([523, 659, 784, 1047]);
    setTimeout(() => showReward(sticker, after !== before ? after : null, secs, record, part), 900);
  }

  function showReward(sticker, newHat, secs, record, part) {
    const n = totalDone(), s = streak();
    const next = D.HATS.find((h) => h.days > n);
    openModal(`<div class="pop">
      <div class="sticker">${sticker}</div>
      <h2>${part === 'pm' ? '오늘 하루 수고했어요! 🌙' : '오늘의 스티커!'}</h2>
      <p>${n}번째 모험을 끝냈어요${s >= 2 ? ` · 🔥 ${s}일 연속` : ''}</p>
      ${HIGH && secs ? `<p>⏱️ ${fmtDur(secs)} 만에 도착!${record ? ' <b>🏅 나의 새 기록!</b>' : ''}</p>` : ''}
      ${newHat ? `<p><b>🎁 새 선물! 아침이가 ${newHat.icon} ${newHat.name}을(를) 썼어요!</b></p>` : ''}
      ${next ? `<p>다음 선물까지 ${next.days - n}번 남았어요 ${next.icon}</p>` : ''}
      <button class="big go" data-act="closeModal">${part === 'pm' ? '잘 자요 🌙' : '좋아요! 🎉'}</button>
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

  // ---------- 설정 팝업 ----------
  function openModal(html) { const m = $('#modal'); m.innerHTML = html; m.hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  function openSettings() {
    openModal(`<div class="pop">
      <h2>⚙️ 설정</h2>
      <label><input id="setSound" type="checkbox" ${S.sound ? 'checked' : ''}> 효과음 켜기</label>
      <button class="big go" data-act="saveSettings">저장</button>
      <button class="big" data-act="closeModal" style="min-height:48px">닫기</button>
    </div>`);
  }

  function answer(icon, label) {
    const part = curPart();
    if (part === 'pm' && pmLocked()) return;
    upd(ui.day, (d) => { d.answer = { icon, label, q: curQ(part).q }; d.answerAt = Date.now(); }, part);
    ui.pending = 'q-ack'; ui.typing = false; tone([523, 659]); render();
  }

  // ---------- 이벤트 ----------
  const ACT = {
    tab: (b) => { ui.tab = b.dataset.t; ui.pending = null; ui.typing = false; render(); },
    goAm: () => { ui.tab = 'am'; ui.pending = null; ui.typing = false; render(); },
    setDay: (b) => { ui.day = b.dataset.d; ui.pending = null; ui.typing = false; render(); },
    pickQ: (b) => { const c = curQ(curPart()).a[+b.dataset.i]; answer(c[0], c[1]); },
    typeQ: () => { ui.typing = true; render(); const i = $('#typeInput'); if (i) i.focus(); },
    untype: () => { ui.typing = false; render(); },
    nextQ: () => { ui.pending = null; render(); },
    pickMood: (b) => { upd(ui.day, (d) => { d.mood = b.dataset.id; d.moodAt = Date.now(); }, curPart()); ui.pending = 'mood-ack'; tone([494, 659]); render(); },
    nextMood: () => { ui.pending = null; render(); },
    step: (b) => doStep(+b.dataset.i),
    gameStart: () => { ui.lock = true; window.MQGame.start($('#modal .pop'), { high: HIGH, tone }, gameDone); },
    gameSkip: () => gameDone(null),
    speak: () => speak($('#bubbleText').textContent),
    settings: openSettings,
    closeModal,
    saveSettings: () => { S.sound = $('#setSound').checked; save(); closeModal(); },
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
  document.addEventListener('visibilitychange', () => {
    // 밤새 열어둔 화면이면 날짜가 바뀐 것이니 새로 불러온다 (안 그러면 어제 날짜로 기록된다)
    if (LIVE && !document.hidden && fmt(new Date()) !== TODAY) { location.reload(); return; }
    flush(); pollReset();
  });
  setInterval(pollReset, 15000);
  render();
  flush();
  pollReset();
})();

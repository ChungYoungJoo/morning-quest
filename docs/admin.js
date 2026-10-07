// 아침 모험 — 엄마 확인 화면. 비밀번호가 맞아야 서버(mq_admin_list)가 아이들의 기록을 돌려준다.
(function () {
  'use strict';
  const D = window.MQ, C = window.MQ_CLOUD;
  const PASS_KEY = 'mq-admin-pass';
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const KIDS = Object.values(D.KIDS);

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return fmt(d); };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDur = (s) => (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`);
  const moodOf = (id) => D.MOODS.find((m) => m.id === id);

  const TODAY = fmt(new Date());
  const MSG = {
    wrong: '비밀번호가 달라요.',
    locked: '여러 번 틀려서 10분 동안 잠겼어요. 잠시 뒤에 다시 해주세요.',
    not_set: '엄마 비밀번호가 아직 정해지지 않았어요. supabase/schema.sql 맨 아래 안내대로 정해주세요.'
  };

  let pass = sessionStorage.getItem(PASS_KEY) || localStorage.getItem(PASS_KEY) || '';
  let rows = {};            // 'somi|2026-10-07' -> { data, updated_at }
  let sel = TODAY, loadedAt = null, timer = null;

  async function fetchRows() {
    const r = await fetch(`${C.url}/rest/v1/rpc/mq_admin_list`, {
      method: 'POST',
      headers: { apikey: C.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_pass: pass, p_from: addDays(TODAY, -60), p_to: addDays(TODAY, 1) })
    });
    if (r.status === 404) throw new Error('서버 설정이 아직 안 됐어요. supabase/schema.sql 을 실행해야 해요.');
    if (!r.ok) throw new Error(`서버가 응답하지 않았어요 (${r.status}). 잠시 뒤에 다시 해보세요.`);
    return r.json();
  }

  async function refresh(showErrorOnLogin) {
    let res;
    try { res = await fetchRows(); } catch (e) {
      if (showErrorOnLogin) return showLogin(e.message || '인터넷 연결을 확인해주세요.');
      $('#status').textContent = '⚠️ ' + (e.message || '인터넷 연결을 확인해주세요.');
      return;
    }
    if (!res.ok) { sessionStorage.removeItem(PASS_KEY); localStorage.removeItem(PASS_KEY); pass = ''; return showLogin(MSG[res.reason] || '열 수 없어요.'); }
    rows = {};
    res.rows.forEach((x) => { rows[`${x.kid}|${x.day}`] = x; });
    loadedAt = new Date();
    showMain();
  }

  // ---------- 로그인 ----------
  function showLogin(msg) {
    clearInterval(timer);
    $('#view').innerHTML = `<div class="panel">
      <h2>🔒 엄마 확인 화면</h2>
      <p>아이들이 오늘 쓰고 누른 것을 볼 수 있어요. 비밀번호를 넣어주세요.</p>
      <form class="form" id="loginForm">
        <input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호">
        <label style="display:flex;gap:8px;align-items:center"><input id="remember" type="checkbox"> 이 기기에서는 기억하기</label>
        <button class="big go" type="submit">열기</button>
      </form>
      <p id="loginMsg" style="color:#b3261e;margin:8px 0 0">${msg ? esc(msg) : ''}</p>
    </div>`;
  }

  // ---------- 화면 ----------
  function stepsHtml(d) {
    return D.STEPS.map((s, i) => {
      const t = d.times && d.times[i];
      return `<div class="tl ${t ? '' : 'off'}"><span class="e">${s.icon}</span><span>${s.label}</span><b>${t ? hhmm(t) : '—'}</b></div>`;
    }).join('');
  }

  function card(kid, rec) {
    const head = `<h2>${kid.pet} ${esc(kid.name)} <small>초${kid.grade}</small></h2>`;
    // 아이 기기가 '오늘'만 확인하므로 오늘 날짜일 때만 다시 시작 버튼을 보여준다
    const resetBtn = sel === TODAY
      ? `<button class="big resetbtn" data-a="reset" data-kid="${kid.id}">↺ ${esc(kid.name)} 오늘 다시 시작하게 하기</button>` : '';
    if (!rec) return `<div class="panel">${head}<p class="muted">⚪ 아직 시작 전이에요.</p>${resetBtn}</div>`;
    const d = rec.data, mood = d.mood ? moodOf(d.mood) : null;
    const status = d.done ? '✅ 모험 완료!' : `🟡 진행 중 (${d.steps || 0}/${D.STEPS.length})`;
    const worry = mood && (mood.id === 'rain' || mood.id === 'storm');
    return `<div class="panel">${head}
      <p><b>${status}</b>${d.done && d.secs ? ` · ⏱️ ${fmtDur(d.secs)}` : ''}</p>
      ${mood ? `<p>마음 날씨: <b>${mood.icon} ${mood.label}</b>${d.moodAt ? ` <span class="muted">${hhmm(d.moodAt)}</span>` : ''}</p>` : '<p class="muted">마음 날씨: 아직 안 골랐어요</p>'}
      ${worry ? `<p class="notice">💛 마음이 힘든 날씨를 골랐어요. 오늘 이야기를 나눠보면 좋겠어요.</p>` : ''}
      ${d.answer ? `<p>💬 ${esc(d.answer.q)}<br><b>${d.answer.icon} ${esc(d.answer.label)}</b>${d.answerAt ? ` <span class="muted">${hhmm(d.answerAt)}</span>` : ''}</p>` : '<p class="muted">오늘의 질문: 아직 대답 안 했어요</p>'}
      <div class="timeline">${stepsHtml(d)}</div>
      ${d.game ? `<p>🎮 친구 깨우기: <b>${d.game.score}명</b> <span class="muted">(${d.game.plays}번 도전)</span></p>` : d.gameDone ? '<p class="muted">🎮 친구 깨우기: 건너뜀</p>' : ''}
      <p class="muted" style="margin:8px 0 0">마지막 기록 ${hhmm(rec.updated_at)}</p>${resetBtn}</div>`;
  }

  // 한 아이의 기록 전부를 서버에서 지운다. 실수로 누르지 않게 이름을 직접 입력해야 한다.
  async function wipeKid(id) {
    const kid = D.KIDS[id];
    if (!kid) return;
    const typed = prompt(`${kid.name}의 기록을 전부 지워요. 되돌릴 수 없어요.\n계속하려면 "${kid.name}" 이름을 그대로 입력하세요.`);
    if (typed === null) return;
    if (typed.trim() !== kid.name) { alert('이름이 달라서 지우지 않았어요.'); return; }
    try {
      const r = await fetch(`${C.url}/rest/v1/rpc/mq_admin_reset_all`, {
        method: 'POST',
        headers: { apikey: C.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_pass: pass, p_kid: id })
      });
      if (r.status === 404) throw new Error('서버 업데이트가 아직 안 됐어요. supabase/schema.sql 을 Supabase 에서 다시 실행해주세요.');
      if (!r.ok) throw new Error(`서버가 응답하지 않았어요 (${r.status}). 잠시 뒤에 다시 해보세요.`);
      const res = await r.json();
      if (!res.ok) {
        if (MSG[res.reason]) { sessionStorage.removeItem(PASS_KEY); localStorage.removeItem(PASS_KEY); pass = ''; return showLogin(MSG[res.reason]); }
        throw new Error('지우지 못했어요.');
      }
      await refresh(false);
      const s = $('#status');
      if (s) s.textContent = `✅ ${kid.name}의 기록 ${res.deleted}일치를 모두 지웠어요. ${kid.name} 기기에서도 곧 지워져요.`;
    } catch (e) { alert(e.message || '인터넷 연결을 확인해주세요.'); }
  }

  // 오늘 기록을 서버에서 지우고, 아이 기기가 곧 처음 화면으로 돌아가게 한다 (아이 기기는 15초마다 확인)
  async function resetKid(id) {
    const kid = D.KIDS[id];
    if (!kid || !confirm(`${kid.name}의 오늘 기록을 지우고 처음부터 다시 하게 할까요?\n${kid.name} 화면이 열려 있으면 잠시 뒤 처음 화면으로 돌아가요.`)) return;
    try {
      const r = await fetch(`${C.url}/rest/v1/rpc/mq_admin_reset`, {
        method: 'POST',
        headers: { apikey: C.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_pass: pass, p_kid: id, p_day: TODAY })
      });
      if (r.status === 404) throw new Error('서버 업데이트가 아직 안 됐어요. supabase/schema.sql 을 Supabase 에서 다시 실행해주세요.');
      if (!r.ok) throw new Error(`서버가 응답하지 않았어요 (${r.status}). 잠시 뒤에 다시 해보세요.`);
      const res = await r.json();
      if (!res.ok) {
        if (MSG[res.reason]) { sessionStorage.removeItem(PASS_KEY); localStorage.removeItem(PASS_KEY); pass = ''; return showLogin(MSG[res.reason]); }
        throw new Error('지우지 못했어요.');
      }
      await refresh(false);
      const s = $('#status');
      if (s) s.textContent = `✅ ${kid.name}의 오늘 기록을 지웠어요. ${kid.name} 화면은 잠시 뒤 처음부터 다시 시작돼요.`;
    } catch (e) { alert(e.message || '인터넷 연결을 확인해주세요.'); }
  }

  function overview() {
    const days = Array.from({ length: 14 }, (_, i) => addDays(TODAY, -i));
    const cell = (kid, k) => {
      const rec = rows[`${kid.id}|${k}`];
      if (!rec) return '<td class="muted">–</td>';
      const d = rec.data, m = d.mood ? moodOf(d.mood).icon : '';
      return `<td>${m} ${d.done ? '✅' : `🟡${d.steps || 0}`}</td>`;
    };
    return `<div class="panel"><h2>📅 최근 2주</h2>
      <table class="ov"><thead><tr><th>날짜</th>${KIDS.map((k) => `<th>${k.pet} ${esc(k.name)}</th>`).join('')}</tr></thead><tbody>
      ${days.map((k) => { const dt = parse(k); return `<tr class="${k === sel ? 'sel' : ''}" data-day="${k}"><td>${dt.getMonth() + 1}/${dt.getDate()} (${DOW[dt.getDay()]})</td>${KIDS.map((kid) => cell(kid, k)).join('')}</tr>`; }).join('')}
      </tbody></table></div>`;
  }

  function showMain() {
    const dt = parse(sel);
    $('#view').innerHTML = `<div class="panel datebar">
        <button data-a="prev" aria-label="전날">◀</button>
        <div><b>${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})</b>${sel === TODAY ? ' · 오늘' : ''}</div>
        <button data-a="next" aria-label="다음날" ${sel >= TODAY ? 'disabled' : ''}>▶</button>
      </div>
      ${KIDS.map((kid) => card(kid, rows[`${kid.id}|${sel}`])).join('')}
      ${overview()}
      <div class="panel"><h2>🧹 기록 모두 지우기</h2>
        <p class="muted" style="margin:0 0 8px">한 아이의 지난 기록 전체를 지워요(스티커·선물도 처음부터). 되돌릴 수 없어요. 아이 기기에서도 곧 지워져요.</p>
        <div class="bar">${KIDS.map((k) => `<button class="big resetbtn" style="margin:0" data-a="wipe" data-kid="${k.id}">${k.pet} ${esc(k.name)}</button>`).join('')}</div></div>
      <div class="bar"><button class="big" data-a="today">오늘로</button><button class="big" data-a="refresh">🔄 새로고침</button><button class="big" data-a="logout">나가기</button></div>
      <p id="status" class="muted" style="text-align:center">${loadedAt ? `${hhmm(loadedAt)} 에 불러왔어요 · 1분마다 자동으로 새로고침돼요` : ''}</p>`;
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) refresh(false); }, 60000);
  }

  // ---------- 이벤트 ----------
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'loginForm') return;
    e.preventDefault();
    pass = $('#pw').value;
    if (!pass) return;
    (($('#remember').checked ? localStorage : sessionStorage)).setItem(PASS_KEY, pass);
    $('#loginMsg').textContent = '확인하는 중…';
    refresh(true);
  });
  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-day]');
    if (tr) { sel = tr.dataset.day; return showMain(); }
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'prev') { sel = addDays(sel, -1); showMain(); }
    else if (a === 'next' && sel < TODAY) { sel = addDays(sel, 1); showMain(); }
    else if (a === 'today') { sel = TODAY; showMain(); }
    else if (a === 'refresh') refresh(false);
    else if (a === 'reset') resetKid(b.dataset.kid);
    else if (a === 'wipe') wipeKid(b.dataset.kid);
    else if (a === 'logout') { sessionStorage.removeItem(PASS_KEY); localStorage.removeItem(PASS_KEY); pass = ''; showLogin(''); }
  });

  if (!C) { $('#view').innerHTML = '<div class="panel"><p>config.js 가 없어 서버에 연결할 수 없어요.</p></div>'; return; }
  if (pass) refresh(true); else showLogin('');
})();

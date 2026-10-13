// 기록 탭 화면 (달력 · 그날 상세 · 선물). 기록 탭을 처음 열 때 app.js 가 불러온다.
// app.js 파일이 업로드 한도(30KB)에 닿지 않도록 나눠 둔 것이라, 필요한 도구는 c 로 넘겨받는다.
(function () {
  'use strict';
  window.MQLog = function (c) {
    const D = c.D, PARTS = c.PARTS, DOW = c.DOW, HIGH = c.HIGH, TODAY = c.TODAY, ui = c.ui;
    const P = c.P, getDay = c.getDay, recs = c.recs, moodOf = c.moodOf, totalDone = c.totalDone;
    const fmtDur = c.fmtDur, esc = c.esc, pad = c.pad, parse = c.parse;

    function renderDetail() {
      const k = ui.sel;
      if (!k) return '';
      const dt = parse(k);
      const head = `<h2>${dt.getMonth() + 1}월 ${dt.getDate()}일 (${DOW[dt.getDay()]})</h2>`;
      const body = PARTS.map((part) => {
        const d = getDay(k, part);
        if (!d.answer && !d.mood && !d.steps) return '';
        const steps = P(part).steps.map((s, i) => `<span class="${i < d.steps ? '' : 'off'}" title="${s.label}">${s.icon}</span>`).join('');
        return `<div class="sec"><b>${P(part).icon} ${P(part).label}</b>
          ${d.answer ? `<p>💬 ${esc(d.answer.q)}<br><b>${d.answer.icon} ${esc(d.answer.label)}</b></p>` : ''}
          ${d.mood ? `<p>마음 날씨: <b>${moodOf(d.mood).icon} ${moodOf(d.mood).label}</b></p>` : ''}
          <div class="steps-row">${steps}${d.done ? `<span>${d.sticker || '⭐'}</span>` : ''}</div>
          ${HIGH && d.secs ? `<p>⏱️ ${fmtDur(d.secs)} 만에 도착</p>` : ''}</div>`;
      }).join('');
      return `<div class="panel detail">${head}${body || '<p>아직 기록이 없어요.</p>'}</div>`;
    }

    return function renderLog() {
      const y = ui.ly, m = ui.lm;
      const lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      let cells = DOW.map((w) => `<div class="dow">${w}</div>`).join('') + '<div class="day empty"></div>'.repeat(lead);
      for (let n = 1; n <= days; n++) {
        const k = `${y}-${pad(m + 1)}-${pad(n)}`, a = getDay(k, 'am'), p = getDay(k, 'pm');
        const mood = a.mood || p.mood;
        cells += `<button class="day ${k === TODAY ? 'today' : ''} ${k === ui.sel ? 'sel' : ''}" data-act="day" data-k="${k}">
          <span>${n}</span><span class="dm">${mood ? moodOf(mood).icon : ''}</span>
          <span class="ds">${a.done ? a.sticker || '⭐' : ''}${p.done ? p.sticker || '⭐' : ''}</span></button>`;
      }
      const hats = D.HATS.filter((h) => h.days > 0).map((h) =>
        `<div class="hat-item ${totalDone() >= h.days ? '' : 'lock'}"><span class="e">${h.icon}</span>${h.days}번</div>`).join('');
      const best = HIGH ? PARTS.map((p) => [p, Object.values(recs(p)).filter((d) => d.secs).map((d) => d.secs)]).filter((x) => x[1].length) : [];
      return `<div class="panel">
          <div class="cal-head"><button data-act="prevM" aria-label="이전 달">◀</button><h2 style="margin:0">${y}년 ${m + 1}월</h2><button data-act="nextM" aria-label="다음 달">▶</button></div>
          <div class="cal">${cells}</div>
        </div>
        ${renderDetail()}
        <div class="panel"><h2>🎁 아침이 선물 (모험 ${totalDone()}번 완료)</h2><div class="hats">${hats}</div>
          ${best.map(([p, v]) => `<p style="margin:10px 0 0">🏅 ${P(p).icon} ${P(p).label} 최고 기록: <b>${fmtDur(Math.min.apply(null, v))}</b></p>`).join('')}</div>`;
    };
  };
})();

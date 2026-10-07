// 친구들 깨우기 — 일어나기 직후에 하는 20초 미니게임 (두더지잡기풍).
// 구멍에서 쏙 나온 잠꾸러기 친구를 눌러 깨운다. 지는 게임이 아니라서 결과는 언제나 칭찬으로 끝난다.
// 고학년은 더 빠르게 나오고, 가끔 나오는 🐝 는 누르면 점수가 깎인다. (app.js 가 불러 쓴다)
(function () {
  'use strict';
  const FRIENDS = ['🐰', '🐹', '🐻', '🐼', '🦊', '🐱', '🐶', '🐸'];
  const SECS = 20;

  // box: 게임을 그릴 요소, opt: { high, tone }, onFinish({ best, plays, ms }): 아이가 "밥 먹으러 가자" 를 눌렀을 때
  function start(box, opt, onFinish) {
    const high = !!opt.high;
    const tone = opt.tone || function () {};
    const UP = high ? 1000 : 1250;      // 친구가 머무는 시간(ms)
    const GAP = high ? 650 : 720;       // 다음 친구가 나오기까지(ms)
    const total = { best: 0, plays: 0, ms: 0 };
    let timers = [];

    function clearAll() { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; }
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

    function play() {
      clearAll();
      let score = 0, left = SECS * 10, over = false;
      const began = Date.now();
      box.innerHTML = `
        <h2>🎮 친구들 깨우기</h2>
        <div class="ghud"><span>⭐ <b id="gScore">0</b>명</span><span>⏱️ <b id="gLeft">${SECS}</b>초</span></div>
        <div class="gbar"><i id="gFill"></i></div>
        <div class="gboard">${Array.from({ length: 9 }, () => '<button class="hole" type="button"><span class="z">💤</span><span class="f"></span></button>').join('')}</div>
        <button class="big" type="button" id="gQuit" style="min-height:44px;font-size:.95rem;margin-top:10px">그만하기</button>`;
      const holes = Array.from(box.querySelectorAll('.hole'));
      const st = holes.map(() => ({ up: false, hit: false, bee: false, t: 0 }));
      const $s = box.querySelector('#gScore');

      const hide = (i) => { clearTimeout(st[i].t); st[i].up = false; holes[i].classList.remove('up', 'bad'); };
      function show(i, em, bee) {
        const s = st[i];
        s.up = true; s.hit = false; s.bee = bee;
        holes[i].querySelector('.f').textContent = em;
        holes[i].classList.add('up');
        s.t = setTimeout(() => hide(i), UP);
        timers.push(s.t);
      }
      function spawn() {
        if (over) return;
        const free = st.map((s, i) => (s.up ? -1 : i)).filter((i) => i >= 0);
        if (free.length) {
          const bee = high && Math.random() < 0.2;
          show(free[Math.floor(Math.random() * free.length)], bee ? '🐝' : FRIENDS[Math.floor(Math.random() * FRIENDS.length)], bee);
        }
        later(spawn, GAP * (0.7 + Math.random() * 0.6));
      }
      function tap(i) {
        const s = st[i];
        if (over || !s.up || s.hit) return;
        s.hit = true;
        clearTimeout(s.t);
        if (s.bee) {
          score = Math.max(0, score - 1);
          holes[i].querySelector('.f').textContent = '😵';
          holes[i].classList.add('bad');
          tone([330, 247]);
        } else {
          score++;
          holes[i].querySelector('.f').textContent = '😆';
          tone([587 + (score % 5) * 40, 784]);
        }
        $s.textContent = score;
        later(() => hide(i), 350);
      }
      holes.forEach((h, i) => h.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(i); }));

      function end() {
        if (over) return;
        over = true;
        clearAll();
        total.plays++; total.ms += Date.now() - began; total.best = Math.max(total.best, score);
        const msg = score >= 10 ? '와, 깨우기 대장이야! 🏆' : score >= 5 ? '멋지게 깨웠어! 👏' : '졸린 친구들도 곧 일어날 거야! ☀️';
        tone([523, 659, 784]);
        box.innerHTML = `
          <div class="sticker">🎉</div>
          <h2>친구 ${score}명을 깨웠어!</h2>
          <p>${msg}</p>
          <button class="big go" type="button" id="gGo">🍚 밥 먹으러 가자!</button>
          <button class="big" type="button" id="gAgain" style="min-height:48px">한 번 더 하기</button>`;
        box.querySelector('#gGo').addEventListener('click', () => { clearAll(); onFinish(total); });
        box.querySelector('#gAgain').addEventListener('click', play);
      }
      box.querySelector('#gQuit').addEventListener('click', end);

      spawn();
      const tick = setInterval(() => {
        left--;
        box.querySelector('#gLeft').textContent = Math.ceil(left / 10);
        box.querySelector('#gFill').style.width = (left / (SECS * 10) * 100) + '%';
        if (left <= 0) end();
      }, 100);
      timers.push(tick);
    }
    play();
  }

  window.MQGame = { start: start };
})();

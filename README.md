# 아침 모험

소미(초4)·소빈(초1)이 매일 아침 재미있게 하루를 시작하는 앱. 빌드 도구 없이 `docs/` 의 HTML/JS 만으로 돈다.

- 흐름: 인사 + 오늘의 질문 → 마음 날씨 → 루틴 여행 (일어나기 → 밥먹기 → 세수/양치 → 옷입기 → 크림/바세린) → 스티커
- 주소: `/somi/` 소미 · `/sobin/` 소빈 · `/` 두 아이 고르는 화면 · `/admin/` **엄마 확인 화면(비밀번호)**
- 학년 차이: 둘 다 글로 답할 수 있다. 소빈 = 쉬운 질문·큰 글씨·말풍선 자동 읽어주기 / 소미 = 고학년 질문·걸린 시간과 최고 기록
- 아이 정보·문구는 `docs/data.js`
- 로컬 실행: `powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8083`
- 배포: `upload-to-github.ps1` (GitHub Contents API, 파일당 30KB 이하 유지)
  - https://chungyoungjoo.github.io/morning-quest/somi/
  - https://chungyoungjoo.github.io/morning-quest/sobin/
  - https://chungyoungjoo.github.io/morning-quest/admin/
- 테스트: 주소 뒤에 `?date=2026-10-08` 을 붙이면 그 날짜로 동작 (이때는 서버로 보내지 않는다)

## 엄마 확인 화면 켜기 (한 번만)

아이 화면은 기록을 **이 기기 + Supabase** 양쪽에 남긴다. 서버 설정 전에도 앱은 정상 동작하고, 아직 못 보낸 기록은 기기에 남아 있다가 나중에 자동으로 올라간다(최근 14일 이내).

1. Supabase 대시보드(머니노트·Our Story 와 같은 프로젝트) > SQL Editor 에 `supabase/schema.sql` 전체를 붙여넣고 Run
2. 같은 파일 맨 아래 주석의 `insert ... mq_admin` 문장에서 `여기에-비밀번호` 를 엄마 비밀번호로 바꿔 **그 문장만** 실행
3. `/admin/` 을 열어 비밀번호를 넣는다

### 보안
- 표(`mq_days`, `mq_admin`)는 RLS 를 켜고 정책을 만들지 않는다 → publishable key 를 알아도 직접 읽거나 쓸 수 없다
- 아이 화면은 `mq_save()` 로 **쓰기만** 가능 (somi/sobin, 최근 14일, 4KB 이하). 읽기는 불가
- 엄마는 `mq_admin_list()` 로만 읽고, 비밀번호가 맞아야 한다. 5번 틀리면 10분 잠긴다
- 한계: 주소와 키를 아는 사람이 아이 이름으로 가짜 기록을 **쓸** 수는 있다(읽지는 못한다). 가족 앱 수준에서 감수한 부분

// Supabase 연결 (머니노트·Our Story 와 같은 프로젝트). 비워 두면 기록이 이 기기에만 남는다.
// publishable key 는 공개돼도 되는 키다 — 표는 정책이 없어서 직접 읽을 수 없고,
// 아이 화면은 mq_save() 로 쓰기만, 엄마 화면은 비밀번호가 있어야 mq_admin_list() 로 읽는다. (supabase/schema.sql)
window.MQ_CLOUD = {
  url: 'https://secqbdcobmqocznsbftm.supabase.co',
  key: 'sb_publishable_KG-2wV1moYXPlfnBDJwrFg_o-AbrmqX'
};

-- 컨테이너 최초 기동 시 1회 실행된다.

-- pg_trgm: 문자열 유사도 계산. 회사명/공고제목의 중복 판정에 사용한다.
--   예) SELECT similarity('(주)카카오', '카카오');
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent: 표기 변형 정규화 보조
CREATE EXTENSION IF NOT EXISTS unaccent;

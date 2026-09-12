# 개발 환경 준비

## 1. 사전 요구사항

| 도구 | 버전 |
|------|------|
| Node.js | 24.x (`.nvmrc` 참고) |
| pnpm | 11.13.1 |
| Docker Desktop | 최신 |

---

## 2. API 키 발급

### 2-1. 공공데이터포털 (워크넷/고용24 + 잡알리오)

가장 먼저 받는다. 개발계정은 자동 승인이라 보통 바로 쓸 수 있다.

1. <https://www.data.go.kr> 회원가입 후 로그인
2. 아래 두 API를 각각 열고 **[활용신청]**
   - 한국고용정보원\_워크넷 채용정보 채용목록 및 상세정보
     <https://www.data.go.kr/data/3038225/openapi.do>
   - 재정경제부\_공공기관 채용정보 조회서비스 (잡알리오)
     <https://www.data.go.kr/data/15125273/openapi.do>
3. 활용목적에 `기타` 또는 `앱개발` 선택 후 용도 기재
4. **마이페이지 → 데이터활용 → Open API → 인증키 발급현황**에서 일반 인증키 확인
   - `Encoding` / `Decoding` 두 가지가 나온다
   - HTTP 클라이언트가 쿼리스트링을 자동 인코딩하므로 보통 **Decoding 키**를 쓴다
   - 키를 두 번 인코딩하면 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 난다 (흔한 실수)
5. `.env`의 `DATA_GO_KR_SERVICE_KEY`에 입력

> 개발계정은 일일 트래픽 제한이 있다(API마다 다르며 신청 화면에 표시된다).
> 한도를 넘길 것 같으면 같은 화면에서 **운영계정 전환**을 신청한다.

### 2-2. 워크넷 채용정보 — 포털 경유로 받는다

워크넷 채용정보는 경로가 두 개인데, **개인 계정으로 실제 호출이 되는 건 공공데이터포털 경유뿐이다.**

1. 2-1에서 `한국고용정보원_워크넷 채용정보`(`3038225`) 활용신청
2. 상세 페이지의 End Point를 `.env`의 `WORKNET_PORTAL_ENDPOINT`에 입력
   (인증키는 2-1의 `DATA_GO_KR_SERVICE_KEY`를 그대로 쓴다)

```bash
pnpm probe worknet-portal
```

> **고용24(`work24.go.kr`) 직접 발급 경로는 개인이 쓸 수 없다.**
> 신청은 자동 승인되고 인증키까지 발급되지만, 호출하면
> `개인회원은 사용할 수 없는 OPEN-API입니다`로 거부된다.
> 채용정보 재배포에 직업정보제공사업 신고가 필요해서다.
> 사업자 전환 시 재시도할 수 있도록 `pnpm probe worknet` 정의와
> `WORK24_RECRUIT_KEY` / `WORK24_COMMON_CODE_KEY` 칸은 남겨뒀다.
> 경위와 호출 규약 차이는 [data-sources.md](data-sources.md) 2절 참고.
>
> 워크넷 공고를 화면에 노출할 때는 **고용24 출처 배지 표기가 의무**다. 같은 문서 2절 확인.

### 2-3. 사람인 채용정보 API

승인 절차가 있어 시간이 걸리므로 **가장 먼저 신청해두고 다른 작업을 진행**한다.

1. <https://oapi.saramin.co.kr> → 이용신청
2. 승인 후 로그인 → 앱 등록 → `access-key` 확인
3. `.env`의 `SARAMIN_ACCESS_KEY`에 입력

**제약 사항**

- 1일 최대 500회 호출 → 사용자 요청이 직접 API를 호출하는 구조는 불가능하다. 배치 수집 + 자체 인덱스로 간다
- 베타 서비스라 인터페이스가 변경될 수 있다 → 원본 응답을 보존하고 스키마 변경을 감지한다
- 화면에 **사람인 제공 데이터임을 명시**하고 원문 공고로 링크해야 한다
- 문의: `api@saramin.co.kr`

---

## 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env`를 열어 발급받은 키와 비밀번호를 채운다. `.env`는 커밋되지 않는다.

---

## 4. 인프라 기동

PostgreSQL · Meilisearch · Redis를 한 번에 띄운다.

```bash
pnpm infra:up      # 기동
pnpm infra:logs    # 로그 확인
pnpm infra:down    # 중지
pnpm infra:reset   # 볼륨까지 삭제 후 초기화
```

기동 확인:

```bash
docker compose ps
psql "$DATABASE_URL" -c "SELECT similarity('(주)카카오', '카카오');"
curl http://localhost:7700/health
```

`similarity()`가 값을 반환하면 `pg_trgm` 확장이 정상 설치된 것이다.

---

## 5. 애플리케이션 스캐폴딩 (Phase 1 착수 시)

아직 생성하지 않았다. Phase 1을 시작할 때 아래를 실행한다.

```bash
# 백엔드 — 수집 파이프라인 + 검색 API
pnpm dlx @nestjs/cli new backend --package-manager pnpm --skip-git

# 프론트엔드 — 검색 UI
pnpm create next-app@latest frontend --typescript --app --eslint --tailwind --src-dir --no-import-alias
```

생성 후 각 `package.json`의 포트를 `.env` 기준으로 맞춘다.

- backend: `8001`
- frontend: `3001`

doc-nexus가 `8000`/`3000`을 쓰므로 두 프로젝트를 동시에 띄울 때 충돌하지 않도록 한다.

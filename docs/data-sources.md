# 데이터 소스 분석 및 정규화 설계

각 소스의 실제 응답을 확인하고, 통합 도메인 모델을 어떻게 잡을지 결정한 기록.

조사는 `scripts/probe.mjs`로 실제 API를 호출해서 진행한다. 문서(명세서)에 적힌 것과 실제 응답이 다른 경우가 있으므로 **추측하지 않고 실측값을 근거로 한다.**

```bash
pnpm probe alio                    # 응답 구조 확인
pnpm probe alio numOfRows=100      # 표본 크기 조정
```

---

## 1. 공공기관 채용정보 (잡알리오)

- 제공: 재정경제부 / 공공데이터포털 `15125273`
- End Point: `https://apis.data.go.kr/1051000/recruitment/list`
- 전체 공고 수: **113,756건** (2026-09-12 기준, 누적)
- 조사 표본: 200건

### 주의 사항

| 항목 | 내용 |
|------|------|
| 오퍼레이션 경로 | End Point에 `/list`까지 붙여야 한다. 빠뜨리면 `NO_OPENAPI_SERVICE_ERROR`(코드 12) |
| 인증키 | `URLSearchParams`로 조립할 땐 **Decoding 키**. Encoding 키를 쓰면 `%2F` → `%252F`로 이중 인코딩된다 |
| 응답 포맷 | `resultType=json`. 단 **오류 시에는 XML로 오는 경우가 있다** |

### 응답 구조

```jsonc
{
  "resultCode": 200,
  "resultMsg": "성공했습니다.",
  "totalCount": 113756,
  "result": [ /* 공고 배열 */ ]
}
```

### 필드 목록

| 필드 | 의미 | 비고 |
|------|------|------|
| `recrutPblntSn` | 채용공고 일련번호 | 소스 고유 ID |
| `pblntInstCd` | 공고기관 코드 | **회사 식별자** |
| `pbadmsStdInstCd` | 공공기관 표준코드 | 보조 식별자 |
| `instNm` | 기관명 | 회사명 |
| `recrutPbancTtl` | 공고 제목 | |
| `srcUrl` | 원문 공고 URL | 출처 표기 필수 요건 충족 |
| `ncsCdLst` / `ncsCdNmLst` | NCS 직무분류 | **다중값** |
| `hireTypeLst` / `hireTypeNmLst` | 고용형태 | **다중값** |
| `workRgnLst` / `workRgnNmLst` | 근무지역 | **다중값** |
| `acbgCondLst` / `acbgCondNmLst` | 학력조건 | **다중값** |
| `recrutSe` / `recrutSeNm` | 채용구분 | 신입 / 경력 / 신입+경력 |
| `recrutNope` | 채용인원 | |
| `pbancBgngYmd` / `pbancEndYmd` | 공고 시작/마감일 | `YYYYMMDD` 문자열 |
| `ongoingYn` | 진행 여부 | |
| `decimalDay` | 마감까지 남은 일수 | **수집 시점 기준이라 신뢰 불가** |
| `aplyQlfcCn` | 지원자격 | 비정형 텍스트 |
| `prefCondCn` / `prefCn` | 우대조건 | 비정형 텍스트 |
| `scrnprcdrMthdExpln` | 전형절차 | 비정형 텍스트 |
| `disqlfcRsn` | 결격사유 | 비정형 텍스트 |
| `nonatchRsn` | 미첨부 사유 | |
| `replmprYn` | 대체인력 여부 | |
| `files` / `steps` | 첨부파일 / 전형단계 | **표본 200건 전부 빈 배열** |

### 실측 통계 (표본 200건)

**다중값 발생 현황**

| 필드 | 다중값 건수 | 최대 개수 |
|------|------------|----------|
| `workRgnLst` | 33건 | **16개** |
| `ncsCdLst` | 60건 | 9개 |
| `acbgCondLst` | 32건 | 7개 |
| `hireTypeLst` | 15건 | 3개 |

코드 배열과 명칭 배열의 **길이 불일치는 0건**. zip 처리가 안전하다.

**값 분포**

| 필드 | 값 |
|------|-----|
| 고용형태 | 정규직 / 무기계약직 / 비정규직 / 청년인턴(채용형) / 청년인턴(체험형) |
| 채용구분 | 신입 / 경력 / 신입+경력 |
| 학력조건 | 학력무관 / 중졸이하 / 고졸 / 대졸(2~3년) / 대졸(4년) / 석사 / 박사 |
| NCS 직무 | 사업관리, 경영.회계.사무, 정보통신, 연구, 보건.의료, 건설, 기계, 전기.전자, 환경.에너지.안전 등 24종 대분류 |

**연봉 관련 필드는 존재하지 않는다.** 공공기관은 채용공시에 연봉을 포함하지 않는다.

---

## 2. 워크넷 채용정보 (고용24)

> 현재 상태: **응답 구조 실측 전.** 아래는 제공 경로를 확정하기까지의 기록이다.

### 제공 경로가 둘인데, 개인은 한쪽만 쓸 수 있다

| 경로 | 인증 | 개인 사용 |
|------|------|----------|
| 고용24 직접 (`work24.go.kr`) | 고용24 계정 + `authKey` | **불가** |
| 공공데이터포털 경유 (`data.go.kr` `3038225`) | 포털 계정 + `serviceKey` | 가능 |

고용24 직접 발급 쪽이 제공 데이터가 많아 먼저 시도했으나, **개인회원 계정으로는 호출이 거부된다.**

```jsonc
// GET https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do?...
{ "GO24": { "error": "개인회원은 사용할 수 없는 OPEN-API입니다." } }
```

함정은 **신청이 자동 승인되고 인증키까지 정상 발급된다는 점**이다. 신청현황에 키가 보이므로 다 된 것처럼 보이지만, 실제 호출에서 회원 등급으로 막힌다. 신청 화면의 `오픈API 채용정보 서비스 신청서` 다운로드 버튼이 이걸 미리 알려주는 단서였다 — 파일을 열어보면 제목이 `(민간 직업정보제공 사업자용)`이고 첨부로 **사업자등록증·직업정보제공사업신고확인증**을 요구한다. 채용정보 재배포는 직업안정법상 직업정보제공사업 신고 대상이라 개인에게는 열려 있지 않다.

**따라서 워크넷은 공공데이터포털 경유(`worknet-portal`)로 수집한다.**

```bash
pnpm probe worknet-portal
```

고용24 직접 경로(`worknet`)는 사업자 전환 시 재시도할 수 있도록 프로브에 정의만 남겨뒀다. 아래 호출 규약 정리도 그 목적으로 유지한다.

- 제공: 고용노동부 / 고용24 OPEN-API (`work24.go.kr`)
- 신청: 고용24 → OPEN-API → 서비스 소개 및 신청 → 채용정보
- 요청 URL: `https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do`

### 공공데이터포털과 호출 규약이 다르다

잡알리오와 같은 "공공 오픈API"지만 **data.go.kr을 경유하지 않는 독립 체계**다. 인증 파라미터 이름부터 페이징 방식까지 공유하는 게 없다.

| 항목 | 잡알리오 (data.go.kr) | 워크넷 (work24.go.kr) |
|------|----------------------|----------------------|
| 인증 파라미터 | `serviceKey` | `authKey` |
| 인증키 출처 | 공공데이터포털 계정 | 고용24 계정 (**별개로 발급**) |
| 인증키 단위 | 계정당 1개 (API마다 활용신청만 추가) | **신청한 서비스마다 1개** |
| 페이지 번호 | `pageNo` | `startPage` |
| 페이지 크기 | `numOfRows` | `display` |
| 응답 포맷 | `resultType=json` | `returnType=XML` (명세 예제 기준) |
| 호출 구분 | 오퍼레이션 경로(`/list`) | 쿼리 파라미터 `callTp` (`L`=목록 / `D`=상세) |

### 요청 파라미터 (명세)

| 파라미터 | 값 | 비고 |
|---------|-----|------|
| `authKey` | 발급 인증키 | 필수 |
| `callTp` | `L` | 목록 조회 |
| `returnType` | `XML` | JSON 지원 여부는 실측으로 확인 |
| `startPage` | `1` | 1부터 시작 |
| `display` | `10` | 페이지당 건수 |
| `occupation` | `직종코드1\|직종코드2` | 선택. 다중 지정은 파이프 구분 |

명세에 `[인증키]`처럼 대괄호로 표기된 부분은 **대괄호를 빼고** 값만 넣는다.

### 상세 조회는 별도 URL이고 1건씩만 받는다

목록과 상세는 `callTp`만 다른 게 아니라 **오퍼레이션 URL 자체가 다르다.**

| | 목록 | 상세 |
|---|------|------|
| URL | `.../callOpenApiSvcInfo210L01.do` | `.../callOpenApiSvcInfo210D01.do` |
| `callTp` | `L` | `D` |
| 식별자 | — | `wantedAuthNo` (구인인증번호) **1건** |
| 추가 파라미터 | — | `infoSvc=VALIDATION` |

상세는 공고 1건당 1회 호출이다. 즉 **본문까지 저장하려면 N+1 호출**이 된다. 목록에 본문이 들어있지 않다면 수집 스케줄러는 목록 페이징과 상세 보충을 분리한 2단 큐로 가야 한다.

### 원문 링크와 출처 표기 (경로와 무관하게 적용)

명세가 공고 상세 페이지 URL 포맷을 지정한다.

```text
웹     https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do
         ?wantedAuthNo={구인인증번호}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet
모바일  https://m.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?(동일)
```

`wantedAuthNo`만 있으면 조립할 수 있으므로 **공공데이터포털 경유로 수집하더라도 이 링크를 그대로 쓴다.**

출처 표기는 선택이 아니다. 명세에 `상세페이지 하단에 자료 출처를 아래 이미지로 반드시 명기하여 주시기 바랍니다`로 적혀 있고, 문구는 다음과 같다.

> **정보출처 고용24** — 본 자료는 고용노동부 고용24(www.work24.go.kr)에서 제공한 정보이며, **무단복제 및 배포를 금지합니다.**

**적용**

- 공고 상세 화면 하단에 위 출처 배지·문구를 고정 노출한다
- 워크넷 출처 공고는 본문 전문을 그대로 노출하지 않고 **요약 + 원문 링크**를 기본으로 한다
  ("무단복제 및 배포 금지"와 충돌하지 않는 선을 지킨다)
- README의 데이터 이용 정책과 같은 내용이므로 UI 구현 시 함께 확인한다

### 이 차이가 설계에 주는 영향

- 어댑터 인터페이스는 "공공데이터포털용"이 아니라 **소스별 호출 규약(인증 파라미터명·페이징 키·응답 포맷)을 데이터로 선언**받아야 한다. `scripts/probe.mjs`의 `SOURCES` 맵이 그 최소 형태다.
- 응답 파서는 JSON 전용으로 만들 수 없다. XML 응답을 같은 객체 트리로 바꿔 정규화 계층에 넘긴다.
- 상세 조회가 `wantedAuthNo` 1건 단위라 **목록에 본문이 없으면 공고당 1회씩 추가 호출**이 붙는다. 실측 시 목록 응답에 본문 필드가 있는지부터 확인하고, 없으면 목록 수집과 상세 보충을 분리한 2단 큐로 간다.
- **소스 선택이 기술 비교만으로 결정되지 않는다.** 데이터가 더 좋아도 계정 자격에서 막히면 못 쓴다. 소스를 늘릴 때는 응답 스키마를 보기 전에 **개인 자격으로 호출이 되는지부터** 확인한다.

---

## 설계 결정

### D1. 소스마다 채울 수 있는 필드가 다르다 → 소스 역량을 선언한다

연봉만의 문제가 아니라 **통합검색의 구조적 함정**이다. 사용자가 연봉 필터를 거는 순간 공공기관 공고 11만 건이 조용히 사라지는데, 사용자는 그게 필터 때문인지 데이터가 없어서인지 알 수 없다.

소스가 무엇을 채울 수 있는지 선언해두고 UI가 그걸 읽게 한다.

```ts
// 소스별 제공 가능 필드. 필터 UI가 이 표를 보고 안내 문구와 기본 동작을 결정한다.
export const SOURCE_CAPABILITIES = {
  alio:    { salary: false, techStack: false, careerYears: false },
  worknet: { salary: true,  techStack: false, careerYears: true  },
  saramin: { salary: true,  techStack: true,  careerYears: true  },
} as const;
```

**적용**

- `salaryMin` / `salaryMax`는 nullable로 두고, **`hasSalaryInfo: boolean`을 별도로** 둔다
  (null이 "미공개"인지 "수집 실패"인지 구분하려면 필요하다)
- 연봉 필터 적용 시 정보 없는 공고는 **기본 포함**하고, "연봉 정보 있는 공고만" 토글을 따로 제공한다
- 필터 옆에 `이 조건은 사람인·원티드 공고에만 적용됩니다` 안내를 표시한다
- Meilisearch에 `hasSalary`를 filterable로 등록하면 토글이 그대로 필터가 된다

### D2. `~Lst` 필드는 다중값이다 → 배열로 파싱하고 전국채용을 분리한다

```ts
// "R3010,R3018" + "서울,강원" → [{ code: 'R3010', name: '서울' }, ...]
// 표본 200건에서 코드/명칭 길이는 100% 일치했지만, 스키마 변경에 대비해 짧은 쪽에 맞춘다.
function zipCodeNames(codes?: string, names?: string) {
  const c = (codes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const n = (names ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return c.map((code, i) => ({ code, name: n[i] ?? code }));
}
```

**근무지역 16개는 사실상 전국채용이다.** 그대로 두면 "서울" 필터에 전국 공고가 전부 딸려 나온다.

```ts
// 근무지역이 일정 수를 넘으면 특정 지역 공고가 아니라 전국 채용으로 분류한다.
const NATIONWIDE_THRESHOLD = 10;
const isNationwide = regions.length >= NATIONWIDE_THRESHOLD;
```

**저장 형태** — jsonb 배열로 충분하다. 검색·필터는 Meilisearch가 담당하므로 `posting_regions` 같은 조인 테이블은 지금 필요 없다. 기술스택 트렌드 통계(P2)를 할 때 정규화 테이블을 추가한다.

### D3. 코드/명칭 쌍 → 통합 enum으로 매핑하되 실패를 기록한다

소스마다 코드 체계가 달라서 통합 필터를 만들려면 자체 enum이 필요하다.

```ts
// 잡알리오 고용형태 → 통합 enum. 명칭이 아니라 코드 기준으로 매핑해야 안정적이다.
// (코드 번호는 명칭 분포에서 역추정한 값이므로 첫 수집 때 실제 코드로 검증할 것)
const ALIO_EMPLOYMENT_TYPE = {
  R1010: 'FULL_TIME',          // 정규직
  R1020: 'PERMANENT_CONTRACT', // 무기계약직
  R1040: 'CONTRACT',           // 비정규직
  R1050: 'INTERN_TO_HIRE',     // 청년인턴(채용형)
  R1060: 'INTERN',             // 청년인턴(체험형)
} as const;
```

**가장 중요한 건 매핑 실패 처리다.** 모르는 코드가 와도 버리지 않는다.

```ts
// 미매핑 코드는 UNKNOWN으로 넘기되 반드시 경고를 남긴다.
// 조용히 버리면 소스가 코드를 추가했을 때 데이터가 사라진 것을 알 수 없다.
function mapCode<T>(table: Record<string, T>, code: string, source: string) {
  const hit = table[code];
  if (!hit) logger.warn(`미매핑 코드 [${source}] "${code}" — 매핑 테이블 갱신 필요`);
  return hit ?? 'UNKNOWN';
}
```

원본 코드·명칭은 정규화 후에도 `rawAttributes`에 함께 보존한다. 매핑 테이블을 고치면 재수집 없이 재처리로 복구된다.

**IT 직군 필터** — `ncsCdNmLst`에 `정보통신`이 포함되는지로 판정한다.

### D4. 회사 식별자가 있다 → 2단계 중복 판정으로 간다

**성능과 직결되는 결정이다.** 공고 11만 건에 다른 소스까지 더하면 전수 쌍 비교는 O(n²)라 성립하지 않는다. 회사를 먼저 확정하고 **같은 회사 안에서만 공고를 비교**하면 비교 대상이 수십 건으로 줄어든다.

**1단계 — 회사 확정 (우선순위 체인)**

```
① 소스 기관코드 일치 (pblntInstCd)   → 유사도 계산 없이 즉시 확정
② 사업자번호 일치 (제공하는 소스만)
③ 정규화 회사명 완전 일치
④ pg_trgm similarity() >= 임계값      → 후보로 제시
```

```sql
-- companies.external_ids: {"alio": "C0446", "alio_std": "B552657", "saramin": "..."}
-- 같은 소스에서 온 공고는 ①에서 끝나므로 유사도 연산 자체가 발생하지 않는다.
```

**2단계 — 같은 `company_id` 안에서만 공고 비교** (제목 유사도 × 마감일 근접도)

`pblntInstCd`는 잡알리오 전용이라 크로스 소스 매칭에는 쓸 수 없지만, **공공기관 11만 건 내부의 중복은 이것만으로 정확히 처리된다.** 유사도 연산은 민간 소스가 붙을 때만 돌면 된다.

---

## 후속 과제

- [ ] `files` / `steps`가 항상 비어 있음 — 상세 조회 오퍼레이션이 따로 있는지 확인 (MVP에는 불필요)
- [ ] `ALIO_EMPLOYMENT_TYPE`의 코드 번호를 실제 수집 데이터로 검증
- [ ] 진행 중인 공고만 받는 요청 파라미터 확인 (`ongoingYn` 필터 지원 여부)
- [ ] 증분 수집 기준 필드 확인 (등록일시 기준 정렬·필터 가능 여부)
- [ ] 공공데이터포털 `3038225` 활용신청 후 `pnpm probe worknet-portal` — 2절의 실측 부분을 채운다
  - [ ] `returnType=JSON` 지원 여부
  - [ ] 목록 응답에 본문이 포함되는지 (없으면 `callTp=D` 추가 호출 필요 → 수집 비용 재설계)
  - [ ] 연봉·경력 필드 유무 (`SOURCE_CAPABILITIES.worknet`을 실측으로 확정)
  - [ ] 회사 식별자 유무 (D4의 2단계 중복 판정을 워크넷에도 적용할 수 있는지)
- [ ] 포털 경유 응답에 `wantedAuthNo`가 포함되는지 확인 (원문 링크 조립에 필수)
- [ ] 공고 상세 화면에 고용24 출처 배지 노출 (UI 구현 시)
- [ ] 사람인 API 승인 후 응답 구조 분석

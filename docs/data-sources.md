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
- [ ] 워크넷(고용24) 응답 구조 분석 — `pnpm probe worknet`
- [ ] 사람인 API 승인 후 응답 구조 분석

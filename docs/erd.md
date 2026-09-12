# job-radar — ERD

> 현재 상태: **설계 초안.** 스키마 파일·마이그레이션 없음.
> 확정 후 단일 소스는 `backend/prisma/schema.prisma`(예정) · DB: PostgreSQL 16

## 설계 전제

[data-sources.md](data-sources.md)의 설계 결정이 스키마에 그대로 반영된다.

| 결정 | 스키마 반영 |
| --- | --- |
| D1 — 소스마다 채울 수 있는 필드가 다름 | 연봉·경력 등은 nullable + `has_salary_info` 별도 보유 |
| D2 — `~Lst` 다중값 | 지역·직무·학력·고용형태를 jsonb 배열로 저장 |
| D3 — 소스 코드 → 통합 enum | 매핑 결과와 함께 `raw_attributes`에 원본 코드 보존 |
| D4 — 2단계 중복 판정 | `companies.external_ids`로 회사 선확정, 클러스터는 회사 내부에서만 생성 |

## 테이블 목록 (초안, 14)

| 테이블 | 설명 |
| --- | --- |
| `sources` | 소스 메타 (코드, 명칭, 일일 호출 한도, 활성 여부) |
| `raw_postings` | 수집 원본 응답 그대로 보존 (`payload` jsonb). 정규화 로직 수정 시 재처리 기준 |
| `companies` | 정규화된 기업. `external_ids` jsonb로 소스별 기관코드 보유 |
| `postings` | 정규화 공고. 소스 1건 = 행 1건 |
| `posting_clusters` | 중복 그룹. 같은 공고로 판정된 postings의 묶음 |
| `cluster_members` | 클러스터 ↔ 공고 (N:M 해소) |
| `posting_revisions` | 공고 변경 이력 (마감 연장·내용 수정 diff) — P1 |
| `collect_runs` | 수집 실행 로그 (소스별 성공·실패·신규·갱신 건수) |
| `users` | 사용자 |
| `invite_codes` | 초대코드 (지인 한정 운영) |
| `bookmarks` | 관심 공고. **클러스터 단위**로 건다 |
| `application_status` | 지원 상태 이력 (관심 → 지원 → 서류합격 → 면접 → 결과) |
| `viewed_postings` | 읽음 처리. 역시 클러스터 단위 |
| `saved_searches` | 저장된 검색 조건 + 알림 설정 — P1 |

## 주요 관계

```text
sources 1 ─── N raw_postings
raw_postings 1 ─── 1 postings          (정규화 결과)
companies 1 ─── N postings
companies 1 ─── N posting_clusters     (클러스터는 회사 내부에서만 생성된다)
posting_clusters 1 ─── N cluster_members ─── 1 postings
postings 1 ─── N posting_revisions

users 1 ─── N (bookmarks, viewed_postings, saved_searches)
bookmarks 1 ─── N application_status
invite_codes 1 ─── 1 users
```

## 핵심 설계 포인트

### 원본 보존과 정규화를 분리한다

`raw_postings`는 API 응답을 손대지 않고 그대로 담는다. `postings`는 그것을 통합 모델로 변환한 결과다. 정규화 규칙이나 코드 매핑 테이블을 고쳤을 때 **외부 API를 다시 호출하지 않고 재처리만으로 복구**할 수 있다. 사람인 API가 1일 500회로 제한되므로 재수집 비용이 크다는 점에서 특히 중요하다.

### 개인화 데이터는 공고가 아니라 클러스터에 건다

북마크·읽음 처리를 `postings`에 걸면, 사람인에서 북마크한 공고를 워크넷 결과에서 또 보게 된다. `posting_clusters`에 걸어야 "같은 공고를 두 번 보지 않는다"는 핵심 가치가 성립한다.

### 회사 확정이 중복 판정의 1단계다

전체 공고 쌍을 비교하면 O(n²)라 성립하지 않는다(잡알리오만 11만 건). 회사를 먼저 확정하고 같은 `company_id` 안에서만 공고를 비교하면 비교 대상이 수십 건으로 줄어든다.

```text
① companies.external_ids에서 소스 기관코드 일치  → 유사도 계산 없이 즉시 확정
② 사업자번호 일치 (제공하는 소스만)
③ 정규화 회사명 완전 일치
④ pg_trgm similarity() >= 임계값                → 후보로 제시
```

### 다중값은 jsonb 배열로 둔다

근무지역은 최대 16개까지 온다. 검색·필터는 Meilisearch가 담당하므로 `posting_regions` 같은 조인 테이블은 지금 필요 없다. 기술스택 트렌드 통계(P2)를 만들 때 정규화 테이블을 추가한다.

## 미정 사항

- [ ] ORM 선택 (Prisma / Drizzle / TypeORM)
- [ ] `postings` 컬럼 확정 — 워크넷·사람인 응답 구조 분석 후
- [ ] 통합 enum 최종안 (고용형태·경력구분·학력·지역)
- [ ] 중복 판정 임계값
- [ ] 인덱스 설계 (마감일·회사·상태 기준 조회 패턴 확정 후)

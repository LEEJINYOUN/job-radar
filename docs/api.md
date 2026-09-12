# job-radar — API 명세

Base URL: `http://localhost:8001/api/v1` (예정)

> 현재 상태: **백엔드 미구현.** 구현된 엔드포인트가 없다.
> 아래는 계획된 엔드포인트 표면이며, 구현하면서 실제 시그니처·응답 형태로 갱신한다.

## 공개 / 인증

전 엔드포인트는 초대코드로 가입한 사용자 세션을 요구한다. 공개 엔드포인트는 가입·로그인 관련만 둔다.

| Method | Endpoint | 설명 | 상태 |
| --- | --- | --- | --- |
| POST | /auth/invite/verify | 초대코드 검증 | 미구현 |
| POST | /auth/signup | 초대코드 기반 가입 | 미구현 |
| POST | /auth/login | 로그인 | 미구현 |
| POST | /auth/logout | 로그아웃 | 미구현 |
| GET | /auth/me | 현재 사용자 | 미구현 |

## 공고 검색

| Method | Endpoint | 설명 | 상태 |
| --- | --- | --- | --- |
| GET | /postings | 통합 검색 (키워드·지역·경력·고용형태·학력·직무·소스 필터, 정렬, 페이징) | 미구현 |
| GET | /postings/:clusterId | 공고 상세. **묶인 모든 소스의 원문 링크를 함께 반환** | 미구현 |
| GET | /postings/filters | 필터 옵션 목록 + 소스별 지원 여부(`SOURCE_CAPABILITIES`) | 미구현 |

> 검색 결과의 단위는 개별 공고가 아니라 **클러스터**다. 같은 공고가 여러 소스에 있어도 1건으로 반환한다.

> 연봉처럼 일부 소스만 제공하는 필터는 정보 없는 공고를 기본 포함한다.
> `hasSalary=true`를 명시할 때만 제외한다. 자세한 근거는 [data-sources.md](data-sources.md) D1 참고.

## 개인화

| Method | Endpoint | 설명 | 상태 |
| --- | --- | --- | --- |
| GET | /bookmarks | 관심 공고 목록 | 미구현 |
| POST | /bookmarks | 관심 공고 추가 (clusterId 기준) | 미구현 |
| DELETE | /bookmarks/:id | 관심 공고 해제 | 미구현 |
| PATCH | /bookmarks/:id/status | 지원 상태 변경 (관심/지원/서류합격/면접/최종/탈락) | 미구현 |
| POST | /postings/:clusterId/view | 읽음 처리 | 미구현 |

## 저장된 검색 (P1)

| Method | Endpoint | 설명 | 상태 |
| --- | --- | --- | --- |
| GET | /saved-searches | 저장된 검색 조건 목록 | 미구현 |
| POST | /saved-searches | 검색 조건 저장 (+ 알림 여부) | 미구현 |
| DELETE | /saved-searches/:id | 삭제 | 미구현 |

## 운영 (관리자)

| Method | Endpoint | 설명 | 상태 |
| --- | --- | --- | --- |
| GET | /admin/collect-runs | 소스별 수집 이력 (성공·실패·신규·갱신 건수) | 미구현 |
| POST | /admin/collect/:source | 수동 수집 트리거 | 미구현 |
| GET | /admin/quota | 소스별 잔여 호출 쿼터 | 미구현 |

## 관련 문서

- [architecture.md](architecture.md) — 시스템 구성
- [erd.md](erd.md) — 데이터 모델
- [data-sources.md](data-sources.md) — 소스별 응답 구조와 정규화 설계 결정

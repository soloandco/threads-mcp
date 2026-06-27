---
name: threads-wiki-synthesis
description: Synthesize wiki data into insights, extract learnings from comments, generate topic content docs, and detect usage patterns to suggest new skills. Triggers on "사고 연결", "댓글에서 배운 것", "wiki 합성", "강의 자료", "패턴 분석", "스킬 제안", "콘텐츠 합성".
---

# Threads Wiki Synthesis

## 개요

wiki/posts, wiki/people, wiki/topics, threads_replies 데이터를 분석·합성해 인사이트 문서를 생성하고, 반복 패턴을 감지해 새 스킬 제안까지 이어진다.

**데이터 소스:**
- `wiki/posts/*.md` — frontmatter + 댓글 섹션
- `wiki/people/*.md` — interaction_count, 교류 이력
- `wiki/topics/*.md` — 토픽별 포스트 연결
- `wiki/insights/*.md` — 기존 인사이트 문서

**저장 위치:**
- 합성 결과: `wiki/insights/YYYY-MM-DD-{slug}.md`
- 스킬 제안 로그: `wiki/insights/skill-suggestions.md`
- 스킬 초안: `wiki/insights/skill-drafts/{slug}.md`

---

## 시작: 모드 선택

실행 시 먼저 모드를 확인한다. 사용자가 명시하지 않았으면 질문:

> "어떤 작업을 할까요?
> 1. **pattern** — 내 포스트 전체에서 반응 패턴 분석 → insights 문서
> 2. **comments** — 댓글 데이터에서 팔로워 관심사 추출 → 다음 글 방향
> 3. **topic** — 특정 토픽·기간 지정 → 콘텐츠 합성·강의 자료
> 4. **skill-suggest** — 반복 사용 패턴 감지 → 새 스킬 제안"

복수 선택 가능. 완료 후 항상 **공통 후처리(패턴 기록)** 실행.

---

## 모드 1: pattern — 포스트 반응 패턴 분석

### 목적
전체 포스트에서 "무엇이 왜 잘 됐는지" 패턴을 추출해 재현 가능한 인사이트로 정리.

### 절차

**1단계: 데이터 집계**
`wiki/posts/*.md` frontmatter에서 추출:
```
engagement_score, likes, replies, views
hook_type, pillar, length_class, topics, media
```

**2단계: 패턴 분석**
- 상위 20% 포스트(engagement_score 기준) 공통점
- hook_type × pillar × length_class 조합 빈도
- 토픽별 평균 반응 (3개 이상 포스트 있는 토픽만)
- 미디어 유무 차이
- 댓글/좋아요 비율이 높은 포스트 특징 (질문 유발형)

**3단계: 인사이트 문서 생성**

파일: `wiki/insights/YYYY-MM-DD-post-patterns.md`

```markdown
---
type: insight
title: "포스트 반응 패턴 분석"
confidence: high|medium|low
evidence: N개 포스트 기반
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: ["pattern", "engagement"]
---

# 포스트 반응 패턴 분석

## 핵심 발견
(3~5개 bullet — 가장 actionable한 것 우선)

## 반응 좋은 조합 Top 5
| hook_type | pillar | length | 평균 score | 포스트 수 |

## 토픽별 평균 반응
| 토픽 | 평균 좋아요 | 평균 댓글 | 포스트 수 |

## 재현 가능한 패턴
(다음 글에 바로 적용할 수 있는 형태로 작성)

## 반응 약한 패턴
(피해야 할 조합)

## 관련
- [[insights/my-post-patterns]]
```

기존 `wiki/insights/my-post-patterns.md`가 있으면 새 발견만 추가 (덮어쓰지 않음).

---

## 모드 2: comments — 댓글에서 팔로워 관심사 추출

### 목적
댓글 내용을 분석해 "팔로워들이 실제로 궁금해하는 것"을 파악하고 다음 글 방향 도출.

### 절차

**1단계: 댓글 데이터 수집 및 실제 집계 (필수)**

`wiki/posts/*.md`의 `## 댓글` 섹션 전체를 Python 스크립트로 읽어:
- 내 댓글(@workindex0, @soloandco 등 owner 계정) 제외
- 질문형 댓글 추출 (?, 어떻게, 왜, 어디서, 뭔지, 궁금, 있나요, 있을까요)
- 공감 표현 추출 (저도, 맞아요, 똑같이, 공감)
- 요청 추출 (알려주세요, 더 써주세요, 궁금해요, 방법 알려)

> ⚠️ **집계 필수 규칙**: 스크립트를 실행해 숫자가 나온 뒤에만 표를 작성한다.
> 샘플을 보고 인상 기반으로 순위를 추정하는 것은 절대 금지.

**2단계: 주제별 빈도 집계 (스크립트 실행)**

추출된 질문형 댓글 전체에 대해 주제 키워드 매칭으로 실제 개수를 센다:
```python
topic_keywords = {
    'Claude/클로드 사용법': ['클로드', 'Claude', 'claude', '클코'],
    '배포/개발 방법': ['배포', '커밋', '푸시', '도커', '개발'],
    'PRD/프롬프트': ['PRD', '프롬프트', '프롬'],
    'antigravity 사용법': ['안티그래비티', 'antigravity', '반중력'],
    # ... 실제 집계 후 테이블 작성
}
```
스크립트 출력(각 주제별 실제 개수)을 확인한 뒤 문서를 작성한다.

**3단계: 인사이트 문서 생성**

파일: `wiki/insights/YYYY-MM-DD-follower-interests.md`

```markdown
---
type: insight
title: "팔로워 관심사 — 댓글 기반"
evidence: N개 포스트, N개 질문형 댓글 전수 집계
created: YYYY-MM-DD
---

# 팔로워 관심사 (댓글 기반)

## 자주 묻는 질문 패턴 — 실제 빈도 기준

> 질문형 댓글 N개 전수 주제별 집계 (내 댓글 제외)

| 질문 패턴 | 실제 댓글 수 | 대표 댓글 |
|---------|-----------|---------|
| (스크립트 집계 결과 순서대로) | N개 | "..." |

## 콘텐츠 요청 패턴
(실제 빈도 기준 — 빈도 높은 순)

## 공감 포인트
(가장 많이 "저도요" 반응이 나온 상황/고민)

## 다음 글 제안
(빈도 1~4위 주제 기반, 각 제안에 근거 빈도 명시)
```

**4단계: people 파일 갱신 (선택)**
특정 people 페이지의 `## 댓글로 본 이 사람` 섹션에 주요 질문 패턴 추가.

---

## 모드 3: topic — 토픽·기간 지정 합성

### 목적
특정 주제나 기간의 모든 관련 데이터를 하나의 구조화된 문서로 합성. 강의 교안, 시리즈 기획, 외부 발행 초안으로 활용 가능.

### 입력 파라미터
- **토픽 지정**: "leverage-etf에 대해 합성해줘"
- **기간 지정**: "2026년 1~3월 포스트 합성해줘"
- **자유 질문**: "팔로워들이 가장 많이 반응한 주제로 강의 자료 만들어줘"

### 절차

**1단계: 관련 데이터 수집**
- 해당 토픽 태그된 `wiki/posts/*.md` 목록
- 관련 `wiki/topics/{topic}.md`
- 관련 `wiki/sources/*.md`, `raw/clippings/` 파일
- 해당 포스트들의 댓글 섹션

**2단계: 구조 설계**
수집 데이터 기반으로 목차 초안 제시 → 사용자 승인 후 진행.

**3단계: 합성 문서 생성**

파일: `wiki/insights/YYYY-MM-DD-{topic-slug}-synthesis.md`

```markdown
---
type: insight
title: "{주제} 합성"
purpose: lecture|series|reference|draft  # 사용자 용도에 맞게
topics: ["{topic}"]
source_posts: N개
created: YYYY-MM-DD
---

# {주제} — 합성 문서

## 개요
(이 주제에 대해 내가 쓴 글들의 핵심 관점 요약)

## 핵심 주장 / 메시지
(포스트들에서 일관되게 나타나는 관점)

## 데이터·근거
(댓글, 실제 사례, 수치 등 — 출처 링크 포함)

## 팔로워 반응 패턴
(이 주제에서 특히 반응 좋았던 각도·표현)

## 목차 (강의/시리즈용)
(합성 내용을 구조화한 목차 — 필요 시)

## 원본 포스트 목록
| 날짜 | 포스트 | 좋아요 | 댓글 |

## 관련
[[topics/{topic}]] · [[insights/...]]
```

**4단계: 발표/강의 용도면 슬라이드 렌더링 (선택)**

사용자가 강의·발표자료를 HTML로 원하면, 합성 문서를 콘텐츠 소스로 삼아 **`lecture-slide-deck` 스킬**을 호출한다. 합성(이 스킬)은 내용을, lecture-slide-deck은 디자인을 담당한다.
- 산출물: `wiki/insights/YYYY-MM-DD-{slug}-슬라이드.html`
- 수치·인용은 이 합성 문서의 실제 값만 슬라이드에 옮긴다 (재생성 금지)

---

## 모드 4: skill-suggest — 패턴 감지 → 스킬 제안

### 목적
내가 반복적으로 요청하거나 수동으로 하는 작업을 감지해 스킬화 제안.

### 절차

**1단계: 패턴 감지**
다음 소스에서 반복 패턴 탐지:
- `wiki/log.md` — 반복 작업 유형
- `wiki/insights/skill-suggestions.md` — 기존 제안 로그
- 현재 대화 맥락 — 이번에 요청한 작업 유형

**2단계: skill-suggestions.md 갱신**

파일: `wiki/insights/skill-suggestions.md`

```markdown
---
type: meta
updated: YYYY-MM-DD
---
# 스킬 제안 로그

## 감지된 패턴

| 패턴 | 감지 횟수 | 마지막 감지 | 상태 |
|------|---------|-----------|------|
| {패턴명} | N회 | YYYY-MM-DD | 제안 대기 / 초안 생성 / 스킬 설치됨 |

## 스킬 초안 목록
- [[skill-drafts/{slug}]] — {설명}
```

**3단계: 임계값 초과 시 스킬 초안 자동 생성**

조건: **같은 패턴 3회 이상** 또는 **2주 내 2회 이상**

초안 파일: `wiki/insights/skill-drafts/{slug}.md`

```markdown
---
draft: true
pattern: "{감지된 패턴}"
detected: N회
last_seen: YYYY-MM-DD
---
# 스킬 초안: {이름}

## 왜 이 스킬이 필요한가
(감지된 패턴 설명)

## 하는 일
(자동화할 작업 목록)

## 트리거 키워드 제안
- "{키워드1}", "{키워드2}"

## 절차 초안
(관찰된 작업 흐름 기반)

## 설치 방법
이 초안을 `~/.claude/skills/{slug}/SKILL.md`로 복사 후 다듬어 사용.
```

**4단계: 사용자에게 알림**
임계값 초과 시 sync 완료 메시지에 포함:
> "💡 반복 패턴 감지: '{패턴}' 3회 관찰. 스킬 초안을 `wiki/insights/skill-drafts/`에 저장했습니다."

---

## 공통 후처리 (모든 모드 완료 후)

1. **패턴 기록 갱신** — `wiki/insights/skill-suggestions.md`에 이번 작업 유형 기록
2. **log.md 상단 추가** — 실행 모드, 생성 파일 목록
3. **hot.md 갱신** — 최신 합성 결과 요약 (500 words 이하 유지)

---

## 빠른 체크리스트

- [ ] 모드 확인 (미지정 시 질문)
- [ ] **[pattern]** posts frontmatter 집계 → insights 문서 생성
- [ ] **[comments]** 스크립트로 댓글 전수 집계 → 실제 빈도 확인 → follower-interests 문서 작성
- [ ] **[topic]** 관련 데이터 수집 → 목차 승인 → 합성 문서 생성
- [ ] **[skill-suggest]** 패턴 감지 → skill-suggestions.md 갱신
- [ ] 임계값(3회/2주 2회) 초과 패턴 → 스킬 초안 파일 생성
- [ ] log.md 상단 추가
- [ ] hot.md 갱신

---

## 주의사항

- 포스트 원본 파일 수정 금지 — 읽기 전용
- 기존 insights 문서는 덮어쓰지 않고 새 날짜 파일로 생성 (단, my-post-patterns.md는 갱신)
- 스킬 초안은 제안일 뿐 — 자동 설치하지 않음
- Windows python3 사용 시 `encoding='utf-8'` 필수
- **빈도·순위가 들어가는 표는 반드시 스크립트 실행 결과 기반으로 작성** — 샘플 읽고 인상으로 추정 후 작성 절대 금지
- **숫자가 포함된 주장은 근거를 명시** — "다수", "반복" 같은 표현도 실제 집계 수가 뒷받침돼야 사용 가능

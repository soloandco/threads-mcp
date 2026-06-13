# threads-mcp

[한국어](#한국어) | [English](#english)

---

## 한국어

Claude Code가 당신의 글쓰기 기록을 읽고 분석하는 로컬 LLM Wiki입니다.

Andrej Karpathy의 [LLM Wiki 패턴](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)을 따릅니다 — 원본 소스를 매번 재처리하는 대신, LLM이 Obsidian vault 안에 wiki를 점진적으로 구축·유지합니다. Threads 데이터 연동은 선택 사항입니다.

**데이터는 전부 로컬에 저장됩니다. 외부로 전송되지 않습니다.**

---

### 전체 흐름

```
Step 1: Obsidian + Clipper 설치
Step 2: vault 안에 wiki 폴더 구조 생성
Step 3: Claude Code에 MCP 연결
Step 4 (선택): Threads 데이터 연동
```

---

### Step 1: Obsidian + Clipper 설치

#### 1-1. Obsidian 설치

[obsidian.md/ko](https://obsidian.md/ko/)에서 설치합니다.

설치 후 새 vault를 만듭니다. 위치 예시:

| OS | 경로 예시 |
|----|-----------|
| macOS | `~/Documents/my-wiki` |
| Windows | `C:\Users\이름\Documents\my-wiki` |

> vault 이름과 위치는 자유입니다. 이후 설정에서 이 경로를 사용합니다.

#### 1-2. Obsidian Clipper 설치 (선택)

브라우저에서 웹 페이지를 vault로 바로 저장하려면:

- Chrome / Arc: [Chrome Web Store](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf) → **Obsidian Web Clipper** 설치
- Firefox: [Firefox Add-ons](https://addons.mozilla.org/ko/firefox/addon/web-clipper-obsidian/) → **Obsidian Web Clipper** 설치

설치 후 브라우저 우측 상단 Clipper 아이콘 클릭 → vault 선택 → 저장 폴더를 `Clippings`로 설정합니다.

---

### Step 2: vault 안에 wiki 폴더 구조 생성

#### 2-1. 이 저장소 클론

```bash
git clone https://github.com/soloandco/threads-mcp.git
cd threads-mcp
npm install
```

#### 2-2. config 파일 생성

vault 안에 `threads` 폴더를 만들고 config 파일을 그 안에 배치합니다:

```bash
# macOS / Linux
mkdir -p ~/Documents/my-wiki/threads
cp config.yaml.example ~/Documents/my-wiki/threads/config.yaml

# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documents\my-wiki\threads"
Copy-Item config.yaml.example "$env:USERPROFILE\Documents\my-wiki\threads\config.yaml"
```

> `config.yaml`을 vault 안에 두면 MCP가 wiki 폴더를 vault 안에 자동 생성합니다.

#### 2-3. wiki 폴더 구조 확인

MCP를 처음 실행하면 아래 구조가 자동으로 만들어집니다:

```
my-wiki/                        ← Obsidian vault 루트
└── threads/
    ├── config.yaml             ← 설정 파일
    ├── raw/                    ← 원본 데이터 (JSON)
    │   ├── posts.json
    │   └── replies.json
    └── wiki/                   ← Obsidian에서 탐색하는 영역
        ├── posts/              ← 포스트별 노트
        │   ├── _index.md
        │   └── YYYY-MM-DD-slug.md
        ├── drafts/             ← 초안 노트
        └── insights/           ← 분석·합성 문서
```

Obsidian에서 vault를 열면 `threads/wiki/` 안의 노트가 바로 보입니다.

---

### Step 3: Claude Code에 MCP 연결

프로젝트 루트(또는 `~/.claude/`)에 `.mcp.json` 파일을 만듭니다:

**macOS / Linux:**

```json
{
  "mcpServers": {
    "threads": {
      "command": "npx",
      "args": ["tsx", "/절대경로/threads-mcp/src/server.ts"],
      "env": {
        "THREADS_CONFIG": "/절대경로/my-wiki/threads/config.yaml"
      }
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "threads": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["tsx", "C:\\절대경로\\threads-mcp\\src\\server.ts"],
      "env": {
        "THREADS_CONFIG": "C:\\절대경로\\my-wiki\\threads\\config.yaml"
      }
    }
  }
}
```

> `THREADS_CONFIG`에 config.yaml의 절대 경로를 지정합니다. 이 경로를 기준으로 wiki 폴더가 결정됩니다.

Claude Code를 재시작하면 `threads` MCP 서버가 로드됩니다. `/mcp`로 연결 확인.

---

### Step 4 (선택): Threads 데이터 연동

Threads 계정이 없어도 Step 3까지로 wiki 기능은 사용할 수 있습니다. 내 Threads 포스트를 wiki로 가져오려면:

#### 4-1. Threads 액세스 토큰 발급

1. [Meta for Developers](https://developers.facebook.com/) → 새 앱 생성 (앱 유형: **기타**)
2. 앱에 **Threads API** 제품 추가
3. **Threads API → 사용자 토큰 생성** → 권한: `threads_basic`, `threads_content_publish`
4. 단기 토큰(1시간) → 장기 토큰(60일)으로 교환:

```bash
curl "https://graph.threads.net/access_token\
?grant_type=th_exchange_token\
&client_id=앱ID\
&client_secret=앱시크릿\
&access_token=단기토큰"
```

#### 4-2. 토큰 설정

환경 변수로 전달하거나 (권장):

```json
"env": {
  "THREADS_CONFIG": "/경로/my-wiki/threads/config.yaml",
  "THREADS_ACCESS_TOKEN": "발급받은_장기_토큰"
}
```

또는 `config.yaml`에 직접:

```yaml
threads:
  access_token: "발급받은_장기_토큰"
```

#### 4-3. 데이터 수집 및 wiki 내보내기

Claude Code에서:

```
collect_posts       # Threads에서 포스트 수집
export_to_wiki      # Obsidian 노트로 변환
```

---

### Claude Code 스킬

MCP가 데이터 레이어라면, 스킬은 그 위에서 동작하는 워크플로 레시피입니다.

#### threads — 글쓰기 코칭

`.claude/skills/threads/` — 소크라테스식 7단계 글쓰기 워크플로.  
트리거: `"스레드 글 써줘"`, `"오늘 글"`

스킬은 예시 파일(`*.example`)로만 제공합니다. 본인 스타일로 채워서 쓰세요:

```
.claude/skills/threads/
├── SKILL.md.example                        ← 7단계 구조 (여기서 시작)
└── references/
    ├── anti-slop-ko.md                     ← 한국어 anti-slop 가드 (그대로 사용 가능)
    ├── voice-profile.md.example            ← 본인 문체 수치 입력 템플릿
    └── exemplar-and-verify.md.example      ← 예문 선별·검증 절차
```

시작 방법:

```bash
cp .claude/skills/threads/SKILL.md.example .claude/skills/threads/SKILL.md
cp .claude/skills/threads/references/voice-profile.md.example \
   .claude/skills/threads/references/voice-profile.md
cp .claude/skills/threads/references/exemplar-and-verify.md.example \
   .claude/skills/threads/references/exemplar-and-verify.md
```

이후 각 파일의 `커스터마이징 포인트` 주석을 본인 전략으로 채웁니다.

#### threads-wiki-synthesis — wiki 합성·분석

`.claude/skills/threads-wiki-synthesis/` — 포스트·댓글 데이터를 분석해 인사이트 문서를 생성합니다.  
트리거: `"패턴 분석"`, `"댓글에서 배운 것"`, `"강의 자료 만들어줘"`

| 모드 | 하는 일 | 출력 위치 |
|------|--------|-----------|
| **pattern** | 전체 포스트 engagement 패턴 집계 | `wiki/insights/YYYY-MM-DD-post-patterns.md` |
| **comments** | 댓글 전수 집계 → 팔로워 관심사 추출 | `wiki/insights/YYYY-MM-DD-follower-interests.md` |
| **topic** | 특정 토픽·기간 합성 → 강의 목차 생성 | `wiki/insights/YYYY-MM-DD-{topic}-synthesis.md` |
| **skill-suggest** | 반복 작업 감지 → 스킬 초안 자동 생성 | `wiki/insights/skill-suggestions.md` |

> 빈도·순위가 들어간 표는 반드시 스크립트 집계 결과 기반으로 작성합니다. 샘플 기반 추정을 금지하는 규칙이 스킬에 명시되어 있습니다.

---

### MCP 도구 (17개)

| 도구 | 용도 |
|------|------|
| `collect_posts` | Threads API에서 포스트·댓글 수집 |
| `get_posts` | 포스팅 목록 조회 (필터·정렬) |
| `get_engagement_stats` | 좋아요·댓글·조회 통계 |
| `get_top_content` | 성과 상위 포스팅 |
| `get_topic_frequency` | 주제 키워드 빈도 |
| `get_trending_now` | 이번 주 급상승 키워드 |
| `get_my_replies` | 내 댓글 활동 분석 |
| `get_user_summary` | 수집 현황 요약 |
| `get_brand_dna` | 브랜드 설정 조회 |
| `update_brand_dna` | 브랜드 설정 업데이트 |
| `save_draft` | 글 초안 로컬 저장 |
| `list_drafts` | 초안 목록 |
| `get_draft_context` | 초안 작성용 컨텍스트 집약 |
| `export_to_wiki` | Obsidian wiki 내보내기 |
| `save_feedback` | 초안 피드백 저장 (다음 초안에 자동 반영) |
| `get_feedback_rules` | 저장된 피드백·규칙 목록 조회 |
| `promote_feedback` | 규칙을 브랜드 DNA에 영구 등록 |

---

### 개발

```bash
npm test          # vitest (39개 테스트)
npm run build     # tsc 빌드
npm run dev       # tsx로 서버 직접 실행
```

---

## English

A local LLM Wiki where Claude Code reads and analyzes your writing history.

Follows Andrej Karpathy's [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — instead of reprocessing raw sources on every query, LLMs incrementally build and maintain a wiki inside your Obsidian vault. Threads integration is optional.

**All data stays local. Nothing is sent to external servers.**

---

### Overview

```
Step 1: Install Obsidian + Clipper
Step 2: Create wiki folder structure inside your vault
Step 3: Connect to Claude Code via MCP
Step 4 (optional): Connect Threads data
```

---

### Step 1: Install Obsidian + Clipper

#### 1-1. Install Obsidian

Download from [obsidian.md](https://obsidian.md/) and create a new vault. Example locations:

| OS | Example path |
|----|--------------|
| macOS | `~/Documents/my-wiki` |
| Windows | `C:\Users\name\Documents\my-wiki` |

> The vault name and location are up to you. You'll use this path in the next step.

#### 1-2. Install Obsidian Clipper (optional)

To save web pages directly to your vault from the browser:

- Chrome / Arc: [Chrome Web Store](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf) → **Obsidian Web Clipper**
- Firefox: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/web-clipper-obsidian/) → **Obsidian Web Clipper**

After installing: click the Clipper icon → select your vault → set the save folder to `Clippings`.

---

### Step 2: Create wiki folder structure inside your vault

#### 2-1. Clone this repository

```bash
git clone https://github.com/soloandco/threads-mcp.git
cd threads-mcp
npm install
```

#### 2-2. Create the config file

Create a `threads` folder inside your vault and place the config file there:

```bash
# macOS / Linux
mkdir -p ~/Documents/my-wiki/threads
cp config.yaml.example ~/Documents/my-wiki/threads/config.yaml

# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\Documents\my-wiki\threads"
Copy-Item config.yaml.example "$env:USERPROFILE\Documents\my-wiki\threads\config.yaml"
```

> Placing `config.yaml` inside the vault causes the MCP to automatically create the wiki folder within it.

#### 2-3. Wiki folder structure

On first run, the MCP creates this structure automatically:

```
my-wiki/                        ← Obsidian vault root
└── threads/
    ├── config.yaml             ← configuration
    ├── raw/                    ← source data (JSON)
    │   ├── posts.json
    │   └── replies.json
    └── wiki/                   ← browsable in Obsidian
        ├── posts/              ← per-post notes
        │   ├── _index.md
        │   └── YYYY-MM-DD-slug.md
        ├── drafts/             ← draft notes
        └── insights/           ← analysis documents
```

Open the vault in Obsidian and the notes under `threads/wiki/` are immediately visible.

---

### Step 3: Connect to Claude Code

Create a `.mcp.json` file in your project root or `~/.claude/`:

**macOS / Linux:**

```json
{
  "mcpServers": {
    "threads": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/threads-mcp/src/server.ts"],
      "env": {
        "THREADS_CONFIG": "/absolute/path/to/my-wiki/threads/config.yaml"
      }
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "threads": {
      "command": "C:\\Program Files\\nodejs\\npx.cmd",
      "args": ["tsx", "C:\\absolute\\path\\to\\threads-mcp\\src\\server.ts"],
      "env": {
        "THREADS_CONFIG": "C:\\absolute\\path\\to\\my-wiki\\threads\\config.yaml"
      }
    }
  }
}
```

> `THREADS_CONFIG` must be the absolute path to `config.yaml`. The wiki folder is determined relative to it.

Restart Claude Code. Verify with `/mcp` — the `threads` server should appear.

---

### Step 4 (optional): Connect Threads data

The wiki features work without a Threads account. To import your Threads posts:

#### 4-1. Get an access token

1. Go to [Meta for Developers](https://developers.facebook.com/) → create a new app (type: **Other**)
2. Add the **Threads API** product to your app
3. **Threads API → Generate User Token** → permissions: `threads_basic`, `threads_content_publish`
4. Exchange the short-lived token (1 hour) for a long-lived token (60 days):

```bash
curl "https://graph.threads.net/access_token\
?grant_type=th_exchange_token\
&client_id=APP_ID\
&client_secret=APP_SECRET\
&access_token=SHORT_LIVED_TOKEN"
```

#### 4-2. Set the token

Via environment variable (recommended):

```json
"env": {
  "THREADS_CONFIG": "/path/to/my-wiki/threads/config.yaml",
  "THREADS_ACCESS_TOKEN": "your_long_lived_token"
}
```

Or directly in `config.yaml`:

```yaml
threads:
  access_token: "your_long_lived_token"
```

#### 4-3. Collect and export

In Claude Code:

```
collect_posts     # fetch posts from Threads API
export_to_wiki    # convert to Obsidian notes
```

---

### Claude Code Skills (included)

The MCP is the data layer; skills are workflow recipes that run on top of it.

#### threads — Writing Coaching

`.claude/skills/threads/` — Socratic 7-step writing workflow.  
Triggers on: `"write a threads post"`, `"오늘 글"`

Skills are provided as example files (`*.example`) — fill them in with your own style:

```
.claude/skills/threads/
├── SKILL.md.example                        ← 7-step structure (start here)
└── references/
    ├── anti-slop-ko.md                     ← Korean anti-slop guard (usable as-is)
    ├── voice-profile.md.example            ← template for your voice profile metrics
    └── exemplar-and-verify.md.example      ← exemplar selection & verification
```

```bash
cp .claude/skills/threads/SKILL.md.example .claude/skills/threads/SKILL.md
cp .claude/skills/threads/references/voice-profile.md.example \
   .claude/skills/threads/references/voice-profile.md
cp .claude/skills/threads/references/exemplar-and-verify.md.example \
   .claude/skills/threads/references/exemplar-and-verify.md
```

Then fill in the `커스터마이징 포인트` comments in each file.

#### threads-wiki-synthesis — Wiki Analysis

`.claude/skills/threads-wiki-synthesis/` — Analyzes posts and comments to generate insight documents.  
Triggers on: `"패턴 분석"`, `"강의 자료 만들어줘"`, `"댓글에서 배운 것"`

| Mode | What it does | Output |
|------|-------------|--------|
| **pattern** | Aggregate engagement patterns | `wiki/insights/YYYY-MM-DD-post-patterns.md` |
| **comments** | Count all comments → extract follower interests | `wiki/insights/YYYY-MM-DD-follower-interests.md` |
| **topic** | Synthesize a topic or time period → course outline | `wiki/insights/YYYY-MM-DD-{topic}-synthesis.md` |
| **skill-suggest** | Detect repeated tasks → generate skill drafts | `wiki/insights/skill-suggestions.md` |

> Any table with frequencies or rankings must be based on actual script output — estimation from samples is explicitly prohibited in the skill.

---

### MCP Tools (17)

| Tool | Purpose |
|------|---------|
| `collect_posts` | Fetch posts and replies from Threads API |
| `get_posts` | List posts with filters and sorting |
| `get_engagement_stats` | Likes, replies, and views statistics |
| `get_top_content` | Top-performing posts |
| `get_topic_frequency` | Keyword frequency analysis |
| `get_trending_now` | Trending keywords this week |
| `get_my_replies` | Reply activity analysis |
| `get_user_summary` | Collection status summary |
| `get_brand_dna` | View brand settings |
| `update_brand_dna` | Update brand settings |
| `save_draft` | Save a draft locally |
| `list_drafts` | List saved drafts |
| `get_draft_context` | Aggregate context for draft writing |
| `export_to_wiki` | Export to Obsidian wiki |
| `save_feedback` | Save draft feedback (auto-applied in next draft) |
| `get_feedback_rules` | View saved feedback and distilled rules |
| `promote_feedback` | Promote a rule to permanent brand DNA |

---

### Development

```bash
npm test          # vitest (39 tests)
npm run build     # tsc build
npm run dev       # run server directly with tsx
```

## License

[AGPL-3.0](./LICENSE)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { LocalStore } from '../stores/local-store'
import type { Post, Reply } from '../stores/store'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    text: '테스트 포스트',
    posted_at: '2026-05-01T09:00:00Z',
    like_count: 10,
    reply_count: 2,
    repost_count: 0,
    view_count: 100,
    is_reply: false,
    ...overrides,
  }
}

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-test-'))
  configPath = path.join(tmpDir, 'config.yaml')
  fs.writeFileSync(configPath, 'threads:\n  access_token: test-token\n', 'utf-8')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('LocalStore.getPosts', () => {
  it('저장된 포스트를 필터링해서 반환한다', async () => {
    const postsDir = path.join(tmpDir, 'raw')
    fs.mkdirSync(postsDir, { recursive: true })
    const posts = [
      makePost({ id: '1', posted_at: new Date().toISOString(), is_reply: false }),
      makePost({ id: '2', posted_at: new Date().toISOString(), is_reply: true }),
    ]
    fs.writeFileSync(path.join(postsDir, 'posts.json'), JSON.stringify(posts), 'utf-8')

    const store = new LocalStore(configPath)
    const result = await store.getPosts({ limit: 10, days: 7, type: 'post', orderBy: 'recent' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('포스팅이 없으면 빈 배열 반환', async () => {
    const store = new LocalStore(configPath)
    const result = await store.getPosts({ limit: 10, days: 7, type: 'post', orderBy: 'recent' })
    expect(result).toEqual([])
  })
})

describe('LocalStore.getEngagementStats', () => {
  it('좋아요·댓글·조회 평균을 계산한다', async () => {
    const postsDir = path.join(tmpDir, 'raw')
    fs.mkdirSync(postsDir, { recursive: true })
    const posts = [
      makePost({ id: '1', posted_at: new Date().toISOString(), like_count: 10, reply_count: 2, view_count: 100, is_reply: false }),
      makePost({ id: '2', posted_at: new Date().toISOString(), like_count: 20, reply_count: 4, view_count: 200, is_reply: false }),
    ]
    fs.writeFileSync(path.join(postsDir, 'posts.json'), JSON.stringify(posts), 'utf-8')

    const store = new LocalStore(configPath)
    const stats = await store.getEngagementStats(30)
    expect(stats.total).toBe(2)
    expect(stats.avgLikes).toBe(15)
    expect(stats.avgReplies).toBe(3)
  })
})

describe('LocalStore.getBrandDna', () => {
  it('config에서 brand 정보를 읽는다', async () => {
    fs.writeFileSync(configPath, `
threads:
  access_token: test-token
brand:
  vision: "테스트 비전"
  target_pains:
    - "고통 1"
`, 'utf-8')

    const store = new LocalStore(configPath)
    const dna = await store.getBrandDna()
    expect(dna.vision).toBe('테스트 비전')
    expect(dna.target_pains).toEqual(['고통 1'])
  })
})

describe('LocalStore.saveDraft + listDrafts', () => {
  it('초안을 저장하고 목록에서 조회할 수 있다', async () => {
    const store = new LocalStore(configPath)
    const draft = await store.saveDraft({ title: '테스트 초안', content: '내용입니다' })
    expect(draft.id).toBeDefined()
    expect(draft.title).toBe('테스트 초안')

    const drafts = await store.listDrafts(10)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].title).toBe('테스트 초안')
    expect(drafts[0].content).toBe('내용입니다')
  })
})

describe('LocalStore.exportToWiki', () => {
  function writePosts(posts: Post[]) {
    const dir = path.join(tmpDir, 'raw')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'posts.json'), JSON.stringify(posts), 'utf-8')
  }

  function writeReplies(replies: Reply[]) {
    const dir = path.join(tmpDir, 'raw')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'replies.json'), JSON.stringify(replies), 'utf-8')
  }

  it('루트 포스트만 파일로 생성하고 continuation은 임베드한다', async () => {
    const root = makePost({ id: 'root', text: '루트 글', posted_at: '2026-01-15T09:00:00Z' })
    // 실제 Threads 자기답글은 is_reply=true — 이 케이스로 검증
    const continuation = makePost({
      id: 'cont',
      text: '이어쓰기',
      posted_at: '2026-01-15T09:01:00Z',
      is_reply: true,
      replied_to_id: 'root',
    })
    // 타인에게 단 답글: 파일·체인에 포함되면 안 됨
    const replyToOther = makePost({
      id: 'reply-other',
      text: '남의 글에 단 댓글',
      posted_at: '2026-01-15T09:02:00Z',
      is_reply: true,
      replied_to_id: 'someone-elses-post',
    })
    writePosts([root, continuation, replyToOther])

    const store = new LocalStore(configPath)
    const result = await store.exportToWiki({ force: false })

    // 루트 1개만 생성 (continuation·타인답글은 파일 없음)
    expect(result.created).toBe(1)
    const wikiDir = path.join(tmpDir, 'wiki', 'posts')
    const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md') && f !== '_index.md')
    expect(files).toHaveLength(1)

    // 루트 파일에 이어쓰기 섹션 포함, 타인답글은 미포함
    const content = fs.readFileSync(path.join(wikiDir, files[0]!), 'utf-8')
    expect(content).toContain('## 이어진 글')
    expect(content).toContain('이어쓰기')
    expect(content).not.toContain('남의 글에 단 댓글')
  })

  it('댓글 트리를 ## 댓글 원본 섹션에 렌더한다', async () => {
    const root = makePost({ id: 'root', text: '원글', posted_at: '2026-01-15T09:00:00Z' })
    writePosts([root])
    const reply: Reply = {
      id: 'r1',
      root_post_id: 'root',
      username: 'fan1',
      text: '좋아요!',
      timestamp: '2026-01-15T10:00:00Z',
      has_replies: false,
    }
    writeReplies([reply])

    const store = new LocalStore(configPath)
    await store.exportToWiki({ force: false })

    const wikiDir = path.join(tmpDir, 'wiki', 'posts')
    const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md') && f !== '_index.md')
    const content = fs.readFileSync(path.join(wikiDir, files[0]!), 'utf-8')
    expect(content).toContain('## 댓글')
    expect(content).toContain('**@fan1**')
    expect(content).toContain('> 좋아요!')
  })

  it('(미작성) 플레이스홀더가 유지된다', async () => {
    writePosts([makePost({ id: 'root', posted_at: '2026-01-15T09:00:00Z' })])

    const store = new LocalStore(configPath)
    await store.exportToWiki({ force: false })

    const wikiDir = path.join(tmpDir, 'wiki', 'posts')
    const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md') && f !== '_index.md')
    const content = fs.readFileSync(path.join(wikiDir, files[0]!), 'utf-8')
    expect(content).toContain('## 댓글에서 배운 것')
    expect(content).toContain('## 사고 연결')
    const count = (content.match(/\(미작성\)/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(2)
  })
})

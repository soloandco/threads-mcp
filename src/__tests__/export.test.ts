import { describe, it, expect } from 'vitest'
import { slugify, generateWikiNote } from '../wiki/export'
import type { Post, Reply } from '../stores/store'

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: 'abc',
  threads_post_id: 'abc',
  text: '첫 줄\n두 번째',
  posted_at: '2026-01-15T09:00:00Z',
  like_count: 5,
  reply_count: 2,
  repost_count: 0,
  view_count: 100,
  is_reply: false,
  ...overrides,
})

const makeReply = (overrides: Partial<Reply> = {}): Reply => ({
  id: 'r1',
  root_post_id: 'abc',
  username: 'user1',
  text: '댓글입니다',
  timestamp: '2026-01-15T10:00:00Z',
  has_replies: false,
  ...overrides,
})

describe('slugify', () => {
  it('첫 줄을 kebab-case로 변환한다', () => {
    expect(slugify('창업 이야기\n두 번째 줄')).toBe('창업-이야기')
  })

  it('특수문자를 제거한다', () => {
    expect(slugify('Hello: World!')).toBe('Hello-World')
  })

  it('30자로 자른다', () => {
    const long = '가'.repeat(50)
    expect(slugify(long).length).toBeLessThanOrEqual(30)
  })

  it('빈 텍스트면 untitled 반환', () => {
    expect(slugify('')).toBe('untitled')
  })

  it('whitespace만 있으면 untitled 반환', () => {
    expect(slugify('   \n\n  ')).toBe('untitled')
  })
})

describe('generateWikiNote', () => {
  it('frontmatter와 본문을 포함한다', () => {
    const note = generateWikiNote(makePost(), [], [])
    expect(note).toContain('type: post')
    expect(note).toContain('date: 2026-01-15')
    expect(note).toContain('likes: 5')
    expect(note).toContain('replies: 2')
    expect(note).toContain('reposts: 0')
    expect(note).toContain('views: 100')
    expect(note).toContain('## 본문')
    expect(note).toContain('첫 줄')
  })

  it('title이 80자로 잘린다', () => {
    const note = generateWikiNote(makePost({ text: '가'.repeat(100) }), [], [])
    expect(note).toContain(`# ${'가'.repeat(80)}`)
  })

  it('content_context가 있으면 tags에 포함한다', () => {
    const note = generateWikiNote(makePost({ content_context: 'authority' }), [], [])
    expect(note).toContain('tags: ["authority"]')
  })

  it('threads_post_id가 없으면 id를 사용한다', () => {
    const note = generateWikiNote(makePost({ id: 'fallback-id', threads_post_id: undefined }), [], [])
    expect(note).toContain('threads_id: "fallback-id"')
  })

  it('permalink가 있으면 url 프론트매터와 원문 링크를 포함한다', () => {
    const note = generateWikiNote(
      makePost({ permalink: 'https://www.threads.com/@soloandco.club/post/DU9lIrgEdsC' }),
      [],
      []
    )
    expect(note).toContain('url: "https://www.threads.com/@soloandco.club/post/DU9lIrgEdsC"')
    expect(note).toContain('🔗 [Threads 원문 보기](https://www.threads.com/@soloandco.club/post/DU9lIrgEdsC)')
  })

  it('permalink가 없으면 url은 빈 값이고 원문 링크 줄은 없다', () => {
    const note = generateWikiNote(makePost(), [], [])
    expect(note).toContain('url: ""')
    expect(note).not.toContain('🔗 [Threads 원문 보기]')
  })

  it('(미작성) 플레이스홀더를 포함한다', () => {
    const note = generateWikiNote(makePost(), [], [])
    expect(note).toContain('## 댓글에서 배운 것')
    expect(note).toContain('## 사고 연결')
    const count = (note.match(/\(미작성\)/g) ?? []).length
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('이어쓰기 체인이 있으면 ## 이어진 글 섹션을 포함한다', () => {
    const continuation = makePost({
      id: 'abc2',
      text: '이어쓰기 내용',
      replied_to_id: 'abc',
    })
    const note = generateWikiNote(makePost(), [continuation], [])
    expect(note).toContain('## 이어진 글')
    expect(note).toContain('이어쓰기 내용')
  })

  it('체인이 없으면 ## 이어진 글 섹션이 없다', () => {
    const note = generateWikiNote(makePost(), [], [])
    expect(note).not.toContain('## 이어진 글')
  })

  it('댓글이 있으면 ## 댓글에 블록쿼트 형식으로 렌더한다', () => {
    const reply = makeReply({ username: 'fan1', text: '멋진 글이에요', permalink: 'https://www.threads.com/@fan1/post/abc' })
    const note = generateWikiNote(makePost(), [], [reply])
    expect(note).toContain('## 댓글')
    expect(note).toContain('**[@fan1](https://www.threads.com/@fan1/post/abc)**')
    expect(note).toContain('> 멋진 글이에요')
  })

  it('permalink 없으면 링크 없는 굵은 글씨로 렌더한다', () => {
    const reply = makeReply({ username: 'fan1', text: '댓글' })
    const note = generateWikiNote(makePost(), [], [reply])
    expect(note).toContain('**@fan1**')
    expect(note).toContain('> 댓글')
  })

  it('HIDDEN 댓글은 제외한다', () => {
    const visible = makeReply({ id: 'r1', username: 'fan1', text: '보임' })
    const hidden = makeReply({ id: 'r2', username: 'troll', text: '숨김', hide_status: 'HIDDEN' })
    const note = generateWikiNote(makePost(), [], [visible, hidden])
    expect(note).toContain('**@fan1**')
    expect(note).not.toContain('@troll')
  })

  it('대댓글은 2칸 들여쓴 블록쿼트로 렌더한다', () => {
    const parent = makeReply({ id: 'r1', username: 'user1', text: '부모 댓글' })
    const child = makeReply({ id: 'r2', username: 'user2', text: '대댓글', replied_to_id: 'r1' })
    const note = generateWikiNote(makePost(), [], [parent, child])
    expect(note).toContain('> **@user1**')
    expect(note).toContain('  > **@user2**')
    expect(note).toContain('  > 대댓글')
  })

  it('댓글 없으면 수집된 댓글 없음 표시', () => {
    const note = generateWikiNote(makePost(), [], [])
    expect(note).toContain('(수집된 댓글 없음)')
  })
})

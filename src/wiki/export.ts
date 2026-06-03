import * as fs from 'fs'
import * as path from 'path'
import type { Post, Reply } from '../stores/store'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function safeDate(raw: string): string {
  const d = (raw ?? '').slice(0, 10)
  return ISO_DATE_RE.test(d) ? d : 'unknown-date'
}

export function slugify(text: string): string {
  const firstLine = (text ?? '').split('\n')[0]?.trim() ?? ''
  const cleaned = firstLine
    .replace(/[\\/:*?"<>|#%&{}\[\]!]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30)
  return cleaned || 'untitled'
}

// 이미 한 원글로 스코프된 댓글 배열에서 parentId의 자식을 들여쓰기 렌더.
// visited로 순환 차단, depth 캡으로 폭주 차단.
function renderReplyChildren(
  replies: Reply[],
  parentId: string,
  depth: number,
  visited: Set<string>
): string[] {
  if (depth > 50) return []
  const indent = '  '.repeat(depth)
  const children = replies.filter(r => r.replied_to_id === parentId && !visited.has(r.id))
  const lines: string[] = []
  for (const r of children) {
    visited.add(r.id)
    lines.push(`${indent}@${r.username}: ${r.text.replace(/\n/g, ' ')}`)
    lines.push(...renderReplyChildren(replies, r.id, depth + 1, visited))
  }
  return lines
}

export function generateWikiNote(
  rootPost: Post,
  chainPosts: Post[],  // replied_to_id 체인으로 이어진 내 포스트들 (ordered)
  postReplies: Reply[] // root_post_id === rootPost.id인 댓글들
): string {
  const date = safeDate(rootPost.posted_at ?? '')
  const today = new Date().toISOString().slice(0, 10)
  const title = (rootPost.text ?? '').split('\n')[0]?.trim().slice(0, 80) || '(제목 없음)'
  const tagsArr = rootPost.content_context ? [`"${rootPost.content_context}"`] : []
  const baseFilename = `${date}-${slugify(rootPost.text ?? '')}`

  const visibleReplies = postReplies.filter(r => r.hide_status !== 'HIDDEN')
  // 최상위 댓글: replied_to_id 없거나 루트 포스트 자체가 replied_to
  const visited = new Set<string>()
  const replyTreeLines: string[] = []
  for (const r of visibleReplies.filter(r => !r.replied_to_id || r.replied_to_id === rootPost.id)) {
    if (visited.has(r.id)) continue
    visited.add(r.id)
    replyTreeLines.push(`@${r.username}: ${r.text.replace(/\n/g, ' ')}`)
    replyTreeLines.push(...renderReplyChildren(visibleReplies, r.id, 1, visited))
  }

  const sections: string[] = [
    '---',
    'type: post',
    'status: published',
    `date: ${date}`,
    `threads_id: "${rootPost.threads_post_id ?? rootPost.id}"`,
    `likes: ${rootPost.like_count ?? 0}`,
    `replies: ${rootPost.reply_count ?? 0}`,
    `reposts: ${rootPost.repost_count ?? 0}`,
    `views: ${rootPost.view_count ?? 0}`,
    'media: false',
    `tags: [${tagsArr.join(', ')}]`,
    'topics: []',
    `created: ${date}`,
    `updated: ${today}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## 본문',
    '',
    rootPost.text ?? '',
  ]

  if (chainPosts.length > 0) {
    sections.push('', '## 이어진 글', '')
    for (const p of chainPosts) {
      sections.push(`### ${p.posted_at.slice(0, 10)}`, '', p.text ?? '', '')
    }
  }

  sections.push(
    '',
    '## 인게이지먼트 메모',
    '',
    '(반응 특이사항)',
  )

  if (replyTreeLines.length > 0) {
    sections.push('', '## 댓글 원본', '')
    sections.push(...replyTreeLines)
  } else {
    sections.push('', '## 댓글 원본', '', '(수집된 댓글 없음)')
  }

  sections.push(
    '',
    '## 댓글에서 배운 것',
    '',
    '(미작성)',
    '',
    '## 관련',
    '',
    '- 주제: [[topics/]]',
    `- raw: [[raw/my-posts/${baseFilename}]]`,
    '',
    '## 사고 연결',
    '',
    '(미작성)',
  )

  return sections.join('\n')
}

export function exportPostsToWiki(
  posts: Post[],
  replies: Reply[],
  wikiDir: string,
  force: boolean
): { created: number; updated: number; skipped: number } {
  const postsDir = path.join(wikiDir, 'posts')
  fs.mkdirSync(postsDir, { recursive: true })

  // 내 포스트 id 집합 (체인 판별용)
  const myPostIds = new Set(posts.map(p => p.id))

  // 체인 continuation 판별: replied_to_id가 내 포스트인 것 = 이어쓰기(자기답글)
  const isChainContinuation = (p: Post) =>
    !!p.replied_to_id && myPostIds.has(p.replied_to_id)

  // 루트 포스트만 파일로 생성 (원글이면서 자기답글 체인 중간이 아닌 것).
  // 타인에게 단 답글(is_reply=true, replied_to_id가 내 글 아님)은 파일 대상에서 제외.
  const rootPosts = posts.filter(p => !p.is_reply && !isChainContinuation(p))

  // 각 루트의 이어쓰기 체인 수집 (BFS, posted_at 순). visited로 순환 차단.
  function getChain(rootId: string): Post[] {
    const chain: Post[] = []
    const visited = new Set<string>([rootId])
    const queue = [rootId]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      const children = posts
        .filter(p => p.replied_to_id === parentId && myPostIds.has(p.id) && !visited.has(p.id))
        .sort((a, b) => a.posted_at.localeCompare(b.posted_at))
      for (const c of children) {
        visited.add(c.id)
        chain.push(c)
        queue.push(c.id)
      }
    }
    return chain
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const today = new Date().toISOString().slice(0, 10)
  const indexRows: string[] = []

  for (const rootPost of rootPosts) {
    const date = safeDate(rootPost.posted_at ?? '') || today
    const slug = slugify(rootPost.text ?? '')
    const filename = `${date}-${slug}.md`
    const filePath = path.join(postsDir, filename)

    const exists = fs.existsSync(filePath)
    const firstLine = (rootPost.text ?? '').split('\n')[0]?.trim().slice(0, 50) ?? ''

    if (exists && !force) {
      skipped++
      indexRows.push(`| [[posts/${date}-${slug}\\|${firstLine}]] | ${date} | ${rootPost.like_count ?? 0} | ${rootPost.view_count ?? 0} |`)
      continue
    }

    const chainPosts = getChain(rootPost.id)
    const postReplies = replies.filter(r => r.root_post_id === rootPost.id)
    const note = generateWikiNote(rootPost, chainPosts, postReplies)

    fs.writeFileSync(filePath, note, 'utf-8')
    if (exists) updated++
    else created++
    indexRows.push(`| [[posts/${date}-${slug}\\|${firstLine}]] | ${date} | ${rootPost.like_count ?? 0} | ${rootPost.view_count ?? 0} |`)
  }

  // _index.md 갱신 (루트 포스트만 카운트)
  const indexPath = path.join(postsDir, '_index.md')
  const indexBody = [
    '---',
    'type: index',
    'section: posts',
    `updated: ${today}`,
    `total: ${indexRows.length}`,
    '---',
    '',
    '# 내 포스트 목록',
    '',
    '| 제목/슬러그 | 날짜 | 좋아요 | 조회 |',
    '|-------------|------|--------|------|',
    ...indexRows,
  ].join('\n')
  fs.writeFileSync(indexPath, indexBody, 'utf-8')

  return { created, updated, skipped }
}

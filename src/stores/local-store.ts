import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type {
  ThreadsStore, Post, Reply, BrandDna, Draft,
  EngagementStats, KeywordFreq, TrendingResult,
  ReplyActivity, UserSummary, CollectResult,
  Feedback, FeedbackRule,
} from './store'
import { PaidOnlyError } from './store'
import { ThreadsApiClient, normalizePost, normalizeReply } from '../threads/client'
import { calcKeywordFrequency, calcTrending, STOPWORDS } from '../analysis/keywords'
import { extractPatterns } from '../analysis/patterns'
import { exportPostsToWiki } from '../wiki/export'

interface RawConfig {
  threads?: { access_token?: string }
  brand?: BrandDna
}

function loadConfig(configPath: string): RawConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return (yaml.load(raw) as RawConfig) ?? {}
  } catch {
    return {}
  }
}

function sinceDate(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

export class LocalStore implements ThreadsStore {
  private readonly baseDir: string
  private readonly postsPath: string
  private readonly repliesPath: string
  private readonly feedbackPath: string
  private readonly rulesPath: string
  private readonly wikiDir: string
  private readonly draftsDir: string
  private readonly token: string
  private readonly configPath: string
  private brand: BrandDna

  constructor(configPath: string, tokenOverride?: string) {
    this.configPath = configPath
    this.baseDir = path.dirname(configPath)
    this.postsPath = path.join(this.baseDir, 'raw', 'posts.json')
    this.repliesPath = path.join(this.baseDir, 'raw', 'replies.json')
    this.feedbackPath = path.join(this.baseDir, 'raw', 'feedback.json')
    this.rulesPath = path.join(this.baseDir, 'raw', 'feedback-rules.json')
    this.wikiDir = path.join(this.baseDir, 'wiki')
    this.draftsDir = path.join(this.baseDir, 'wiki', 'drafts')

    const config = loadConfig(configPath)
    this.token = tokenOverride ?? config.threads?.access_token ?? ''
    this.brand = config.brand ?? {}

    fs.mkdirSync(path.dirname(this.postsPath), { recursive: true })
    fs.mkdirSync(this.draftsDir, { recursive: true })
  }

  // ─── 내부 헬퍼 ─────────────────────────────────────────────

  private readPosts(): Post[] {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.postsPath, 'utf-8'))
      return Array.isArray(parsed) ? (parsed as Post[]) : []
    } catch {
      return []
    }
  }

  private writePosts(posts: Post[]): void {
    const tmpPath = `${this.postsPath}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(posts, null, 2), 'utf-8')
    fs.renameSync(tmpPath, this.postsPath)
  }

  private readReplies(): Reply[] {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.repliesPath, 'utf-8'))
      return Array.isArray(parsed) ? (parsed as Reply[]) : []
    } catch {
      return []
    }
  }

  private writeReplies(replies: Reply[]): void {
    const tmpPath = `${this.repliesPath}.tmp`
    fs.writeFileSync(tmpPath, JSON.stringify(replies, null, 2), 'utf-8')
    fs.renameSync(tmpPath, this.repliesPath)
  }

  private filterByDays(posts: Post[], days: number): Post[] {
    const since = sinceDate(days)
    return posts.filter(p => p.posted_at >= since)
  }

  // ─── 수집 ───────────────────────────────────────────────────

  async collectPosts(): Promise<CollectResult> {
    if (!this.token) throw new Error('THREADS_ACCESS_TOKEN 또는 config.yaml에 토큰이 필요합니다.')

    const existing = this.readPosts()
    const byId = new Map(existing.map(p => [p.id, p]))

    const client = new ThreadsApiClient(this.token)
    const me = await client.getMe()

    let created = 0
    let updated = 0

    for await (const batch of client.paginatePosts(me.id)) {
      for (const raw of batch) {
        const post = normalizePost(raw)
        if (byId.has(post.id)) {
          byId.set(post.id, { ...byId.get(post.id)!, ...post })
          updated++
        } else {
          byId.set(post.id, post)
          created++
        }
      }
    }

    const sorted = [...byId.values()].sort((a, b) => b.posted_at.localeCompare(a.posted_at))
    this.writePosts(sorted)

    // 댓글 수집 (has_replies 또는 reply_count > 0인 원글 대상)
    const postsWithReplies = sorted.filter(p => !p.is_reply && (p.has_replies || p.reply_count > 0))
    const existingReplies = this.readReplies()
    const repliesByIdMap = new Map(existingReplies.map(r => [r.id, r]))
    let repliesCollected = 0
    let failedReplies = 0

    const BATCH_SIZE = 5
    for (let i = 0; i < postsWithReplies.length; i += BATCH_SIZE) {
      const batch = postsWithReplies.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async post => {
        try {
          const rawReplies = await client.getConversation(post.id)
          for (const raw of rawReplies) {
            const reply = normalizeReply(raw, post.id)
            if (!repliesByIdMap.has(reply.id)) repliesCollected++
            repliesByIdMap.set(reply.id, reply)
          }
        } catch {
          // 개별 포스트 댓글 수집 실패는 무시 (전체 중단 금지). 단 카운트는 보고.
          failedReplies++
        }
      }))
    }

    this.writeReplies([...repliesByIdMap.values()])
    return { created, updated, total: sorted.length, repliesCollected, failedReplies }
  }

  // ─── 조회 ───────────────────────────────────────────────────

  async getPosts(opts: { limit: number; days: number; type: string; orderBy: string }): Promise<Post[]> {
    let posts = this.filterByDays(this.readPosts(), opts.days)

    if (opts.type === 'post') posts = posts.filter(p => !p.is_reply)
    else if (opts.type === 'reply') posts = posts.filter(p => p.is_reply)

    type PostKey = keyof Pick<Post, 'like_count' | 'reply_count' | 'view_count' | 'posted_at'>
    const colMap: Record<string, PostKey> = {
      likes: 'like_count',
      replies: 'reply_count',
      views: 'view_count',
      recent: 'posted_at',
    }
    const col = colMap[opts.orderBy] ?? 'posted_at'
    posts.sort((a, b) => {
      const av = a[col] as number | string
      const bv = b[col] as number | string
      return bv > av ? 1 : bv < av ? -1 : 0
    })

    return posts.slice(0, opts.limit)
  }

  async getEngagementStats(days: number): Promise<EngagementStats> {
    const posts = this.filterByDays(this.readPosts(), days).filter(p => !p.is_reply)
    const total = posts.length
    const totalLikes = posts.reduce((s, p) => s + p.like_count, 0)
    const totalReplies = posts.reduce((s, p) => s + p.reply_count, 0)
    const totalViews = posts.reduce((s, p) => s + p.view_count, 0)
    return {
      total,
      totalLikes,
      totalReplies,
      totalViews,
      avgLikes: total ? totalLikes / total : 0,
      avgReplies: total ? totalReplies / total : 0,
      avgViews: total ? totalViews / total : 0,
    }
  }

  async getTopContent(opts: { metric: string; limit: number; days: number }): Promise<Post[]> {
    const posts = this.filterByDays(this.readPosts(), opts.days).filter(p => !p.is_reply)
    const colMap: Record<string, keyof Post> = {
      likes: 'like_count',
      replies: 'reply_count',
      views: 'view_count',
    }
    const col = colMap[opts.metric] ?? 'like_count'
    return posts
      .sort((a, b) => (b[col] as number) - (a[col] as number))
      .slice(0, opts.limit)
  }

  async getTopicFrequency(opts: { days: number; top: number }): Promise<KeywordFreq[]> {
    const texts = this.filterByDays(this.readPosts(), opts.days)
      .filter(p => !p.is_reply)
      .map(p => p.text)
    return calcKeywordFrequency(texts, STOPWORDS, opts.top)
  }

  async getTrendingNow(top: number): Promise<TrendingResult> {
    const all = this.readPosts().filter(p => !p.is_reply)
    const since14 = sinceDate(14)
    const since7 = sinceDate(7)
    const recent = all.filter(p => p.posted_at >= since14)
    const thisWeek = recent.filter(p => p.posted_at >= since7).map(p => p.text)
    const lastWeek = recent.filter(p => p.posted_at < since7).map(p => p.text)
    return calcTrending(thisWeek, lastWeek, STOPWORDS, top)
  }

  async getMyReplies(days: number): Promise<ReplyActivity> {
    const replies = this.filterByDays(this.readPosts(), days).filter(p => p.is_reply)
    const byDay: Record<string, number> = {}
    for (const r of replies) {
      const day = r.posted_at.slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + 1
    }
    const since7 = sinceDate(7)
    const since14 = sinceDate(14)
    const recent7 = replies.filter(r => r.posted_at >= since7).length
    const prev7 = replies.filter(r => r.posted_at < since7 && r.posted_at >= since14).length
    const deep = replies.filter(r => r.text.length > 20)
    const shallow = replies.filter(r => r.text.length <= 20)
    return {
      total: replies.length,
      deep: deep.length,
      shallow: shallow.length,
      recent7,
      prev7,
      byDay,
      samples: replies.slice(0, 5).map(r => ({
        text: r.text,
        type: r.text.length > 20 ? 'deep' : 'shallow',
      })),
    }
  }

  async getUserSummary(): Promise<UserSummary> {
    const posts = this.readPosts()
    let lastCollectedAt: string | undefined
    try {
      const stat = fs.statSync(this.postsPath)
      lastCollectedAt = stat.mtime.toISOString()
    } catch { /* no file yet */ }

    const drafts = fs.existsSync(this.draftsDir)
      ? fs.readdirSync(this.draftsDir).filter(f => f.endsWith('.md'))
      : []

    return {
      totalPosts: posts.filter(p => !p.is_reply).length,
      totalReplies: posts.filter(p => p.is_reply).length,
      totalDrafts: drafts.length,
      lastCollectedAt,
    }
  }

  // ─── Brand ──────────────────────────────────────────────────

  async getBrandDna(): Promise<BrandDna> {
    return this.brand
  }

  async updateBrandDna(patch: Partial<BrandDna>): Promise<void> {
    this.brand = { ...this.brand, ...patch }
    // Read current config — throw if unreadable (don't risk losing access_token)
    let current: RawConfig = {}
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8')
      current = (yaml.load(raw) as RawConfig) ?? {}
    } catch (err) {
      throw new Error(`config.yaml 읽기 실패 — brand 업데이트를 취소합니다: ${(err as Error).message}`)
    }
    current.brand = this.brand
    const tmpPath = `${this.configPath}.tmp`
    fs.writeFileSync(tmpPath, yaml.dump(current), 'utf-8')
    fs.renameSync(tmpPath, this.configPath)
  }

  // ─── 초안 ───────────────────────────────────────────────────

  async saveDraft(input: { title: string; content: string; id?: string }): Promise<Draft> {
    const rawId = input.id ?? `draft_${Date.now()}`
    // 안전한 문자만 허용 (경로 탈출 방지)
    const id = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 100)
    const saved_at = new Date().toISOString()
    const draft: Draft = { id, title: input.title, content: input.content, saved_at }
    const filePath = path.resolve(this.draftsDir, `${id}.md`)
    if (!filePath.startsWith(path.resolve(this.draftsDir))) {
      throw new Error('유효하지 않은 초안 ID입니다.')
    }
    const frontmatter = yaml.dump({ title: input.title, id, saved_at })
    const body = `---\n${frontmatter}---\n\n${input.content}`
    fs.writeFileSync(filePath, body, 'utf-8')
    return draft
  }

  async listDrafts(limit: number): Promise<Draft[]> {
    if (!fs.existsSync(this.draftsDir)) return []
    const files = fs.readdirSync(this.draftsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const fp = path.join(this.draftsDir, f)
        return { fp, mtime: fs.statSync(fp).mtime.getTime() }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)
      .map(({ fp }) => fp)

    return files.map(fp => {
      const raw = fs.readFileSync(fp, 'utf-8')
      const match = raw.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)/)
      let id = path.basename(fp, '.md')
      let title = '(제목 없음)'
      let saved_at = ''
      if (match?.[1]) {
        const fm = yaml.load(match[1]) as Record<string, string>
        id = fm.id ?? id
        title = fm.title ?? title
        saved_at = fm.saved_at ?? saved_at
      }
      const content = match?.[2] ?? ''
      return { id, title, content, saved_at }
    })
  }

  // ─── 내보내기 + 컨텍스트 ────────────────────────────────────

  async exportToWiki(opts: { force: boolean }): Promise<{ created: number; updated: number; skipped: number }> {
    // is_reply 필터 금지: 자기답글(이어쓰기 체인)이 필요하므로 전체 전달.
    // 루트/체인/타인답글 구분은 exportPostsToWiki가 담당.
    const posts = this.readPosts()
    const replies = this.readReplies()
    return exportPostsToWiki(posts, replies, this.wikiDir, opts.force)
  }

  async getDraftContext(opts: { days: number; limit: number }): Promise<string> {
    const candidates = this.filterByDays(this.readPosts(), opts.days).filter(p => !p.is_reply)
    const scored = candidates
      .map(p => ({ ...p, _score: p.like_count + p.reply_count * 3 }))
      .sort((a, b) => b._score - a._score)
      .slice(0, opts.limit)

    const allTexts = scored.map(p => p.text)
    const patterns = extractPatterns(allTexts)

    const topics = this.brand.content_topics
    const style = this.brand.writing_style
    const pains = this.brand.target_pains

    const topPostsText = scored
      .map((p, i) => `--- ${i + 1}위 (좋아요 ${p.like_count} · 댓글 ${p.reply_count} · 점수 ${p._score}) [${p.posted_at.slice(0, 10)}] ---\n${p.text}`)
      .join('\n\n')

    // 학습된 피드백 주입 (apply_count 높은 상위 5개)
    const learnedLines = this._getTopFeedbackLines(5)

    return [
      '=== 글쓰기 컨텍스트 ===',
      '',
      '[프로필]',
      `비전: ${this.brand.vision ?? '미설정'}`,
      `전문성: ${topics?.authority?.join(', ') ?? '미설정'}`,
      `진정성: ${topics?.authenticity?.join(', ') ?? '미설정'}`,
      `성장: ${topics?.growth?.join(', ') ?? '미설정'}`,
      '',
      '[타겟의 고통]',
      pains?.length ? pains.map((p, i) => `${i + 1}. ${p}`).join('\n') : '미설정',
      '',
      '[글쓰기 금기]',
      style?.avoids?.join(', ') || '없음',
      '',
      ...(learnedLines.length ? [
        '[학습된 피드백 — 이전 초안 수정 이력]',
        '→ 아래 규칙을 반드시 반영하세요.',
        ...learnedLines,
        '',
      ] : []),
      '[성공 패턴]',
      patterns.length ? patterns.join(', ') : '데이터 부족 (3개 미만)',
      '',
      `[성공글 Top${scored.length} 풀텍스트]`,
      '→ 문체·구조를 그대로 추출해서 초안에 이식하세요.',
      '',
      topPostsText || '성공글 없음',
    ].join('\n')
  }

  // ─── 피드백 메모리 (write-manage-read 루프) ──────────────────

  private readFeedbacks(): Feedback[] {
    try { return JSON.parse(fs.readFileSync(this.feedbackPath, 'utf-8')) as Feedback[] }
    catch { return [] }
  }

  private writeFeedbacks(items: Feedback[]): void {
    fs.mkdirSync(path.dirname(this.feedbackPath), { recursive: true })
    fs.writeFileSync(this.feedbackPath, JSON.stringify(items, null, 2), 'utf-8')
  }

  private readRules(): FeedbackRule[] {
    try { return JSON.parse(fs.readFileSync(this.rulesPath, 'utf-8')) as FeedbackRule[] }
    catch { return [] }
  }

  private writeRules(rules: FeedbackRule[]): void {
    fs.mkdirSync(path.dirname(this.rulesPath), { recursive: true })
    fs.writeFileSync(this.rulesPath, JSON.stringify(rules, null, 2), 'utf-8')
  }

  // getDraftContext 내부 주입용 — 상위 N개 피드백/규칙 요약 라인
  private _getTopFeedbackLines(limit: number): string[] {
    const rules = this.readRules().filter(r => !r.promoted).sort((a, b) => b.apply_count - a.apply_count)
    const feedbacks = this.readFeedbacks().filter(f => !f.promoted).sort((a, b) => b.apply_count - a.apply_count)

    const lines: string[] = []
    for (const r of rules.slice(0, limit)) {
      lines.push(`- ${r.rule} (적용 ${r.apply_count}회)`)
    }
    // 규칙이 부족하면 원시 피드백으로 채움
    const remaining = limit - lines.length
    for (const f of feedbacks.slice(0, remaining)) {
      lines.push(`- ${f.correction} (적용 ${f.apply_count}회)`)
    }

    // apply_count 증가 (read = use)
    const usedFIds = new Set(feedbacks.slice(0, remaining).map(f => f.id))
    const usedRIds = new Set(rules.slice(0, limit).map(r => r.id))
    if (usedFIds.size > 0) {
      this.writeFeedbacks(this.readFeedbacks().map(f => usedFIds.has(f.id) ? { ...f, apply_count: f.apply_count + 1 } : f))
    }
    if (usedRIds.size > 0) {
      this.writeRules(this.readRules().map(r => usedRIds.has(r.id) ? { ...r, apply_count: r.apply_count + 1 } : r))
    }

    return lines
  }

  async saveFeedback(input: { signal: string; correction: string; context?: Feedback['context'] }): Promise<Feedback> {
    const feedbacks = this.readFeedbacks()
    const feedback: Feedback = {
      id: `fb_${Date.now()}`,
      signal: input.signal.slice(0, 300),
      correction: input.correction.slice(0, 300),
      context: input.context ?? {},
      created_at: new Date().toISOString(),
      apply_count: 0,
      promoted: false,
    }
    feedbacks.push(feedback)
    this.writeFeedbacks(feedbacks)

    // 같은 axis에 미승급 피드백이 5개 이상 쌓이면 distill 제안 트리거
    const axis = feedback.context.axis
    const pending = feedbacks.filter(f => !f.promoted && (axis ? f.context.axis === axis : true))
    if (pending.length >= 5) {
      // 규칙 자동 distill (호스트 LLM이 읽어서 처리할 수 있도록 메타데이터만)
      const existing = this.readRules()
      const alreadyDistilled = existing.some(r => r.source_ids.includes(feedback.id))
      if (!alreadyDistilled) {
        const rule: FeedbackRule = {
          id: `rule_${Date.now()}`,
          rule: `[자동 distill 필요] 피드백 ${pending.length}개 누적 — 아래 패턴 검토 후 규칙으로 정리하세요:\n` +
            pending.slice(-5).map(f => `  · ${f.correction}`).join('\n'),
          source_ids: pending.slice(-5).map(f => f.id),
          apply_count: 0,
          created_at: new Date().toISOString(),
          promoted: false,
        }
        existing.push(rule)
        this.writeRules(existing)
      }
    }

    return feedback
  }

  async getFeedbackRules(): Promise<{ feedbacks: Feedback[]; rules: FeedbackRule[] }> {
    return {
      feedbacks: this.readFeedbacks().filter(f => !f.promoted),
      rules: this.readRules().filter(r => !r.promoted),
    }
  }

  async promoteFeedback(ruleId: string): Promise<{ rule: FeedbackRule; brandDnaUpdated: boolean }> {
    const rules = this.readRules()
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) throw new Error(`규칙 ID "${ruleId}"를 찾을 수 없습니다.`)

    // brand_dna.writing_style.avoids에 추가
    const currentAvoids = this.brand.writing_style?.avoids ?? []
    const newRule = rule.rule.replace(/^\[자동 distill 필요\].*\n/, '').trim()
    if (!currentAvoids.includes(newRule)) {
      this.brand = {
        ...this.brand,
        writing_style: { ...(this.brand.writing_style ?? {}), avoids: [...currentAvoids, newRule] },
      }
      // config.yaml 저장
      let current: { threads?: { access_token?: string }; brand?: BrandDna } = {}
      try { current = (yaml.load(fs.readFileSync(this.configPath, 'utf-8')) as typeof current) ?? {} }
      catch (err) { throw new Error(`config.yaml 읽기 실패: ${(err as Error).message}`) }
      current.brand = this.brand
      const tmpPath = `${this.configPath}.tmp`
      fs.writeFileSync(tmpPath, yaml.dump(current), 'utf-8')
      fs.renameSync(tmpPath, this.configPath)
    }

    // 규칙 promoted 마킹
    this.writeRules(rules.map(r => r.id === ruleId ? { ...r, promoted: true } : r))

    return { rule, brandDnaUpdated: true }
  }

  // ─── 유료 전용 (PaidOnlyError) ──────────────────────────────

  async getRelationships(): Promise<never> { throw new PaidOnlyError() }
  async getConversionFunnel(): Promise<never> { throw new PaidOnlyError() }
  async getCoachInsights(): Promise<never> { throw new PaidOnlyError() }
  async getContentMix(): Promise<never> { throw new PaidOnlyError() }
  async getWritingRecommendation(): Promise<never> { throw new PaidOnlyError() }
  async getDailyContentPlan(): Promise<never> { throw new PaidOnlyError() }
}

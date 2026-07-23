export interface Post {
  id: string
  threads_post_id?: string
  text: string
  posted_at: string        // ISO 8601
  like_count: number
  reply_count: number
  repost_count: number
  view_count: number
  is_reply: boolean
  content_context?: string // 유료 전용 (LocalStore에서는 항상 undefined)
  replied_to_id?: string   // 부모 포스트 id (이어쓰기 체인 복원용)
  has_replies?: boolean
  permalink?: string       // Threads 원문 URL
}

export interface Reply {
  id: string
  root_post_id: string     // 어느 원글의 댓글인지
  replied_to_id?: string   // 부모 댓글 id (대댓글이면)
  username: string
  text: string
  timestamp: string
  has_replies: boolean
  permalink?: string
  hide_status?: string
}

export interface BrandDna {
  vision?: string
  content_topics?: {
    authenticity?: string[]
    authority?: string[]
    growth?: string[]
  }
  target_pains?: string[]
  writing_style?: {
    tone?: string[]
    avoids?: string[]
  }
  vision_1yr?: string
  vision_1yr_target?: string
  vision_3yr?: string
  vision_3yr_target?: string
}

export interface Draft {
  id: string
  title: string
  content: string
  saved_at: string
}

// Tier 1: 원시 피드백 (episodic log)
export interface Feedback {
  id: string
  signal: string       // "문장이 너무 끊어짐"
  correction: string   // "자연스럽게 이어지는 구어체"
  context: {
    format?: string    // "post" | "thread"
    axis?: string      // "authenticity" | "authority" | "growth"
    tags?: string[]
  }
  created_at: string
  apply_count: number  // 컨텍스트에 포함된 횟수
  promoted: boolean    // brand_dna로 승급됐는지
}

// Tier 2: distill된 규칙 (N개 피드백 → 1개 규칙)
export interface FeedbackRule {
  id: string
  rule: string         // "문장 연결체 선호. 한 줄 끊기 회피."
  source_ids: string[] // 이 규칙을 만든 피드백 ID들
  apply_count: number
  created_at: string
  promoted: boolean
}

export interface EngagementStats {
  total: number
  totalLikes: number
  totalReplies: number
  totalViews: number
  avgLikes: number
  avgReplies: number
  avgViews: number
}

export interface KeywordFreq {
  word: string
  count: number
}

export interface TrendingResult {
  topGains: Array<{ word: string; thisCount: number; lastCount: number; gain: number }>
  highViewKeywords: string[]
  thisWeekTotal: number
  lastWeekTotal: number
}

export interface ReplyActivity {
  total: number
  deep: number    // 21자 이상
  shallow: number // 20자 이하
  recent7: number
  prev7: number
  byDay: Record<string, number>
  samples: Array<{ text: string; type: 'deep' | 'shallow' }>
}

export interface UserSummary {
  username?: string
  totalPosts: number
  totalReplies: number
  totalDrafts: number
  lastCollectedAt?: string
}

export interface CollectResult {
  created: number
  updated: number
  total: number
  repliesCollected: number
  failedReplies: number
}

export class PaidOnlyError extends Error {
  constructor() {
    super('유료 전용 기능입니다. threddi.com에서 사용 가능합니다.')
    this.name = 'PaidOnlyError'
  }
}

export interface ThreadsStore {
  // 데이터 조회
  getPosts(opts: { limit: number; days: number; type: string; orderBy: string }): Promise<Post[]>
  getEngagementStats(days: number): Promise<EngagementStats>
  getTopContent(opts: { metric: string; limit: number; days: number }): Promise<Post[]>
  getTopicFrequency(opts: { days: number; top: number }): Promise<KeywordFreq[]>
  getTrendingNow(top: number): Promise<TrendingResult>
  getMyReplies(days: number): Promise<ReplyActivity>
  getUserSummary(): Promise<UserSummary>

  // Brand + 초안
  getBrandDna(): Promise<BrandDna>
  updateBrandDna(patch: Partial<BrandDna>): Promise<void>
  saveDraft(input: { title: string; content: string; id?: string }): Promise<Draft>
  listDrafts(limit: number): Promise<Draft[]>

  // 수집 + 내보내기
  collectPosts(): Promise<CollectResult>
  exportToWiki(opts: { force: boolean }): Promise<{ created: number; updated: number; skipped: number }>
  getDraftContext(opts: { days: number; limit: number }): Promise<string>

  // 피드백 메모리 (write-manage-read 루프)
  saveFeedback(input: { signal: string; correction: string; context?: Feedback['context'] }): Promise<Feedback>
  getFeedbackRules(): Promise<{ feedbacks: Feedback[]; rules: FeedbackRule[] }>
  promoteFeedback(ruleId: string): Promise<{ rule: FeedbackRule; brandDnaUpdated: boolean }>
}

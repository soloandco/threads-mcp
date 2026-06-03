// threads-mcp/src/tools.ts
import type { ThreadsStore, PaidOnlyError, BrandDna } from './stores/store'

export const TOOL_LIST = [
  {
    name: 'collect_posts',
    description: 'Threads API에서 내 포스트를 수집해서 로컬에 저장. 최초 실행 또는 업데이트 시 사용.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_posts',
    description: 'Threads 포스팅 목록 조회. 최근 게시물, 좋아요/댓글 수, 날짜 필터 지원.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '조회할 수 (기본 20, 최대 100)', default: 20 },
        days: { type: 'number', description: '최근 N일 (기본 30)', default: 30 },
        type: { type: 'string', enum: ['post', 'reply', 'all'], default: 'post' },
        order_by: { type: 'string', enum: ['recent', 'likes', 'replies', 'views'], default: 'recent' },
      },
    },
  },
  {
    name: 'get_engagement_stats',
    description: '기간별 좋아요·댓글·조회수 합계 및 평균 통계.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', default: 30 } },
    },
  },
  {
    name: 'get_top_content',
    description: '성과 상위 포스팅 조회.',
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['likes', 'replies', 'views'], default: 'likes' },
        limit: { type: 'number', default: 10 },
        days: { type: 'number', default: 90 },
      },
    },
  },
  {
    name: 'get_topic_frequency',
    description: '최근 N일 포스팅에서 자주 등장한 주제 키워드 빈도 분석.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', default: 30 },
        top: { type: 'number', default: 15 },
      },
    },
  },
  {
    name: 'get_trending_now',
    description: '이번 주 vs 지난 주 키워드 증가율 분석.',
    inputSchema: {
      type: 'object',
      properties: { top: { type: 'number', default: 10 } },
    },
  },
  {
    name: 'get_my_replies',
    description: '내가 단 댓글 활동 분석 (공감형/내용형 분류).',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', default: 30 } },
    },
  },
  {
    name: 'get_user_summary',
    description: '로컬 포스트 수·초안 수·마지막 수집 시각 요약.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_brand_dna',
    description: '브랜드 DNA 조회 (config.yaml의 brand 섹션).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'update_brand_dna',
    description: '브랜드 DNA 업데이트 (config.yaml 영구 저장).',
    inputSchema: {
      type: 'object',
      properties: {
        vision: { type: 'string' },
        target_pains: { type: 'array', items: { type: 'string' } },
        vision_1yr: { type: 'string' },
        vision_3yr: { type: 'string' },
      },
    },
  },
  {
    name: 'save_draft',
    description: '글 초안을 로컬 파일로 저장.',
    inputSchema: {
      type: 'object',
      required: ['title', 'content'],
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        id: { type: 'string', description: '기존 초안 ID (없으면 신규)' },
      },
    },
  },
  {
    name: 'list_drafts',
    description: '저장된 초안 목록.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } },
    },
  },
  {
    name: 'get_draft_context',
    description: '포스팅 초안 작성용 컨텍스트. 성공글 풀텍스트 + 패턴 + 브랜드 정보.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', default: 90 },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'export_to_wiki',
    description: '포스트를 Obsidian wiki 폴더(wiki/posts/)로 내보내기. 이어쓰기 체인·댓글 트리 포함.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: '기존 파일 덮어쓰기 여부 (기본 false)', default: false },
      },
    },
  },
]

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] }
}

function paidOnly() {
  return text('유료 전용 기능입니다. threddi.com에서 사용 가능합니다.')
}

function safeInt(val: unknown, def: number, min: number, max: number): number {
  const n = Number(val ?? def)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function safeEnum<T extends string>(val: unknown, allowed: T[], def: T): T {
  return allowed.includes(val as T) ? (val as T) : def
}

export async function dispatch(
  store: ThreadsStore,
  name: string,
  rawArgs: unknown
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const a = (rawArgs ?? {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'collect_posts': {
        const result = await store.collectPosts()
        const failNote = result.failedReplies > 0 ? ` / 댓글수집실패: ${result.failedReplies}개 포스트` : ''
        return text(`수집 완료\n신규: ${result.created}개 / 갱신: ${result.updated}개 / 전체: ${result.total}개 / 댓글: ${result.repliesCollected}개${failNote}`)
      }
      case 'get_posts': {
        const posts = await store.getPosts({
          limit: safeInt(a.limit, 20, 1, 100),
          days: safeInt(a.days, 30, 1, 365),
          type: safeEnum(a.type, ['post', 'reply', 'all'] as const, 'post'),
          orderBy: safeEnum(a.order_by, ['recent', 'likes', 'replies', 'views'] as const, 'recent'),
        })
        const body = posts.map(p =>
          `[${p.posted_at.slice(0, 10)}] 좋아요:${p.like_count} 댓글:${p.reply_count} 조회:${p.view_count}\n${p.text}`
        ).join('\n\n---\n\n')
        return text(`총 ${posts.length}개 포스팅:\n\n${body || '없음'}`)
      }
      case 'get_engagement_stats': {
        const s = await store.getEngagementStats(safeInt(a.days, 30, 1, 365))
        return text([
          `최근 ${a.days ?? 30}일 통계 (포스팅 ${s.total}개)`,
          `좋아요: 총 ${s.totalLikes}개 / 평균 ${s.avgLikes.toFixed(1)}개`,
          `댓글: 총 ${s.totalReplies}개 / 평균 ${s.avgReplies.toFixed(1)}개`,
          `조회수: 총 ${s.totalViews}개 / 평균 ${s.avgViews.toFixed(0)}개`,
        ].join('\n'))
      }
      case 'get_top_content': {
        const posts = await store.getTopContent({
          metric: safeEnum(a.metric, ['likes', 'replies', 'views'] as const, 'likes'),
          limit: safeInt(a.limit, 10, 1, 50),
          days: safeInt(a.days, 90, 1, 365),
        })
        const body = posts.map((p, i) => {
          const metric = String(a.metric ?? 'likes')
          const val = metric === 'replies' ? p.reply_count : metric === 'views' ? p.view_count : p.like_count
          return `${i + 1}위 (${metric}:${val}) [${p.posted_at.slice(0, 10)}]\n${p.text.slice(0, 200)}`
        }).join('\n\n---\n\n')
        return text(`상위 ${posts.length}개:\n\n${body || '없음'}`)
      }
      case 'get_topic_frequency': {
        const freqs = await store.getTopicFrequency({
          days: safeInt(a.days, 30, 1, 365),
          top: safeInt(a.top, 15, 1, 50),
        })
        const lines = freqs.map((f, i) => `${i + 1}. ${f.word}: ${f.count}회`)
        return text(['=== 주제 키워드 빈도 ===', '', ...lines].join('\n'))
      }
      case 'get_trending_now': {
        const r = await store.getTrendingNow(safeInt(a.top, 10, 1, 30))
        const gains = r.topGains.map((g, i) =>
          `${i + 1}. "${g.word}" — 이번주 ${g.thisCount}회 (지난주 ${g.lastCount}회) +${g.gain}`
        )
        return text([
          '=== 이번 주 급상승 키워드 ===',
          `이번주 ${r.thisWeekTotal}개 / 지난주 ${r.lastWeekTotal}개 포스팅`,
          '',
          ...gains.length ? gains : ['데이터 부족 (2주 데이터 필요)'],
        ].join('\n'))
      }
      case 'get_my_replies': {
        const r = await store.getMyReplies(safeInt(a.days, 30, 1, 90))
        const trend = r.recent7 > r.prev7 ? `▲ ${r.prev7}→${r.recent7}` : r.recent7 < r.prev7 ? `▼ ${r.prev7}→${r.recent7}` : `— ${r.recent7}`
        const daily = Object.entries(r.byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)
          .map(([d, n]) => `  ${d}: ${n}개`)
        return text([
          `=== 내 댓글 활동 (최근 ${a.days ?? 30}일) ===`,
          `총 ${r.total}개 | 최근7일 추세: ${trend}`,
          `내용형: ${r.deep}개 / 공감형: ${r.shallow}개`,
          '',
          '[일별 현황]',
          ...daily,
        ].join('\n'))
      }
      case 'get_user_summary': {
        const s = await store.getUserSummary()
        return text([
          `포스팅: ${s.totalPosts}개`,
          `댓글: ${s.totalReplies}개`,
          `초안: ${s.totalDrafts}개`,
          `마지막 수집: ${s.lastCollectedAt?.slice(0, 16) ?? '없음'}`,
        ].join('\n'))
      }
      case 'get_brand_dna': {
        const dna = await store.getBrandDna()
        const topics = dna.content_topics
        return text([
          '[브랜드 DNA]',
          `비전: ${dna.vision ?? '미설정'}`,
          `전문성: ${topics?.authority?.join(', ') ?? '미설정'}`,
          `진정성: ${topics?.authenticity?.join(', ') ?? '미설정'}`,
          `성장: ${topics?.growth?.join(', ') ?? '미설정'}`,
          `타겟 고통: ${dna.target_pains?.join(' / ') ?? '미설정'}`,
          `금기: ${dna.writing_style?.avoids?.join(', ') ?? '미설정'}`,
          `1년 목표: ${dna.vision_1yr ?? '미설정'}`,
          `3년 목표: ${dna.vision_3yr ?? '미설정'}`,
        ].join('\n'))
      }
      case 'update_brand_dna': {
        await store.updateBrandDna(a as Partial<BrandDna>)
        return text('브랜드 DNA 업데이트 완료')
      }
      case 'save_draft': {
        const draft = await store.saveDraft({
          title: String(a.title ?? '').slice(0, 200),
          content: String(a.content ?? '').slice(0, 100_000),
          id: a.id ? String(a.id).slice(0, 100) : undefined,
        })
        return text(`초안 저장 완료\nID: ${draft.id}\n제목: ${draft.title}`)
      }
      case 'list_drafts': {
        const drafts = await store.listDrafts(safeInt(a.limit, 10, 1, 50))
        if (!drafts.length) return text('저장된 초안 없음')
        const lines = drafts.map((d, i) =>
          `${i + 1}. [${d.saved_at.slice(0, 16)}] ${d.title}\n   ID: ${d.id}\n   ${d.content.slice(0, 50).replace(/\n/g, ' ')}...`
        )
        return text(`저장된 초안 ${drafts.length}개:\n\n${lines.join('\n\n')}`)
      }
      case 'get_draft_context': {
        const ctx = await store.getDraftContext({
          days: safeInt(a.days, 90, 1, 365),
          limit: safeInt(a.limit, 20, 1, 50),
        })
        return text(ctx)
      }
      case 'export_to_wiki': {
        const result = await store.exportToWiki({ force: Boolean(a.force ?? false) })
        return text(`wiki 내보내기 완료\n신규: ${result.created}개 / 갱신: ${result.updated}개 / 건너뜀: ${result.skipped}개`)
      }
      default:
        return text(`알 수 없는 도구: ${name}`)
    }
  } catch (err) {
    if ((err as Error).name === 'PaidOnlyError') return paidOnly()
    const msg = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `오류: ${msg}` }] }
  }
}

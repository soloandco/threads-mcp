import type { Post, Reply } from '../stores/store'

// Threads API가 반환하는 원시 형식
export interface ThreadsApiPost {
  id: string
  text?: string
  timestamp: string
  like_count?: number
  replies_count?: number
  repost_count?: number
  views?: number
  is_reply?: boolean
  replied_to?: { id: string }
  has_replies?: boolean
}

export interface ThreadsApiReply {
  id: string
  text?: string
  timestamp: string
  username?: string
  permalink?: string
  replied_to?: { id: string }
  root_post?: { id: string }
  has_replies?: boolean
  is_reply?: boolean
  hide_status?: string
}

export function normalizePost(raw: ThreadsApiPost): Post {
  return {
    id: raw.id,
    threads_post_id: raw.id,
    text: raw.text ?? '',
    posted_at: raw.timestamp,
    like_count: raw.like_count ?? 0,
    reply_count: raw.replies_count ?? 0,
    repost_count: raw.repost_count ?? 0,
    view_count: raw.views ?? 0,
    is_reply: raw.is_reply ?? false,
    replied_to_id: raw.replied_to?.id,
    has_replies: raw.has_replies ?? false,
  }
}

export function normalizeReply(raw: ThreadsApiReply, fallbackRootId: string): Reply {
  return {
    id: raw.id,
    root_post_id: raw.root_post?.id ?? fallbackRootId,
    replied_to_id: raw.replied_to?.id,
    username: raw.username ?? '',
    text: raw.text ?? '',
    timestamp: raw.timestamp,
    has_replies: raw.has_replies ?? false,
    permalink: raw.permalink,
    hide_status: raw.hide_status,
  }
}

export class ThreadsApiClient {
  private readonly baseUrl = 'https://graph.threads.net/v1.0'

  constructor(private readonly accessToken: string) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      redirect: 'error',
    })
    if (!res.ok) {
      throw new Error(`Threads API error: ${res.status}`)
    }
    return res.json() as Promise<T>
  }

  async getMe(): Promise<{ id: string; username: string }> {
    return this.get('/me', { fields: 'id,username' })
  }

  async *paginatePosts(userId: string): AsyncGenerator<ThreadsApiPost[]> {
    const FIELDS = 'id,text,timestamp,like_count,replies_count,repost_count,views,is_reply,replied_to,has_replies'
    let cursor: string | undefined

    do {
      const params: Record<string, string> = { fields: FIELDS }
      if (cursor) params.after = cursor

      const result = await this.get<{
        data: ThreadsApiPost[]
        paging?: { cursors?: { after?: string }; next?: string }
      }>(`/${userId}/threads`, params)

      yield result.data
      cursor = result.paging?.next ? result.paging.cursors?.after : undefined
    } while (cursor)
  }

  async getConversation(mediaId: string): Promise<ThreadsApiReply[]> {
    const FIELDS = 'id,text,timestamp,username,permalink,replied_to,root_post,has_replies,is_reply,hide_status'
    const all: ThreadsApiReply[] = []
    let cursor: string | undefined

    do {
      const params: Record<string, string> = { fields: FIELDS }
      if (cursor) params.after = cursor

      const result = await this.get<{
        data: ThreadsApiReply[]
        paging?: { cursors?: { after?: string }; next?: string }
      }>(`/${mediaId}/conversation`, params)

      all.push(...result.data)
      cursor = result.paging?.next ? result.paging.cursors?.after : undefined
    } while (cursor)

    return all
  }
}

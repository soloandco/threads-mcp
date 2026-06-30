#!/usr/bin/env node
// threads-mcp/src/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { LocalStore } from './stores/local-store'
import type { ThreadsStore } from './stores/store'
import { TOOL_LIST, dispatch } from './tools'

// 실행 디렉터리의 .env.local 이 있으면 로드 (없으면 무시 — env / config.yaml 로 동작)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const configPath = process.env.THREADS_CONFIG
  ?? path.resolve(process.cwd(), 'threads/config.yaml')
const tokenOverride = process.env.THREADS_ACCESS_TOKEN

let store: ThreadsStore
try {
  store = new LocalStore(configPath, tokenOverride)
} catch (err) {
  console.error(`LocalStore 초기화 실패: ${err instanceof Error ? err.message : err}`)
  console.error(`config 위치: ${configPath}`)
  console.error('THREADS_ACCESS_TOKEN env 또는 config.yaml의 threads.access_token을 설정하세요.')
  process.exit(1)
}

const server = new Server(
  { name: 'threads-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_LIST }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  return dispatch(store, req.params.name, req.params.arguments)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('threads-mcp 서버 시작됨 (LocalStore 모드)')
}

main()

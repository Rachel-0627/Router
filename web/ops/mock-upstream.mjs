/**
 * 假上游 —— 冒充 new-api,专门用来验证我们的代理层。
 * 因为真上游还没有 key,但代理逻辑(鉴权/余额/限流/流式/计费)必须先验证。
 *
 * 跑法: node ops/mock-upstream.mjs [port]
 */
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3099)

const SSE_EVENTS = [
  ['message_start', { type: 'message_start', message: { model: 'claude-sonnet-5', usage: { input_tokens: 1000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 200, output_tokens: 1 } } }],
  ['content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } }],
  ['content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } }],
  ['message_delta', { type: 'message_delta', usage: { output_tokens: 350 } }],
  ['message_stop', { type: 'message_stop' }],
]

createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'mock: missing service key' }))
  }
  let parsed = {}
  try { parsed = JSON.parse(body) } catch {}

  // 上游故障演练:body 里带 _mock_fail 就返回 502。
  // 不用 model 名做开关 —— 网关现在会先校验模型合法性,假模型根本走不到这里。
  if (parsed._mock_fail || String(parsed.model ?? '').includes('__boom__')) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'mock upstream down' } }))
  }

  if (parsed.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    for (const [event, data] of SSE_EVENTS) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      await new Promise((r) => setTimeout(r, 20)) // 模拟真实的分片节奏
    }
    return res.end()
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    id: 'msg_mock', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
    content: [{ type: 'text', text: 'Hello world' }],
    usage: { input_tokens: 1000, output_tokens: 350, cache_read_input_tokens: 5000, cache_creation_input_tokens: 200 },
  }))
}).listen(port, () => console.log(`mock upstream on :${port}`))

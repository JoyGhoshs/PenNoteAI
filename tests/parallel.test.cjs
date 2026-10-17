const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const temp = mkdtempSync(path.join(tmpdir(), 'pennote-search-'));
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'search-harness.ts')], bundle: true,
  platform: 'node', format: 'cjs', outfile: path.join(temp, 'harness.cjs'),
  alias: { obsidian: path.join(__dirname, 'obsidian-stub.cjs') },
  external: ['playwright-core'],
});
const { PenNotePlugin, DEFAULT_SETTINGS, ParallelSearcher, DuckDuckGoSearcher,
  TavilySearcher, ToolRunner, AgentLoop } = require(path.join(temp, 'harness.cjs'));
after(() => rmSync(temp, { recursive: true, force: true }));
const originalRequest = https.request;
const result = { results: [
  { title: 'Obsidian plugins', url: 'https://docs.obsidian.md/Plugins', excerpts: ['Build a plugin.'] },
  { title: null, url: 'https://example.org/guide?a=1&b=2', excerpts: ['First', 'Second'] },
  { title: 'Unsafe', url: 'javascript:alert(1)', excerpts: ['Skip this URL'] },
] };

function mockServer(handler = () => ({})) {
  const calls = [];
  https.request = (url, options, callback) => {
    const req = new EventEmitter();
    let destroyed = false;
    const abort = () => req.destroy(new Error('aborted'));
    options.signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => options.signal.removeEventListener('abort', abort);
    req.destroy = (error) => {
      if (!destroyed) { destroyed = true; cleanup(); queueMicrotask(() => req.emit('error', error)); }
    };
    req.end = (body) => {
      const message = JSON.parse(body);
      calls.push({ url, options, message, req });
      queueMicrotask(() => {
        if (options.signal.aborted) { abort(); return; }
        const override = handler(message, calls) || {};
        if (override.hang) return;
        if (override.error) { req.destroy(override.error); return; }
        const response = new EventEmitter();
        response.statusCode = override.status ?? (message.id ? 200 : 202);
        response.headers = { 'content-type': override.sse ? 'text/event-stream' : 'application/json',
          ...(message.method === 'initialize' ? { 'mcp-session-id': override.sessionId ?? 'transport-session' } : {}) };
        callback(response);
        let data;
        switch (message.method) {
          case 'initialize': data = { protocolVersion: '2025-03-26' }; break;
          case 'tools/list': data = { tools: [{ name: 'web_search' }] }; break;
          case 'tools/call': data = { structuredContent: result }; break;
        }
        const envelope = { jsonrpc: '2.0', id: message.id, result: override.result ?? data,
          ...(override.rpcError ? { error: { message: 'RPC failed' } } : {}) };
        const text = override.raw ?? JSON.stringify(envelope);
        response.emit('data', Buffer.from(override.sse ? `event: message\r\ndata: ${text}\r\n\r\n` : text));
        response.emit('end');
        cleanup();
      });
    };
    return req;
  };
  return { calls, restore: () => { https.request = originalRequest; } };
}
function plugin(saved = {}) {
  const p = new PenNotePlugin();
  p.loadData = async () => saved;
  return p;
}

test('fresh and saved settings use the real plugin resolver without eager requests', async () => {
  const server = mockServer();
  try {
    for (const [saved, Type] of [ [{}, DuckDuckGoSearcher],
      [{ searchProvider: 'tavily', tavilyApiKey: 'saved-key' }, TavilySearcher],
      [{ searchProvider: 'parallel', tavilyApiKey: 'saved-key' }, ParallelSearcher] ]) {
      const p = plugin(saved); await p.loadSettings();
      assert.ok(p.createSearcher() instanceof Type);
      assert.equal(p.settings.searchProvider, saved.searchProvider ?? 'duckduckgo');
      assert.equal(p.settings.tavilyApiKey, saved.tavilyApiKey ?? '');
    }
    assert.equal(DEFAULT_SETTINGS.searchProvider, 'duckduckgo');
    assert.equal(server.calls.length, 0);
  } finally { server.restore(); }
});

test('scripted AgentLoop consumes results from the plugin resolver and search_web dispatcher', async () => {
  const server = mockServer();
  try {
    const p = plugin({ searchProvider: 'parallel' }); await p.loadSettings();
    const runner = new ToolRunner({}, p.createSearcher(), {}, 5);
    let turns = 0;
    const llm = { chatWithTools: async (history) => {
      turns++;
      if (turns === 1) return { choices: [{ finish_reason: 'tool_calls', message: {
        content: null, tool_calls: [{ id: 'search-1', type: 'function', function: {
          name: 'search_web', arguments: JSON.stringify({ query: 'Obsidian plugin documentation', num_results: 1 }),
        } }],
      } }] };
      const tool = history.find((message) => message.role === 'tool');
      assert.match(tool.content, /\[Obsidian plugins\]\(https:\/\/docs.obsidian.md\/Plugins\)/);
      assert.match(tool.content, /Build a plugin/);
      assert.equal(tool.tool_call_id, 'search-1');
      assert.doesNotMatch(tool.content, /example.org/);
      return { choices: [{ finish_reason: 'stop', message: { content: 'Found plugin documentation.' } }] };
    } };
    const run = await new AgentLoop(llm, runner, 3).run('Find plugin docs', '', 'Guide.md');
    assert.equal(run.finalContent, 'Found plugin documentation.');
    assert.deepEqual(server.calls.map((c) => c.message.method),
      ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    for (const call of server.calls) {
      assert.equal(call.url, 'https://search.parallel.ai/mcp');
      assert.equal(call.options.headers['User-Agent'], 'PenNoteAI/0.1.0');
      assert.equal(call.options.headers.Authorization, undefined);
      assert.equal(call.options.headers['MCP-Protocol-Version'], '2025-03-26');
      if (call.message.method !== 'initialize') assert.equal(call.options.headers['Mcp-Session-Id'], 'transport-session');
    }
    const search = server.calls.at(-1).message.params;
    assert.equal(search.name, 'web_search');
    assert.deepEqual(search.arguments.search_queries, ['Obsidian plugin documentation']);
    assert.equal(search.arguments.objective, 'Obsidian plugin documentation');
    assert.match(search.arguments.session_id, /^[0-9a-f-]{36}$/);
    const second = await p.createSearcher().search('other query', 2);
    assert.equal(second[1].url, 'https://example.org/guide?a=1&b=2');
    assert.equal(second[1].snippet, 'First\nSecond');
    const denied = await runner.execute('create_note', { path: 'blocked' });
    assert.equal(denied.success, false);
  } finally { server.restore(); }
});

test('SSE and text-content responses preserve URLs, limits and stable search session', async () => {
  const server = mockServer((message) => message.method === 'tools/call'
    ? { sse: true, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } } : {});
  try {
    const searcher = new ParallelSearcher();
    assert.equal((await searcher.search('one', 10)).length, 2);
    assert.equal((await searcher.search('two', 1)).length, 1);
    const calls = server.calls.filter((call) => call.message.method === 'tools/call');
    assert.equal(calls[0].message.params.arguments.session_id, calls[1].message.params.arguments.session_id);
    assert.equal(server.calls.filter((call) => call.message.method === 'initialize').length, 1);
  } finally { server.restore(); }
});

test('HTTP, RPC, tool, malformed-result and network failures surface without provider fallback', async () => {
  for (const override of [ { status: 429 }, { rpcError: true },
    { result: { isError: true, content: [{ type: 'text', text: 'Quota exceeded' }] } },
    { raw: 'not JSON' }, { result: { structuredContent: { unexpected: [] } } },
    { error: new Error('Network unavailable') } ]) {
    const server = mockServer((message) => message.method === 'tools/call' ? override : {});
    try {
      const runner = new ToolRunner({}, new ParallelSearcher(), {}, 5);
      const output = await runner.execute('search_web', { query: 'docs' });
      assert.equal(output.success, false);
      assert.match(output.data, /Search error/);
      assert.equal(server.calls.filter((call) => call.message.method === 'tools/call').length, 1);
    } finally { server.restore(); }
  }
});

test('an expired MCP session reconnects on the next search without retrying or changing quota identity', async () => {
  let sessions = 0;
  let searches = 0;
  const server = mockServer((message) => {
    if (message.method === 'initialize') return { sessionId: `transport-${++sessions}` };
    if (message.method === 'tools/call' && ++searches === 1) return { status: 404 };
  });
  try {
    const searcher = new ParallelSearcher();
    const runner = new ToolRunner({}, searcher, {}, 5);
    const failed = await runner.execute('search_web', { query: 'first search' });
    assert.equal(failed.success, false);
    assert.match(failed.data, /HTTP 404/);
    assert.equal(searches, 1);
    const recovered = await runner.execute('search_web', { query: 'next search' });
    assert.equal(recovered.success, true);
    assert.match(recovered.data, /docs.obsidian.md/);
    assert.equal(sessions, 2);
    const calls = server.calls.filter((call) => call.message.method === 'tools/call');
    assert.equal(calls[0].options.headers['Mcp-Session-Id'], 'transport-1');
    assert.equal(calls[1].options.headers['Mcp-Session-Id'], 'transport-2');
    assert.equal(calls[0].message.params.arguments.session_id, calls[1].message.params.arguments.session_id);
  } finally { server.restore(); }
});

test('search deadline and cancellation abort the actual request; invalid inputs do no I/O', async () => {
  const server = mockServer((message) => message.method === 'tools/call' ? { hang: true } : {});
  try {
    await assert.rejects(new ParallelSearcher(20).search('docs'), /timed out/);
    assert.ok(server.calls.at(-1).options.signal.aborted);
    const controller = new AbortController();
    const pending = new ParallelSearcher().search('cancel this', 5, controller.signal);
    setImmediate(() => controller.abort());
    await assert.rejects(pending, /cancelled/);
    assert.ok(server.calls.at(-1).options.signal.aborted);
    const count = server.calls.length;
    const before = new AbortController(); before.abort();
    await assert.rejects(new ParallelSearcher().search('docs', 5, before.signal), /cancelled/);
    await assert.rejects(new ParallelSearcher().search(' '), /No query/);
    await assert.rejects(new ParallelSearcher().search('docs', NaN), /Invalid search/);
    assert.equal(server.calls.length, count);
  } finally { server.restore(); }
});

import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpClient, type Transport } from '@/api/http'
import { createApi } from '@/api'

const session = { mode: 'live' as const, token: 'test-only-token' }

describe('API boundary', () => {
  it('authenticates requests and serializes query filters without leaking the token into the URL', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(Response.json([]))
    await createApi(createHttpClient(session, vi.fn(), transport)).events.list({
      project: 'my project',
      service: 'worker',
      limit: 20,
    })
    const [path, options] = transport.mock.calls[0]
    expect(path).toBe('/events?limit=20&project=my+project&service=worker')
    expect(options.headers).toMatchObject({ 'X-USM-Token': session.token, 'X-USM-Client': 'ui' })
    expect(path).not.toContain(session.token)
  })

  it('uses project and service identity together and escapes both path segments', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(Response.json({}))
    await createApi(createHttpClient(session, vi.fn(), transport)).runtime.detail(
      'project/a',
      'service b',
    )
    expect(transport.mock.calls[0][0]).toBe('/projects/project%2Fa/services/service%20b')
  })

  it('sends YAML as a raw body and parses text exports as text', async () => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValueOnce(Response.json({ created: true }))
      .mockResolvedValueOnce(new Response('id: demo\nservices: []'))
    const api = createApi(createHttpClient(session, vi.fn(), transport))
    await api.projects.importYaml('id: demo\nservices: []', true)
    expect(transport.mock.calls[0][0]).toBe('/projects/import?restart_changed=true')
    expect(transport.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: 'id: demo\nservices: []',
      headers: { 'Content-Type': 'application/yaml' },
    })
    expect(await api.projects.exportYaml('demo')).toBe('id: demo\nservices: []')
  })

  it('turns FastAPI validation errors into useful field messages', async () => {
    const transport: Transport = async () =>
      Response.json(
        { detail: [{ loc: ['body', 'services', 0, 'command'], msg: 'Field required' }] },
        { status: 422 },
      )
    await expect(
      createHttpClient(session, vi.fn(), transport).request('/projects'),
    ).rejects.toThrow('services.0.command: Field required')
  })

  it('clears authentication when the daemon rejects a token', async () => {
    const rejected = vi.fn()
    const transport: Transport = async () =>
      Response.json({ detail: 'missing or invalid token' }, { status: 401 })
    await expect(
      createHttpClient(session, rejected, transport).request('/status'),
    ).rejects.toMatchObject({ status: 401 })
    expect(rejected).toHaveBeenCalledOnce()
  })

  it('handles a successful empty DELETE response', async () => {
    const transport: Transport = async () => new Response(null, { status: 204 })
    await expect(
      createApi(createHttpClient(session, vi.fn(), transport)).projects.remove('demo'),
    ).resolves.toBeUndefined()
  })

  it('reports connection failure without exposing raw transport details', async () => {
    const transport: Transport = async () => {
      throw new TypeError('sensitive transport details')
    }
    await expect(createHttpClient(session, vi.fn(), transport).request('/status')).rejects.toEqual(
      new ApiError(0, 'Cannot reach the manager. Check the connection and try again.'),
    )
  })

  it('preserves caller cancellation instead of reporting a disconnected manager', async () => {
    const abort = new AbortController()
    abort.abort()
    const cancelled = new DOMException('Aborted', 'AbortError')
    const transport: Transport = async () => {
      throw cancelled
    }
    await expect(
      createHttpClient(session, vi.fn(), transport).request('/status', { signal: abort.signal }),
    ).rejects.toBe(cancelled)
  })
})

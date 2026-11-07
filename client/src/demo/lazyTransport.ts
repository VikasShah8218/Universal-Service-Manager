import type { Transport } from '@/api/http'

export function createLazyDemoTransport(): Transport {
  // Load fixtures/YAML only when demo mode actually makes a request.
  let transport: Promise<Transport> | undefined
  return async (path, init) => {
    transport ??= import('./transport').then((module) => module.createDemoTransport())
    return (await transport)(path, init)
  }
}

// Placeholder for Task 2a.3: mock-api-client port.
// The full stateful mock store lives in src/lib/api/mock-api-client.ts and will
// be ported here in Task 2a.3. This stub satisfies the import boundary so
// api-client.ts compiles and tests pass with mockApi disabled.

export type MockResponse = {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}

export function handleMockRequest(_method: string, _path: string, _body?: unknown): MockResponse {
  return { status: 200, data: {} }
}

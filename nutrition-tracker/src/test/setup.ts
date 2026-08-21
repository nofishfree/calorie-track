import 'fake-indexeddb/auto'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.useRealTimers()
})

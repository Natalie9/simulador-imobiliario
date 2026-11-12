import { monteCarlo } from './engine.ts'
import type { Scenario } from './model.ts'
self.onmessage = (event: MessageEvent<Scenario>) => {
  self.postMessage(monteCarlo(event.data))
}


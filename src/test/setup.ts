import '@testing-library/jest-dom/vitest'
import { configureThrottle } from '@/ai/throttle'

/**
 * The request pacer (§7.1) exists to stay inside OpenRouter's free-tier limits.
 * Tests talk to mock models, so pacing them would only add sleep: the gap goes
 * to zero here, and `throttle.test.ts` asserts the real behaviour directly.
 */
configureThrottle({ minStartGapMs: 0 })

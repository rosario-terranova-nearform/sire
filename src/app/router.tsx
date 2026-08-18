import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout'
import { ThroneRoom } from './routes/ThroneRoom'
import { AudienceNew } from './routes/AudienceNew'
import { Chamber } from './routes/Chamber'
import { Chronicle } from './routes/Chronicle'
import { Court } from './routes/Court'
import { DesignSystem } from './routes/DesignSystem'
import { CounselorCardSpecimen } from './routes/CounselorCardSpecimen'
import { EngineScratch } from './routes/EngineScratch'
import { AiScratch } from './routes/AiScratch'

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      { index: true, Component: ThroneRoom },
      { path: 'audience/new', Component: AudienceNew },
      { path: 'audience/:id', Component: Chamber },
      { path: 'chronicle', Component: Chronicle },
      { path: 'court', Component: Court },
      // Scratch/specimen page for T-02 (Pixelact UI) and T-03 (pixel token
      // system) — not part of the app's own navigation.
      { path: 'design-system', Component: DesignSystem },
      // Specimen for T-14 — the <CounselorCard> in all three variants.
      { path: 'counselor-card', Component: CounselorCardSpecimen },
      // Scratch harness for T-07 — drive the stage engine by hand.
      { path: 'engine-scratch', Component: EngineScratch },
      // Scratch harness for Phase 2 (T-08 … T-13) — the AI layer, live or on tape.
      { path: 'ai-scratch', Component: AiScratch },
    ],
  },
])

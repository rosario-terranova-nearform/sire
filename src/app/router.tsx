import { createBrowserRouter } from 'react-router'
import { ThroneRoom } from './routes/ThroneRoom'
import { AudienceNew } from './routes/AudienceNew'
import { Chamber } from './routes/Chamber'
import { Chronicle } from './routes/Chronicle'
import { Court } from './routes/Court'
import { DesignSystem } from './routes/DesignSystem'

export const router = createBrowserRouter([
  { path: '/', Component: ThroneRoom },
  { path: '/audience/new', Component: AudienceNew },
  { path: '/audience/:id', Component: Chamber },
  { path: '/chronicle', Component: Chronicle },
  { path: '/court', Component: Court },
  // Scratch/specimen page for T-02 (Pixelact UI) and T-03 (pixel token
  // system) — not part of the app's own navigation.
  { path: '/design-system', Component: DesignSystem },
])

import { createBrowserRouter } from 'react-router'
import { ThroneRoom } from './routes/ThroneRoom'
import { AudienceNew } from './routes/AudienceNew'
import { Chamber } from './routes/Chamber'
import { Chronicle } from './routes/Chronicle'
import { Court } from './routes/Court'

export const router = createBrowserRouter([
  { path: '/', Component: ThroneRoom },
  { path: '/audience/new', Component: AudienceNew },
  { path: '/audience/:id', Component: Chamber },
  { path: '/chronicle', Component: Chronicle },
  { path: '/court', Component: Court },
])

import { useState } from 'react'
import { Button } from '@/components/ui/pixelact-ui/button'
import {
  exportScenePng,
  sceneFileName,
  type SceneSnapshot,
} from '@/lib/share-scene'

/**
 * §8.1 (7) / T-20 — render the finished scene to a PNG and hand it to the
 * monarch as a download. Purely local: the canvas is drawn and encoded in the
 * browser, and the file is saved with a temporary object URL. Nothing leaves
 * the machine.
 */
export interface ShareSceneProps {
  snapshot: SceneSnapshot
}

type Status = 'idle' | 'working' | 'error'

export function ShareScene({ snapshot }: ShareSceneProps) {
  const [status, setStatus] = useState<Status>('idle')

  async function save() {
    setStatus('working')
    try {
      const blob = await exportScenePng(snapshot)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = sceneFileName(snapshot)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="default" onClick={() => void save()} disabled={status === 'working'}>
        {status === 'working' ? 'Pressing the seal…' : '🖼 Save the scene'}
      </Button>
      {status === 'error' && (
        <p className="text-sm text-wax" role="alert">
          The scene could not be drawn to an image, sire.
        </p>
      )}
    </div>
  )
}

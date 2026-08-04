import { useParams } from 'react-router'

export function Chamber() {
  const { id } = useParams()
  return (
    <main className="flex min-h-svh items-center justify-center">
      <h1 className="text-2xl font-semibold">The Chamber — {id}</h1>
    </main>
  )
}

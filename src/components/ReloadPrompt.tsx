import { useRegisterSW } from 'virtual:pwa-register/react'

// Zeigt einen dezenten Hinweis wenn ein Update bereitsteht bzw. die
// App offline-bereit ist. Rein lokal, kein Netzwerkeffekt.
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-20">
      <div className="card flex w-full max-w-md items-center gap-3 shadow-lg">
        <p className="flex-1 text-sm text-neutral-200">
          {needRefresh
            ? 'Neue Version verfügbar.'
            : 'App ist offline einsatzbereit.'}
        </p>
        {needRefresh ? (
          <button
            className="btn-primary btn-sm"
            onClick={() => updateServiceWorker(true)}
          >
            Aktualisieren
          </button>
        ) : null}
        <button className="btn-ghost btn-sm" onClick={close}>
          OK
        </button>
      </div>
    </div>
  )
}

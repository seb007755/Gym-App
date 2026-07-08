import { useEffect, type ReactNode } from 'react'
import { ArrowLeft } from './icons'
import { useNavigate } from 'react-router-dom'

export function TopBar({
  title,
  back,
  right,
}: {
  title: string
  back?: boolean | (() => void)
  right?: ReactNode
}) {
  const navigate = useNavigate()
  const onBack = typeof back === 'function' ? back : () => navigate(-1)
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3">
        {back ? (
          <button
            onClick={onBack}
            className="btn-ghost -ml-1 h-10 w-10 rounded-full p-0"
            aria-label="Zurueck"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
        {right}
      </div>
    </header>
  )
}

// Bottom-Sheet-Modal, mobil-first.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="pb-safe relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-4 sm:max-w-md sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title ? <h2 className="mb-3 text-lg font-bold">{title}</h2> : null}
        {children}
      </div>
    </div>
  )
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Loeschen',
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {message ? <p className="mb-4 text-neutral-300">{message}</p> : null}
      <div className="flex gap-3">
        <button className="btn-ghost flex-1" onClick={onCancel}>
          Abbrechen
        </button>
        <button
          className={(danger ? 'btn-danger' : 'btn-primary') + ' flex-1'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon ? <div className="mb-3 text-neutral-600">{icon}</div> : null}
      <p className="text-lg font-semibold text-neutral-200">{title}</p>
      {hint ? <p className="mt-1 max-w-xs text-sm text-neutral-500">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

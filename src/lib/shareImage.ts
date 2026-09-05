import { toBlob } from 'html-to-image'

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed'

/**
 * Rendert einen DOM-Knoten als PNG und teilt ihn.
 *
 * Bewusst ueber die Web-Share-API statt `a.download`: In der installierten PWA
 * auf iOS/Android schlaegt der Download-Link still fehl (das Bild "blinkt kurz
 * auf"). Der Blob-Download bleibt nur der Desktop-Fallback.
 */
export async function shareNodeAsImage(
  node: HTMLElement,
  fileName: string,
  title: string,
): Promise<ShareResult> {
  try {
    const blob = await toBlob(node, {
      pixelRatio: 2,
      backgroundColor: '#0D1117',
      width: node.scrollWidth,
      height: node.scrollHeight,
    })
    if (!blob) throw new Error('render failed')
    const file = new File([blob], fileName, { type: 'image/png' })

    // Mobil: Teilen-Dialog (in Fotos speichern / an Trainer schicken).
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title })
        return 'shared'
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
        // sonst: unten Download-Fallback versuchen.
      }
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

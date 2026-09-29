// Dictado con la Web Speech API (Chrome, Edge, Safari). Donde no exista,
// el usuario puede usar el micrófono del teclado del móvil.

interface Handlers {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

const SR: any =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : undefined

export const voiceSupported = Boolean(SR)

const ERRORS: Record<string, string> = {
  'not-allowed': 'Permiso de micrófono denegado.',
  'service-not-allowed': 'El dictado no está permitido en este navegador.',
  'no-speech': 'No he oído nada.',
  'audio-capture': 'No se encuentra el micrófono.',
  network: 'El dictado necesita conexión.',
}

export function listen(h: Handlers): () => void {
  const rec = new SR()
  rec.lang = 'es-ES'
  rec.interimResults = true
  rec.maxAlternatives = 1
  let final = ''

  rec.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    h.onInterim((final + interim).trim())
  }
  rec.onerror = (e: any) => {
    if (e.error !== 'aborted') h.onError(ERRORS[e.error] ?? `Error de dictado: ${e.error}`)
  }
  rec.onend = () => {
    if (final.trim()) h.onFinal(final.trim())
    h.onEnd()
  }
  rec.start()
  return () => rec.stop()
}

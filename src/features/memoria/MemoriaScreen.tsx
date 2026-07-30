// Stub de esta pantalla, sólo para que el tab bar del shell (Fase 7) tenga
// dónde navegar. La lista editable real (tarjetas por hecho + botón de
// olvidar contra memoria_hechos) es su propio paso, todavía sin validar en
// vivo — no tocar esto como si ya fuera la versión final.

export function MemoriaScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-display text-base font-semibold text-ink">Memoria</p>
      <p className="max-w-56 text-xs text-ink-muted">Esta vista todavía no está construida.</p>
    </div>
  )
}

import { supabase } from './supabase'

// Diagnóstico de confusión de fechas/horas (2026-08-05), Paso 1 del arreglo.
//
// `fechaActual()` calculaba "hoy" en UTC fijo — acá se captura la zona real
// del usuario (IANA, vía Intl del navegador, sin pedirle nada) y se guarda en
// `ajustes_ia.zona_horaria`. El Paso 2 conecta esa columna con `fechaActual()`
// del lado del servidor; hasta entonces esta captura no cambia el
// comportamiento del asistente, sólo deja el dato listo.
//
// Best-effort, igual que el resto de memoria: nunca tira. Si falla, la
// columna se queda con el default `America/Mexico_City` de la migración —
// peor que nada, no rompe nada.

/**
 * Si la zona horaria detectada del navegador difiere de la guardada, la
 * actualiza. Se llama una vez por sesión de usuario (no en cada refresh de
 * token) desde `AuthContext`.
 */
export async function capturarZonaHorariaSiHaceFalta(userId: string): Promise<void> {
  let detectada: string
  try {
    detectada = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch (err) {
    console.error('[zonaHoraria] Intl no pudo resolver la zona del navegador:', err instanceof Error ? err.message : err)
    return
  }
  if (!detectada) return

  const { data, error: errLectura } = await supabase
    .from('ajustes_ia')
    .select('zona_horaria')
    .eq('user_id', userId)
    .maybeSingle()

  if (errLectura) {
    console.error('[zonaHoraria] no se pudo leer la zona guardada:', errLectura.message)
    return
  }

  // Ya coincide (o ya se guardó en un login anterior): nada que escribir.
  if (data?.zona_horaria === detectada) return

  // Sólo estas dos columnas van en el upsert a propósito: mismo criterio que
  // `manage-ai-key` con cada provider (Fase 3) — Postgres deja las demás
  // columnas de la fila intactas en el ON CONFLICT DO UPDATE parcial.
  const { error: errEscritura } = await supabase
    .from('ajustes_ia')
    .upsert({ user_id: userId, zona_horaria: detectada }, { onConflict: 'user_id' })

  if (errEscritura) {
    console.error('[zonaHoraria] no se pudo guardar la zona detectada:', errEscritura.message)
  }
}

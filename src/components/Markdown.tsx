// Renderiza el subconjunto de markdown que parsea `lib/markdown.ts`.
//
// Sólo elementos React: nada de `dangerouslySetInnerHTML`. Este texto lo genera
// un modelo, así que la superficie de inyección tiene que ser cero por
// construcción y no por sanitización (ver la cabecera del parser).
//
// NO FIJA COLOR NI TAMAÑO DE TEXTO a propósito: hereda del contenedor. Hoy lo
// usan las burbujas de Ámbar en ChatScreen (`text-sm leading-relaxed`) y en
// HistorialScreen (`text-sm`), que ya traen su color; si el componente
// impusiera el suyo, cada lugar nuevo tendría que pelearlo.

import { Fragment } from 'react'
import { parsearMarkdown, partirNegritas } from '../lib/markdown'

function Inline({ texto }: { texto: string }) {
  return (
    <>
      {partirNegritas(texto).map((f, i) =>
        f.negrita ? (
          <strong key={i} className="font-semibold">
            {f.texto}
          </strong>
        ) : (
          <Fragment key={i}>{f.texto}</Fragment>
        ),
      )}
    </>
  )
}

export function Markdown({ texto }: { texto: string }) {
  const bloques = parsearMarkdown(texto)
  if (bloques.length === 0) return null

  return (
    <div className="space-y-2">
      {bloques.map((b, i) => {
        switch (b.tipo) {
          case 'titulo':
            // `<p>` y no `<h3>`: adentro de una burbuja de chat una jerarquía
            // de headings es ruido para un lector de pantalla, no ayuda.
            return (
              <p key={i} className="font-display font-semibold">
                <Inline texto={b.texto} />
              </p>
            )

          case 'separador':
            return <hr key={i} className="border-border-soft" />

          case 'lista': {
            const clases = `space-y-1 pl-5 ${b.ordenada ? 'list-decimal' : 'list-disc'}`
            const items = b.items.map((item, j) => (
              <li key={j}>
                <Inline texto={item} />
              </li>
            ))
            return b.ordenada ? (
              <ol key={i} start={b.desde} className={clases}>
                {items}
              </ol>
            ) : (
              <ul key={i} className={clases}>
                {items}
              </ul>
            )
          }

          default:
            // `whitespace-pre-line` conserva los saltos de línea de adentro de
            // un párrafo. Hasta ahora se perdían: `{m.text}` pelado en un div
            // los colapsaba a un espacio.
            return (
              <p key={i} className="whitespace-pre-line">
                <Inline texto={b.texto} />
              </p>
            )
        }
      })}
    </div>
  )
}

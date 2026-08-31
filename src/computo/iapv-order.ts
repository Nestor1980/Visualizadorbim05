/**
 * Parseo y orden natural de la numeración de Item/SubItem del Presupuesto
 * Oficial de IAPV (ej. "4.1 De ladrillos huecos de 0,20m de espesor" → [4, 1])
 * — para que el Cómputo agrupe y ordene igual que el Pliego en vez de caer en
 * orden de inserción o alfabético, donde "10" ordenaría antes que "2".
 */
export function parseItemNumber(designacion: string): number[] {
  const match = designacion.trim().match(/^(\d+(?:\.\d+)*)/);
  if (!match) return [];
  return match[1].split(".").map((n) => parseInt(n, 10));
}

/** Compara dos designaciones de Item/SubItem por su numeración; si alguna no
 *  trae número al inicio (o ambas no traen), cae a orden alfabético para que
 *  el resultado siga siendo determinístico. */
export function compareItemDesignacion(a: string, b: string): number {
  const na = parseItemNumber(a);
  const nb = parseItemNumber(b);
  if (na.length === 0 || nb.length === 0) return a.localeCompare(b);
  const len = Math.max(na.length, nb.length);
  for (let i = 0; i < len; i++) {
    const diff = (na[i] ?? 0) - (nb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

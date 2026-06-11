/**
 * Inferência de range "X ao Y" do tipo a partir do selo/título da prancha.
 *
 * Exemplos suportados:
 *   "TIPO (6° AO 19° PAV)"        → { inicio: 6, fim: 19 } → 14 repetições
 *   "Tipo (3º ao 13º)"            → { inicio: 3, fim: 13 } → 11
 *   "PAV. TIPO. 3PAV AO 13PAV."   → { inicio: 3, fim: 13 } → 11
 *   "PAVIMENTO TIPO"              → null (sem range explícito)
 */

export type RangeTipo = { inicio: number; fim: number };

const RANGE_REGEX_LIST: RegExp[] = [
  /TIPO[^\d]{0,40}?(\d+)\s*[º°˚]?\s*(?:PAV\.?)?\s*(?:AO|À|A|—|-|–|ATÉ)\s*(\d+)\s*[º°˚]?\s*(?:PAV\.?)?/i,
  /DO\s*(\d+)\s*[º°˚]?\s*(?:PAV\.?)?\s*(?:AO|À|—|-)\s*(\d+)\s*[º°˚]?\s*(?:PAV\.?)?/i,
];

export function inferirRangeDoTexto(
  texto: string | null | undefined,
): RangeTipo | null {
  if (!texto) return null;
  for (const re of RANGE_REGEX_LIST) {
    const m = texto.match(re);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
        return { inicio: a, fim: b };
      }
    }
  }
  return null;
}

export function inferirRangeDeMuitos(
  textos: Array<string | null | undefined>,
): RangeTipo | null {
  for (const t of textos) {
    const r = inferirRangeDoTexto(t);
    if (r !== null) return r;
  }
  return null;
}

export function repeticoesDoRange(r: RangeTipo): number {
  return r.fim - r.inicio + 1;
}

// Compat com código antigo
export function inferirRepeticoesDoTexto(
  texto: string | null | undefined,
): number | null {
  const r = inferirRangeDoTexto(texto);
  return r ? repeticoesDoRange(r) : null;
}

export function inferirRepeticoesDeMuitas(
  textos: Array<string | null | undefined>,
): number | null {
  const r = inferirRangeDeMuitos(textos);
  return r ? repeticoesDoRange(r) : null;
}

export function formatarRangeTipo(r: RangeTipo): string {
  return `${r.inicio}º ao ${r.fim}º pav`;
}

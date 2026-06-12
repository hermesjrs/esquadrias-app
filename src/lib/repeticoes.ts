/**
 * Inferência das repetições do pavimento TIPO a partir do selo/título da prancha.
 *
 * Formatos suportados:
 *
 *   Range contínuo (separador por extenso — CONFIÁVEL):
 *     "TIPO (6° AO 19° PAV)"        → { inicio: 6, fim: 19 } → 14 repetições
 *     "Tipo (3º ao 13º)"            → { inicio: 3, fim: 13 } → 11
 *     "PAV. TIPO. 3PAV AO 13PAV."   → { inicio: 3, fim: 13 } → 11
 *
 *   Lista discreta de pavimentos (caso ZAYT — CONFIÁVEL com 2+ números):
 *     "TIPO 1 - 3 4 7 10 13 16 PAVTOS"       → [3,4,7,10,13,16] → 6
 *     "TIPO 1 | 3º 4º 7º 10º 13º 16º PAVTOS" → [3,4,7,10,13,16] → 6
 *     (o número logo após "TIPO" é o nº do tipo, não pavimento)
 *
 *   Range por HÍFEN (AMBÍGUO → `duvidoso`, gera aviso de revisão):
 *     "TIPO 1 - 3 PAVTOS" → pode ser range 1→3 OU "tipo 1 no 3º pav".
 *     Mantém a leitura de range (3 reps) mas marca pra revisão manual.
 *
 *   "PAVIMENTO TIPO" (sem range/lista) → null
 */

export type RangeTipo = { inicio: number; fim: number };

export type AnaliseRepeticoesTipo = {
  reps: number;
  /** Range contínuo "X ao Y" — null quando o formato é lista discreta. */
  range: RangeTipo | null;
  /** Pavimentos da lista discreta (ex: [3,4,7,10,13,16]) — null pra range. */
  pavimentosLista: number[] | null;
  /** Trecho do selo que casou — citado no aviso de revisão. */
  trecho: string;
  /** Formato ambíguo (range por hífen) — pedir confirmação manual do × N. */
  duvidoso: boolean;
};

/**
 * Lista discreta: exige TIPO + separador explícito (-, |, :) + 2 ou mais
 * números (ordinal opcional, vírgula/; e "E" tolerados) + terminação PAV*.
 * Sem o separador ou com 1 número só, não há como distinguir do range —
 * cai nos regexes de range abaixo.
 */
const LISTA_TIPO_REGEX =
  /TIPO\s*\d{0,2}\s*[-–—|:]\s*((?:\d{1,2}\s*[º°]?[\s,;]*(?:E\s+)?){2,})PAV(?:TOS?|IMENTOS?|S)?\b/i;

/**
 * Range "X ao Y". O separador (grupo 2) é classificado: por PALAVRA
 * (AO/À/A/ATÉ) é leitura confiável; por hífen é ambíguo → `duvidoso`.
 */
const RANGE_REGEX_LIST: RegExp[] = [
  /TIPO[^\d]{0,40}?(\d+)\s*[º°˚]?\s*(?:PAV\.?)?\s*(AO|À|A|—|-|–|ATÉ)\s*(\d+)\s*[º°˚]?\s*(?:PAV\.?)?/i,
  /DO\s*(\d+)\s*[º°˚]?\s*(?:PAV\.?)?\s*(AO|À|—|-)\s*(\d+)\s*[º°˚]?\s*(?:PAV\.?)?/i,
];

const SEPARADOR_CONFIAVEL = /^(AO|À|A|ATÉ)$/i;

function matchLista(
  texto: string,
): { pavimentos: number[]; trecho: string } | null {
  const m = texto.match(LISTA_TIPO_REGEX);
  if (!m) return null;
  const nums = (m[1].match(/\d{1,2}/g) ?? []).map((n) => parseInt(n, 10));
  if (nums.length < 2) return null;
  return { pavimentos: nums, trecho: m[0].trim() };
}

function matchRange(
  texto: string,
): { range: RangeTipo; separador: string; trecho: string } | null {
  for (const re of RANGE_REGEX_LIST) {
    const m = texto.match(re);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[3], 10);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
        return {
          range: { inicio: a, fim: b },
          separador: m[2],
          trecho: m[0].trim(),
        };
      }
    }
  }
  return null;
}

/**
 * Análise principal: primeiro procura LISTA DISCRETA em todos os textos
 * (prioridade — o range por hífen casaria errado o mesmo texto: "TIPO 1 -
 * 3 4 7..." viraria range 1→3), depois RANGE.
 */
export function analisarRepeticoesTipo(
  textos: Array<string | null | undefined>,
): AnaliseRepeticoesTipo | null {
  for (const t of textos) {
    if (!t) continue;
    const lista = matchLista(t);
    if (lista) {
      return {
        reps: lista.pavimentos.length,
        range: null,
        pavimentosLista: lista.pavimentos,
        trecho: lista.trecho,
        duvidoso: false,
      };
    }
  }
  for (const t of textos) {
    if (!t) continue;
    const r = matchRange(t);
    if (r) {
      return {
        reps: repeticoesDoRange(r.range),
        range: r.range,
        pavimentosLista: null,
        trecho: r.trecho,
        duvidoso: !SEPARADOR_CONFIAVEL.test(r.separador),
      };
    }
  }
  return null;
}

export function inferirRangeDoTexto(
  texto: string | null | undefined,
): RangeTipo | null {
  if (!texto) return null;
  return matchRange(texto)?.range ?? null;
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

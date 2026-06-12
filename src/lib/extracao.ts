"use client";

import {
  inferirPavimentoDoTexto,
  inferirTorreDoTexto,
} from "./inferencia";
import { carregarPdf } from "./pdf";
import { analisarRepeticoesTipo } from "./repeticoes";
import type { RangeTipo } from "./repeticoes";
import type { Dimensoes, Pavimento, TagExtraida, Torre } from "./types";

export type PaginaInfo = {
  pageIndex: number;
  width: number;
  height: number;
};

export type DuplicadaSuspeita = {
  code: string;
  /** Posições aproximadas das ocorrências duplicadas. */
  posicoes: Array<{ x: number; y: number }>;
};

export type ExtracaoResultado = {
  tags: TagExtraida[];
  paginas: PaginaInfo[];
  tituloPrancha: string | null;
  repeticoesDetectadas: number | null;
  rangeTipoDetectado: RangeTipo | null;
  /**
   * true quando as repetições foram lidas de um formato ambíguo do selo
   * (ex: range por hífen "TIPO 1 - 3 PAVTOS") — gera aviso de revisão.
   */
  repeticaoTipoDuvidosa: boolean;
  /** Trecho do selo de onde as repetições foram lidas (citado no aviso). */
  repeticoesTrecho: string | null;
  /** true se o PDF não tem camada de texto (provavelmente rasterizado). */
  semTextoExtraivel: boolean;
  /** Total de items de texto encontrados (pra heuristics). */
  totalTextItems: number;
  /** Tags do mesmo código encontradas muito próximas — provável erro/duplicação do desenhista. */
  duplicadasSuspeitas: DuplicadaSuspeita[];
  /**
   * Famílias não conhecidas detectadas via heurística (regex amplo + proximidade
   * a dimensão V.O./V.L./OSSO/LUZ). Ex: ["XY", "ZZ"]. Avisar usuário pra revisar.
   */
  familiasDesconhecidasDetectadas: string[];
  /**
   * Pavimento detectado no conteúdo do PDF (selo, título de prancha, etc).
   * Inclui código (chave estável) + label literal extraído do texto.
   * Código pode ser "DESCONHECIDO" se nada foi encontrado.
   */
  pavimentoInferidoDoTexto: Pavimento;
  pavimentoLabelInferidoDoTexto?: string;
  /**
   * Torre detectada no conteúdo do PDF ("TORRE A", "TORRE PLUS B", etc).
   * Usado como fallback quando o filename não casa.
   */
  torreInferidoDoTexto: Torre;
};

// CODIGO_REGEX (restrito): famílias conhecidas do escritório. Tag detectada
// com confiança alta — vira tag direto, sem heurística adicional.
//
// Aceita:
//   "PM03"
//   "PM03b" (sufixo de letra/letras)
//   "PCF05-AC" (sufixo com hífen — Cidade Baixa)
//   "PCF02.A", "PA01.B" (sufixo com PONTO — Nilo Square)
//   "PCF05b-AC" (combinação)
//   "PAI.04" (família PAI com ponto separando do número — Nilo)
//   "EE03", "EE14" (família EE — alçapões/chapéus aletados, Nilo)
//   "PF03 - PORTÃO METÁLICO BASC." (código + descrição separados por " - ")
//   "PM INT-08", "PM - INT06" (PM_INT com separadores)
//   "PM-01 E", "PM-03 D" (sentido de abertura Esquerda/Direita separado por
//   espaço — GO Moinhos. O E/D é DESCARTADO do código: PM-01 E e PM-01 D
//   contam juntos como PM01, diferente dos sufixos colados que são variantes)
//
// IMPORTANTE: a ordem das famílias na alternativa importa por causa de prefixos
// compartilhados. PM_INT antes de PM, PVF/PVE antes de PV, PAI antes de PA.
const CODIGO_REGEX =
  /^(PM[\s_-]*INT|PCF|PVF|PVE|PJA|JVP|GCPI|PISC|ERU|ZEN|PAI|PM|JA|JB|JF|PA|PB|PF|PV|GC|AT|EE)[\s_.\-]*(\d+)(\.[A-Za-z]+|-[A-Za-z]+(?:-[A-Za-z]+)*|[A-Za-z](?:[A-Za-z\-_]*[A-Za-z])?)?(?:\s+[EDed])?(?:\s+-\s+.+)?$/;

/**
 * CANDIDATO_REGEX (amplo): qualquer "letras + dígitos + opcional sufixo" sem
 * restrição de família. Casa "XY03", "ZZA12.B", "PCF02", etc.
 *
 * Usado pra detectar famílias NOVAS automaticamente em projetos futuros.
 * Como aceita qualquer prefixo de letras, é propenso a falsos positivos —
 * só promovemos a candidato a tag se tiver dimensão (V.O./V.L./OSSO/LUZ) num
 * raio próximo (ver validação em extrairTags).
 */
const CANDIDATO_REGEX =
  /^([A-Z]{1,5}(?:[._\s-]*INT)?)[\s_.\-]*(\d{1,4})(\.[A-Za-z]+|-[A-Za-z]+(?:-[A-Za-z]+)*|[A-Za-z](?:[A-Za-z\-_]*[A-Za-z])?)?(?:\s+[EDed])?(?:\s+-\s+.+)?$/;

/**
 * Strings que casam o CANDIDATO_REGEX mas claramente NÃO são códigos de esquadria.
 * Incluem: elevadores (TA1/TB1/TA2), eixos arquitetônicos (AC1, EX2), apartamentos
 * (AP1801, APTO02), churrasqueiras (CM, CMB73), pavimentos (1P, 4P quando no texto
 * livre da prancha, não no filename), e cotas (H27, B29).
 */
/**
 * Famílias banidas (testadas na forma normalizada — sem separadores).
 * APTO = apartamento, TA/TB = elevadores, AC/EX/EIXO = eixos, AP = apartamento curto,
 * CM/CMB = churrasqueiras, H/B/R = cotas de degraus, VO/VL = labels soltos,
 * VP = paginação/vista (não é esquadria — confirmado Nilo Square),
 * FINAL = numeração de detalhamento (GO Home Design),
 * BOX = caixa/box técnico, não esquadria (GO Cidade Baixa),
 * CL = não é esquadria (confirmado).
 */
const BLACKLIST_FAMILIA =
  /^(TA|TB|AC|EIXO|EX|AP|APT|APTO|CM|CMB|CL|H|B|R|VO|VL|VOL|VP|N|S|E|W|EXAUST|EXAUSTOR|FIG|TAB|TABELA|PRJ|REF|REV|DET|NIV|NIVEL|COTA|FINAL|BOX)$/i;

/**
 * Códigos banidos completos (forma normalizada). Pra padrões específicos que
 * passariam pela família mas claramente não são esquadria.
 */
const BLACKLIST_CODIGO_NORMALIZADO =
  /^(AP\d{3,}|APT[O0]?\d+|R[0-9]{2,}|N\d+|NIV\d+|PAV\d+)$/i;

/**
 * Famílias que NÃO levam dimensão (guarda-corpos, serralheria, venezianas):
 * VO/VL não fazem sentido pra elas no quantitativo, e a anotação de dimensão
 * mais próxima costuma pertencer a outra esquadria — associar só geraria dado
 * errado. A tag continua sendo detectada normalmente (inclusive a validação
 * de candidato por proximidade de dimensão); ela só não RECEBE osso/luz.
 *
 * Comparação por família exata: GCPI (guarda-corpo piscina) segue COM
 * dimensões — não confundir com o prefixo GC.
 */
const FAMILIAS_SEM_DIMENSAO = new Set([
  "GC",
  "SER",
  "VENT",
  "AT",
  "GCF",
  "GCA",
]);

/** Família "léxica" do código final: letras (e underscore) antes dos dígitos. */
function familiaDoCodigo(code: string): string {
  return code.match(/^[A-Z_]+/i)?.[0]?.toUpperCase() ?? "";
}

/**
 * Tenta normalizar uma string como candidato a código de família desconhecida.
 * Retorna `{ familia, code }` se passou no regex amplo + blacklist; null senão.
 * A validação por proximidade a dimensão é feita depois, em extrairTags.
 *
 * Importante: a blacklist roda sobre a forma NORMALIZADA (sem espaços, pontos,
 * hífens, underscores) — pra capturar variantes como "APTO 401", "APTO.401" etc.
 */
function detectarCandidato(
  s: string,
): { familia: string; code: string } | null {
  const m = s.match(CANDIDATO_REGEX);
  if (!m) return null;
  const familiaRaw = m[1].toUpperCase().replace(/[\s_.\-]/g, "");
  // Famílias de 1 letra são quase sempre lixo (eixos, cotas)
  if (familiaRaw.length < 2) return null;
  if (BLACKLIST_FAMILIA.test(familiaRaw)) return null;
  const numero = m[2];
  const sufixo = m[3] ?? "";
  const code = `${familiaRaw}${numero}${sufixo}`;
  if (BLACKLIST_CODIGO_NORMALIZADO.test(code)) return null;
  return { familia: familiaRaw, code };
}

// Aceita formatos:
//   OSSO: 60x210      (Cidade Baixa)
//   LUZ:60x210/108
//   V.O. 60x83/140    (Square Garden)
//   V.L. 42x62/150
//   LIVRE: 60x210
const DIM_TIPO_REGEX = /^(OSSO|LIVRE|LUZ|V\.?\s*O\.?|V\.?\s*L\.?)\b/i;
const DIM_COMPLETA_REGEX =
  /^(OSSO|LIVRE|LUZ|V\.?\s*O\.?|V\.?\s*L\.?)\s*:?\s*([\d.]+)\s*[xX×]\s*([\d.]+)(?:\s*\/\s*([\d.]+))?/i;

const DIM_LABEL_REGEX = /^(OSSO|LIVRE|LUZ|V\.?\s*O\.?|V\.?\s*L\.?)\s*:?\s*$/i;

function normalizarTipoDim(raw: string): "OSSO" | "LIVRE" | "LUZ" {
  const up = raw.toUpperCase().replace(/\s|\./g, "");
  if (up === "VO" || up === "OSSO") return "OSSO";
  if (up === "VL" || up === "LUZ") return "LUZ";
  return "LIVRE";
}

const DIM_VALOR_REGEX =
  /^([\d.]+)\s*[xX×]\s*([\d.]+)(?:\s*\/\s*([\d.]+))?\s*$/;

const TITULO_REGEX =
  /PLANTA\s+BAIXA[^,\n]*|PAV\.\s*TIPO|TÉRREO|COBERTURA|PAVIMENTO\s+TIPO|\d+º?\s*PAV(?:IMENTO)?/i;

// Palavras-chave de ambientes encontrados em plantas baixas
const AMBIENTE_REGEX =
  /\b(SU[IÍ]TE|DORM(?:IT[OÓ]RIO)?|BANHEIRO|BANHO|WC|COZINHA|COPA|ESTAR|JANTAR|SALA|LOFT|KIDS|COWORKING|SACADA|[AÁ]REA\s+SOCIAL|LAVABO|CIRC(?:ULA[CÇ][AÃ]O)?|PISCINA|GUARITA|LAJES?\s+T[EÉ]CNICAS?|FITNESS|GOURMET|FESTAS|CONV[IÍ]VIO|ESTACIONAMENTO|GARAGEM|SHAFT|LIXO|DEP[OÓ]SITO|BICICLET[AÁ]RIO|LAVANDERIA|HALL|FOYER|VESTI[AÁ]RIO|HIDR[OÔ]METRO|G[AÁ]S|CALDEIRA|ELEVADOR(?:ES)?|ANTEC[AÂ]MARA|SALA\s+SEG|ADM(?:INISTRA[CÇ][AÃ]O)?|[AÁ]REA\s+T[EÉ]CNICA|SUBESTA[CÇ][AÃ]O|BOMBAS|GERADOR|CORREIOS|EBCT|INSTALA[CÇ][OÕ]ES|ACESSO|DEP\.?\s*PISCINA|VAGA|TELEFONIA|MEDIDORES|QGBT|INFRA|CASA\s+DE\s+M[AÁ]QUINAS|TELHADO|NICHO|PULM[OÕ]ES?|PCD|BANHO\s+INFANTIL|REPÚBLICA|JOS[EÉ]\s+DO\s+PATROC[IÍ]NIO|APOLIN[AÁ]RIO|TORRE\s+[AB]|FUNCION[AÁ]RIOS|SANIT[AÁ]RIOS?|LAUNDRY|SAL[AÃ]O\s+DE\s+FESTAS?|3D|2D|1D|2D-DS|3D\s+SACADA|2D\s+SU[IÍ]TE)\b/i;

// Itens curtos que claramente parecem rótulos (ALL CAPS curtos)
function pareceLabelAmbiente(s: string): boolean {
  if (s.length > 40 || s.length < 2) return false;
  if (!AMBIENTE_REGEX.test(s)) return false;
  // Evita texts de instruções
  if (/[a-z]/.test(s) && !/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(s)) return false;
  return true;
}

// Texto que provavelmente contém info de repetições (range "X ao Y")
const RANGE_HINT_REGEX = /TIPO|PAV|PAVIMENTO|REPET/i;

const FAMILIA_NORMALIZADA: Record<string, string> = {
  PMINT: "PM_INT",
};

function normalizarCodigo(s: string): string | null {
  const m = s.match(CODIGO_REGEX);
  if (!m) return null;
  const familiaRaw = m[1].toUpperCase().replace(/[\s_-]/g, "");
  const familia = FAMILIA_NORMALIZADA[familiaRaw] ?? familiaRaw;
  const numero = m[2];
  const sufixo = m[3] ?? "";
  return `${familia}${numero}${sufixo}`;
}

export function ehCodigoDeEsquadria(texto: string): boolean {
  return normalizarCodigo(texto.trim()) !== null;
}

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type DimItem = {
  x: number;
  y: number;
  tipo: "OSSO" | "LIVRE" | "LUZ";
  dim: Dimensoes;
};

function parseDimComplete(texto: string): {
  tipo: "OSSO" | "LIVRE" | "LUZ";
  dim: Dimensoes;
} | null {
  const m = texto.match(DIM_COMPLETA_REGEX);
  if (!m) return null;
  const largura = parseFloat(m[2]);
  const altura = parseFloat(m[3]);
  if (!isFinite(largura) || !isFinite(altura) || largura <= 0 || altura <= 0) {
    return null;
  }
  return {
    tipo: normalizarTipoDim(m[1]),
    dim: {
      largura,
      altura,
      peitoril: m[4] ? parseFloat(m[4]) : undefined,
    },
  };
}

function parseDimValor(texto: string): Dimensoes | null {
  const m = texto.match(DIM_VALOR_REGEX);
  if (!m) return null;
  const largura = parseFloat(m[1]);
  const altura = parseFloat(m[2]);
  if (!isFinite(largura) || !isFinite(altura) || largura <= 0 || altura <= 0) {
    return null;
  }
  return {
    largura,
    altura,
    peitoril: m[3] ? parseFloat(m[3]) : undefined,
  };
}

function ambienteProximo(
  tag: TagExtraida,
  ambientes: Array<{ x: number; y: number; texto: string }>,
): string | undefined {
  let best: { texto: string; d: number } | null = null;
  for (const a of ambientes) {
    const dx = a.x - tag.x;
    const dy = a.y - tag.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 150 && (!best || d < best.d)) {
      best = { texto: a.texto, d };
    }
  }
  return best?.texto;
}

function associarDimensoes(
  tag: TagExtraida,
  dims: DimItem[],
): { osso?: Dimensoes; luz?: Dimensoes } {
  let osso: Dimensoes | undefined;
  let luz: Dimensoes | undefined;
  let bestOsso = Infinity;
  let bestLuz = Infinity;

  for (const d of dims) {
    const dx = Math.abs(d.x - tag.x);
    const dy = Math.abs(d.y - tag.y);
    // tag e dim devem estar na mesma coluna (x próximo) e numa faixa vertical
    if (dx > 60 || dy > 40) continue;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (d.tipo === "OSSO") {
      if (dist < bestOsso) {
        bestOsso = dist;
        osso = d.dim;
      }
    } else if (d.tipo === "LUZ" || d.tipo === "LIVRE") {
      // LUZ tem prioridade sobre LIVRE
      const peso = d.tipo === "LIVRE" ? dist + 5 : dist;
      if (peso < bestLuz) {
        bestLuz = peso;
        luz = d.dim;
      }
    }
  }

  return { osso, luz };
}

type ViewportLike = {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => [number, number];
};

function posicaoViewport(
  it: PdfTextItem,
  viewport: ViewportLike,
): { x: number; y: number; width: number; height: number } {
  // PDF coords -> viewport coords (top-left origin, rotation applied)
  const [vx, vy] = viewport.convertToViewportPoint(
    it.transform[4],
    it.transform[5],
  );
  // text width/height stay in PDF units (consistent with scale=1)
  return {
    x: vx,
    y: vy,
    width: it.width || 1,
    height: it.height || 1,
  };
}

// Palavras-chave que indicam que o texto pode conter info de pavimento/torre.
const INFERENCIA_HINT_REGEX =
  /(TORRE|PAV(?:IMENTO|TO)?|COBERT|T[ÉE]RREO|RESERVAT[OÓ]RIO|ROOFTOP|TIPO)/i;

export async function extrairTags(blob: Blob): Promise<ExtracaoResultado> {
  const doc = await carregarPdf(blob);
  const tags: TagExtraida[] = [];
  const paginas: PaginaInfo[] = [];
  const titulos: string[] = [];
  const rangeHints: string[] = [];
  // Textos contendo palavras-chave de pavimento/torre — usados como fallback
  // de inferência quando o filename não casa.
  const textosInferencia: string[] = [];
  const familiasDesconhecidasSet = new Set<string>();
  let totalTextItems = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 }) as unknown as ViewportLike;
    paginas.push({
      pageIndex: i,
      width: viewport.width,
      height: viewport.height,
    });

    const tc = await page.getTextContent();
    const items = tc.items as PdfTextItem[];
    totalTextItems += items.filter((it) => it.str?.trim().length > 0).length;

    const tagsDaPagina: TagExtraida[] = [];
    const dimsDaPagina: DimItem[] = [];
    const labels: Array<{
      x: number;
      y: number;
      tipo: "OSSO" | "LIVRE" | "LUZ";
    }> = [];
    const valores: Array<{ x: number; y: number; dim: Dimensoes }> = [];
    const ambientes: Array<{ x: number; y: number; texto: string }> = [];
    // Candidatos a tag de família desconhecida — validados depois por proximidade
    // a uma dimensão (V.O./V.L./OSSO/LUZ).
    const candidatos: Array<{
      code: string;
      familia: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    for (const it of items) {
      const s = it.str.trim();
      if (!s) continue;

      const codigoNorm = normalizarCodigo(s);
      if (codigoNorm) {
        const pos = posicaoViewport(it, viewport);
        tagsDaPagina.push({
          code: codigoNorm,
          pageIndex: i,
          ...pos,
        });
        continue;
      }

      const completa = parseDimComplete(s);
      if (completa) {
        const pos = posicaoViewport(it, viewport);
        dimsDaPagina.push({
          x: pos.x,
          y: pos.y,
          tipo: completa.tipo,
          dim: completa.dim,
        });
        continue;
      }

      if (DIM_LABEL_REGEX.test(s)) {
        const m = s.match(DIM_LABEL_REGEX)!;
        const pos = posicaoViewport(it, viewport);
        labels.push({
          x: pos.x,
          y: pos.y,
          tipo: normalizarTipoDim(m[1]),
        });
        continue;
      }

      const valor = parseDimValor(s);
      if (valor) {
        const pos = posicaoViewport(it, viewport);
        valores.push({ x: pos.x, y: pos.y, dim: valor });
        continue;
      }

      if (TITULO_REGEX.test(s) && s.length < 80) {
        titulos.push(s);
      }

      if (RANGE_HINT_REGEX.test(s) && /\d/.test(s) && s.length < 120) {
        rangeHints.push(s);
      }

      // Buffer adicional pra inferência de pavimento/torre — captura textos
      // tipo "TORRE PLUS A", "Planta Baixa 4pav" mesmo sem dígito (TORRE).
      if (INFERENCIA_HINT_REGEX.test(s) && s.length < 200) {
        textosInferencia.push(s);
      }

      if (pareceLabelAmbiente(s)) {
        const pos = posicaoViewport(it, viewport);
        ambientes.push({ x: pos.x, y: pos.y, texto: s });
        continue;
      }

      // Última tentativa: padrão amplo "letras+dígitos" pra família desconhecida.
      // Validado depois por proximidade a dimensão.
      const cand = detectarCandidato(s);
      if (cand) {
        const pos = posicaoViewport(it, viewport);
        candidatos.push({
          code: cand.code,
          familia: cand.familia,
          ...pos,
        });
      }
    }

    // Pareia labels com valores (em coords viewport).
    // O valor deve estar À DIREITA do label (lê-se "OSSO: 108x221" da
    // esquerda pra direita). Pequena tolerância (-5) pra labels e valores
    // que ficam quase sobrepostos. Sem isso, um valor numérico de OUTRA
    // esquadria à esquerda pode ser falsamente pareado se estiver mais
    // próximo em distância euclidiana.
    for (const label of labels) {
      let best: { v: (typeof valores)[number]; d: number } | null = null;
      for (const v of valores) {
        const dx = v.x - label.x;
        const dy = v.y - label.y;
        if (dx < -5) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 40 && (!best || d < best.d)) {
          best = { v, d };
        }
      }
      if (best) {
        dimsDaPagina.push({
          x: label.x,
          y: label.y,
          tipo: label.tipo,
          dim: best.v.dim,
        });
      }
    }

    // Valida candidatos: só promove a tag se tiver dimensão próxima
    // (V.O./V.L./OSSO/LUZ num raio < 80). Sem isso, candidato é descartado
    // como falso positivo (eixo arquitetônico, cota, número de apartamento...).
    for (const c of candidatos) {
      const temDimProx = dimsDaPagina.some((d) => {
        const dx = Math.abs(d.x - c.x);
        const dy = Math.abs(d.y - c.y);
        return dx < 80 && dy < 80;
      });
      if (!temDimProx) continue;
      familiasDesconhecidasSet.add(c.familia);
      tagsDaPagina.push({
        code: c.code,
        pageIndex: i,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        familiaDesconhecida: true,
      });
    }

    for (const tag of tagsDaPagina) {
      if (!FAMILIAS_SEM_DIMENSAO.has(familiaDoCodigo(tag.code))) {
        const dims = associarDimensoes(tag, dimsDaPagina);
        tag.osso = dims.osso;
        tag.luz = dims.luz;
      }
      tag.local = ambienteProximo(tag, ambientes);
      tags.push(tag);
    }
  }

  await doc.destroy();

  const analiseReps = analisarRepeticoesTipo([...titulos, ...rangeHints]);
  const rangeTipoDetectado = analiseReps?.range ?? null;
  const repeticoesDetectadas = analiseReps?.reps ?? null;

  const semTextoExtraivel = totalTextItems < 30;

  // Detecta tags duplicadas próximas (mesmo código com posições muito próximas)
  const duplicadasSuspeitas = detectarDuplicadasProximas(tags);

  // Inferência de pavimento/torre pelo texto extraído.
  const fontesInferencia = [...titulos, ...rangeHints, ...textosInferencia];
  const pavInferido = inferirPavimentoDoTexto(fontesInferencia);
  const torreInferidoDoTexto = inferirTorreDoTexto(fontesInferencia);

  return {
    tags,
    paginas,
    // Prefere o título oficial da prancha (contém "PLANTA BAIXA"); cai pro
    // primeiro título qualquer só se não houver um oficial.
    tituloPrancha:
      titulos.find((t) => /PLANTA\s+BAIXA/i.test(t)) ?? titulos[0] ?? null,
    repeticoesDetectadas,
    rangeTipoDetectado,
    repeticaoTipoDuvidosa: analiseReps?.duvidoso ?? false,
    repeticoesTrecho: analiseReps?.trecho ?? null,
    semTextoExtraivel,
    totalTextItems,
    duplicadasSuspeitas,
    familiasDesconhecidasDetectadas: Array.from(familiasDesconhecidasSet).sort(),
    pavimentoInferidoDoTexto: pavInferido.codigo,
    pavimentoLabelInferidoDoTexto: pavInferido.label,
    torreInferidoDoTexto,
  };
}

function detectarDuplicadasProximas(tags: TagExtraida[]): DuplicadaSuspeita[] {
  const porCodigo = new Map<string, TagExtraida[]>();
  for (const t of tags) {
    const arr = porCodigo.get(t.code) ?? [];
    arr.push(t);
    porCodigo.set(t.code, arr);
  }

  const out: DuplicadaSuspeita[] = [];
  // Pra cada código com 2+ tags, encontra clusters próximos
  for (const [code, lista] of porCodigo) {
    if (lista.length < 2) continue;
    const usados = new Set<number>();
    for (let i = 0; i < lista.length; i++) {
      if (usados.has(i)) continue;
      const cluster: Array<{ x: number; y: number }> = [];
      for (let j = i + 1; j < lista.length; j++) {
        if (usados.has(j)) continue;
        const dx = Math.abs(lista[i].x - lista[j].x);
        const dy = Math.abs(lista[i].y - lista[j].y);
        if (dx < 40 && dy < 40) {
          if (cluster.length === 0) {
            cluster.push({ x: lista[i].x, y: lista[i].y });
            usados.add(i);
          }
          cluster.push({ x: lista[j].x, y: lista[j].y });
          usados.add(j);
        }
      }
      if (cluster.length >= 2) {
        out.push({ code, posicoes: cluster });
      }
    }
  }
  return out;
}

export function contarPorCodigo(tags: TagExtraida[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of tags) {
    mapa.set(t.code, (mapa.get(t.code) ?? 0) + 1);
  }
  return mapa;
}

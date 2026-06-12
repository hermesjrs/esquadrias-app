import type { Pavimento, Torre } from "./types";

// Pavimentos com label especial (nome ≠ "NP"). Tentar esses primeiro porque
// o regex genérico de \d+P não casa com eles.
const PAVIMENTOS_ESPECIAIS: Array<[RegExp, Pavimento]> = [
  [/[-_]COB[-_.]/i, "COB"],
  [/[-_]RF[-_.]/i, "RF"],
  [/[-_]RES[-_.]/i, "RES"],
  [/[-_]SS[-_.]/i, "SS"],
  // TP1, TP2, TPN — testar ANTES de TP puro
  // (NOTE: capturado pelo regex de TIPO_NUMERADO abaixo, não aqui)
  [/[-_]TP[-_.]/i, "TP"],
  [/[-_]TE[-_.]/i, "TE"],
];

// Pavimento Tipo numerado: -TP1-, -TP2-, etc.
const PAVIMENTO_TIPO_NUMERADO_REGEX = /[-_]TP(\d+)[-_.]/i;
// Match genérico de pavimento numerado: -2P-, -4P-, -14P-, -18P-, ...
const PAVIMENTO_NUMERADO_REGEX = /[-_](\d+)P[-_.]/i;

export function inferirPavimentoDoFilename(filename: string): Pavimento {
  // TP\d+ tem que vir antes de PAVIMENTOS_ESPECIAIS pra não cair em TP puro
  const mTp = filename.match(PAVIMENTO_TIPO_NUMERADO_REGEX);
  if (mTp) return `TP${mTp[1]}`;
  for (const [regex, pav] of PAVIMENTOS_ESPECIAIS) {
    if (regex.test(filename)) return pav;
  }
  const m = filename.match(PAVIMENTO_NUMERADO_REGEX);
  if (m) return `${m[1]}P`;
  return "DESCONHECIDO";
}

/**
 * Verifica se o filename indica uma planta que normalmente não tem esquadrias
 * a contar (implantação, situação, etc.). Essas são arquivadas automaticamente
 * no upload.
 */
export function ehPlantaIgnoravel(filename: string): boolean {
  // IM = Implantação, SI = Situação (planta do terreno, não tem esquadrias)
  return /[-_](IM|SI|SIT)[-_.]/i.test(filename);
}

export function inferirTorreDoFilename(filename: string): Torre {
  // Torre explícita primeiro: -TA-/-TB- (Nilo) e -T1-/-T2- (Square Garden).
  // Precisa vir ANTES do padrão numérico: "7890-EX-ARQ-0106A-PBX-T1-..."
  // (SQG Family) tem "0106A" que casaria o padrão de bloco abaixo — a torre
  // verdadeira é a T1.
  const m2 = filename.match(/[-_]T([AB])[-_]/i);
  if (m2) return m2[1].toUpperCase() === "A" ? "A" : "B";
  const m3 = filename.match(/[-_]T(\d+)[-_]/i);
  if (m3) return m3[1];
  // Nº da prancha + bloco: -001A- (Cidade Baixa, 3 dígitos), -0002B- (Yofi,
  // 4 dígitos).
  const m1 = filename.match(/[-_](\d{3,4})([AB])[-_]/i);
  if (m1) return m1[2].toUpperCase() === "A" ? "A" : "B";
  return "DESCONHECIDA";
}

/**
 * Resultado da inferência: código (chave estável de agrupamento) +
 * label opcional (texto literal do PDF, capitalizado).
 */
export type PavimentoInferido = {
  codigo: Pavimento;
  label?: string;
};

/**
 * Capitaliza palavras: "COBERTURA RESERVATÓRIOS" → "Cobertura Reservatórios".
 * Preserva números/ordinais.
 */
function capitalizarPalavras(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((p) =>
      /^\s+$/.test(p) || p.length === 0
        ? p
        : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join("");
}

/**
 * Inferência do pavimento pelo texto extraído (selo/título de prancha).
 * Retorna **código** (chave estável: COB, RF, 4P, TP, TE) + **label literal**
 * do que o projeto escreveu (ex: "Cobertura Reservatórios", "Rooftop",
 * "Pavimento Tipo (5º a 17º Pav)"). O label é dinâmico por projeto —
 * cada empreendimento usa sua nomenclatura própria.
 *
 * Padrões aceitos (textos contendo "PLANTA BAIXA" são priorizados):
 *   "Planta Baixa 4pav" (selo)
 *   "PLANTA BAIXA - TORRE PLUS A - 4 PAV" (título)
 *   "PLANTA BAIXA - COBERTURA RESERVATÓRIOS" → COB, label "Cobertura Reservatórios"
 *   "PLANTA BAIXA - ROOFTOP" → RF, label "Rooftop"
 *   "PLANTA BAIXA TÉRREO" → TE
 *   "PLANTA BAIXA - TIPO 5º A 17º PAV" → TP
 */
export function inferirPavimentoDoTexto(textos: string[]): PavimentoInferido {
  // Filtra textos que parecem ser TÍTULO ou SELO de prancha. Outros textos
  // (anotações soltas, descrições de elementos) podem ter falsos positivos.
  const candidatos = textos.filter((t) => /PLANTA\s+BAIXA/i.test(t));

  for (const t of candidatos) {
    const r = matchPavimentoEmTitulo(t);
    if (r.codigo !== "DESCONHECIDO") return r;
  }
  return { codigo: "DESCONHECIDO" };
}

function matchPavimentoEmTitulo(texto: string): PavimentoInferido {
  const t = texto.toUpperCase();

  // Ordem importa: COBERTURA testado antes de RESERVATÓRIO porque o título
  // "COBERTURA RESERVATÓRIOS" deve virar COB (não RF). RF é a laje ACIMA da COB.
  const mRoof = t.match(/\bROOFTOP\b/);
  if (mRoof) return { codigo: "RF", label: capitalizarPalavras(mRoof[0]) };

  // Captura "COBERTURA" + opcional "RESERVATÓRIOS" pra label completo
  const mCobRes = t.match(/\bCOBERTURA\s+RESERVAT[OÓ]RIOS?\b/);
  if (mCobRes) return { codigo: "COB", label: capitalizarPalavras(mCobRes[0]) };
  const mCob = t.match(/\bCOBERTURA\b/);
  if (mCob) return { codigo: "COB", label: capitalizarPalavras(mCob[0]) };

  // RES (Reservatórios) — agora é chave própria, não vira RF
  const mResSup = t.match(/\bRESERVAT[OÓ]RIOS?\s+SUPERIOR(?:ES)?\b/);
  if (mResSup) return { codigo: "RES", label: capitalizarPalavras(mResSup[0]) };
  const mRes = t.match(/\bRESERVAT[OÓ]RIOS?\b/);
  if (mRes) return { codigo: "RES", label: capitalizarPalavras(mRes[0]) };
  const mCxAgua = t.match(/\bCAIXA\s+D[A']{0,2}\s*[AÁ]GUA\b/);
  if (mCxAgua) return { codigo: "RES", label: capitalizarPalavras(mCxAgua[0]) };

  const mSubsolo = t.match(/\bSUBSOLO\b/);
  if (mSubsolo) return { codigo: "SS", label: capitalizarPalavras(mSubsolo[0]) };

  const mTerr = t.match(/\bT[ÉE]RREO\b/);
  if (mTerr) return { codigo: "TE", label: capitalizarPalavras(mTerr[0]) };

  // TIPO numerado (TP1, TP2, ...): "TIPO 1", "PAV TIPO 2", "TP1"
  // Testar ANTES de TP puro e dos numerados.
  const mTipoN =
    t.match(/\bPAV(?:IMENTO|TO)?\s+TIPO\s+(\d+)\b/) ??
    t.match(/\bTIPO\s+(\d+)(?!\s*[°º]?\s+(?:A|AO))/) ??
    t.match(/\bTP[\s_-]*(\d+)\b/);
  if (mTipoN) {
    return {
      codigo: `TP${mTipoN[1]}`,
      label: capitalizarPalavras(mTipoN[0]),
    };
  }

  // TP puro: testado ANTES dos numerados porque "TIPO 5º A 17º PAV" contém
  // "17 PAV" — sem essa precedência cairia errado como 17P.
  const mTipoRange = t.match(
    /\bTIPO\s+\d+\s*[°º]?\s+(?:A|AO)\s+\d+\s*[°º]?\s*PAV(?:IMENTO|TO)?\b/,
  );
  if (mTipoRange) return { codigo: "TP", label: capitalizarPalavras(mTipoRange[0]) };
  const mPavTipo = t.match(/\b(PAVIMENTO\s+TIPO|PAV\.?\s*TIPO)\b/);
  if (mPavTipo) return { codigo: "TP", label: capitalizarPalavras(mPavTipo[0]) };

  // Numerados — vários formatos. Label gerado como "Nº Pavimento".
  const padroes: RegExp[] = [
    /\b(\d{1,2})\s*[°º]?\s*PAV(?:IMENTO|TO)?\b/, // "4 PAV", "14º PAV", "4°PAVTO"
    /\b(\d{1,2})PAV\b/, // "4PAV" colado
    /\bPAV(?:IMENTO|TO)?\.?\s*(\d{1,2})\b/, // "PAV 4", "PAVIMENTO 18"
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 50) {
        return { codigo: `${n}P`, label: `${n}º Pavimento` };
      }
    }
  }
  return { codigo: "DESCONHECIDO" };
}

/**
 * Fallback: tenta inferir a torre procurando no texto extraído do PDF.
 * Procura "TORRE A", "TORRE B", "TORRE PLUS A", "TORRE 1", "TORRE 2", etc.
 */
export function inferirTorreDoTexto(textos: string[]): Torre {
  const joined = textos.join(" | ").toUpperCase();
  // Letras: "TORRE A", "TORRE PLUS A"
  const mLetra = joined.match(/\bTORRE\s+(?:PLUS\s+)?([AB])\b/i);
  if (mLetra) return mLetra[1].toUpperCase() === "A" ? "A" : "B";
  // Números: "TORRE 1", "TORRE 02" (Square Garden e outros)
  const mNum = joined.match(/\bTORRE\s+(\d+)\b/i);
  if (mNum) return String(parseInt(mNum[1], 10));
  // Bloco como letra solta no FIM do título (Yofi: "PLANTA BAIXA 2º
  // PAVIMENTO A"). Só em textos de título — letra solta em anotação
  // qualquer não é torre.
  for (const t of textos) {
    const m = t.match(/PLANTA\s+BAIXA.*[\s-]([AB])\s*$/i);
    if (m) return m[1].toUpperCase() === "A" ? "A" : "B";
  }
  return "DESCONHECIDA";
}

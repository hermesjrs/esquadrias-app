import { formatarRangeTipo } from "./repeticoes";
import type { RangeTipo } from "./repeticoes";
import type { Dimensoes, Pavimento, PdfFile } from "./types";
import {
  PAVIMENTO_LABEL,
  PAVIMENTO_REPETICOES,
  ordemPavimento,
} from "./types";

export const FAMILIAS_MATERIAIS: Array<{
  prefixos: string[];
  material: string;
}> = [
  { prefixos: ["PM_INT", "PM"], material: "MADEIRA" },
  { prefixos: ["PCF"], material: "PORTA CORTA-FOGO" },
  { prefixos: ["PB", "JB"], material: "BLINDADA" },
  // EE = "Esquadria Especial" (alçapões, chapéus aletados — Nilo Square)
  // JF = janela ferro (GO Moinhos)
  { prefixos: ["PF", "ERU", "EE", "JF"], material: "FERRO" },
  { prefixos: ["PV", "PVE", "PVF", "PISC", "ZEN", "GCPI"], material: "VIDRO" },
  // PAI (porta alçapão interna — Nilo) cai aqui via prefix "PA"
  {
    prefixos: ["AT", "JA", "JVP", "PA", "PJA", "GC"],
    material: "ALUMÍNIO",
  },
];

export function materialDoCodigo(code: string): string {
  for (const { prefixos, material } of FAMILIAS_MATERIAIS) {
    for (const p of prefixos) {
      if (code.startsWith(p)) return material;
    }
  }
  return "OUTRO";
}

/**
 * Extrai o prefixo de família de um código (letras maiúsculas iniciais).
 * Ex: "PFB05" → "PFB", "JF12" → "JF", "PM_INT03" → "PM_INT".
 */
function prefixoFamilia(code: string): string {
  const m = code.match(/^[A-Z_]+/);
  return m ? m[0] : code;
}

/**
 * Material a exibir pra uma tag específica. Pra tags com família desconhecida
 * (detectadas via regex amplo), NÃO mapeia pra material errado por prefixo —
 * mostra a própria família como material, indicando que precisa ser revisado.
 *
 * Exemplo: PFB05 (família desconhecida) → "FAMÍLIA PFB" em vez de "FERRO"
 * (que seria falso positivo via prefixo "PF").
 */
function materialDaTag(code: string, familiaDesconhecida?: boolean): string {
  if (familiaDesconhecida) {
    return `FAMÍLIA ${prefixoFamilia(code)}`;
  }
  return materialDoCodigo(code);
}

/** Repetições efetivas pra um PDF: manual > detectada > default do pavimento. */
export function repeticoesDe(pdf: PdfFile): number {
  if (
    pdf.repeticoesManual != null &&
    Number.isFinite(pdf.repeticoesManual) &&
    pdf.repeticoesManual > 0
  ) {
    return pdf.repeticoesManual;
  }
  if (
    pdf.repeticoesDetectadas != null &&
    Number.isFinite(pdf.repeticoesDetectadas) &&
    pdf.repeticoesDetectadas > 0
  ) {
    return pdf.repeticoesDetectadas;
  }
  return PAVIMENTO_REPETICOES[pdf.pavimento];
}

/** Uma linha por (código × pavimento). */
export type LinhaCatalogo = {
  code: string;
  material: string;
  pavimento: Pavimento;
  /** Label literal do pavimento extraído do selo do PDF (ex: "Cobertura
   *  Reservatórios", "Rooftop", "5º Pavimento"). Sobrescreve PAVIMENTO_LABEL. */
  pavimentoLabel?: string;
  /** Range do tipo, se aplicável (ex: 6º ao 19º). */
  rangeTipo?: RangeTipo | null;
  locais: string[]; // ambientes únicos onde aparece
  osso?: Dimensoes;
  luz?: Dimensoes;
  /** Total na planta (sem aplicar repetições) — soma das torres do mesmo pavimento. */
  totalPav: number;
  /** Repetições do pavimento (média entre torres). */
  repeticoes: number;
  /** = totalPav × repeticoes. */
  total: number;
};

/**
 * Label completo do pavimento, incluindo range se houver.
 * Prioriza `labelCustomizado` (do PDF) sobre o label genérico de PAVIMENTO_LABEL.
 */
export function labelPavimentoCompleto(
  pav: Pavimento,
  range?: RangeTipo | null,
  labelCustomizado?: string,
): string {
  const base = labelCustomizado ?? PAVIMENTO_LABEL[pav];
  if (range && pav === "TP") {
    return `${base} (${formatarRangeTipo(range)})`;
  }
  return base;
}

export type AvisoTipo =
  | "dim_variavel"
  | "duplicada"
  | "rasterizada"
  | "vazia"
  | "sem_repeticao"
  | "repeticao_duvidosa"
  | "tag_duplicada"
  | "codigo_faltando"
  | "familia_desconhecida";

export type Aviso = {
  tipo: AvisoTipo;
  codigo?: string;
  pavimento?: Pavimento;
  /** Label literal do pavimento extraído do selo (usado pra exibição). */
  pavimentoLabel?: string;
  pdfId?: string;
  pdfNome?: string;
  descricao: string;
};

export type ResumoMaterial = {
  material: string;
  totalEsquadrias: number;
  totalCodigos: number;
};

export type Quantitativo = {
  linhas: LinhaCatalogo[];
  resumoPorMaterial: ResumoMaterial[];
  totalEsquadrias: number;
  pavimentosPresentes: Pavimento[];
  avisos: Aviso[];
};

type OcorrenciaDim = {
  pdfNome: string;
  osso?: Dimensoes;
  luz?: Dimensoes;
};

/** Escolhe a dimensão "canônica" do bucket: prioriza ocorrência com peitoril definido. */
function escolherCanonica(
  ocorrencias: OcorrenciaDim[],
  key: "osso" | "luz",
): Dimensoes | undefined {
  const comPeitoril = ocorrencias.find((o) => o[key]?.peitoril != null)?.[key];
  if (comPeitoril) return comPeitoril;
  return ocorrencias.find((o) => o[key])?.[key];
}

function nomeDoPdf(pdf: PdfFile): string {
  return pdf.nomeCustom || pdf.filename;
}

/** Label efetivo do pavimento de um PDF: prioriza o do selo, fallback genérico. */
function labelPdf(pdf: PdfFile): string {
  return pdf.pavimentoLabel ?? PAVIMENTO_LABEL[pdf.pavimento];
}

export function calcularQuantitativo(pdfs: PdfFile[]): Quantitativo {
  const avisos: Aviso[] = [];

  // Avisa sobre PDFs problemáticos
  for (const pdf of pdfs) {
    if (pdf.arquivado) continue;
    if (pdf.semTextoExtraivel) {
      avisos.push({
        tipo: "rasterizada",
        pdfId: pdf.id,
        pdfNome: nomeDoPdf(pdf),
        descricao: "Planta sem camada de texto (rasterizada) — não entra no quantitativo. Tente OCR ou Claude Vision.",
      });
    } else if (pdf.status === "ok" && (pdf.tags?.length ?? 0) === 0) {
      avisos.push({
        tipo: "vazia",
        pdfId: pdf.id,
        pdfNome: nomeDoPdf(pdf),
        descricao: "Nenhuma esquadria identificada nessa planta.",
      });
    }

    // Avisos de tags duplicadas próximas (provável erro do desenhista)
    for (const dup of pdf.duplicadasSuspeitas ?? []) {
      avisos.push({
        tipo: "tag_duplicada",
        codigo: dup.code,
        pavimento: pdf.pavimento,
        pavimentoLabel: labelPdf(pdf),
        pdfId: pdf.id,
        pdfNome: nomeDoPdf(pdf),
        descricao: `Código ${dup.code} aparece ${dup.posicoes.length} vezes em posições muito próximas — provável tag duplicada no desenho. Revise visualmente.`,
      });
    }

    // Aviso de famílias desconhecidas: tags detectadas via regex amplo + heurística
    // de proximidade. Pode ser família legítima nova (adicionar ao cadastro) ou
    // falso positivo (revisar visualmente).
    if (pdf.familiasDesconhecidas && pdf.familiasDesconhecidas.length > 0) {
      const lista = pdf.familiasDesconhecidas.join(", ");
      avisos.push({
        tipo: "familia_desconhecida",
        pavimento: pdf.pavimento,
        pavimentoLabel: labelPdf(pdf),
        pdfId: pdf.id,
        pdfNome: nomeDoPdf(pdf),
        descricao: `Famílias não cadastradas detectadas em ${nomeDoPdf(pdf)}: ${lista}. Tags próximas a V.O./V.L./OSSO/LUZ — provavelmente esquadrias legítimas. Revise visualmente e, se confirmar, adicione ao regex restrito + cadastro de material em quantitativo.ts.`,
      });
    }

    // Aviso de repetições não detectadas em pavimentos Tipo (TP, TP1, TP2...).
    // Tipos sem range explícito no selo precisam de input manual.
    const ehTipo = pdf.pavimento === "TP" || /^TP\d+$/.test(pdf.pavimento);
    const semRepDetectada =
      pdf.repeticoesDetectadas == null && pdf.repeticoesManual == null;
    if (ehTipo && semRepDetectada && (pdf.tags?.length ?? 0) > 0) {
      avisos.push({
        tipo: "sem_repeticao",
        pavimento: pdf.pavimento,
        pavimentoLabel: labelPdf(pdf),
        pdfId: pdf.id,
        pdfNome: nomeDoPdf(pdf),
        descricao: `Repetições do ${labelPdf(pdf)} não detectadas automaticamente no selo. Está contando como 1 pavimento — ajuste manualmente no card da planta se cobrir mais (ex: TP1 = ímpares 5º-19º = 8 pavimentos).`,
      });
    }

    // Repetições detectadas, mas de um formato ambíguo do selo (ex: range
    // por hífen "TIPO 1 - 3 PAVTOS"). Ajuste manual silencia o aviso.
    if (
      pdf.repeticaoTipoDuvidosa &&
      pdf.repeticoesManual == null &&
      (pdf.tags?.length ?? 0) > 0
    ) {
      avisos.push({
        tipo: "repeticao_duvidosa",
        pavimento: pdf.pavimento,
        pavimentoLabel: labelPdf(pdf),
        pdfId: pdf.id,
        pdfNome: nomeDoPdf(pdf),
        descricao: `Formato de repetições ambíguo no selo${
          pdf.repeticoesTrecho ? ` ("${pdf.repeticoesTrecho}")` : ""
        } — contando × ${repeticoesDe(pdf)}. Confirme ou ajuste no card da planta.`,
      });
    }
  }

  const elegiveis = pdfs.filter(
    (p) =>
      p.status === "ok" &&
      p.tags &&
      !p.arquivado &&
      !p.semTextoExtraivel,
  );

  // Detecta duplicação (mesmo pavimento + torre)
  const porChave = new Map<string, PdfFile[]>();
  for (const p of elegiveis) {
    const chave = `${p.pavimento}|${p.torre}`;
    const arr = porChave.get(chave) ?? [];
    arr.push(p);
    porChave.set(chave, arr);
  }

  const escolhidos: PdfFile[] = [];
  for (const [chave, arr] of porChave.entries()) {
    if (arr.length > 1) {
      const [pav] = chave.split("|");
      const labelPav = arr.find((p) => p.pavimentoLabel)?.pavimentoLabel ?? PAVIMENTO_LABEL[pav as Pavimento];
      avisos.push({
        tipo: "duplicada",
        pavimento: pav as Pavimento,
        pavimentoLabel: labelPav,
        descricao: `${arr.length} plantas pra ${labelPav} ${arr[0].torre !== "DESCONHECIDA" ? `Torre ${arr[0].torre}` : ""}. Usando o upload mais recente: ${nomeDoPdf(arr.sort((a, b) => b.uploadedAt - a.uploadedAt)[0])}.`,
      });
    }
    arr.sort((a, b) => b.uploadedAt - a.uploadedAt);
    escolhidos.push(arr[0]);
  }

  // Agrupa por (código × pavimento)
  type Bucket = {
    code: string;
    pavimento: Pavimento;
    pavimentoLabel?: string; // label literal do selo, do primeiro PDF que trouxe
    material: string;
    locais: Set<string>;
    ocorrencias: OcorrenciaDim[];
    totalPav: number;
    repsObservadas: Set<number>;
    rangeTipo?: RangeTipo | null;
  };

  const buckets = new Map<string, Bucket>();
  const pavimentosSet = new Set<Pavimento>();

  for (const pdf of escolhidos) {
    pavimentosSet.add(pdf.pavimento);
    const rep = repeticoesDe(pdf);
    const pdfNome = nomeDoPdf(pdf);
    for (const tag of pdf.tags ?? []) {
      const key = `${tag.code}|${pdf.pavimento}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          code: tag.code,
          pavimento: pdf.pavimento,
          pavimentoLabel: pdf.pavimentoLabel,
          material: materialDaTag(tag.code, tag.familiaDesconhecida),
          locais: new Set(),
          ocorrencias: [],
          totalPav: 0,
          repsObservadas: new Set(),
          rangeTipo: pdf.rangeTipoDetectado ?? null,
        };
        buckets.set(key, b);
      }
      if (!b.pavimentoLabel && pdf.pavimentoLabel) {
        b.pavimentoLabel = pdf.pavimentoLabel;
      }
      if (!b.rangeTipo && pdf.rangeTipoDetectado) {
        b.rangeTipo = pdf.rangeTipoDetectado;
      }
      b.totalPav += 1;
      b.repsObservadas.add(rep);
      if (tag.local) b.locais.add(tag.local);
      b.ocorrencias.push({
        pdfNome,
        osso: tag.osso,
        luz: tag.luz,
      });
    }
  }

  // Constrói linhas
  const linhas: LinhaCatalogo[] = [];
  for (const b of buckets.values()) {
    const rep = b.repsObservadas.size > 0
      ? Math.max(...b.repsObservadas)
      : PAVIMENTO_REPETICOES[b.pavimento];
    linhas.push({
      code: b.code,
      material: b.material,
      pavimento: b.pavimento,
      pavimentoLabel: b.pavimentoLabel,
      rangeTipo: b.rangeTipo,
      locais: Array.from(b.locais).sort(),
      osso: escolherCanonica(b.ocorrencias, "osso"),
      luz: escolherCanonica(b.ocorrencias, "luz"),
      totalPav: b.totalPav,
      repeticoes: rep,
      total: b.totalPav * rep,
    });
  }

  // Ordena: material > código > pavimento (TE → numerados crescentes → TP → COB → RF → DESCONHECIDO)
  linhas.sort((a, b) => {
    if (a.material !== b.material) return a.material.localeCompare(b.material);
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return ordemPavimento(a.pavimento) - ordemPavimento(b.pavimento);
  });

  // Resumo por material
  const porMaterial = new Map<string, ResumoMaterial>();
  for (const l of linhas) {
    let r = porMaterial.get(l.material);
    if (!r) {
      r = { material: l.material, totalEsquadrias: 0, totalCodigos: 0 };
      porMaterial.set(l.material, r);
    }
    r.totalEsquadrias += l.total;
    r.totalCodigos += 1;
  }

  const totalEsquadrias = linhas.reduce((s, l) => s + l.total, 0);
  const pavimentosPresentes = Array.from(pavimentosSet).sort(
    (a, b) => ordemPavimento(a) - ordemPavimento(b),
  );

  return {
    linhas,
    resumoPorMaterial: Array.from(porMaterial.values()).sort((a, b) =>
      a.material.localeCompare(b.material),
    ),
    totalEsquadrias,
    pavimentosPresentes,
    avisos,
  };
}

export function labelPavimento(p: Pavimento): string {
  return PAVIMENTO_LABEL[p];
}

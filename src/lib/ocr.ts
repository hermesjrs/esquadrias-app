"use client";

import { carregarPdf } from "./pdf";
import { inferirRepeticoesDeMuitas } from "./repeticoes";
import type { Dimensoes, TagExtraida } from "./types";
import type { ExtracaoResultado, PaginaInfo } from "./extracao";

const CODIGO_REGEX =
  /^(PM[\s_-]*INT|PCF|PVF|PVE|PJA|JVP|GCPI|PISC|ERU|ZEN|PM|JA|JB|PA|PB|PF|PV|GC|AT)[\s_-]*(\d+)([a-zA-Z\-_]*)$/;

const DIM_COMPLETA_REGEX =
  /^(OSSO|LIVRE|LUZ|V\.?\s*O\.?|V\.?\s*L\.?)\s*:?\s*([\d.]+)\s*[xX×]\s*([\d.]+)(?:\s*\/\s*([\d.]+))?/i;

const DIM_LABEL_REGEX = /^(OSSO|LIVRE|LUZ|V\.?\s*O\.?|V\.?\s*L\.?)\s*:?\s*$/i;

const DIM_VALOR_REGEX =
  /^([\d.]+)\s*[xX×]\s*([\d.]+)(?:\s*\/\s*([\d.]+))?\s*$/;

const TITULO_REGEX =
  /PLANTA\s+BAIXA[^,\n]*|PAV\.\s*TIPO|TÉRREO|COBERTURA|PAVIMENTO\s+TIPO|\d+º?\s*PAV(?:IMENTO)?/i;

const RANGE_HINT_REGEX = /TIPO|PAV|PAVIMENTO|REPET/i;

const FAMILIA_NORMALIZADA: Record<string, string> = {
  PMINT: "PM_INT",
};

function normalizarCodigo(s: string): string | null {
  const m = s.match(CODIGO_REGEX);
  if (!m) return null;
  const familiaRaw = m[1].toUpperCase().replace(/[\s_-]/g, "");
  const familia = FAMILIA_NORMALIZADA[familiaRaw] ?? familiaRaw;
  return `${familia}${m[2]}${m[3] ?? ""}`;
}

function normalizarTipoDim(raw: string): "OSSO" | "LIVRE" | "LUZ" {
  const up = raw.toUpperCase().replace(/\s|\./g, "");
  if (up === "VO" || up === "OSSO") return "OSSO";
  if (up === "VL" || up === "LUZ") return "LUZ";
  return "LIVRE";
}

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
    if (dx > 80 || dy > 60) continue;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (d.tipo === "OSSO") {
      if (dist < bestOsso) {
        bestOsso = dist;
        osso = d.dim;
      }
    } else if (d.tipo === "LUZ" || d.tipo === "LIVRE") {
      const peso = d.tipo === "LIVRE" ? dist + 5 : dist;
      if (peso < bestLuz) {
        bestLuz = peso;
        luz = d.dim;
      }
    }
  }
  return { osso, luz };
}

export type OcrProgresso = {
  pagina: number;
  totalPaginas: number;
  fase: "renderizando" | "ocr" | "parseando" | "concluido";
  pct?: number;
};

type TesseractWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
};

/**
 * OCR de PDF rasterizado usando Tesseract.js.
 * Renderiza cada página em alta resolução, faz OCR, e identifica códigos com regex.
 */
export async function extrairTagsViaOcr(
  blob: Blob,
  onProgresso?: (p: OcrProgresso) => void,
): Promise<ExtracaoResultado> {
  const { createWorker } = await import("tesseract.js");

  const doc = await carregarPdf(blob);
  const tags: TagExtraida[] = [];
  const paginas: PaginaInfo[] = [];
  const titulos: string[] = [];
  const rangeHints: string[] = [];
  let totalTextItems = 0;

  // Renderiza com 2x DPI pra melhorar OCR
  const RENDER_SCALE = 2;

  const worker = await createWorker(["por", "eng"]);

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onProgresso?.({
        pagina: i,
        totalPaginas: doc.numPages,
        fase: "renderizando",
      });

      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      paginas.push({
        pageIndex: i,
        width: viewport.width,
        height: viewport.height,
      });

      // Limita pixels totais pra não travar o navegador.
      // Páginas grandes podem ter ~22MP a 2x — pega lentidão e instabilidade.
      const MAX_PIXELS = 12_000_000; // ~12MP
      let scale = RENDER_SCALE;
      let pixels = viewport.width * scale * viewport.height * scale;
      if (pixels > MAX_PIXELS) {
        scale = Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height));
      }

      const renderViewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      console.warn(
        `[OCR] página ${i}: render ${canvas.width}×${canvas.height} (scale ${scale.toFixed(2)})`,
      );

      await page.render({
        canvas,
        viewport: renderViewport,
      }).promise;

      onProgresso?.({
        pagina: i,
        totalPaginas: doc.numPages,
        fase: "ocr",
      });

      const result = await worker.recognize(canvas, {}, { blocks: true });
      const data = result.data as {
        text?: string;
        words?: TesseractWord[];
        blocks?: Array<{
          paragraphs?: Array<{
            lines?: Array<{ words?: TesseractWord[] }>;
          }>;
        }>;
      };

      let words: TesseractWord[] = data.words ?? [];
      // Tesseract.js v6+ aninha words em blocks→paragraphs→lines→words
      if (words.length === 0 && data.blocks) {
        for (const block of data.blocks) {
          for (const para of block.paragraphs ?? []) {
            for (const line of para.lines ?? []) {
              for (const w of line.words ?? []) {
                words.push(w);
              }
            }
          }
        }
      }

      console.warn(
        `[OCR] página ${i}: ${words.length} palavras, texto=${(data.text ?? "").length} chars`,
      );
      if (words.length > 0) {
        console.warn(
          "[OCR] amostra:",
          words.slice(0, 15).map((w) => w.text),
        );
      } else if (data.text) {
        console.warn(
          "[OCR] texto bruto:",
          data.text.slice(0, 300),
        );
      }

      onProgresso?.({
        pagina: i,
        totalPaginas: doc.numPages,
        fase: "parseando",
      });

      // Pré-coleta dimensões label/valor (em coords viewport scale=1)
      const labels: Array<{
        x: number;
        y: number;
        tipo: "OSSO" | "LIVRE" | "LUZ";
      }> = [];
      const valores: Array<{ x: number; y: number; dim: Dimensoes }> = [];
      const dimsDaPagina: DimItem[] = [];
      const tagsDaPagina: TagExtraida[] = [];

      for (const w of words) {
        const s = w.text.trim();
        if (!s) continue;
        totalTextItems++;

        // Coords em viewport(scale=1): dividir pela escala usada na renderização
        const x = (w.bbox.x0 + w.bbox.x1) / 2 / scale;
        const y = (w.bbox.y0 + w.bbox.y1) / 2 / scale;
        const width = (w.bbox.x1 - w.bbox.x0) / scale;
        const height = (w.bbox.y1 - w.bbox.y0) / scale;

        const codigoNorm = normalizarCodigo(s);
        if (codigoNorm) {
          tagsDaPagina.push({
            code: codigoNorm,
            pageIndex: i,
            x,
            y,
            width,
            height,
          });
          continue;
        }

        const completa = parseDimComplete(s);
        if (completa) {
          dimsDaPagina.push({
            x,
            y,
            tipo: completa.tipo,
            dim: completa.dim,
          });
          continue;
        }

        if (DIM_LABEL_REGEX.test(s)) {
          const m = s.match(DIM_LABEL_REGEX)!;
          labels.push({ x, y, tipo: normalizarTipoDim(m[1]) });
          continue;
        }

        const valor = parseDimValor(s);
        if (valor) {
          valores.push({ x, y, dim: valor });
          continue;
        }

        if (TITULO_REGEX.test(s) && s.length < 80) {
          titulos.push(s);
        }
        if (RANGE_HINT_REGEX.test(s) && /\d/.test(s) && s.length < 120) {
          rangeHints.push(s);
        }
      }

      // Pareia label com valor próximo (mesma palavra/linha)
      for (const label of labels) {
        let best: { v: (typeof valores)[number]; d: number } | null = null;
        for (const v of valores) {
          const dx = v.x - label.x;
          const dy = v.y - label.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 60 && (!best || d < best.d)) {
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

      for (const tag of tagsDaPagina) {
        const dims = associarDimensoes(tag, dimsDaPagina);
        tag.osso = dims.osso;
        tag.luz = dims.luz;
        tags.push(tag);
      }
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }

  onProgresso?.({
    pagina: doc.numPages,
    totalPaginas: doc.numPages,
    fase: "concluido",
  });

  const repeticoesDetectadas = inferirRepeticoesDeMuitas([
    ...titulos,
    ...rangeHints,
  ]);

  return {
    tags,
    paginas,
    tituloPrancha:
      titulos.find((t) => /PLANTA\s+BAIXA/i.test(t)) ?? titulos[0] ?? null,
    repeticoesDetectadas,
    rangeTipoDetectado: null,
    repeticaoTipoDuvidosa: false,
    repeticoesTrecho: null,
    // OCR pegou texto - reportar como "tem texto" pra entrar no quantitativo
    semTextoExtraivel: false,
    totalTextItems,
    duplicadasSuspeitas: [],
    familiasDesconhecidasDetectadas: [],
    pavimentoInferidoDoTexto: "DESCONHECIDO",
    torreInferidoDoTexto: "DESCONHECIDA",
  };
}

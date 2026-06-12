"use client";

import { inferirRepeticoesDeMuitas } from "./repeticoes";
import type { Dimensoes, TagExtraida } from "./types";
import type { ExtracaoResultado, PaginaInfo } from "./extracao";

export type ClaudeProgresso = {
  fase: "preparando" | "enviando" | "processando" | "concluido" | "erro";
  detalhe?: string;
};

type CodigoLido = {
  code: string;
  x_norm?: number;
  y_norm?: number;
  confianca?: number;
  vo_largura?: number;
  vo_altura?: number;
  vo_peitoril?: number;
  vl_largura?: number;
  vl_altura?: number;
  vl_peitoril?: number;
};

type RespostaIA = {
  descricao_breve?: string;
  codigos?: CodigoLido[];
  titulo_prancha?: string;
  repeticoes?: number | null;
  largura_planta?: number;
  altura_planta?: number;
};

export type ModeloClaude =
  | "claude-sonnet-4-5-20250929"
  | "claude-opus-4-1-20250805";

export const MODELOS_DISPONIVEIS: Array<{ id: ModeloClaude; nome: string; descricao: string }> = [
  {
    id: "claude-sonnet-4-5-20250929",
    nome: "Sonnet 4.5",
    descricao: "Equilíbrio custo×qualidade. ~$0,05/planta",
  },
  {
    id: "claude-opus-4-1-20250805",
    nome: "Opus 4.1",
    descricao: "Mais preciso pra visão complexa. ~$0,25/planta",
  },
];

const PROMPT = `Você está analisando uma planta baixa de arquitetura para levantamento de esquadrias (portas, janelas, aberturas).

REGRAS CRÍTICAS:
1. Identifique APENAS códigos que você CONSEGUE LER CLARAMENTE no desenho. Não invente, não chute, não copie de memória.
2. Os códigos são SEMPRE escritos como texto perto das portas/janelas no desenho — geralmente em formato "XX##" (2-4 letras + números).
3. Se você não consegue ler nenhum código com confiança, retorne lista vazia: { "codigos": [] }.
4. NÃO use o prompt como pista de quais códigos existem — leia apenas o que está na planta.

Para cada código LITERALMENTE LIDO na planta, retorne uma entrada (não agrupe — se aparece 24 vezes, retorne 24 entradas).

Formato de saída (JSON estrito, sem markdown):
{
  "descricao_breve": "O que você vê na planta (1-2 frases pra eu validar que entendeu)",
  "codigos": [
    {
      "code": "<exatamente como está escrito>",
      "x_norm": <0 a 1, top-left origin>,
      "y_norm": <0 a 1>,
      "confianca": <0 a 1, sua confiança em ter lido certo>,
      "vo_largura": <cm, null se não souber>,
      "vo_altura": <cm, null>,
      "vl_largura": <cm, null>,
      "vl_altura": <cm, null>,
      "vo_peitoril": <cm, null>,
      "vl_peitoril": <cm, null>
    }
  ],
  "titulo_prancha": "<texto do selo se conseguir ler, senão null>",
  "repeticoes": <número se selo indicar "TIPO (X AO Y)", senão null>,
  "largura_planta": <pixels da imagem>,
  "altura_planta": <pixels>
}

Onde:
- VO = Vão de Obra (também rotulado "OSSO" ou "V.O.")
- VL = Vão Livre (também rotulado "LUZ", "LIVRE" ou "V.L.")

IMPORTANTE:
- Só inclua um código se "confianca" >= 0.7. Códigos duvidosos → pule.
- Se a planta está muito ilegível (baixa resolução, escaneamento ruim), retorne { "descricao_breve": "...", "codigos": [] } e diga na descrição que não dá pra ler.
- Retorne APENAS o JSON, sem texto antes ou depois.`;

export type ClaudeResultadoDebug = {
  modelo: string;
  descricaoBreve?: string;
  respostaBruta: string;
  totalCodigosNaResposta: number;
  filtradosPorConfianca: number;
};

export async function extrairTagsViaClaude(
  blob: Blob,
  apiKey: string,
  modelo: ModeloClaude = "claude-sonnet-4-5-20250929",
  onProgresso?: (p: ClaudeProgresso) => void,
): Promise<ExtracaoResultado & { debug?: ClaudeResultadoDebug }> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("API key da Claude não fornecida");
  }

  onProgresso?.({ fase: "preparando", detalhe: "Convertendo PDF…" });

  // Converte blob -> base64
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);

  onProgresso?.({
    fase: "enviando",
    detalhe: `Enviando ${(blob.size / 1024 / 1024).toFixed(1)} MB para Claude…`,
  });

  const body = {
    model: modelo,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const erroTxt = await resp.text();
    throw new Error(
      `Claude API retornou ${resp.status}: ${erroTxt.slice(0, 300)}`,
    );
  }

  const data = await resp.json();
  const conteudo: string =
    data?.content?.[0]?.text ?? data?.content?.[0]?.content ?? "";
  if (!conteudo) {
    throw new Error("Resposta vazia da Claude");
  }

  onProgresso?.({ fase: "processando", detalhe: "Interpretando resposta…" });

  // Remove markdown se houver
  const limpo = conteudo
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: RespostaIA;
  try {
    parsed = JSON.parse(limpo);
  } catch (e) {
    throw new Error(
      `Não consegui interpretar JSON da Claude: ${e instanceof Error ? e.message : "erro"}. Resposta: ${limpo.slice(0, 200)}`,
    );
  }

  const codigos = parsed.codigos ?? [];
  const w = parsed.largura_planta ?? 2000;
  const h = parsed.altura_planta ?? 1500;

  const tags: TagExtraida[] = [];
  let filtrados = 0;
  for (const c of codigos) {
    if (!c.code) continue;
    if (typeof c.confianca === "number" && c.confianca < 0.7) {
      filtrados++;
      continue;
    }
    const xNorm = typeof c.x_norm === "number" ? c.x_norm : 0.5;
    const yNorm = typeof c.y_norm === "number" ? c.y_norm : 0.5;

    // Coords normalizadas (0-1). PdfViewer multiplica pelas dimensões reais.
    const tag: TagExtraida = {
      code: c.code,
      pageIndex: 1,
      x: xNorm,
      y: yNorm,
      width: 0.012,
      height: 0.008,
      normalizado: true,
    };

    if (c.vo_largura && c.vo_altura) {
      const osso: Dimensoes = {
        largura: c.vo_largura,
        altura: c.vo_altura,
        peitoril: c.vo_peitoril ?? undefined,
      };
      tag.osso = osso;
    }
    if (c.vl_largura && c.vl_altura) {
      const luz: Dimensoes = {
        largura: c.vl_largura,
        altura: c.vl_altura,
        peitoril: c.vl_peitoril ?? undefined,
      };
      tag.luz = luz;
    }
    tags.push(tag);
  }

  const paginas: PaginaInfo[] = [{ pageIndex: 1, width: w, height: h }];

  const repeticoesDetectadas =
    parsed.repeticoes ??
    inferirRepeticoesDeMuitas([parsed.titulo_prancha ?? null]);

  onProgresso?.({ fase: "concluido" });

  const debug: ClaudeResultadoDebug = {
    modelo,
    descricaoBreve: parsed.descricao_breve,
    respostaBruta: limpo,
    totalCodigosNaResposta: codigos.length,
    filtradosPorConfianca: filtrados,
  };

  return {
    tags,
    paginas,
    tituloPrancha: parsed.titulo_prancha ?? null,
    repeticoesDetectadas: repeticoesDetectadas ?? null,
    rangeTipoDetectado: null,
    repeticaoTipoDuvidosa: false,
    repeticoesTrecho: null,
    semTextoExtraivel: false,
    totalTextItems: tags.length,
    duplicadasSuspeitas: [],
    familiasDesconhecidasDetectadas: [],
    pavimentoInferidoDoTexto: "DESCONHECIDO",
    torreInferidoDoTexto: "DESCONHECIDA",
    debug,
  };
}

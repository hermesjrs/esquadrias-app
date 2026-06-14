/**
 * Pavimento agora é uma string aberta — qualquer "NP" (4P, 18P, 22P, ...) é aceito,
 * além das constantes nomeadas conhecidas. Permite suportar empreendimentos novos
 * sem mexer no código.
 */
export type Pavimento = string;

export const PAVIMENTO_DESCONHECIDO: Pavimento = "DESCONHECIDO";

/**
 * Torre agora é string aberta — aceita "A"/"B" (Cidade Baixa, Nilo) e também
 * números como "1"/"2"/"3" (Square Garden: T1, T2) ou nomes próprios ("Family",
 * "Plus") sem precisar mexer no tipo. "DESCONHECIDA" é a constante de "nada
 * detectado".
 */
export type Torre = string;
export const TORRE_DESCONHECIDA: Torre = "DESCONHECIDA";

/**
 * Labels FALLBACK genéricos — usados só quando o PDF não trouxe label
 * específico do projeto. Cada planta pode (e deve) trazer seu próprio
 * pavimentoLabel extraído do selo/título, sobrescrevendo isso.
 */
const PAVIMENTO_LABEL_FIXO: Record<string, string> = {
  SS: "Subsolo",
  TE: "Térreo",
  "2P": "2º Pavimento",
  TP: "Pavimento Tipo",
  "14P": "14º Pavimento",
  "15P": "15º Pavimento",
  COB: "Cobertura",
  RF: "Rooftop",
  RES: "Reservatórios",
  DESCONHECIDO: "Pavimento desconhecido",
};

const PAVIMENTO_REPETICOES_FIXO: Record<string, number> = {
  SS: 1,
  TE: 1,
  "2P": 1,
  TP: 11,
  "14P": 1,
  "15P": 1,
  COB: 1,
  RF: 1,
  RES: 1,
  DESCONHECIDO: 1,
};

/**
 * Map de labels com fallback dinâmico:
 *  - Pavimentos fixos (TE, COB, RF...) retornam o label customizado.
 *  - Padrão "NP" (ex: "4P") retorna "Nº Pavimento" (ex: "4º Pavimento").
 *  - Outros retornam o próprio nome.
 */
export const PAVIMENTO_LABEL: Record<Pavimento, string> = new Proxy(
  PAVIMENTO_LABEL_FIXO,
  {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      // "TP1", "TP2", ... — Pavimento Tipo numerado
      const mTp = prop.match(/^TP(\d+)$/);
      if (mTp) return `Pavimento Tipo ${mTp[1]}`;
      // "4P", "18P", ... — Numerados genéricos
      const m = prop.match(/^(\d+)P$/);
      if (m) return `${m[1]}º Pavimento`;
      return prop;
    },
  },
);

/**
 * Map de repetições padrão por pavimento. Pavimentos desconhecidos retornam 1.
 * Pra TP o valor "default" é 11 (Cidade Baixa) mas idealmente o range detectado
 * do PDF sobrescreve (ver repeticoesDe em quantitativo.ts).
 */
export const PAVIMENTO_REPETICOES: Record<Pavimento, number> = new Proxy(
  PAVIMENTO_REPETICOES_FIXO,
  {
    get(target, prop) {
      if (typeof prop !== "string") return 1;
      if (prop in target) return target[prop];
      return 1;
    },
  },
);

/**
 * Ordem canônica de pavimentos:
 *  SS → TE → numerados crescentes (2P, 4P, 14P, 18P) →
 *  TP, TP1, TP2... → COB → RF → RES → DESCONHECIDO.
 */
export function ordemPavimento(p: Pavimento): number {
  if (p === "SS") return -2000;
  if (p === "TE") return -1000;
  if (p === "TP") return 1000;
  // TP1, TP2 logo após TP
  const mTp = p.match(/^TP(\d+)$/);
  if (mTp) return 1000 + parseInt(mTp[1], 10);
  if (p === "COB") return 2000;
  if (p === "RF") return 2001;
  if (p === "RES") return 2002;
  if (p === "DESCONHECIDO") return 99999;
  const m = p.match(/^(\d+)P$/);
  if (m) return parseInt(m[1], 10);
  return 9000;
}

export type Dimensoes = {
  largura: number;
  altura: number;
  peitoril?: number;
};

export type TagExtraida = {
  code: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  osso?: Dimensoes;
  luz?: Dimensoes;
  /** Ambiente onde a esquadria está (ex: "DORM SUÍTE", "BANHO", "PISCINA"). */
  local?: string;
  /** Se true, x/y/width/height são valores normalizados (0-1) e devem ser multiplicados pelas dimensões do viewport. */
  normalizado?: boolean;
  /**
   * Se true, a tag veio do regex amplo (família não-listada) + heurística de
   * proximidade a dimensão. Indica que o material/categoria pode estar errado
   * e o user deve confirmar.
   */
  familiaDesconhecida?: boolean;
};

export type PaginaInfo = {
  pageIndex: number;
  width: number;
  height: number;
};

export const VERSAO_EXTRACAO = 33;

export type Projeto = {
  id: string;
  nome: string;
  createdAt: number;
  arquivado?: boolean;
};

export type PdfFile = {
  id: string;
  /** ID do projeto que agrupa esta planta. */
  projetoId: string;
  filename: string;
  nomeCustom?: string | null;
  size: number;
  uploadedAt: number;
  pavimento: Pavimento;
  torre: Torre;
  status: "pendente" | "processando" | "ok" | "erro";
  erro?: string;
  tags?: TagExtraida[];
  paginas?: PaginaInfo[];
  tituloPrancha?: string | null;
  versaoExtracao?: number;
  arquivado?: boolean;
  /** Quantidade detectada do selo (ex: "TIPO (6° AO 19°)" → 14). */
  repeticoesDetectadas?: number | null;
  /** Range detectado: "TIPO (6° AO 19°)" → { inicio: 6, fim: 19 }. */
  rangeTipoDetectado?: { inicio: number; fim: number } | null;
  /** Formato ambíguo de repetições no selo (range por hífen) — revisar. */
  repeticaoTipoDuvidosa?: boolean | null;
  /** Trecho do selo de onde as repetições foram lidas (citado no aviso). */
  repeticoesTrecho?: string | null;
  /** Override manual (substitui o detectado se setado). */
  repeticoesManual?: number | null;
  /** PDF rasterizado (sem camada de texto extraível). */
  semTextoExtraivel?: boolean;
  /** Tags do mesmo código próximas — possível duplicação do desenhista. */
  duplicadasSuspeitas?: Array<{
    code: string;
    posicoes: Array<{ x: number; y: number }>;
  }>;
  /**
   * Famílias não-listadas no regex restrito que foram detectadas via heurística
   * (regex amplo + proximidade a dimensão). Ex: ["XY", "ZZ"]. O user deve revisar
   * pra confirmar tipo/material e adicionar ao cadastro se for legítimo.
   */
  familiasDesconhecidas?: string[];
  /**
   * Label literal do pavimento extraído do selo/título da prancha
   * (ex: "Cobertura Reservatórios", "Rooftop", "Pavimento Tipo", "4º Pavimento").
   * Sobrescreve o label genérico de PAVIMENTO_LABEL quando presente — permite
   * que cada projeto tenha sua própria nomenclatura.
   */
  pavimentoLabel?: string;
  /** Info de debug da última extração via IA. */
  claudeDebug?: {
    modelo: string;
    descricaoBreve?: string;
    respostaBruta: string;
    totalCodigosNaResposta: number;
    filtradosPorConfianca: number;
  } | null;
};

export type ProjetoMeta = {
  id: string;
  nome: string;
  createdAt: number;
  pdfIds: string[];
};

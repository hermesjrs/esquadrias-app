"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2, ScanText, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import type { Dimensoes, PdfFile, TagExtraida } from "@/lib/types";
import type { OcrProgresso } from "@/lib/ocr";
import type { ClaudeProgresso, ModeloClaude } from "@/lib/claudeVision";
import { MODELOS_DISPONIVEIS } from "@/lib/claudeVision";
import { useState } from "react";

type Props = {
  pdf: PdfFile;
  codigoDestacado: string | null;
  onHover: (code: string | null) => void;
  focado: { code: string; index: number } | null;
  onFocar: (f: { code: string; index: number } | null) => void;
  ocrProgresso?: OcrProgresso | null;
  onRodarOcr?: () => void;
  claudeProgresso?: ClaudeProgresso | null;
  onRodarClaude?: (apiKey: string, modelo: ModeloClaude) => void;
  apiKey: string;
  onSetApiKey: (k: string) => void;
};

type LinhaCodigo = {
  code: string;
  quantidade: number;
  osso?: Dimensoes;
  luz?: Dimensoes;
};

function agrupar(tags: TagExtraida[]): LinhaCodigo[] {
  const m = new Map<string, LinhaCodigo>();
  for (const t of tags) {
    let l = m.get(t.code);
    if (!l) {
      l = { code: t.code, quantidade: 0, osso: t.osso, luz: t.luz };
      m.set(t.code, l);
    }
    l.quantidade += 1;
    if (!l.osso && t.osso) l.osso = t.osso;
    if (!l.luz && t.luz) l.luz = t.luz;
  }
  return Array.from(m.values()).sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return a.code.localeCompare(b.code);
  });
}

function formatDim(d?: Dimensoes): string {
  if (!d) return "";
  const base = `${d.largura}×${d.altura}`;
  return d.peitoril !== undefined ? `${base}/${d.peitoril}` : base;
}

export function PainelCodigos({
  pdf,
  codigoDestacado,
  onHover,
  focado,
  onFocar,
  ocrProgresso,
  onRodarOcr,
  claudeProgresso,
  onRodarClaude,
  apiKey,
  onSetApiKey,
}: Props) {
  const [mostrarKey, setMostrarKey] = useState(false);
  const [modelo, setModelo] = useState<ModeloClaude>(
    "claude-sonnet-4-5-20250929",
  );
  const [mostrarDebug, setMostrarDebug] = useState(false);
  const linhas = useMemo(() => agrupar(pdf.tags ?? []), [pdf.tags]);
  const total = linhas.reduce((s, l) => s + l.quantidade, 0);

  if (pdf.status === "processando") {
    return <div className="p-4 text-sm text-zinc-500">Extraindo códigos…</div>;
  }

  if (pdf.status === "erro") {
    return (
      <div className="p-4 text-sm text-red-600">
        Erro na extração: {pdf.erro ?? "desconhecido"}
      </div>
    );
  }

  if (pdf.semTextoExtraivel) {
    const emProgresso = !!ocrProgresso;
    return (
      <div className="space-y-3 p-4 text-sm">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-semibold">PDF sem texto extraível</p>
          <p className="mt-1 text-xs">
            Essa planta parece ter sido exportada como imagem (rasterizada),
            sem camada de texto. Não consigo identificar os códigos por leitura
            direta.
          </p>
        </div>

        {onRodarOcr && (
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Tentar com OCR gratuito (Tesseract.js)
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Roda localmente no seu navegador. Pode levar 30s–2min por página.
              Qualidade média — confira o resultado depois.
            </p>
            {emProgresso ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>
                  {ocrProgresso!.fase === "renderizando" && "Renderizando"}
                  {ocrProgresso!.fase === "ocr" && "Lendo texto"}
                  {ocrProgresso!.fase === "parseando" && "Identificando códigos"}
                  {ocrProgresso!.fase === "concluido" && "Finalizando"}
                  {" · pág. "}
                  {ocrProgresso!.pagina}/{ocrProgresso!.totalPaginas}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onRodarOcr}
                className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <ScanText className="h-3.5 w-3.5" />
                Rodar OCR agora
              </button>
            )}
          </div>
        )}

        {onRodarClaude && (
          <div className="rounded-md border border-purple-200 bg-purple-50/50 px-3 py-2.5 dark:border-purple-800 dark:bg-purple-950/30">
            <p className="flex items-center gap-1 text-xs font-semibold text-purple-900 dark:text-purple-200">
              <Sparkles className="h-3.5 w-3.5" />
              Tentar com Claude Vision (pago)
            </p>
            <p className="mt-1 text-[11px] text-purple-800/80 dark:text-purple-200/70">
              Manda o PDF inteiro pra API da Anthropic. ~$0,05–0,30 por planta.
              Funciona melhor em plantas com pouca densidade de detalhes. Pode
              falhar em plantas grandes/com texto muito pequeno (a API
              comprime imagens internamente).
            </p>
            <div className="mt-2">
              <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                API Key (sk-ant-…)
              </label>
              <div className="mt-1 flex gap-1">
                <input
                  type={mostrarKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => onSetApiKey(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-mono dark:border-zinc-600 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => setMostrarKey((v) => !v)}
                  className="cursor-pointer rounded border border-zinc-300 px-2 text-[11px] hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  {mostrarKey ? "Ocultar" : "Ver"}
                </button>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                Salva no localStorage do seu navegador.
              </p>
            </div>
            <div className="mt-2">
              <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                Modelo
              </label>
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value as ModeloClaude)}
                className="mt-1 w-full cursor-pointer rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              >
                {MODELOS_DISPONIVEIS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} — {m.descricao}
                  </option>
                ))}
              </select>
            </div>
            {claudeProgresso ? (
              <div
                className={clsx(
                  "mt-2 flex items-center gap-2 text-xs",
                  claudeProgresso.fase === "erro"
                    ? "text-red-700 dark:text-red-300"
                    : "text-zinc-700 dark:text-zinc-300",
                )}
              >
                {claudeProgresso.fase !== "erro" && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                <span>
                  {claudeProgresso.detalhe ?? claudeProgresso.fase}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onRodarClaude(apiKey, modelo)}
                disabled={!apiKey.trim()}
                className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300 dark:bg-purple-600 dark:disabled:bg-purple-900"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Rodar Claude Vision
              </button>
            )}
          </div>
        )}

        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          <p className="font-semibold">Se tudo falhar:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Pedir o PDF original com texto vetorial (CAD/Revit)</li>
            <li>Fazer levantamento manual nessa planta</li>
          </ul>
        </div>
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <div className="text-zinc-500">
          Nenhum código de esquadria identificado nesta planta.
        </div>
        {pdf.claudeDebug && (
          <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3 text-xs dark:border-purple-800 dark:bg-purple-950/30">
            <p className="font-semibold text-purple-900 dark:text-purple-200">
              ✨ Resultado Claude ({pdf.claudeDebug.modelo.split("-").slice(1, 3).join(" ")})
            </p>
            {pdf.claudeDebug.descricaoBreve && (
              <p className="mt-1 text-purple-800/80 italic dark:text-purple-200/70">
                &ldquo;{pdf.claudeDebug.descricaoBreve}&rdquo;
              </p>
            )}
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Códigos na resposta: {pdf.claudeDebug.totalCodigosNaResposta} ·{" "}
              Filtrados por baixa confiança: {pdf.claudeDebug.filtradosPorConfianca}
            </p>
            <button
              type="button"
              onClick={() => setMostrarDebug((v) => !v)}
              className="mt-2 cursor-pointer text-purple-700 underline hover:text-purple-900 dark:text-purple-300"
            >
              {mostrarDebug ? "Ocultar" : "Ver"} resposta bruta
            </button>
            {mostrarDebug && (
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-[10px] dark:bg-zinc-900">
                {pdf.claudeDebug.respostaBruta}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Códigos nesta planta
        </h3>
        <p className="text-xs text-zinc-500">
          {linhas.length} códigos distintos · {total} esquadrias
          {pdf.tituloPrancha && (
            <>
              <br />
              <span className="italic text-zinc-400">{pdf.tituloPrancha}</span>
            </>
          )}
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {linhas.map((l) => {
          const ativa = codigoDestacado === l.code;
          const focando = focado?.code === l.code;
          const ossoStr = formatDim(l.osso);
          const luzStr = formatDim(l.luz);
          return (
            <li
              key={l.code}
              onMouseEnter={() => onHover(l.code)}
              onMouseLeave={() => onHover(null)}
              onClick={() =>
                focando ? onFocar(null) : onFocar({ code: l.code, index: 0 })
              }
              className={clsx(
                "cursor-pointer border-b border-zinc-100 px-4 py-2 transition-colors dark:border-zinc-900",
                focando
                  ? "bg-orange-100 dark:bg-orange-950/40"
                  : ativa
                  ? "bg-amber-100 dark:bg-amber-950/40"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
              )}
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-mono text-zinc-900 dark:text-zinc-100">
                  {l.code}
                </span>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                  {l.quantidade}
                </span>
              </div>
              {(ossoStr || luzStr) && (
                <div className="mt-0.5 flex gap-3 text-[10px] text-zinc-500">
                  {ossoStr && <span>VO {ossoStr}</span>}
                  {luzStr && <span>VL {luzStr}</span>}
                </div>
              )}
              {focando && (
                <div className="mt-2 flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs text-zinc-700 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocar({ code: l.code, index: focado!.index - 1 });
                    }}
                    className="cursor-pointer rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="flex-1 text-center tabular-nums">
                    {(((focado!.index % l.quantidade) + l.quantidade) %
                      l.quantidade) +
                      1}
                    {" / "}
                    {l.quantidade}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocar({ code: l.code, index: focado!.index + 1 });
                    }}
                    className="cursor-pointer rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Próxima"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocar(null);
                    }}
                    className="cursor-pointer rounded p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Sair da navegação"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

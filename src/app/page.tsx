"use client";

import { useEffect, useMemo, useState } from "react";
import { ListaProjetos } from "@/components/ListaProjetos";
import { PainelCodigos } from "@/components/PainelCodigos";
import { PainelQuantitativo } from "@/components/PainelQuantitativo";
import { PdfDropzone } from "@/components/PdfDropzone";
import { PdfViewer } from "@/components/PdfViewer";
import { useApiKey } from "@/lib/useApiKey";
import { usePdfs } from "@/lib/usePdfs";
import { ehModoDemo, rodarSeedDemo } from "@/lib/demoSeed";
import clsx from "clsx";

type Aba = "planta" | "quantitativo";

export default function Home() {
  const {
    projetos,
    pdfs,
    carregando,
    ocrEmAndamento,
    adicionarComoNovoProjeto,
    adicionarAoProjeto,
    criarProjeto,
    renomearProjeto,
    alternarArquivadoProjeto,
    excluirProjeto,
    remover,
    renomear,
    alternarArquivado,
    setRepeticoes,
    rodarOcr,
    rodarClaude,
    claudeEmAndamento,
    obterPdfBlob,
  } = usePdfs();
  const { apiKey, setApiKey } = useApiKey();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [codigoDestacado, setCodigoDestacado] = useState<string | null>(null);
  const [focado, setFocado] = useState<{ code: string; index: number } | null>(
    null,
  );
  const [aba, setAba] = useState<Aba>("planta");
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  // Modo demo (?demo na URL ou domínio de demonstração): com o IDB vazio,
  // popula os projetos de exemplo embutidos no deploy. Roda no máximo uma
  // vez — visitas seguintes já encontram os projetos persistidos.
  useEffect(() => {
    if (carregando || projetos.length > 0 || pdfs.length > 0) return;
    if (!ehModoDemo()) return;
    rodarSeedDemo({ criarProjeto, adicionarAoProjeto, onProgresso: setSeedMsg });
  }, [carregando, projetos.length, pdfs.length, criarProjeto, adicionarAoProjeto]);

  const selecionado = useMemo(
    () => pdfs.find((p) => p.id === selecionadoId) ?? null,
    [pdfs, selecionadoId],
  );

  const projetoSelecionado = useMemo(() => {
    if (!selecionado) return null;
    return projetos.find((p) => p.id === selecionado.projetoId) ?? null;
  }, [projetos, selecionado]);

  const pdfsDoProjeto = useMemo(() => {
    if (!projetoSelecionado) return [];
    return pdfs.filter((p) => p.projetoId === projetoSelecionado.id);
  }, [pdfs, projetoSelecionado]);

  useEffect(() => {
    if (!selecionadoId) {
      setBlob(null);
      return;
    }
    let cancelado = false;
    obterPdfBlob(selecionadoId).then((b) => {
      if (!cancelado) setBlob(b ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [selecionadoId, obterPdfBlob]);

  // Limpa a seleção se a planta selecionada deixou de existir (ex: excluída).
  // NÃO auto-seleciona nada no carregamento — começa sempre com a tela limpa,
  // o user escolhe explicitamente qual planta abrir ou faz upload.
  useEffect(() => {
    if (selecionadoId && !pdfs.some((p) => p.id === selecionadoId)) {
      setSelecionadoId(null);
    }
  }, [pdfs, selecionadoId]);

  useEffect(() => {
    setCodigoDestacado(null);
    setFocado(null);
  }, [selecionadoId, aba]);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Levantamento de esquadrias
        </h1>
        <p className="text-xs text-zinc-500">
          Cada upload vira um projeto agrupado · quantitativo gerado por projeto
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-96 shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <PdfDropzone onArquivos={adicionarComoNovoProjeto} />
          {seedMsg && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {seedMsg}
            </p>
          )}
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Projetos
              {projetos.length > 0 && (
                <span className="ml-1 font-normal normal-case text-zinc-400">
                  ({projetos.length})
                </span>
              )}
            </h2>
            {carregando ? (
              <p className="text-sm text-zinc-500">Carregando…</p>
            ) : (
              <ListaProjetos
                projetos={projetos}
                pdfs={pdfs}
                selecionadoId={selecionadoId}
                onSelecionarPdf={setSelecionadoId}
                onRemoverPdf={remover}
                onRenomearPdf={renomear}
                onAlternarArquivoPdf={alternarArquivado}
                onSetRepeticoesPdf={setRepeticoes}
                onAdicionarAoProjeto={adicionarAoProjeto}
                onRenomearProjeto={renomearProjeto}
                onAlternarArquivoProjeto={alternarArquivadoProjeto}
                onExcluirProjeto={excluirProjeto}
              />
            )}
          </div>
        </aside>

        <main className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {blob && selecionado ? (
              <PdfViewer
                blob={blob}
                tags={selecionado.tags}
                codigoDestacado={aba === "planta" ? codigoDestacado : null}
                focado={aba === "planta" ? focado : null}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center">
                <div className="max-w-md">
                  <p className="text-base text-zinc-600 dark:text-zinc-300">
                    {pdfs.length === 0
                      ? "Arraste as plantas do seu projeto no painel à esquerda. Elas serão agrupadas em um único projeto."
                      : "Selecione uma planta para visualizar."}
                  </p>
                </div>
              </div>
            )}
          </div>
          {selecionado && projetoSelecionado && (
            <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAba("planta")}
                  className={clsx(
                    "flex-1 cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    aba === "planta"
                      ? "border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                      : "border-transparent text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900",
                  )}
                >
                  Esta planta
                </button>
                <button
                  type="button"
                  onClick={() => setAba("quantitativo")}
                  className={clsx(
                    "flex-1 cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    aba === "quantitativo"
                      ? "border-blue-500 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                      : "border-transparent text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900",
                  )}
                >
                  Quantitativo do projeto
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {aba === "planta" ? (
                  <PainelCodigos
                    pdf={selecionado}
                    codigoDestacado={codigoDestacado}
                    onHover={setCodigoDestacado}
                    focado={focado}
                    onFocar={setFocado}
                    ocrProgresso={ocrEmAndamento[selecionado.id] ?? null}
                    onRodarOcr={() => rodarOcr(selecionado.id)}
                    claudeProgresso={
                      claudeEmAndamento[selecionado.id] ?? null
                    }
                    onRodarClaude={(key, modelo) =>
                      rodarClaude(selecionado.id, key, modelo)
                    }
                    apiKey={apiKey}
                    onSetApiKey={setApiKey}
                  />
                ) : (
                  <PainelQuantitativo
                    pdfs={pdfsDoProjeto}
                    projeto={projetoSelecionado}
                  />
                )}
              </div>
            </aside>
          )}
        </main>
      </div>
    </div>
  );
}

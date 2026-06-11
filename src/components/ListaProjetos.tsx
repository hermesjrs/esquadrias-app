"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ProjetoBloco } from "./ProjetoBloco";
import type { PdfFile, Projeto } from "@/lib/types";

type Props = {
  projetos: Projeto[];
  pdfs: PdfFile[];
  selecionadoId: string | null;
  onSelecionarPdf: (id: string) => void;
  onRemoverPdf: (id: string) => void;
  onRenomearPdf: (id: string, nome: string) => void;
  onAlternarArquivoPdf: (id: string) => void;
  onSetRepeticoesPdf: (id: string, rep: number | null) => void;
  onAdicionarAoProjeto: (projetoId: string, arquivos: File[]) => void;
  onRenomearProjeto: (id: string, nome: string) => void;
  onAlternarArquivoProjeto: (id: string) => void;
  onExcluirProjeto: (id: string) => void;
};

export function ListaProjetos({
  projetos,
  pdfs,
  selecionadoId,
  onSelecionarPdf,
  onRemoverPdf,
  onRenomearPdf,
  onAlternarArquivoPdf,
  onSetRepeticoesPdf,
  onAdicionarAoProjeto,
  onRenomearProjeto,
  onAlternarArquivoProjeto,
  onExcluirProjeto,
}: Props) {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const pdfsPorProjeto = useMemo(() => {
    const m = new Map<string, PdfFile[]>();
    for (const p of pdfs) {
      const arr = m.get(p.projetoId) ?? [];
      arr.push(p);
      m.set(p.projetoId, arr);
    }
    return m;
  }, [pdfs]);

  // Auto-expand do projeto da planta selecionada — só dispara quando a seleção
  // MUDA após o mount inicial (não na auto-seleção que o page.tsx faz no reload).
  // Assim, no reload, todas as pastas começam recolhidas; ao clicar manualmente
  // numa planta de outro projeto, a pasta dela abre.
  const ultimoSelecionadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (ultimoSelecionadoRef.current === selecionadoId) return;
    const previo = ultimoSelecionadoRef.current;
    ultimoSelecionadoRef.current = selecionadoId;
    if (previo === null) return; // primeira vez que vê uma seleção: não expande
    if (!selecionadoId) return;
    const pdf = pdfs.find((p) => p.id === selecionadoId);
    if (!pdf) return;
    setExpandidos((prev) => {
      if (prev.has(pdf.projetoId)) return prev;
      const novo = new Set(prev);
      novo.add(pdf.projetoId);
      return novo;
    });
  }, [selecionadoId, pdfs]);

  if (projetos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Nenhum projeto ainda. Arraste plantas em PDF na zona acima.
      </div>
    );
  }

  const ativos = projetos.filter((p) => !p.arquivado);
  const arquivados = projetos.filter((p) => p.arquivado);

  const toggle = (id: string) => {
    setExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {ativos.map((proj) => (
          <ProjetoBloco
            key={proj.id}
            projeto={proj}
            pdfs={(pdfsPorProjeto.get(proj.id) ?? []).sort(
              (a, b) => b.uploadedAt - a.uploadedAt,
            )}
            selecionadoId={selecionadoId}
            expandido={expandidos.has(proj.id)}
            onAlternarExpandir={() => toggle(proj.id)}
            onSelecionarPdf={onSelecionarPdf}
            onRemoverPdf={onRemoverPdf}
            onRenomearPdf={onRenomearPdf}
            onAlternarArquivoPdf={onAlternarArquivoPdf}
            onSetRepeticoesPdf={onSetRepeticoesPdf}
            onAdicionarArquivos={(arquivos) =>
              onAdicionarAoProjeto(proj.id, arquivos)
            }
            onRenomearProjeto={(nome) => onRenomearProjeto(proj.id, nome)}
            onAlternarArquivoProjeto={() => onAlternarArquivoProjeto(proj.id)}
            onExcluirProjeto={() => onExcluirProjeto(proj.id)}
          />
        ))}
      </div>
      {arquivados.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarArquivados((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <span>Arquivados ({arquivados.length})</span>
            <span className="text-zinc-400">
              {mostrarArquivados ? "▾" : "▸"}
            </span>
          </button>
          {mostrarArquivados && (
            <div className="mt-2 space-y-2">
              {arquivados.map((proj) => (
                <ProjetoBloco
                  key={proj.id}
                  projeto={proj}
                  pdfs={(pdfsPorProjeto.get(proj.id) ?? []).sort(
                    (a, b) => b.uploadedAt - a.uploadedAt,
                  )}
                  selecionadoId={selecionadoId}
                  expandido={expandidos.has(proj.id)}
                  onAlternarExpandir={() => toggle(proj.id)}
                  onSelecionarPdf={onSelecionarPdf}
                  onRemoverPdf={onRemoverPdf}
                  onRenomearPdf={onRenomearPdf}
                  onAlternarArquivoPdf={onAlternarArquivoPdf}
                  onSetRepeticoesPdf={onSetRepeticoesPdf}
                  onAdicionarArquivos={(arquivos) =>
                    onAdicionarAoProjeto(proj.id, arquivos)
                  }
                  onRenomearProjeto={(nome) =>
                    onRenomearProjeto(proj.id, nome)
                  }
                  onAlternarArquivoProjeto={() =>
                    onAlternarArquivoProjeto(proj.id)
                  }
                  onExcluirProjeto={() => onExcluirProjeto(proj.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

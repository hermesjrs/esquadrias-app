"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { baixarBlob, gerarPlanilha } from "@/lib/exportExcel";
import { calcularQuantitativo, labelPavimentoCompleto } from "@/lib/quantitativo";
import { PAVIMENTO_LABEL } from "@/lib/types";
import type { PdfFile, Projeto } from "@/lib/types";

type Props = {
  pdfs: PdfFile[];
  projeto?: Projeto | null;
};

const ROTULO_AVISO: Record<string, string> = {
  dim_variavel: "Dimensões divergentes",
  duplicada: "Plantas duplicadas",
  rasterizada: "Planta sem texto",
  vazia: "Planta sem códigos",
  sem_repeticao: "Repetições não detectadas — ajustar manual",
  tag_duplicada: "Tag possivelmente duplicada",
  codigo_faltando: "Código faltando em uma planta",
  familia_desconhecida: "Família não cadastrada (revisar)",
};

export function PainelQuantitativo({ pdfs, projeto }: Props) {
  const q = useMemo(() => calcularQuantitativo(pdfs), [pdfs]);
  const [baixando, setBaixando] = useState(false);
  const [erroExport, setErroExport] = useState<string | null>(null);
  const [mostrarAvisos, setMostrarAvisos] = useState(false);

  const elegiveis = pdfs.filter((p) => p.status === "ok").length;

  const baixar = async () => {
    setBaixando(true);
    setErroExport(null);
    try {
      const blob = await gerarPlanilha(q);
      const sufixo = projeto ? ` - ${projeto.nome}` : "";
      const nome = `Quantitativo Esquadrias${sufixo} - ${new Date().toISOString().slice(0, 10)}.xlsx`;
      baixarBlob(blob, nome);
    } catch (e) {
      setErroExport(e instanceof Error ? e.message : "Falha ao gerar planilha");
    } finally {
      setBaixando(false);
    }
  };

  if (elegiveis === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        Carregue plantas para gerar o quantitativo.
      </div>
    );
  }

  if (q.linhas.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500">
        Nenhuma esquadria identificada nas plantas carregadas.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {projeto ? projeto.nome : "Quantitativo total"}
        </h3>
        <p className="text-xs text-zinc-500">
          {q.totalEsquadrias} esquadrias · {q.linhas.length} linhas ·{" "}
          {q.pavimentosPresentes.length} pavimentos
        </p>
        {q.avisos.length > 0 && (
          <button
            type="button"
            onClick={() => setMostrarAvisos((v) => !v)}
            className="mt-2 flex w-full cursor-pointer items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {q.avisos.length} aviso{q.avisos.length === 1 ? "" : "s"}
            <span className="ml-auto">{mostrarAvisos ? "▾" : "▸"}</span>
          </button>
        )}
        {mostrarAvisos && q.avisos.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {q.avisos.map((a, i) => (
              <li
                key={i}
                className="rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <p className="font-semibold">
                  {ROTULO_AVISO[a.tipo] ?? a.tipo}
                  {a.codigo && ` · ${a.codigo}`}
                  {a.pavimento && ` · ${a.pavimentoLabel ?? PAVIMENTO_LABEL[a.pavimento]}`}
                </p>
                <p className="mt-0.5 text-[10px]">{a.descricao}</p>
                {a.pdfNome && (
                  <p className="mt-0.5 text-[10px] italic text-amber-700/80">
                    {a.pdfNome}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={baixar}
          disabled={baixando}
          className="mt-3 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {baixando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {baixando ? "Gerando…" : "Baixar planilha (.xlsx)"}
        </button>
        {erroExport && (
          <p className="mt-2 text-xs text-red-600">{erroExport}</p>
        )}
      </div>

      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Por material
        </h4>
        <ul className="space-y-1.5 text-sm">
          {q.resumoPorMaterial.map((r) => (
            <li key={r.material} className="flex justify-between gap-2">
              <span className="text-zinc-700 dark:text-zinc-300">
                {r.material}
              </span>
              <span className="tabular-nums text-zinc-500">
                {r.totalEsquadrias}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto">
        <h4 className="sticky top-0 bg-white px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-950">
          Catálogo (código × pavimento)
        </h4>
        <ul>
          {q.linhas.map((l, i) => {
            const ossoStr = l.osso
              ? `${l.osso.largura}×${l.osso.altura}${l.osso.peitoril !== undefined ? `/${l.osso.peitoril}` : ""}`
              : "";
            const luzStr = l.luz
              ? `${l.luz.largura}×${l.luz.altura}${l.luz.peitoril !== undefined ? `/${l.luz.peitoril}` : ""}`
              : "";
            const localStr = l.locais.join(" / ");
            return (
              <li
                key={`${l.code}-${l.pavimento}-${i}`}
                className="border-b border-zinc-100 px-4 py-1.5 text-sm dark:border-zinc-900"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {l.code}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {labelPavimentoCompleto(l.pavimento, l.rangeTipo)}
                  </span>
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {l.total}
                  </span>
                </div>
                {(ossoStr || luzStr || localStr) && (
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0 text-[10px] text-zinc-500">
                    {localStr && <span>📍 {localStr}</span>}
                    {ossoStr && <span>VO {ossoStr}</span>}
                    {luzStr && <span>VL {luzStr}</span>}
                    {l.repeticoes > 1 && (
                      <span>
                        ({l.totalPav} × {l.repeticoes})
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

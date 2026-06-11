"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import type { PdfFile } from "@/lib/types";
import { PAVIMENTO_LABEL, PAVIMENTO_REPETICOES } from "@/lib/types";

/**
 * Detecta se a planta é de pavimento TIPO (qualquer variante). Captura:
 *  - código exato "TP"
 *  - "TP1", "TP2", "TP3"... (Moinhos e outros com múltiplos tipos)
 *  - label literal contendo "tipo" (ex: "Pavimento Tipo", "Tipo 5º a 17º Pav")
 */
function ehPavimentoTipo(pdf: PdfFile): boolean {
  if (/^TP\d*$/i.test(pdf.pavimento)) return true;
  const label = pdf.pavimentoLabel ?? "";
  return /\btipo\b/i.test(label);
}

function repeticoesEfetivas(pdf: PdfFile): {
  valor: number;
  origem: "manual" | "detectada" | "default";
  alerta: boolean;
} {
  if (pdf.repeticoesManual != null && pdf.repeticoesManual > 0) {
    return { valor: pdf.repeticoesManual, origem: "manual", alerta: false };
  }
  if (pdf.repeticoesDetectadas != null && pdf.repeticoesDetectadas > 0) {
    return {
      valor: pdf.repeticoesDetectadas,
      origem: "detectada",
      alerta: false,
    };
  }
  const fallback = PAVIMENTO_REPETICOES[pdf.pavimento];
  return { valor: fallback, origem: "default", alerta: ehPavimentoTipo(pdf) };
}

function formatarTamanho(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function StatusIcon({ pdf }: { pdf: PdfFile }) {
  if (pdf.status === "processando") {
    return <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-hidden />;
  }
  if (pdf.status === "ok") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
  }
  if (pdf.status === "erro") {
    return <AlertCircle className="h-4 w-4 text-red-500" aria-hidden />;
  }
  return null;
}

type Props = {
  pdf: PdfFile;
  selecionado: boolean;
  onSelecionar: () => void;
  onRemover: () => void;
  onRenomear: (nome: string) => void;
  onAlternarArquivo: () => void;
  onSetRepeticoes: (rep: number | null) => void;
};

export function ItemPdf({
  pdf,
  selecionado,
  onSelecionar,
  onRemover,
  onRenomear,
  onAlternarArquivo,
  onSetRepeticoes,
}: Props) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(pdf.nomeCustom ?? "");
  const [editandoRep, setEditandoRep] = useState(false);
  const [valorRep, setValorRep] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const repInputRef = useRef<HTMLInputElement>(null);

  const rep = repeticoesEfetivas(pdf);

  useEffect(() => {
    if (editando) {
      setValor(pdf.nomeCustom ?? "");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editando, pdf.nomeCustom]);

  useEffect(() => {
    if (editandoRep) {
      setValorRep(String(rep.valor));
      repInputRef.current?.focus();
      repInputRef.current?.select();
    }
  }, [editandoRep, rep.valor]);

  const totalTags = pdf.tags?.length ?? 0;
  const nomeExibido = pdf.nomeCustom || pdf.filename;

  return (
    <div
      className={clsx(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors",
        pdf.arquivado && "opacity-60",
        selecionado
          ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40"
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
      )}
    >
      <button
        type="button"
        onClick={() => !editando && onSelecionar()}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-left"
      >
        <FileText
          className={clsx(
            "mt-0.5 h-5 w-5 shrink-0",
            selecionado ? "text-blue-600" : "text-zinc-500",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          {editando ? (
            <input
              ref={inputRef}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenomear(valor);
                  setEditando(false);
                } else if (e.key === "Escape") {
                  setEditando(false);
                }
              }}
              onBlur={() => {
                onRenomear(valor);
                setEditando(false);
              }}
              placeholder={pdf.filename}
              className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          ) : (
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {nomeExibido}
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
            <StatusIcon pdf={pdf} />
            <span>
              {pdf.pavimentoLabel ?? PAVIMENTO_LABEL[pdf.pavimento]}
              {pdf.torre !== "DESCONHECIDA" && ` · Torre ${pdf.torre}`}
            </span>
            {pdf.status === "ok" && totalTags > 0 && (
              <span className="text-emerald-600">· {totalTags} esquadrias</span>
            )}
            {pdf.status === "ok" && pdf.semTextoExtraivel && (
              <span className="text-amber-600">· sem texto</span>
            )}
            {pdf.status === "erro" && (
              <span className="text-red-600">· erro</span>
            )}
            {pdf.arquivado && (
              <span className="rounded bg-zinc-200 px-1 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                arquivada
              </span>
            )}
            <span className="ml-auto text-zinc-400">
              {formatarTamanho(pdf.size)}
            </span>
          </p>
          {(rep.valor > 1 ||
            rep.origem === "manual" ||
            rep.alerta ||
            ehPavimentoTipo(pdf)) && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              {editandoRep ? (
                <input
                  ref={repInputRef}
                  type="number"
                  min="1"
                  max="999"
                  value={valorRep}
                  onChange={(e) => setValorRep(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      const n = parseInt(valorRep, 10);
                      onSetRepeticoes(Number.isFinite(n) && n > 0 ? n : null);
                      setEditandoRep(false);
                    } else if (e.key === "Escape") {
                      setEditandoRep(false);
                    }
                  }}
                  onBlur={() => {
                    const n = parseInt(valorRep, 10);
                    onSetRepeticoes(Number.isFinite(n) && n > 0 ? n : null);
                    setEditandoRep(false);
                  }}
                  className="w-12 rounded border border-zinc-300 bg-white px-1 text-[10px] dark:border-zinc-600 dark:bg-zinc-900"
                />
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditandoRep(true);
                  }}
                  className={clsx(
                    "inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5",
                    rep.origem === "manual"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                      : rep.alerta
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                  )}
                  title={
                    rep.origem === "manual"
                      ? "Repetição ajustada manualmente — clique pra editar"
                      : rep.alerta
                      ? "Não consegui detectar do selo — confirma ou ajusta"
                      : "Clique pra ajustar manualmente se precisar"
                  }
                >
                  <Repeat className="h-3 w-3" />× {rep.valor}
                  {rep.alerta && " ⚠"}
                </button>
              )}
              {pdf.repeticoesManual != null && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetRepeticoes(null);
                  }}
                  className="cursor-pointer rounded px-1 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                  title="Voltar pra detecção automática"
                >
                  ↺
                </button>
              )}
            </div>
          )}
        </div>
      </button>
      <div className="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditando(true);
          }}
          className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Renomear"
          title="Renomear"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAlternarArquivo();
          }}
          className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label={pdf.arquivado ? "Desarquivar" : "Arquivar"}
          title={pdf.arquivado ? "Desarquivar" : "Arquivar"}
        >
          {pdf.arquivado ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Excluir ${nomeExibido}?`)) onRemover();
          }}
          className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          aria-label="Excluir"
          title="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

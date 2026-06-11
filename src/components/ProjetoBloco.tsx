"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Folder,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { ItemPdf } from "./ItemPdf";
import type { PdfFile, Projeto } from "@/lib/types";

type Props = {
  projeto: Projeto;
  pdfs: PdfFile[];
  selecionadoId: string | null;
  expandido: boolean;
  onAlternarExpandir: () => void;
  onSelecionarPdf: (id: string) => void;
  onRemoverPdf: (id: string) => void;
  onRenomearPdf: (id: string, nome: string) => void;
  onAlternarArquivoPdf: (id: string) => void;
  onSetRepeticoesPdf: (id: string, rep: number | null) => void;
  onAdicionarArquivos: (arquivos: File[]) => void;
  onRenomearProjeto: (nome: string) => void;
  onAlternarArquivoProjeto: () => void;
  onExcluirProjeto: () => void;
};

export function ProjetoBloco({
  projeto,
  pdfs,
  selecionadoId,
  expandido,
  onAlternarExpandir,
  onSelecionarPdf,
  onRemoverPdf,
  onRenomearPdf,
  onAlternarArquivoPdf,
  onSetRepeticoesPdf,
  onAdicionarArquivos,
  onRenomearProjeto,
  onAlternarArquivoProjeto,
  onExcluirProjeto,
}: Props) {
  const [editando, setEditando] = useState(false);
  const [nomeTmp, setNomeTmp] = useState(projeto.nome);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) {
      setNomeTmp(projeto.nome);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editando, projeto.nome]);

  const ativas = pdfs.filter((p) => !p.arquivado);
  const totalEsquadrias = ativas.reduce(
    (s, p) => s + (p.tags?.length ?? 0),
    0,
  );

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) onAdicionarArquivos(files);
    e.target.value = "";
  };

  return (
    <div
      className={clsx(
        "rounded-lg border bg-white dark:bg-zinc-950",
        projeto.arquivado
          ? "border-zinc-200 opacity-60 dark:border-zinc-800"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onAlternarExpandir}
          className="cursor-pointer rounded p-0.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={expandido ? "Recolher" : "Expandir"}
        >
          {expandido ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <Folder className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="min-w-0 flex-1">
          {editando ? (
            <input
              ref={inputRef}
              value={nomeTmp}
              onChange={(e) => setNomeTmp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onRenomearProjeto(nomeTmp);
                  setEditando(false);
                } else if (e.key === "Escape") {
                  setEditando(false);
                }
              }}
              onBlur={() => {
                onRenomearProjeto(nomeTmp);
                setEditando(false);
              }}
              className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-sm font-semibold dark:border-zinc-600 dark:bg-zinc-900"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {projeto.nome}
            </p>
          )}
          <p className="text-[11px] text-zinc-500">
            {ativas.length} planta{ativas.length === 1 ? "" : "s"}
            {totalEsquadrias > 0 && ` · ${totalEsquadrias} esquadrias`}
            {projeto.arquivado && " · arquivado"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Adicionar plantas"
            title="Adicionar plantas"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Renomear projeto"
            title="Renomear projeto"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onAlternarArquivoProjeto}
            className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label={projeto.arquivado ? "Desarquivar projeto" : "Arquivar projeto"}
            title={projeto.arquivado ? "Desarquivar projeto" : "Arquivar projeto"}
          >
            {projeto.arquivado ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Excluir o projeto "${projeto.nome}" e todas as ${pdfs.length} plantas dele?`,
                )
              ) {
                onExcluirProjeto();
              }
            }}
            className="cursor-pointer rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            aria-label="Excluir projeto"
            title="Excluir projeto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={onPickFiles}
          className="hidden"
        />
      </div>

      {expandido && pdfs.length > 0 && (
        <ul className="space-y-1.5 border-t border-zinc-100 px-2 py-2 dark:border-zinc-800">
          {pdfs.map((pdf) => (
            <li key={pdf.id}>
              <ItemPdf
                pdf={pdf}
                selecionado={pdf.id === selecionadoId}
                onSelecionar={() => onSelecionarPdf(pdf.id)}
                onRemover={() => onRemoverPdf(pdf.id)}
                onRenomear={(nome) => onRenomearPdf(pdf.id, nome)}
                onAlternarArquivo={() => onAlternarArquivoPdf(pdf.id)}
                onSetRepeticoes={(r) => onSetRepeticoesPdf(pdf.id, r)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

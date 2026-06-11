"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import clsx from "clsx";

type Props = {
  onArquivos: (files: File[]) => unknown;
};

export function PdfDropzone({ onArquivos }: Props) {
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setArrastando(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) =>
          f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (files.length > 0) onArquivos(files);
    },
    [onArquivos],
  );

  const onPickFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) onArquivos(files);
      e.target.value = "";
    },
    [onArquivos],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-12 transition-colors",
        arrastando
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500",
      )}
    >
      <UploadCloud className="h-10 w-10 text-zinc-500" aria-hidden />
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Arraste plantas em PDF aqui
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          ou clique para selecionar arquivos
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={onPickFiles}
        className="hidden"
      />
    </div>
  );
}

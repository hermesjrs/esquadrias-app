"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { carregarPdf } from "@/lib/pdf";
import type { PDFDocumentProxy } from "@/lib/pdf";
import type { TagExtraida } from "@/lib/types";
import clsx from "clsx";

type Props = {
  blob: Blob;
  tags?: TagExtraida[];
  codigoDestacado?: string | null;
  focado?: { code: string; index: number } | null;
};

type ViewportState = {
  scale: number;
  width: number;
  height: number;
};

type RenderTaskLike = { cancel: () => void; promise: Promise<void> };

export function PdfViewer({ blob, tags, codigoDestacado, focado }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTaskLike | null>(null);
  const arrastoRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(1);
  const [escala, setEscala] = useState<number | "fit">("fit");
  const [vp, setVp] = useState<ViewportState | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [arrastando, setArrastando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    setPagina(1);
    setDoc(null);
    setVp(null);

    carregarPdf(blob)
      .then((d) => {
        if (cancelado) return;
        setDoc(d);
        setCarregando(false);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        setErro(e instanceof Error ? e.message : "Erro ao carregar PDF");
        setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [blob]);

  useEffect(() => {
    if (!doc || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    let cancelado = false;

    (async () => {
      const prev = renderTaskRef.current;
      if (prev) {
        prev.cancel();
        try {
          await prev.promise;
        } catch {
          // expected
        }
      }
      if (cancelado) return;

      const page = await doc.getPage(pagina);
      if (cancelado) return;

      const baseViewport = page.getViewport({ scale: 1 });
      let scale: number;
      if (escala === "fit") {
        const padding = 32;
        scale = (container.clientWidth - padding) / baseViewport.width;
      } else {
        scale = escala;
      }

      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      if (cancelado) return;

      const task = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTaskRef.current = task;

      try {
        await task.promise;
        if (cancelado) return;
        setVp({
          scale,
          width: viewport.width,
          height: viewport.height,
        });
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "name" in e &&
          e.name === "RenderingCancelledException"
        ) {
          return;
        }
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : "Erro ao renderizar página");
        }
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      }
    })();

    return () => {
      cancelado = true;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [doc, pagina, escala]);

  useEffect(() => {
    if (!doc) return;
    const onResize = () => {
      if (escala === "fit") setEscala((e) => (e === "fit" ? "fit" : e));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [doc, escala]);

  const destaques = useMemo(() => {
    if (!vp || !tags || !codigoDestacado) return [];
    return tags
      .filter((t) => t.code === codigoDestacado && t.pageIndex === pagina)
      .map((t, i) => ({ ...t, _idx: i }));
  }, [vp, tags, codigoDestacado, pagina]);

  const tagFocada = useMemo(() => {
    if (!vp || !tags || !focado) return null;
    const sub = tags.filter(
      (t) => t.code === focado.code && t.pageIndex === pagina,
    );
    if (sub.length === 0) return null;
    const idx = ((focado.index % sub.length) + sub.length) % sub.length;
    return { tag: sub[idx], total: sub.length, idx };
  }, [vp, tags, focado, pagina]);

  useEffect(() => {
    if (!tagFocada || !vp || !containerRef.current) return;
    const t = tagFocada.tag;
    const cx = t.normalizado
      ? t.x * vp.width
      : (t.x + t.width / 2) * vp.scale;
    const cy = t.normalizado
      ? t.y * vp.height
      : (t.y - t.height / 2) * vp.scale;
    const c = containerRef.current;
    c.scrollTo({
      left: cx - c.clientWidth / 2,
      top: cy - c.clientHeight / 2,
      behavior: "smooth",
    });
  }, [tagFocada, vp]);

  // Ctrl+wheel zoom (registrado direto com passive:false)
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setEscala((cur) => {
        const curN = cur === "fit" ? vp?.scale ?? 1 : cur;
        return Math.max(0.25, Math.min(6, curN * fator));
      });
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [vp?.scale]);

  // Pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // ignora cliques em controles
    if (target.closest("button") || target.closest("input")) return;
    if (!containerRef.current) return;
    arrastoRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    };
    setArrastando(true);
  };

  useEffect(() => {
    if (!arrastando) return;
    const onMove = (e: MouseEvent) => {
      if (!arrastoRef.current || !containerRef.current) return;
      const dx = e.clientX - arrastoRef.current.startX;
      const dy = e.clientY - arrastoRef.current.startY;
      containerRef.current.scrollLeft = arrastoRef.current.scrollLeft - dx;
      containerRef.current.scrollTop = arrastoRef.current.scrollTop - dy;
    };
    const onUp = () => {
      arrastoRef.current = null;
      setArrastando(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [arrastando]);

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando planta…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-red-600">
        Não foi possível abrir o PDF: {erro}
      </div>
    );
  }

  if (!doc) return null;

  const podeAnterior = pagina > 1;
  const podeProxima = pagina < doc.numPages;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        {doc.numPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!podeAnterior}
              onClick={() => setPagina((p) => p - 1)}
              className="cursor-pointer rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ◀
            </button>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {pagina} / {doc.numPages}
            </span>
            <button
              type="button"
              disabled={!podeProxima}
              onClick={() => setPagina((p) => p + 1)}
              className="cursor-pointer rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ▶
            </button>
          </div>
        )}
        <span className="ml-2 text-xs text-zinc-400">
          Arraste pra mover · Ctrl + scroll pra zoom
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setEscala((e) => (e === "fit" ? 0.75 : Math.max(0.25, e - 0.25)))
            }
            className="cursor-pointer rounded-md p-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEscala("fit")}
            className="cursor-pointer rounded-md p-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Ajustar à largura"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setEscala((e) => (e === "fit" ? 1.5 : Math.min(4, e + 0.25)))
            }
            className="cursor-pointer rounded-md p-1.5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <span className="ml-2 text-xs text-zinc-500 tabular-nums">
            {escala === "fit" ? "Ajuste" : `${Math.round(escala * 100)}%`}
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        className={clsx(
          "flex-1 overflow-auto bg-zinc-100 p-4 dark:bg-zinc-950",
          arrastando ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ userSelect: arrastando ? "none" : "auto" }}
      >
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            className="block bg-white shadow-md"
            draggable={false}
          />
          {vp && destaques.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0"
              width={vp.width}
              height={vp.height}
              viewBox={`0 0 ${vp.width} ${vp.height}`}
            >
              {destaques.map((t) => {
                // Se normalizado, multiplica pelas dimensões reais do viewport renderizado
                const baseW = t.normalizado ? vp.width / vp.scale : 1;
                const baseH = t.normalizado ? vp.height / vp.scale : 1;
                const w = Math.max(t.width * baseW * vp.scale, 14);
                const h = Math.max(t.height * baseH * vp.scale, 10);
                const x = t.normalizado
                  ? t.x * vp.width
                  : t.x * vp.scale + (t.width * vp.scale) / 2;
                const y = t.normalizado
                  ? t.y * vp.height
                  : (t.y - t.height / 2) * vp.scale;
                const r = Math.max(w, h) * 0.9;
                const ehFocada =
                  tagFocada && t.x === tagFocada.tag.x && t.y === tagFocada.tag.y;
                if (ehFocada) {
                  return (
                    <g key={t._idx}>
                      <circle
                        cx={x}
                        cy={y}
                        r={r * 1.8}
                        fill="rgba(250, 204, 21, 0.20)"
                        stroke="rgb(234, 88, 12)"
                        strokeWidth={2}
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={r * 0.45}
                        fill="rgba(234, 88, 12, 0.85)"
                      />
                    </g>
                  );
                }
                return (
                  <circle
                    key={t._idx}
                    cx={x}
                    cy={y}
                    r={r}
                    fill="rgba(251, 191, 36, 0.20)"
                    stroke="rgb(245, 158, 11)"
                    strokeWidth={1}
                  />
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

let configured = false;
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist");
  }
  const lib = await pdfjsPromise;
  if (!configured) {
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    configured = true;
  }
  return lib;
}

export async function configurarPdfWorker() {
  await getPdfjs();
}

export async function carregarPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const lib = await getPdfjs();
  const buffer = await blob.arrayBuffer();
  return lib.getDocument({ data: buffer }).promise;
}

export type { PDFDocumentProxy };

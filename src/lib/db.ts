import { createStore, del, get, keys, set } from "idb-keyval";
import type { PdfFile, Projeto } from "./types";

const metaStore = createStore("esquadrias-meta", "pdf-meta");
const blobStore = createStore("esquadrias-blob", "pdf-blob");
const projetosStore = createStore("esquadrias-projetos", "projetos");

export async function salvarPdf(meta: PdfFile, blob: Blob): Promise<void> {
  await set(meta.id, meta, metaStore);
  await set(meta.id, blob, blobStore);
}

export async function listarPdfs(): Promise<PdfFile[]> {
  const ks = await keys(metaStore);
  const items = await Promise.all(
    ks.map((k) => get<PdfFile>(k as string, metaStore)),
  );
  return items
    .filter((x): x is PdfFile => x !== undefined)
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function obterPdfBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, blobStore);
}

export async function obterPdfMeta(id: string): Promise<PdfFile | undefined> {
  return get<PdfFile>(id, metaStore);
}

export async function removerPdf(id: string): Promise<void> {
  await del(id, metaStore);
  await del(id, blobStore);
}

export async function atualizarPdfMeta(meta: PdfFile): Promise<void> {
  await set(meta.id, meta, metaStore);
}

export async function listarProjetos(): Promise<Projeto[]> {
  const ks = await keys(projetosStore);
  const items = await Promise.all(
    ks.map((k) => get<Projeto>(k as string, projetosStore)),
  );
  return items
    .filter((x): x is Projeto => x !== undefined)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function salvarProjeto(p: Projeto): Promise<void> {
  await set(p.id, p, projetosStore);
}

export async function removerProjeto(id: string): Promise<void> {
  await del(id, projetosStore);
}

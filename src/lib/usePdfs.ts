"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  atualizarPdfMeta,
  listarPdfs,
  listarProjetos,
  obterPdfBlob,
  removerPdf,
  removerProjeto,
  salvarPdf,
  salvarProjeto,
} from "./db";
import { extrairTagsViaClaude } from "./claudeVision";
import type { ClaudeProgresso, ModeloClaude } from "./claudeVision";
import { extrairTags } from "./extracao";
import { extrairTagsViaOcr } from "./ocr";
import type { OcrProgresso } from "./ocr";
import {
  ehPlantaIgnoravel,
  inferirPavimentoDoFilename,
  inferirTorreDoFilename,
} from "./inferencia";
import type { PdfFile, Projeto } from "./types";
import { VERSAO_EXTRACAO } from "./types";

function gerarId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function processar(meta: PdfFile, blob: Blob): Promise<PdfFile> {
  try {
    const res = await extrairTags(blob);
    // Prioridade: SELO (texto extraído do PDF) > filename. O selo é a fonte
    // oficial e mais confiável; o filename é só fallback quando o selo não
    // identificou nada (PDF sem padrão de prancha, anotação solta, etc).
    const pavimentoFinal =
      res.pavimentoInferidoDoTexto !== "DESCONHECIDO"
        ? res.pavimentoInferidoDoTexto
        : inferirPavimentoDoFilename(meta.filename);
    const torreFinal =
      res.torreInferidoDoTexto !== "DESCONHECIDA"
        ? res.torreInferidoDoTexto
        : inferirTorreDoFilename(meta.filename);
    return {
      ...meta,
      pavimento: pavimentoFinal,
      torre: torreFinal,
      // Label literal do selo deste PDF — preserva nomenclatura do projeto
      pavimentoLabel: res.pavimentoLabelInferidoDoTexto,
      status: "ok",
      tags: res.tags,
      paginas: res.paginas,
      tituloPrancha: res.tituloPrancha,
      repeticoesDetectadas: res.repeticoesDetectadas,
      rangeTipoDetectado: res.rangeTipoDetectado,
      repeticaoTipoDuvidosa: res.repeticaoTipoDuvidosa,
      repeticoesTrecho: res.repeticoesTrecho,
      semTextoExtraivel: res.semTextoExtraivel,
      duplicadasSuspeitas: res.duplicadasSuspeitas,
      familiasDesconhecidas: res.familiasDesconhecidasDetectadas,
      versaoExtracao: VERSAO_EXTRACAO,
    };
  } catch (e) {
    return {
      ...meta,
      status: "erro",
      erro: e instanceof Error ? e.message : "Falha na extração",
      versaoExtracao: VERSAO_EXTRACAO,
    };
  }
}

function inferirNomeProjeto(filenames: string[]): string {
  if (filenames.length === 0) return "Projeto";
  // Tenta extrair um prefixo comum
  const primeiro = filenames[0].replace(/\.pdf$/i, "");
  // Quebra por -, _ ou espaço e pega os 2-3 primeiros tokens
  const partes = primeiro.split(/[-_\s]/).filter((s) => s.length > 0);
  if (partes.length >= 3) {
    return partes.slice(0, 3).join("-");
  }
  return partes.join("-") || primeiro.slice(0, 40);
}

export function usePdfs() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocrEmAndamento, setOcrEmAndamento] = useState<
    Record<string, OcrProgresso>
  >({});
  const [claudeEmAndamento, setClaudeEmAndamento] = useState<
    Record<string, ClaudeProgresso>
  >({});
  const migrandoRef = useRef(false);

  const recarregar = useCallback(async () => {
    const [projs, items] = await Promise.all([listarProjetos(), listarPdfs()]);

    // Migração: PDFs antigos sem projetoId precisam de um projeto "Projeto antigo"
    const semProjeto = items.filter((p) => !p.projetoId);
    if (semProjeto.length > 0) {
      let projetoAntigo = projs.find((p) => p.nome === "Projeto importado");
      if (!projetoAntigo) {
        projetoAntigo = {
          id: gerarId(),
          nome: "Projeto importado",
          createdAt: Date.now() - 1000000,
        };
        await salvarProjeto(projetoAntigo);
        projs.unshift(projetoAntigo);
      }
      for (const p of semProjeto) {
        const atualizado = { ...p, projetoId: projetoAntigo.id };
        await atualizarPdfMeta(atualizado);
        const idx = items.indexOf(p);
        items[idx] = atualizado;
      }
    }

    setProjetos(projs);
    setPdfs(items);
    setCarregando(false);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Auto-migration: re-extrair PDFs com versão antiga
  useEffect(() => {
    if (migrandoRef.current) return;
    const desatualizados = pdfs.filter(
      (p) =>
        p.status === "ok" && (p.versaoExtracao ?? 0) < VERSAO_EXTRACAO,
    );
    if (desatualizados.length === 0) return;
    migrandoRef.current = true;
    (async () => {
      for (const p of desatualizados) {
        const blob = await obterPdfBlob(p.id);
        if (!blob) continue;
        const processando = { ...p, status: "processando" as const };
        await atualizarPdfMeta(processando);
        await recarregar();
        const final = await processar(processando, blob);
        await atualizarPdfMeta(final);
        await recarregar();
      }
      migrandoRef.current = false;
    })();
  }, [pdfs, recarregar]);

  const criarProjeto = useCallback(
    async (nome: string): Promise<Projeto> => {
      const p: Projeto = {
        id: gerarId(),
        nome,
        createdAt: Date.now(),
      };
      await salvarProjeto(p);
      await recarregar();
      return p;
    },
    [recarregar],
  );

  const renomearProjeto = useCallback(
    async (id: string, nome: string) => {
      const atual = projetos.find((p) => p.id === id);
      if (!atual) return;
      const trim = nome.trim();
      await salvarProjeto({ ...atual, nome: trim || atual.nome });
      await recarregar();
    },
    [projetos, recarregar],
  );

  const alternarArquivadoProjeto = useCallback(
    async (id: string) => {
      const atual = projetos.find((p) => p.id === id);
      if (!atual) return;
      await salvarProjeto({ ...atual, arquivado: !atual.arquivado });
      await recarregar();
    },
    [projetos, recarregar],
  );

  const excluirProjeto = useCallback(
    async (id: string) => {
      // Remove todos os PDFs do projeto
      const doProjeto = pdfs.filter((p) => p.projetoId === id);
      for (const pdf of doProjeto) {
        await removerPdf(pdf.id);
      }
      await removerProjeto(id);
      await recarregar();
    },
    [pdfs, recarregar],
  );

  const adicionarAoProjeto = useCallback(
    async (projetoId: string, arquivos: File[]) => {
      const pendentes: Array<{ meta: PdfFile; blob: Blob }> = [];
      for (const file of arquivos) {
        if (
          file.type !== "application/pdf" &&
          !file.name.toLowerCase().endsWith(".pdf")
        ) {
          continue;
        }
        const meta: PdfFile = {
          id: gerarId(),
          projetoId,
          filename: file.name,
          size: file.size,
          uploadedAt: Date.now(),
          pavimento: inferirPavimentoDoFilename(file.name),
          torre: inferirTorreDoFilename(file.name),
          status: "processando",
          // Plantas de Implantação/Situação são arquivadas automaticamente
          // (não têm esquadrias contadas).
          arquivado: ehPlantaIgnoravel(file.name) || undefined,
        };
        await salvarPdf(meta, file);
        pendentes.push({ meta, blob: file });
      }
      await recarregar();

      for (const { meta, blob } of pendentes) {
        const final = await processar(meta, blob);
        await atualizarPdfMeta(final);
        await recarregar();
      }
    },
    [recarregar],
  );

  /** Cria um novo projeto e adiciona os arquivos nele. */
  const adicionarComoNovoProjeto = useCallback(
    async (arquivos: File[]) => {
      const validos = arquivos.filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf"),
      );
      if (validos.length === 0) return null;
      const nomeProj = inferirNomeProjeto(validos.map((f) => f.name));
      const projeto = await criarProjeto(nomeProj);
      await adicionarAoProjeto(projeto.id, validos);
      return projeto;
    },
    [criarProjeto, adicionarAoProjeto],
  );

  const remover = useCallback(
    async (id: string) => {
      await removerPdf(id);
      await recarregar();
    },
    [recarregar],
  );

  const renomear = useCallback(
    async (id: string, nome: string) => {
      const atual = pdfs.find((p) => p.id === id);
      if (!atual) return;
      const trim = nome.trim();
      const final: PdfFile = {
        ...atual,
        nomeCustom: trim.length === 0 ? null : trim,
      };
      await atualizarPdfMeta(final);
      await recarregar();
    },
    [pdfs, recarregar],
  );

  const alternarArquivado = useCallback(
    async (id: string) => {
      const atual = pdfs.find((p) => p.id === id);
      if (!atual) return;
      await atualizarPdfMeta({ ...atual, arquivado: !atual.arquivado });
      await recarregar();
    },
    [pdfs, recarregar],
  );

  const rodarOcr = useCallback(
    async (id: string) => {
      const blob = await obterPdfBlob(id);
      const atual = pdfs.find((p) => p.id === id);
      if (!blob || !atual) return;
      try {
        const res = await extrairTagsViaOcr(blob, (p) => {
          setOcrEmAndamento((prev) => ({ ...prev, [id]: p }));
        });
        const final: PdfFile = {
          ...atual,
          status: "ok",
          tags: res.tags,
          paginas: res.paginas,
          tituloPrancha: res.tituloPrancha,
          repeticoesDetectadas: res.repeticoesDetectadas,
          repeticaoTipoDuvidosa: res.repeticaoTipoDuvidosa,
          repeticoesTrecho: res.repeticoesTrecho,
          semTextoExtraivel: false,
          versaoExtracao: VERSAO_EXTRACAO,
        };
        await atualizarPdfMeta(final);
      } catch (e) {
        const final: PdfFile = {
          ...atual,
          erro: e instanceof Error ? e.message : "OCR falhou",
        };
        await atualizarPdfMeta(final);
      } finally {
        setOcrEmAndamento((prev) => {
          const novo = { ...prev };
          delete novo[id];
          return novo;
        });
        await recarregar();
      }
    },
    [pdfs, recarregar],
  );

  const rodarClaude = useCallback(
    async (id: string, apiKey: string, modelo: ModeloClaude) => {
      const blob = await obterPdfBlob(id);
      const atual = pdfs.find((p) => p.id === id);
      if (!blob || !atual) return;
      try {
        const res = await extrairTagsViaClaude(blob, apiKey, modelo, (p) => {
          setClaudeEmAndamento((prev) => ({ ...prev, [id]: p }));
        });
        const final: PdfFile = {
          ...atual,
          status: "ok",
          tags: res.tags,
          paginas: res.paginas,
          tituloPrancha: res.tituloPrancha,
          repeticoesDetectadas: res.repeticoesDetectadas,
          repeticaoTipoDuvidosa: res.repeticaoTipoDuvidosa,
          repeticoesTrecho: res.repeticoesTrecho,
          semTextoExtraivel: false,
          claudeDebug: res.debug ?? null,
          versaoExtracao: VERSAO_EXTRACAO,
        };
        await atualizarPdfMeta(final);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Claude falhou";
        setClaudeEmAndamento((prev) => ({
          ...prev,
          [id]: { fase: "erro", detalhe: msg },
        }));
        const final: PdfFile = { ...atual, erro: msg };
        await atualizarPdfMeta(final);
      } finally {
        setTimeout(() => {
          setClaudeEmAndamento((prev) => {
            const novo = { ...prev };
            delete novo[id];
            return novo;
          });
        }, 4000);
        await recarregar();
      }
    },
    [pdfs, recarregar],
  );

  const setRepeticoes = useCallback(
    async (id: string, repeticoes: number | null) => {
      const atual = pdfs.find((p) => p.id === id);
      if (!atual) return;
      const final: PdfFile = {
        ...atual,
        repeticoesManual:
          repeticoes !== null && Number.isFinite(repeticoes) && repeticoes > 0
            ? Math.round(repeticoes)
            : null,
      };
      await atualizarPdfMeta(final);
      await recarregar();
    },
    [pdfs, recarregar],
  );

  return {
    projetos,
    pdfs,
    carregando,
    ocrEmAndamento,
    adicionarComoNovoProjeto,
    adicionarAoProjeto,
    criarProjeto,
    renomearProjeto,
    excluirProjeto,
    alternarArquivadoProjeto,
    remover,
    renomear,
    alternarArquivado,
    setRepeticoes,
    rodarOcr,
    rodarClaude,
    claudeEmAndamento,
    obterPdfBlob,
  };
}

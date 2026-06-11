"use client";

import ExcelJS from "exceljs";
import { labelPavimentoCompleto } from "./quantitativo";
import type { Quantitativo } from "./quantitativo";
import { PAVIMENTO_LABEL } from "./types";
import type { Dimensoes } from "./types";

function aplicarHeaderStyle(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  row.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  row.height = 28;
}

function dimL(d?: Dimensoes): number | string {
  return d ? d.largura : "";
}
function dimA(d?: Dimensoes): number | string {
  return d ? d.altura : "";
}
function dimP(d?: Dimensoes): number | string {
  return d?.peitoril !== undefined ? d.peitoril : "";
}

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

export async function gerarPlanilha(q: Quantitativo): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Levantamento de Esquadrias";
  wb.created = new Date();

  // --- Aba 1: Catálogo (uma linha por código × pavimento) ---
  const ws = wb.addWorksheet("Catálogo");
  ws.columns = [
    { width: 14 }, // Código
    { width: 22 }, // Material
    { width: 26 }, // Local (ambiente)
    { width: 20 }, // Pavimento
    { width: 10 }, // VO L
    { width: 10 }, // VO A
    { width: 11 }, // VO peitoril
    { width: 10 }, // VL L
    { width: 10 }, // VL A
    { width: 11 }, // VL peitoril
    { width: 11 }, // Total Pav
    { width: 13 }, // Repetições
    { width: 11 }, // Total
  ];

  // Header com 2 níveis
  ws.addRow([
    "Código",
    "Material",
    "Local (ambiente)",
    "Pavimento",
    "Vão de Obra (cm)",
    "",
    "",
    "Vão Livre / Luz (cm)",
    "",
    "",
    "Total Pav.",
    "Repetições",
    "Total",
  ]);
  ws.mergeCells("E1:G1");
  ws.mergeCells("H1:J1");
  aplicarHeaderStyle(ws.getRow(1));

  ws.addRow([
    "",
    "",
    "",
    "",
    "Largura",
    "Altura",
    "Peitoril",
    "Largura",
    "Altura",
    "Peitoril",
    "",
    "",
    "",
  ]);
  aplicarHeaderStyle(ws.getRow(2));
  ws.mergeCells("A1:A2");
  ws.mergeCells("B1:B2");
  ws.mergeCells("C1:C2");
  ws.mergeCells("D1:D2");
  ws.mergeCells("K1:K2");
  ws.mergeCells("L1:L2");
  ws.mergeCells("M1:M2");

  // Dados
  q.linhas.forEach((l) => {
    ws.addRow([
      l.code,
      l.material,
      l.locais.join(" / "),
      labelPavimentoCompleto(l.pavimento, l.rangeTipo, l.pavimentoLabel),
      dimL(l.osso),
      dimA(l.osso),
      dimP(l.osso),
      dimL(l.luz),
      dimA(l.luz),
      dimP(l.luz),
      l.totalPav,
      l.repeticoes,
      l.total,
    ]);
  });

  // Linha de TOTAL
  const ultimaLinha = q.linhas.length + 2;
  const totalRow = ws.addRow([
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    { formula: `SUM(K3:K${ultimaLinha})` },
    "",
    { formula: `SUM(M3:M${ultimaLinha})` },
  ]);
  totalRow.font = { bold: true, name: "Arial" };
  totalRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" },
  };

  ws.views = [{ state: "frozen", ySplit: 2 }];
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: ultimaLinha, column: 13 },
  };

  // --- Aba 2: Resumo por material (compacto) ---
  const wsResumo = wb.addWorksheet("Resumo");
  wsResumo.columns = [{ width: 28 }, { width: 14 }, { width: 18 }];
  wsResumo.addRow(["Resumo"]);
  wsResumo.getRow(1).font = { bold: true, size: 14, name: "Arial" };
  wsResumo.addRow([]);
  wsResumo.addRow(["Total de esquadrias", q.totalEsquadrias]);
  wsResumo.addRow(["Códigos distintos (linhas)", q.linhas.length]);
  wsResumo.addRow(["Pavimentos cobertos", q.pavimentosPresentes.length]);
  wsResumo.addRow([]);
  wsResumo.addRow(["Por material", "Códigos", "Total esquadrias"]);
  aplicarHeaderStyle(wsResumo.lastRow!);
  for (const r of q.resumoPorMaterial) {
    wsResumo.addRow([r.material, r.totalCodigos, r.totalEsquadrias]);
  }

  // --- Aba 3: Avisos ---
  if (q.avisos.length > 0) {
    const wsAvisos = wb.addWorksheet("Avisos");
    wsAvisos.columns = [
      { width: 26 }, // Tipo
      { width: 14 }, // Código
      { width: 22 }, // Pavimento
      { width: 60 }, // Descrição
      { width: 36 }, // Planta
    ];
    wsAvisos.addRow(["Tipo", "Código", "Pavimento", "Descrição", "Planta"]);
    aplicarHeaderStyle(wsAvisos.getRow(1));

    for (const a of q.avisos) {
      const row = wsAvisos.addRow([
        ROTULO_AVISO[a.tipo] ?? a.tipo,
        a.codigo ?? "",
        a.pavimento ? (a.pavimentoLabel ?? PAVIMENTO_LABEL[a.pavimento]) : "",
        a.descricao,
        a.pdfNome ?? "",
      ]);
      // Cor por tipo
      let cor = "FFFEF3C7"; // âmbar claro padrão
      if (a.tipo === "rasterizada") cor = "FFFFE4E6"; // rosa
      else if (a.tipo === "vazia") cor = "FFE0E7FF"; // azul claro
      else if (a.tipo === "duplicada") cor = "FFFEF3C7";
      else if (a.tipo === "dim_variavel") cor = "FFFEF9C3"; // amarelo
      else if (a.tipo === "familia_desconhecida") cor = "FFFFEDD5"; // laranja claro
      else if (a.tipo === "sem_repeticao") cor = "FFFEF9C3"; // amarelo
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: cor },
      };
      row.alignment = { vertical: "top", wrapText: true };
    }

    wsAvisos.views = [{ state: "frozen", ySplit: 1 }];
  }

  // Font default Arial
  wb.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.font?.name) {
          cell.font = { ...(cell.font ?? {}), name: "Arial" };
        }
      });
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buf)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

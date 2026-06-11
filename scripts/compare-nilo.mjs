#!/usr/bin/env node
/**
 * Compara aba "Esquadrias" (manual) × aba "Catálogo" (app)
 * e gera planilha com diff por código.
 */
import ExcelJS from "exceljs";
import path from "path";

const MANUAL = process.argv[2];
const APP = process.argv[3];
const OUT = process.argv[4] || path.join(process.cwd(), "Comparativo-Nilo-Square-2026-05-30.xlsx");

if (!MANUAL || !APP) {
  console.error("uso: node compare-nilo.mjs <manual.xlsx> <app.xlsx> [saida.xlsx]");
  process.exit(1);
}

function extractValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return v.result;
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return v.text;
    if ("formula" in v) return null;
    return null;
  }
  return v;
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizarCodigo(s) {
  if (s == null) return null;
  let c = String(s).trim();
  if (!c) return null;
  // Remove espaços, pontos, hífens — pra unificar PCF02.A vs PCF02A vs PCF02-A
  // Mantém só letras e dígitos
  return c.replace(/[\s.\-_]/g, "").toUpperCase();
}

function normalizarPav(p) {
  if (p == null) return "";
  return String(p).trim().toUpperCase();
}

// ===== Lê MANUAL — aba ESQUADRIAS =====
const wbManual = new ExcelJS.Workbook();
await wbManual.xlsx.readFile(MANUAL);
const wsManual = wbManual.getWorksheet("ESQUADRIAS");
if (!wsManual) {
  console.error("Aba 'ESQUADRIAS' não encontrada na planilha manual");
  process.exit(2);
}

// Headers em L4: E/I | PAVIMENTO | REPET. PAV | CÓD. | LOCAL | REPET LOCAL/PAV | TOTAL | ...
// Dados a partir de L5
const manual = []; // { codigo, pavimento, repPav, repLocal, total }
for (let r = 5; r <= wsManual.rowCount; r++) {
  const row = wsManual.getRow(r);
  // Coluna B (2) é onde começa: B=E/I, C=PAVIMENTO, D=REPET.PAV, E=CÓD, F=LOCAL, G=REPET LOCAL/PAV, H=TOTAL
  const pavimento = extractValue(row.getCell(3));
  const repPav = toNumber(extractValue(row.getCell(4)));
  const codigo = extractValue(row.getCell(5));
  const local = extractValue(row.getCell(6));
  const repLocal = toNumber(extractValue(row.getCell(7)));
  const total = toNumber(extractValue(row.getCell(8)));

  const codNorm = normalizarCodigo(codigo);
  if (!codNorm) continue;
  if (total == null || total === 0) continue;

  manual.push({
    codigoOriginal: String(codigo).trim(),
    codigo: codNorm,
    pavimento: normalizarPav(pavimento),
    local: local ? String(local).trim() : "",
    repPav: repPav ?? 1,
    repLocal: repLocal ?? 1,
    total,
  });
}

// ===== Lê APP — aba Catálogo =====
const wbApp = new ExcelJS.Workbook();
await wbApp.xlsx.readFile(APP);
const wsApp = wbApp.getWorksheet("Catálogo");
if (!wsApp) {
  console.error("Aba 'Catálogo' não encontrada na planilha do app");
  process.exit(2);
}

// Headers em L1/L2, dados a partir de L3
// Col: A=Código B=Material C=Local D=Pavimento E=VO_L F=VO_A G=VO_P H=VL_L I=VL_A J=VL_P K=TotalPav L=Repetições M=Total
const app = [];
for (let r = 3; r <= wsApp.rowCount; r++) {
  const row = wsApp.getRow(r);
  const codigo = extractValue(row.getCell(1));
  if (!codigo) continue;
  if (String(codigo).toUpperCase().includes("TOTAL")) continue; // linha de total geral
  const material = extractValue(row.getCell(2));
  const local = extractValue(row.getCell(3));
  const pavimento = extractValue(row.getCell(4));
  const totalPav = toNumber(extractValue(row.getCell(11)));
  const reps = toNumber(extractValue(row.getCell(12)));
  const total = toNumber(extractValue(row.getCell(13)));

  const codNorm = normalizarCodigo(codigo);
  if (!codNorm) continue;
  if (total == null) continue;

  app.push({
    codigoOriginal: String(codigo).trim(),
    codigo: codNorm,
    pavimento: normalizarPav(pavimento),
    material: material ? String(material).trim() : "",
    local: local ? String(local).trim() : "",
    totalPav: totalPav ?? 0,
    repeticoes: reps ?? 1,
    total,
  });
}

console.log(`Manual: ${manual.length} linhas válidas, total esquadrias: ${manual.reduce((s, x) => s + x.total, 0)}`);
console.log(`App: ${app.length} linhas, total esquadrias: ${app.reduce((s, x) => s + x.total, 0)}`);

// ===== Agrega por código =====
const manualPorCodigo = new Map();
for (const m of manual) {
  const cur = manualPorCodigo.get(m.codigo) ?? {
    codigo: m.codigo,
    codigoOriginal: m.codigoOriginal,
    total: 0,
    detalhes: [],
  };
  cur.total += m.total;
  cur.detalhes.push(m);
  manualPorCodigo.set(m.codigo, cur);
}

const appPorCodigo = new Map();
for (const a of app) {
  const cur = appPorCodigo.get(a.codigo) ?? {
    codigo: a.codigo,
    codigoOriginal: a.codigoOriginal,
    material: a.material,
    total: 0,
    detalhes: [],
  };
  cur.total += a.total;
  if (a.material && !cur.material) cur.material = a.material;
  cur.detalhes.push(a);
  appPorCodigo.set(a.codigo, cur);
}

// ===== Monta diff =====
const todosCodigos = new Set([...manualPorCodigo.keys(), ...appPorCodigo.keys()]);
const linhasDiff = [];
for (const cod of [...todosCodigos].sort()) {
  const m = manualPorCodigo.get(cod);
  const a = appPorCodigo.get(cod);
  const totalManual = m?.total ?? 0;
  const totalApp = a?.total ?? 0;
  const dif = totalApp - totalManual;
  let status;
  if (!m) status = "Só App";
  else if (!a) status = "Só Manual";
  else if (dif === 0) status = "OK";
  else status = "Divergência";
  linhasDiff.push({
    codigo: cod,
    codigoOriginal: m?.codigoOriginal ?? a?.codigoOriginal ?? cod,
    material: a?.material ?? "",
    totalManual,
    totalApp,
    dif,
    status,
  });
}

// ===== Escreve planilha =====
const wbOut = new ExcelJS.Workbook();
wbOut.creator = "Comparativo Esquadrias";
wbOut.created = new Date();

function aplicarHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 24;
}

// ABA 1: Resumo
const wsR = wbOut.addWorksheet("Resumo");
wsR.columns = [{ width: 38 }, { width: 16 }, { width: 16 }, { width: 12 }];

wsR.addRow(["COMPARATIVO — Manual × App", "", "", ""]);
wsR.getRow(1).font = { bold: true, size: 14, name: "Arial" };
wsR.mergeCells("A1:D1");
wsR.addRow([]);

wsR.addRow(["Métrica", "Manual", "App", "Diferença"]);
aplicarHeader(wsR.lastRow);

const totManual = manual.reduce((s, x) => s + x.total, 0);
const totApp = app.reduce((s, x) => s + x.total, 0);
const codManual = manualPorCodigo.size;
const codApp = appPorCodigo.size;
const codComuns = [...todosCodigos].filter((c) => manualPorCodigo.has(c) && appPorCodigo.has(c)).length;
const codSoManual = codManual - codComuns;
const codSoApp = codApp - codComuns;

wsR.addRow(["Total de esquadrias", totManual, totApp, totApp - totManual]);
wsR.addRow(["Códigos distintos", codManual, codApp, codApp - codManual]);
wsR.addRow(["Códigos em comum", codComuns, codComuns, 0]);
wsR.addRow(["Só no Manual", codSoManual, "", ""]);
wsR.addRow(["Só no App", "", codSoApp, ""]);
wsR.addRow([]);

const ok = linhasDiff.filter((l) => l.status === "OK").length;
const div = linhasDiff.filter((l) => l.status === "Divergência").length;
wsR.addRow(["Códigos com quantidade igual", ok, "", ""]);
wsR.addRow(["Códigos com divergência", div, "", ""]);

// ABA 2: Diff por código
const ws = wbOut.addWorksheet("Diff por código");
ws.columns = [
  { width: 14 }, // Código
  { width: 22 }, // Material
  { width: 12 }, // Manual
  { width: 12 }, // App
  { width: 12 }, // Diferença
  { width: 18 }, // Status
];
ws.addRow(["Código", "Material (App)", "Total Manual", "Total App", "Diferença (App-Manual)", "Status"]);
aplicarHeader(ws.getRow(1));

const corPorStatus = {
  "OK": "FFD1FAE5", // verde claro
  "Divergência": "FFFEF3C7", // amarelo
  "Só Manual": "FFFFE4E6", // rosa
  "Só App": "FFE0E7FF", // azul claro
};

// Ordena: primeiro divergências, depois só manual/só app, depois OK
const ordemStatus = { "Divergência": 0, "Só Manual": 1, "Só App": 2, "OK": 3 };
linhasDiff.sort((a, b) => {
  if (a.status !== b.status) return ordemStatus[a.status] - ordemStatus[b.status];
  return a.codigo.localeCompare(b.codigo);
});

for (const l of linhasDiff) {
  const row = ws.addRow([
    l.codigoOriginal,
    l.material,
    l.totalManual,
    l.totalApp,
    l.dif,
    l.status,
  ]);
  const cor = corPorStatus[l.status];
  if (cor) {
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  }
}
ws.views = [{ state: "frozen", ySplit: 1 }];
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: ws.rowCount, column: 6 } };

// ABA 3: Detalhe por pavimento (só códigos com divergência ou ausentes)
const wsD = wbOut.addWorksheet("Detalhe por pavimento");
wsD.columns = [
  { width: 14 }, // Código
  { width: 28 }, // Pavimento
  { width: 14 }, // Manual qtd
  { width: 14 }, // App qtd
  { width: 14 }, // Diferença
  { width: 18 }, // Status
];
wsD.addRow(["Código", "Pavimento", "Qtd Manual", "Qtd App", "Diferença", "Status"]);
aplicarHeader(wsD.getRow(1));

for (const l of linhasDiff) {
  if (l.status === "OK") continue;
  const m = manualPorCodigo.get(l.codigo);
  const a = appPorCodigo.get(l.codigo);
  const pavsManual = new Map();
  for (const d of m?.detalhes ?? []) {
    pavsManual.set(d.pavimento, (pavsManual.get(d.pavimento) ?? 0) + d.total);
  }
  const pavsApp = new Map();
  for (const d of a?.detalhes ?? []) {
    pavsApp.set(d.pavimento, (pavsApp.get(d.pavimento) ?? 0) + d.total);
  }
  const todosPavs = new Set([...pavsManual.keys(), ...pavsApp.keys()]);
  for (const p of [...todosPavs].sort()) {
    const qM = pavsManual.get(p) ?? 0;
    const qA = pavsApp.get(p) ?? 0;
    if (qM === qA) continue;
    let st;
    if (qM === 0) st = "Só App";
    else if (qA === 0) st = "Só Manual";
    else st = "Divergência";
    const row = wsD.addRow([l.codigoOriginal, p, qM, qA, qA - qM, st]);
    const cor = corPorStatus[st];
    if (cor) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  }
}
wsD.views = [{ state: "frozen", ySplit: 1 }];

// Font default Arial
wbOut.eachSheet((sheet) => {
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (!cell.font?.name) cell.font = { ...(cell.font ?? {}), name: "Arial" };
    });
  });
});

await wbOut.xlsx.writeFile(OUT);
console.log(`\n✓ Comparativo gerado: ${OUT}`);
console.log(`  - ${codComuns} códigos em comum`);
console.log(`  - ${ok} OK, ${div} divergências, ${codSoManual} só manual, ${codSoApp} só app`);
console.log(`  - Diff total: ${totApp - totManual} esquadrias (${totManual} manual → ${totApp} app)`);

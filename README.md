# Esquadrias App

Quantitativo automático de esquadrias a partir de plantas baixas em PDF.

App Next.js 16 client-side. Deploy: https://esquadrias-app.vercel.app

## Stack

- Next.js 16 (Turbopack) + React 19 + TypeScript + Tailwind v4
- pdf.js v5 — leitura de plantas
- exceljs — geração de planilhas
- idb-keyval — persistência local (IndexedDB)
- Claude API (Vision/Text, opcional) — fallback OCR e estruturação

## Desenvolvimento

```bash
npm install
npm run dev
```

Servidor em `http://localhost:3000`.

## Build

```bash
npm run build
```

## Deploy

Push pra branch `main` dispara deploy automático no Vercel.

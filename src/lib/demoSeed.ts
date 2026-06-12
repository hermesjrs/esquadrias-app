/**
 * Seed de demonstração: popula o IndexedDB vazio com projetos de exemplo
 * embutidos no deploy (PDFs em /public/demo + manifest.json).
 *
 * Ativo apenas no domínio de demo (esquadriasog-app*) ou com ?demo na URL.
 * Os PDFs de demo NÃO vão pro repositório (.gitignore) — só entram no
 * deploy manual via `vercel` CLI. Num deploy sem /demo/manifest.json o
 * fetch retorna 404 e o seed é um no-op silencioso.
 */

export type DemoProjeto = { nome: string; arquivos: string[] };

export function ehModoDemo(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname.startsWith("esquadriasog-app")) return true;
  return new URLSearchParams(window.location.search).has("demo");
}

// Guarda em nível de módulo: sobrevive ao double-mount do StrictMode em dev
// e a re-execuções do effect enquanto o seed ainda está em andamento.
let seedIniciado = false;

export async function rodarSeedDemo(opts: {
  criarProjeto: (nome: string) => Promise<{ id: string }>;
  adicionarAoProjeto: (projetoId: string, arquivos: File[]) => Promise<void>;
  onProgresso?: (msg: string | null) => void;
}): Promise<void> {
  if (seedIniciado) return;
  seedIniciado = true;
  try {
    const resp = await fetch("/demo/manifest.json", { cache: "no-store" });
    if (!resp.ok) return;
    const manifest = (await resp.json()) as { projetos: DemoProjeto[] };

    for (const proj of manifest.projetos) {
      // Falha em um projeto não impede os demais — demo parcial > demo vazia.
      try {
        opts.onProgresso?.(`Carregando exemplo: ${proj.nome}…`);
        const arquivos = await Promise.all(
          proj.arquivos.map(async (caminho) => {
            const r = await fetch(`/demo/${caminho}`);
            if (!r.ok) throw new Error(`Falha ao baixar ${caminho}`);
            const blob = await r.blob();
            const nome = caminho.split("/").pop() ?? caminho;
            return new File([blob], nome, { type: "application/pdf" });
          }),
        );
        const projeto = await opts.criarProjeto(proj.nome);
        await opts.adicionarAoProjeto(projeto.id, arquivos);
      } catch (e) {
        console.warn(`Seed demo: projeto "${proj.nome}" falhou`, e);
      }
    }
  } finally {
    opts.onProgresso?.(null);
  }
}

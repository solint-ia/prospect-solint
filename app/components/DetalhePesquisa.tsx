"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import TabelaLeads, { type LeadLinha } from "./TabelaLeads";
import ModalConfirmacao from "./ModalConfirmacao";
import Paginacao from "./Paginacao";
import {
  Campo,
  botaoPrimarioCls,
  dataHora,
  inputCls,
  num,
  regiaoDaPesquisa,
} from "./ui";

export interface ExtracaoItem {
  id: string;
  leadsRequested: number;
  status: string;
  createdAt: string;
  totalLeads: number;
}

export interface PesquisaDetalhe {
  id: string;
  name: string;
  cnae: string;
  state: string | null;
  municipioNome: string | null;
  cnaesSecundarios: string[];
  capitalMin: number | null;
  capitalMax: number | null;
  estimatedLeads: number | null;
  estimatedCompanies: number | null;
  podeExtrair: boolean;
  createdAt: string;
  extracoes: ExtracaoItem[];
}

const ETAPAS = [
  { apos: 0, texto: "Disparando a extração..." },
  { apos: 4, texto: "Processando os contatos..." },
  { apos: 12, texto: "Quase lá — salvando os leads..." },
];

function formatarCnae(cod: string): string {
  return cod.length === 7
    ? `${cod.slice(0, 4)}-${cod.slice(4, 5)}/${cod.slice(5)}`
    : cod;
}

const moeda = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Os dois lados nulos significam que a pesquisa não filtrou por capital. */
function faixaDeCapital(p: {
  capitalMin: number | null;
  capitalMax: number | null;
}): string {
  if (p.capitalMin === null && p.capitalMax === null) {
    return "Capital: sem filtro";
  }
  if (p.capitalMin !== null && p.capitalMax === null) {
    return `Capital a partir de ${moeda(p.capitalMin)}`;
  }
  if (p.capitalMin === null && p.capitalMax !== null) {
    return `Capital até ${moeda(p.capitalMax)}`;
  }
  return `Capital ${moeda(p.capitalMin)} – ${moeda(p.capitalMax)}`;
}

function Selo({ status }: { status: string }) {
  const mapa: Record<string, { cls: string; texto: string; icone: React.ReactNode }> = {
    completed: {
      cls: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
      texto: "Concluída",
      icone: <CheckCircle2 className="h-3 w-3" />,
    },
    processing: {
      cls: "border-amber-400/25 bg-amber-400/10 text-amber-300",
      texto: "Processando",
      icone: <Clock className="h-3 w-3" />,
    },
    failed: {
      cls: "border-rose-400/25 bg-rose-400/10 text-rose-300",
      texto: "Falhou",
      icone: <AlertTriangle className="h-3 w-3" />,
    },
  };
  const s = mapa[status] ?? mapa.processing;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}
    >
      {s.icone}
      {s.texto}
    </span>
  );
}

function ModalExtracao({
  disponiveis,
  creditos,
  ehAdmin,
  onFechar,
  onExtrair,
}: {
  disponiveis: number;
  /** Admin: saldo total da conta. Usuário: saldo do banco. */
  creditos: number | null;
  ehAdmin: boolean;
  onFechar: () => void;
  onExtrair: (n: number) => Promise<void>;
}) {
  // Usuário comum não pode pedir mais do que o saldo paga.
  const teto = ehAdmin
    ? disponiveis
    : Math.min(disponiveis, Math.max(0, creditos ?? 0));
  const [quantidade, setQuantidade] = useState(Math.min(20, Math.max(1, teto)));
  const [extraindo, setExtraindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  const cronometro = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cronometro.current) clearInterval(cronometro.current);
    };
  }, []);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !extraindo) onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [extraindo, onFechar]);

  const etapaAtual =
    [...ETAPAS].reverse().find((e) => segundos >= e.apos)?.texto ?? ETAPAS[0].texto;

  const saldo = creditos ?? 0;
  const semSaldo = !ehAdmin && quantidade > saldo;
  const invalida =
    !Number.isInteger(quantidade) || quantidade < 1 || semSaldo || teto < 1;

  async function confirmar() {
    if (invalida || extraindo) return;
    setExtraindo(true);
    setErro(null);
    setSegundos(0);
    cronometro.current = setInterval(() => setSegundos((s) => s + 1), 1000);

    try {
      await onExtrair(quantidade);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado na extração.");
      setExtraindo(false);
    } finally {
      if (cronometro.current) clearInterval(cronometro.current);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !extraindo) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="my-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/60"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Nova extração</h2>
            <p className="mt-1 text-sm text-slate-400">
              Quantos leads você deseja extrair?
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={extraindo}
            title="Fechar"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <Campo label="Quantidade de leads">
          <input
            type="number"
            min={1}
            autoFocus
            value={quantidade}
            disabled={extraindo}
            onChange={(e) => setQuantidade(Number(e.target.value))}
            className={`${inputCls} text-lg font-semibold tabular-nums`}
          />
        </Campo>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {[10, 20, 50, 100].map((n) => (
            <button
              key={n}
              type="button"
              disabled={extraindo || n > teto}
              onClick={() => setQuantidade(n)}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-300 transition hover:border-emerald-400/40 hover:text-white disabled:opacity-30"
            >
              {n}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Leads disponíveis na pesquisa</span>
            <span className="tabular-nums text-slate-300">{num(disponiveis)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">
              {ehAdmin ? "Saldo da conta" : "Seu saldo"}
            </span>
            <span className="tabular-nums text-slate-300">
              {creditos === null ? "—" : num(creditos)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Custo desta extração</span>
            <span className="font-semibold tabular-nums text-white">
              até {num(Math.max(0, quantidade || 0))} créditos
            </span>
          </div>
          {!ehAdmin && (
            <div className="flex items-center justify-between border-t border-white/5 pt-1.5">
              <span className="text-slate-400">Saldo após a extração</span>
              <span
                className={`font-semibold tabular-nums ${
                  semSaldo ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {num(saldo - Math.max(0, quantidade || 0))}
              </span>
            </div>
          )}
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
          {ehAdmin
            ? "Como admin, a extração não debita créditos de usuário — o valor sai direto do saldo da conta."
            : "1 lead = 1 crédito. Se a extração entregar menos leads que o pedido, a diferença volta para o seu saldo."}
        </p>

        {!ehAdmin && teto < 1 && (
          <p className="mt-3 flex items-start gap-2 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Você está sem créditos. Peça ao administrador para recarregar sua conta.
          </p>
        )}

        {semSaldo && teto >= 1 && (
          <p className="mt-3 flex items-start gap-2 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Saldo insuficiente: você pode extrair até {num(teto)} leads.
          </p>
        )}

        {erro && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </p>
        )}

        <button
          type="button"
          onClick={confirmar}
          disabled={invalida || extraindo}
          className={`${botaoPrimarioCls} mt-5 w-full`}
        >
          {extraindo ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Extraindo... {segundos}s
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              Iniciar Extração
            </>
          )}
        </button>

        {extraindo && (
          <p className="mt-3 text-center text-sm text-slate-400">{etapaAtual}</p>
        )}
      </div>
    </div>
  );
}

export default function DetalhePesquisa({
  pesquisa,
  creditos,
  ehAdmin,
}: {
  pesquisa: PesquisaDetalhe;
  creditos: number | null;
  ehAdmin: boolean;
}) {
  const router = useRouter();

  const [modalAberto, setModalAberto] = useState(false);
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const [avisoSinc, setAvisoSinc] = useState<string | null>(null);
  const [extracaoAberta, setExtracaoAberta] = useState<string | null>(
    pesquisa.extracoes.find((e) => e.status === "completed")?.id ?? null
  );
  const [extracoes, setExtracoes] = useState(pesquisa.extracoes);
  const [extracaoParaExcluir, setExtracaoParaExcluir] =
    useState<ExtracaoItem | null>(null);
  const [filtroExtracao, setFiltroExtracao] = useState("todas");
  const [paginaExtracoes, setPaginaExtracoes] = useState(1);
  const [leads, setLeads] = useState<LeadLinha[]>([]);
  const [carregandoLeads, setCarregandoLeads] = useState(false);
  const [erroLeads, setErroLeads] = useState<string | null>(null);

  const extracoesFiltradas = useMemo(
    () =>
      filtroExtracao === "todas"
        ? extracoes
        : extracoes.filter((extracao) => extracao.status === filtroExtracao),
    [extracoes, filtroExtracao]
  );
  const extracoesPorPagina = 6;
  const totalPaginasExtracoes = Math.max(
    1,
    Math.ceil(extracoesFiltradas.length / extracoesPorPagina)
  );
  const extracoesDaPagina = extracoesFiltradas.slice(
    (paginaExtracoes - 1) * extracoesPorPagina,
    paginaExtracoes * extracoesPorPagina
  );

  useEffect(() => {
    setExtracoes(pesquisa.extracoes);
    setExtracaoAberta((atual) => {
      if (atual && pesquisa.extracoes.some((extracao) => extracao.id === atual)) {
        return atual;
      }
      return pesquisa.extracoes.find((extracao) => extracao.status === "completed")?.id ?? null;
    });
  }, [pesquisa.extracoes]);

  useEffect(() => setPaginaExtracoes(1), [filtroExtracao]);

  useEffect(() => {
    setPaginaExtracoes((atual) => Math.min(atual, totalPaginasExtracoes));
  }, [totalPaginasExtracoes]);

  // Sempre que a extração selecionada muda, recarrega a tabela.
  useEffect(() => {
    if (!extracaoAberta) {
      setLeads([]);
      return;
    }

    let ativo = true;
    setCarregandoLeads(true);
    setErroLeads(null);

    (async () => {
      try {
        const res = await fetch(`/api/extracoes/${extracaoAberta}/leads`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha ao carregar os leads.");
        if (ativo) setLeads(data.extracao.leads);
      } catch (e) {
        if (ativo)
          setErroLeads(e instanceof Error ? e.message : "Falha ao carregar os leads.");
      } finally {
        if (ativo) setCarregandoLeads(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [extracaoAberta]);

  async function extrair(leadsCount: number) {
    const res = await fetch(`/api/pesquisas/${pesquisa.id}/extracoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadsCount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `A extração falhou (HTTP ${res.status}).`);

    setModalAberto(false);
    setExtracaoAberta(data.extracao.id);
    // 202: ainda rodando no serviço; os leads vêm pelo botão de atualizar.
    if (data.emAndamento) setAvisoSinc(data.aviso ?? null);
    router.refresh();
  }

  /** Busca no serviço o desfecho de uma extração que não terminou a tempo. */
  async function sincronizar(extracaoId: string) {
    setSincronizando(extracaoId);
    setAvisoSinc(null);
    try {
      const res = await fetch(`/api/extracoes/${extracaoId}/sincronizar`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível sincronizar.");

      if (data.status === "completed") {
        setAvisoSinc(`${num(data.entregues)} leads recuperados.`);
        setExtracaoAberta(extracaoId);
      } else {
        setAvisoSinc(data.aviso ?? "Extração ainda em processamento.");
      }
      router.refresh();
    } catch (e) {
      setAvisoSinc(e instanceof Error ? e.message : "Não foi possível sincronizar.");
    } finally {
      setSincronizando(null);
    }
  }

  async function excluirExtracao() {
    if (!extracaoParaExcluir) return;

    const res = await fetch(`/api/extracoes/${extracaoParaExcluir.id}`, {
      method: "DELETE",
    });
    const ehJson = (res.headers.get("content-type") ?? "").includes(
      "application/json"
    );
    const data = ehJson ? ((await res.json()) as { error?: string }) : {};

    if (!res.ok) {
      throw new Error(data.error ?? `Não foi possível excluir (HTTP ${res.status}).`);
    }

    const idExcluido = extracaoParaExcluir.id;
    const restantes = extracoes.filter((extracao) => extracao.id !== idExcluido);
    setExtracoes(restantes);

    if (extracaoAberta === idExcluido) {
      setExtracaoAberta(
        restantes.find((extracao) => extracao.status === "completed")?.id ?? null
      );
      setLeads([]);
    }

    setExtracaoParaExcluir(null);
    router.refresh();
  }

  const podeExtrair = pesquisa.podeExtrair;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <Link
        href="/dashboard"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para as pesquisas
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {pesquisa.name}
          </h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-emerald-400">
              <Tag className="h-3 w-3" />
              {formatarCnae(pesquisa.cnae)}
            </span>
            {pesquisa.cnaesSecundarios.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-slate-400"
                title="CNAE secundário"
              >
                {formatarCnae(c)}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
              <MapPin className="h-3 w-3" />
              {regiaoDaPesquisa(pesquisa)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
              <Building2 className="h-3 w-3" />
              {num(pesquisa.estimatedCompanies)} empresas
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
              <Users className="h-3 w-3" />
              {num(pesquisa.estimatedLeads)} leads estimados
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
              {faixaDeCapital(pesquisa)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setModalAberto(true)}
          disabled={!podeExtrair}
          className={`${botaoPrimarioCls} py-3`}
          title={podeExtrair ? undefined : "Pesquisa incompleta"}
        >
          <Plus className="h-5 w-5" />
          Nova Extração
        </button>
      </div>

      {!podeExtrair && (
        <p className="mb-6 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Esta pesquisa não foi concluída no momento da criação, então não é
          possível extrair leads. Crie a pesquisa novamente pelo dashboard.
        </p>
      )}

      <section className="mb-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Histórico de extrações
          </h2>

          {extracoes.length > 0 && (
            <select
              value={filtroExtracao}
              onChange={(evento) => setFiltroExtracao(evento.target.value)}
              aria-label="Filtrar extrações por status"
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-300 focus:border-emerald-400/40 focus:outline-none"
            >
              <option value="todas">Todas as extrações</option>
              <option value="completed">Concluídas</option>
              <option value="processing">Processando</option>
              <option value="failed">Com falha</option>
            </select>
          )}
        </div>

        {avisoSinc && (
          <p className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
            <span className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
              {avisoSinc}
            </span>
            <button
              type="button"
              onClick={() => setAvisoSinc(null)}
              title="Fechar"
              className="shrink-0 text-emerald-300/70 hover:text-emerald-200"
            >
              <X className="h-4 w-4" />
            </button>
          </p>
        )}

        {extracoes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-slate-500">
            Nenhuma extração ainda. Clique em &ldquo;Nova Extração&rdquo; para
            começar.
          </p>
        ) : extracoesDaPagina.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-500">
            Nenhuma extração com esse status.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {extracoesDaPagina.map((extracao) => {
                const selecionada = extracao.id === extracaoAberta;
                const processando = extracao.status === "processing";
                return (
                  <div key={extracao.id} className="relative min-w-0">
                    <button
                      type="button"
                      onClick={() => setExtracaoAberta(extracao.id)}
                      disabled={extracao.status !== "completed"}
                      className={`w-full rounded-xl border px-4 py-3 pr-12 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        selecionada
                          ? "border-emerald-400/40 bg-emerald-400/10"
                          : "border-white/10 bg-slate-950/60 hover:border-white/20"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-white">
                          {num(extracao.totalLeads || extracao.leadsRequested)} leads
                        </span>
                        <Selo status={extracao.status} />
                      </div>
                      <p className="text-xs text-slate-500">
                        {dataHora(extracao.createdAt)}
                      </p>
                    </button>

                    {extracao.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => sincronizar(extracao.id)}
                        disabled={sincronizando === extracao.id}
                        title="Buscar no serviço os leads desta extração"
                        aria-label="Sincronizar extração"
                        className="absolute right-11 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-emerald-400/10 hover:text-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:opacity-40"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${
                            sincronizando === extracao.id ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExtracaoParaExcluir(extracao)}
                      disabled={processando}
                      title={
                        processando
                          ? "Aguarde a extração terminar"
                          : "Excluir extração"
                      }
                      aria-label="Excluir extração"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <Paginacao
              pagina={paginaExtracoes}
              totalPaginas={totalPaginasExtracoes}
              totalItens={extracoesFiltradas.length}
              porPagina={extracoesPorPagina}
              onMudar={setPaginaExtracoes}
              className="mt-3 rounded-xl border border-white/10 bg-slate-950/40"
            />
          </>
        )}
      </section>

      {extracaoAberta && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Leads extraídos
          </h2>

          {carregandoLeads ? (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando leads...
            </p>
          ) : erroLeads ? (
            <p className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {erroLeads}
            </p>
          ) : (
            <TabelaLeads
              leads={leads}
              nomeArquivo={`leads_${regiaoDaPesquisa(pesquisa).replace(/\s+/g, "-")}_${pesquisa.cnae}`}
            />
          )}
        </section>
      )}

      {modalAberto && (
        <ModalExtracao
          disponiveis={pesquisa.estimatedLeads ?? 0}
          creditos={creditos}
          ehAdmin={ehAdmin}
          onFechar={() => setModalAberto(false)}
          onExtrair={extrair}
        />
      )}

      {extracaoParaExcluir && (
        <ModalConfirmacao
          titulo="Excluir extração?"
          descricao={
            <>
              Os <strong className="text-slate-200">
                {num(
                  extracaoParaExcluir.totalLeads ||
                    extracaoParaExcluir.leadsRequested
                )} leads
              </strong>{" "}
              desta extração serão removidos permanentemente. Créditos utilizados não
              serão devolvidos.
            </>
          }
          confirmarTexto="Excluir extração"
          onFechar={() => setExtracaoParaExcluir(null)}
          onConfirmar={excluirExtracao}
        />
      )}
    </main>
  );
}

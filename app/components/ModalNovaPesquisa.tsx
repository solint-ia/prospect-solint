"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Loader2,
  PartyPopper,
  SearchCheck,
  Users,
  X,
} from "lucide-react";
import CnaeCombobox from "./CnaeCombobox";
import CidadeCombobox, { type CidadeItem } from "./CidadeCombobox";
import { Campo, botaoPrimarioCls, inputCls, num, UFS } from "./ui";

const MAX_SECUNDARIOS = 5;

function formatarCnae(cod: string): string {
  return cod.length === 7
    ? `${cod.slice(0, 4)}-${cod.slice(4, 5)}/${cod.slice(5)}`
    : cod;
}

export interface PesquisaCriada {
  id: string;
  name: string;
}

interface Resultado {
  totalEmpresas: number;
  totalLeads: number;
  pesquisa: PesquisaCriada;
}

function Metrica({
  icone,
  valor,
  rotulo,
}: {
  icone: React.ReactNode;
  valor: number;
  rotulo: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-center">
      <div className="mb-1.5 flex justify-center text-emerald-400">{icone}</div>
      <p className="text-2xl font-semibold tabular-nums text-white">{num(valor)}</p>
      <p className="mt-0.5 text-xs text-slate-400">{rotulo}</p>
    </div>
  );
}

export default function ModalNovaPesquisa({
  onFechar,
  onCriada,
}: {
  onFechar: () => void;
  onCriada: () => void;
}) {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [cnae, setCnae] = useState("");
  const [cnaesSecundarios, setCnaesSecundarios] = useState<string[]>([]);
  const [porMunicipio, setPorMunicipio] = useState(false);
  const [estado, setEstado] = useState("SE");
  const [cidade, setCidade] = useState<CidadeItem | null>(null);
  // Iguais aos da plataforma original: campos zerados por padrao.
  // Texto, não número: "" é campo vazio, que significa "sem filtro".
  const [capitalMin, setCapitalMin] = useState("");
  const [capitalMax, setCapitalMax] = useState("");

  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Não-nulo = o formulário deu lugar à tela de resultado.
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !buscando) onFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [buscando, onFechar]);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (buscando) return;

    if (!cnae) {
      setErro("Selecione um CNAE primário antes de buscar.");
      return;
    }

    if (porMunicipio && !cidade) {
      setErro("Selecione um município ou volte a filtrar por estado.");
      return;
    }

    setBuscando(true);
    setErro(null);

    try {
      const res = await fetch("/api/pesquisas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          cnae,
          cnaesSecundarios,
          estado: porMunicipio ? "" : estado,
          municipioCodigo: porMunicipio ? cidade?.id : null,
          municipioNome: porMunicipio ? cidade?.nome : null,
          capitalMin: capitalMin === "" ? null : Number(capitalMin),
          capitalMax: capitalMax === "" ? null : Number(capitalMax),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `A busca falhou (HTTP ${res.status}).`);

      if (!data.pesquisa || data.totalLeads === 0) {
        setErro(
          "Nenhuma oportunidade encontrada com esses filtros. Tente ampliar a faixa de capital social ou trocar o CNAE."
        );
        return;
      }

      setResultado(data);
      onCriada();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado na busca.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !buscando) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl shadow-black/60 sm:p-7"
      >
        {resultado ? (
          <>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2 text-emerald-400">
                  <PartyPopper className="h-5 w-5 shrink-0" />
                  <span className="text-xs font-medium uppercase tracking-wider">
                    Pesquisa criada
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-white">
                  Encontramos oportunidades para você!
                </h2>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {resultado.pesquisa.name}
                </p>
              </div>
              <button
                type="button"
                onClick={onFechar}
                title="Fechar"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6 flex gap-3">
              <Metrica
                icone={<Building2 className="h-5 w-5" />}
                valor={resultado.totalEmpresas}
                rotulo="Empresas encontradas"
              />
              <Metrica
                icone={<Users className="h-5 w-5" />}
                valor={resultado.totalLeads}
                rotulo="Sócios / leads potenciais"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push(`/pesquisas/${resultado.pesquisa.id}`)}
                className={`${botaoPrimarioCls} flex-1`}
              >
                Abrir pesquisa e extrair
              </button>
              <button
                type="button"
                onClick={onFechar}
                className="rounded-xl border border-white/10 px-5 py-3.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                Fechar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={buscar}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Nova pesquisa</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Defina os filtros para descobrir quantas oportunidades existem.
                </p>
              </div>
              <button
                type="button"
                onClick={onFechar}
                disabled={buscando}
                title="Fechar"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Campo label="Nome da pesquisa" className="sm:col-span-2">
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  autoFocus
                  placeholder="Farmácias Sergipe"
                  className={inputCls}
                />
              </Campo>

              <Campo
                label="CNAE primário"
                dica="Busque pelo código ou pelo nome da atividade"
                className="sm:col-span-2"
              >
                <CnaeCombobox value={cnae} onChange={setCnae} />
              </Campo>

              <Campo
                label={`CNAEs secundários (até ${MAX_SECUNDARIOS})`}
                dica="Opcional. Traz empresas que tenham o primário ou qualquer um destes."
                className="sm:col-span-2"
              >
                {cnaesSecundarios.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {cnaesSecundarios.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-emerald-300"
                      >
                        {formatarCnae(c)}
                        <button
                          type="button"
                          onClick={() =>
                            setCnaesSecundarios((atual) =>
                              atual.filter((x) => x !== c)
                            )
                          }
                          title="Remover"
                          className="rounded text-slate-500 transition hover:text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {cnaesSecundarios.length < MAX_SECUNDARIOS ? (
                  <CnaeCombobox
                    value=""
                    onChange={(cod) =>
                      setCnaesSecundarios((atual) =>
                        atual.includes(cod) ? atual : [...atual, cod]
                      )
                    }
                    placeholder="Buscar CNAE secundário..."
                    ocultar={[cnae, ...cnaesSecundarios]}
                  />
                ) : (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs text-slate-500">
                    Limite de {MAX_SECUNDARIOS} CNAEs secundários atingido.
                  </p>
                )}
              </Campo>

              <div className="sm:col-span-2">
                <div
                  role="radiogroup"
                  aria-label="Filtrar região por"
                  className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/5 p-1"
                >
                  {[
                    { valor: false, rotulo: "Estado" },
                    { valor: true, rotulo: "Município" },
                  ].map((opcao) => (
                    <button
                      key={opcao.rotulo}
                      type="button"
                      role="radio"
                      aria-checked={porMunicipio === opcao.valor}
                      onClick={() => setPorMunicipio(opcao.valor)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                        porMunicipio === opcao.valor
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {opcao.rotulo}
                    </button>
                  ))}
                </div>

                {porMunicipio ? (
                  <Campo
                    label="Município"
                    dica="Busque pelo nome. O estado não é aplicado junto com o município."
                  >
                    <CidadeCombobox cidade={cidade} onChange={setCidade} />
                  </Campo>
                ) : (
                  <Campo label="Estado (UF)">
                    <select
                      value={estado}
                      onChange={(e) => setEstado(e.target.value)}
                      className={inputCls}
                    >
                      {UFS.map((uf) => (
                        <option key={uf} value={uf} className="bg-slate-900">
                          {uf}
                        </option>
                      ))}
                    </select>
                  </Campo>
                )}
              </div>

              <Campo
                label="Capital social"
                dica="Opcional. Deixe em branco para não filtrar por capital."
                className="sm:col-span-2"
              >
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={capitalMin}
                    onChange={(e) => setCapitalMin(e.target.value)}
                    placeholder="Valor inicial (R$)"
                    aria-label="Capital social inicial"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={capitalMax}
                    onChange={(e) => setCapitalMax(e.target.value)}
                    placeholder="Valor final (R$)"
                    aria-label="Capital social final"
                    className={inputCls}
                  />
                </div>

                {capitalMin === "0" && capitalMax === "0" && (
                  <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    0 e 0 traz só empresas de capital social zero, que são
                    poucas. Para não filtrar, deixe os dois campos em branco.
                  </p>
                )}
              </Campo>
            </div>

            {erro && (
              <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erro}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={buscando}
              className={`${botaoPrimarioCls} mt-6 w-full`}
            >
              {buscando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Buscando oportunidades...
                </>
              ) : (
                <>
                  <SearchCheck className="h-5 w-5" />
                  Buscar Oportunidades
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs text-slate-500">
              Esta busca é gratuita — os créditos só seriam consumidos na extração.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

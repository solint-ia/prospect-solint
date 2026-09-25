import axios, { AxiosInstance } from "axios";

export interface LeadItem {
  id: string;
  nome: string;
  cpf: string | null;
  nome_empresa: string;
  nome_fantasia: string;
  cnpj_empresa: string;
  /** Itens vêm como string JSON: use lerTelefones()/lerEmails() de lib/leads. */
  phones: unknown[];
  email: unknown[];
  endereco_empresa: string;
  nome_cidade: string | null;
  telefone_empresa: string | null;
  status: string | null;
  valid: boolean;
}

export interface CnaeItem {
  cod: string;
  descricao: string;
}

export interface CidadeItem {
  id: number;
  nome: string;
}

/**
 * Filtros da etapa 1: definem o universo de empresas, sem quantidade ainda.
 * A região é por UF **ou** por município, nunca os dois: mandar uma UF que não
 * corresponde ao município zera o resultado do lado do fornecedor.
 */
export interface FiltroParams {
  nome: string;
  cnae: string;
  cnaesSecundarios: string[];
  estado: string | null;
  municipioCodigo: number | null;
  municipioNome: string | null;
  /** null nos dois = sem filtro de capital social. */
  capitalMin: number | null;
  capitalMax: number | null;
}

export interface ExtracaoRemota {
  id: string;
  status: string;
  leadsCount: number;
  createdAt: string;
}

export interface Estimativa {
  totalEmpresas: number;
  totalLeads: number;
}

const BASE_URL = "https://app.alieviprospect.com/api";
const ESTIMATIVA_URL = "https://backsec.alievichat.com/webhook/estimativa";
const TIMEOUT_ESTIMATIVA_MS = 150000;
const POLL_INTERVAL_MS = 2500;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

/** Quando só um lado é informado, o outro vira o extremo da faixa. */
const CAPITAL_MINIMO = 0;
const CAPITAL_MAXIMO = 999_999_999;

function faixaDeCapital(params: {
  capitalMin: number | null;
  capitalMax: number | null;
}): { capitalsocial: { inicial: number; final: number } } | null {
  if (params.capitalMin === null && params.capitalMax === null) return null;

  return {
    capitalsocial: {
      inicial: params.capitalMin ?? CAPITAL_MINIMO,
      final: params.capitalMax ?? CAPITAL_MAXIMO,
    },
  };
}

/** O `capitalRange` que a pesquisa guarda; null quando não há filtro. */
function rotuloDaFaixa(params: {
  capitalMin: number | null;
  capitalMax: number | null;
}): string | null {
  const faixa = faixaDeCapital(params);
  return faixa
    ? `${faixa.capitalsocial.inicial}-${faixa.capitalsocial.final}`
    : null;
}

export class AlieviService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 60000,
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
    });
  }

  async login(): Promise<{ token: string; credits: number }> {
    const username = process.env.ALIEVI_USERNAME;
    const password = process.env.ALIEVI_PASSWORD;

    if (!username || !password) {
      throw new Error(
        "Credenciais do serviço de dados ausentes no .env do servidor."
      );
    }

    const { data } = await this.client.post("/login", { username, password });

    if (!data?.token) {
      throw new Error("A autenticação no serviço de dados não retornou token.");
    }

    this.token = data.token;
    this.client.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;

    return { token: data.token, credits: Number(data.credits ?? 0) };
  }

  /** Garante um token válido antes de qualquer chamada autenticada. */
  private async ensureAuth(): Promise<void> {
    if (!this.token) await this.login();
  }

  /** Consulta apenas o saldo de créditos da conta. */
  async saldo(): Promise<number> {
    const { credits } = await this.login();
    return credits;
  }

  /**
   * Lista completa de CNAEs da plataforma (~1.3k itens). O endpoint ignora
   * parâmetros de busca, então a filtragem acontece no cliente.
   */
  async listarCnaes(): Promise<CnaeItem[]> {
    await this.ensureAuth();

    const { data } = await this.client.get("/cnaes");
    if (!Array.isArray(data)) throw new Error("Não foi possível carregar a lista de CNAEs.");

    return data
      .filter((c) => c?.cod && c?.descricao)
      .map((c) => ({ cod: String(c.cod), descricao: String(c.descricao) }));
  }

  /**
   * Municípios do fornecedor, filtrados por nome. O `id` é o código usado como
   * `codmunicio`. O campo `uf` da resposta é ignorado: vem errado (Aracaju
   * aparece como MG, São Paulo como GO), então não dá para confiar nele.
   */
  async buscarCidades(busca: string): Promise<CidadeItem[]> {
    await this.ensureAuth();

    const { data } = await this.client.get("/cities", {
      params: busca ? { search: busca } : undefined,
    });
    if (!Array.isArray(data)) return [];

    return data
      .filter((c) => c?.id && c?.name)
      .map((c) => ({ id: Number(c.id), nome: String(c.name) }));
  }

  /**
   * Quantas empresas e sócios existem para os filtros, antes de gastar crédito.
   * Vive em outro host (webhook n8n) e não usa o token da plataforma.
   */
  async estimar(params: FiltroParams): Promise<Estimativa> {
    const { data } = await axios.post(
      ESTIMATIVA_URL,
      {
        user: 1,
        cnae_primario: [params.cnae],
        cnae_secundario: params.cnaesSecundarios,
        // Omitido quando os dois campos estão vazios: aí não há filtro de
        // capital. Mandar 0-0 filtraria só quem tem capital social zero.
        ...(faixaDeCapital(params) ?? {}),
        codmunicio: params.municipioCodigo,
        // Com município escolhido a UF vai nula, senão o filtro se anula.
        coduf: params.municipioCodigo ? null : params.estado,
      },
      {
        // Com CNAEs secundarios a estimativa passa de 30s; 60s estourava.
        timeout: TIMEOUT_ESTIMATIVA_MS,
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
      }
    );

    // O webhook devolve os totais como string ("1433") e escreve "totaleads".
    return {
      totalEmpresas: Number(data?.totalempresas ?? 0),
      totalLeads: Number(data?.totaleads ?? 0),
    };
  }

  /** Cria a pesquisa e devolve o researchId, que a etapa 2 reutiliza. */
  async criarPesquisa(
    params: FiltroParams,
    estimatedLeads: number
  ): Promise<string> {
    await this.ensureAuth();

    const porMunicipio = Boolean(params.municipioCodigo);

    const { data } = await this.client.post("/researches", {
      name: params.nome,
      cnaes: [params.cnae, ...params.cnaesSecundarios],
      cnaePrimario: params.cnae,
      cnaeSecundario: params.cnaesSecundarios,
      cnaeLogic: "or",
      state: porMunicipio ? null : params.estado,
      municipality: params.municipioNome,
      municipalityCode: params.municipioCodigo,
      municipalities: porMunicipio ? [params.municipioNome] : null,
      municipalityCodes: porMunicipio ? [params.municipioCodigo] : null,
      capitalRange: rotuloDaFaixa(params),
      estimatedLeads,
    });

    if (!data?.id) throw new Error("O serviço de dados não retornou o ID da pesquisa.");
    return data.id as string;
  }

  /**
   * Etapa 2: dispara a extração numa pesquisa já criada, aguarda o
   * processamento e devolve os leads.
   */
  /** Dispara a extração e devolve o ID no serviço, sem esperar terminar. */
  async iniciarExtracao(
    researchId: string,
    leadsCount: number
  ): Promise<string> {
    await this.ensureAuth();

    const { data } = await this.client.post(
      `/researches/${researchId}/extractions`,
      { leadsCount: Number(leadsCount) }
    );

    if (!data?.id) {
      throw new Error("O serviço de dados não retornou o ID da extração.");
    }
    return String(data.id);
  }

  /** "processing" | "completed" | "failed" | ... */
  async statusExtracao(extractionId: string): Promise<string> {
    await this.ensureAuth();

    const { data } = await this.client.get(`/extractions/${extractionId}`);
    return String(data?.status ?? "").toLowerCase();
  }

  /**
   * Espera a extração terminar, até o limite de tempo.
   * Devolve o status alcançado: quem chama decide o que fazer com
   * "processing", que significa apenas "ainda não terminou".
   */
  async aguardarConclusao(
    extractionId: string,
    limiteMs: number
  ): Promise<string> {
    const prazo = Date.now() + limiteMs;

    while (Date.now() < prazo) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const status = await this.statusExtracao(extractionId);
      if (status !== "processing" && status !== "") return status;
    }

    return "processing";
  }

  async baixarLeads(extractionId: string): Promise<LeadItem[]> {
    await this.ensureAuth();

    const { data } = await this.client.get(
      `/extractions/${extractionId}/leads`
    );
    return Array.isArray(data) ? data : (data?.leads ?? []);
  }

  /**
   * Extrações de uma pesquisa no serviço. Serve para reencontrar uma extração
   * cujo ID não chegou a ser guardado do nosso lado.
   */
  async listarExtracoes(researchId: string): Promise<ExtracaoRemota[]> {
    await this.ensureAuth();

    const { data } = await this.client.get(
      `/researches/${researchId}/extractions`
    );
    if (!Array.isArray(data)) return [];

    return data
      .filter((e) => e?.id)
      .map((e) => ({
        id: String(e.id),
        status: String(e.status ?? "").toLowerCase(),
        leadsCount: Number(e.leadsCount ?? 0),
        createdAt: String(e.createdAt ?? ""),
      }));
  }
}

/**
 * Cada request cria a sua própria instância: a aplicação é stateless e
 * assim evitamos reaproveitar um token já expirado entre requisições.
 */
export function criarAlieviService(): AlieviService {
  return new AlieviService();
}

import type { FiltroParams } from "./alievi";

/** Entrada do usuário inválida: vira 400, não 500. */
export class ErroDeValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeValidacao";
  }
}

export const MAX_CNAES_SECUNDARIOS = 5;

/** Campo vazio significa "sem filtro", não zero. */
function lerCapital(valor: unknown, rotulo: string): number | null {
  if (valor === null || valor === undefined || valor === "") return null;

  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) {
    throw new ErroDeValidacao(`Capital social ${rotulo} inválido.`);
  }
  return n;
}

/** Os campos chegam como string do formulário; aqui viram objeto validado. */
export function lerFiltros(body: Record<string, unknown>): FiltroParams {
  const nome = String(body.nome ?? "").trim();
  const cnae = String(body.cnae ?? "").replace(/\D/g, "");

  const cnaesSecundarios = Array.from(
    new Set(
      (Array.isArray(body.cnaesSecundarios) ? body.cnaesSecundarios : [])
        .map((c) => String(c).replace(/\D/g, ""))
        .filter(Boolean)
    )
  ).filter((c) => c !== cnae);

  const estado = String(body.estado ?? "").trim().toUpperCase();
  const municipioCodigo = Number(body.municipioCodigo ?? 0);
  const municipioNome = String(body.municipioNome ?? "").trim();

  const capitalMin = lerCapital(body.capitalMin, "mínimo");
  const capitalMax = lerCapital(body.capitalMax, "máximo");

  if (!nome) throw new ErroDeValidacao("Informe o nome da pesquisa.");
  if (!cnae) throw new ErroDeValidacao("Selecione um CNAE primário válido.");

  if (cnaesSecundarios.length > MAX_CNAES_SECUNDARIOS) {
    throw new ErroDeValidacao(
      `Selecione no máximo ${MAX_CNAES_SECUNDARIOS} CNAEs secundários.`
    );
  }

  // Região é por município OU por UF — o município tem precedência.
  const porMunicipio = Number.isInteger(municipioCodigo) && municipioCodigo > 0;

  if (!porMunicipio && estado.length !== 2) {
    throw new ErroDeValidacao("Selecione um estado (UF) ou um município.");
  }
  if (porMunicipio && !municipioNome) {
    throw new ErroDeValidacao("Município inválido. Selecione-o na lista.");
  }

  if (capitalMin !== null && capitalMax !== null && capitalMax < capitalMin) {
    throw new ErroDeValidacao(
      "Capital social máximo deve ser maior ou igual ao mínimo."
    );
  }

  return {
    nome,
    cnae,
    cnaesSecundarios,
    estado: porMunicipio ? null : estado,
    municipioCodigo: porMunicipio ? municipioCodigo : null,
    municipioNome: porMunicipio ? municipioNome : null,
    capitalMin,
    capitalMax,
  };
}

import type {
  Aporte,
  Colaborador,
  Discrepancia,
  Documento,
  EstadoProyecto,
  Garantia,
  Liquidacion,
  Productor,
  Proyecto,
  RegistroSeguimiento,
} from "@/lib/types";
import {
  aportes,
  colaboradores,
  discrepancias,
  documentos,
  garantias,
  liquidaciones,
  productores,
  proyectos,
  seguimiento,
} from "./seed";

/**
 * Capa de acceso a datos.
 *
 * Todo lo que las pantallas saben de los datos pasa por acá. Hoy resuelve contra
 * el seed en memoria; cuando entre Supabase se reemplaza el cuerpo de cada función
 * por su consulta y las pantallas no cambian. Por eso todas son async aunque hoy
 * no lo necesiten: la firma ya es la definitiva.
 */

/** Estados en los que un proyecto es visible para un colaborador. */
const ESTADOS_PUBLICOS: EstadoProyecto[] = ["abierto", "fondeado", "en_curso", "cerrado"];

/** Un proyecto vivo ocupa cupo de garantía. Uno cerrado o rechazado la libera. */
const ESTADOS_VIVOS: EstadoProyecto[] = [
  "en_validacion",
  "abierto",
  "fondeado",
  "en_curso",
];

export interface FiltrosCatalogo {
  provincia?: string;
  modalidad?: string;
  montoMaximo?: number;
}

export async function getProyectosPublicos(filtros: FiltrosCatalogo = {}): Promise<Proyecto[]> {
  return proyectos
    .filter((p) => ESTADOS_PUBLICOS.includes(p.estado))
    .filter((p) => !filtros.provincia || p.provincia === filtros.provincia)
    .filter((p) => !filtros.modalidad || p.modalidad === filtros.modalidad)
    .filter((p) => !filtros.montoMaximo || p.montoObjetivoArs <= filtros.montoMaximo)
    .sort((a, b) => (b.publicadoAt ?? "").localeCompare(a.publicadoAt ?? ""));
}

export async function getProyecto(id: string): Promise<Proyecto | undefined> {
  return proyectos.find((p) => p.id === id);
}

export async function getProyectosDeProductor(productorId: string): Promise<Proyecto[]> {
  return proyectos
    .filter((p) => p.productorId === productorId)
    .sort((a, b) => b.creadoAt.localeCompare(a.creadoAt));
}

export async function getProyectosEnValidacion(): Promise<Proyecto[]> {
  return proyectos
    .filter((p) => p.estado === "en_validacion")
    .sort((a, b) => a.creadoAt.localeCompare(b.creadoAt));
}

export async function getProductor(id: string): Promise<Productor | undefined> {
  return productores.find((p) => p.id === id);
}

export async function getDocumentosDeProyecto(proyectoId: string): Promise<Documento[]> {
  return documentos.filter((d) => d.proyectoId === proyectoId);
}

export async function getDocumentosDeProductor(productorId: string): Promise<Documento[]> {
  return documentos
    .filter((d) => d.productorId === productorId)
    .sort((a, b) => b.subidoAt.localeCompare(a.subidoAt));
}

export async function getDiscrepanciasDeDocumento(documentoId: string): Promise<Discrepancia[]> {
  return discrepancias.filter((d) => d.documentoId === documentoId);
}

export async function getDiscrepanciasDeProyecto(proyectoId: string): Promise<Discrepancia[]> {
  const ids = documentos.filter((d) => d.proyectoId === proyectoId).map((d) => d.id);
  return discrepancias.filter((d) => ids.includes(d.documentoId));
}

/**
 * Productor con el que se entra a la demo. Cuando exista autenticación,
 * sale de la sesión.
 */
export const PRODUCTOR_DEMO = "prod-1";

/**
 * Documentación que respalda a un proyecto: la que se subió para ese ciclo más
 * la permanente del establecimiento. El RENSPA no se vuelve a pedir en cada
 * publicación —es del establecimiento, no del lote— y sin embargo cuenta como
 * requisito cumplido. Por eso la completitud se mide contra esta lista y no
 * contra `getDocumentosDeProyecto`.
 */
export async function getDocumentosVigentesDeProyecto(
  proyectoId: string,
  productorId: string,
): Promise<Documento[]> {
  return documentos.filter(
    (d) =>
      d.proyectoId === proyectoId ||
      (d.proyectoId === null && d.productorId === productorId),
  );
}

/** Documentación permanente del establecimiento, la que se reusa entre proyectos. */
export async function getDocumentosPermanentes(productorId: string): Promise<Documento[]> {
  return documentos.filter((d) => d.productorId === productorId && d.proyectoId === null);
}

/**
 * Los tres saldos del productor. Son tres momentos distintos del mismo dinero y
 * conviene no confundirlos: primero un colaborador la pone (recaudado), después
 * Guardian aprueba que salga hacia el campo (liberado) y recién al final el
 * productor la retira. Lo que todavía no dio cada paso es lo que se muestra.
 */
export interface Saldos {
  /** Liberado que el productor todavía no retiró. */
  pendienteDeRetiro: number;
  liberadoHistorico: number;
  /** Recaudado cuya salida de fondos todavía no se aprobó. */
  aLiquidar: number;
  recaudadoHistorico: number;
  objetivoHistorico: number;
}

export async function getSaldosDeProductor(productorId: string): Promise<Saldos> {
  const suyos = proyectos.filter(
    (p) => p.productorId === productorId && p.estado !== "borrador" && p.estado !== "rechazado",
  );
  const sumar = (f: (p: Proyecto) => number) => suyos.reduce((acc, p) => acc + f(p), 0);

  const liberadoHistorico = sumar((p) => p.montoLiberadoArs);
  const recaudadoHistorico = sumar((p) => p.montoRecaudadoArs);

  return {
    pendienteDeRetiro: liberadoHistorico - sumar((p) => p.montoRetiradoArs),
    liberadoHistorico,
    aLiquidar: recaudadoHistorico - liberadoHistorico,
    recaudadoHistorico,
    objetivoHistorico: sumar((p) => p.montoObjetivoArs),
  };
}

/* ---------- Garantías ---------- */

export async function getGarantia(id: string): Promise<Garantia | undefined> {
  return garantias.find((g) => g.id === id);
}

export async function getGarantiasDeProductor(productorId: string): Promise<Garantia[]> {
  return garantias.filter((g) => g.productorId === productorId);
}

export interface GarantiaConUso {
  garantia: Garantia;
  /** Los proyectos vivos que la están usando. */
  usadaEn: Proyecto[];
  /** Cuántos proyectos más puede respaldar antes de quedar sin cupo. */
  cupoLibre: number;
  /** Si hoy se puede elegir para un proyecto nuevo. */
  disponible: boolean;
}

/**
 * Las garantías del productor con el cupo ya calculado. El cupo se cuenta sobre
 * los proyectos vivos y no sobre todos: una hipoteca que respaldó tres ciclos ya
 * liquidados está libre, aunque figure en el historial de los tres.
 */
export async function getGarantiasConUso(productorId: string): Promise<GarantiaConUso[]> {
  return garantias
    .filter((g) => g.productorId === productorId)
    .map((garantia) => {
      const usadaEn = proyectos.filter(
        (p) => p.garantiaId === garantia.id && ESTADOS_VIVOS.includes(p.estado),
      );
      const cupoLibre = Math.max(0, garantia.cupoProyectos - usadaEn.length);
      return {
        garantia,
        usadaEn,
        cupoLibre,
        disponible: cupoLibre > 0 && garantia.estado !== "vencida",
      };
    });
}

/**
 * Las pesadas de un proyecto, de la más vieja a la más nueva. El orden importa:
 * la ganancia diaria de un tramo se calcula contra el registro anterior.
 */
export async function getSeguimientoDeProyecto(
  proyectoId: string,
): Promise<RegistroSeguimiento[]> {
  return seguimiento
    .filter((r) => r.proyectoId === proyectoId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * El colaborador con la sesión iniciada, igual que `PRODUCTOR_DEMO`. Es la misma
 * cuenta: en Guardian un productor también puede invertir, así que esto es una
 * vista y no otro usuario.
 */
export const COLABORADOR_DEMO = "col-1";

export async function getColaborador(id: string): Promise<Colaborador | undefined> {
  return colaboradores.find((c) => c.id === id);
}

export async function getAportesDeColaborador(colaboradorId: string): Promise<Aporte[]> {
  return aportes
    .filter((a) => a.colaboradorId === colaboradorId)
    .sort((a, b) => b.adhesionAt.localeCompare(a.adhesionAt));
}

export async function getAportesDeProyecto(proyectoId: string): Promise<Aporte[]> {
  return aportes.filter((a) => a.proyectoId === proyectoId);
}

export async function getLiquidacionesDeColaborador(
  colaboradorId: string,
): Promise<Liquidacion[]> {
  return liquidaciones
    .filter((l) => l.colaboradorId === colaboradorId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export interface PosicionEnProyecto {
  proyecto: Proyecto;
  aporte: Aporte;
}

/**
 * La cartera del colaborador: en qué proyectos está, con cuánto acreditado y qué
 * quedó pendiente de acreditar.
 *
 * Los tres montos van separados porque son tres cosas distintas: lo que
 * comprometió, lo que el banco acreditó y lo que ya le liquidaron. Sumarlos en
 * un solo número sería un saldo de billetera, y acá no hay billetera.
 */
export interface Cartera {
  posiciones: PosicionEnProyecto[];
  liquidaciones: Liquidacion[];
  comprometidoArs: number;
  acreditadoArs: number;
  pendienteDeAcreditarArs: number;
  liquidadoPagadoArs: number;
  liquidadoPendienteArs: number;
}

export async function getCarteraDeColaborador(colaboradorId: string): Promise<Cartera> {
  const suyos = await getAportesDeColaborador(colaboradorId);
  const posiciones: PosicionEnProyecto[] = [];

  for (const aporte of suyos) {
    const proyecto = proyectos.find((p) => p.id === aporte.proyectoId);
    if (proyecto) posiciones.push({ proyecto, aporte });
  }

  const liquidacionesDelColaborador = await getLiquidacionesDeColaborador(colaboradorId);

  return {
    posiciones,
    liquidaciones: liquidacionesDelColaborador,
    comprometidoArs: suyos.reduce((a, x) => a + x.montoComprometidoArs, 0),
    acreditadoArs: suyos.reduce((a, x) => a + x.montoAcreditadoArs, 0),
    pendienteDeAcreditarArs: suyos.reduce(
      (a, x) => a + Math.max(0, x.montoComprometidoArs - x.montoAcreditadoArs),
      0,
    ),
    liquidadoPagadoArs: liquidacionesDelColaborador
      .filter((l) => l.estado === "pagada")
      .reduce((a, l) => a + l.capitalArs + l.resultadoArs, 0),
    liquidadoPendienteArs: liquidacionesDelColaborador
      .filter((l) => l.estado !== "pagada")
      .reduce((a, l) => a + l.capitalArs + l.resultadoArs, 0),
  };
}

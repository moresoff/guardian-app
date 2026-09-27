# Backend e integraciones: plan de la etapa C

Fecha: 2026-09-27. Es el plan para lo que sigue: levantar el backend y usar n8n
para la lectura de datos. No hay nada de esto construido todavía; lo que sigue
son los contratos y el orden de trabajo.

La regla que ordena todo: **los controles de interfaz no son controles**. Todo lo
que hoy decide una pantalla —si un proyecto se publica, si un aporte cuenta, si
un identificador está libre— tiene que volver a decidirse del lado del servidor,
dentro de una transacción.

## 1. Base de datos

PostgreSQL. Las tablas mínimas, agrupadas por lo que sostienen:

**Participantes.** `perfiles` (identidad, rol, estado de verificación),
`productores`, `establecimientos` (varios por productor, con RENSPA, título de
uso y vigencia), `representaciones` (quién firma por una persona jurídica y con
qué facultades), `cuentas_bancarias`.

**Proyectos.** `proyectos` (modalidad, objetivo, mínimo de inicio, plazos,
estado, estado de fondeo), `condiciones_economicas` (versionadas: cambiar una
condición no pisa la anterior), `presupuesto_rubros`, `cronograma_hitos`,
`restricciones`.

**Lote.** `lotes`, `inventarios` (fechados), `identificadores` (RFID con
restricción única sobre los activos), `movimientos_hacienda`.

**Documental.** `documentos`, `documento_versiones` (el original nunca se pisa),
`extracciones`, `discrepancias`, `revisiones` (quién, cuándo, con qué método y
qué evidencia), `requisitos` (etapa, origen, aplicabilidad, estado).

**Dinero.** `aportes`, `movimientos_bancarios`, `conciliaciones`,
`desembolsos` (solicitud, autorización, pago), `rendiciones`, `liquidaciones`.

**Transversal.** `auditoria` (actor, acción, entidad, fecha, motivo, cambios).

Tres restricciones que tienen que estar en la base y no en el código:

- Un identificador RFID no puede estar en dos proyectos activos. Índice único
  parcial sobre `(identificador)` donde el proyecto esté vivo.
- `referencia_externa` de un movimiento bancario es única. Es lo que hace que
  repetir una notificación no duplique el aporte.
- Los importes van en `numeric`, nunca en punto flotante.

## 2. Contratos de servicio

Las funciones de `src/lib/data/index.ts` ya tienen la firma definitiva: son
`async` y devuelven los tipos de `src/lib/types.ts`. El reemplazo es el cuerpo,
no la firma. Lo que hay que agregar del lado del servidor:

| Operación | Qué tiene que garantizar |
|---|---|
| `publicarProyecto(id)` | Reevaluar `puedePublicarse()` en el servidor, no confiar en el botón |
| `crearOrdenSuscripcion(proyectoId, monto)` | Emitir el número, que es único; registrar la versión del contrato aceptada |
| `registrarMovimiento(referenciaExterna, …)` | Idempotente por referencia; si ya existe, no hace nada |
| `conciliar(movimientoId, aporteId)` | Transacción: acredita, recalcula el fondeo y deja el asiento de auditoría |
| `solicitarDesembolso(…)` / `autorizar(…)` / `confirmarPago(…)` | Tres pasos separados, cada uno con su actor y su evidencia |
| `afectarIdentificadores(proyectoId, ids)` | Reserva atómica: o entran todos o no entra ninguno |

## 3. n8n: lectura de datos

n8n es el orquestador de lo que entra desde afuera. Cuatro flujos, en este
orden de construcción:

### Flujo 1 — Extracción documental

```
Webhook (documento subido)
  → descarga del archivo privado
  → modelo de visión (API preentrenada, sin entrenar nada propio)
  → normalización de campos
  → POST /api/documentos/:id/extraccion
```

Lo que tiene que quedar claro en el flujo: **la extracción no verifica
autenticidad**. Deja `estado_extraccion` y `estado_consistencia`, nunca
`estado_autenticidad`. Si el modelo falla o devuelve baja confianza, el documento
queda en `error` y aparece en la cola de revisión, no en silencio.

Reintentos con backoff, y el `documento_id` como clave de idempotencia: correr el
flujo dos veces no puede generar dos extracciones.

### Flujo 2 — Reglas deterministas

Corre después de la extracción y no usa modelo: sumas, fechas, formatos,
duplicados de identificadores contra la base, coincidencia de RENSPA. Escribe
`discrepancias`. Es lo que sostiene que "las cifras cierran" sea una afirmación
comprobable.

### Flujo 3 — Conciliación bancaria

```
Cron (o webhook del banco)
  → lectura de movimientos
  → match por referencia / importe / fecha
  → POST /api/conciliaciones (idempotente por referencia externa)
  → lo que no matchea queda "sin identificar" para revisión manual
```

Nunca cierra una diferencia sola. Un importe menor deja el aporte en
`acreditado_parcial` con la diferencia escrita.

### Flujo 4 — Avisos

```
Eventos de la app (documento vencido, hito, acreditación, liquidación)
  → cola
  → email (reporte semanal) / push (novedades) / WhatsApp (lo urgente)
```

El asistente conversacional de WhatsApp queda para el MVP 2: este flujo solo
manda avisos, no conversa.

### Lo que n8n no hace

No decide publicaciones, no autoriza desembolsos y no ejecuta transferencias.
Llama a la API de Guardian, que es la que aplica las reglas en transacción. Si n8n
se cae, la operación no queda a medias: los flujos son idempotentes y se repiten.

## 4. Orden de trabajo sugerido

1. Esquema y migraciones, con las tres restricciones de arriba.
2. Autenticación y permisos por rol, incluidas las atribuciones del fiduciario.
3. Reemplazo del cuerpo de `src/lib/data/index.ts` contra la base real.
4. Archivos privados con versionado y URL firmada de vencimiento corto.
5. Flujo 1 y flujo 2 de n8n (lectura y reglas).
6. Aportes y flujo 3 (conciliación).
7. Desembolsos, rendiciones y liquidación.
8. Flujo 4 (avisos).

## 5. Lo que no entra

Billetera, BaaS, blockchain, smart contracts, mercado secundario y entrenamiento
de modelos propios. Las interfaces de identidad, extracción, firma, banco y
notificaciones se dejan reemplazables: ningún proveedor se elige todavía.

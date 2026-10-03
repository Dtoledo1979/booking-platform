# 03 — Reservas y cancelaciones

## Cálculo de disponibilidad

Se ejecuta en Postgres con una función `security definer`, que devuelve
solo horarios libres y nunca quién ocupa un hueco.

Para cada profesional elegible (activo, reservable online y que hace el
servicio):

1. Se toman sus tramos de `staff_working_hours` para cada día del rango, en la
   zona horaria de la sucursal.
2. Se generan candidatos cada `slot_step_minutes` (15 por defecto). El
   candidato cabe si `inicio + duración ≤ fin del tramo`. El buffer posterior
   puede salir del tramo.
3. Se descartan los candidatos que:
   - empiezan antes de `ahora + min_notice_minutes`, o después de
     `hoy + max_advance_days`;
   - **se solapan** (no solo "empiezan dentro") con un `time_off` del
     profesional o de toda la sucursal;
   - hacen que `[inicio, inicio + duración + buffer)` se solape con otra cita
     activa del mismo profesional, incluidas las `pending` vigentes.

**"Sin preferencia":** se devuelve la unión de los horarios de todos los
profesionales elegibles. Al confirmar, el servidor asigna uno según
`auto_assign_strategy`. Por defecto se asigna al profesional con menos
minutos reservados ese día, para repartir el trabajo; si hay empate, al
primero según `sort_order`.

**Zona horaria:** la API devuelve `timestamptz` y la interfaz agrupa y
muestra los horarios usando la `timezone` de la sucursal, nunca UTC ni la
zona del navegador. Los cambios de horario de verano (DST) se resuelven con
`AT TIME ZONE` en Postgres.

## Flujo de reserva online

```
Página de la sucursal
  → servicio
  → profesional o "sin preferencia"
  → día y hora
  → iniciar sesión o crear cuenta (nombre, email, teléfono)
  → [si la sucursal cobra fees] tarjeta + aceptar la política
  → confirmación (email + SMS + botones de calendario)
```

1. **Retención del horario.** Al elegir la hora y continuar, el servidor crea
   la cita en estado `pending` con `expires_at = ahora + 10 min`. La
   restricción de exclusión garantiza que nadie más tome ese horario. Si el
   cliente no termina, una tarea programada (o la siguiente consulta) la
   libera.
2. **Tarjeta.** Si la sucursal tiene `require_card` y Stripe conectado, se
   crea un SetupIntent en la **cuenta Connect de la sucursal**. El cliente
   ingresa la tarjeta con Stripe Elements; el número nunca toca nuestro
   servidor. Si el cliente ya tiene una tarjeta guardada en esa sucursal,
   puede usarla.
3. **Aceptación de la política.** El cliente ve un texto generado a partir de
   la versión vigente, por ejemplo:

   > Free cancellation up to 24 hours before your appointment. Later
   > cancellations: NZ$25 fee. No-show: 50% of the service price.

   Además marca una casilla obligatoria. Se guarda
   `cancellation_policy_id`, `policy_accepted_at` y la IP.
4. **Confirmación.** El servidor pasa la cita a `confirmed`, crea o actualiza
   `location_clients` y envía las notificaciones.

**Validaciones del servidor (no del navegador):** que el horario siga
disponible, que el servicio esté activo, que la sucursal esté `active`, que
el cliente no esté bloqueado, que el precio venga de la base de datos y que
`hold_until` lo calcule el servidor.

Si la sucursal no conectó Stripe, se omite el paso 2 y no se cobran fees,
pero la política se muestra igual.

## Reserva desde el panel (teléfono o walk-in)

- Recepción, gerente o profesional crea la cita y elige un cliente existente
  o crea una ficha rápida (nombre y teléfono).
- Puede saltarse la antelación mínima y el horario laboral, con una
  advertencia visible. La restricción de reservas dobles no se puede saltar.
- Opcionalmente se envía al cliente un link para guardar su tarjeta y aceptar
  la política. Sin tarjeta guardada no se puede cobrar un fee después.

## Cancelación por parte del cliente

- **Antes de que cierre la ventana gratuita** (`starts_at -
  free_cancellation_hours`): se cancela sin costo.
- **Dentro de la ventana:**
  1. La app muestra el monto exacto del fee **antes** de que el cliente
     confirme.
  2. Al confirmar, el servidor cancela la cita y crea un `booking_fee` de tipo
     `late_cancel`.
  3. Intenta cobrarlo de inmediato con un PaymentIntent `off_session` en la
     cuenta Connect, sobre la tarjeta guardada.
- **Fee ya cobrado:** el negocio puede perdonarlo (`waived`) antes del cobro o
  reembolsarlo después, desde la ficha de la cita.

## Reprogramación por parte del cliente

- Fuera de la ventana: se permite y se trata como un movimiento de la misma
  cita, sin fee. Conserva la política aceptada originalmente.
- Dentro de la ventana: no se permite online; la app muestra el teléfono de
  la sucursal. El negocio decide desde el panel (puede moverla sin fee).

## Cancelación por parte del negocio

- Nunca genera un fee para el cliente.
- Requiere un motivo, que se envía al cliente junto con un link para volver a
  reservar.

## No-show

- Lo marca el personal de forma manual, no automática, y solo después de la
  hora de inicio más una tolerancia (`no_show_grace_minutes`, por defecto 15).
- Al marcarlo, el panel muestra el fee calculado con la política aceptada y
  pregunta: **"Cobrar NZ$X"** o **"No cobrar"**. Así se evitan cobros por
  error, por ejemplo cuando el cliente avisó por teléfono.
- Revertir un no-show marcado por error reembolsa el fee automáticamente.

## Cálculo del fee

- `fixed`: monto fijo en centavos.
- `percent`: porcentaje sobre el `price_cents` congelado en
  `appointment_services`.
- **Tope:** el fee nunca supera el precio del servicio reservado.
- Moneda: la de la sucursal (NZD).

## Cuando el cobro falla

- El fee queda en `failed` con el motivo que devuelve Stripe.
- Se avisa al negocio y la ficha del cliente muestra "fee pendiente".
- Si la tarjeta requiere autenticación 3D Secure, se envía al cliente un link
  para completar el pago.
- En el MVP el negocio decide si bloquea al cliente. En la Fase 2 se podrá
  exigir prepago a clientes con fees pendientes.

## Recordatorios

| Momento | Canal | Contenido |
|---|---|---|
| Al reservar | Email (+ SMS opcional) | Confirmación, política, link para cancelar o reprogramar, archivo de calendario |
| **6 horas antes de que cierre la ventana gratuita** | Email + SMS | "Todavía puedes cancelar gratis hasta las HH:MM" |
| 2 horas antes de la cita | SMS | Recordatorio con la dirección |
| Al cancelar o mover | Email | Comprobante, con el fee si corresponde |

El recordatorio clave es el segundo: le da al cliente la oportunidad de
cancelar sin costo. Eso reduce las disputas y los cobros fallidos, y
fortalece la posición del negocio si el cliente reclama el cargo ante su
banco.

## Evidencia para disputas (chargebacks)

Si un cliente disputa un fee, la plataforma tiene que poder generar este
paquete de evidencia:

- el texto de la política aceptada (la versión exacta);
- la fecha, la hora y la IP de la aceptación;
- el historial de la cita (creada, recordatorios enviados con su
  confirmación de entrega, cancelación o no-show y quién lo marcó);
- el email de confirmación enviado.

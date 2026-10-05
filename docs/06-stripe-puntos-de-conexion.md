# 06 — Puntos de conexión con Stripe

Stripe todavía no está conectado. Este documento lista **cada punto** donde
se va a enganchar, qué existe ya en el sistema y qué falta. La regla de
diseño: el resto de la app ya llama a esos puntos, así que conectar Stripe
consiste en implementarlos, no en reescribir pantallas.

El código de la app llama a `src/lib/payments.ts`. Hoy esas funciones no
hacen nada (los fees quedan en `pending`); al conectar Stripe se implementan
ahí o se delegan a Edge Functions.

## Resumen

| # | Punto | Disparador | Estado hoy | Falta |
|---|---|---|---|---|
| 1 | Suscripción (Go live) | Botón "Go live" del dashboard | Botón marcado "Coming soon"; la sucursal queda `draft` | Checkout, webhook y activación de la sucursal |
| 2 | Agregar, pausar o cerrar sucursal | Gestión de sucursales | No existe todavía (MVP con una sucursal) | Ajustar `quantity` de la suscripción |
| 3 | Portal de facturación | Configuración, sección Facturación | No existe | Link al Customer Portal |
| 4 | Conectar payouts (Connect) | Botón "Connect payouts" | Marcado "Coming soon"; `stripe_charges_enabled = false` | Cuenta Express, Account Link y webhook `account.updated` |
| 5 | Tarjeta al reservar | `book_appointment` devuelve `pending` | El flujo ya maneja `pending` y lleva a la pantalla de tarjeta (placeholder) | SetupIntent, Stripe Elements y confirmación |
| 6 | Cobro de fee | `booking_fees` creados en `pending` | `requestFeeCollection(feeId)` se llama tras la cancelación tardía y el no-show | PaymentIntent off-session y webhooks |
| 7 | Reembolso de fee | Perdonar un fee ya cobrado, o revertir un no-show | `refund_requested_at` se marca; `requestFeeRefund(feeId)` se llama | Refund en la cuenta conectada |
| 8 | Disputas | `charge.dispute.created` | Datos de evidencia ya guardados (política, aceptación, auditoría) | Aviso al negocio y paquete de evidencia |
| 9 | Tarjetas guardadas del cliente | "Mis reservas" | `client_payment_methods` existe, solo lectura | Listar y eliminar (detach) |
| 10 | GST de la suscripción | Facturas | Precio definido como GST incluido | Stripe Tax o configuración manual (validar con contador) |

## 1. Suscripción — Go live

- **Dónde:** `src/app/dashboard/page.tsx` (ítem "Go live").
- **Flujo:**
  1. Una server action crea o reutiliza el `Customer` de la organización (`organizations.stripe_customer_id`).
  2. Si no hay suscripción, abre **Checkout** con `quantity = 1`. Si ya existe, incrementa `quantity`.
  3. El webhook `checkout.session.completed` / `customer.subscription.*` actualiza `subscriptions` y `organizations.billing_status`, y pasa la sucursal a `active`.
- **Base de datos (falta):** una función `service_role` del estilo `set_location_status(location_id, status)`. Hoy `status` no se puede cambiar desde la API a propósito (test 7 de `001`).
- **Reglas:** para activar se exige al menos un profesional con horario y al menos un servicio (`getSetupStep` ya lo calcula).

## 2. Sucursales adicionales

- Cada sucursal `active` suma 1 a `quantity`. Pausar o archivar resta, con prorrateo de Stripe.
- `past_due` con 7 días de gracia; después, las sucursales pasan a `paused` (docs/04).

## 3. Portal de facturación

- Link generado por el servidor (`billingPortal.sessions.create`) para cambiar tarjeta, ver facturas y cancelar.
- Cancelar usa `cancel_at_period_end`: sin penalidad.

## 4. Connect — payouts

- **Dónde:** `src/app/dashboard/page.tsx` (ítem "Connect payouts").
- **Flujo:** se crea una cuenta Express por sucursal, se guarda `locations.stripe_account_id` (columna que la API no puede leer) y se redirige al Account Link. El webhook `account.updated` actualiza `stripe_charges_enabled`.
- **Efecto inmediato:** con `stripe_charges_enabled = true` y política con fee, `book_appointment` empieza a pedir tarjeta (punto 5) automáticamente.

## 5. Tarjeta al reservar

- **Ya existe:** `book_appointment` devuelve `status: "pending"` y `expires_at` (+10 min) cuando corresponde. El horario queda retenido por la restricción de exclusión y se libera solo al vencer.
- **Dónde:** `src/app/[slug]/book/actions.ts` redirige a `/{slug}/booked/{id}/card` si la cita queda `pending`. Esa pantalla hoy es un placeholder.
- **Falta:**
  1. Crear el `Customer` del cliente en la cuenta conectada (`location_clients.stripe_customer_id`) y un `SetupIntent` (`usage: off_session`).
  2. Stripe Elements en la pantalla de tarjeta.
  3. El webhook `setup_intent.succeeded` inserta `client_payment_methods` y llama a `confirm_pending_appointment` (ya existe, solo `service_role`).

## 6. Cobro de fees

- **Ya existe:** `cancel_appointment` (cliente, dentro de la ventana) y `mark_no_show(charge=true)` crean `booking_fees` en `pending`, con el monto calculado y su tope.
- **Dónde se llama:** `requestFeeCollection(feeId)` en `src/app/my-bookings/actions.ts` (cancelación tardía) y en `src/app/dashboard/calendar/actions.ts` (no-show).
- **Falta:** un PaymentIntent `off_session: true, confirm: true` en la cuenta conectada, con idempotency key `fee:{id}`, guardando `stripe_payment_intent_id`. Los webhooks `payment_intent.succeeded` / `payment_failed` actualizan el estado. Si requiere 3DS, se le envía un link al cliente.

## 7. Reembolsos

- **Ya existe:** `waive_fee` sobre un fee `succeeded` marca `refund_requested_at`. `mark_appointment_completed` sobre un no-show hace lo mismo con su fee.
- **Dónde se llama:** `requestFeeRefund(feeId)` después de esas acciones.
- **Falta:** `refunds.create` en la cuenta conectada; el webhook `charge.refunded` pasa el fee a `refunded`.

## 8. Disputas

- La evidencia ya se guarda: `cancellation_policy_id` (versión inmutable), `policy_accepted_at`, `policy_accepted_ip` y `audit_log`.
- **Falta:** el webhook `charge.dispute.created`, el aviso al negocio y el armado de la evidencia.

## Webhooks previstos

Una sola Edge Function que verifica la firma y registra `event.id` para no procesar dos veces. La lista completa está en docs/04.

## Variables de entorno (solo servidor)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_PRICE_LOCATION_MONTHLY`. Se usan claves `test` en desarrollo y `live` solo en producción.

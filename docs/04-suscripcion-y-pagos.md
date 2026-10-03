# 04 — Suscripción y pagos

Hay dos flujos de dinero completamente separados:

| Flujo | Quién paga | Quién cobra | Producto de Stripe |
|---|---|---|---|
| **Suscripción** | El negocio | La plataforma | Stripe Billing, en la cuenta de la plataforma |
| **Fees de cancelación y no-show** | El cliente final | La sucursal, 100% | Stripe Connect, con cargos directos en la cuenta de cada sucursal |

La plataforma nunca recibe ni custodia el dinero de los fees.

## Suscripción

**Precio:** NZ$49.99 por sucursal activa al mes, con GST incluido.

**Implementación:**

- Un `Customer` de Stripe por organización.
- Una `Subscription` por organización, con un único `Price` mensual
  recurrente (`tax_behavior: inclusive`) y `quantity` igual al número de
  sucursales facturables.
- El pago se hace con Stripe Checkout la primera vez. Después se gestiona en
  el Customer Portal de Stripe (cambiar tarjeta, descargar facturas,
  cancelar).

**Sucursales:**

- Una sucursal nueva se crea en estado `draft`. Mientras está en `draft` se
  puede configurar sin costo.
- Para activarla se exigen tres cosas: una suscripción al día, al menos un
  profesional con horario y al menos un servicio.
- Al activarla, la `quantity` sube en 1 y Stripe cobra la parte proporcional
  del mes.
- Al pausarla o archivarla, la `quantity` baja y queda un crédito
  proporcional para la siguiente factura.

**Cancelación de la suscripción:**

- Se puede cancelar en cualquier momento, sin cargo ni penalidad. Se usa
  `cancel_at_period_end`: el servicio sigue funcionando hasta el final del
  período pagado.
- Al vencer, todas las sucursales pasan a `paused`: la página pública muestra
  "no disponible para reservas online" y las citas futuras se mantienen.
- Los datos se conservan 90 días, con opción de exportarlos, y luego se
  eliminan (ver preguntas abiertas).

**Pagos fallidos:**

1. Stripe reintenta automáticamente (Smart Retries) y avisa por email.
2. La organización queda en `past_due` con 7 días de gracia; se muestra un
   aviso en el panel.
3. Pasada la gracia, las sucursales pasan a `paused`.
4. Al pagar, se reactivan solas.

**GST:** si la plataforma está registrada para GST, la factura debe ser un
*taxable supply information* válido (número de GST y desglose). Stripe Tax
puede encargarse de esto. **Validar con un contador** el registro, el umbral
y el formato de la factura.

## Stripe Connect (fees para el salón)

**Tipo de cuenta:** Express, una por **sucursal**, porque las sucursales operan
de forma independiente y pueden tener distinta razón social o cuenta
bancaria.

- Si una cadena prefiere cobrar todo en una sola cuenta, varias sucursales
  pueden apuntar al mismo `stripe_account_id` (ver preguntas abiertas).

**Onboarding:**

1. En el panel, el gerente o dueño hace clic en "Conectar cobros".
2. El servidor crea la cuenta Express y genera un Account Link.
3. Stripe hace la verificación de identidad (KYC) y pide la cuenta bancaria.
4. El webhook `account.updated` actualiza `stripe_charges_enabled`.
5. Hasta que esté habilitada, la sucursal funciona sin cobrar fees.

**Cargos:**

- Son *direct charges* en la cuenta conectada (`Stripe-Account` header), sin
  `application_fee_amount`.
- La comisión de procesamiento de Stripe la paga el salón, porque es su cargo.
  Esto se explica claramente en el onboarding.
- La tarjeta se guarda con un SetupIntent (`usage: off_session`) en un
  Customer creado en la cuenta conectada. Por eso la ficha del cliente
  (`location_clients`) es por sucursal.
- El cobro del fee es un PaymentIntent con `off_session: true, confirm: true`
  e idempotency key `fee:{booking_fee_id}`.
- En el estado de cuenta del cliente aparece el nombre del salón
  (`statement_descriptor` de la cuenta conectada), no el de la plataforma.

## Webhooks

Todos llegan a una Edge Function que verifica la firma, registra el
`event.id` para no procesarlo dos veces y responde rápido.

| Evento | Acción |
|---|---|
| `checkout.session.completed` | Vincular el Customer y la Subscription a la organización |
| `customer.subscription.created / updated / deleted` | Actualizar `subscriptions` y el estado de las sucursales |
| `invoice.payment_failed / paid` | Manejar `past_due` y la reactivación |
| `account.updated` (Connect) | Actualizar `stripe_charges_enabled` |
| `setup_intent.succeeded` (Connect) | Guardar `client_payment_methods` |
| `payment_intent.succeeded / payment_failed` (Connect) | Actualizar `booking_fees` |
| `charge.dispute.created` (Connect) | Avisar al negocio y preparar el paquete de evidencia |

## Seguridad

- Las claves secretas de Stripe solo existen en las Edge Functions, nunca en
  el frontend ni en el repo.
- Se usan entornos separados de prueba (`test`) y producción (`live`). En
  desarrollo solo se usan claves de prueba.
- Toda operación con dinero queda en `audit_log`: quién, cuándo, cuánto y por
  qué.

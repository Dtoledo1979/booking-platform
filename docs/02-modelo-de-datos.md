# 02 — Modelo de datos

## Convenciones

- Postgres en Supabase, esquema `app`. Nombres en inglés y `snake_case`.
- Claves primarias `uuid` (`gen_random_uuid()`).
- Dinero en **centavos enteros** (`amount_cents int`) con su `currency`
  (`'NZD'`). Nunca `float` ni `numeric` con decimales en la aplicación.
- Fechas y horas en `timestamptz` (UTC en la base de datos). Cada sucursal
  tiene su `timezone` y la interfaz convierte a esa zona, no a la del
  navegador.
- Horarios recurrentes como `weekday` (0 = domingo) + `time` local de la
  sucursal.
- Todas las tablas tienen `created_at`; las editables también `updated_at`.
- RLS activado en todas las tablas sin excepción. El navegador solo lee; las
  escrituras sensibles pasan por funciones del servidor.

## Diagrama general

```
organizations ──< locations ──< staff ──< staff_working_hours
      │              │            │
      │              │            └──< staff_services >── services >── service_categories
      │              │
      │              ├──< location_clients ──< client_payment_methods
      │              │          │
      │              ├──< appointments ──< appointment_services
      │              │          │
      │              │          ├──< booking_fees
      │              │          └──1 reviews
      │              │
      │              ├──< cancellation_policies (versionadas)
      │              ├──< time_off
      │              └──< location_photos
      │
      ├──< memberships (usuario + rol + alcance)
      └──1 subscriptions

auth.users ──1 user_profiles
```

## Entidades

### Organización y acceso

**`organizations`**: la cuenta que se suscribe y paga.
`id, name, owner_user_id, stripe_customer_id, status (active | past_due | canceled), created_at`

**`memberships`**: quién trabaja en la organización y con qué permisos.
`id, organization_id, user_id, role (owner | manager | reception | professional), location_id (null = toda la organización; obligatorio salvo para owner), invited_email, accepted_at`

- Un usuario puede tener varias filas: por ejemplo, gerente en dos
  sucursales.
- Las invitaciones son filas con `user_id` nulo hasta que la persona acepta.

**`user_profiles`**: datos personales de cualquier usuario (dueño, personal
o cliente).
`user_id (pk → auth.users), first_name, last_name, phone, phone_verified_at, locale, marketing_opt_in`

### Sucursal

**`locations`**: unidad independiente de operación y de cobro.

- Identidad: `id, organization_id, slug (único global), name, description, phone, email`
- Ubicación: `address_line, suburb, city, postcode, lat, lng, timezone`
- Estado: `status (draft | active | paused | archived), is_verified`.
  `is_verified` solo lo cambia el admin de plataforma.
- Reglas de reserva: `min_notice_minutes, max_advance_days, slot_step_minutes (15), default_buffer_minutes, require_card (bool), auto_assign_strategy`
- Cobros: `stripe_account_id, stripe_charges_enabled`
- Presentación: `amenities (jsonb), logo_path, cover_path`

`active` significa que la sucursal está pagada y configurada; solo una
sucursal `active` recibe reservas online.

**`location_photos`**: `id, location_id, path, category (venue | portfolio), sort_order`

**`location_opening_hours`**: horario que se muestra al público.
`location_id, weekday, opens_at, closes_at`

### Equipo y servicios

**`staff`**: profesional que atiende y aparece en la agenda.
`id, location_id, user_id (nullable: puede existir sin login), display_name, bio, photo_path, calendar_color, is_bookable_online, active, sort_order`

En el MVP un profesional pertenece a una sola sucursal (ver preguntas
abiertas).

**`staff_working_hours`**: `id, staff_id, weekday, starts_at (time), ends_at (time)`.
Admite varios tramos por día; por ejemplo, 9–13 y 14–18 representan un
descanso para almorzar.

**`time_off`**: `id, location_id, staff_id (null = toda la sucursal), starts_at, ends_at, reason`

**`service_categories`**: `id, location_id, name, sort_order`

**`services`**: `id, location_id, category_id, name, description, duration_minutes, buffer_after_minutes (null = usar el de la sucursal), price_cents, price_type (fixed | from), is_bookable_online, active, sort_order`

**`staff_services`**: qué profesional hace qué servicio.
`staff_id, service_id, price_cents_override (null), duration_minutes_override (null)`

Los overrides quedan nulos en el MVP y se activan en la Fase 2, sin migrar
datos.

### Clientes (CRM)

**`location_clients`**: ficha del cliente dentro de una sucursal.
`id, location_id, user_id (nullable: walk-in o cliente creado por teléfono), first_name, last_name, phone, email, notes, allergies, is_blocked, blocked_reason, stripe_customer_id (en la cuenta Connect de la sucursal)`

- Restricción única `(location_id, user_id)` cuando `user_id` no es nulo.
- Va por sucursal porque las sucursales son independientes y la tarjeta
  guardada vive en la cuenta de Stripe de esa sucursal.

**`client_payment_methods`**: `id, location_client_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default`.
Nunca se guarda el número de tarjeta; solo la referencia de Stripe.

### Citas

**`appointments`**: la visita. Tiene un cliente, una sucursal y un estado.

- `id, location_id, location_client_id, status, source (online | staff), created_by_user_id`
- Política aceptada: `cancellation_policy_id, policy_accepted_at, policy_accepted_ip`
- Cancelación: `cancelled_at, cancelled_by (client | business | system), cancellation_reason`
- `notes_from_client, internal_notes, expires_at` (solo para `pending`)

Valores de `status`:

| Estado | Significado |
|---|---|
| `pending` | Horario retenido mientras el cliente ingresa la tarjeta; vence a los 10 minutos. |
| `confirmed` | Cita confirmada. |
| `completed` | El cliente asistió. |
| `no_show` | El cliente no se presentó. |
| `cancelled` | Cancelada; `cancelled_by` indica por quién. |

**`appointment_services`**: cada servicio de la visita, con su profesional y
horario.
`id, appointment_id, service_id, staff_id (NOT NULL), starts_at, ends_at, hold_until (= ends_at + buffer), price_cents, duration_minutes, service_name_snapshot`

- El MVP crea un solo servicio por cita, pero el modelo ya admite varios
  (Fase 2) sin cambiar el esquema.
- El precio y el nombre se congelan al reservar.

**Regla anti-reserva-doble:**

```sql
exclude using gist (
  staff_id with =,
  tstzrange(starts_at, hold_until) with &&
) where (is_active)
```

`is_active` es una columna generada a partir del estado de la cita: vale
`true` para `pending` y `confirmed`. Siempre hay un `staff_id`; "sin
preferencia" se resuelve asignando un profesional al reservar. Así se elimina
la ambigüedad del prototipo.

### Política y fees

**`cancellation_policies`**: **versionadas e inmutables**. Cuando el negocio
cambia su política, se crea una versión nueva y las citas existentes
mantienen la que el cliente aceptó.

- `id, location_id, version, free_cancellation_hours`
- Cancelación tardía: `late_cancel_fee_type (none | fixed | percent), late_cancel_fee_value`
- No-show: `no_show_fee_type (none | fixed | percent), no_show_fee_value`
- `policy_text, created_at, created_by_user_id`

**`booking_fees`**: cada fee generado.

- `id, appointment_id, location_client_id, kind (late_cancel | no_show), amount_cents, currency`
- Estado: `status (pending | succeeded | failed | waived | refunded)`
- `stripe_payment_intent_id, failure_reason, created_by_user_id, waived_by_user_id, created_at`

### Suscripción

**`subscriptions`**: una por organización.

- `organization_id (único), stripe_subscription_id, status, quantity (sucursales facturadas)`
- `current_period_end, cancel_at_period_end, updated_at`

La fuente de verdad es Stripe; esta tabla se actualiza solo desde el webhook.

### Reputación y comunicaciones

**`reviews`**: `id, appointment_id (único), location_id, location_client_id, rating (1–5), comment, reply, replied_at, replied_by_user_id, hidden_at, hidden_reason`

- Solo se puede reseñar una cita `completed` del propio cliente, hasta
  N días después (ver preguntas abiertas).
- El cliente solo puede escribir `rating` y `comment`; la respuesta se
  escribe mediante una función que verifica el rol.

**`notifications`**: registro de envíos.
`id, appointment_id, channel (email | sms), template, recipient, status, provider_message_id, sent_at, error`

**`audit_log`**: `id, organization_id, actor_user_id, action, entity, entity_id, payload (jsonb), created_at`

## Qué se escribe desde el navegador y qué no

| Tabla | Navegador (con RLS) | Solo servidor (Edge Function o RPC) |
|---|---|---|
| Perfil de sucursal, fotos, servicios, horarios, `time_off` | Gerente y dueño | — |
| `appointments`, `appointment_services` | Solo lectura | Crear, mover, cancelar, completar, no-show |
| `booking_fees`, `client_payment_methods` | Solo lectura | Todo |
| `subscriptions`, `locations.status`, `is_verified`, `stripe_*` | Solo lectura | Todo |
| `memberships` | Solo lectura | Invitar, cambiar rol, quitar |
| `cancellation_policies` | Solo lectura | Crear una versión nueva |
| `reviews` | El cliente crea y edita su `rating` y `comment` | Respuesta del negocio, moderación |

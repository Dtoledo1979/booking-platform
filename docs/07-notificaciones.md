# 07 — Notificaciones y recordatorios

## Cómo funciona

1. **Cola en la base de datos (`notifications`).** Un trigger encola los
   mensajes que corresponden cada vez que una cita se crea, se confirma, se
   mueve o se cancela. Ninguna pantalla tiene que acordarse de avisar.
2. **Despachador** (`/api/cron/notifications`). Se ejecuta cada pocos
   minutos y hace tres cosas:
   - reclama los mensajes vencidos de los canales que tienen proveedor
     configurado;
   - vuelve a leer la cita (datos de contacto actuales) y descarta los
     recordatorios que ya no aplican;
   - envía el mensaje y registra el resultado.
3. **Reintentos.** Un envío fallido se reintenta hasta 3 veces, esperando
   10 y luego 20 minutos. Un mensaje que quedó a medio enviar, por ejemplo
   porque el proceso se cayó, se vuelve a tomar a los 15 minutos. Ningún
   mensaje sale dos veces: cada uno tiene una clave única y el envío por
   email usa una *idempotency key*.

## Qué se envía

| Mensaje | A quién | Canal | Cuándo |
|---|---|---|---|
| Confirmación de reserva | Cliente | Email + SMS | Al reservar, online o desde el panel |
| Reserva modificada | Cliente | Email + SMS | Al cambiar la fecha, la hora o el profesional |
| Cancelación | Cliente | Email + SMS | Al cancelar: si cancela el cliente, es su comprobante (con el fee, si corresponde); si cancela el negocio, incluye el motivo |
| Recordatorio antes de que cierre la ventana gratuita | Cliente | Email + SMS | 6 h antes de que termine la cancelación gratuita (con 24 h de ventana, 30 h antes de la cita) |
| Recordatorio cercano | Cliente | SMS | 2 h antes |
| Nueva reserva online | Negocio | Email | Al reservar online (no cuando reserva el propio equipo) |
| Cancelación de un cliente | Negocio | Email | Cuando el cliente cancela |

**Reglas:**

- Mover una cita anula sus recordatorios pendientes y programa los nuevos.
  Cancelarla, completarla o marcarla como no-show anula todos los pendientes.
- Una reserva que espera la tarjeta (`pending`) no envía nada. Si la
  retención vence, tampoco.
- Cada sucursal puede desactivar el email o el SMS en **Messages**.
- El SMS solo se envía a móviles de NZ (02x), en formato +64. Si el cliente no
  tiene móvil, el mensaje queda como "Not sent" con el motivo.
- Los emails al negocio van al email de la sucursal (Location profile). Si no
  tiene, van al email del dueño.

## Configuración (antes de lanzar)

Estas variables van **solo en el servidor**: en `.env.local` en desarrollo y en
el panel del hosting en producción. Nunca deben tener el prefijo
`NEXT_PUBLIC_`.

### 1. Clave de servicio de Supabase (obligatoria para el despachador)

Supabase → **Project Settings → API Keys → Secret keys**. Crea una y cópiala en
`SUPABASE_SECRET_KEY`. Esta clave salta todas las reglas de seguridad: no la
compartas ni la pegues en un chat.

### 2. Email — Resend

1. Crea una cuenta en resend.com.
2. **Domains → Add domain**: agrega el dominio definitivo y crea los registros
   DNS que te indique (SPF y DKIM). Sin dominio verificado solo puedes
   enviarte emails a ti mismo.
3. **API Keys → Create**, con permiso *Sending access*. Cópiala en
   `RESEND_API_KEY`.
4. Define el remitente en `EMAIL_FROM`, por ejemplo
   `Bookings <bookings@tudominio.co.nz>`. Los emails a clientes muestran el
   nombre del salón con esa dirección, y las respuestas van al email del
   salón.

### 3. SMS — Twilio

1. Crea una cuenta en twilio.com y verifica tu identidad.
2. Consigue un número o remitente que pueda enviar SMS a Nueva Zelanda.
   Revisa en Twilio qué opciones ofrece hoy para NZ (número o *sender ID*
   alfanumérico) y sus requisitos de registro.
3. Copia `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y el número o remitente en
   `TWILIO_FROM`.
4. Revisa el costo por SMS en NZ para definir el límite incluido en el plan
   (pregunta abierta 11).

### 4. Programador (cron)

Define una clave aleatoria larga en `CRON_SECRET` y programa una llamada cada 5
minutos:

```
GET https://tudominio/api/cron/notifications
Authorization: Bearer <CRON_SECRET>
```

Opciones según el hosting:

- **Netlify:** una *scheduled function*.
- **Vercel:** Cron Jobs.
- **Supabase:** `pg_cron` + `pg_net`.

En desarrollo se puede llamar a mano:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notifications
```

Mientras falte un proveedor, sus mensajes quedan como **Scheduled** en
Messages, sin consumir intentos, y salen en cuanto se configure.

## Pendiente

- Opción de que el cliente se dé de baja de los SMS (Twilio responde STOP
  automáticamente; falta reflejarlo en la ficha del cliente).
- Plantillas editables por el negocio.
- Recordatorio para volver a reservar (Fase 2).

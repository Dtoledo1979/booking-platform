# Booking Platform (nombre provisional)

Plataforma SaaS de reservas para negocios de belleza y cuidado personal en
Nueva Zelanda: profesionales independientes, salones con equipo y cadenas con
varias sucursales que operan de forma independiente.

> El nombre comercial todavía no está definido (depende del dominio). En el
> código siempre se usa la configuración de marca (`APP_NAME`), nunca un
> nombre escrito a mano.

## Estado

Fase de especificación. Todavía no hay código: primero se revisa y aprueba la
documentación de `docs/`.

## Documentación

| Archivo | Contenido |
|---|---|
| [docs/01-producto.md](docs/01-producto.md) | Visión, tipos de cliente, roles, alcance del MVP y fases |
| [docs/02-modelo-de-datos.md](docs/02-modelo-de-datos.md) | Entidades, relaciones y reglas de integridad |
| [docs/03-reservas-y-cancelaciones.md](docs/03-reservas-y-cancelaciones.md) | Disponibilidad, flujo de reserva, cancelación, no-show y fees |
| [docs/04-suscripcion-y-pagos.md](docs/04-suscripcion-y-pagos.md) | Suscripción por sucursal, Stripe Billing y Stripe Connect |
| [docs/05-preguntas-abiertas.md](docs/05-preguntas-abiertas.md) | Decisiones pendientes, cada una con un valor por defecto propuesto |

## Stack previsto

- Next.js + TypeScript + Tailwind
- Supabase propio (Postgres, Auth, Storage, Edge Functions), región Sídney
- Stripe Billing (suscripción) + Stripe Connect (cobros de los salones)
- Resend (email) y Twilio (SMS)
- Migraciones con Supabase CLI, tests de RLS, GitHub Actions

## Antecedente

Este proyecto reemplaza al prototipo `topcoat-booking`
(`topcoatbookings.netlify.app`). Del prototipo se conservan solo ideas
probadas: la restricción de exclusión contra reservas dobles, el cálculo de
disponibilidad en Postgres y los permisos por columna en reseñas.

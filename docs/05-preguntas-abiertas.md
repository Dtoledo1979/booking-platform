# 05 — Preguntas abiertas

Cada pregunta tiene un **valor por defecto propuesto**. Si no se decide otra
cosa, se construye con ese valor.

## Decididas

| Tema | Decisión |
|---|---|
| Precio | NZ$49.99 por sucursal activa al mes, con GST incluido |
| Penalidad por cancelar la suscripción | Ninguna |
| Fee de cancelación y no-show del cliente final | 100% para el salón; la plataforma no retiene nada |
| Mercado inicial | Nueva Zelanda, NZD |
| Frontend | Next.js + TypeScript |
| Infraestructura | Repo nuevo y proyecto de Supabase propio (no compartido con Passport) |
| Nombre | Provisional; se cambia cuando haya dominio |

## Producto

| # | Pregunta | Valor por defecto propuesto |
|---|---|---|
| 1 | ¿Hay período de prueba gratis? | Sí, 14 días sin tarjeta para la primera sucursal. Las sucursales en `draft` siempre son gratis. |
| 2 | ¿Un profesional puede trabajar en más de una sucursal? | No en el MVP. Se modela como dos fichas de `staff`. |
| 3 | ¿La ficha de cliente es por sucursal o compartida en la cadena? | Por sucursal, porque la tarjeta vive en la cuenta Stripe de cada una. Más adelante: vista consolidada para el dueño. |
| 4 | ¿Varias sucursales pueden compartir una misma cuenta de Stripe? | Sí, como opción del dueño. |
| 5 | Valores por defecto de la política de cancelación | Ventana gratuita de 24 h; fee tardío del 50%; no-show del 100%. El negocio puede cambiarlos o desactivarlos. |
| 6 | ¿Hay un fee mínimo o máximo permitido por la plataforma? | Máximo: el precio del servicio. Mínimo: ninguno. |
| 7 | ¿La tarjeta es obligatoria para reservar online? | Sí, si la sucursal tiene una política con fee y Stripe conectado. Se puede desactivar por sucursal. |
| 8 | ¿Cómo se verifica la identidad del cliente? | Email con link mágico o contraseña. El teléfono se valida por SMS en la primera reserva (reduce reservas falsas). |
| 9 | ¿Cuánto tiempo después de la visita se puede dejar una reseña? | 30 días. |
| 10 | ¿Cuánto tiempo se conservan los datos después de cancelar la suscripción? | 90 días, con exportación disponible; luego se eliminan. |
| 11 | ¿Quién paga los SMS? | Incluidos en el precio hasta un límite razonable por sucursal (por ejemplo, 300 al mes); después, se cobra un paquete extra. Validar con los costos reales de Twilio en NZ. |
| 12 | ¿Hay directorio o marketplace en el MVP? | No. Solo una página por sucursal y links directos. El directorio queda para la Fase 3. |

## Para validar fuera del código

| # | Tema | Con quién |
|---|---|---|
| A | Razonabilidad de los fees y redacción de la política según la Fair Trading Act y la CGA | Abogado en NZ |
| B | Términos y condiciones de la plataforma y política de privacidad (Privacy Act 2020) | Abogado en NZ |
| C | Registro de GST y formato de factura de la suscripción | Contador |
| D | Disponibilidad del dominio y de la marca (IPONZ) para el nombre definitivo | Dueños del proyecto |
| E | Costos reales de Twilio y Resend en NZ para fijar el límite de SMS | Dueños del proyecto |

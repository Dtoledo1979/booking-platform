# 01 — Producto

## Visión

Una plataforma de reservas y gestión para negocios que trabajan con cita
previa (peluquería, barbería, uñas, estética), con identidad propia. Toma
como referencia la estructura de Fresha (Acquire → Operate → Monetize →
Retain), pero empieza por lo que más le duele al negocio pequeño: agenda
ordenada, menos ausencias y cobro de cancelaciones tardías.

**Diferenciadores frente a Fresha:**

- Precio plano por sucursal, sin comisiones sobre clientes nuevos.
- El fee de cancelación y no-show es para el salón al 100%; la plataforma no
  retiene nada.
- La suscripción no tiene permanencia ni penalidad por cancelar.

## Mercado de lanzamiento

- Nueva Zelanda, moneda NZD, precios con GST incluido.
- Idioma de la interfaz: inglés (`en-NZ`). La arquitectura debe permitir
  agregar idiomas más adelante.
- Zona horaria por sucursal (por defecto `Pacific/Auckland`).
- Cumplimiento: Privacy Act 2020, Fair Trading Act y Consumer Guarantees Act.
  Los textos legales y la razonabilidad de los fees los revisa un abogado
  antes del lanzamiento.

## Tipos de cliente (quien se suscribe)

| Segmento | Cómo se ve en el sistema |
|---|---|
| **Independiente** | 1 organización, 1 sucursal, 1 profesional (el mismo dueño). La interfaz oculta lo de equipo y sucursales. |
| **Salón con equipo** | 1 organización, 1 sucursal, varios profesionales. |
| **Cadena** | 1 organización, varias sucursales. Cada sucursal tiene su agenda, servicios, precios, política de cancelación y cuenta de cobro. |

El código es el mismo para los tres; solo cambia cuánto se muestra.

## Roles

| Rol | Alcance | Puede |
|---|---|---|
| **Admin de plataforma** | Global | Verificar negocios, ocultar reseñas abusivas, soporte. Nunca usa la app con la sesión de un cliente. |
| **Dueño** | Organización | Todo: facturación, crear y cerrar sucursales, usuarios y roles, configuración. |
| **Gerente** | Una o más sucursales | Configurar su sucursal (servicios, horarios, equipo, política), ver reportes de su sucursal, gestionar todas las citas. |
| **Recepción** | Una o más sucursales | Ver y gestionar las citas de todos los profesionales, crear citas, ver fichas de clientes. Sin configuración ni reportes financieros. |
| **Profesional** | Su propia agenda | Ver sus citas, marcar completada o no-show, bloquear su tiempo libre, ver la ficha de sus clientes. |
| **Cliente final** | Sus propias reservas | Reservar, cancelar, reprogramar, dejar reseñas, gestionar sus tarjetas guardadas. |

Una misma persona puede tener varios roles; por ejemplo, el dueño de un
negocio independiente es dueño y profesional a la vez.

## Alcance del MVP (Fase 1)

Es lo mínimo para empezar a cobrar NZ$49.99 por sucursal.

### Negocio

- Registro, creación de la organización y de la primera sucursal (asistente
  de configuración guiado).
- Suscripción con Stripe Billing; agregar y cerrar sucursales.
- Conexión de la cuenta de Stripe de cada sucursal (Stripe Connect) para
  cobrar fees.
- Perfil de sucursal: nombre, dirección con mapa, fotos, logo, servicios
  destacados, características (estacionamiento, accesibilidad, etc.).
- Catálogo de servicios con categorías; qué profesional hace cada servicio.
- Equipo: invitar profesionales y personal por email, con su rol.
- Horarios por profesional, horario de apertura de la sucursal, vacaciones y
  bloqueos.
- Calendario de día y semana por profesional y por sucursal; crear,
  mover y cancelar citas desde el panel (teléfono, walk-in).
- Política de cancelación y no-show configurable por sucursal.
- Marcar citas como completadas o no-show; cobrar el fee de no-show;
  perdonar o reembolsar un fee.
- Ficha básica de cliente: historial, notas, alergias, fees pendientes,
  bloqueo.
- Responder reseñas.

### Cliente final

- Página pública de cada sucursal (optimizada para Google y para compartir
  en redes), sin necesidad de iniciar sesión para verla.
- Reserva: servicio → profesional o "sin preferencia" → horario → cuenta →
  tarjeta y aceptación de la política → confirmación.
- Mis reservas: cancelar (mostrando el fee antes de confirmar), reprogramar,
  agregar al calendario.
- Reseña después de la visita.
- Gestión de tarjetas guardadas.

### Comunicaciones

- Email de confirmación, cambio y cancelación.
- Recordatorio por email y SMS antes de que cierre la ventana de cancelación
  gratuita (ver `03-reservas-y-cancelaciones.md`).
- Aviso al negocio de cada reserva nueva o cancelada.

### Plataforma

- Panel interno mínimo: listado de organizaciones, verificación de
  sucursales, moderación de reseñas.
- Registro de auditoría de acciones sensibles (cobros, cambios de rol,
  cambios de política).

## Fases posteriores

| Fase | Contenido |
|---|---|
| **2 — Retención** | Depósitos y prepago; precio y duración distintos por profesional; varios servicios en una misma visita; lista de espera; checkout en el local con propina; formularios de consentimiento; recordatorio automático para volver a reservar; reportes de ventas, ocupación y cancelaciones; exportar datos. |
| **3 — Plataforma** | Directorio o marketplace de negocios; inventario y venta de productos; comisiones del equipo; precios dinámicos por horario; fidelización, membresías y gift cards; recursos físicos (salas, sillas); app móvil. |

## Requisitos no funcionales

- Diseño mobile-first: los dueños gestionan su agenda desde el teléfono.
- Accesibilidad WCAG 2.1 AA en el flujo de reserva.
- Página pública con carga rápida en 4G (objetivo: LCP menor a 2,5 s).
- Toda operación con dinero o que cambie el estado de una cita se ejecuta en
  el servidor. El navegador nunca escribe directamente en esas tablas.
- Seguridad en la base de datos (RLS) cubierta por tests automáticos.
- Copias de seguridad diarias y la posibilidad de exportar los datos de un
  negocio.
- La marca (nombre, colores, logo, dominio) se cambia desde un único archivo
  de configuración.

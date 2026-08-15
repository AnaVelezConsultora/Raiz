# Raíz — qué cambió en cada versión

Este archivo es para la mesa, no para quien programa. Dice qué puede hacer la
herramienta que ayer no podía, en el idioma en que se le explica a un líder o a una
entidad. El detalle técnico está en el historial del repositorio.

La versión se ve en el pie de la aplicación y también la responde el servidor. Cuando
alguien reporte un problema, esos dos números son lo primero que hay que preguntar:
un celular puede quedarse con una versión vieja durante días.

Se numera `mayor.menor.parche`, y hoy todo sale junto: la aplicación del celular, el
servidor y el contrato que comparten llevan siempre el mismo número.

---

## 0.2.0 — 15 de agosto de 2026

**La herramienta dejó de vivir solo en los computadores del equipo.** La aplicación
está publicada y el servidor existe, así que por primera vez un caso capturado en una
vereda puede llegar a una base central.

- Un líder entra con su correo y su clave, y captura sin señal. La sesión se pide una
  sola vez: después se trabaja sin conexión y se sincroniza al bajar.
- Las cuentas las crea la coordinación. No hay registro abierto, y es a propósito: lo
  que se escribe con esa cuenta es el padrón de familias damnificadas.
- El caso viaja solo al recuperar señal; las fotografías esperan una decisión, porque
  pesan sesenta veces más y los datos los paga el voluntario.
- Si se cae la señal a mitad de un envío, el reintento actualiza la misma familia en
  vez de duplicarla. El total consolidado es lo que sustenta cada petición ante una
  entidad, y un duplicado silencioso lo arruina.
- Sin autorización de la familia, la identidad no se guarda: ni nombre, ni apellidos,
  ni documento. Ahora lo rechaza también la base, no solo la aplicación.
- El formulario distingue "no se puede vivir ahí" de "nadie preguntó", avisa cuando el
  daño y la habitabilidad se contradicen, y ofrece registrar a la siguiente familia de
  la misma casa sin volver a tomar la ubicación.

**Lo que todavía no:** nadie la ha usado en la vereda con señal intermitente, quien
crea una cuenta conoce la clave de esa persona, y siguen abiertas tres decisiones de
tratamiento de datos que no son técnicas.

---

## 0.1.0 — 13 de agosto de 2026

La primera versión que se podía mostrar. Captura sin conexión en el celular, guardado
en el dispositivo, fotografías comprimidas y coordenada por satélite. Todo vivía en el
teléfono: no había servidor al que mandar nada.

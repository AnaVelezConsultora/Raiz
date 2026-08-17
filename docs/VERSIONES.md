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

## 0.6.1 — 16 de agosto de 2026

**El mapa del tablero salía en blanco.** Las cifras estaban bien y debajo no había nada.
Duró lo que tardó abrirlo: se publicó, se vio y se corrigió.

La causa es de las que no se ven probando: la librería del mapa se empaqueta distinto
para publicar que para trabajar, y en lo publicado no arrancaba. Ahora la prueba
automática abre el tablero **sobre el paquete que se sube**, no sobre el de desarrollo,
así que un fallo así vuelve a aparecer antes y no en el celular de un coordinador.

---

## 0.6.0 — 16 de agosto de 2026

**Un tablero para decidir a dónde van los recursos.** Hasta ahora los datos entraban y
no había dónde mirarlos juntos: para saber cuántas familias había en una vereda alguien
tenía que pedirlo y esperar.

- **Coordinación y custodia tienen un tablero con las cifras y el mapa.** Cuántas
  familias, cuántas personas, cuántos menores, cuántos de 60 o más, cuántos en riesgo de
  vida y cuántos casos todavía sin ubicar. Debajo, un punto por afectación, del color de
  su prioridad, y al tocarlo el resumen del caso.
- **Se puede filtrar por zona rural o urbana, y dejar sólo los de riesgo de vida.** Las
  cifras y el mapa se mueven juntos: lo que se cuenta arriba es lo que se ve abajo.
- **El líder no ve el tablero, y es a propósito.** Su trabajo es la ficha de las familias
  que atiende. Quien reparte recursos entre veredas necesita el conjunto; quien registra,
  no — y menos datos a la vista es menos exposición.
- **El tablero no muestra nombres ni teléfonos.** Sirve para contar, ubicar y priorizar.
  Y el punto ubica la afectación, no la vivienda: la coordenada tiene la precisión que
  tuvo el celular ese día.
- **Sin señal no hay tablero, y lo dice.** No guarda cifras para mostrarlas después:
  enseñarle a una entidad los números de ayer sin avisar es peor que no enseñar nada.
- El mapa sólo se descarga si se abre esta pantalla. Un líder en la vereda no gasta un
  byte de su plan de datos en algo que no va a usar.

---

## 0.5.0 — 16 de agosto de 2026

**Las fotografías llegan completas, y ya se sabe quién puede dar de alta a quién.**

- **Las fotografías se envían por partes y se retoman donde iban.** En una red que se
  cae cada tanto, antes se perdía la carga entera y había que empezar de nuevo. Ahora lo
  que ya subió, subido queda.
- **Si una fotografía llega dañada, no se guarda.** El celular y el servidor comparan la
  imagen entera; si no coincide, se descarta y se vuelve a pedir. Una foto a medias es
  peor que ninguna, porque parece prueba y no lo es.
- **Las fotografías no son públicas.** No se pueden abrir con el enlace: hay que entrar
  con una cuenta, y cada quien alcanza las de los casos que ya podía ver.
- **La custodia crea coordinadores y los coordinadores crean quien registra**, pidiendo
  cédula, nombres completos y teléfono. Antes las cuentas se creaban a mano por fuera.
- **Una clave que no cumple ya no deja media cuenta creada.** Se avisa antes de guardar
  nada, con las reglas escritas, y la aplicación propone una clave que se puede dictar
  por teléfono sin confundir un cero con una o.
- Hay botón para volver atrás, que faltaba: la aplicación instalada no tiene el del
  navegador.

---

## 0.4.0 — 16 de agosto de 2026

**La primera versión que salió de una ficha llenada en terreno.** Un líder registró una
familia de noche y sin internet, y devolvió una lista de lo que faltaba. Casi todo esto
sale de ahí.

- **El total de personas y las edades tienen que coincidir para continuar.** Antes se
  podía enviar un caso que decía siete personas y repartía una. Ese registro no sirve
  para pedir nada, porque la ayuda se asigna por edades, y nadie vuelve a llamar a esa
  familia para arreglarlo.
- **La autorización de la familia se pregunta con dos botones y no se puede saltar.**
  Una casilla sin marcar no distinguía «dijo que no» de «nadie preguntó», y de esa
  respuesta depende si el nombre de una persona se guarda.
- **Se registran personas fallecidas y heridas**, separando las que fueron llevadas a un
  hospital. Es lo primero que pide una entidad de salud y no existía.
- **Se registra la maquinaria y los vehículos de trabajo**, y hay campo abierto en
  cultivos, infraestructura, reactivación y necesidades. Una casa puede quedar intacta y
  la familia sin sustento.
- **El bloque de cultivos por fin se guarda.** La aplicación lo capturaba desde el primer
  día y el servidor lo desechaba: se perdía la mitad del daño en un municipio que vive
  del café.
- La coordenada se puede abrir en el mapa, y la aplicación avisa cuando la precisión es
  tan baja que dos casas vecinas caen en el mismo punto.
- Vereda, corregimiento y centro poblado son un solo campo; los campos obligatorios
  dicen que lo son; la interfaz tiene tildes.
- **La aplicación toma los colores del sello del equipo.**
- El mapa público se genera desde la base y no desde un archivo escrito a mano.
- Hay [manual de campo](manual.html) para los líderes.

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

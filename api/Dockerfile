# =============================================================================
# Imagen de la API de Raiz.
#
# El contexto de construccion es la RAIZ del repositorio, no api/, porque el
# paquete @raiz/dominio vive al lado y la API lo importa:
#
#   docker build -f api/Dockerfile -t raiz-api .
#
# Dos etapas. La primera compila con todas las herramientas; la segunda solo
# lleva lo que hace falta para correr. La imagen final no incluye TypeScript, ni
# el compilador de Nest, ni el codigo fuente.
# =============================================================================

# --- etapa 1: compilar -------------------------------------------------------
FROM node:22-alpine AS construccion
WORKDIR /obra

# Primero los manifiestos y despues el codigo. Docker cachea por capa, asi que
# mientras no cambien las dependencias esta capa se reutiliza y una correccion de
# una linea no vuelve a descargar el arbol entero.
COPY package.json package-lock.json ./
COPY dominio/package.json dominio/
COPY api/package.json api/

# `npm ci` y no `npm install`: instala exactamente lo que dice el lock. Si el
# lock y el manifiesto no coinciden, falla en vez de resolver por su cuenta, que
# es lo que se quiere en una construccion reproducible.
RUN npm ci --workspace @raiz/dominio --workspace @raiz/api --include-workspace-root

COPY dominio/ dominio/
COPY api/ api/
RUN npm run build --workspace @raiz/dominio \
 && npm run build --workspace @raiz/api

# Se rehace la instalacion sin dependencias de desarrollo. Lo que no esta en la
# imagen no se puede explotar ni hay que parchearlo.
RUN npm ci --omit=dev --workspace @raiz/dominio --workspace @raiz/api --include-workspace-root

# --- etapa 2: correr ---------------------------------------------------------
FROM node:22-alpine AS servicio
WORKDIR /servicio

# Sin privilegios. Si algun dia alguien logra ejecutar codigo dentro del
# contenedor, que no sea como administrador.
RUN addgroup -S raiz && adduser -S raiz -G raiz

COPY --from=construccion --chown=raiz:raiz /obra/node_modules ./node_modules
COPY --from=construccion --chown=raiz:raiz /obra/package.json ./package.json
COPY --from=construccion --chown=raiz:raiz /obra/dominio/dist ./dominio/dist
COPY --from=construccion --chown=raiz:raiz /obra/dominio/package.json ./dominio/package.json
COPY --from=construccion --chown=raiz:raiz /obra/api/dist ./api/dist
COPY --from=construccion --chown=raiz:raiz /obra/api/package.json ./api/package.json

USER raiz

# App Runner manda el puerto en PORT. La API lee PUERTO, asi que se igualan aqui
# en vez de cambiar el codigo: el mismo contenedor sirve en local, en Fargate o
# donde sea, y cada plataforma dice el puerto a su manera.
ENV NODE_ENV=production
ENV PUERTO=8080
EXPOSE 8080

# Sin `npm start`: npm se queda como proceso padre y se traga las senales, de
# modo que al reciclar el contenedor la parada tarda hasta que alguien lo mate a
# la fuerza. Node directo recibe SIGTERM y cierra el pool de PostgreSQL como debe.
CMD ["node", "api/dist/main.js"]

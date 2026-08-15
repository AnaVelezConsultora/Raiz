# Atajos del entorno local. Ver README.md.
.PHONY: arriba abajo limpio pruebas e2e ciclo psql logs estado

## arriba   levanta la base, S3, Cognito y siembra datos de prueba
arriba:
	docker compose up -d --wait db aws cognito
	docker compose up bootstrap siembra
	@echo ""
	@echo "Listo. Usuarios de prueba con contrasena Raiz.local.2026"
	@docker compose run --rm --no-deps -T bootstrap cat /generado/entorno.generado.env 2>/dev/null || true

## pruebas  corre las verificaciones de control de acceso de SEGURIDAD.md
pruebas:
	docker compose exec -T db psql -U postgres -d raiz -f /pruebas/seguridad.sql

## e2e      flujo operativo completo: capturar, sincronizar, remitir, seguir
e2e:
	./pruebas/flujo-completo.sh

## ciclo    contra la API local: casos, y fotografias por bloques con reanudacion
##          Exige la API corriendo. El `sub` de Ana se resuelve solo.
ciclo:
	@SUB=$$(docker compose exec -T db psql -U postgres -d raiz -t -A \
	  -c "select id from auth.users where email='ana@ejemplo.test';"); \
	node ./pruebas/ciclo-api.mjs $${API_URL:-http://localhost:3021} $$SUB

## psql     consola contra la base
psql:
	docker compose exec db psql -U postgres -d raiz

## estado   que esta corriendo
estado:
	docker compose ps

## logs     seguir los registros
logs:
	docker compose logs -f

## abajo    apaga conservando los datos
abajo:
	docker compose down

## limpio   apaga y BORRA los datos (obligatorio si cambio el esquema o el shim)
limpio:
	docker compose down -v

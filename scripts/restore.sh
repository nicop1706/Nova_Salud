#!/usr/bin/env bash
# Restaura un respaldo en la base del contenedor `db`. SOBRESCRIBE los datos actuales.
# Uso: scripts/restore.sh backups/novasalud-AAAAMMDD-HHMMSS.sql.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "Uso: $0 <archivo.sql.gz> [--yes]" >&2; exit 1; }
[ -f .env ] && set -a && . ./.env && set +a
DB="${POSTGRES_DB:-novasalud}"; USER_="${POSTGRES_USER:-novasalud}"

if [ "${2:-}" != "--yes" ]; then
  read -r -p "Esto reemplazará TODOS los datos de '$DB'. ¿Continuar? [escribe SI] " ans
  [ "$ans" = "SI" ] || { echo "Cancelado."; exit 1; }
fi

echo "Deteniendo la API para evitar escrituras durante la restauración…"
docker compose stop backend >/dev/null
gunzip -c "$FILE" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "$USER_" -d "$DB" >/dev/null
docker compose start backend >/dev/null
echo "Restauración completada desde $FILE. La API se está reiniciando."

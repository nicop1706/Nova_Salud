#!/usr/bin/env bash
# Respaldo de la base de datos (pg_dump comprimido) desde el contenedor `db`.
# Uso: scripts/backup.sh [carpeta_destino]     (por defecto ./backups)
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-backups}"
mkdir -p "$DEST"
[ -f .env ] && set -a && . ./.env && set +a
DB="${POSTGRES_DB:-novasalud}"; USER_="${POSTGRES_USER:-novasalud}"
FILE="$DEST/novasalud-$(TZ=America/Lima date +%Y%m%d-%H%M%S).sql.gz"

docker compose exec -T db pg_dump -U "$USER_" -d "$DB" --no-owner --no-privileges --clean --if-exists | gzip -9 > "$FILE"
[ -s "$FILE" ] || { echo "ERROR: el respaldo quedó vacío" >&2; rm -f "$FILE"; exit 1; }
chmod 600 "$FILE"
echo "Respaldo creado: $FILE ($(du -h "$FILE" | cut -f1))"

# Retención opcional: BACKUP_KEEP=14 conserva los 14 más recientes
if [ -n "${BACKUP_KEEP:-}" ]; then
  ls -1t "$DEST"/novasalud-*.sql.gz | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f
fi

#!/usr/bin/env bash
# Nightly backup: database dump + uploaded files, kept 14 days locally and,
# when BACKUP_S3_BUCKET is set in .env, copied to an S3-compatible bucket.
# Cron: 0 2 * * * /opt/claw/backup.sh >> /var/log/claw-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"
set -a
source .env
set +a

BACKUP_DIR=${BACKUP_DIR:-/var/backups/claw}
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"

docker compose exec -T db pg_dump -U "${PG_DATABASE_USER:-postgres}" -Fc "${PG_DATABASE_NAME:-default}" \
  > "$BACKUP_DIR/db-$STAMP.dump"

docker run --rm \
  -v claw_server-local-data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/files-$STAMP.tar.gz" -C /data .

find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  for file in "db-$STAMP.dump" "files-$STAMP.tar.gz"; do
    docker run --rm \
      -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
      -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
      -v "$BACKUP_DIR":/backup:ro \
      amazon/aws-cli s3 cp "/backup/$file" "s3://$BACKUP_S3_BUCKET/$file" \
      --endpoint-url "$BACKUP_S3_ENDPOINT"
  done
fi

echo "$STAMP backup done"

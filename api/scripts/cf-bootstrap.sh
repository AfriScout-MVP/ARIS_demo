#!/usr/bin/env bash
# Creates what ARIS needs on a Cloudflare account — safe to run again, it only adds what is missing:
#   • the D1 database  (SQL)
#   • the R2 bucket    (photos, licences, certificates, receipts)
# Both names are read from wrangler.jsonc — today ARIS_DB and aris-media.
# and writes the real D1 id into api/wrangler.jsonc (a local edit — do not commit it).
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... api/scripts/cf-bootstrap.sh
#
# Needs: node, jq. R2 must be enabled on the account (Cloudflare dashboard → R2 → Purchase/Enable).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# The names come from wrangler.jsonc so this script and the Worker cannot drift apart.
eval "$(npx --no-install tsx scripts/lib/resources.ts)"
: "${DB_NAME:?Could not read the D1 database name from wrangler.jsonc}"
: "${BUCKET:?Could not read the R2 bucket name from wrangler.jsonc}"
wrangler() { npx --no-install wrangler "$@"; }

database_id() {
  wrangler d1 list --json | jq -r --arg n "$DB_NAME" '[.[] | select(.name == $n)][0].uuid // empty'
}

id="$(database_id)"
if [ -z "$id" ]; then
  echo "Creating D1 database $DB_NAME …"
  wrangler d1 create "$DB_NAME" >/dev/null
  id="$(database_id)"
fi
[ -n "$id" ] || { echo "Could not find or create the D1 database $DB_NAME" >&2; exit 1; }
echo "D1 database $DB_NAME = $id"

tmp="$(mktemp)"
sed -E "s/(\"database_id\"[[:space:]]*:[[:space:]]*\")[^\"]*(\")/\1${id}\2/" wrangler.jsonc > "$tmp"
cat "$tmp" > wrangler.jsonc
rm -f "$tmp"

if out="$(wrangler r2 bucket create "$BUCKET" 2>&1)"; then
  echo "Created R2 bucket $BUCKET"
elif grep -qiE "already exists|10004" <<<"$out"; then
  echo "R2 bucket $BUCKET already exists"
else
  echo "$out" >&2
  echo "Could not create the R2 bucket. Is R2 enabled on this account?" >&2
  exit 1
fi

#!/usr/bin/env bash
#
# Familee - applying the migrations
#
# Postgres is already running on the server, so this script only connects
# to it and replays db/migrations/*.sql in file-name order.
# Every migration is idempotent: running it again is safe.
#
# Each file opens and closes its own transaction, which is why
# --single-transaction is not used here.
#
# On the server:
#   DATABASE_URL=postgres://familee:password@127.0.0.1:5432/familee ./db/apply.sh
#
# Or through Docker, without installing psql on the server (the migrate
# service takes DATABASE_URL from .env and connects to your postgres):
#   docker compose run --rm migrate
#
# Pass "seed" to load the demo family from db/seed.sql after the
# migrations. That script drops and recreates the tree with the slug
# 'demo', so it must stay an explicit choice:
#   docker compose run --rm migrate seed

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_sql() {
    psql "$DATABASE_URL" \
        --quiet \
        --no-psqlrc \
        --variable=ON_ERROR_STOP=1 \
        --file="$1"
}

shopt -s nullglob
files=("$dir"/migrations/*.sql)

if [ ${#files[@]} -eq 0 ]; then
    echo "No files found in $dir/migrations" >&2
    exit 1
fi

for file in "${files[@]}"; do
    echo "-> $(basename "$file")"
    run_sql "$file"
done

echo
echo "Applied migrations:"
psql "$DATABASE_URL" --no-psqlrc --tuples-only --command \
    "select version || '  ' || to_char(applied_at, 'YYYY-MM-DD HH24:MI')
       from familee.schema_migrations order by version;"

# "test" runs the smoke tests from db/tests/smoke.sql. They run in a transaction
# that is rolled back, so they never change the data. Run them after "seed",
# because they expect the demo tree to exist:
#   docker compose run --rm migrate seed test
for arg in "$@"; do
    case "$arg" in
        seed)
            echo
            echo "-> seed.sql (recreates the 'demo' tree)"
            run_sql "$dir/seed.sql"
            ;;
        test)
            echo
            echo "-> tests/smoke.sql (rolled back)"
            run_sql "$dir/tests/smoke.sql"
            ;;
        *)
            echo "Unknown argument: $arg (expected seed or test)" >&2
            exit 1
            ;;
    esac
done

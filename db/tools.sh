#!/usr/bin/env bash
#
# Familee - the psql tools for the database (the "tools" compose service)
#
# The application image applies the migrations itself on start (db/migrate.mjs), so this script is
# not part of a deploy. It stays for what needs psql: the demo seed and the smoke tests. It also
# brings the schema up to date first, which is handy where Node is not installed.
#
# It applies the migrations the way db/migrate.mjs does: only the versions that are not recorded in
# familee.schema_migrations yet, in file-name order, under the same advisory lock, so a run of the
# tools and a starting application never apply a file at the same time. Replaying a file that is
# already applied is not done: it would briefly put the functions and views of that file back over
# the newer ones, and some files rebuild a column (0009 rewrites person_names.display).
#
# Each file opens and closes its own transaction, which is why --single-transaction is not used. The
# whole run is one psql session, because the advisory lock belongs to the session that took it.
#
# On the server:
#   DATABASE_URL=postgres://familee:password@127.0.0.1:5432/familee ./db/tools.sh
#
# Or through Docker, without installing psql on the server (the tools
# service takes DATABASE_URL from .env and connects to your postgres):
#   docker compose --profile tools run --rm tools
#
# Pass "seed" to load the demo family from db/seed.sql after the
# migrations. That script drops and recreates the tree with the slug
# 'demo', so it must stay an explicit choice:
#   docker compose --profile tools run --rm tools seed

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The key of db/migrate.mjs (lockKey): both runners must take the same one.
lock_key=4257013009

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

# One psql script for the whole run. The check of each version happens inside the session, after
# the lock is taken, so a version that another runner applied while this one waited is skipped.
# familee.schema_migrations does not exist on a fresh database until 0000 creates it, so its presence
# is asked first and a missing table means "nothing applied yet". The \gset lines store the answer
# in a psql variable instead of printing a row.
migration_script() {
    echo "select pg_advisory_lock(${lock_key}) \\gset lock_"

    for file in "${files[@]}"; do
        local name version
        name="$(basename "$file")"
        version="${name%.sql}"

        # The names go into the script unquoted by psql, so only the plain ones are accepted.
        if ! [[ "$version" =~ ^[A-Za-z0-9_.-]+$ ]] || [[ "$file" == *"'"* ]]; then
            echo "Unexpected migration file name: $file" >&2
            exit 1
        fi

        cat <<SQL
select to_regclass('familee.schema_migrations') is not null as has_log \\gset
\\if :has_log
select exists (
    select 1 from familee.schema_migrations where version = '${version}'
) as applied \\gset
\\else
\\set applied false
\\endif
\\if :applied
\\else
\\echo '-> ${name}'
\\i '${file}'
\\endif
SQL
    done

    echo "select pg_advisory_unlock(${lock_key}) \\gset unlock_"
}

script="$(migration_script)"

psql "$DATABASE_URL" \
    --quiet \
    --no-psqlrc \
    --variable=ON_ERROR_STOP=1 \
    --file=- <<<"$script"

echo
echo "Applied migrations:"
psql "$DATABASE_URL" --no-psqlrc --tuples-only --command \
    "select version || '  ' || to_char(applied_at, 'YYYY-MM-DD HH24:MI')
       from familee.schema_migrations order by version;"

# "test" runs the smoke tests from db/tests/smoke.sql. They run in a transaction
# that is rolled back, so they never change the data. Run them after "seed",
# because they expect the demo tree to exist:
#   docker compose --profile tools run --rm tools seed test
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

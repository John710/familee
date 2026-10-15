#!/bin/sh
#
# Familee - the container entry point
#
# The schema is brought up to the version of this image before the server
# starts. The migrations are idempotent, so a restart is cheap, and the runner
# skips the versions already recorded in familee.schema_migrations.
#
# SKIP_MIGRATIONS=1 skips the step, for a second instance that must not touch
# the schema or for a demo on a read-only user.
set -e

if [ "${SKIP_MIGRATIONS:-}" != "1" ]; then
    node db/migrate.mjs
fi

exec "$@"

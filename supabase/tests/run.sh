#!/usr/bin/env bash
# Runs supabase/schema.sql (twice, to check it is safe to re-run) on a throwaway local Postgres database
# with Supabase stand-ins, then every supabase/tests/*.test.sql file. Usage:
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=tc_test_$$
psql -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
run() {
  local out rc=0
  out=$(psql -q -X -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" "$@" 2>&1) || rc=$?
  printf '%s\n' "$out" | grep -v -E 'NOTICE|wal_level|HINT:  Set wal_level|^$' || true
  return $rc
}
run -f supabase/tests/supabase-stubs.sql
run -f supabase/schema.sql
run -f supabase/schema.sql
run -f supabase/tests/helpers.sql
for t in supabase/tests/*.test.sql; do
  echo "· $t"
  run -f "$t"
done
echo "all database tests passed"

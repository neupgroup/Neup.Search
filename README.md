# Neup.Search

## Crawler worker service

Run `npm run crawler:runner` as a persistent service alongside the Next.js app. The runner starts independent child processes, restarts workers that exit, and polls the database for queued sites and pages. Workers can claim separate pages from the same site at the same time.

Set `env.process.NEUP_SEARCH_PROCESSES_COUNT=10` to start ten workers. A positive integer is required; missing or invalid values use four workers. `NEUP_SEARCH_PROCESSES_COUNT` is also accepted for environments that do not allow dots in variable names.

Apply the `add_crawl_worker_leases` Prisma migration before starting the runner.

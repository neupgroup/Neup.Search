# Neup.Search

## Crawler worker service

Next.js starts the persistent crawler runner automatically in its Node.js server runtime. The runner starts independent child processes, restarts workers that exit, and polls for explicitly requested sites and pending pages. Workers can claim separate pages from the same site at the same time. `npm run crawler:runner` remains available for running the worker service separately when needed.

Set `env.process.NEUP_SEARCH_PROCESSES_COUNT=10` to start ten workers. A positive integer is required; missing or invalid values use four workers. `NEUP_SEARCH_PROCESSES_COUNT` is also accepted for environments that do not allow dots in variable names.

Apply the pending Prisma migrations before starting the app. They add domain and page leases and migrate queued sites to the `Requested` status. Discovered external sites remain `Active` and are not automatically crawled.

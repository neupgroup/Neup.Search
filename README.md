# Neup.Search

## Crawler worker service

Next.js starts the persistent crawler runner automatically in its Node.js server runtime. The runner starts independent child processes, restarts workers that exit, and polls for explicitly requested sites and pending pages. Workers can claim separate pages from the same site at the same time. `npm run crawler:runner` remains available for running the worker service separately when needed.

The runner starts two workers by default and caps the configured count at four per application instance. Set `NEUP_SEARCH_PROCESSES_COUNT` to request a different count; values above four are capped. Each process uses one shared Prisma client with a default pool limit of two connections. Set `PRISMA_CONNECTION_LIMIT` to tune the per-process limit, or add `connection_limit` to `DATABASE_URL` to override it explicitly. The total possible database connections are approximately `(app instances × (1 app client + worker count)) × connection limit`; leave capacity for migrations, administration, and other services.

The runner waits up to ten seconds for workers to stop cleanly before sending a forced termination signal.

Apply the pending Prisma migrations before starting the app. They add domain and page leases and migrate queued sites to the `Requested` status. Discovered external sites remain `Active` and are not automatically crawled.

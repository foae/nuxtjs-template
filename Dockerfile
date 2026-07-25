# Multi-stage build for the Nitro `node-server` preset. Two artifacts:
#
#   docker build --target migrate -t app-migrate .
#   docker run --rm -e DATABASE_URL=postgres://... app-migrate
#
#   docker build -t app .
#   docker run -p 3000:3000 \
#     -e DATABASE_URL=postgres://... \
#     -e NUXT_SESSION_PASSWORD=... app
#
# Migrations are NOT run at container start — that would race when more than
# one replica boots. Run the `migrate` target as a separate deploy step
# before rolling out the app image.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- build ----------------------------------------------------------------
FROM base AS build

# Manifests first so the install layer is cached until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts skips `postinstall` (nuxt prepare) — the source isn't here
# yet. Install happens in THIS stage rather than a separate `deps` stage: a
# node_modules copied across stages has different recorded settings, and the
# next pnpm command then tries to purge it, failing with
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
# Invoke the binary directly rather than via `pnpm run`/`pnpm exec`: both
# re-verify dependency status, decide node_modules is stale (it was installed
# with --ignore-scripts), and try to purge it — which fails without a TTY.
RUN ./node_modules/.bin/nuxt prepare && ./node_modules/.bin/nuxt build

# ---- runtime --------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

# .output is fully self-contained — no node_modules needed at runtime.
COPY --from=build /app/.output ./.output

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]

# ---- migrate ----------------------------------------------------------------
# Deploy-time migration artifact. The runtime image above has no node_modules
# (it only copies .output), so it cannot run drizzle-kit. This target reuses
# the `build` stage instead, which already has devDependencies, drizzle.config.ts
# and server/database/migrations. Run this as a separate step before rolling
# out the app image — never at container start (see header comment).
FROM build AS migrate
CMD ["./node_modules/.bin/drizzle-kit", "migrate"]

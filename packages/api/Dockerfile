# The API runs from TypeScript SOURCE, not a bundle — Bun transpiles TS itself,
# and running from source sidesteps bundler asset gaps (landscape hit one with
# gapic JSON configs). Keep this pattern even though vendpire has no such dep yet.
FROM oven/bun:1
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/domain/package.json packages/domain/
COPY packages/platform/package.json packages/platform/
COPY packages/e2e/package.json packages/e2e/

# --production: this image installs and then RUNS FROM SOURCE, so devDependencies
# are pure cost — biome/typescript/playwright never execute here.
# The web image must NOT do this: `vite build` needs its devDependencies.
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY packages/domain/ packages/domain/
COPY packages/platform/ packages/platform/
COPY packages/api/ packages/api/

# Build stamp (from deploy.sh) baked in as runtime env so the API can report
# exactly which build is running via the system.version query.
ARG APP_VERSION=0.0.0
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

# Cloud Run injects PORT; default to 8080 for local docker runs
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "packages/api/src/index.ts"]

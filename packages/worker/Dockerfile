# The worker runs from TypeScript SOURCE, not a bundle. @google-cloud/tasks is a
# gapic client that loads JSON config (*_client_config.json) via a runtime
# require; `bun build` doesn't emit those assets, so a bundled worker crashes at
# boot with "Cannot find module cloud_tasks_client_config.json". Running from
# source with node_modules present sidesteps bundling entirely — this is exactly
# how the worker runs in local dev, which is why it has no build script.
FROM oven/bun:1
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/worker/package.json packages/worker/
COPY packages/domain/package.json packages/domain/
COPY packages/platform/package.json packages/platform/
COPY packages/e2e/package.json packages/e2e/

# --production: this image installs and then RUNS FROM SOURCE, so devDependencies
# are pure cost — typescript is typecheck tooling that never executes here, and
# Bun transpiles TS itself.
RUN bun install --frozen-lockfile --production

# Source for the worker and the two packages it imports. node_modules (from the
# install above) stays in place, so @google-cloud/tasks resolves its JSON config
# the normal way.
COPY tsconfig.json ./
COPY packages/domain/ packages/domain/
COPY packages/platform/ packages/platform/
COPY packages/worker/ packages/worker/

# Build stamp (from deploy.sh) baked in as runtime env so logs and job records
# trace back to exactly which build processed them.
ARG APP_VERSION=0.0.0
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILT_AT=$BUILT_AT

# Cloud Run injects PORT; default to 8080 for local docker runs
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "run", "packages/worker/src/index.ts"]

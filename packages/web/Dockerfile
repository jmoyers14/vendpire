FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace manifests first for cached installs
COPY package.json bun.lock tsconfig.json ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/domain/package.json packages/domain/
COPY packages/platform/package.json packages/platform/
COPY packages/e2e/package.json packages/e2e/

RUN bun install --frozen-lockfile

# The web typecheck/build reads the AppRouter TYPE from the api source (and the
# platform types it references) — no server code lands in the bundle.
COPY packages/domain/ packages/domain/
COPY packages/platform/ packages/platform/
COPY packages/api/ packages/api/
COPY packages/web/ packages/web/

# The API URL and Clerk publishable key are baked into the static bundle at
# build time (both are public — the publishable key is client-side by design).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
# PostHog project key is public (write-only ingestion) — safe to bake in.
ARG VITE_POSTHOG_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST
# Build stamp (from deploy.sh) baked into the static bundle for the footer.
ARG VITE_APP_VERSION
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ARG VITE_GIT_SHA
ENV VITE_GIT_SHA=$VITE_GIT_SHA
ARG VITE_BUILT_AT
ENV VITE_BUILT_AT=$VITE_BUILT_AT
RUN bun run --cwd packages/web build

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

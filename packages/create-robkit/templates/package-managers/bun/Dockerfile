# One image per app, from the install's root:
#
#   docker build --build-arg ROBKIT_APP=<slug> .
#
# Coolify passes ROBKIT_APP as a build argument. The container runs the
# app's start script, which migrates the app's database before it serves.

FROM node:24-alpine AS tools
WORKDIR /install
COPY package.json ./
# The install's own bun and turbo versions, without Corepack. The apps run
# on Node; bun only installs.
RUN npm install --global --no-fund --no-audit \
      "$(node -p 'require("./package.json").packageManager')" \
      "turbo@$(node -p 'require("./package.json").workspaces.catalog.turbo')"

# Only the app's own workspace packages and the lockfile entries they need.
FROM tools AS prune
ARG ROBKIT_APP
COPY . .
RUN turbo prune "@internal/${ROBKIT_APP}-app" --docker

FROM tools AS build
ARG ROBKIT_APP
COPY --from=prune /install/out/json/ ./
COPY bunfig.toml ./
# robkit vendor's tarballs, when the install takes robkit's packages from them.
COPY vendo[r] ./vendor/
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY --from=prune /install/out/full/ ./
RUN turbo run build --filter="@internal/${ROBKIT_APP}-app"

FROM node:24-alpine
ARG ROBKIT_APP
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 ROBKIT_APP=${ROBKIT_APP}
COPY --from=build --chown=node:node /install /install
WORKDIR /install/apps/${ROBKIT_APP}
USER node
EXPOSE 3000
# Any answer short of a server error: a guarded app turns a stranger away.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"
CMD ["node", "--run", "start"]

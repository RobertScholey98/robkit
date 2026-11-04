# One image per app, from the install's root:
#
#   docker build --build-arg ROBKIT_APP=<slug> .
#
# Coolify passes ROBKIT_APP as a build argument. The container runs the
# app's start script, which migrates the app's database before it serves.

FROM node:24-alpine AS tools
WORKDIR /install
COPY package.json .yarnrc.yml ./
# The install's own yarn and turbo versions, without Corepack. --force
# replaces the Yarn 1 the Node image ships.
RUN npm install --global --force --no-fund --no-audit \
      "@yarnpkg/cli-dist@$(node -p 'require("./package.json").packageManager.split("@")[1]')" \
      "turbo@$(node -p '/^\s+turbo:\s*(\S+)/m.exec(require("fs").readFileSync(".yarnrc.yml", "utf8"))[1]')"

# Only the app's own workspace packages and the lockfile entries they need.
FROM tools AS prune
ARG ROBKIT_APP
COPY . .
RUN turbo prune "@internal/${ROBKIT_APP}-app" --docker

FROM tools AS build
ARG ROBKIT_APP
COPY --from=prune /install/out/json/ ./
# robkit vendor's tarballs, when the install takes robkit's packages from them.
COPY vendo[r] ./vendor/
RUN --mount=type=cache,id=yarn-cache,target=/root/.yarn/berry/cache \
    yarn install --immutable
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

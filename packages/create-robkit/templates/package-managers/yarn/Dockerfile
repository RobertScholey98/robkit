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

# The built workspace with only what the app runs on: every node_modules
# goes, then the install puts back the app's production dependencies alone.
# A workspace package the app only builds with, such as packages/ui for the
# hub, is a dev dependency, so its dependencies stay out too.
FROM build AS production
RUN find . -name node_modules -type d -prune -exec rm -rf {} + \
 && find . -name .turbo -type d -prune -exec rm -rf {} +
RUN --mount=type=cache,id=yarn-cache,target=/root/.yarn/berry/cache \
    NODE_ENV=production yarn workspaces focus --production \
      "@internal/${ROBKIT_APP}-app" \
 && rm -rf vendor

# Node alone: the apps never run npm, Yarn or Corepack. Deleting them in a
# later layer wouldn't shrink the image, so the runtime starts from scratch.
FROM node:24-alpine AS node
RUN rm -rf /usr/local/lib/node_modules /usr/local/include /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

FROM scratch
COPY --from=node / /
ARG ROBKIT_APP
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    NODE_ENV=production HOST=0.0.0.0 PORT=3000 ROBKIT_APP=${ROBKIT_APP}
COPY --from=production --chown=node:node /install /install
WORKDIR /install/apps/${ROBKIT_APP}
USER node
EXPOSE 3000
# Any answer short of a server error: a guarded app turns a stranger away.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"
CMD ["node", "--run", "start"]

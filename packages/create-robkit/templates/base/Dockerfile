# One image per app, from the install's root:
#
#   docker build --build-arg ROBKIT_APP=<slug> .
#
# Coolify passes ROBKIT_APP as a build argument. The container runs the
# app's start script, which migrates the app's database before it serves.

FROM node:24-alpine AS tools
WORKDIR /install
COPY package.json pnpm-workspace.yaml ./
# The install's own pnpm and turbo versions, without Corepack.
RUN npm install --global --no-fund --no-audit \
      "$(node -p 'require("./package.json").packageManager')" \
      "turbo@$(node -p '/^\s+turbo:\s*(\S+)/m.exec(require("fs").readFileSync("pnpm-workspace.yaml", "utf8"))[1]')"

# Only the app's own workspace packages and the lockfile entries they need.
FROM tools AS prune
ARG ROBKIT_APP
COPY . .
RUN turbo prune "@internal/${ROBKIT_APP}-app" --docker \
 && mkdir out/go \
 && if [ -f "out/full/apps/${ROBKIT_APP}/go.mod" ]; then \
      cp "out/full/apps/${ROBKIT_APP}/go.mod" out/go/; \
    fi

# Go's toolchain, for an app whose server is Go: one with a go.mod. The
# stage sees only that file, so it fetches Go again only when it changes,
# and for any other app it leaves /usr/local/go empty and fetches nothing.
FROM node:24-alpine AS go
ARG TARGETARCH
COPY --from=prune /install/out/go/ /app/
RUN mkdir -p /usr/local/go \
 && if [ -f /app/go.mod ]; then \
      case "${TARGETARCH}" in \
        amd64) sum=65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40 ;; \
        arm64) sum=a06e99309dbcbdca1a8ccd2282c3ee146e55930886e26b4f1193269587165f49 ;; \
        *) echo "This Dockerfile fetches Go for amd64 and arm64, not ${TARGETARCH}." >&2; exit 1 ;; \
      esac \
      && wget -qO /tmp/go.tar.gz "https://go.dev/dl/go1.27.3.linux-${TARGETARCH}.tar.gz" \
      && echo "${sum}  /tmp/go.tar.gz" | sha256sum -c - \
      && tar -C /usr/local -xzf /tmp/go.tar.gz \
      && rm /tmp/go.tar.gz; \
    fi

FROM tools AS build
ARG ROBKIT_APP
COPY --from=go /usr/local/go /usr/local/go
ENV PATH=/usr/local/go/bin:$PATH
COPY --from=prune /install/out/json/ ./
# robkit vendor's tarballs, when the install takes robkit's packages from
# them, and its copy of robkit's Go module.
COPY vendo[r] ./vendor/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /install/out/full/ ./
# A Go app's build fetches its modules and compiles into caches that stay
# out of the image.
RUN --mount=type=cache,id=go-modules,target=/root/go/pkg/mod \
    --mount=type=cache,id=go-build,target=/root/.cache/go-build \
    turbo run build --filter="@internal/${ROBKIT_APP}-app"

# The built workspace with only what the app runs on: every node_modules
# goes, then the install puts back the app's production dependencies alone.
# A workspace package the app only builds with, such as packages/ui for the
# hub, is a dev dependency, so its dependencies stay out too.
FROM build AS production
RUN find . -name node_modules -type d -prune -exec rm -rf {} + \
 && find . -name .turbo -type d -prune -exec rm -rf {} +
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    NODE_ENV=production pnpm install --frozen-lockfile --prod \
      --filter-prod "@internal/${ROBKIT_APP}-app..." \
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

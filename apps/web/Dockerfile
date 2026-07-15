FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable

ARG VITE_API_BASE_URL
ARG VITE_PROCTOR_ICE_SERVERS
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PROCTOR_ICE_SERVERS=$VITE_PROCTOR_ICE_SERVERS

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @dcvp/web...

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @dcvp/shared build
RUN pnpm --filter @dcvp/web build

FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

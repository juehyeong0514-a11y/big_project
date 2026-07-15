FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @dcvp/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @dcvp/shared build
RUN pnpm --filter @dcvp/api prisma:generate
RUN pnpm --filter @dcvp/api build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api

EXPOSE 4000
CMD ["pnpm", "--filter", "@dcvp/api", "start"]

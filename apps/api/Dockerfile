FROM node:20-alpine AS build
WORKDIR /app
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/src ./packages/shared/src
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json ./apps/api/tsconfig.build.json
COPY apps/api/nest-cli.json ./apps/api/nest-cli.json
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/src ./apps/api/src
RUN cd packages/shared && npm install --ignore-scripts --no-audit --no-fund && npm run build
RUN cd apps/api && npm install --ignore-scripts --no-audit --no-fund && npx prisma generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/packages/shared ./../packages/shared
EXPOSE 4000
CMD ["node", "dist/main"]

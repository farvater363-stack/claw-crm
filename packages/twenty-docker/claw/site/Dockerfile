FROM node:24-alpine AS build
WORKDIR /site
COPY build.mjs ./
COPY src ./src
RUN node build.mjs

# Caddy for the whole Droplet, with the ProfMet site baked in at /srv/site.
FROM caddy:2
COPY --from=build /site/dist /srv/site

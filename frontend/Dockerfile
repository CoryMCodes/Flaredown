FROM node:14.21.3-bullseye

WORKDIR /app

RUN apt-get update -qq && \
      apt-get install -y --no-install-recommends chromium && \
      rm -rf /var/lib/apt/lists/*

RUN npm i -g npm@6.14.18

COPY bin/docker-entrypoint /usr/local/bin/frontend-entrypoint

RUN chmod +x /usr/local/bin/frontend-entrypoint && \
      chown -R node:node /app

ENV CHROME_BIN=/usr/bin/chromium
ENV OPENSSL_CONF=/dev/null

USER node

COPY --chown=node:node package*.json bower.json .bowerrc .npmrc ./
COPY --chown=node:node patches ./patches

RUN npm install && \
      { \
        for file in package.json package-lock.json bower.json .bowerrc .npmrc; do \
          [ -f "$file" ] && sha256sum "$file"; \
        done; \
        find patches -type f -print 2>/dev/null | sort | while IFS= read -r file; do \
          sha256sum "$file"; \
        done; \
      } | sha256sum | awk '{print $1}' > ./node_modules/.docker-dependencies-checksum

COPY --chown=node:node . .

ENTRYPOINT ["/usr/local/bin/frontend-entrypoint"]

CMD ["npm", "start"]

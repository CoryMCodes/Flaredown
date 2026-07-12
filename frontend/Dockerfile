FROM node:14.21.3-bullseye

WORKDIR /app

RUN apt-get update -qq && \
      apt-get install -y --no-install-recommends chromium && \
      rm -rf /var/lib/apt/lists/*

RUN npm i -g npm@6.14.18

ENV CHROME_BIN=/usr/bin/chromium
ENV OPENSSL_CONF=/dev/null

COPY package*.json bower.json .bowerrc .npmrc ./
COPY patches ./patches

RUN npm install --unsafe-perm && \
      { \
        for file in package.json package-lock.json bower.json .bowerrc .npmrc; do \
          [ -f "$file" ] && sha256sum "$file"; \
        done; \
        find patches -type f -print 2>/dev/null | sort | while IFS= read -r file; do \
          sha256sum "$file"; \
        done; \
      } | sha256sum | awk '{print $1}' > ./node_modules/.docker-dependencies-checksum

COPY bin/docker-entrypoint /usr/local/bin/frontend-entrypoint

RUN chmod +x /usr/local/bin/frontend-entrypoint

COPY . .

ENTRYPOINT ["/usr/local/bin/frontend-entrypoint"]

CMD ["npm", "start"]

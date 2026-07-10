FROM node:14.21.3-bullseye

WORKDIR /app

RUN apt-get update -qq && \
      apt-get install -y --no-install-recommends chromium && \
      rm -rf /var/lib/apt/lists/*

RUN npm i -g npm@6.14.18

ENV CHROME_BIN=/usr/bin/chromium
ENV OPENSSL_CONF=/dev/null

COPY package*.json bower.json .bowerrc .npmrc ./

RUN npm install --unsafe-perm

COPY . .

CMD ["npm", "start"]

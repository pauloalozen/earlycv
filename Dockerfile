FROM node:22-bookworm-slim

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV SAL_USE_VCLPLUGIN=gen

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    poppler-utils \
    tini \
    xvfb \
    xauth \
    fonts-dejavu-core \
    fonts-liberation2 \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*

RUN fc-cache -f -v

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build --workspace @earlycv/database --workspace @earlycv/ai --workspace @earlycv/api

ENV NODE_ENV=production
ENV LIBREOFFICE_BINARY=/usr/bin/soffice

# tini como PID 1: encaminha sinais (SIGTERM chega ao processo do Node em vez
# de parar no npm/sh) e colhe processos orfaos (soffice, gpgconf, Xvfb) que
# senao viram zumbis. -g envia o sinal ao grupo do filho; -s registra tini
# como subreaper (colhe orfaos mesmo se a plataforma o iniciar sem ser PID 1).
# O CMD abaixo (migrations + node dist/main.js) permanece identico.
ENTRYPOINT ["/usr/bin/tini", "-s", "-g", "--"]

CMD ["npm", "run", "start", "--workspace", "@earlycv/api"]

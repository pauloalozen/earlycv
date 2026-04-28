FROM node:22-bookworm-slim

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV SAL_USE_VCLPLUGIN=gen

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    poppler-utils \
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

CMD ["npm", "run", "start", "--workspace", "@earlycv/api"]

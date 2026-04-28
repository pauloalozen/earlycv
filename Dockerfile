FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    poppler-utils \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build --workspace @earlycv/database --workspace @earlycv/ai --workspace @earlycv/api

ENV NODE_ENV=production
ENV LIBREOFFICE_BINARY=/usr/bin/soffice

CMD ["npm", "run", "start", "--workspace", "@earlycv/api"]

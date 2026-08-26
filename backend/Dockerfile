FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "server.js"]

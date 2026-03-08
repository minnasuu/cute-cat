FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 8002

CMD ["sh", "-c", "npx prisma db push && node index.js"]

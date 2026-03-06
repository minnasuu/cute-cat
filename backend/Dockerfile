FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 8001

CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]

# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev

COPY . .

EXPOSE 3000

CMD sh -c "printf 'VITE_SERVER_URL=%s\nVITE_SUPABASE_URL=%s\nVITE_SUPABASE_ANON_KEY=%s\nVITE_USE_TESTNET=%s\n' \"$VITE_SERVER_URL\" \"$VITE_SUPABASE_URL\" \"$VITE_SUPABASE_ANON_KEY\" \"$VITE_USE_TESTNET\" > .env && npm run build && npm start"

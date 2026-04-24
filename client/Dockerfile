# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --include=dev

COPY . .

ARG VITE_SERVER_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_USE_TESTNET

# Write .env file so Vite picks up variables at build time
RUN echo "VITE_SERVER_URL=$VITE_SERVER_URL" > .env && \
    echo "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" >> .env && \
    echo "VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY" >> .env && \
    echo "VITE_USE_TESTNET=$VITE_USE_TESTNET" >> .env

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]

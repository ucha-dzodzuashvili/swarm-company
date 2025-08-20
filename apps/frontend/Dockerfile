FROM node:20-bullseye-slim
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_PUBLIC_WS_URL=ws://localhost:8081
ENV NEXT_PUBLIC_MATCHMAKER_URL=http://localhost:8080
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY next.config.mjs tsconfig.json ./
COPY app ./app
COPY src ./src
RUN npm run build
EXPOSE 3000
CMD ["npm","start"]

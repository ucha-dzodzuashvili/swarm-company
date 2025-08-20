FROM node:20-bullseye-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./tsconfig.json
COPY src ./src
RUN npm run build
EXPOSE 8080
CMD ["npm","start"]

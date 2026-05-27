FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV MCP_TRANSPORT=http
ENV MCP_PORT=3001
EXPOSE 3001

ENTRYPOINT ["node", "src/index.js"]

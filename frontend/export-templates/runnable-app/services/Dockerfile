FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY *.js ./
# Which service this container runs (api.js, auth.js or worker.js) is set by docker-compose.
CMD ["node", "api.js"]

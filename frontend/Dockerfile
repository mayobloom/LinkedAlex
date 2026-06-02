FROM node:24-slim

WORKDIR /app/frontend

COPY frontend/package.json /app/frontend/package.json
COPY frontend/package-lock.json /app/frontend/package-lock.json
RUN npm ci

COPY frontend /app/frontend

ENV VITE_PROXY_TARGET=http://backend:8000

CMD ["npm", "run", "dev"]

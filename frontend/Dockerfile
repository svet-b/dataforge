FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Source code is volume-mounted in dev, but copy for image layer caching
COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

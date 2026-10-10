# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# When built via the root docker-compose.yml the gateway serves both
# frontend and API on the same origin, so a relative path eliminates CORS.
# Pass --build-arg VITE_API_URL=http://... only for standalone deploys.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production stage — Nginx
FROM nginx:1.25-alpine AS production

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config with CSP headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

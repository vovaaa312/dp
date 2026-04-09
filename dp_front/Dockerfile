FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --silent

COPY . .

# VITE_API_URL is not needed here because nginx proxies /api/ to backend
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Use official Playwright image with browsers preinstalled
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY index.js ./

# Cloud Run will set PORT
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]

# Dockerfile
FROM mcr.microsoft.com/playwright:v1.46.0-jammy
WORKDIR /app

# Copy only manifest first for layer caching
COPY package.json ./
# If you *do* have a lock, copy it too so cache works (optional)
# COPY package-lock.json ./

# Use install instead of ci
RUN npm install --omit=dev --no-audit --no-fund

# Now copy app code
COPY index.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]

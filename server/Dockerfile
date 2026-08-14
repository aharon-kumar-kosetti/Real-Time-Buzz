FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Optional: globally install pm2 if we want to use it inside the container
RUN npm install -g pm2

# Run with PM2 in no-daemon mode so the container doesn't exit
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]

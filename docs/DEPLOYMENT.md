# House Buzz Deployment Guide

To support 1000+ concurrent students, House Buzz relies on horizontal scaling and robust database connections.

## Infrastructure Requirements
- **App Servers**: 1-3 Node.js instances (or Docker containers) behind a load balancer.
- **Database**: Managed PostgreSQL (e.g., Neon, Supabase, AWS RDS). Must support at least 50 concurrent connections (we use connection pooling).
- **Redis**: Managed Redis (e.g., Upstash, AWS ElastiCache). Required for Socket.io cross-server broadcasting if you use multiple app servers.

## Method 1: PM2 (Bare Metal / VM)

1. Clone the repository to your server.
2. Navigate to the `server` directory.
3. Run `npm install --production`.
4. Create a `.env` file based on `.env.example`.
5. Install PM2 globally: `npm install -g pm2`.
6. Start the cluster: `pm2 start ecosystem.config.js --env production`.
7. Setup PM2 to restart on boot: `pm2 startup` and `pm2 save`.

## Method 2: Docker

1. Navigate to the `server` directory.
2. Build the image: `docker build -t house-buzz-backend .`
3. Run the container:
   ```bash
   docker run -d -p 3000:3000 --env-file .env house-buzz-backend
   ```

## Nginx Reverse Proxy (Example)

If hosting manually, put Nginx in front to handle SSL and WebSocket upgrades:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring
- **Logs**: We use Winston. Check `/logs` if using PM2, or use `docker logs` if containerized.
- **Metrics**: Monitor your PostgreSQL transaction commit times and Redis memory usage during large events.

# Deploying Farsight Backend to Azure VM

## Prerequisites

- Azure VM (Linux recommended - Ubuntu 22.04 LTS or similar)
- SSH access to the VM
- Riot API key
- Domain (optional, for production)

---

## Step 1: Prepare Your Azure VM

### 1.1 Connect to your VM
```bash
ssh azureuser@your-vm-public-ip
```

### 1.2 Update system packages
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.3 Install Docker & Docker Compose
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (no sudo needed)
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### 1.4 Install Git & Clone your repo
```bash
sudo apt install -y git
cd /opt
git clone https://github.com/YOUR_USERNAME/lol-dashboard.git
cd lol-dashboard
```

---

## Step 2: Set Up Environment Variables

### 2.1 Backend environment file
```bash
cd /opt/lol-dashboard/backend
cp .env.example .env
nano .env  # or vi .env
```

Edit `.env` with your Azure settings:
```env
RIOT_API_KEY=RGAPI-your-key-here
DATABASE_URL=postgresql+asyncpg://loluser:lolpassword@localhost:5432/loldb
REDIS_URL=redis://localhost:6379/0
FRONTEND_ORIGIN=https://your-frontend-domain.com
ENVIRONMENT=production
DEBUG=false
FLOWER_USER=admin
FLOWER_PASSWORD=your-secure-password
```

### 2.2 Docker Compose environment file
```bash
cd /opt/lol-dashboard/infra
cp .env .env.bak  # backup existing
nano .env
```

Edit `infra/.env`:
```env
POSTGRES_DB=loldb
POSTGRES_USER=loluser
POSTGRES_PASSWORD=your-secure-password-change-this
```

---

## Step 3: Deploy With Docker Compose

### 3.1 Start all services
```bash
cd /opt/lol-dashboard/infra

# Start services in background
docker-compose -f docker-compose.prod.yml up -d

# Verify all services are running
docker-compose ps
```

Expected output:
```
CONTAINER ID   IMAGE                          STATUS                    PORTS
...            timescale/timescaledb:...      Up (healthy)             0.0.0.0:5432->5432/tcp
...            redis:7-alpine                 Up (healthy)             0.0.0.0:6379->6379/tcp
...            lol_backend:prod               Up (healthy)             0.0.0.0:8000->8000/tcp
...            ...                            Up (healthy)             0.0.0.0:5555->5555/tcp
```

### 3.2 Run database migrations
```bash
cd /opt/lol-dashboard/infra
docker-compose exec api alembic upgrade head
```

### 3.3 Verify the API is running
```bash
curl http://localhost:8000/
# Should return: {"message":"Farsight Analytics API is running"}

curl http://localhost:8000/api/v1/health
# Should return health status
```

---

## Step 4: Configure Reverse Proxy (Nginx)

### 4.1 Install Nginx
```bash
sudo apt install -y nginx
```

### 4.2 Create Nginx config
```bash
sudo nano /etc/nginx/sites-available/farsight
```

Paste:
```nginx
upstream backend {
    server localhost:8000;
}

upstream flower {
    server localhost:5555;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS (after SSL cert)
    # return 301 https://$server_name$request_uri;

    client_max_body_size 50M;

    # Backend API
    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Swagger docs
    location /docs {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /openapi.json {
        proxy_pass http://backend;
        proxy_set_header Host $host;
    }

    # Flower monitoring (optional - secure behind auth in production)
    location /flower/ {
        auth_basic "Celery Flower";
        auth_basic_user_file /etc/nginx/.htpasswd;
        proxy_pass http://flower/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://backend/health;
    }

    # Metrics for monitoring
    location /metrics {
        access_log off;
        proxy_pass http://backend/metrics;
    }

    location / {
        return 404;
    }
}
```

### 4.3 Enable the site
```bash
sudo ln -s /etc/nginx/sites-available/farsight /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4.4 Create htpasswd for Flower (optional)
```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
# Enter password when prompted
```

---

## Step 5: SSL Certificate (Let's Encrypt)

### 5.1 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 5.2 Get SSL certificate
```bash
sudo certbot certonly --nginx -d your-domain.com
# Follow prompts

# Test auto-renewal
sudo certbot renew --dry-run
```

### 5.3 Update Nginx for HTTPS
```bash
sudo nano /etc/nginx/sites-available/farsight
```

Replace the `server` block with:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # ... rest of your config from Step 4.2 ...
}
```

Restart Nginx:
```bash
sudo systemctl restart nginx
```

---

## Step 6: Set Up Systemd Services (Auto-start)

### 6.1 Create Docker Compose service
```bash
sudo nano /etc/systemd/system/farsight.service
```

Paste:
```ini
[Unit]
Description=Farsight Analytics Stack
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/lol-dashboard/infra
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 6.2 Enable and start
```bash
sudo systemctl daemon-reload
sudo systemctl enable farsight.service
sudo systemctl start farsight.service
sudo systemctl status farsight.service
```

---

## Step 7: Monitoring & Logs

### 7.1 View logs
```bash
# All services
cd /opt/lol-dashboard/infra
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f worker
docker-compose logs -f postgres
```

### 7.2 Access monitoring dashboards
- **API Swagger Docs**: `https://your-domain.com/docs`
- **Health Check**: `https://your-domain.com/health`
- **Metrics**: `https://your-domain.com/metrics` (Prometheus format)
- **Flower** (task queue): `https://your-domain.com/flower/` (requires auth)

### 7.3 Monitor with Docker
```bash
# Live resource usage
docker stats

# Inspect specific container
docker inspect lol_api
docker logs -f --tail 100 lol_api
```

---

## Step 8: Backup & Maintenance

### 8.1 Backup database
```bash
cd /opt/lol-dashboard/infra
docker-compose exec postgres pg_dump -U loluser loldb > /backups/loldb-$(date +%Y%m%d).sql
```

### 8.2 Set up automated backups (cron)
```bash
sudo nano /etc/cron.daily/farsight-backup
```

```bash
#!/bin/bash
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cd /opt/lol-dashboard/infra
docker-compose exec -T postgres pg_dump -U loluser loldb > $BACKUP_DIR/loldb-$TIMESTAMP.sql
# Keep only last 30 days
find $BACKUP_DIR -name "loldb-*.sql" -mtime +30 -delete
```

Make executable:
```bash
sudo chmod +x /etc/cron.daily/farsight-backup
```

### 8.3 Update containers regularly
```bash
cd /opt/lol-dashboard/infra
docker-compose down
git pull origin main
docker-compose -f docker-compose.prod.yml build --pull
docker-compose -f docker-compose.prod.yml up -d
docker-compose exec api alembic upgrade head  # Run migrations if needed
```

---

## Step 9: Scaling Celery Workers

### 9.1 Modify docker-compose to run multiple workers
```bash
nano /opt/lol-dashboard/infra/docker-compose.prod.yml
```

Change the worker section or add additional worker services:
```yaml
services:
  worker1:
    <<: *backend-image
    container_name: lol_worker_1
    depends_on:
      - redis
      - postgres
    command: ["celery", "-A", "worker.celery_app", "worker", "--loglevel=info", "--concurrency=4"]

  worker2:
    <<: *backend-image
    container_name: lol_worker_2
    depends_on:
      - redis
      - postgres
    command: ["celery", "-A", "worker.celery_app", "worker", "--loglevel=info", "--concurrency=4"]

  beat:
    <<: *backend-image
    container_name: lol_beat
    depends_on:
      - redis
    command: ["celery", "-A", "worker.celery_app", "beat", "--loglevel=info"]
```

Restart:
```bash
docker-compose -f docker-compose.prod.yml up -d
docker-compose ps
```

---

## Troubleshooting

### API won't start
```bash
docker-compose logs api
# Check if database/redis are ready:
docker-compose ps
```

### Database connection error
```bash
# Test database directly
docker-compose exec postgres psql -U loluser -d loldb -c "SELECT 1;"
```

### Redis connection error
```bash
# Test redis
docker-compose exec redis redis-cli ping
```

### Celery workers not processing tasks
```bash
# View active tasks in Flower
# https://your-domain.com/flower/

# Check worker logs
docker-compose logs worker
```

### Out of memory
```bash
# Check current usage
docker stats

# Reduce worker concurrency or add more RAM
```

---

## Production Checklist

- [ ] Change all default passwords in `.env`
- [ ] Use Azure Managed PostgreSQL (instead of self-hosted) for reliability
- [ ] Use Azure Cache for Redis (instead of self-hosted) for reliability
- [ ] Enable SSL certificate (Let's Encrypt)
- [ ] Set up automated backups
- [ ] Configure monitoring alerts
- [ ] Set resource limits on containers
- [ ] Enable Azure DDoS protection
- [ ] Set up CDN for frontend assets
- [ ] Enable Azure Application Insights for logging
- [ ] Configure firewall rules (only allow necessary ports)
- [ ] Set up automated security patching
- [ ] Document runbooks for common issues

---

## Next Steps

1. Complete the 9 deployment steps above
2. Test the API at your domain
3. Verify Celery workers are processing tasks via Flower
4. Set up monitoring and alerting
5. Load test before production traffic
6. Migrate frontend CORS settings to point to your new backend

---

## Questions?

Refer to:
- Backend README: `backend/README.md`
- Cloud architecture: `docs/cloud-project-brief.md`
- Docker Compose docs: `infra/docker-compose.prod.yml`

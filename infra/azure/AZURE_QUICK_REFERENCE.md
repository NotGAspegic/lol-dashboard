# Azure Deployment - Quick Reference & Troubleshooting

## 📋 Quick Start Checklist

- [ ] Azure VM created (Ubuntu 22.04 LTS recommended, Standard B2s or larger)
- [ ] SSH access verified
- [ ] Riot API key ready
- [ ] Domain name pointing to VM public IP (or use IP directly for testing)
- [ ] Backup location decided

### Azure VM Recommended Configuration
- **Size**: Standard B2s or Standard B4ms (for production with workers)
- **OS**: Ubuntu 22.04 LTS
- **Storage**: 30-50 GB (SSD)
- **Network**: Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

---

## 🚀 Ultra-Quick Deploy (3 commands)

```bash
# 1. Connect to VM
ssh azureuser@YOUR_VM_IP

# 2. Run automatic setup
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/lol-dashboard/main/deploy-to-azure.sh
sudo bash deploy-to-azure.sh

# 3. Configure (edit these files)
nano /opt/lol-dashboard/backend/.env
nano /opt/lol-dashboard/infra/.env
sudo ln -s /etc/nginx/sites-available/farsight /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# 4. Start services
sudo systemctl start farsight
sudo systemctl status farsight

# 5. Run migrations
cd /opt/lol-dashboard/infra
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic upgrade head
```

---

## 🐛 Troubleshooting

### 1. Services Won't Start

```bash
# Check systemd service status
sudo systemctl status farsight
sudo journalctl -u farsight -n 50

# Check Docker Compose directly
cd /opt/lol-dashboard/infra
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs

# Try starting manually to see errors
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

### 2. API returns 502 Bad Gateway (Nginx)

```bash
# Check if backend is running
curl http://localhost:8000/

# Check Nginx config
sudo nginx -t

# Check Nginx logs
sudo tail -50 /var/log/nginx/farsight_error.log
sudo tail -50 /var/log/nginx/farsight_access.log

# Restart Nginx
sudo systemctl restart nginx
```

### 3. Database Connection Errors

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Try connecting directly
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U loluser -d loldb -c "SELECT 1;"

# Check if volume has data
docker volume ls
docker inspect lol-dashboard_pgdata

# Check logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs postgres
```

### 4. Redis Connection Issues

```bash
# Check if Redis is running
docker ps | grep redis

# Try connecting
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec redis redis-cli ping

# Should return: PONG
```

### 5. Celery Workers Not Running

```bash
# Check worker containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps | grep worker

# Check worker logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker

# Access Flower dashboard
# https://your-domain.com/flower/ (username/password from .env)

# Check Redis for queued tasks
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec redis redis-cli LLEN celery
```

### 6. Out of Memory

```bash
# Check current usage
docker stats

# See which container uses most memory
docker stats --no-stream | sort -k 4 -h

# Reduce worker concurrency or add more RAM
# Edit docker-compose.prod.yml:
#   worker: change --concurrency=4 to --concurrency=2
```

### 7. High CPU Usage

```bash
# Find high CPU containers
docker stats

# Check if too many Celery tasks queued
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -it flower celery -A worker.celery_app inspect active

# Scale workers or check for stuck tasks
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker | grep ERROR
```

### 8. SSL Certificate Issues

```bash
# Check certificate expiry
sudo certbot certificates

# Manual renewal
sudo certbot renew

# Dry run before auto-renewal
sudo certbot renew --dry-run

# Check certificate files exist
ls -la /etc/letsencrypt/live/your-domain.com/

# Renew and reload Nginx
sudo certbot renew --post-hook "systemctl reload nginx"
```

### 9. Can't Access Swagger Docs

```bash
# Verify backend is serving docs
curl http://localhost:8000/docs

# Check Nginx routing for /docs
curl -I https://your-domain.com/docs

# Verify proxy_pass settings
cat /etc/nginx/sites-available/farsight | grep -A 10 "location /docs"
```

### 10. Flower Authentication Issues

```bash
# Recreate .htpasswd file
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
# Enter new password

# Restart Nginx
sudo systemctl restart nginx
```

---

## 📊 Monitoring Commands

### View Real-Time Logs
```bash
# All services
cd /opt/lol-dashboard/infra
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f postgres

# Follow with grep
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api | grep ERROR
```

### System Health Check
```bash
# Docker container status
docker ps

# Resource usage
docker stats

# Disk usage
du -sh /opt/lol-dashboard
df -h /

# Database size
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U loluser -d loldb -c "SELECT pg_size_pretty(pg_database_size('loldb'));"

# Redis memory
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec redis redis-cli INFO memory | grep used_memory_human
```

### Application Health Check
```bash
# Check API health
curl -s http://localhost:8000/health | jq .

# Check all endpoints
curl -s http://localhost:8000/ | jq .
curl -s http://localhost:8000/api/v1/health | jq .

# Check Celery workers
curl -s http://localhost:5555/api/workers | jq .
```

### Performance Metrics
```bash
# Prometheus metrics (raw format)
curl -s http://localhost:8000/metrics

# Parse specific metrics
curl -s http://localhost:8000/metrics | grep http_requests_total
curl -s http://localhost:8000/metrics | grep http_request_duration_seconds
```

---

## 🔄 Common Operations

### Restart Services
```bash
# Gentle restart (preserves data)
cd /opt/lol-dashboard/infra
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart

# Full restart with migrations
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic upgrade head
```

### Update Backend Code
```bash
cd /opt/lol-dashboard
git pull origin main

# Rebuild containers with new code
cd infra
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --pull

# Restart
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Run migrations if database schema changed
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec api alembic upgrade head
```

### Backup Database
```bash
mkdir -p /backups
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres pg_dump -U loluser loldb > /backups/loldb-$(date +%Y%m%d-%H%M%S).sql

# Verify backup
ls -lh /backups/
```

### Restore Database
```bash
# Get backup file
BACKUP_FILE="/backups/loldb-2024-01-15-120000.sql"

# Stop API to avoid conflicts
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# Restore
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres
sleep 10  # Wait for DB to start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres psql -U loluser -d loldb < $BACKUP_FILE

# Verify
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U loluser -d loldb -c "SELECT COUNT(*) FROM match_participants;"

# Restart all services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Scale Workers
```bash
# Edit docker-compose.prod.yml to add more worker services:
nano /opt/lol-dashboard/infra/docker-compose.prod.yml

# Rebuild and restart
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate

# Verify
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps | grep worker
```

---

## 🔐 Security Best Practices

### 1. Firewall Rules (Azure Network Security Group)
```
Allow: SSH (22) from your IP only
Allow: HTTP (80) from anywhere
Allow: HTTPS (443) from anywhere
Deny: Everything else
```

### 2. Update Security
```bash
# Regular updates
sudo apt update && sudo apt upgrade -y

# Enable automatic updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 3. Secrets Management
```bash
# Never commit .env files
echo ".env" >> /opt/lol-dashboard/.gitignore

# Use strong passwords
# Use Azure Key Vault or HashiCorp Vault in production
```

### 4. SSL/TLS
```bash
# Test SSL strength
openssl s_client -connect your-domain.com:443 -tls1_2

# Check certificate
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout
```

### 5. Access Control
```bash
# Restrict sudo access
sudo usermod -G docker azureuser

# SSH key-only (no passwords)
# Disable SSH password authentication in /etc/ssh/sshd_config
```

---

## 📈 Scaling for Production

### When to Scale Up

**Vertical (Bigger VM)**: If CPU/Memory regularly > 80%
```bash
# Stop service
sudo systemctl stop farsight

# Resize VM in Azure Portal
# Restart
sudo systemctl start farsight
```

**Horizontal (More Workers)**: If task queue backing up
```bash
# Add more worker services in docker-compose.prod.yml
# Or: docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale worker=3
```

### Use Managed Services

Replace self-hosted with Azure services:
- **PostgreSQL**: Azure Database for PostgreSQL (auto-backup, HA)
- **Redis**: Azure Cache for Redis (managed, auto-scaling)
- **Storage**: Azure Blob Storage (for backups)
- **Monitoring**: Azure Monitor + Application Insights

---

## 💡 Tips & Tricks

### View real-time database size growth
```bash
watch -n 5 'docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U loluser -d loldb -c "SELECT pg_size_pretty(pg_database_size('"'"'loldb'"'"'));"'
```

### Check Celery queue depth
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec redis redis-cli LLEN celery
```

### List all queued tasks
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec -it worker celery -A worker.celery_app inspect reserved
```

### Purge stuck tasks
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec redis redis-cli DEL celery
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart worker
```

### Monitor ingestion progress
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker | grep "ingesting\|task\|match"
```

### Check API response times
```bash
# Install httpstat (or use curl)
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/health
```

---

## 📞 Additional Resources

- Full deployment guide: `AZURE_DEPLOYMENT.md`
- Backend docs: `backend/README.md`
- Architecture overview: `docs/cloud-project-brief.md`
- Docker Compose config: `infra/docker-compose.prod.yml`
- API docs: `https://your-domain.com/docs`
- Task monitor: `https://your-domain.com/flower/`

---

## Support

For issues with:
- **FastAPI/Backend**: Check `backend/` files and Docker logs
- **Database**: Check PostgreSQL/TimescaleDB documentation
- **Celery**: Check Flower dashboard (`/flower/`) and worker logs
- **Nginx**: Check `/var/log/nginx/` logs
- **Azure**: Check Azure Portal VM diagnostics
- **SSL**: Check Certbot renewal logs
- **General**: Check this quick reference and the full deployment guide

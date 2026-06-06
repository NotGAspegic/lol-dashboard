# Azure Deployment: VM Sizing & Architecture Guide

## 📦 What Your Backend Needs

Your Farsight backend is a **distributed application** with multiple components:

```
┌─────────────────────────────────────┐
│     Your Azure VM (Single Machine)  │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │  FastAPI Backend (8000)     │   │  Port: 8000
│  │  1 process, 2-4 threads     │   │  Memory: 200-300 MB
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  PostgreSQL (5432)          │   │  Port: 5432
│  │  Database with TimescaleDB  │   │  Memory: 500-1000 MB
│  │  Storage: 5-50 GB           │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Redis (6379)               │   │  Port: 6379
│  │  Cache + Task Broker        │   │  Memory: 200-500 MB
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Celery Worker (1-N)        │   │  Processes: 2-4
│  │  Background Tasks           │   │  Memory: 300-400 MB each
│  │  Ingesting Riot API data    │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Celery Beat Scheduler      │   │  Memory: 100 MB
│  │  Periodic Jobs              │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Flower (5555)              │   │  Port: 5555
│  │  Task Monitoring Dashboard  │   │  Memory: 100 MB
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Nginx Reverse Proxy (80/443)   │  Ports: 80, 443
│  │  SSL/TLS Termination       │   │  Memory: 50 MB
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

---

## 🖥️ VM Sizing Recommendations

### Development/Testing
```
VM: Standard B1s
CPU: 1 vCore
Memory: 1 GB
Storage: 30 GB
Monthly Cost: ~$7-10

Components:
- 1 FastAPI process
- 1 PostgreSQL instance  
- 1 Redis instance
- 1 Celery worker (low concurrency)

Suitable for: Testing, low traffic, learning
Limits: ~10 concurrent users, slow for large data ingestion
```

### Small Production (Low Traffic)
```
VM: Standard B2s
CPU: 2 vCores
Memory: 4 GB
Storage: 50 GB
Monthly Cost: ~$50-70

Components:
- 1 FastAPI process
- 1 PostgreSQL instance
- 1 Redis instance
- 2 Celery workers

Suitable for: 100-500 concurrent users, moderate ingestion
Limits: 5-10 requests/sec, basic monitoring
```

### Medium Production (Growing)
```
VM: Standard B4ms
CPU: 4 vCores
Memory: 16 GB
Storage: 100+ GB
Monthly Cost: ~$150-200

Components:
- 1-2 FastAPI processes
- 1 PostgreSQL instance
- 1 Redis instance
- 4-6 Celery workers

Suitable for: 1000+ concurrent users, heavy ingestion
Limits: 25-50 requests/sec, multiple workers
```

### Large Production (Scale)
```
VM: Standard D4s v3 or D8s v3
CPU: 4-8 vCores
Memory: 16-32 GB
Storage: 200+ GB SSD
Monthly Cost: ~$300-500

OR: Use Kubernetes + managed services
- Multiple FastAPI replicas on AKS
- Azure Database for PostgreSQL
- Azure Cache for Redis

Suitable for: 10,000+ concurrent users
Limits: Horizontal scaling available
```

---

## 📊 Resource Usage by Component

Based on your stack:

| Component | CPU | Memory | Disk | Notes |
|-----------|-----|--------|------|-------|
| FastAPI | 0.1-0.5 cores | 200-300 MB | N/A | Idle: 50 mA, Peak: 500 mA |
| PostgreSQL | 0.2-1 core | 500-1000 MB | 5-100+ GB | Varies with data size |
| Redis | 0.05-0.2 cores | 200-500 MB | N/A | Cache + queue |
| Celery Worker | 0.2-0.8 cores | 300-400 MB each | N/A | Per worker process |
| Celery Beat | 0.01 core | 100 MB | N/A | Minimal usage |
| Flower | 0.05 core | 100-150 MB | N/A | Monitoring dashboard |
| Nginx | 0.02-0.1 cores | 50 MB | N/A | Reverse proxy |

**Total Typical Usage** (Small Production):
- CPU: 1.2-2 cores
- Memory: ~2-3 GB
- With workers idle, can fit in B2s (2 vCores, 4 GB)

---

## 💰 Cost Breakdown (Azure Pricing)

### Monthly Estimate (US East)

| Component | B1s | B2s | B4ms | D4s v3 |
|-----------|-----|-----|------|---------|
| **VM** | $7.32 | $54.44 | $163.30 | $274+ |
| Storage (30GB) | $1.38 | $1.38 | $1.38 | $1.38 |
| **Total** | **~$9/mo** | **~$56/mo** | **~$165/mo** | **$276+/mo** |

### With Managed Services (Recommended)

| Service | Type | Cost |
|---------|------|------|
| App Service VM | B2s | $50-70 |
| PostgreSQL Database | Single Server | $15-50 |
| Redis Cache | Basic | $15-30 |
| Bandwidth | Outbound | $0.02/GB |
| **Total** | | **$100-200+** |

**Annual Savings**: Managed services often cheaper + no maintenance

---

## 🚀 Deployment Architecture Options

### Option 1: Single VM (Current Plan)
```
✓ Simplest deployment
✓ Everything on one machine
✓ Lowest cost
✓ Good for prototyping

✗ Single point of failure
✗ Can't scale independently
✗ Maintenance downtime
```

**Recommendation**: For development/testing only

---

### Option 2: VM + Managed Services (Recommended for Production)
```
App Service VM (FastAPI + Nginx)
    ↓
├─ Azure Database for PostgreSQL
├─ Azure Cache for Redis  
└─ Azure Blob Storage (backups)

✓ Better uptime
✓ Automatic backups
✓ Better performance
✓ Professional monitoring

✗ Slightly higher cost
✗ Vendor lock-in (minor)
```

**Recommendation**: Best balance for production

---

### Option 3: Kubernetes (AKS) + Managed Services
```
Azure Kubernetes Service
├─ FastAPI Deployment (replicas)
├─ Celery Worker Deployment (auto-scale)
├─ Celery Beat Deployment
├─ Flower Deployment
│
└─ Azure Database for PostgreSQL
└─ Azure Cache for Redis
└─ Azure Container Registry
└─ Application Insights

✓ Production-grade
✓ Auto-scaling
✓ High availability
✓ Multi-region ready

✗ Complex setup
✗ Higher cost
✗ Learning curve
```

**Recommendation**: For enterprise/high-traffic

---

## 🔧 Performance Tuning by Tier

### B1s (1 vCore, 1 GB RAM) - Development
```yaml
PostgreSQL:
  shared_buffers: 128MB
  effective_cache_size: 256MB
  max_connections: 20

FastAPI:
  workers: 1
  threads: 1

Celery:
  workers: 1
  concurrency: 2

Redis:
  maxmemory: 256MB
```

### B2s (2 vCores, 4 GB RAM) - Small Production
```yaml
PostgreSQL:
  shared_buffers: 1GB
  effective_cache_size: 2GB
  max_connections: 100

FastAPI:
  workers: 2
  threads: 2-4

Celery:
  workers: 2
  concurrency: 4

Redis:
  maxmemory: 512MB
```

### B4ms+ (4+ vCores, 16+ GB RAM) - Production
```yaml
PostgreSQL:
  shared_buffers: 4GB
  effective_cache_size: 8GB
  max_connections: 200

FastAPI:
  workers: 4+
  threads: 4-8

Celery:
  workers: 4-6
  concurrency: 8

Redis:
  maxmemory: 1GB+
```

---

## 📈 When to Scale Up

### Scale **Vertically** (Bigger VM) when:
- CPU usage consistently > 70%
- Memory usage consistently > 80%
- Database slow queries increasing
- API response times > 1 second

**Action**: Resize VM in Azure Portal (requires restart)

---

### Scale **Horizontally** (Multiple VMs/Services) when:
- Need zero-downtime deployments
- Geographic distribution needed
- Load balancing beneficial
- High availability critical

**Action**: Migrate to Kubernetes (AKS) or App Service

---

### Offload to **Managed Services** when:
- Database backups getting large
- PostgreSQL maintenance consuming time
- Redis memory pressure
- Need database replication

**Action**: Use Azure Database + Azure Cache

---

## ⚡ Performance Optimization Tips

### For Your FastAPI Backend:
```python
# Use connection pooling
DATABASE_URL = "postgresql+asyncpg://..."

# Enable Redis caching for:
# - Summoner profiles
# - Match history
# - Champion stats

# Use async everywhere
async def get_summoner(summoner_id: str):
    ...
```

### For PostgreSQL:
```sql
-- Create indexes on frequent queries
CREATE INDEX idx_summoner_id ON matches(summoner_id);
CREATE INDEX idx_match_timestamp ON matches(created_at DESC);

-- Partition large tables (TimescaleDB)
SELECT create_hypertable('matches', 'created_at');

-- Regular VACUUM/ANALYZE
VACUUM ANALYZE;
```

### For Redis:
```bash
# Monitor memory usage
redis-cli INFO memory

# Set eviction policy
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Enable persistence
appendonly yes
```

### For Nginx:
```nginx
# Enable compression
gzip on;
gzip_types text/plain application/json;

# Enable caching
proxy_cache_valid 200 10m;

# Connection pooling
keepalive_connections 32;
```

---

## 🔍 Monitoring Setup

### Essential Metrics to Track:
1. **API Response Time** (should be < 500ms)
2. **PostgreSQL Connections** (should be < max_connections)
3. **Celery Queue Depth** (should not grow indefinitely)
4. **Disk Usage** (should not exceed 80%)
5. **Memory Usage** (should not exceed 90%)

### Tools:
- **Built-in**: Prometheus `/metrics` endpoint
- **Azure**: Application Insights
- **Open source**: Grafana + Prometheus
- **Local**: `docker stats`, system metrics

---

## 🎯 Migration Path

### Phase 1: Single VM (Your current plan)
- Deploy to Azure VM B2s
- Test with single region
- Monitor performance

### Phase 2: Add Managed Services
- Migrate PostgreSQL to Azure Database
- Migrate Redis to Azure Cache
- Keep VM for app logic only

### Phase 3: Scale Application
- Add load balancer
- Deploy multiple app instances
- Auto-scaling policies

### Phase 4: Production Grade (Optional)
- Migrate to Kubernetes (AKS)
- Multi-region replication
- Advanced monitoring
- Disaster recovery

---

## 📋 Pre-Deployment Checklist

- [ ] Azure VM created and accessed
- [ ] Docker and Docker Compose installed
- [ ] Repository cloned
- [ ] Environment variables configured
- [ ] SSL certificate ready (or plan Let's Encrypt)
- [ ] Firewall rules configured
- [ ] Backup plan documented
- [ ] Monitoring configured
- [ ] Admin credentials secured
- [ ] Database migration plan ready

---

## 🆘 Sizing Decision Matrix

| Use Case | Recommended VM | Est. Cost | Notes |
|----------|---|---|---|
| Dev/Test | B1s | $10/mo | Limited scale |
| Prototype | B2s | $60/mo | Good baseline |
| Small SaaS | B4ms | $170/mo | Can handle growth |
| Growing App | D4s v3 | $300+/mo | Room to scale |
| Enterprise | AKS + Managed | $500+/mo | Full production |

---

Last updated: January 2024

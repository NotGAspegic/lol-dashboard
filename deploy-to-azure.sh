#!/bin/bash
# Quick Azure VM deployment script for Farsight backend
# Usage: sudo bash deploy-to-azure.sh

set -e

echo "🚀 Farsight Backend - Azure VM Deployment Script"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# Step 1: System updates
echo -e "${YELLOW}Step 1: Updating system packages...${NC}"
apt update && apt upgrade -y
apt install -y curl git wget nano

# Step 2: Install Docker
echo -e "${YELLOW}Step 2: Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo -e "${GREEN}✓ Docker installed${NC}"
else
    echo -e "${GREEN}✓ Docker already installed${NC}"
fi

# Add current user to docker group
usermod -aG docker $(sudo -u $SUDO_USER whoami) || true

# Step 3: Install Docker Compose
echo -e "${YELLOW}Step 3: Installing Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✓ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✓ Docker Compose already installed${NC}"
fi

# Step 4: Install Nginx
echo -e "${YELLOW}Step 4: Installing Nginx...${NC}"
apt install -y nginx
systemctl enable nginx

# Step 5: Install Certbot
echo -e "${YELLOW}Step 5: Installing Certbot for SSL...${NC}"
apt install -y certbot python3-certbot-nginx

# Step 6: Clone repository
echo -e "${YELLOW}Step 6: Cloning Farsight repository...${NC}"
if [ ! -d "/opt/lol-dashboard" ]; then
    mkdir -p /opt
    cd /opt
    # Replace with your actual repo URL
    git clone https://github.com/YOUR_USERNAME/lol-dashboard.git
    cd lol-dashboard
    echo -e "${GREEN}✓ Repository cloned${NC}"
else
    echo -e "${GREEN}✓ Repository already exists${NC}"
fi

# Step 7: Create backup directory
echo -e "${YELLOW}Step 7: Setting up backup directory...${NC}"
mkdir -p /backups
chmod 755 /backups

# Step 8: Environment setup guide
echo -e "${YELLOW}Step 8: Environment configuration needed${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "IMPORTANT: You must configure these files manually:"
echo ""
echo "1. Backend environment:"
echo "   nano /opt/lol-dashboard/backend/.env"
echo "   Required values:"
echo "     RIOT_API_KEY=RGAPI-xxxx"
echo "     DATABASE_URL=postgresql+asyncpg://loluser:password@localhost:5432/loldb"
echo "     REDIS_URL=redis://localhost:6379/0"
echo "     FRONTEND_ORIGIN=https://your-domain.com"
echo ""
echo "2. Docker Compose environment:"
echo "   nano /opt/lol-dashboard/infra/.env"
echo "   Required values:"
echo "     POSTGRES_PASSWORD=your-secure-password"
echo "     FLOWER_USER=admin"
echo "     FLOWER_PASSWORD=your-secure-password"
echo ""
echo "3. Nginx configuration:"
echo "   nano /etc/nginx/sites-available/farsight"
echo "   Update 'your-domain.com' with your actual domain"
echo ""

# Step 9: Create systemd service
echo -e "${YELLOW}Step 9: Creating systemd service...${NC}"
cat > /etc/systemd/system/farsight.service << 'EOF'
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
EOF

systemctl daemon-reload
echo -e "${GREEN}✓ Systemd service created${NC}"

# Step 10: Final summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Initial setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Configure environment variables:"
echo "   cd /opt/lol-dashboard"
echo "   cp backend/.env.example backend/.env"
echo "   nano backend/.env"
echo ""
echo "2. Configure Docker Compose:"
echo "   cd /opt/lol-dashboard/infra"
echo "   nano .env"
echo ""
echo "3. Configure Nginx:"
echo "   nano /etc/nginx/sites-available/farsight"
echo ""
echo "4. Create Nginx site symlink:"
echo "   ln -s /etc/nginx/sites-available/farsight /etc/nginx/sites-enabled/"
echo "   nginx -t"
echo "   systemctl restart nginx"
echo ""
echo "5. Start the services:"
echo "   systemctl start farsight"
echo "   systemctl status farsight"
echo ""
echo "6. Run database migrations:"
echo "   cd /opt/lol-dashboard/infra"
echo "   docker-compose -f docker-compose.prod.yml exec api alembic upgrade head"
echo ""
echo "7. For SSL certificate:"
echo "   certbot certonly --nginx -d your-domain.com"
echo "   Then update /etc/nginx/sites-available/farsight with SSL paths"
echo ""
echo "For detailed instructions, see: /opt/lol-dashboard/AZURE_DEPLOYMENT.md"

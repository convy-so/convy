#!/bin/bash
# One-time EC2 bootstrap for Ubuntu 22.04/24.04.
# Run on the server as ubuntu (may need sudo):
#   curl -fsSL https://raw.githubusercontent.com/convy-so/convy/prod2/docker/deploy/bootstrap-ec2.sh | bash
#
# Or copy this file to the server and run it after SSH:
#   ssh -i "Convvy server.pem" ubuntu@18.205.246.87
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/convy-so/convy.git}"
BRANCH="${DEPLOY_BRANCH:-prod2}"
APP_DIR="${APP_DIR:-/opt/convy}"

echo "==> Installing Docker..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl git wget
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu

echo "==> Cloning repository..."
sudo mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  sudo chown -R ubuntu:ubuntu "$APP_DIR"
else
  echo "Repository already exists at $APP_DIR"
fi

cd "$APP_DIR"

if [ ! -f .env.prod ]; then
  cp .env.prod.example .env.prod
  echo ""
  echo "Created .env.prod from template."
  echo "Edit $APP_DIR/.env.prod with your production secrets before starting:"
  echo "  nano $APP_DIR/.env.prod"
  echo ""
fi

chmod +x docker/deploy/ec2-deploy.sh docker/entrypoint.sh

echo ""
echo "==> Bootstrap complete."
echo ""
echo "Next steps:"
echo "  1. Edit .env.prod (set your domain, Supabase, API keys, etc.)"
echo "  2. Start the stack:"
echo "       cd $APP_DIR"
echo "       docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build"
echo ""
echo "  3. Add GitHub Actions secrets (repo Settings → Secrets):"
echo "       EC2_HOST     = your EC2 public IP"
echo "       EC2_USER     = ubuntu"
echo "       EC2_SSH_KEY  = contents of Convvy server.pem"
echo ""
echo "  4. Open EC2 security group ports: 22, 80, 443, 3000, 3001"

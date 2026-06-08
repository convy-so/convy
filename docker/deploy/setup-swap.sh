#!/bin/bash
# Adds 4GB swap so small EC2 instances can survive Docker builds.
# Run once on EC2 if you must build locally: sudo bash docker/deploy/setup-swap.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo."
  exit 1
fi

if swapon --show | grep -q '/swapfile'; then
  echo "Swap already enabled:"
  swapon --show
  free -h
  exit 0
fi

fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

echo "Swap enabled:"
free -h

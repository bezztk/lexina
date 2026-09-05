#!/bin/bash

set -e

cd /opt/lexina

echo "Pulling latest changes..."
git pull --ff-only

cd src

echo "Installing dependencies..."
npm ci

echo "Building..."
npm run build

echo "Restarting service..."
sudo systemctl restart lexina

echo "Done."
systemctl status lexina --no-pager

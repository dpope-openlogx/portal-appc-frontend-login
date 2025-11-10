#!/bin/bash

set -e

CERT_DIR="../../OpenLogx/ssl-certs"
KEY_FILE="localhost-key.pem"
CERT_FILE="localhost-cert.pem"

echo "🔍 Checking for Homebrew..."
if ! command -v brew &> /dev/null; then
  echo "❌ Homebrew is not installed. Please install it first: https://brew.sh/"
  exit 1
fi

echo "✅ Homebrew is installed."

echo "🔍 Checking for mkcert..."
if ! command -v mkcert &> /dev/null; then
  echo "📦 Installing mkcert..."
  brew install mkcert
else
  echo "✅ mkcert is already installed."
fi

echo "🔧 Installing local CA (if not already present)..."
mkcert -install

# Create cert output directory
mkdir -p "$CERT_DIR"

echo "🔐 Generating localhost cert/key..."
mkcert -key-file "$CERT_DIR/$KEY_FILE" -cert-file "$CERT_DIR/$CERT_FILE" localhost 127.0.0.1 ::1 local.openlogx.com

echo "✅ Certificate created:"
echo "   Key:  $CERT_DIR/$KEY_FILE"
echo "   Cert: $CERT_DIR/$CERT_FILE"
echo ""
echo "✨ Certificate includes:"
echo "   - localhost"
echo "   - 127.0.0.1"
echo "   - local.openlogx.com"
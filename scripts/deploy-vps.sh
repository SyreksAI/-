#!/usr/bin/env bash
# Деплой DubPar на VPS (Ubuntu/Debian)
# Использование: ./scripts/deploy-vps.sh [--ssl]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSL=false
if [[ "${1:-}" == "--ssl" ]]; then
  SSL=true
fi

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.production.example to .env and fill values."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${DOMAIN:-}" ]]; then
  echo "ERROR: DOMAIN is not set in .env"
  exit 1
fi

if [[ "${ENVIRONMENT:-production}" == "production" && "$SSL" == false ]]; then
  echo "WARN: ENVIRONMENT=production requires HTTPS (Secure cookies)."
  echo "      Use Cloudflare proxy OR run with --ssl after DNS is ready."
  echo "      For first boot without SSL, temporarily set ENVIRONMENT=development in .env"
fi

echo "==> Building frontend for https://${DOMAIN}"
export VITE_SITE_URL="${VITE_SITE_URL:-https://${DOMAIN}}"
export VITE_TURNSTILE_SITE_KEY="${VITE_TURNSTILE_SITE_KEY:-${TURNSTILE_SITE_KEY:-}}"
export VITE_YANDEX_RTB_BLOCK_ID="${VITE_YANDEX_RTB_BLOCK_ID:-}"
export VITE_LEGAL_OPERATOR_NAME="${VITE_LEGAL_OPERATOR_NAME:-${LEGAL_OPERATOR_NAME:-}}"
export VITE_LEGAL_PLATFORM_NAME="${VITE_LEGAL_PLATFORM_NAME:-${LEGAL_PLATFORM_NAME:-}}"
export VITE_LEGAL_SITE_URL="${VITE_LEGAL_SITE_URL:-https://${DOMAIN}}"
export VITE_LEGAL_PRIVACY_EMAIL="${VITE_LEGAL_PRIVACY_EMAIL:-${LEGAL_PRIVACY_EMAIL:-}}"
export VITE_LEGAL_SUPPORT_EMAIL="${VITE_LEGAL_SUPPORT_EMAIL:-${LEGAL_SUPPORT_EMAIL:-}}"
export VITE_LEGAL_DOCS_VERSION="${VITE_LEGAL_DOCS_VERSION:-${LEGAL_DOCS_VERSION:-}}"

if [[ ! -d frontend/node_modules ]]; then
  (cd frontend && npm ci)
fi
(cd frontend && npm run build)

mkdir -p certbot/www certbot/conf .docker/generated

echo "==> Generating nginx config for ${DOMAIN}"
export DOMAIN
envsubst '${DOMAIN}' < .docker/nginx.prod.conf.template > .docker/generated/nginx.http.conf

if [[ "$SSL" == true ]]; then
  if [[ ! -f "certbot/conf/live/${DOMAIN}/fullchain.pem" ]]; then
    echo "==> Obtaining Let's Encrypt certificate for ${DOMAIN}"
    docker run --rm \
      -v "$ROOT/certbot/www:/var/www/certbot" \
      -v "$ROOT/certbot/conf:/etc/letsencrypt" \
      certbot/certbot certonly --webroot \
      -w /var/www/certbot \
      -d "$DOMAIN" -d "www.${DOMAIN}" \
      --email "${LETSENCRYPT_EMAIL:-admin@${DOMAIN}}" \
      --agree-tos --no-eff-email
  fi
  envsubst '${DOMAIN}' < .docker/nginx.ssl.conf.template > .docker/generated/nginx.prod.conf
else
  cp .docker/generated/nginx.http.conf .docker/generated/nginx.prod.conf
fi

cp .docker/generated/nginx.prod.conf .docker/nginx.prod.conf

echo "==> Starting Docker stack (production)"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for backend health"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1/health" >/dev/null 2>&1; then
    echo "Backend is healthy"
    break
  fi
  sleep 2
  if [[ "$i" -eq 30 ]]; then
    echo "WARN: health check timed out — check: docker compose -f docker-compose.prod.yml logs backend"
  fi
done

echo ""
echo "Deploy complete."
echo "  Site: ${PUBLIC_SITE_URL:-http://${DOMAIN}}"
echo "  Health: http://${DOMAIN}/health"
echo ""
if [[ "$SSL" == false ]]; then
  echo "Next: point DNS A-record to this server, then run:"
  echo "  LETSENCRYPT_EMAIL=you@${DOMAIN} ./scripts/deploy-vps.sh --ssl"
fi

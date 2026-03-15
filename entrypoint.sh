#!/bin/sh
set -e

# Fetch assets from public repo
git clone --depth=1 --filter=blob:none --sparse https://github.com/post4ex/web.git /tmp/web
cd /tmp/web && git sparse-checkout set assets
cp -r /tmp/web/assets /usr/share/nginx/html/
rm -rf /tmp/web

# Inject API URL
if [ -n "$API_URL" ]; then
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|__API_URL__|$API_URL|g" {} +
fi

exec nginx -g "daemon off;"

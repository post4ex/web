#!/bin/sh
set -e

if [ -n "$API_URL" ]; then
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|__API_URL__|$API_URL|g" {} +
fi

exec nginx -g "daemon off;"

#!/bin/bash
# Purge Netlify CDN cache for the entire site
# This script uses the Netlify API to force a cache purge
#
# Usage:
#   ./scripts/purge-netlify-cache.sh
#
# Requirements:
#   - NETLIFY_AUTH_TOKEN environment variable must be set
#   - Or run `netlify login` first to authenticate

set -e  # Exit on error

SITE_ID="f434092e-0965-40f9-b3ef-87f1ff0a0378"
SITE_NAME="veloready"

echo "========================================"
echo "Netlify Cache Purge Script"
echo "========================================"
echo "Site: $SITE_NAME"
echo "Site ID: $SITE_ID"
echo ""

# Check if netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "❌ Error: Netlify CLI not found"
    echo "Install with: npm install -g netlify-cli"
    exit 1
fi

echo "📡 Checking Netlify authentication..."
if ! netlify status &> /dev/null; then
    echo "❌ Error: Not authenticated with Netlify"
    echo "Run: netlify login"
    exit 1
fi

echo "✅ Authenticated"
echo ""

# Get the latest deploy ID
echo "🔍 Getting latest deploy..."
LATEST_DEPLOY=$(netlify api listSiteDeploys --data "{\"site_id\": \"$SITE_ID\"}" 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$LATEST_DEPLOY" ]; then
    echo "❌ Error: Could not find latest deploy ID"
    exit 1
fi

echo "✅ Latest deploy: $LATEST_DEPLOY"
echo ""

# Method 1: Try to purge using deploy-specific endpoint
echo "🗑️  Attempting to purge cache (Method 1: Deploy-specific)..."
PURGE_RESULT=$(netlify api purgeCacheBySiteId --data "{\"site_id\": \"$SITE_ID\"}" 2>&1 || echo "FAILED")

if [[ "$PURGE_RESULT" == *"FAILED"* ]] || [[ "$PURGE_RESULT" == *"error"* ]]; then
    echo "⚠️  Method 1 failed, trying alternate method..."

    # Method 2: Trigger a new deploy to force cache refresh
    echo "🚀 Triggering new deployment to force cache refresh..."
    echo ""
    echo "NOTE: A new deployment will:"
    echo "  1. Rebuild and redeploy all functions"
    echo "  2. Automatically invalidate CDN cache"
    echo "  3. Ensure latest code is deployed"
    echo ""
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        netlify deploy --prod --build
        echo "✅ Deployment complete - cache has been refreshed"
    else
        echo "❌ Deployment cancelled"
        echo ""
        echo "Manual options to purge cache:"
        echo "  1. Go to: https://app.netlify.com/sites/$SITE_NAME/deploys"
        echo "  2. Click 'Trigger deploy' > 'Clear cache and deploy site'"
        echo "  3. Or wait for cache TTL to expire naturally"
        exit 1
    fi
else
    echo "✅ Cache purged successfully!"
fi

echo ""
echo "========================================"
echo "Cache Purge Complete"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Wait 30-60 seconds for CDN propagation"
echo "  2. Test your API endpoints:"
echo "     curl -v https://veloready.app/api/activities"
echo "  3. Check for 'Age: 0' in response headers"
echo ""

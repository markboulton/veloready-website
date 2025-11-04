#!/bin/bash

# VeloReady Cache Purge Script
# This script helps you purge the Netlify CDN cache

echo "🔍 VeloReady Cache Purge Options"
echo ""
echo "Option 1: Manual via Netlify Dashboard (RECOMMENDED)"
echo "  1. Open: https://app.netlify.com/sites/veloready/deploys"
echo "  2. Click 'Trigger deploy' button (top right)"
echo "  3. Select 'Deploy site' from dropdown"
echo "  4. Wait 2-3 minutes for deployment"
echo ""
echo "Option 2: Via Git (triggers auto-deploy)"
echo "  Run: git commit --allow-empty -m 'chore: Purge CDN cache' && git push"
echo ""
echo "Option 3: Via Netlify CLI (requires auth)"
echo "  Run: netlify deploy --prod"
echo ""
echo "After purging, verify with:"
echo "  curl -I 'https://api.veloready.app/api/activities?daysBack=7'"
echo "  Should see: Age: 0 (not 4-6)"
echo ""
echo "Which option would you like to use? (1/2/3)"
read -r option

case $option in
  1)
    echo "Opening Netlify dashboard..."
    open "https://app.netlify.com/sites/veloready/deploys"
    ;;
  2)
    echo "Creating empty commit to trigger deploy..."
    git commit --allow-empty -m "chore: Purge CDN cache"
    git push
    echo "✅ Pushed! Netlify will auto-deploy in ~2 minutes"
    ;;
  3)
    echo "Deploying via Netlify CLI..."
    netlify deploy --prod
    ;;
  *)
    echo "Invalid option. Please run the script again."
    ;;
esac

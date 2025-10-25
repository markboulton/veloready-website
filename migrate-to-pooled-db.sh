#!/bin/bash

# =============================================================================
# VeloReady Database Connection Pooling Migration Script
# =============================================================================
# This script automatically updates all Netlify functions to use the new
# connection pooling implementation.
#
# What it does:
# 1. Finds all TypeScript files importing from "lib/db"
# 2. Updates imports to use "lib/db-pooled"
# 3. Creates a backup before making changes
# 4. Reports all changes made
#
# Usage:
#   chmod +x migrate-to-pooled-db.sh
#   ./migrate-to-pooled-db.sh
#
# Rollback:
#   ./migrate-to-pooled-db.sh --rollback
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Backup directory
BACKUP_DIR=".migration-backup-$(date +%Y%m%d-%H%M%S)"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}VeloReady Connection Pooling Migration${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Check if rollback mode
if [ "$1" == "--rollback" ]; then
  echo -e "${YELLOW}ROLLBACK MODE${NC}"
  echo ""

  # Find most recent backup
  LATEST_BACKUP=$(ls -dt .migration-backup-* 2>/dev/null | head -1)

  if [ -z "$LATEST_BACKUP" ]; then
    echo -e "${RED}❌ No backup found. Cannot rollback.${NC}"
    exit 1
  fi

  echo -e "${BLUE}Found backup: ${LATEST_BACKUP}${NC}"
  echo -e "${YELLOW}This will restore all files from the backup.${NC}"
  read -p "Continue? (y/N): " -n 1 -r
  echo

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Rollback cancelled.${NC}"
    exit 0
  fi

  # Restore files
  cp -r "$LATEST_BACKUP/"* netlify/
  echo -e "${GREEN}✅ Files restored from backup${NC}"
  echo -e "${GREEN}✅ Rollback complete!${NC}"
  exit 0
fi

# Normal migration mode
echo -e "${BLUE}Step 1: Creating backup${NC}"
mkdir -p "$BACKUP_DIR"
cp -r netlify/functions* "$BACKUP_DIR/"
echo -e "${GREEN}✅ Backup created at: $BACKUP_DIR${NC}"
echo ""

echo -e "${BLUE}Step 2: Finding files to update${NC}"

# Find all TypeScript files that import from lib/db
FILES=$(grep -r "from.*[\"'].*lib/db[\"']" netlify/functions* --include="*.ts" -l 2>/dev/null || true)

if [ -z "$FILES" ]; then
  echo -e "${YELLOW}⚠️  No files found importing from lib/db${NC}"
  echo -e "${GREEN}Migration complete (no changes needed)${NC}"
  exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo -e "${GREEN}Found $FILE_COUNT files to update${NC}"
echo ""

echo -e "${BLUE}Step 3: Updating imports${NC}"

UPDATED=0
for file in $FILES; do
  # Check if file actually contains lib/db import
  if grep -q "from.*[\"'].*lib/db[\"']" "$file"; then
    # Update the import statement
    # Handles both single and double quotes
    sed -i '' -E 's/from (["'\'']).*(\/lib\/db)(["'\''])/from \1..\/lib\/db-pooled\3/g' "$file"

    echo -e "${GREEN}  ✓${NC} Updated: $file"
    UPDATED=$((UPDATED + 1))
  fi
done

echo ""
echo -e "${GREEN}✅ Updated $UPDATED files${NC}"
echo ""

echo -e "${BLUE}Step 4: Verification${NC}"

# Verify no old imports remain
REMAINING=$(grep -r "from.*[\"'].*lib/db[\"']" netlify/functions* --include="*.ts" 2>/dev/null | grep -v "db-pooled" || true)

if [ -n "$REMAINING" ]; then
  echo -e "${YELLOW}⚠️  Warning: Some files still import from lib/db:${NC}"
  echo "$REMAINING"
  echo ""
  echo -e "${YELLOW}These may need manual review.${NC}"
else
  echo -e "${GREEN}✅ All imports successfully updated to db-pooled${NC}"
fi

echo ""
echo -e "${BLUE}==============================================================================${NC}"
echo -e "${GREEN}Migration Complete!${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Review changes: ${YELLOW}git diff${NC}"
echo -e "  2. Test locally if possible"
echo -e "  3. Commit changes: ${YELLOW}git add . && git commit -m 'Migrate to connection pooling'${NC}"
echo -e "  4. Deploy: ${YELLOW}git push${NC}"
echo ""
echo -e "${BLUE}Optional:${NC}"
echo -e "  • Add DATABASE_POOLER_URL to Netlify environment variables"
echo -e "  • See: ./infrastructure/connection-pooling-implementation.md"
echo ""
echo -e "${BLUE}Rollback:${NC}"
echo -e "  • Run: ${YELLOW}./migrate-to-pooled-db.sh --rollback${NC}"
echo -e "  • Or restore from: ${YELLOW}$BACKUP_DIR${NC}"
echo ""
echo -e "${GREEN}Backup location: $BACKUP_DIR${NC}"
echo ""

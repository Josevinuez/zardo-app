# Shopify App Cleanup Plan

## Current Issues Found:

1. **Duplicate Code**: 
   - Old Remix code in `app/` directory (not used)
   - Active code in `server/` and `src/`
   
2. **Webhook Issues**:
   - Old webhook handlers in `app/routes/webhooks.tsx` (Remix)
   - Empty webhook handlers in `server/webhooks.ts`
   - Need to consolidate

3. **Authentication Issues**:
   - Old imports using `@shopify/shopify-app-remix` (uninstalled)
   - Using new package but old code references

4. **No PM2 Config**: 
   - Need to create for AWS deployment

5. **Multiple .toml Files**:
   - `shopify.app.toml` (active)
   - `shopify.app.zardo-cards-master-panel-v2.toml` (unused)
   - `shopify.web.toml` (active)

## Cleanup Steps:

### Phase 1: Remove Old Remix Code
- [ ] Delete or archive entire `app/` directory (old Remix)
- [ ] Update any remaining references

### Phase 2: Fix Webhook Handlers
- [ ] Migrate webhook handlers from `app/routes/webhooks.tsx` to `server/webhooks.ts`
- [ ] Register with Express server
- [ ] Test all webhook endpoints

### Phase 3: Fix Authentication
- [ ] Update all imports from old Remix to Express package
- [ ] Verify authentication flow works

### Phase 4: Clean Up Files
- [ ] Remove `shopify.app.zardo-cards-master-panel-v2.toml`
- [ ] Remove `types/shopify-remix.d.ts`
- [ ] Remove old scripts if not needed

### Phase 5: Create PM2 Config
- [ ] Create `ecosystem.config.js` for AWS deployment
- [ ] Set up environment variables
- [ ] Document deployment process

### Phase 6: Test Everything
- [ ] Test webhook delivery
- [ ] Test authentication
- [ ] Test API endpoints
- [ ] Deploy to AWS and verify

## Files to Keep (Active):
- `server/` - Express backend (ACTIVE)
- `src/` - React Router v7 frontend (ACTIVE)
- `prisma/` - Database migrations
- `extensions/` - Shopify extensions
- `trigger/` - Trigger.dev tasks
- `shopify.app.toml` - Shopify config
- `shopify.web.toml` - Dev config

## Files to Delete (Old/Unused):
- `app/` - Entire directory (old Remix)
- `shopify.app.zardo-cards-master-panel-v2.toml` - Duplicate
- `types/shopify-remix.d.ts` - Old types
- `app/shopify.server.ts` - Not used (Express uses `server/shopify.ts`)
- `app/entry.server.tsx` - Not used
- `app/root.tsx` - Not used
- All `app/routes/` - Not used



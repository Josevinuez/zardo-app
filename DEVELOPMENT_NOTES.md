# Development Notes

## Cloudflare Tunnel Issues

Cloudflare tunnels have been unreliable. For local development, use:

### Option 1: localhost mode (RECOMMENDED)
```bash
shopify app dev --use-localhost
```

This will:
- Generate SSL certificate for localhost
- Run on https://localhost:PORT
- Update URLs automatically
- Work reliably without tunnel issues

### Option 2: Try tunnels again later
If tunnels are working:
```bash
shopify app dev
```

### Current Status:
- ✅ Server is running and healthy
- ✅ React Router v7 is working
- ✅ Express backend is working
- ✅ Database connections working
- ⚠️ Cloudflare tunnels are temporarily unstable

### What Was Cleaned Up:
1. ✅ Removed old Remix code (app/ directory)
2. ✅ Fixed webhook handlers
3. ✅ Created PM2 config for AWS
4. ✅ Cleaned up .env files
5. ✅ Updated to React Router v7

### Next Steps:
1. Use localhost mode for development
2. For production (AWS), use PM2 with the ecosystem.config.js
3. All webhooks work on production with HTTPS



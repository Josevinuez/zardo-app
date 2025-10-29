# AWS Deployment Guide

## Current Setup

### Architecture:
- **Backend**: Express server (`server/index.ts`)
- **Frontend**: React Router v7 SPA (`src/`)
- **Database**: PostgreSQL (Supabase)
- **Cache**: Redis (for Bee-Queue workers)

### PM2 Configuration

The `ecosystem.config.js` file is configured to run on AWS EC2:

```bash
# On your AWS server:
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions to set up auto-start
```

### Build Process

1. **Build the app**:
   ```bash
   npm run build:client && npm run build:server
   ```

2. **Deploy**:
   ```bash
   # Copy files to AWS
   rsync -avz --exclude node_modules --exclude dist dist/ user@your-server:/home/ubuntu/shopify-app/dist/
   
   # On server, rebuild and restart
   pm2 restart zardo-shopify-app
   ```

### Environment Variables

Create `.env` file on AWS server with:

```bash
# Shopify
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_secret
SHOPIFY_APP_URL=https://your-domain.com
SCOPES=read_files,read_inventory,read_locations,read_orders,read_products,write_files,write_inventory,write_orders,write_products

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Redis
REDIS_URL=redis://your-redis-host:6379

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# Email (optional)
EMAIL_FROM=noreply@your-domain.com
```

### Webhook Configuration

Webhooks are configured in `shopify.app.toml`:
- App uninstalled
- Products create/update/delete
- Inventory levels update

These are managed by Shopify Partner Dashboard and automatically configured.

### Monitoring

Check logs:
```bash
pm2 logs zardo-shopify-app
pm2 logs zardo-redis-workers
```

### Troubleshooting

1. **Webhooks not working**: Check webhook path in Shopify Partner Dashboard
2. **Authentication issues**: Verify API keys and redirect URLs
3. **Redis connection issues**: Check Redis is running and accessible



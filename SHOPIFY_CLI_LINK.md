# Shopify CLI App Linking Guide

## Check Current Link Status

```bash
# See what app you're linked to
npx shopify app info

# Or check the config
cat shopify.app.toml
```

## Current App Details (from shopify.app.toml):
- **Client ID**: 64f49fa3092ea38dda4a81de55eb411f
- **App Name**: Zardo Cards Master Panel V2
- **Handle**: zardo-bot-v3-dev
- **Dev Store**: zardotest.myshopify.com

## Options:

### Option 1: Unlink Current App

```bash
# Remove the app link
rm shopify.app.toml
npx shopify app link
```

### Option 2: Link to a Different App

```bash
# Link to another app
npx shopify app link

# You'll be prompted to:
# 1. Select your organization
# 2. Select the app you want to link to
# 3. Select the dev store
```

### Option 3: Keep Current Link

If you want to keep using the current app (`zardo-bot-v3-dev`), you're already set up!

```bash
# Just verify it's working
npx shopify app info
```

## Important Notes:

1. **Unlinking will NOT delete your app** - it just removes the local link
2. **Changing apps requires updating credentials** in `.env`:
   - SHOPIFY_API_KEY
   - SHOPIFY_API_SECRET
   - SHOPIFY_APP_URL
3. **Webhook URLs will need to be updated** in Shopify Partner Dashboard
4. **Database sessions** might need to be cleared if switching apps

## Recommendations:

Since you're running in production on AWS, I recommend:

### If you want to switch to a different app:
1. Create new app in Shopify Partner Dashboard
2. Copy new API credentials
3. Update `.env` with new credentials
4. Update `shopify.app.toml` with new app details
5. Restart the app

### If you're happy with current app:
- **Keep it as is** - no changes needed
- Just use the `.env` cleanup we created

## To Unlink (if needed):

```bash
# Remove local config
rm shopify.app.toml

# Re-link to choose a different app
npx shopify app link

# Or specify app manually
npx shopify app link --app YOUR_NEW_CLIENT_ID
```



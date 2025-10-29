# Using Localhost Instead of Tunnels

## The Problem
Cloudflare tunnels are having issues connecting. This is a temporary Cloudflare network issue.

## Solution: Use Localhost

### Step 1: Stop current dev server
Press `q` in your terminal

### Step 2: Start with localhost flag
```bash
shopify app dev --use-localhost
```

### Step 3: Update shopify.app.toml

After it starts, it will show you a localhost URL. Update this line in `shopify.app.toml`:

```toml
application_url = "http://localhost:XXXX"
redirect_urls = ["http://localhost:XXXX/auth/callback"]
```

Replace `XXXX` with the actual port number shown.

### Step 4: Open the app

Then access your app at the localhost URL shown in the terminal.

## What Changed?

Instead of:
- ❌ Cloudflare tunnel: `https://random-name.trycloudflare.com`

You'll use:
- ✅ Localhost: `http://localhost:XXXX`

The app works exactly the same, just without the tunnel.

## If localhost doesn't work either:

Try ngrok:
```bash
# Install ngrok
brew install ngrok

# In one terminal, start your dev server
npm run dev:server

# In another terminal, start ngrok
ngrok http 3000

# Use the ngrok URL in shopify.app.toml
```



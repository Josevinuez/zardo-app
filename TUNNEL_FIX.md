# Tunnel Connection Fix

## Issue: "michelle-granny-isa-gives.trycloudflare.com refused to connect"

### Possible Causes:

1. **The tunnel URL changed** - Cloudflare generates new URLs periodically
2. **The dev server restarted** but you're using an old URL
3. **Port forwarding issue**

### Solutions:

#### Solution 1: Check the Current Preview URL

The tunnel URL changes when you restart `npm run shopify app dev`. 

**To get the current URL:**
1. Look at your terminal where `npm run shopify app dev` is running
2. Find the line that says "Access scopes auto-granted"
3. Below that, you'll see: `Using URL: https://XXXXX.trycloudflare.com`
4. Use THAT URL (not the old one)

#### Solution 2: Restart the Dev Server

```bash
# In your terminal where shopify app dev is running, press Ctrl+C
# Then restart:
npm run shopify app dev
```

#### Solution 3: Check if the Port is Running

```bash
# Check what port your local server is on
lsof -i -P | grep LISTEN | grep node
```

#### Solution 4: Use the Local URL

Instead of the tunnel URL, you can test locally:

```bash
# The Shopify CLI will show you both:
# - Local tunnel URL (changes)
# - Local URL: http://localhost:XXXX
```

### To Find Your Current Preview URL:

Run this in your terminal (in a new window):
```bash
ps aux | grep "shopify app dev" | grep -v grep
```

Then look at the terminal window where it's running for the output.

### Quick Fix:

1. **Go to your terminal** where `npm run shopify app dev` is running
2. **Find the line** that shows the preview URL
3. **Copy that URL** and use it

The URL format is: `https://XXXXX.trycloudflare.com/extensions/dev-console`

### If It Still Doesn't Work:

1. Kill all processes:
   ```bash
   pkill -f "shopify app dev"
   pkill -f "tsx watch"
   pkill -f "vite"
   ```

2. Restart fresh:
   ```bash
   npm run shopify app dev
   ```



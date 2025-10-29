# Fix Cloudflare Tunnel Error

## The Problem
Your Express server is crashing on startup, so Cloudflare can't connect to it.

## Quick Fix Steps:

### Step 1: Stop the current dev server
In the terminal where `npm run shopify app dev` is running:
- Press `q` to quit, OR
- Press `Ctrl+C`

### Step 2: Check for errors in the terminal
Look for any error messages. Common issues:
- Missing environment variables
- Port conflicts
- Import errors

### Step 3: Restart clean
```bash
# Kill any stuck processes
pkill -f "shopify app dev"
pkill -f "tsx watch"
pkill -f "node.*server"

# Wait a few seconds, then restart
npm run shopify app dev
```

### Step 4: Watch for these messages
You should see:
```
🚀 Starting Express server...
📁 Static dir: /path/to/dist/client
🔑 API Key: SET
🔐 Secret: SET
🚀 Server ready on port 3000
```

If you see any errors, share them with me.

### Common Issues and Solutions:

#### Issue: "SyntaxError: Cannot find module"
**Solution**: The server is trying to import from the old `app/` directory
```bash
# Make sure the old app/ directory is renamed
ls -la | grep app
# Should see: app_OLD_REMIX_BACKUP_*
```

#### Issue: "Port already in use"
**Solution**: Another process is using the port
```bash
# Find and kill the process
lsof -ti:3000 | xargs kill -9
```

#### Issue: Missing .env file
**Solution**: Copy the clean .env
```bash
cp .env.clean.new .env
```

### Step 5: Check the Preview URL
Once the server starts successfully, the terminal will show:
```
Preview URL: https://XXXXX.trycloudflare.com
```

Click that URL or copy/paste it into your browser.

## Need More Help?

If it's still not working, please share:
1. Any error messages from the terminal
2. What you see when the server starts
3. The output of: `cat .env | grep SHOPIFY`


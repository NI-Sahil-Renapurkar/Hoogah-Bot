# Quick Start: Deploy to Vercel

## 🚀 Quick Deployment Steps

### 1. Deploy to Vercel
```bash
# Option 1: Via Dashboard (Recommended)
# - Go to vercel.com
# - Import your GitHub/GitLab/Bitbucket repo
# - Add environment variables (see below)
# - Deploy

# Option 2: Via CLI
npm i -g vercel
vercel login
vercel
vercel --prod
```

### 2. Set Environment Variables in Vercel
Add these in Vercel Dashboard → Project Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `CLIENT_ID` | Azure App Registration Client ID |
| `CLIENT_SECRET` | Azure App Registration Client Secret **Value** |
| `MS_TENANT_ID` | (Optional) Your Azure Tenant ID |

### 3. Get Your Bot URL
After deployment, your bot endpoint will be:
```
https://your-project-name.vercel.app/api/messages
```

### 4. Configure Azure Bot Service
1. Go to [Azure Portal](https://portal.azure.com)
2. Find your **Bot Channels Registration**
3. Go to **Settings** → **Configuration**
4. Set **Messaging endpoint** to:
   ```
   https://your-project-name.vercel.app/api/messages
   ```
5. Click **Save** and verify it shows as "Valid"

### 5. Test Your Bot
1. Test health endpoint: `https://your-project-name.vercel.app/`
2. Upload your Teams app manifest to Teams
3. Start a conversation with your bot

## 📋 Checklist

- [ ] Code pushed to Git repository
- [ ] Project deployed to Vercel
- [ ] Environment variables set in Vercel
- [ ] Bot endpoint URL noted
- [ ] Azure Bot Service messaging endpoint updated
- [ ] Endpoint shows as "Valid" in Azure
- [ ] Bot tested in Microsoft Teams

## 🔍 Troubleshooting

**Bot not responding?**
- Check Vercel function logs
- Verify environment variables are set
- Check Azure Bot Service endpoint URL

**401 Unauthorized?**
- Verify `CLIENT_SECRET` is the actual secret **value** (not ID)
- Check secret hasn't expired
- Verify `CLIENT_ID` matches Azure App Registration

**404 Not Found?**
- Verify endpoint URL is correct
- Check `vercel.json` routes configuration

For detailed instructions, see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)


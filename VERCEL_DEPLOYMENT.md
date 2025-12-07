# Deploying HoogahBot to Vercel

This guide will walk you through deploying your Microsoft Teams bot to Vercel and configuring it in Microsoft Teams.

## Prerequisites

- A Vercel account (sign up at [vercel.com](https://vercel.com))
- Vercel CLI installed (optional, for CLI deployment)
- Your bot's Azure App Registration credentials:
  - `CLIENT_ID` (Application/Client ID)
  - `CLIENT_SECRET` (Client Secret Value)
  - `MS_TENANT_ID` (Optional, but recommended)

## Step 1: Prepare Your Repository

1. **Commit all changes** to your git repository:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push
   ```

2. **Ensure your code is pushed** to GitHub, GitLab, or Bitbucket (Vercel supports these platforms).

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to [vercel.com](https://vercel.com)** and sign in.

2. **Click "Add New Project"** or go to your dashboard and click "New Project".

3. **Import your Git repository**:
   - Select your Git provider (GitHub, GitLab, or Bitbucket)
   - Find and select the `HoogahBot` repository
   - Click "Import"

4. **Configure the project**:
   - **Framework Preset**: Leave as "Other" or "Vercel"
   - **Root Directory**: Leave as `./` (root)
   - **Build Command**: `npm run build` (or leave empty if not needed)
   - **Output Directory**: Leave empty (not needed for serverless functions)
   - **Install Command**: `npm install`

5. **Add Environment Variables**:
   Click "Environment Variables" and add the following:
   
   | Variable Name | Value | Description |
   |--------------|-------|-------------|
   | `CLIENT_ID` | Your Azure App Registration Client ID | The Application (client) ID from Azure |
   | `CLIENT_SECRET` | Your Azure App Registration Client Secret | The secret **value** (not the secret ID) |
   | `MS_TENANT_ID` | Your Azure Tenant ID | (Optional) Your Microsoft 365 tenant ID |
   | `NODE_ENV` | `production` | Environment setting |

   **Important Notes:**
   - Make sure to add these for **Production**, **Preview**, and **Development** environments
   - The `CLIENT_SECRET` should be the actual secret value, not the secret ID
   - Never commit these values to your repository

6. **Click "Deploy"** and wait for the deployment to complete.

7. **Note your deployment URL**: After deployment, Vercel will provide you with a URL like:
   ```
   https://your-project-name.vercel.app
   ```

### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Set environment variables**:
   ```bash
   vercel env add CLIENT_ID
   vercel env add CLIENT_SECRET
   vercel env add MS_TENANT_ID
   vercel env add NODE_ENV
   ```

5. **Deploy to production**:
   ```bash
   vercel --prod
   ```

## Step 3: Get Your Vercel Deployment URL

After deployment, you'll get a URL like:
```
https://hoogahbot.vercel.app
```

Your bot endpoint will be:
```
https://hoogahbot.vercel.app/api/messages
```

**Important**: If you're using a custom domain, make sure it's properly configured in Vercel.

## Step 4: Configure Azure Bot Service

1. **Go to Azure Portal** ([portal.azure.com](https://portal.azure.com))

2. **Navigate to your Bot Channels Registration**:
   - Search for "Bot Services" or "Bot Channels Registration"
   - Find your bot (or create a new one if needed)

3. **Update the Messaging Endpoint**:
   - Click on your bot resource
   - Go to **Settings** → **Configuration**
   - In the **Messaging endpoint** field, enter:
     ```
     https://your-project-name.vercel.app/api/messages
     ```
   - Replace `your-project-name` with your actual Vercel project name
   - Click **Save**

4. **Verify the endpoint**:
   - The endpoint should show as "Valid" with a green checkmark
   - If it shows an error, check:
     - The URL is correct and accessible
     - Your bot is responding to health checks
     - SSL certificate is valid (Vercel provides this automatically)

## Step 5: Verify Azure App Registration

1. **Go to Azure Portal** → **Azure Active Directory** → **App registrations**

2. **Find your app registration** (the one with your `CLIENT_ID`)

3. **Verify the following**:
   - **Authentication**:
     - Platform: Web
     - Redirect URI: Not needed for bot (can be empty or set to your Vercel URL)
   - **Certificates & secrets**:
     - Ensure you have a valid client secret
     - The secret value matches what you set in Vercel as `CLIENT_SECRET`
   - **API permissions**:
     - Should have permissions for Microsoft Graph if needed

## Step 6: Update Teams App Manifest (if needed)

1. **Open your Teams app manifest** (`appPackage/manifest.json`)

2. **Verify the bot ID** matches your `CLIENT_ID`:
   ```json
   {
     "bots": [{
       "botId": "YOUR-CLIENT-ID-HERE"
     }]
   }
   ```

3. **If you need to update it**, you'll need to re-upload the app to Teams (see Step 7)

## Step 7: Test Your Bot

1. **Test the health endpoint**:
   Open in browser:
   ```
   https://your-project-name.vercel.app/
   ```
   Should return: "Bot is running!"

2. **Test the messages endpoint** (optional):
   You can use the `/chat` endpoint for testing:
   ```bash
   curl -X POST https://your-project-name.vercel.app/chat \
     -H "Content-Type: application/json" \
     -d '{"text": "hello"}'
   ```

3. **Test in Microsoft Teams**:
   - Open Microsoft Teams
   - Go to **Apps** → **Manage your apps** → **Upload an app**
   - Upload your `appPackage/manifest.json` (or the `.zip` file)
   - Find your bot and start a conversation
   - Send a message to test

## Step 8: Monitor and Debug

### View Logs in Vercel

1. Go to your Vercel dashboard
2. Click on your project
3. Go to **Deployments** tab
4. Click on a deployment
5. Click **Functions** tab to see serverless function logs
6. Click on a function to see detailed logs

### Common Issues and Solutions

**Issue: Bot not responding in Teams**
- Check Vercel logs for errors
- Verify `CLIENT_ID` and `CLIENT_SECRET` are set correctly
- Verify the messaging endpoint URL in Azure Bot Service
- Check that the bot ID in manifest matches `CLIENT_ID`

**Issue: 401 Unauthorized errors**
- Verify `CLIENT_SECRET` is the actual secret value (not the secret ID)
- Check that the secret hasn't expired
- Verify `CLIENT_ID` matches the Azure App Registration

**Issue: 404 Not Found**
- Verify the endpoint URL is correct: `https://your-project.vercel.app/api/messages`
- Check that the route is properly configured in `vercel.json`

**Issue: Timeout errors**
- Vercel serverless functions have a 10-second timeout on the Hobby plan
- Consider upgrading to Pro plan for longer timeouts
- Optimize your bot's response time

## Step 9: Set Up Custom Domain (Optional)

1. **In Vercel Dashboard**:
   - Go to your project → **Settings** → **Domains**
   - Add your custom domain
   - Follow the DNS configuration instructions

2. **Update Azure Bot Service**:
   - Update the messaging endpoint to use your custom domain
   - Example: `https://bot.yourdomain.com/api/messages`

## Step 10: Continuous Deployment

Vercel automatically deploys when you push to your main branch:
- **Production**: Deploys from your main/master branch
- **Preview**: Creates preview deployments for pull requests

To disable auto-deployment:
- Go to **Settings** → **Git**
- Configure deployment settings as needed

## Security Best Practices

1. **Never commit secrets** to your repository
2. **Use Vercel environment variables** for all sensitive data
3. **Rotate secrets regularly** in Azure and update Vercel
4. **Enable Vercel's security features**:
   - Enable "Vercel Authentication" if needed
   - Use Vercel's DDoS protection (included)

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Microsoft Teams Bot Framework](https://dev.botframework.com/)
- [Azure Bot Service Documentation](https://docs.microsoft.com/azure/bot-service/)

## Support

If you encounter issues:
1. Check Vercel function logs
2. Check Azure Bot Service logs
3. Verify all environment variables are set correctly
4. Test the endpoint manually using curl or Postman

---

**Your bot is now deployed and ready to use!** 🎉


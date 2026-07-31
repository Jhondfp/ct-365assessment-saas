#!/bin/bash

# ============================================================================
# CT Assessment SaaS - Azure Deployment Setup Script
# Configure GitHub Secrets and Deploy Infrastructure
# ============================================================================

set -e

SUBSCRIPTION_ID="35d6dfb5-91e7-4cd4-b0e1-b771118aa3854"
RESOURCE_GROUP="rg-365gov-prod"
LOCATION="brazilsouth"

echo "🚀 CT Assessment SaaS - Azure Deployment Setup"
echo "================================================"

# ========================================================================
# Step 1: Authenticate with Azure
# ========================================================================
echo ""
echo "📝 Step 1: Authenticating with Azure..."
az login --use-device-code

# Set subscription
az account set --subscription "$SUBSCRIPTION_ID"
echo "✓ Subscription set to: $SUBSCRIPTION_ID"

# ========================================================================
# Step 2: Create Service Principal for GitHub Actions
# ========================================================================
echo ""
echo "📝 Step 2: Creating Service Principal for GitHub Actions..."

SP_NAME="ct-assessment-github-actions"
SP_JSON=$(az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role "Contributor" \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --json-auth)

echo ""
echo "✓ Service Principal created!"
echo ""
echo "Add this to GitHub Secrets as AZURE_CREDENTIALS:"
echo "=================================================="
echo "$SP_JSON"
echo ""

# ========================================================================
# Step 3: Generate PostgreSQL Admin Password
# ========================================================================
echo ""
echo "📝 Step 3: Generating PostgreSQL Admin Password..."

if command -v openssl &> /dev/null; then
    PG_PASSWORD=$(openssl rand -base64 32)
    echo "✓ PostgreSQL password generated (save to GitHub Secrets as PG_ADMIN_PASSWORD):"
    echo "$PG_PASSWORD"
else
    echo "⚠️  openssl not found. Please generate a password manually."
    echo "   Command: openssl rand -base64 32"
    read -p "Enter PostgreSQL password: " PG_PASSWORD
fi

# ========================================================================
# Step 4: Deploy Infrastructure via Bicep
# ========================================================================
echo ""
echo "📝 Step 4: Deploying Infrastructure via Bicep..."
echo "   (This will take 5-10 minutes)"
echo ""

DEPLOYMENT_NAME="ct-assessment-$(date +%s)"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters \
    environment=prod \
    location="$LOCATION" \
    pgAdminPassword="$PG_PASSWORD" \
    appServiceSku=B2 \
  --name "$DEPLOYMENT_NAME"

# ========================================================================
# Step 5: Get Deployment Outputs
# ========================================================================
echo ""
echo "📝 Step 5: Retrieving Deployment Outputs..."

OUTPUTS=$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query 'properties.outputs' -o json)

echo ""
echo "✓ Deployment completed!"
echo ""
echo "Resource Information:"
echo "==================="
echo "$OUTPUTS" | jq .

# ========================================================================
# Step 6: Get Container Registry Credentials
# ========================================================================
echo ""
echo "📝 Step 6: Getting Container Registry Credentials..."

REGISTRY_INFO=$(az acr credential show \
  --resource-group "$RESOURCE_GROUP" \
  --name "ctassessment" 2>/dev/null || echo "{}")

echo ""
echo "Add to GitHub Secrets:"
echo "====================="
echo "AZURE_REGISTRY_USERNAME:"
echo "$REGISTRY_INFO" | jq -r '.username'
echo ""
echo "AZURE_REGISTRY_PASSWORD:"
echo "$REGISTRY_INFO" | jq -r '.passwords[0].value'

# ========================================================================
# Step 7: Get App Service Publish Profile
# ========================================================================
echo ""
echo "📝 Step 7: Getting App Service Publish Profile..."

APP_SERVICE_NAME=$(az webapp list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].name" -o tsv 2>/dev/null || echo "")

if [ -n "$APP_SERVICE_NAME" ]; then
    PUBLISH_PROFILE=$(az webapp deployment list-publishing-profiles \
      --resource-group "$RESOURCE_GROUP" \
      --name "$APP_SERVICE_NAME" \
      --output xml)
    
    echo ""
    echo "Add to GitHub Secrets as AZURE_APP_SERVICE_PUBLISH_PROFILE:"
    echo "==========================================================="
    echo "$PUBLISH_PROFILE"
else
    echo "⚠️  App Service not found yet. Wait a few minutes and try again."
fi

# ========================================================================
# Step 8: Summary
# ========================================================================
echo ""
echo "✅ Setup Complete!"
echo ""
echo "Next Steps:"
echo "==========="
echo "1. Add all secrets to GitHub (Settings → Secrets and variables → Actions)"
echo "2. Push your code to main branch: git push origin main"
echo "3. Monitor deployment in GitHub Actions tab"
echo "4. Access your application at:"
echo "   - API: https://$APP_SERVICE_NAME.azurewebsites.net"
echo ""
echo "For more details, see DEPLOYMENT_AZURE.md"

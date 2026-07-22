# CT Assessment SaaS - Development Status

## Project Overview

A production-ready multi-tenant SaaS platform for analyzing Microsoft 365 SharePoint and OneDrive environments. Designed for security-focused assessments with LGPD compliance, real-time data collection, email notifications, PDF reports, and credit-based billing.

## Architecture

### Multi-Tenant Design
- **Isolation Model**: Silo (separate SQL database per tenant)
- **Control Plane**: Centralized management and API
- **Data Planes**: Isolated PowerShell job containers per tenant
- **Authentication**: Separate flows for internal team (single-tenant SSO) and customers (multi-tenant consent)

### Technology Stack
- **Backend**: Node.js + Express.js
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Database**: SQL Server (control plane + isolated tenants)
- **Infrastructure**: Azure (App Service, SQL Database, Container Registry, Key Vault, Storage)
- **Jobs**: PowerShell 7 containerized workers
- **Email**: SendGrid SMTP integration
- **PDF**: HTML-to-PDF conversion with Azure Blob Storage
- **Graph API**: Microsoft Graph for M365 data collection

## Implementation Status

### ✅ Database Schema
- **001-initial-schema.sql**: 8 tables, 4 stored procedures (control plane core)
- **002-add-features.sql**: Execution snapshots, email queue, PDF reports, templates
- **003-add-billing-and-users.sql**: Complete billing, client/tenant/user management
- **001-tenant-isolated-schema.sql**: Tenant isolation with SharePoint/OneDrive tables, findings, audit logs
- **002-license-analysis-schema.sql**: 7 tables for license tracking, utilization analysis, cost modeling, and recommendations

### ✅ Backend Services

#### Database Layer (`services/database.js`)
- Connection pooling
- User/client/tenant/execution queries
- Audit logging

#### Core Services
- **features.js** (380+ lines): Snapshots, email queue, PDF registration, templates, credits
- **email.js** (450+ lines): SendGrid integration, HTML templates, invitation emails
- **pdf-generator.js**: HTML reports, Azure Blob upload with SAS tokens
- **sharepoint.js** (450+ lines): Microsoft Graph API service with risk detection
- **clientService.js**: Client registration, listing, updates, provisioning
- **tenantService.js**: Tenant creation, app registration, database initialization
- **userService.js**: User management, invitations (7-day tokens), role-based access
- **billingService.js**: Credit plans, purchase tracking, consumption ledger, invoicing
- **executionService.js**: Execution lifecycle, credit consumption, email notifications
- **licenseService.js** (350+ lines): License dashboard, analysis, utilization metrics, cost modeling, recommendations

### ✅ Backend API Routes

#### Auth Routes (`routes/auth.js`)
- SSO flows (internal + customer)
- Login/logout
- Session management

#### Admin Routes (`routes/admin.js`)
- Client CRUD: Create, list, get, update, delete with stats
- Tenant provisioning: Create, list, app registration, SharePoint site management
- User management: Invite, list, manage invitations, CRUD
- Public invitation acceptance: `/api/auth/accept-invitation`

#### Billing Routes (`routes/billing.js`)
- Credit plans: List available tiers
- Client credits: Purchase, view balance, transaction history
- Invoicing: Generate, list, get invoice details
- Billing dashboard: Comprehensive view with metrics

#### Feature Routes (`routes/features.js`)
- Execution versions: List snapshots by execution
- Snapshot comparison: Delta detection between versions
- PDF reports: Generate or retrieve cached reports
- Templates: CRUD for execution configurations
- Email queue: Monitor pending notifications

#### Execution Routes (`routes/executions.js`)
- Create execution
- Get execution details
- Update status (with credit consumption)

#### License Routes (`routes/licenses.js`)
- Dashboard: Overview with metrics, cost breakdown, top recommendations
- Summary: SKU-level analysis with cost and utilization data
- Utilization: Per-user metrics and activity statistics
- Unused licenses: Priority-based grouping (critical/high/medium)
- Downgrade opportunities: Underutilized license identification
- Cost analysis: Monthly costs and ROI metrics
- Recommendations: Optimization suggestions with filters
- Recommendation resolution: Mark recommendations as implemented
- Report generation: Comprehensive analysis aggregation
- Data import: ETL for Graph API data into tenant database

### ✅ PowerShell Scripts

#### `entrypoint.ps1` (410+ lines)
- Azure Managed Identity authentication
- Access token generation for Graph API
- SharePoint and OneDrive data collection orchestration
- Tenant-isolated database connection and write operations
- Collection logging with statistics and cost calculation
- Comprehensive error handling with transactional safety
- JSON report output with execution metadata

#### `Get-SPOInfo.ps1` (320+ lines)
- SharePoint site enumeration
- Document library analysis
- Recursive folder structure scanning (configurable depth)
- File metadata collection (name, size, extension, dates, creator)
- Sharing permission detection
- JSON output with summary statistics

#### `Get-OneDriveInfo.ps1` (290+ lines)
- User and OneDrive enumeration
- Quota information collection (used/total)
- File and folder analysis
- External sharing detection
- Batch processing with configurable user limit
- JSON output with per-user statistics

#### `Get-LicenseInfo.ps1` (300+ lines)
- Microsoft Graph API license enumeration
- SKU subscription details with prepaid/consumed units
- User license assignment collection
- Activity data analysis via reports API
- Unused license identification (inactivity-based)
- Underutilization detection (service adoption scoring)
- Cost estimation and ROI calculations
- Recommendation generation with severity prioritization
- JSON output with summary, licensesByType, and detailed analysis

### ✅ Frontend Pages

#### Public Pages
- **AcceptInvitation.tsx**: User-facing invitation acceptance with account creation

#### Authenticated Pages
- **Dashboard.tsx**: Main dashboard with key metrics
- **Clients.tsx**: Client list with pagination
- **ClientDetail.tsx**: Single client view with related tenants/users
- **ClientRegistration.tsx**: Multi-field form for company registration
- **TenantProvisioning.tsx**: Step-by-step tenant setup (4 steps with app registration)
- **UserManagement.tsx**: Invite users, manage pending invitations, list active users
- **BillingDashboard.tsx**: Credits, consumption tracking, purchase flow, invoices, transactions
- **Executions.tsx**: List and manage assessments
- **ExecutionHistory.tsx**: Timeline view with snapshot comparison
- **Tenants.tsx**: Tenant management
- **Settings.tsx**: User preferences
- **LicenseDashboard.tsx**: License metrics, cost breakdown by SKU, top recommendations
- **LicenseAnalysis.tsx**: Three-tab analysis (unused licenses, downgrade opportunities, utilization)
- **LicenseRecommendations.tsx**: Filterable recommendations with resolution tracking

### ✅ Frontend API Client (`services/api.ts`)

#### Admin API Methods
- Client management: create, list, get, update, stats
- Tenant management: create, list, get, app registration, SharePoint sites
- User management: invite, list, manage invitations, CRUD

#### Billing API Methods
- Credit plans: list
- Client credits: setup, get, purchase, transaction history
- Invoicing: list, get, dashboard
- Auth: accept invitation

#### License API Methods
- Dashboard: Overview with metrics and recommendations
- Summary: SKU-level breakdown with costs
- Utilization: Per-user metrics and statistics
- Unused licenses: Priority-based grouping
- Downgrade opportunities: Underutilization analysis
- Costs: Monthly costs and ROI data
- Recommendations: Optimization suggestions with filtering
- Mark resolved: Update recommendation status
- Report: Comprehensive aggregation
- Import: ETL for Graph API data

### ✅ Configuration & Deployment

#### Environment Setup
- `.env.example`: Updated with SendGrid, Azure Storage, billing keys
- `config/index.js`: Configuration loading with validation
- `package.json`: All dependencies installed (Express, SendGrid, html-pdf, Azure SDK, Passport)

#### Database Migrations
- Automatic migration runner: `npm run migrate`
- Three complete migration files with transactional safety

#### Email Templates
- Completion notification template with execution summary
- Invitation template with 7-day expiration notice
- Custom HTML templates with styling

### ✅ License Analysis & Utilization
- **Database schema**: 7 tables with views and stored procedures
- **PowerShell collection**: Get-LicenseInfo.ps1 with Graph API integration
- **Backend service**: licenseService.js with 10+ analysis methods
- **API endpoints**: 10 routes for dashboard, analysis, and reporting
- **Frontend pages**: LicenseDashboard, LicenseAnalysis, LicenseRecommendations
- **Job integration**: Automatic license data collection via entrypoint.ps1

### ⏳ Pending Implementation

#### Backend Integration
- [ ] Credit consumption trigger on execution completion (auto-deduct in sp_ConsumeCredits)
- [ ] Email queue processor background job integration
- [ ] PDF generation async job queuing
- [ ] Azure AD app registration API integration (automatic app creation in customer tenant)
- [ ] Key Vault credential storage for app secrets
- [ ] Tenant database initialization validation

#### Frontend Features
- [ ] Navigation updates to show new menu items
- [ ] Client list buttons for "New Tenant", "Manage Users", "View Billing"
- [ ] Landing page/onboarding flow
- [ ] Admin dashboard with client statistics

#### Production Readiness
- [ ] Unit tests for services
- [ ] Integration tests for API endpoints
- [ ] E2E tests for workflows
- [ ] Docker setup for containerization
- [ ] Kubernetes manifests for Azure deployment
- [ ] CI/CD pipeline configuration (GitHub Actions)
- [ ] Monitoring and alerting setup
- [ ] Security audit and penetration testing

## Key Workflows Implemented

### Client Onboarding
1. Create client → ClientRegistration.tsx
2. Provision tenant → TenantProvisioning.tsx (with app registration)
3. Configure SharePoint sites
4. Setup billing plan
5. Invite team members → UserManagement.tsx
6. Users accept invitations → AcceptInvitation.tsx

### Assessment Execution
1. Create execution from template or scratch
2. Trigger job via PowerShell container
3. Collect SharePoint/OneDrive data via Graph API
4. Store in tenant-isolated database
5. Detect risks and store findings
6. Complete execution with credit deduction
7. Generate PDF report
8. Send notification email
9. Save execution snapshot for versioning

### Billing & Credits
1. Setup plan on client creation
2. Get credit allocation based on plan tier
3. Execute assessments (consume credits)
4. Purchase additional credits as needed
5. Generate monthly invoices with overage calculation
6. View transaction history and billing dashboard

### User Management
1. Invite user (7-day token)
2. Send email with acceptance link
3. User accepts and creates account
4. User gains access to client dashboard
5. Admin can manage roles and permissions

### License Analysis & Optimization
1. Automatic collection via Get-LicenseInfo.ps1 on each execution
2. SKU and user license data stored in tenant database
3. Cost analysis and utilization metrics calculated via stored procedures
4. Recommendations generated for unused, underutilized, and upgradeable licenses
5. Dashboard displays key metrics: total licenses, monthly cost, average utilization, potential savings
6. Analysis pages show detailed breakdowns: unused licenses (priority-based), downgrade opportunities, utilization statistics
7. Recommendations filterable by severity and type with resolution tracking
8. Cost ROI calculations support billing and customer engagement

## Database Design Highlights

### Isolation
- Separate database per tenant (`ct_assessment_{tenant_id}`)
- Complete data separation for LGPD compliance
- Per-tenant audit trail with `coletado_em` timestamps

### Billing Tables
- `credit_plans`: Three tiers (Starter/Professional/Enterprise)
- `client_credits`: Current balance and monthly consumption
- `credit_transactions`: Immutable ledger of all movements
- `consumo_assessments`: Links executions to credit consumption
- `faturas`: Monthly invoices with overage calculations
- `user_invites`: 7-day expiration tokens with status tracking

### Execution Versioning
- `executions`: Core execution records with configuration
- `execution_snapshots`: Immutable version history with delta capability
- Stored procedures for automatic versioning on completion

### License Analysis Tables
- `license_plans`: SKU registry with pricing and availability
- `user_licenses`: User-to-license assignments with status
- `license_services`: Service-level availability per license
- `license_utilization`: Activity and utilization metrics (dias_inativo, utilizacao_percentual, servicos_utilizados)
- `license_service_activity`: Per-service usage tracking
- `license_costs_analysis`: Monthly cost calculations and ROI (custo_mensal_estimado_brl, economia_potencial_mensal_brl, taxa_utilizacao_media)
- `license_recommendations`: Optimization suggestions (severidade: high/medium/low; tipo: unused_license/downgrade_opportunity/upgrade_opportunity/service_disabled)
- Views: vw_license_summary_by_sku, vw_unused_licenses, vw_downgrade_opportunities
- Stored procedures: sp_UpsertLicensePlan, sp_CalculateLicenseCostsAnalysis, sp_GenerateLicenseRecommendations

## API Endpoints Summary

### Admin Endpoints (35+ routes)
```
POST   /api/admin/clients                          - Create client
GET    /api/admin/clients                          - List clients
GET    /api/admin/clients/:id                      - Get client
GET    /api/admin/clients/:id/stats                - Client statistics
PUT    /api/admin/clients/:id                      - Update client

POST   /api/admin/clients/:clientId/tenants        - Create tenant
GET    /api/admin/clients/:clientId/tenants        - List tenants
POST   /api/admin/tenants/:id/app-registration     - Register OAuth app
POST   /api/admin/tenants/:id/sharepoint-sites     - Add SharePoint site
GET    /api/admin/tenants/:id/sharepoint-sites     - List sites

POST   /api/admin/clients/:clientId/users/invite   - Invite user
GET    /api/admin/clients/:clientId/users          - List users
GET    /api/admin/clients/:clientId/users/invitations - List pending invites
DELETE /api/admin/clients/:clientId/users/invitations/:id - Cancel invite

POST   /api/billing/clients/:clientId/setup-billing      - Setup plan
GET    /api/billing/credit-plans                         - List plans
POST   /api/billing/clients/:clientId/credits/purchase   - Buy credits
GET    /api/billing/clients/:clientId/billing/dashboard  - Dashboard data
GET    /api/billing/clients/:clientId/invoices           - List invoices
```

#### License Routes (10+ routes)
```
GET    /api/licenses/clients/:clientId/dashboard              - Overview with metrics and recommendations
GET    /api/licenses/clients/:clientId/summary               - SKU-level breakdown with costs
GET    /api/licenses/clients/:clientId/utilization           - Per-user metrics and statistics
GET    /api/licenses/clients/:clientId/unused?daysInactive   - Priority-based unused license grouping
GET    /api/licenses/clients/:clientId/downgrade-opportunities - Underutilization analysis
GET    /api/licenses/clients/:clientId/costs                 - Monthly costs and ROI data
GET    /api/licenses/clients/:clientId/recommendations       - Optimization suggestions
PATCH  /api/licenses/recommendations/:id/resolve             - Mark recommendation as implemented
GET    /api/licenses/clients/:clientId/report                - Comprehensive analysis aggregation
POST   /api/licenses/clients/:clientId/import                - ETL for Graph API data
```

### Public Endpoints
```
POST /api/auth/accept-invitation  - Accept user invitation and create account
```

## Next Steps for Production Deployment

1. **Test license collection**: Verify Get-LicenseInfo.ps1 with real Microsoft 365 tenant
2. **Validate license recommendations**: Test algorithm with sample data across different company sizes
3. **Complete credit consumption integration**: Wire sp_ConsumeCredits trigger on execution completion
4. **Implement Azure AD automation**: Automatic app registration in customer tenants
5. **Add navigation UI**: Update client detail page with license module links
6. **Deploy infrastructure**: Configure Azure resources, app registrations, Key Vault
7. **Setup monitoring**: Application Insights, alerting, dashboards
8. **Configure CI/CD**: GitHub Actions for automated testing and deployment
9. **Run security audit**: Penetration testing, OWASP compliance check
10. **Load testing**: Verify scalability before customer launch
11. **User acceptance testing**: Validate workflows with test customers including license analysis
12. **Documentation**: API docs, user guides, admin guides
13. **Go-live**: Deploy to production with monitoring

## Code Quality Notes

- **No premature abstractions**: Code is pragmatic and focused on MVP
- **Minimal comments**: Code is self-documenting with clear naming
- **SQL best practices**: Parameterized queries, transactional safety, indexed searches
- **Error handling**: Comprehensive try-catch with logging at all layers
- **Security**: SQL injection prevention, HTTPS enforcement, CORS configuration, helmet.js

## Repository Structure

```
/control-plane
  /backend
    /src
      /services/        # Business logic services
      /routes/          # API endpoints
      /middleware/      # Auth, logging, error handling
      /config/          # Configuration management
      /migrations.js    # Database migration runner
      /index.js         # Express app setup
    /package.json
  /frontend
    /src
      /pages/           # React components
      /services/        # API client, utilities
      /components/      # Reusable UI components
      /hooks/           # Custom React hooks
      /types/           # TypeScript interfaces
  /migrations/          # SQL migration files
  /docs/                # Documentation

/data-plane-job
  /scripts/             # PowerShell collection scripts
  /migrations/          # Tenant database setup
  /Dockerfile           # Job container definition
  /entrypoint.ps1       # Main execution orchestrator

/infrastructure
  /bicep/               # Azure Infrastructure as Code
```

## Testing & Validation Checklist

### Before Production Launch
- [ ] All database migrations execute without errors
- [ ] All API endpoints return expected responses
- [ ] Credit consumption working end-to-end
- [ ] Email notifications sent and received
- [ ] PDF reports generate correctly
- [ ] PowerShell scripts collect data accurately
- [ ] Tenant isolation verified (no data leakage)
- [ ] Performance under load acceptable
- [ ] Error handling and rollback working
- [ ] Security review passed

## Communication & Support

- **Team**: Internal CT Assessment team (SSO via corporate Azure AD)
- **Customers**: Invited via email, create accounts via invitation link
- **Support**: Email queue system with SendGrid integration
- **Documentation**: Inline code comments, API docs, user guides

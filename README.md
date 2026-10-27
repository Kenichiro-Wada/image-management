# Image Management System

A serverless image management system running on AWS. Administrators can upload and manage images, while the public can browse published images through a web gallery.

## Features

- **Serverless Architecture**: Fully serverless using AWS Lambda, API Gateway, and DynamoDB
- **Auto-Scaling**: Handles high traffic with automatic scaling
- **Secure**: Authentication and RBAC via AWS Cognito
- **Fast Delivery**: Image delivery through CloudFront CDN
- **Auto Thumbnails**: Automatically generates 3 thumbnail sizes on upload (150x150, 400x400, 800x600)
- **Flexible Search**: Search and filter by tags, keywords, and capture date
- **Modern UI**: Responsive design with React 18 + TypeScript
- **Bulk Operations**: Bulk download (ZIP), bulk publish/unpublish, bulk tagging, bulk delete
- **Rating System**: 1-5 star rating for images (admin)
- **Like System**: Anonymous like feature for viewers (no auth required)
- **Self Sign-Up**: User registration with reCAPTCHA v3 bot protection
- **Image Detail Navigation**: Navigate between images in the detail modal with prev/next buttons and keyboard arrows
- **Like Filter**: Filter images by like status in admin panel, display like counts on image cards
- **Slideshow**: Auto-play slideshow with pause/resume and manual navigation
- **URL Tag Filtering**: Share gallery links filtered by specific tags
- **Viewer Sort**: Sort public gallery by capture date, upload date, filename, or tag (asc/desc)
- **Visibility Filter**: Filter images by public/private status in admin panel
- **Responsive Modal**: Full-screen vertical layout on mobile (768px and below)
- **Exif Orientation**: Auto-rotate thumbnails based on Exif orientation data
- **S3 Presigned Upload**: Direct S3 upload via presigned URLs (bypasses API Gateway 10MB limit)
- **Security**: axios version pinned to 1.13.5 (supply chain attack mitigation)

## Architecture

### Stack Structure (Layered)

#### Infrastructure Layer
1. **InfraStorageStack**: S3 buckets, CloudFront distributions
2. **InfraDatabaseStack**: DynamoDB tables
3. **InfraAuthStack**: Cognito User Pool, user groups

#### Application Layer
4. **AppAdminStack**: Admin API Gateway, Lambda functions
5. **AppViewerStack**: Viewer API Gateway, Lambda functions

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Infrastructure | AWS CDK v2.1109.0 (TypeScript) |
| Backend | Node.js 24.x LTS, TypeScript |
| Frontend | React 18, TypeScript, Vite |
| Testing | Jest, fast-check, Playwright |
| Image Processing | Sharp.js |
| Authentication | AWS Cognito, AWS Amplify |

## Key Features

### Admin Panel
- Multi-file and folder upload via S3 presigned URLs (JPEG only, bypasses API Gateway 10MB limit)
- Tag management with autocomplete
- 3-tier user permissions (System Admin / Image Manager / Regular User)
- Single and bulk image download (ZIP with signed URLs, batch splitting for 50+ images)
- Bulk publish/unpublish
- Bulk tagging
- 1-5 star rating with average display and filtering
- Like filter (show only images with likes, like count badges)
- Visibility filter (all / public only / private only)
- Image detail modal with prev/next navigation (buttons + arrow keys)
- Pagination with bulk delete
- Logout functionality
- Self sign-up with reCAPTCHA v3

### Viewer Gallery
- Infinite scroll public gallery
- Image zoom modal with navigation
- Sort by capture date, upload date, filename, or tag (asc/desc)
- Search by keywords, tags, and date range
- Slideshow with auto-play, pause/resume
- Like feature (anonymous, localStorage-based)
- URL parameter tag filtering (`?tag=landscape&tag=summer`)
- Responsive modal (full-screen vertical layout on mobile)


## Quick Start

### Prerequisites

- Node.js 24.x LTS
- AWS CLI (configured)
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS account with appropriate IAM permissions

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd image-management-system

# Install dependencies
npm install

# Lambda dependencies
cd lambda && npm install && cd ..

# Admin frontend dependencies
cd frontend-admin && npm install && cd ..

# Viewer frontend dependencies
cd frontend-viewer && npm install && cd ..

# Build TypeScript
npm run build
```

### Initial Deployment

```bash
# CDK Bootstrap (first time only)
npx cdk bootstrap

# Deploy all stacks
npx cdk deploy --all --require-approval never
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

## Development Commands

### CDK

```bash
# Build TypeScript
npm run build

# Watch mode
npm run watch

# Synth CloudFormation template (dev)
npx cdk synth

# Synth for production
npx cdk synth -c environment=prd

# Diff before deploy
npx cdk diff

# Deploy all stacks (dev)
npx cdk deploy --all

# Deploy all stacks (prd)
npx cdk deploy --all -c environment=prd

# Deploy specific stack
npx cdk deploy ImageManagement-App-Admin-Dev

# Deploy infrastructure layer only
npx cdk deploy ImageManagement-Infra-Storage-Dev ImageManagement-Infra-Database-Dev ImageManagement-Infra-Auth-Dev

# Deploy application layer only
npx cdk deploy ImageManagement-App-Admin-Dev ImageManagement-App-Viewer-Dev

# Destroy all stacks
npx cdk destroy --all
```

### Lambda Build & Deploy

```bash
cd lambda && npm run build
npx cdk deploy ImageManagement-App-Admin-Dev --require-approval never
npx cdk deploy ImageManagement-App-Viewer-Dev --require-approval never
```

### Frontend Build & Deploy

```bash
# Admin frontend
cd frontend-admin && npm run build
aws s3 sync dist/ s3://<admin-bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <admin-distribution-id> --paths "/*"

# Viewer frontend
cd frontend-viewer && npm run build
aws s3 sync dist/ s3://<viewer-bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <viewer-distribution-id> --paths "/*"
```

### Environment Configuration

The project supports multiple environments (dev/prd).

| Variable | Description | Default |
|----------|-------------|---------|
| `environment` | Deployment environment | `dev` |
| `region` | AWS region | `ap-northeast-1` |

```bash
# Deploy to production
npx cdk deploy --all -c environment=prd

# Deploy to a different region
npx cdk deploy --all -c region=us-west-2
```

#### Stack Naming Convention

**Infrastructure Layer:**
- dev: `ImageManagement-Infra-Storage-Dev`, `ImageManagement-Infra-Database-Dev`, `ImageManagement-Infra-Auth-Dev`
- prd: `ImageManagement-Infra-Storage-Prd`, `ImageManagement-Infra-Database-Prd`, `ImageManagement-Infra-Auth-Prd`

**Application Layer:**
- dev: `ImageManagement-App-Admin-Dev`, `ImageManagement-App-Viewer-Dev`
- prd: `ImageManagement-App-Admin-Prd`, `ImageManagement-App-Viewer-Prd`

#### Resource Tags

All resources are automatically tagged:
- `Project`: ImageManagement
- `Environment`: dev or prd
- `ManagedBy`: CDK

### Testing

```bash
# Backend unit tests
cd lambda && npm test

# Frontend tests
cd frontend-admin && npm test
cd frontend-viewer && npm test

# E2E tests
cd e2e && npm test
```

## Project Structure

```
.
├── bin/                          # CDK app entry point
│   └── image-management.ts
├── lib/                          # CDK Stack definitions
│   ├── infra-storage-stack.ts    # Storage (S3, CloudFront)
│   ├── infra-database-stack.ts   # Database (DynamoDB)
│   ├── infra-auth-stack.ts       # Auth (Cognito)
│   ├── app-admin-stack.ts        # Admin API + Lambda
│   └── app-viewer-stack.ts       # Viewer API + Lambda
├── lambda/                       # Lambda function source
│   └── src/handlers/             # Handler implementations
├── frontend-admin/               # Admin React app (Vite)
├── frontend-viewer/              # Viewer React app (Vite)
├── e2e/                          # E2E tests (Playwright)
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
├── .kiro/specs/                  # Feature specifications
├── .github/                      # CI/CD workflows
├── cdk.json                      # CDK configuration
└── README.md
```


## AWS Resources

### InfraStorageStack
- **Amazon S3**: Original images (versioning enabled), thumbnails, admin frontend hosting, viewer frontend hosting
- **Amazon CloudFront**: 4 distributions (admin, viewer, images, thumbnails) with OAI, TLS 1.2+, IPv6, HTTP/2 & HTTP/3
- **S3 Lifecycle Rule**: Auto-delete temporary files under `tmp/` prefix after 1 day

### InfraDatabaseStack
- **Amazon DynamoDB**: Images metadata table (with GSI1 for user-based listing, GSI2 for public listing), tags table, users table
- On-demand capacity mode

### InfraAuthStack
- **Amazon Cognito**: User Pool with self sign-up, email verification, password policy
- User groups: System_Admin, Image_Manager, Regular_User
- Post Confirmation trigger (auto-assign Regular_User group)
- reCAPTCHA v3 integration for sign-up

### AppAdminStack
- **API Gateway**: Admin REST API with Cognito authorizer, CORS, binary media types
- **Lambda Functions** (Node.js 24.x):
  - Image upload, list, delete, bulk delete
  - Tag add, delete, autocomplete, bulk tag
  - Image download, bulk download (ZIP)
  - Visibility change, bulk visibility
  - Rating (add/update, get)
  - Auth (login, verify, user info, reCAPTCHA verify)

### AppViewerStack
- **API Gateway**: Viewer REST API (no auth required), CORS
- **Lambda Functions** (Node.js 24.x):
  - Public image list (cursor-based pagination)
  - Image search (keyword, tags, date range)
  - Like/Unlike

## User Roles

| Role | Permissions |
|------|------------|
| System_Admin | Full access to all operations and all users' images |
| Image_Manager | View, download, change visibility for all images |
| Regular_User | Manage own images only (upload, edit, delete, download) |

## Deployment Order

Stack dependencies are resolved automatically by CDK:

1. **Infrastructure Layer** (can deploy in parallel)
   - InfraStorageStack, InfraDatabaseStack, InfraAuthStack

2. **Application Layer** (after infrastructure)
   - AppAdminStack (depends on Storage, Database, Auth)
   - AppViewerStack (depends on Storage, Database)

## Documentation

### Technical
- [API Reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [reCAPTCHA Setup](docs/RECAPTCHA_SETUP.md)
- [DynamoDB Scaling Strategy](docs/dynamodb-scaling-strategy.md)

### User Manuals
- [Admin Manual](docs/ADMIN_MANUAL.md)
- [Viewer Manual](docs/VIEWER_MANUAL.md)

### CI/CD

GitHub Actions workflows:
- `backend-test.yml`: Backend unit tests
- `frontend-test.yml`: Frontend build and tests
- `e2e-test.yml`: E2E tests
- `cdk-deploy.yml`: Infrastructure and application deployment

## License

This project is licensed under the MIT License.

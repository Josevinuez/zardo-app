# Zardo Cards Master Panel V2

A comprehensive Shopify app for trading card inventory management, automated product imports, and customer engagement features.

## 🚀 Features Overview

### 📦 **Product Import Systems**
- **PSA Card Import**: Automated import of PSA-graded trading cards with real-time data fetching
- **Troll & Toad Import**: Bulk import from Troll & Toad marketplace
- **Manual Product Creation**: Create products manually with custom conditions and pricing
- **Lot Management**: Track and convert lot purchases into individual Shopify products

### 🤖 **Automations**
- **Active/Draft Automation**: Automatically sets products to DRAFT when inventory reaches 0, ACTIVE when inventory is available
- **Inventory Monitoring**: Real-time webhook-based inventory level tracking
- **Email Notifications**: Automated wishlist notifications when products become available
- **Collection Management**: Automatic addition to arrivals collection when products go live

### 📊 **Analytics & Management**
- **Store Value Calculator**: Track total store inventory value over time
- **Product Analytics**: Monitor product performance and inventory levels
- **Bulk Operations**: Mass product management and status updates

### 🎯 **Customer Engagement**
- **Wishlist Extension**: Customer account wishlist functionality
- **VIP Rewards Tracker**: Customer loyalty and rewards tracking
- **Email Marketing**: Automated email campaigns for product availability

## 🛠️ Technical Architecture

### **Framework & Technologies**
- **React Router + Vite**: Client-side routing and build pipeline
- **Express + Shopify App Express**: Embedded app backend and webhook handling
- **Shopify CLI**: App development and deployment
- **GraphQL**: Shopify Admin API integration
- **Prisma**: Database ORM with PostgreSQL
- **Bee-Queue**: Redis-based job queuing
- **Supabase**: Image storage and API key management
- **Sharp**: Image processing and optimization

### **Database Schema**
- **Products**: Shopify product synchronization
- **Product Variants**: Inventory and pricing data
- **Lots**: Purchase tracking and conversion
- **Analytics**: Store value and performance metrics
- **PSA Results**: Import job tracking
- **Notifications**: Email campaign results

## 📋 **Core Modules**

### **PSA Import System** (`app/modules/psa.server.ts`)
- Real-time PSA API integration
- Image processing and upload to Supabase
- Batch processing with queue management
- API key rotation and rate limiting
- Product creation with variants and media

### **Store Management** (`app/modules/store.server.ts`)
- Inventory level monitoring
- Active/Draft automation
- Collection management
- Store value calculations
- Bulk product operations

### **Lot Management** (`app/modules/lot.server.ts`)
- Purchase tracking
- Product conversion to Shopify
- Inventory management
- Cost tracking and profit calculations

### **Webhook Processing** (`app/routes/webhooks.tsx`)
- Real-time inventory updates
- Product status automation
- Email notification triggers
- Collection management

## 🔧 **Environment Variables**

### **Required Variables**
```bash
# Shopify Configuration
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://yourdomain.com
SCOPES=read_files,read_inventory,read_locations,read_orders,read_products,read_publications,write_files,write_inventory,write_orders,write_products,write_publications

# Database
DATABASE_URL=postgresql://user:password@host:port/database
DIRECT_URL=postgresql://user:password@host:port/database

# PSA API Keys
PSA_API_KEY_DYLAN=your_dylan_key
PSA_API_KEY_ZARDOCARDS=your_zardocards_key

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# Store Configuration
PRODUCT_LINK=https://yourstore.com/products/
STORE_NAME=Your Store Name
ARRIVALS_COLLECTION_ID=your_collection_id
SHOPIFY_DEFAULT_VENDOR=ZardoCards
```

## 🚀 **Installation & Setup**

### **1. Clone Repository**
```bash
git clone <repository-url>
cd shopify-app
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

### **4. Database Setup**
```bash
npx prisma migrate dev
npx prisma generate
```

### **5. Development Server**
```bash
npm run dev
```

### **6. Deploy to Production**
```bash
npm run build
npm run deploy
```

## 📱 **App Routes & Features**

### **Main Dashboard** (`/app`)
- Store value analytics with charts
- Manual inventory check button
- Quick access to all import tools
- Performance metrics

### **PSA Import** (`/app/psa`)
- Real-time PSA card data fetching
- Batch import processing
- Image upload and processing
- API key management and rotation

### **Troll & Toad Import** (`/app/trolltoad`)
- Bulk marketplace import
- Product data synchronization
- Price and inventory updates

### **Manual Product Creation** (`/app/manual`)
- Custom product creation
- Condition-based variants
- Image upload and processing
- Shipping weight configuration

### **Lot Management** (`/app/lots`)
- Purchase tracking
- Product conversion
- Inventory management
- Cost analysis

### **Internal Settings** (`/app/internal`)
- Product synchronization
- Database cleanup
- System maintenance

## 🔄 **Automations Explained**

### **Active/Draft Automation**
**Trigger**: Inventory level changes via Shopify webhooks
**Process**:
1. `INVENTORY_LEVELS_UPDATE` webhook fires
2. System calculates total available inventory
3. If `total_available === 0`: Product → DRAFT
4. If `total_available > 0`: Product → ACTIVE
5. Email notifications sent for newly available products

### **Email Notifications**
**Trigger**: Product status changes from DRAFT to ACTIVE
**Process**:
1. Check wishlist matches for product name
2. Send email notifications to interested customers
3. Add product to arrivals collection
4. Track notification results

### **Inventory Monitoring**
**Trigger**: Manual button click or scheduled (future)
**Process**:
1. Scan all inventory items
2. Identify products with 0 quantity
3. Set identified products to DRAFT status
4. Log results and statistics

## 🎯 **Extensions**

### **Customer Account Wishlist** (`extensions/customer-account-wishlist-extension/`)
- Customer wishlist functionality
- Product availability notifications
- Multi-language support (EN/FR)

### **VIP Rewards Tracker** (`extensions/vip-rewards-tracker-extension/`)
- Customer loyalty tracking
- Rewards management
- Purchase history

## 📊 **API Integrations**

### **PSA API**
- Real-time card data fetching
- Image retrieval and processing
- API key rotation for rate limiting
- Error handling and retry logic

### **Troll & Toad API**
- Product data synchronization
- Price and inventory updates
- Bulk import processing

### **Supabase**
- Image storage and CDN
- API key usage tracking
- Real-time data synchronization

### **Shopify Admin API**
- Product creation and updates
- Inventory management
- Collection management
- Webhook processing

## 🚨 **Troubleshooting**

### **Common Issues**

**PSA Import Failures**
- Check API key limits and rotation
- Verify Supabase configuration
- Check image processing permissions

**Webhook Automation Not Working**
- Verify webhook registration in Shopify
- Check environment variables
- Review server logs for errors

**Database Connection Issues**
- Verify DATABASE_URL configuration
- Check Prisma migrations
- Ensure PostgreSQL is running

### **Logging & Debugging**
- All automations include comprehensive logging
- Webhook processing logs all steps
- Manual operations show detailed progress
- Error handling with specific error messages

## 🔮 **Future Enhancements**

- Scheduled inventory checks (cron jobs)
- Advanced analytics dashboard
- Customer segmentation
- Automated pricing strategies
- Multi-marketplace integration
- Advanced reporting features

## 📞 **Support**

For issues or questions:
1. Check server logs for detailed error messages
2. Verify environment variable configuration
3. Test individual components (PSA import, webhooks, etc.)
4. Review this documentation for setup requirements

## 🏗️ **Development**

### **Code Structure**
```
server/                # Express backend (authentication, API, webhooks)
├── index.ts
├── shopify.ts
├── routes/
└── webhooks.ts

src/                   # React Router client
├── main.tsx
├── router.tsx
├── routes/
├── providers/
└── ui/

app/                   # Legacy Remix implementation (kept during migration)

extensions/            # Shopify app extensions
├── customer-account-wishlist-extension/
└── vip-rewards-tracker-extension/

trigger/               # Background job processing
├── mail.tasks.ts
├── manual.tasks.ts
└── psa.tasks.ts
```

### **Key Commands**
```bash
npm run dev              # Run Express API and Vite client with live reload
npm run build            # Build client and server bundles
npm run build:client     # Build only the React Router client
npm run build:server     # Build only the Express backend
npm run start            # Start the compiled Express server (after build)
npm run deploy           # Deploy to Shopify (via Shopify CLI)
```

---

**Version**: 2.0  
**Last Updated**: January 2025  
**Maintainer**: Zardo Cards Team
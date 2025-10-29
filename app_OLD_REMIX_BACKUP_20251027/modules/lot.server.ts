import prisma from "~/db.server";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { createBulkVariants, createProductWMedia, getProductExists, productVariantUpdatePrice, adjustInventory, getPrimaryLocationId } from "~/modules/queries.server";

// Type definitions for creating lots and products
export interface CreateLotData {
  purchaseDate: Date;
  totalCost: number;      // "Lot Price" in UI
  lotValue?: number;      // Estimated value of the lot
  initialDebt?: number;
  upsTrackingNumber?: string;
  shippingStatus?: string;
  estimatedDeliveryDate?: Date;
  vendor?: string;        // "Seller Name" in UI
  lotType?: string;
  notes?: string;
  googleSheetsLink?: string;  // Link to Google Sheets for lot tracking
  collectorLink?: string;     // Link to collector database or pricing site
}

export interface UpdateLotData {
  totalCost?: number;      // "Lot Price" in UI
  lotValue?: number;       // Estimated value of the lot
  initialDebt?: number;
  upsTrackingNumber?: string;
  shippingStatus?: string;
  estimatedDeliveryDate?: Date;
  vendor?: string;         // "Seller Name" in UI
  lotType?: string;
  notes?: string;
  trackingStatus?: string; // UPS tracking status
  googleSheetsLink?: string;  // Link to Google Sheets for lot tracking
  collectorLink?: string;     // Link to collector database or pricing site
}

export interface CreateLotProductData {
  productName: string;
  sku?: string;
  description?: string;
  estimatedQuantity?: number;
}

export interface CreateLotProductVariantData {
  variantName: string;
  condition?: string;
  rarity?: string;
  quantity?: number;
  estimatedValue?: number;
}

export interface CreateDebtPaymentData {
  paymentAmount: number;
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
}

/**
 * Service class for managing lots and their associated products
 */
export class LotService {
  
  // --- LOT MANAGEMENT ---

  /**
   * Create a new lot with purchase information
   */
  static async createLot(data: CreateLotData): Promise<any> {
    return prisma.lot.create({
      data: {
        purchaseDate: data.purchaseDate,
        totalCost: data.totalCost,
        lotValue: data.lotValue,
        initialDebt: data.initialDebt || 0,
        upsTrackingNumber: data.upsTrackingNumber,
        shippingStatus: data.shippingStatus || "pending_shipment",
        estimatedDeliveryDate: data.estimatedDeliveryDate,
        vendor: data.vendor,
        lotType: data.lotType,
        notes: data.notes,
        googleSheetsLink: data.googleSheetsLink,
        collectorLink: data.collectorLink,
      },
    });
  }

  /**
   * Update an existing lot
   */
  static async updateLot(id: string, data: UpdateLotData): Promise<any> {
    return prisma.lot.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get a lot by ID with all related data
   */
  static async getLotById(id: string): Promise<any> {
    return prisma.lot.findUnique({
      where: { id },
      include: {
        trackingEvents: {
          orderBy: { createdAt: 'desc' },
        },
        lotProducts: {
          include: {
            variants: {
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        debtPayments: {
          orderBy: { paymentDate: 'desc' },
        },
      },
    });
  }

  /**
   * Get all lots with summary information
   */
  static async getAllLots(): Promise<any[]> {
    return prisma.lot.findMany({
      include: {
        trackingEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Only get the most recent tracking event
        },
        lotProducts: {
          include: {
            variants: {
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete a lot and all associated data
   */
  static async deleteLot(id: string): Promise<void> {
    await prisma.lot.delete({
      where: { id },
    });
  }

  /**
   * Mark a lot as converted to individual products
   */
  static async convertLot(lotId: string): Promise<void> {
    await prisma.lot.update({
      where: { id: lotId },
      data: {
        isConverted: true,
        convertedAt: new Date(),
      },
    });
  }

  /**
   * Record a debt payment (partial or full)
   */
  static async recordDebtPayment(
    lotId: string, 
    paymentData: CreateDebtPaymentData
  ): Promise<{ payment: any; lot: any; remainingDebt: number }> {
    // Get current lot to check debt amount
    const currentLot = await prisma.lot.findUnique({
      where: { id: lotId },
      select: { initialDebt: true },
    });

    if (!currentLot) {
      throw new Error("Lot not found");
    }

    const paymentAmount = Math.min(paymentData.paymentAmount, currentLot.initialDebt);
    const remainingDebt = Math.max(0, currentLot.initialDebt - paymentAmount);

    // Create payment record
    const payment = await (prisma as any).debtPayment.create({
      data: {
        lotId,
        paymentAmount,
        paymentDate: paymentData.paymentDate || new Date(),
        paymentMethod: paymentData.paymentMethod,
        notes: paymentData.notes,
      },
    });

    // Update lot with remaining debt
    const updatedLot = await prisma.lot.update({
      where: { id: lotId },
      data: {
        initialDebt: remainingDebt,
        updatedAt: new Date(),
      },
    });

    return { payment, lot: updatedLot, remainingDebt };
  }

  /**
   * Pay off all remaining debt for a lot
   */
  static async payOffDebt(lotId: string): Promise<any> {
    const lot = await prisma.lot.findUnique({
      where: { id: lotId },
      select: { initialDebt: true },
    });

    if (!lot || lot.initialDebt <= 0) {
      throw new Error("No debt to pay off");
    }

    return this.recordDebtPayment(lotId, {
      paymentAmount: lot.initialDebt,
      paymentMethod: "Full Payoff",
      notes: "Debt marked as fully paid",
    });
  }

  /**
   * Get debt payment history for a lot
   */
  static async getDebtPaymentHistory(lotId: string): Promise<any[]> {
    return prisma.debtPayment.findMany({
      where: { lotId },
      orderBy: { paymentDate: 'desc' },
    });
  }

  /**
   * Get debt payment statistics for a lot
   */
  static async getDebtPaymentStats(lotId: string) {
    const [lot, payments] = await Promise.all([
      prisma.lot.findUnique({
        where: { id: lotId },
        select: { initialDebt: true, totalCost: true },
      }),
      prisma.debtPayment.aggregate({
        where: { lotId },
        _sum: { paymentAmount: true },
        _count: { id: true },
      }),
    ]);

    if (!lot) {
      throw new Error("Lot not found");
    }

    const totalPaid = payments._sum.paymentAmount || 0;
    const originalDebt = totalPaid + lot.initialDebt;
    const remainingDebt = lot.initialDebt;
    const paymentCount = payments._count.id;

    return {
      originalDebt,
      totalPaid,
      remainingDebt,
      paymentCount,
      isFullyPaid: remainingDebt === 0,
      paymentProgress: originalDebt > 0 ? (totalPaid / originalDebt) * 100 : 0,
    };
  }

  // --- LOT PRODUCT MANAGEMENT ---

  /**
   * Add a product to a lot
   */
  static async addProductToLot(
    lotId: string,
    productData: CreateLotProductData
  ): Promise<any> {
    return prisma.lotProduct.create({
      data: {
        lotId,
        productName: productData.productName,
        sku: productData.sku,
        description: productData.description,
        estimatedQuantity: productData.estimatedQuantity || 1,
      },
    });
  }

  /**
   * Update a lot product
   */
  static async updateLotProduct(
    productId: string,
    data: Partial<CreateLotProductData>
  ): Promise<any> {
    return prisma.lotProduct.update({
      where: { id: productId },
      data,
    });
  }

  /**
   * Delete a lot product and all its variants
   */
  static async deleteLotProduct(productId: string): Promise<void> {
    await prisma.lotProduct.delete({
      where: { id: productId },
    });
  }

  /**
   * Convert a lot product to Shopify (create or update as needed)
   * - If already linked, update inventory
   * - If not, create new Shopify product and link
   * Returns the Shopify product ID and status
   */
  static async convertProductToShopify(
    lotProductId: string,
    admin: AdminApiContext,
    defaultPrice?: number,
  ): Promise<{ success: boolean; message: string; shopifyProductId?: string }> {
    // 1. Fetch the lot product and its variants
    const lotProduct = await prisma.lotProduct.findUnique({
      where: { id: lotProductId },
      include: { variants: true, lot: true },
    });
    if (!lotProduct) {
      return { success: false, message: 'Lot product not found' };
    }

    // 2. If already linked, update inventory in Shopify
    if (lotProduct.shopifyProductId) {
      // TODO: Update Inventory in Shopify, alongside the variants
      // this would mean just updating the quantity to be += the lotProduct.estimatedQuantity
      return { success: true, message: 'Product already linked to Shopify. Inventory update not yet implemented.', shopifyProductId: lotProduct.shopifyProductId };
    }

    // Helper: get primary location id (first location)
    const locationId: string | null = await getPrimaryLocationId(admin);

    // 3. If not linked, create new Shopify product
    // Build product input for Shopify (omit type/tags by default; set vendor to store name)
    const productInput: Record<string, any> = {
      title: lotProduct.productName,
      descriptionHtml: lotProduct.description || '',
      status: 'DRAFT',
      vendor: process.env.SHOPIFY_DEFAULT_VENDOR || 'ZardoCards',
    };

    console.log(`lotProduct.variants: ${JSON.stringify(lotProduct.variants)}`);
    console.log(`defaultPrice: ${defaultPrice}`);
    
    // Build variants input for Shopify
    const variantsInput = lotProduct.variants.length > 0
      ? lotProduct.variants.map(v => ({
          price: v.estimatedValue || defaultPrice || 0,
          inventoryPolicy: 'DENY',
          optionValues: [
            { optionName: 'Title', name: v.variantName },
            ...(v.condition ? [{ optionName: 'Condition', name: v.condition }] : []),
            ...(v.rarity ? [{ optionName: 'Rarity', name: v.rarity }] : []),
          ],
          inventoryQuantities: [
						{
							availableQuantity: v.quantity || 1,
							locationId,
						},
					],
          inventoryItem: {
            tracked: true,
            cost: v.estimatedValue || defaultPrice || 0,
            measurement: {
              weight: {
                unit: "POUNDS",
                value: 0.00, // Default To 0.0 to be manually updated or TODO: add weight to the lotPRoduct
              },
            },

          },
          ...(locationId ? { inventoryQuantities: [ { availableQuantity: v.quantity || 1, locationId } ] } : {}),
        }))
      : [{
          barcode: lotProduct.sku || undefined,
          sku: lotProduct.sku || undefined,
          price: Number.parseFloat(defaultPrice?.toString() || "0"),
          inventoryPolicy: 'DENY',
          optionValues: [
            { optionName: 'Title', name: 'Default Title' },
          ],
          inventoryQuantities: [
						{
							availableQuantity: lotProduct.estimatedQuantity || 1,
							locationId,
						},
					],
          inventoryItem: {
            tracked: true,
            cost: defaultPrice || 0,
            measurement: {
              weight: {
                unit: "POUNDS",
                value: 0.00, // Default To 0.0 to be manually updated or TODO: add weight to the lotPRoduct
              },
            },
          },
        }];

    // 4. Call Shopify API to create product and variants
    try {
      // Create product (no media for now)
      console.log(`Creating product with input: ${JSON.stringify(productInput)}`);
      const productRes = await createProductWMedia(admin, productInput as any, []);
      const shopifyProductId = productRes?.data?.productCreate?.product?.id;
      if (!shopifyProductId) {
        console.log(`Failed to create Shopify product`);
        return { success: false, message: 'Failed to create Shopify product' };
      }

      if (lotProduct.variants.length > 0) {
        // Create variants and remove the default standalone variant
        const variantsRes = await createBulkVariants(admin, shopifyProductId, variantsInput as any, 'REMOVE_STANDALONE_VARIANT');
        // After creation, explicitly set inventory quantities using adjustInventory, matching by variant title
        const created = variantsRes?.data?.productVariantsBulkCreate?.productVariants || [];
        for (const createdVariant of created) {
          const createdTitle: string | undefined = createdVariant?.title;
          const lotVariant = lotProduct.variants.find(v => v.variantName === createdTitle);
          if (!lotVariant) continue;
          const invItemId: string | undefined = createdVariant?.inventoryItem?.id;
          let locId: string | undefined = createdVariant?.inventoryItem?.inventoryLevels?.nodes?.[0]?.location?.id;
          if (!locId) {
            const resolved = await getPrimaryLocationId(admin);
            if (resolved) locId = resolved;
          }
          if (invItemId && locId) {
            // Set available quantity to the lot variant quantity
            await adjustInventory(admin, invItemId, locId, lotVariant.quantity || 1);
          }
        }
      } else {

        console.log(`No variants: ensure default variant tracks inventory and set available quantity if we can`);
        // No variants: ensure default variant tracks inventory and set available quantity if we can
        const exists = await getProductExists(admin, shopifyProductId);
        const node = exists?.data?.product?.variants?.nodes?.[0];
        const defaultVariantId: string | undefined = node?.id;
        if (defaultVariantId) {
          const variantUpdate: any = { id: defaultVariantId };

          // Testing if we need this 08/15/2025
          // if (typeof defaultPrice === 'number' && !Number.isNaN(defaultPrice)) {
          //   variantUpdate.price = defaultPrice;
          // }

          // await productVariantUpdatePrice(
          //   admin,
          //   [variantUpdate],
          //   shopifyProductId,
          //   true,
          // );
          // Explicitly set quantity using adjustInventory when possible
          const invItemId: string | undefined = node?.inventoryItem?.id;
          let locId: string | undefined = node?.inventoryItem?.inventoryLevels?.nodes?.[0]?.location?.id;
          if (!locId) {
            const resolved = await getPrimaryLocationId(admin);
            if (resolved) locId = resolved;
          }
          if (invItemId && locId) {
            console.log(`Adjusting inventory for default variant: ${invItemId} with location: ${locId} and quantity: ${lotProduct.estimatedQuantity || 1}`);
            const res = await adjustInventory(admin, invItemId, locId, lotProduct.estimatedQuantity || 1);
            console.log(`Adjusted inventory for default variant: ${JSON.stringify(res)}`);
          }
        }
      }

      // Update lot product with Shopify ID
      // TODO: Update Lot Variant as well to be converted if has one
      await prisma.lotProduct.update({
        where: { id: lotProductId },
        data: {
          isConverted: true,
          shopifyProductId,
          convertedAt: new Date(),
        },
      });

      console.log(`Product created and linked to Shopify: ${shopifyProductId}`);
      return { success: true, message: 'Product created and linked to Shopify', shopifyProductId };
    } catch (err) {
      return { success: false, message: 'Error creating Shopify product: ' + (err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err)) };
    }
  }

  // --- LOT PRODUCT VARIANT MANAGEMENT ---

  /**
   * Add a variant to a lot product
   */
  static async addVariantToProduct(
    lotProductId: string,
    variantData: CreateLotProductVariantData
  ): Promise<any> {
    return prisma.lotProductVariant.create({
      data: {
        lotProductId,
        variantName: variantData.variantName,
        condition: variantData.condition,
        rarity: variantData.rarity,
        quantity: variantData.quantity || 1,
        estimatedValue: variantData.estimatedValue,
      },
    });
  }

  /**
   * Update a lot product variant
   */
  static async updateLotProductVariant(
    variantId: string,
    data: Partial<CreateLotProductVariantData>
  ): Promise<any> {
    return prisma.lotProductVariant.update({
      where: { id: variantId },
      data,
    });
  }

  /**
   * Delete a lot product variant
   */
  static async deleteLotProductVariant(variantId: string): Promise<void> {
    await prisma.lotProductVariant.delete({
      where: { id: variantId },
    });
  }

  /**
   * Mark a lot product variant as converted to Shopify
   */
  static async convertLotProductVariant(
    variantId: string,
    shopifyVariantId: string
  ): Promise<any> {
    return prisma.lotProductVariant.update({
      where: { id: variantId },
      data: {
        isConverted: true,
        shopifyVariantId,
        convertedAt: new Date(),
      },
    });
  }

  // --- ANALYTICS AND REPORTING ---

  /**
   * Get lot statistics for dashboard
   */
  static async getLotStatistics() {
    const [
      totalLots,
      pendingLots,
      convertedLots,
      deliveredLots,
      totalCost,
      totalDebt,
    ] = await Promise.all([
      prisma.lot.count(),
      prisma.lot.count({ where: { isConverted: false } }),
      prisma.lot.count({ where: { isConverted: true } }),
      prisma.lot.count({ where: { trackingStatus: 'delivered' } }),
      prisma.lot.aggregate({
        _sum: { totalCost: true },
      }),
      prisma.lot.aggregate({
        _sum: { initialDebt: true },
      }),
    ]);

    return {
      totalLots,
      pendingLots,
      convertedLots,
      deliveredLots,
      conversionRate: totalLots > 0 ? (convertedLots / totalLots) * 100 : 0,
      deliveryRate: totalLots > 0 ? (deliveredLots / totalLots) * 100 : 0,
      totalCost: totalCost._sum.totalCost || 0,
      totalDebt: totalDebt._sum.initialDebt || 0,
    };
  }

  /**
   * Get recent lot activity
   */
  static async getRecentActivity(limit: number = 10) {
    return prisma.lot.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        trackingEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  /**
   * Get monthly lot analytics for a specific year
   */
  static async getMonthlyAnalytics(year: number = new Date().getFullYear()) {
    // Use Prisma's built-in date filtering instead of raw SQL
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    console.log(`Fetching analytics for year ${year}, from ${startOfYear.toISOString()} to ${endOfYear.toISOString()}`);

    // Get all lots for the year first to debug
    const allLotsForYear = await prisma.lot.findMany({
      where: {
        purchaseDate: {
          gte: startOfYear,
          lt: endOfYear,
        },
      },
      select: {
        id: true,
        purchaseDate: true,
        totalCost: true,
        lotValue: true,
        initialDebt: true,
      },
    });

    console.log(`Found ${allLotsForYear.length} lots for year ${year}:`, allLotsForYear);

    // Group by month manually
    const monthlyData = allLotsForYear.reduce((acc: any, lot) => {
      const month = lot.purchaseDate.getMonth() + 1; // getMonth() returns 0-11
      
      if (!acc[month]) {
        acc[month] = {
          month,
          lotCount: 0,
          totalValue: 0,
          totalEstimatedValue: 0,
          totalDebt: 0,
          totalCost: 0,
        };
      }
      
      acc[month].lotCount += 1;
      acc[month].totalValue += lot.totalCost;
      acc[month].totalEstimatedValue += lot.lotValue || 0;
      acc[month].totalDebt += lot.initialDebt;
      acc[month].totalCost += lot.totalCost;
      
      return acc;
    }, {});

    // Create array for all 12 months with default values
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const analytics = months.map((monthName, index) => {
      const monthNum = index + 1;
      const data = monthlyData[monthNum];
      
      return {
        month: monthName,
        monthNumber: monthNum,
        lotCount: data?.lotCount || 0,
        totalValue: data?.totalValue || 0,
        totalEstimatedValue: data?.totalEstimatedValue || 0,
        totalDebt: data?.totalDebt || 0,
        averageLotPrice: data?.lotCount > 0 ? data.totalCost / data.lotCount : 0,
        averagePaidPercentage: (data?.totalEstimatedValue || 0) > 0 ? ((data?.totalValue || 0) / data.totalEstimatedValue) * 100 : 0,
      };
    });

    console.log('Analytics result:', analytics);
    return analytics;
  }

  /**
   * Get yearly analytics summary
   */
  static async getYearlyAnalyticsSummary(year: number = new Date().getFullYear()) {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year + 1, 0, 1);

    const yearData = await prisma.lot.aggregate({
      where: {
        purchaseDate: {
          gte: startOfYear,
          lt: endOfYear,
        },
      },
      _count: { id: true },
      _sum: {
        totalCost: true,
        lotValue: true,
        initialDebt: true,
      },
      _avg: {
        totalCost: true,
        lotValue: true,
      },
    });

    const deliveredCount = await prisma.lot.count({
      where: {
        purchaseDate: {
          gte: startOfYear,
          lt: endOfYear,
        },
        trackingStatus: 'delivered',
      },
    });

    const convertedCount = await prisma.lot.count({
      where: {
        purchaseDate: {
          gte: startOfYear,
          lt: endOfYear,
        },
        isConverted: true,
      },
    });

    return {
      year,
      totalLots: yearData._count.id,
      totalInvestment: yearData._sum.totalCost || 0,
      totalEstimatedValue: yearData._sum.lotValue || 0,
      totalDebt: yearData._sum.initialDebt || 0,
      averageLotPrice: yearData._avg.totalCost || 0,
      averageEstimatedValue: yearData._avg.lotValue || 0,
      deliveredLots: deliveredCount,
      convertedLots: convertedCount,
      deliveryRate: yearData._count.id > 0 ? (deliveredCount / yearData._count.id) * 100 : 0,
      conversionRate: yearData._count.id > 0 ? (convertedCount / yearData._count.id) * 100 : 0,
      profitPotential: (yearData._sum.lotValue || 0) - (yearData._sum.totalCost || 0),
    };
  }

  /**
   * Get all debt payments across all lots for dashboard overview
   */
  static async getAllDebtPayments(): Promise<any[]> {
    return prisma.debtPayment.findMany({
      include: {
        lot: {
          select: {
            id: true,
            vendor: true, // Seller Name
            totalCost: true, // Lot Price
            purchaseDate: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  /**
   * Get debt payment summary statistics for dashboard
   */
  static async getDebtPaymentSummary() {
    const [totalPayments, paymentStats] = await Promise.all([
      prisma.debtPayment.count(),
      prisma.debtPayment.aggregate({
        _sum: { paymentAmount: true },
        _avg: { paymentAmount: true },
      }),
    ]);

    return {
      totalPayments,
      totalAmountPaid: paymentStats._sum.paymentAmount || 0,
      averagePayment: paymentStats._avg.paymentAmount || 0,
    };
  }

  /**
   * Search existing Shopify products for potential matches when adding lot products
   */
  static async searchExistingProducts(searchTerm?: string): Promise<any[]> {
    if (!searchTerm || searchTerm.trim().length < 2) {
      // Return recent products if no search term
      return prisma.product.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          totalInventory: true,
          variants: {
            select: {
              id: true,
              title: true,
              price: true,
              sku: true,
              inventoryQuantity: true,
            },
            take: 3, // Show first few variants
          },
        },
        where: {
          status: {
            in: ["ACTIVE", "DRAFT"], // Only show active or draft products
          },
        },
        orderBy: {
          title: 'asc',
        },
        take: 20,
      });
    }

    // Search products by title (case-insensitive partial match)
    return prisma.product.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        totalInventory: true,
        variants: {
          select: {
            id: true,
            title: true,
            price: true,
            sku: true,
            inventoryQuantity: true,
          },
          take: 3, // Show first few variants
        },
      },
      where: {
        AND: [
          {
            status: {
              in: ["ACTIVE", "DRAFT"],
            },
          },
          {
            title: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        title: 'asc',
      },
      take: 20,
    });
  }

  /**
   * Add a product to a lot with optional Shopify product linking
   */
  static async addProductToLotWithShopifyLink(
    lotId: string,
    productData: CreateLotProductData & { shopifyProductId?: string; shopifyVariantId?: string }
  ): Promise<any> {
    // Create the lot product first
    const created = await prisma.lotProduct.create({
      data: {
        lotId,
        productName: productData.productName,
        sku: productData.sku,
        description: productData.description,
        estimatedQuantity: productData.estimatedQuantity || 1,
        shopifyProductId: productData.shopifyProductId || null,
        // If linking to existing Shopify product, mark as converted
        isConverted: !!productData.shopifyProductId,
        convertedAt: productData.shopifyProductId ? new Date() : null,
      },
    });

    // If a specific Shopify variant was selected, create a corresponding lot product variant
    if (productData.shopifyVariantId) {
      // Lookup the Shopify variant in local DB to get its title/price/sku
      const shopifyVariant = await prisma.productVariant.findUnique({
        where: { id: productData.shopifyVariantId },
        select: { id: true, title: true, price: true, sku: true, inventoryQuantity: true },
      });

      // Variant Creation, with Not Converted, as converted means the quantity was updated in Shopify
      await prisma.lotProductVariant.create({
        data: {
          lotProductId: created.id,
          variantName: shopifyVariant?.title || "Linked Variant",
          quantity: 1,
          estimatedValue: shopifyVariant?.price ?? undefined,
          isConverted: false,
          shopifyVariantId: productData.shopifyVariantId,
          convertedAt: new Date(),
        },
      });
    }

    return created;
  }
} 
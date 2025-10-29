import type { Prisma } from "@prisma/client";
import prisma from "../db.server";

export type ActiveJob = {
	importIdentifier: string;
};

export type PSAStatus =
	| "In Queue"
	| "Retrying"
	| "Done"
	| "Failed"
	| "Error"
	| "Stalled";

export type InsertPSAResult = {
	status: PSAStatus;
	message: string;
};

export async function addActiveJob({ importIdentifier }: ActiveJob) {
	const result = await prisma.activeQueue.create({
		data: {
			importIdentifier,
		},
	});
	return result;
}

export async function deleteActiveJob({ id }: { id: number }) {
	return await prisma.activeQueue.delete({
		where: {
			id,
		},
	});
}

export async function selectActiveJob({ importIdentifier }: ActiveJob) {
	return await prisma.activeQueue.findUnique({
		where: {
			importIdentifier,
		},
	});
}

export async function createPSAResult({
	data,
	select,
}: Prisma.PSAResultCreateArgs) {
	return await prisma.pSAResult.create({
		data,
		select,
	});
}

export async function updatePSAResult({
	data,
	where,
	select,
}: Prisma.PSAResultUpdateArgs) {
	return await prisma.pSAResult.update({ data, where, select });
}

export async function deletePSAResult({ where }: Prisma.PSAResultDeleteArgs) {
	return await prisma.pSAResult.delete({ where });
}

export async function deletePSAResults({
	where,
}: Prisma.PSAResultDeleteManyArgs) {
	return await prisma.pSAResult.deleteMany({ where });
}

export async function findPSAResult({
	where,
	select,
	orderBy,
}: Prisma.PSAResultFindManyArgs) {
	return await prisma.pSAResult.findMany({ where, select, orderBy });
}

export async function findPSAResultById({
	where: { id },
	select,
}: Prisma.PSAResultFindUniqueArgs) {
	return await prisma.pSAResult.findUnique({ where: { id }, select });
}

export async function createProductVariant({
	data,
}: Prisma.ProductVariantCreateArgs) {
	return await prisma.productVariant.create({ data });
}

export async function createProductVariants({
	data,
}: Prisma.ProductVariantCreateManyArgs) {
	return await prisma.productVariant.createMany({ data });
}

export async function deleteProduct({ where }: Prisma.ProductDeleteArgs) {
	return await prisma.product.delete({ where });
}
export async function deleteProducts(variables: Prisma.ProductDeleteManyArgs) {
	return await prisma.product.deleteMany(variables);
}
export async function countProducts(variables: Prisma.ProductCountArgs) {
	return await prisma.product.count(variables);
}

export async function deleteProductVariants({
	where,
}: Prisma.ProductVariantDeleteManyArgs) {
	return await prisma.productVariant.deleteMany({ where });
}

export async function createProduct({ data }: Prisma.ProductCreateArgs) {
	return await prisma.product.create({ data });
}

export async function createProducts({ data }: Prisma.ProductCreateManyArgs) {
	return await prisma.product.createMany({ data });
}

export async function updateProduct({ data, where }: Prisma.ProductUpdateArgs) {
	return await prisma.product.update({ data, where });
}

export async function updateProducts({
	data,
	where,
}: Prisma.ProductUpdateManyArgs) {
	return await prisma.product.updateMany({ data, where });
}

export async function upsertProduct({
	where,
	update,
	create,
}: Prisma.ProductUpsertArgs) {
	return await prisma.product.upsert({ where, update, create });
}

export async function findProducts({
	where,
	select,
}: Prisma.ProductFindManyArgs) {
	return await prisma.product.findMany({
		where,
		select,
	});
}

export async function findProduct({
	where,
	select,
}: Prisma.ProductFindUniqueArgs) {
	return await prisma.product.findUnique({ where, select });
}

export async function upsertProductVariant({
	where,
	update,
	create,
}: Prisma.ProductVariantUpsertArgs) {
	return await prisma.productVariant.upsert({ where, update, create });
}

export async function findManyKeywordsWithEmail({ where, }: Prisma.KeywordFindManyArgs) {
	return await prisma.keyword.findMany({
		where,
		include: {
			Wishlists: {
				select: {
					email: true
				}
			}
		}
	})
}

export async function findEmailSent({ where }: Prisma.EmailSentFindUniqueArgs) {
	return await prisma.emailSent.findUnique({
		where
	})
}

export async function upsertEmailSent({ create, update, where }: Prisma.EmailSentUpsertArgs) {
	return await prisma.emailSent.upsert({
		where,
		create,
		update
	})
}

// --- LOT TRACKING QUERIES ---

/**
 * Get monthly metrics for lot purchases and costs
 */
export async function getMonthlyLotMetrics(year: number, month: number) {
	const startDate = new Date(year, month - 1, 1);
	const endDate = new Date(year, month, 0);

	return (prisma as any).lot.aggregate({
		where: {
			purchaseDate: {
				gte: startDate,
				lte: endDate,
			},
		},
		_sum: {
			totalCost: true,
			initialDebt: true,
		},
		_count: {
			id: true,
		},
		_avg: {
			totalCost: true,
		},
	});
}

/**
 * Get performance metrics for lot tracking dashboard
 */
export async function getLotPerformanceMetrics() {
	const totalLots = await (prisma as any).lot.count();
	const convertedLots = await (prisma as any).lot.count({
		where: { isConverted: true },
	});
	const deliveredLots = await (prisma as any).lot.count({
		where: { trackingStatus: 'delivered' },
	});
	const pendingLots = await (prisma as any).lot.count({
		where: { 
			trackingStatus: { notIn: ['delivered', 'exception'] },
			isConverted: false,
		},
	});

	// Get cost totals
	const costAggregation = await (prisma as any).lot.aggregate({
		_sum: {
			totalCost: true,
			initialDebt: true,
		},
	});

	return {
		totalLots,
		convertedLots,
		deliveredLots,
		pendingLots,
		conversionRate: totalLots > 0 ? (convertedLots / totalLots) * 100 : 0,
		deliveryRate: totalLots > 0 ? (deliveredLots / totalLots) * 100 : 0,
		totalInvestment: costAggregation._sum.totalCost || 0,
		totalDebt: costAggregation._sum.initialDebt || 0,
	};
}

/**
 * Get lots by vendor with aggregated statistics
 */
export async function getLotsByVendor() {
	return (prisma as any).lot.groupBy({
		by: ['vendor'],
		_count: {
			id: true,
		},
		_sum: {
			totalCost: true,
			initialDebt: true,
		},
		_avg: {
			totalCost: true,
		},
		where: {
			vendor: { not: null },
		},
		orderBy: {
			_sum: {
				totalCost: 'desc',
			},
		},
	});
}

/**
 * Get lots by type with aggregated statistics
 */
export async function getLotsByType() {
	return (prisma as any).lot.groupBy({
		by: ['lotType'],
		_count: {
			id: true,
		},
		_sum: {
			totalCost: true,
		},
		_avg: {
			totalCost: true,
		},
		where: {
			lotType: { not: null },
		},
		orderBy: {
			_count: {
				id: 'desc',
			},
		},
	});
}

/**
 * Get tracking status distribution
 */
export async function getTrackingStatusDistribution() {
	return (prisma as any).lot.groupBy({
		by: ['trackingStatus'],
		_count: {
			id: true,
		},
		where: {
			upsTrackingNumber: { not: null },
		},
		orderBy: {
			_count: {
				id: 'desc',
			},
		},
	});
}

/**
 * Get lots with recent tracking activity
 */
export async function getLotsWithRecentActivity(days: number = 7) {
	const sinceDate = new Date();
	sinceDate.setDate(sinceDate.getDate() - days);

	return (prisma as any).lot.findMany({
		where: {
			trackingEvents: {
				some: {
					createdAt: {
						gte: sinceDate,
					},
				},
			},
		},
		include: {
			trackingEvents: {
				where: {
					createdAt: {
						gte: sinceDate,
					},
				},
				orderBy: {
					createdAt: 'desc',
				},
				take: 1,
			},
		},
		orderBy: {
			updatedAt: 'desc',
		},
	});
}

/**
 * Get lots requiring attention (not delivered after X days)
 */
export async function getLotsRequiringAttention(daysOld: number = 14) {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - daysOld);

	return (prisma as any).lot.findMany({
		where: {
			purchaseDate: {
				lt: cutoffDate,
			},
			trackingStatus: {
				notIn: ['delivered', 'exception'],
			},
		},
		include: {
			trackingEvents: {
				orderBy: {
					createdAt: 'desc',
				},
				take: 1,
			},
		},
		orderBy: {
			purchaseDate: 'asc',
		},
	});
}

/**
 * Get conversion readiness metrics
 */
export async function getConversionReadinessMetrics() {
	const deliveredNotConverted = await (prisma as any).lot.count({
		where: {
			trackingStatus: 'delivered',
			isConverted: false,
		},
	});

	const hasProductsNotConverted = await (prisma as any).lot.count({
		where: {
			isConverted: false,
			lotProducts: {
				some: {},
			},
		},
	});

	const readyForConversion = await (prisma as any).lot.findMany({
		where: {
			trackingStatus: 'delivered',
			isConverted: false,
			lotProducts: {
				some: {},
			},
		},
		include: {
			lotProducts: {
				include: {
					variants: true,
				},
			},
		},
		orderBy: {
			purchaseDate: 'asc',
		},
	});

	return {
		deliveredNotConverted,
		hasProductsNotConverted,
		readyForConversion,
		readyCount: readyForConversion.length,
	};
}

/**
 * Get monthly trend data for charts
 */
export async function getMonthlyTrendData(months: number = 12) {
	const trends = [];
	const currentDate = new Date();

	for (let i = months - 1; i >= 0; i--) {
		const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
		const year = date.getFullYear();
		const month = date.getMonth() + 1;

		const metrics = await getMonthlyLotMetrics(year, month);
		
		trends.push({
			year,
			month,
			monthName: date.toLocaleString('default', { month: 'long' }),
			lotCount: metrics._count.id,
			totalCost: metrics._sum.totalCost || 0,
			totalDebt: metrics._sum.initialDebt || 0,
			averageCost: metrics._avg.totalCost || 0,
		});
	}

	return trends;
}
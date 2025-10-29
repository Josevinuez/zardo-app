import prisma from "../db.js";
/**
 * UPS Service for tracking packages using polling approach
 * Rate limiting: 1 request per second, 1000 requests per day
 */
export class UPSService {
    static API_BASE = process.env.UPS_API_BASE || 'https://onlinetools.ups.com/api';
    static CLIENT_ID = process.env.UPS_CLIENT_ID;
    static CLIENT_SECRET = process.env.UPS_CLIENT_SECRET;
    static RATE_LIMIT_DELAY = 2000; // 2 seconds between requests
    // Cache access tokens for 55 minutes (UPS tokens last 1 hour)
    static accessTokenCache = null;
    /**
     * Get or refresh UPS access token
     */
    static async getAccessToken() {
        // Check if we have a valid cached token
        if (this.accessTokenCache && this.accessTokenCache.expires > new Date()) {
            console.log('Using cached UPS access token');
            return this.accessTokenCache.token;
        }
        console.log('Fetching new UPS access token');
        if (!this.CLIENT_ID || !this.CLIENT_SECRET) {
            throw new Error('UPS API credentials not configured');
        }
        const response = await fetch(`${this.API_BASE}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${this.CLIENT_ID}:${this.CLIENT_SECRET}`).toString('base64')}`,
            },
            body: 'grant_type=client_credentials',
        });
        if (!response.ok) {
            throw new Error(`Failed to get UPS access token: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        // Cache the token for 55 minutes
        this.accessTokenCache = {
            token: data.access_token,
            expires: new Date(Date.now() + 55 * 60 * 1000), // 55 minutes
        };
        return data.access_token;
    }
    /**
     * Get tracking information for a single tracking number
     */
    static async getTrackingInfo(trackingNumber) {
        try {
            console.log(`Fetching UPS tracking info for: ${trackingNumber}`);
            const accessToken = await this.getAccessToken();
            const response = await fetch(`${this.API_BASE}/track/v1/details/${trackingNumber}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                // Handle rate limiting
                if (response.status === 429) {
                    console.warn(`Rate limited for tracking number: ${trackingNumber}`);
                    return {
                        success: false,
                        trackingNumber,
                        error: 'Rate limited - will retry later',
                    };
                }
                const errorText = await response.text();
                console.error(`UPS API error for ${trackingNumber}:`, response.status, errorText);
                return {
                    success: false,
                    trackingNumber,
                    error: `HTTP ${response.status}: ${errorText}`,
                };
            }
            const data = await response.json();
            // Parse UPS response format
            const shipment = data.trackResponse?.shipment?.[0];
            if (!shipment) {
                console.warn(`No shipment data found for tracking number: ${trackingNumber}`);
                return {
                    success: false,
                    trackingNumber,
                    error: 'No shipment data found',
                };
            }
            const trackingData = {
                trackingNumber,
                trackingStatus: this.mapUPSStatus(shipment.deliveryInformation?.location?.statusType?.code),
                statusDescription: shipment.deliveryInformation?.location?.statusType?.description || 'Unknown',
                estimatedDeliveryDate: shipment.deliveryInformation?.scheduledDeliveryDate,
                lastKnownLocation: shipment.deliveryInformation?.location?.address?.city,
                events: shipment.package?.[0]?.activity?.map((activity) => ({
                    eventType: activity.status?.type || 'Unknown',
                    eventDescription: activity.status?.description || 'No description',
                    eventDate: activity.date,
                    eventTime: activity.time,
                    location: activity.location?.address ?
                        `${activity.location.address.city}, ${activity.location.address.stateProvinceCode}` :
                        undefined,
                })) || [],
            };
            console.log(`Successfully fetched tracking data for ${trackingNumber}:`, trackingData.trackingStatus);
            return {
                success: true,
                trackingNumber,
                data: trackingData,
            };
        }
        catch (error) {
            console.error(`Error fetching tracking info for ${trackingNumber}:`, error);
            return {
                success: false,
                trackingNumber,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Process multiple tracking numbers in batches with rate limiting
     */
    static async processBatchTracking(trackingNumbers) {
        const results = [];
        console.log(`Processing ${trackingNumbers.length} tracking numbers in batches`);
        // Process in batches of 10 with delays
        for (let i = 0; i < trackingNumbers.length; i += 10) {
            const batch = trackingNumbers.slice(i, i + 10);
            console.log(`Processing batch ${Math.floor(i / 10) + 1}/${Math.ceil(trackingNumbers.length / 10)}`);
            // Process each tracking number in the batch
            for (const trackingNumber of batch) {
                const result = await this.getTrackingInfo(trackingNumber);
                results.push(result);
                // Add delay between individual requests
                if (batch.indexOf(trackingNumber) < batch.length - 1) {
                    await this.delay(this.RATE_LIMIT_DELAY);
                }
            }
            // Add longer delay between batches
            if (i + 10 < trackingNumbers.length) {
                console.log(`Waiting ${this.RATE_LIMIT_DELAY * 2}ms before next batch...`);
                await this.delay(this.RATE_LIMIT_DELAY * 2);
            }
        }
        return results;
    }
    /**
     * Daily tracking update for all pending lots
     */
    static async updateLotTracking() {
        console.log('Starting daily UPS tracking update...');
        try {
            // Get all lots that aren't delivered yet and have tracking numbers
            const pendingLots = await prisma.lot.findMany({
                where: {
                    upsTrackingNumber: { not: null },
                    trackingStatus: { notIn: ['delivered', 'exception'] },
                },
                select: {
                    id: true,
                    upsTrackingNumber: true,
                    trackingStatus: true,
                },
            });
            if (pendingLots.length === 0) {
                console.log('No pending lots to update');
                return;
            }
            const trackingNumbers = pendingLots
                .map((lot) => lot.upsTrackingNumber)
                .filter(Boolean);
            console.log(`Processing ${trackingNumbers.length} tracking numbers`);
            const results = await this.processBatchTracking(trackingNumbers);
            // Update database with results
            let successCount = 0;
            let errorCount = 0;
            for (const result of results) {
                if (result.success && result.data) {
                    const lot = pendingLots.find((l) => l.upsTrackingNumber === result.trackingNumber);
                    if (lot) {
                        try {
                            // Update lot status
                            await prisma.lot.update({
                                where: { id: lot.id },
                                data: { trackingStatus: result.data.trackingStatus },
                            });
                            // Create tracking events for new events
                            for (const event of result.data.events) {
                                // Check if event already exists to avoid duplicates
                                const existingEvent = await prisma.trackingEvent.findFirst({
                                    where: {
                                        lotId: lot.id,
                                        eventType: event.eventType,
                                        eventDate: new Date(event.eventDate),
                                    },
                                });
                                if (!existingEvent) {
                                    await prisma.trackingEvent.create({
                                        data: {
                                            lotId: lot.id,
                                            eventType: event.eventType,
                                            eventDescription: event.eventDescription,
                                            eventDate: new Date(event.eventDate),
                                            location: event.location,
                                        },
                                    });
                                }
                            }
                            successCount++;
                        }
                        catch (dbError) {
                            console.error(`Database error updating lot ${lot.id}:`, dbError);
                            errorCount++;
                        }
                    }
                }
                else {
                    console.warn(`Failed to update tracking for ${result.trackingNumber}: ${result.error}`);
                    errorCount++;
                }
            }
            console.log(`Daily tracking update completed: ${successCount} successful, ${errorCount} errors`);
        }
        catch (error) {
            console.error('Error in daily tracking update:', error);
            throw error;
        }
    }
    /**
     * Manual tracking refresh for a single lot
     */
    static async refreshLotTracking(lotId) {
        try {
            const lot = await prisma.lot.findUnique({
                where: { id: lotId },
                select: {
                    id: true,
                    upsTrackingNumber: true,
                },
            });
            if (!lot || !lot.upsTrackingNumber) {
                return {
                    success: false,
                    message: 'Lot not found or no tracking number',
                };
            }
            const result = await this.getTrackingInfo(lot.upsTrackingNumber);
            if (result.success && result.data) {
                // Update lot status
                await prisma.lot.update({
                    where: { id: lotId },
                    data: { trackingStatus: result.data.trackingStatus },
                });
                // Create tracking events
                for (const event of result.data.events) {
                    // Check if event already exists to avoid duplicates
                    const existingEvent = await prisma.trackingEvent.findFirst({
                        where: {
                            lotId: lotId,
                            eventType: event.eventType,
                            eventDate: new Date(event.eventDate),
                        },
                    });
                    if (!existingEvent) {
                        await prisma.trackingEvent.create({
                            data: {
                                lotId: lotId,
                                eventType: event.eventType,
                                eventDescription: event.eventDescription,
                                eventDate: new Date(event.eventDate),
                                location: event.location,
                            },
                        });
                    }
                }
                return {
                    success: true,
                    message: `Tracking updated: ${result.data.statusDescription}`,
                };
            }
            else {
                return {
                    success: false,
                    message: result.error || 'Failed to fetch tracking information',
                };
            }
        }
        catch (error) {
            console.error('Error refreshing lot tracking:', error);
            return {
                success: false,
                message: 'Error refreshing tracking information',
            };
        }
    }
    /**
     * Map UPS status codes to our internal status system
     */
    static mapUPSStatus(statusCode) {
        const statusMap = {
            'I': 'in_transit',
            'D': 'delivered',
            'X': 'exception',
            'P': 'pickup',
            'M': 'manifested',
            'OR': 'origin_scan',
            'AD': 'arrived_destination',
            'OD': 'out_for_delivery',
            'DP': 'departed_facility',
            'AR': 'arrived_facility',
        };
        return statusMap[statusCode] || 'unknown';
    }
    /**
     * Utility function to add delays between requests
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get tracking statistics for monitoring
     */
    static async getTrackingStatistics() {
        try {
            const stats = await prisma.lot.groupBy({
                by: ['trackingStatus'],
                _count: true,
                where: {
                    upsTrackingNumber: { not: null },
                },
            });
            return stats.reduce((acc, stat) => {
                acc[stat.trackingStatus] = stat._count;
                return acc;
            }, {});
        }
        catch (error) {
            console.error('Error getting tracking statistics:', error);
            return {};
        }
    }
}

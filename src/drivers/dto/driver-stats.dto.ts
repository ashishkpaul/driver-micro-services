export class DriverStatsDto {
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  averageRating: number;
  totalEarnings: number;
  lastActiveAt: Date | null;
}
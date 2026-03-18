import { Injectable } from "@nestjs/common";
import { DeliveriesService } from "../deliveries/deliveries.service";
import { OffersService } from "../offers/offers.service";

@Injectable()
export class DriverStateService {
  async getState(
    driverId: string,
    deliveriesService: DeliveriesService,
    offersService: OffersService,
  ) {
    // Fetch both simultaneously for speed
    const [delivery, allOffers] = await Promise.all([
      deliveriesService.findActiveForDriver(driverId),
      offersService.getDriverOffers(driverId), // or getPendingOffers if implemented
    ]);

    const pendingOffers = allOffers.filter((o) => o.status === "PENDING");

    return {
      delivery,
      offers: pendingOffers,
      hasActiveDelivery: !!delivery,
      hasOffers: pendingOffers.length > 0,
    };
  }
}

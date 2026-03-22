export class DriverLocationUpdatedEvent {
  constructor(
    public readonly driverId: string,
    public readonly lat: number,
    public readonly lon: number,
    public readonly status: string,
  ) {}
}

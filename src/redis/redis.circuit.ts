import CircuitBreaker from "opossum";

export function createBreaker() {
  return new CircuitBreaker(
    async (operation: () => Promise<any>) => operation(),
    {
      timeout: 3000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    },
  );
}

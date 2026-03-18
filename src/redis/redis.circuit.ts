const CircuitBreaker = require("opossum");

export function createBreaker() {
  return new CircuitBreaker((operation: () => Promise<any>) => operation(), {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  });
}

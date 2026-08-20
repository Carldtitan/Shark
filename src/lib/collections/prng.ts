export interface SeededRandom {
  next(): number;
  bool(probability: number): boolean;
  int(min: number, max: number): number;
  normal(mean?: number, standardDeviation?: number): number;
  logNormal(logMedian: number, sigma: number): number;
  poisson(lambda: number): number;
  weighted<T>(choices: ReadonlyArray<readonly [T, number]>): T;
}

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    return seed >>> 0;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32 with convenience distributions. It is deterministic, not secure. */
export function createSeededRandom(seed: number | string): SeededRandom {
  let state = hashSeed(seed);
  let spareNormal: number | undefined;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    bool(probability) {
      return next() < Math.max(0, Math.min(1, probability));
    },
    int(min, max) {
      if (max < min) {
        throw new RangeError("max must be greater than or equal to min");
      }
      return Math.floor(next() * (max - min + 1)) + min;
    },
    normal(mean = 0, standardDeviation = 1) {
      if (spareNormal !== undefined) {
        const value = spareNormal;
        spareNormal = undefined;
        return mean + value * standardDeviation;
      }

      const first = Math.max(next(), Number.EPSILON);
      const second = next();
      const magnitude = Math.sqrt(-2 * Math.log(first));
      spareNormal = magnitude * Math.sin(2 * Math.PI * second);
      return mean + magnitude * Math.cos(2 * Math.PI * second) * standardDeviation;
    },
    logNormal(logMedian, sigma) {
      return Math.exp(this.normal(logMedian, sigma));
    },
    poisson(lambda) {
      if (lambda <= 0) return 0;
      const limit = Math.exp(-lambda);
      let product = 1;
      let count = 0;
      do {
        count += 1;
        product *= next();
      } while (product > limit);
      return count - 1;
    },
    weighted<T>(choices: ReadonlyArray<readonly [T, number]>) {
      const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
      if (total <= 0) {
        throw new RangeError("weighted choices must contain positive weight");
      }
      let remaining = next() * total;
      for (const [choice, weight] of choices) {
        remaining -= weight;
        if (remaining <= 0) return choice;
      }
      return choices[choices.length - 1][0];
    },
  };
}

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    // warm up to decorrelate seeds that differ by small amounts
    this.next(); this.next(); this.next();
  }

  next(): number {
    this.state ^= this.state << 13;
    this.state ^= this.state >> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 0xffffffff;
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

export function makeRng(seed?: number): SeededRng {
  return new SeededRng(seed ?? Date.now());
}

export function applySpread(price: number) {
  const spread = 0.0005; // 0.05%
  
  return {
    bid: price * (1 - spread),
    ask: price * (1 + spread),
  };
}
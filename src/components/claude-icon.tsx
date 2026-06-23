// Claude starburst — 12 rays in the brand coral (--claude). Inline SVG, no asset.
export function ClaudeIcon({ size = 15, className = '' }: { size?: number; className?: string }) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180;
    const inner = 2.6;
    const outer = i % 3 === 0 ? 10 : i % 3 === 1 ? 7.5 : 8.8;
    return {
      x1: 12 + inner * Math.cos(angle),
      y1: 12 + inner * Math.sin(angle),
      x2: 12 + outer * Math.cos(angle),
      y2: 12 + outer * Math.sin(angle),
    };
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {rays.map((r, i) => (
        <line
          key={i}
          x1={r.x1.toFixed(2)}
          y1={r.y1.toFixed(2)}
          x2={r.x2.toFixed(2)}
          y2={r.y2.toFixed(2)}
          stroke="hsl(var(--claude))"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

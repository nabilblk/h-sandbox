const brandAssets = {
  markCrimson: "/brand/mark-crimson.svg",
  markWhite: "/brand/mark-white.svg",
  lockupCrimsonInk: "/brand/lockup-crimson-ink.svg"
};

export const BrandMark = ({ size = 16, variant = "crimson", className = "" }: { size?: number; variant?: "crimson" | "white"; className?: string }) => (
  <img
    className={`brand-mark ${className}`.trim()}
    src={variant === "white" ? brandAssets.markWhite : brandAssets.markCrimson}
    alt=""
    width={size}
    height={size}
    aria-hidden="true"
    style={{ width: size, height: size }}
  />
);

export const Brand = ({ size = 16 }) => (
  <span className="brand" style={{ fontSize: size }}>
    <BrandMark size={Math.max(22, Math.round(size * 1.45))} />
    <span className="brand-name">
      <b>harakiri</b>
    </span>
  </span>
);

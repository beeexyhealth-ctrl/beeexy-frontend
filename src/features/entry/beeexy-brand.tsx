import Image from "next/image";

export function BeeexyBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`entry-brand${compact ? " compact" : ""}`}>
      <Image
        className="entry-brand-image"
        src="/brand/beeexy-logo.png"
        alt="Beeexy"
        width={1534}
        height={491}
        sizes={compact ? "132px" : "180px"}
        loading="eager"
      />
    </span>
  );
}

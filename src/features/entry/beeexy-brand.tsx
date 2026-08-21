export function BeeexyBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`entry-brand${compact ? " compact" : ""}`} aria-label="Beeexy">
      <span className="entry-brand-mark" aria-hidden="true">B<i /></span>
      <span className="entry-brand-word">Beeexy<span>.</span></span>
    </span>
  );
}

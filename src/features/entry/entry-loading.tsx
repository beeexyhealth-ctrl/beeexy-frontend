import { BeeexyBrand } from "./beeexy-brand";

export function EntryLoading() {
  return (
    <main className="entry-shell entry-loading" aria-live="polite" aria-busy="true">
      <BeeexyBrand />
      <span className="entry-loading-line" aria-hidden="true" />
      <span className="sr-only">Loading Beeexy</span>
    </main>
  );
}

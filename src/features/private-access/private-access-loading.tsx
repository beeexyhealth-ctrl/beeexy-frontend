import { BeeexyBrand } from "@/features/entry/beeexy-brand";

export function PrivateAccessLoading() {
  return (
    <main className="entry-shell entry-loading private-access-loading" aria-live="polite" aria-busy="true">
      <BeeexyBrand />
      <span className="entry-loading-line" aria-hidden="true" />
      <p>Checking private access</p>
    </main>
  );
}

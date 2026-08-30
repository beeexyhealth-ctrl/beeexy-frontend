# Codex Prompt — Update Beeexy PWA Branding

Update the Beeexy frontend/PWA branding using exclusively the official brand assets that are already available inside the repository.

## Official asset locations

### PWA / App Icons

First inspect the complete contents of:

`D:\Repositorios Github\Beexy-Francisco\Frontend\beeexy_images\beeexy-pwa-icons`

This directory contains the prepared official assets for:

- favicon
- PWA icons
- 192x192 and 512x512 icons
- maskable icon
- Apple Touch Icon
- master icon asset
- README/reference instructions

### Beeexy Logo

First inspect the complete contents of:

`D:\Repositorios Github\Beexy-Francisco\Frontend\beeexy_images\beeexy-logo-web-package`

This directory contains:

- the primary Beeexy logo with transparency
- optimized PNG/WebP versions
- white logo variant for dark backgrounds
- README with usage recommendations
- original source asset for reference

## Objective

Update the frontend so that all visible PWA branding correctly uses the official Beeexy identity.

The implementation must cover both:

1. **The complete Beeexy logo/wordmark**
2. **The Beeexy isotipo/app icon for PWA, favicon, and small surfaces**

## Before modifying code

1. Inspect the current project structure.
2. Locate:
   - Next.js metadata configuration
   - current PWA manifest
   - current favicons
   - current app/PWA icons
   - Apple Touch Icon
   - navbar/header components
   - login/authentication UI
   - onboarding UI
   - splash/loading screens, if any
   - any old logo, wordmark, placeholder, or branding currently in use
3. Read the README files included in both official asset packages.
4. Determine how the PWA is currently implemented before making changes.
5. Reuse the existing project architecture. Do not introduce a second metadata or manifest solution if one already exists.

## Required implementation

### A. Assets

Copy or move the necessary assets from `beeexy_images` into the appropriate public/static location used by the frontend, preferably following the project's existing asset organization.

If no clear structure currently exists, use an equivalent structure such as:

```text
public/
  brand/
    beeexy-logo.png
    beeexy-logo-white.png
  icons/
    icon-192x192.png
    icon-512x512.png
    icon-maskable-512x512.png
  apple-touch-icon.png
  favicon.ico
```

The application must not depend at runtime on files located inside `beeexy_images`.

Do not redesign, distort, redraw, unnecessarily re-rasterize, or arbitrarily recolor the official assets.

### B. PWA / Manifest

Update the existing manifest so that it uses the official Beeexy icons.

At minimum, correctly configure:

- `192x192` with purpose `any`
- `512x512` with purpose `any`
- `512x512` with purpose `maskable`

Use the specifically prepared maskable asset for `purpose: "maskable"`.

Preserve the existing `name`, `short_name`, `start_url`, `display`, theme/background colors, and other PWA behavior unless a branding reference specifically needs to be corrected.

Do not change functional PWA behavior.

### C. Favicon and metadata

Update the relevant configuration to use the official Beeexy assets for:

- favicon
- Apple Touch Icon
- Next.js icon metadata
- manifest reference

Remove active references to obsolete icons or default Next.js/Vercel assets.

### D. Logo in the UI

Replace temporary branding, text-based branding, obsolete logos, or placeholder images with the official Beeexy logo wherever appropriate, especially in:

- navbar/header
- login/authentication
- onboarding
- splash/loading/internal landing screens if they currently display Beeexy branding

Use the complete Beeexy logo rather than the isotipo whenever there is enough space for the full brand to remain legible.

Use `next/image` when appropriate for the existing implementation.

Always preserve the logo's aspect ratio:

- do not stretch it
- do not squash it
- do not force incompatible CSS width and height values

As a visual guideline:

- navbar/header: approximately 120–180 CSS px wide
- login/authentication: approximately 160–220 CSS px wide
- onboarding: approximately 180–280 CSS px wide

Adapt these values to the existing responsive layout. They are guidelines, not rigid dimensions.

For dark backgrounds, use the included white logo variant only when necessary.

### E. Beeexy Isotipo

The three-loop Beeexy isotipo should primarily be used for:

- favicon
- PWA icon
- installed app icon
- Apple Touch Icon
- very small surfaces where the complete logo would not remain legible

Do not indiscriminately replace the complete Beeexy wordmark with the isotipo in navbar, login, or onboarding screens.

## Restrictions

- Do not modify the backend.
- Do not change functional user flows.
- Do not change API contracts.
- Do not redesign existing screens.
- Do not change the visual identity beyond integrating the supplied official Beeexy assets.
- Do not introduce new dependencies unless strictly necessary.
- Do not recreate the logo using CSS.
- Do not recreate the logo using text or a font.
- Do not modify the original files inside `beeexy_images`; treat them as the source of truth.
- Preserve accessibility: visible brand images should use `alt="Beeexy"` where appropriate; purely decorative assets may follow the project's existing accessible-image conventions.

## Cleanup

Remove or leave unreferenced any obsolete branding assets that are replaced by the official Beeexy assets.

Before physically deleting an existing asset, verify that it has no other legitimate use.

Search the entire frontend repository after the implementation to ensure that:

- no obsolete logos remain actively referenced
- no obsolete favicons remain actively referenced
- no obsolete PWA icons remain actively referenced
- no broken asset paths remain

## Validation

After implementation:

1. Run the frontend's existing checks:
   - lint
   - typecheck, if available
   - relevant tests
   - production build
2. Verify that the PWA manifest is valid.
3. Verify that all icon paths resolve correctly.
4. Verify that Next.js can resolve all brand images.
5. Verify that the production build introduces no new warnings related to metadata, manifest configuration, or images.
6. Perform a basic responsive visual check of the navbar, login, and onboarding branding.
7. Confirm that the Beeexy logo preserves its original aspect ratio everywhere.
8. Confirm that the maskable icon is correctly configured for `purpose: "maskable"` and is not accidentally being used in a way that degrades the normal `any` icon presentation.

## Final report

When finished, report:

1. Files modified.
2. Official assets used and their final locations.
3. Changes made to manifest, metadata, favicon, and PWA icon configuration.
4. Screens/components where the Beeexy logo was updated.
5. Obsolete branding assets removed or left unused.
6. Exact results of lint, typecheck, tests, and production build.
7. Any relevant implementation decisions.
8. Any inconsistencies discovered between the frontend's previous branding and the official supplied Beeexy assets.

Do not consider the task complete until you have inspected both official asset directories and validated the frontend production build.

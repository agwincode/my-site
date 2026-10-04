# Angela Winegar

Astro website for angelawinegar.com.

## Editing

The redesigned Home, Investments, and Ideas pages live in `site/`. Shared navigation and footer are in `site/src/shared/`. Animation code is in `site/src/`.

`npm run build` prepares the pages in `.generated/` and extracts images into cacheable `public/assets/site/` files, then Astro publishes them at `/`, `/investments/`, and `/content/`. `npm run dev` also prepares the pages; after editing `site/`, run `node site/build.mjs` to refresh the generated pages. No additional dependencies were added.

## Deployment

The existing GitHub Actions workflow deploys pushes to `main` to GitHub Pages. Review the `website-refresh` branch before merging. The separate Distribution Labs page and existing domain configuration are preserved.

The homepage is `site/index.html`. Development design variants are not part of the production pages. `site/build.mjs` maps local preview links to the public routes. Do not edit `.generated/` or `dist/` directly.

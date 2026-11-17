# Marketplace interaction checks

Run `npm run test:marketplace:ui` after installing root and `apps/mobile` dependencies.
The offline fixture mounts the production card, gallery, search suggestions,
comparison tray, copy/save feedback, seller preview, and posting form. Listings
are synthetic, photos are local assets, and save/submission handlers are inert.
The checks cover phone and desktop widths, keyboard navigation, permission and
account changes, failed/delayed images, reduced motion, and comparison limits.
Native gallery integration is also covered by `npm run test:mobile:details:ui`.

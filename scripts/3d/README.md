# ParkVault 3D cover workflow

This workflow creates one canonical 3D product cover from one approved product image. It does not alter or replace seller listing photos.

## One-time account step

1. Open <https://huggingface.co/stabilityai/stable-fast-3d>.
2. Sign in and accept the model license.
3. Create a read-only Hugging Face access token.
4. In Terminal, from the ParkVault app folder, run `.parkvault-tools/venv/bin/huggingface-cli login` and paste the token into the private prompt. Do not paste the token into source code or chat.

## Create a model

1. Run `npm run models:list` to see the launch products and their readiness.
2. Run `npm run models:generate -- PRODUCT-SLUG`.
3. Review the private draft in `public/models/drafts/`.
4. Only after visual approval, copy it to `public/models/products/` and add an approved `product_models` database record.

Draft models, downloaded weights, and the generator environment are excluded from Git. Approved `.glb` files are versioned with the site.

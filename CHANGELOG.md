# Changelog

## [0.2.0](https://github.com/jmoyers14/vendpire/compare/v0.1.0...v0.2.0) (2026-10-01)


### Features

* add GCP Cloud Run deploy pipeline ([1505386](https://github.com/jmoyers14/vendpire/commit/1505386fa8ad3380d478234d347d02784e28646d))
* catalog text search on the product form ([2f22256](https://github.com/jmoyers14/vendpire/commit/2f22256fa7f278424daecadf1c65e2bcb2bb9b3d))
* data model and desk CRUD for locations, machines, products, planograms, purchases ([0f29eaa](https://github.com/jmoyers14/vendpire/commit/0f29eaa255d3fd3111ff76ab755fb2b0cc3abdb3))
* draw the slot grid as a machine face ([d90d37f](https://github.com/jmoyers14/vendpire/commit/d90d37f64993bc8fdf0eeadf3aa187ecd9567f49))
* Google Places address autocomplete for locations ([cf9b522](https://github.com/jmoyers14/vendpire/commit/cf9b52233aa265149a18de387d35902a7d02b916))
* GTIN normalization and first-class packs ([63a2720](https://github.com/jmoyers14/vendpire/commit/63a272011305681f67447c583fbbc4075d72e5c4))
* machine slot layout stored as shelves; planogram face view ([344ba86](https://github.com/jmoyers14/vendpire/commit/344ba8614be8f64c49946b7a7a85472762818836))
* manual slot entry renders the machine face too ([11ae13b](https://github.com/jmoyers14/vendpire/commit/11ae13b3c2751af380c077fde57f30042ef07d9c))
* per-shelf slot numbering rules (start + step) ([db83d6a](https://github.com/jmoyers14/vendpire/commit/db83d6a259eae8113580f70665adb0ea444c1b48))
* planogram editor on the machine face ([2b215b6](https://github.com/jmoyers14/vendpire/commit/2b215b695e76978fb707938b5ed784d239bf83c9))
* product catalog lookup and images via Open Food Facts ([37065cd](https://github.com/jmoyers14/vendpire/commit/37065cdb156340e2c5a5b77ddb1ff85b65b7a86c))
* scaffold vendpire monorepo with e2e test harness ([ad394f8](https://github.com/jmoyers14/vendpire/commit/ad394f88283d2134ae0f69ff71afdeead051d1b1))
* scan-first purchase entry with a single barcode input ([1c69b78](https://github.com/jmoyers14/vendpire/commit/1c69b7885c33096dc41d9a650bf0338ec9096d6d))
* slot grid generator on the machine form ([ebdeda7](https://github.com/jmoyers14/vendpire/commit/ebdeda797da115f6a8af21ce1ba6e027340a44c2))


### Bug Fixes

* case barcodes are packagings, not the product upc ([30a6e69](https://github.com/jmoyers14/vendpire/commit/30a6e69c0190d5b37d574cd5bbaef81b9a720b2e))
* disable gcloud prompts in deploy ([8e93e60](https://github.com/jmoyers14/vendpire/commit/8e93e608ff3acb1d05b8d7812b91da697d5b6cd9))
* merge env vars in deploy instead of replacing ([c67c90b](https://github.com/jmoyers14/vendpire/commit/c67c90b0b1489ef1be5065b10a06114d076a0432))
* try stripped leading zero in catalog barcode lookup; import scripts ([78cbdbc](https://github.com/jmoyers14/vendpire/commit/78cbdbc015b3f453fc48714c0404fe1e6c7682e8))

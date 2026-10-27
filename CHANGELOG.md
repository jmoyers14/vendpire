# Changelog

## [0.5.0](https://github.com/jmoyers14/vendpire/compare/v0.4.0...v0.5.0) (2026-10-26)


### Features

* **ios:** fill the mirror from /api/v1 (Phase 7) ([#25](https://github.com/jmoyers14/vendpire/issues/25)) ([2a302bf](https://github.com/jmoyers14/vendpire/commit/2a302bfe9aa2b1373267911fb30a78c9f207b961))

## [0.4.0](https://github.com/jmoyers14/vendpire/compare/v0.3.0...v0.4.0) (2026-10-22)


### Features

* **api:** gate stale iOS clients behind a server-owned build floor ([#18](https://github.com/jmoyers14/vendpire/issues/18)) ([77419fb](https://github.com/jmoyers14/vendpire/commit/77419fb0614364032f64d5e577945cb1a441edc8))
* **api:** REST/OpenAPI surface at /api/v1 ([#22](https://github.com/jmoyers14/vendpire/issues/22)) ([f2d1050](https://github.com/jmoyers14/vendpire/commit/f2d1050df5db38e5931b8f980bda406730fcbb19))
* **ios:** add a placeholder app icon ([#23](https://github.com/jmoyers14/vendpire/issues/23)) ([67c3f13](https://github.com/jmoyers14/vendpire/commit/67c3f13e805b1809ae6fd7413042c2a3c10e0238))
* **ios:** fixture-backed store and navigation skeleton ([#19](https://github.com/jmoyers14/vendpire/issues/19)) ([d08f579](https://github.com/jmoyers14/vendpire/commit/d08f579ece617579536de240dc9c91ff13959977))
* **ios:** lock the app on the device owner, and send a fresh install to sign-in ([#21](https://github.com/jmoyers14/vendpire/issues/21)) ([c778077](https://github.com/jmoyers14/vendpire/commit/c778077b4c0ee692ad3a9028a26125bfe027cb4e))
* **ios:** update wall and GTIN normalization ([#20](https://github.com/jmoyers14/vendpire/issues/20)) ([20d258f](https://github.com/jmoyers14/vendpire/commit/20d258fffeedf95a7aa4758d7d1d0b89f29e488b))
* store document relationships as ObjectId refs ([#16](https://github.com/jmoyers14/vendpire/issues/16)) ([d36c3c8](https://github.com/jmoyers14/vendpire/commit/d36c3c81013f27df65d1485125c35f638f0dcf2d))
* **web:** give organization management a home at /settings ([#24](https://github.com/jmoyers14/vendpire/issues/24)) ([1c4edc3](https://github.com/jmoyers14/vendpire/commit/1c4edc31a0c194b7f76f213839f35007d66b7ddd))

## [0.3.0](https://github.com/jmoyers14/vendpire/compare/v0.2.0...v0.3.0) (2026-10-18)


### Features

* expiration date tracking — one best-by date per slot ([55ac0ea](https://github.com/jmoyers14/vendpire/commit/55ac0ea36473335e2e8b015f63f6a7e730caef7e))


### Bug Fixes

* **api:** make the expiry report deterministic and stop dropping unknown products ([83edec5](https://github.com/jmoyers14/vendpire/commit/83edec511010c26fcf6cd1128364ae4e61d93e12))
* **ci:** make the deploy actually reachable and runnable ([#15](https://github.com/jmoyers14/vendpire/issues/15)) ([bfe8a83](https://github.com/jmoyers14/vendpire/commit/bfe8a83ba6f4487c845a44a576dde45f5c2bca10))

## [0.2.0](https://github.com/jmoyers14/vendpire/compare/v0.1.0...v0.2.0) (2026-10-18)


### Features

* accept Clerk webhooks to mirror users and organizations ([d758a55](https://github.com/jmoyers14/vendpire/commit/d758a554d42769de463ac48bf0030777c4caea42))
* add GCP Cloud Run deploy pipeline ([1505386](https://github.com/jmoyers14/vendpire/commit/1505386fa8ad3380d478234d347d02784e28646d))
* **api:** add planograms.listCurrentByOrg ([446677f](https://github.com/jmoyers14/vendpire/commit/446677f22a24e9caaebdb7d96e9140f111379a2d))
* **api:** add the visit service and the visits tRPC router ([55bde4e](https://github.com/jmoyers14/vendpire/commit/55bde4e373dc4b8113c980801d27dc85a58f482b))
* **api:** Phase 4 — visit service and visits router ([b220a32](https://github.com/jmoyers14/vendpire/commit/b220a32ef1902a9e6e6905442bc0b241308c0cbe))
* catalog text search on the product form ([2f22256](https://github.com/jmoyers14/vendpire/commit/2f22256fa7f278424daecadf1c65e2bcb2bb9b3d))
* **ci:** add a script to set the Actions secrets from local .env files ([9c22ca5](https://github.com/jmoyers14/vendpire/commit/9c22ca5e1a7c133e5cb7a4b6696bfe4bde9b9677))
* data model and desk CRUD for locations, machines, products, planograms, purchases ([0f29eaa](https://github.com/jmoyers14/vendpire/commit/0f29eaa255d3fd3111ff76ab755fb2b0cc3abdb3))
* **domain:** derive sold units, COGS, and profit from visit counts ([896be76](https://github.com/jmoyers14/vendpire/commit/896be7618fd1f292b3ec7a40c1c2b024efef81fb))
* **domain:** derive sold units, COGS, and profit from visit counts ([c743bd9](https://github.com/jmoyers14/vendpire/commit/c743bd905d536cf4e38e6addc7760e2e5b6dd2ea))
* **domain:** export the single-visit observation check ([86d32cb](https://github.com/jmoyers14/vendpire/commit/86d32cb2aa0c8bfa66177b2a23fe6a80394a5a3a))
* draw the slot grid as a machine face ([d90d37f](https://github.com/jmoyers14/vendpire/commit/d90d37f64993bc8fdf0eeadf3aa187ecd9567f49))
* Google Places address autocomplete for locations ([cf9b522](https://github.com/jmoyers14/vendpire/commit/cf9b52233aa265149a18de387d35902a7d02b916))
* GTIN normalization and first-class packs ([63a2720](https://github.com/jmoyers14/vendpire/commit/63a272011305681f67447c583fbbc4075d72e5c4))
* **ios:** add build configuration and the Clerk SDK ([4213553](https://github.com/jmoyers14/vendpire/commit/4213553ecfb0a8848212ff03465deb287182dd40))
* **ios:** add Clerk sign-in and the session-token claim probe ([c279262](https://github.com/jmoyers14/vendpire/commit/c2792627c1c188d7a45190cf04ba4005db4dab1a))
* **ios:** add the SwiftData models for the device mirror ([b7f44bf](https://github.com/jmoyers14/vendpire/commit/b7f44bf569537b00b255866773e11762271d6fe3))
* **ios:** scaffold the native iOS app ([c881579](https://github.com/jmoyers14/vendpire/commit/c8815792b5d929902f827c1966e36d66559b8e7b))
* **ios:** scaffold the native iOS app with Clerk auth and the SwiftData mirror ([97bdba5](https://github.com/jmoyers14/vendpire/commit/97bdba5052f6358cdef98a8add881cda75c96956))
* machine slot layout stored as shelves; planogram face view ([344ba86](https://github.com/jmoyers14/vendpire/commit/344ba8614be8f64c49946b7a7a85472762818836))
* manual slot entry renders the machine face too ([11ae13b](https://github.com/jmoyers14/vendpire/commit/11ae13b3c2751af380c077fde57f30042ef07d9c))
* paginate purchases with a keyset cursor, add catalog search ([cd0df64](https://github.com/jmoyers14/vendpire/commit/cd0df643c39195b6726061ce1a19b8d252751a20))
* per-shelf slot numbering rules (start + step) ([db83d6a](https://github.com/jmoyers14/vendpire/commit/db83d6a259eae8113580f70665adb0ea444c1b48))
* planogram editor on the machine face ([2b215b6](https://github.com/jmoyers14/vendpire/commit/2b215b695e76978fb707938b5ed784d239bf83c9))
* **platform:** add deleted-tolerant reference reads ([a16a2ad](https://github.com/jmoyers14/vendpire/commit/a16a2ad7f49d8b147a452cf9249c8d078befca72))
* **platform:** add webhook verification, task queue, and identity mirrors ([83b4994](https://github.com/jmoyers14/vendpire/commit/83b4994c9913d3965cdd55683da124d5c633ddf9))
* **platform:** give purchases a client idempotency key ([4367b1b](https://github.com/jmoyers14/vendpire/commit/4367b1ba27c955a71b9ac23cb87f076eef48bc87))
* **platform:** persist visits with an append-only repository ([976ebcd](https://github.com/jmoyers14/vendpire/commit/976ebcd507b942d46fcfe23bb910307e49e577cf))
* **platform:** Phase 3 — visit persistence ([591a948](https://github.com/jmoyers14/vendpire/commit/591a9484414ed7fb2c38014c85b47ddbd168525c))
* **platform:** read all-time purchase lines for the cost basis ([f13e3ef](https://github.com/jmoyers14/vendpire/commit/f13e3efbb167619dceb6c0b5c4a0df556d9848c1))
* product catalog lookup and images via Open Food Facts ([37065cd](https://github.com/jmoyers14/vendpire/commit/37065cdb156340e2c5a5b77ddb1ff85b65b7a86c))
* **purchases:** paginate the list with a keyset cursor and date filter ([8b7414a](https://github.com/jmoyers14/vendpire/commit/8b7414a7c5cf12dfe4f9f303f60a7ffe45a5a1d0))
* require clientRequestId on purchases ([217d367](https://github.com/jmoyers14/vendpire/commit/217d3678dd66bbe829de35bf513f7b4368ce35f7))
* scaffold vendpire monorepo with e2e test harness ([ad394f8](https://github.com/jmoyers14/vendpire/commit/ad394f88283d2134ae0f69ff71afdeead051d1b1))
* scan-first purchase entry with a single barcode input ([1c69b78](https://github.com/jmoyers14/vendpire/commit/1c69b7885c33096dc41d9a650bf0338ec9096d6d))
* slot grid generator on the machine form ([ebdeda7](https://github.com/jmoyers14/vendpire/commit/ebdeda797da115f6a8af21ce1ba6e027340a44c2))
* **web:** add search to the products and packs tables ([8efe02b](https://github.com/jmoyers14/vendpire/commit/8efe02bf0d59062fdd4fab01eed4b20f6dbde78b))
* **web:** add visit entry, history and P&L ([f147e74](https://github.com/jmoyers14/vendpire/commit/f147e74f3ac5d9ef95aab5007d283e6f88ef3d5c))
* **web:** add visit entry, history and P&L ([1700d80](https://github.com/jmoyers14/vendpire/commit/1700d80fd1dfd5164b47b4bdac20938d7c1d7a20))
* **worker:** add worker service for Clerk webhook ingestion ([275589c](https://github.com/jmoyers14/vendpire/commit/275589cd038731e20e1cf902a17e156adec5c0df))


### Bug Fixes

* case barcodes are packagings, not the product upc ([30a6e69](https://github.com/jmoyers14/vendpire/commit/30a6e69c0190d5b37d574cd5bbaef81b9a720b2e))
* **ci:** retry IAM bindings while a new service account propagates ([98ae3ac](https://github.com/jmoyers14/vendpire/commit/98ae3acfbe04b7b294959edb02d8020e7688bb41))
* **ci:** scope deploy secrets to the staging environment, not the repository ([f827909](https://github.com/jmoyers14/vendpire/commit/f827909dc65063e2a86a7fcc852eac659ebb2b54))
* **deploy:** label the stack staging, not production ([2aaa4cf](https://github.com/jmoyers14/vendpire/commit/2aaa4cf3a6ef378e2f8f03c5de73de3da1f60b43))
* disable gcloud prompts in deploy ([8e93e60](https://github.com/jmoyers14/vendpire/commit/8e93e608ff3acb1d05b8d7812b91da697d5b6cd9))
* **e2e:** fall back to the Clerk placeholder on an empty key, not just a unset one ([d5da36f](https://github.com/jmoyers14/vendpire/commit/d5da36f4918f68229454330562c273b644ad3972))
* **ios:** dismiss sign-in on success and report activation honestly ([a9778b3](https://github.com/jmoyers14/vendpire/commit/a9778b346538deb942825ac9e634d2b2e167e7bf))
* merge env vars in deploy instead of replacing ([c67c90b](https://github.com/jmoyers14/vendpire/commit/c67c90b0b1489ef1be5065b10a06114d076a0432))
* try stripped leading zero in catalog barcode lookup; import scripts ([78cbdbc](https://github.com/jmoyers14/vendpire/commit/78cbdbc015b3f453fc48714c0404fe1e6c7682e8))

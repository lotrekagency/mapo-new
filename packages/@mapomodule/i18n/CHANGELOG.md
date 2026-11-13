# @mapomodule/i18n [2.0.0-experimental.2](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@2.0.0-experimental.1...@mapomodule/i18n@2.0.0-experimental.2) (2026-11-13)

### Features

- **ai:** read a web page from its link ([498f2d2](https://github.com/lotrekagency/mapo-new/commit/498f2d2cb0012cc282c882418ed335cba6e1796b))

# @mapomodule/i18n [2.0.0-experimental.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@1.0.0...@mapomodule/i18n@2.0.0-experimental.1) (2026-11-12)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **core:** localize fetch errors and use app-scoped stores ([b2a9c76](https://github.com/lotrekagency/mapo-new/commit/b2a9c760c685c315b71d395ae4157232973bc598))
- **form:** name the tab of fields without a tab, and hide tabs with nothing to show ([b7be712](https://github.com/lotrekagency/mapo-new/commit/b7be712867dc0e4305a7e504444387ba61fd3167))
- **i18n:** pin nuxt to 4.4.2 to avoid duplicate nuxt in build graph ([4e1ed1b](https://github.com/lotrekagency/mapo-new/commit/4e1ed1b38fa77ac0620e9856a0111600592e42a5))
- **i18n:** require @nuxtjs/i18n 10.6, which resolves the generated vue-i18n config in dev ([5545bcc](https://github.com/lotrekagency/mapo-new/commit/5545bccf4986373e5ee470e72aa65893561ab9b9))
- **release:** build packages from semantic-release prepare, not prepack ([e7f4327](https://github.com/lotrekagency/mapo-new/commit/e7f4327027ac4b4f1f430dfc35fb4669a7703c13))
- **uikit:** sort lists from the column headers ([e4e84aa](https://github.com/lotrekagency/mapo-new/commit/e4e84aa701b52725f21c3d9c335b8852facb1805))

### Features

- **ai:** add the AI settings page, with the user's preference and the check of a connection ([6aae15b](https://github.com/lotrekagency/mapo-new/commit/6aae15ba94b501da80c6d65252cc99975d518e68))
- **ai:** add the Ollama and OpenAI-compatible providers, for models on the app's own servers ([df16dc9](https://github.com/lotrekagency/mapo-new/commit/df16dc915958e083cac37f943c96c961f196ca7f))
- **ai:** choose the items of a list, added after the record's own ([a0ab483](https://github.com/lotrekagency/mapo-new/commit/a0ab48321f8484608caf28ca3c6e03e3a5b70a24))
- **ai:** fill a detail form through the gateway with useMapoAiFill ([2f0a9de](https://github.com/lotrekagency/mapo-new/commit/2f0a9de047b801a84855faf026d4f74246da28e4))
- **ai:** fill every detail form from a text or files with Magic Fill ([3add53e](https://github.com/lotrekagency/mapo-new/commit/3add53e10627ed7e742372c70bb082adf09777ec))
- **ai:** let the AI's admins change how the AI works, within what the app allows ([5fc38d6](https://github.com/lotrekagency/mapo-new/commit/5fc38d645aa98e58a1c46048c24896bddd9239c5))
- **ai:** resolve relations and show where each value comes from ([c78ed2b](https://github.com/lotrekagency/mapo-new/commit/c78ed2bcfc054797cf0c8ddc90f5959db7d0c7dd))
- **ai:** show the AI's usage and the changes of keys and settings, read from the audit ([1d680d1](https://github.com/lotrekagency/mapo-new/commit/1d680d1e82a331fbc677a182414e320eeb9bf8af))
- **ai:** take the operator to each value to check, and say why a call to the AI is refused ([eab0f1c](https://github.com/lotrekagency/mapo-new/commit/eab0f1ce5a8a5fc7ce4447396a24f60d08d384e5))
- enhance MapoRepeater with template support and block picker ([0c0c4af](https://github.com/lotrekagency/mapo-new/commit/0c0c4af06e88fc38ea30aa66d45d9951eec87f64))
- **form:** annotate fields from outside their descriptors ([da2e78e](https://github.com/lotrekagency/mapo-new/commit/da2e78e68464893bbe02cf84b26a52bb492eff30))
- **i18n:** add module with en and it catalogs ([b19c437](https://github.com/lotrekagency/mapo-new/commit/b19c43796bfbc0ea64c59c6b0cf40e7efdab59b6))
- **uikit:** add an "all rows" page size to MapoList ([2924396](https://github.com/lotrekagency/mapo-new/commit/29243964e57ba5e88e315c7186693eda24acae58))
- **uikit:** say "No results" when a search or a filter finds nothing ([d7f6ffa](https://github.com/lotrekagency/mapo-new/commit/d7f6ffa9b2f997e517d8b9598a5e6b1f55e5eaec))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

# @mapomodule/i18n [2.0.0-beta.5](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@2.0.0-beta.4...@mapomodule/i18n@2.0.0-beta.5) (2026-10-29)

### Bug Fixes

- **core:** localize fetch errors and use app-scoped stores ([b2a9c76](https://github.com/lotrekagency/mapo-new/commit/b2a9c760c685c315b71d395ae4157232973bc598))

# @mapomodule/i18n [2.0.0-beta.4](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@2.0.0-beta.3...@mapomodule/i18n@2.0.0-beta.4) (2026-10-27)

### Features

- enhance MapoRepeater with template support and block picker ([0c0c4af](https://github.com/lotrekagency/mapo-new/commit/0c0c4af06e88fc38ea30aa66d45d9951eec87f64))

# @mapomodule/i18n [2.0.0-beta.3](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@2.0.0-beta.2...@mapomodule/i18n@2.0.0-beta.3) (2026-10-27)

### Bug Fixes

- **form:** name the tab of fields without a tab, and hide tabs with nothing to show ([b7be712](https://github.com/lotrekagency/mapo-new/commit/b7be712867dc0e4305a7e504444387ba61fd3167))
- **i18n:** require @nuxtjs/i18n 10.6, which resolves the generated vue-i18n config in dev ([5545bcc](https://github.com/lotrekagency/mapo-new/commit/5545bccf4986373e5ee470e72aa65893561ab9b9))
- **uikit:** sort lists from the column headers ([e4e84aa](https://github.com/lotrekagency/mapo-new/commit/e4e84aa701b52725f21c3d9c335b8852facb1805))

### Features

- **uikit:** add an "all rows" page size to MapoList ([2924396](https://github.com/lotrekagency/mapo-new/commit/29243964e57ba5e88e315c7186693eda24acae58))
- **uikit:** say "No results" when a search or a filter finds nothing ([d7f6ffa](https://github.com/lotrekagency/mapo-new/commit/d7f6ffa9b2f997e517d8b9598a5e6b1f55e5eaec))

# @mapomodule/i18n [2.0.0-beta.2](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@2.0.0-beta.1...@mapomodule/i18n@2.0.0-beta.2) (2026-08-27)

### Bug Fixes

- **release:** build packages from semantic-release prepare, not prepack ([e7f4327](https://github.com/lotrekagency/mapo-new/commit/e7f4327027ac4b4f1f430dfc35fb4669a7703c13))

# @mapomodule/i18n [2.0.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/i18n@1.0.0...@mapomodule/i18n@2.0.0-beta.1) (2026-08-27)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **i18n:** pin nuxt to 4.4.2 to avoid duplicate nuxt in build graph ([4e1ed1b](https://github.com/lotrekagency/mapo-new/commit/4e1ed1b38fa77ac0620e9856a0111600592e42a5))

### Features

- **i18n:** add module with en and it catalogs ([b19c437](https://github.com/lotrekagency/mapo-new/commit/b19c43796bfbc0ea64c59c6b0cf40e7efdab59b6))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

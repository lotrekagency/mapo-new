# @mapomodule/uikit [2.0.0-beta.7](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@2.0.0-beta.6...@mapomodule/uikit@2.0.0-beta.7) (2026-07-28)

### Bug Fixes

- **media:** update upload URL handling to include CSRF token support ([71cd976](https://github.com/lotrekagency/mapo-new/commit/71cd976bfb8e6cd3ae3f5eea848b6a8aaa75ea95))
- **pagination:** rename page-size prop to items-per-page for clarity ([f9e2ffe](https://github.com/lotrekagency/mapo-new/commit/f9e2ffe51ad4d3c1f666b31c5ba29fdcf046f1f9))

# @mapomodule/uikit [2.0.0-beta.6](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@2.0.0-beta.5...@mapomodule/uikit@2.0.0-beta.6) (2026-07-28)

### Bug Fixes

- **media:** unify upload request format using multipart policy ([e745941](https://github.com/lotrekagency/mapo-new/commit/e745941a5a6475bcfd8e6b3e2cca71c1c0146c4a))

# @mapomodule/uikit [2.0.0-beta.5](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@2.0.0-beta.4...@mapomodule/uikit@2.0.0-beta.5) (2026-07-23)

### Bug Fixes

- **uikit:** harden media drag reorder and checkbox handler types ([7463754](https://github.com/lotrekagency/mapo-new/commit/74637545bdd9f9dcda19685fab96310855e7c8b4))
- **uikit:** use UFieldGroup for the media editor language switch ([624abb0](https://github.com/lotrekagency/mapo-new/commit/624abb0bfd557e49a61ac8588fa46c597401635a))

### Features

- **uikit:** add Media Manager ([42c894d](https://github.com/lotrekagency/mapo-new/commit/42c894dbe0c9533db58c369624bfe808dffb07dc))

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-beta.5
- **@mapomodule/utils:** upgraded to 2.0.0-beta.2
- **@mapomodule/core:** upgraded to 2.0.0-beta.5

# @mapomodule/uikit [2.0.0-beta.4](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@2.0.0-beta.3...@mapomodule/uikit@2.0.0-beta.4) (2026-07-16)

### Bug Fixes

- enable SSR transpilation and auto-import for Nuxt modules ([fe7da33](https://github.com/lotrekagency/mapo-new/commit/fe7da33e7795ca142dc13f791c8cd23f5c638490))

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-beta.4
- **@mapomodule/store:** upgraded to 2.0.0-beta.4
- **@mapomodule/core:** upgraded to 2.0.0-beta.4

# @mapomodule/uikit [2.0.0-beta.3](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@2.0.0-beta.2...@mapomodule/uikit@2.0.0-beta.3) (2026-07-16)

### Bug Fixes

- update dependencies and improve module resolution for Pinia and TailwindCSS ([2c18c13](https://github.com/lotrekagency/mapo-new/commit/2c18c13161faf0c9986a2fe896cbe0ad3843461b))

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-beta.3
- **@mapomodule/store:** upgraded to 2.0.0-beta.3
- **@mapomodule/core:** upgraded to 2.0.0-beta.3

# @mapomodule/uikit [2.0.0-beta.2](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@2.0.0-beta.1...@mapomodule/uikit@2.0.0-beta.2) (2026-07-16)

### Bug Fixes

- update package.json scripts to use prepack and switch dependencies to workspace ([c7d3abc](https://github.com/lotrekagency/mapo-new/commit/c7d3abc3eca338e50d1af8f93a4a59065a548a8b))

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-beta.2
- **@mapomodule/store:** upgraded to 2.0.0-beta.2
- **@mapomodule/core:** upgraded to 2.0.0-beta.2

# @mapomodule/uikit [2.0.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/uikit@1.0.0...@mapomodule/uikit@2.0.0-beta.1) (2026-07-07)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **build:** add build.config.ts, fix core module exports, update articles demo and migration guide ([84641fc](https://github.com/lotrekagency/mapo-new/commit/84641fc7026d19a0549fc8e6bd56ec580a2f2142))
- **lint:** add ts-expect-error descriptions, import computed, disable page-level rules ([8022549](https://github.com/lotrekagency/mapo-new/commit/8022549a14d3863ac13e182e5c1febb6e5a9d75d))
- **list:** fix stray syntax error; wire ActionDescriptor.dangerous to confirm and apply button ([12bbb86](https://github.com/lotrekagency/mapo-new/commit/12bbb86dc3ea703873e4fe8ff5c7177e4508aba5))
- **MapoList:** correct import path for FieldDescriptor and FieldRegistry types ([ceb90ba](https://github.com/lotrekagency/mapo-new/commit/ceb90ba55e341207164f1ca2abf139dcf7fad3aa))
- **typecheck:** resolve TS errors in core middleware, uikit module, and utils tsconfig ([7c51dcb](https://github.com/lotrekagency/mapo-new/commit/7c51dcba0065f90e7fee2fc9c21d8890e5ae3325))
- **uikit:** fix MapoList filters/sorting and endpoint query params ([ed7ce58](https://github.com/lotrekagency/mapo-new/commit/ed7ce581d95274c40a77280c1e4fd78b5f493233))
- **uikit:** relax generic constraint to T extends object; add atKey helper ([5e99416](https://github.com/lotrekagency/mapo-new/commit/5e9941636c97ec4f38c9115c2d3b690abf33008c))
- **uikit:** tighten runtime typings and remove fragile #imports usage ([d4eab6e](https://github.com/lotrekagency/mapo-new/commit/d4eab6e8e5b411ac4ba7320b3f44b663018498d9)), closes [#imports](https://github.com/lotrekagency/mapo-new/issues/imports)

### Features

- **draft:** implement draft persistence for forms ([3e7c8b5](https://github.com/lotrekagency/mapo-new/commit/3e7c8b5d0491e05d9fd8ed7e9d13da87d0c68657))
- enhance form components with TypeScript improvements and formatting adjustments ([62b65dc](https://github.com/lotrekagency/mapo-new/commit/62b65dc43d9e89184119024e0f8df52093f04925))
- **exports:** add ./types subpath to all packages and create mapomodule aggregator ([a59be8a](https://github.com/lotrekagency/mapo-new/commit/a59be8aebc13b785936e862c59080b6caad99271))
- **form:** add field.before/after and group.before/after granular slots ([ebce314](https://github.com/lotrekagency/mapo-new/commit/ebce31452fb4ec8c6b4963beb67e78844a85104c))
- **form:** enhance form components with draft persistence and validation registration ([e25e4ce](https://github.com/lotrekagency/mapo-new/commit/e25e4cea21f3332d9c1215215069a812489e8be2))
- **form:** enhance language support and improve slot handling in form components ([130c26c](https://github.com/lotrekagency/mapo-new/commit/130c26cc924a8922750abde52baab147398ec4d1))
- **form:** improve form components with enhanced comments, refactoring, and draft handling ([23c62ad](https://github.com/lotrekagency/mapo-new/commit/23c62ad9684bd61275925040db6123b9a1c47bb7))
- **form:** update language switch component to include dropdown ([d35283b](https://github.com/lotrekagency/mapo-new/commit/d35283b53d754c421ba817e834e4127305a322e1))
- **form:** update README and package.json ([3a72f1c](https://github.com/lotrekagency/mapo-new/commit/3a72f1cfd664facda78721339a29781966ac63fc))
- **list:** narrow cell slot types via mapped type; add permissionModel prop ([9e8c65d](https://github.com/lotrekagency/mapo-new/commit/9e8c65d1a93addda945d82215058f38daf08a705))
- **MapoDetail:** update confirmation dialog methods for delete and unsaved changes ([5816317](https://github.com/lotrekagency/mapo-new/commit/58163178ee09087030ebe3ee2fb4b2db91be10d0))
- **module:** update module installation to resolve path dynamically ([3822ead](https://github.com/lotrekagency/mapo-new/commit/3822eadb88eea26007e9342d65621db839864d2a))
- **ui:** improve code formatting and readability across multiple components ([bac3d48](https://github.com/lotrekagency/mapo-new/commit/bac3d487be1c3a8a687c9ba533c2a51bff6a1dee))
- **uikit:** add langThreshold prop and select menu fallback to MapoDetailLangSwitch ([8ca39f2](https://github.com/lotrekagency/mapo-new/commit/8ca39f2516e628e612679027ebef616881d99434))
- **uikit:** add list types ([ebd318b](https://github.com/lotrekagency/mapo-new/commit/ebd318b9bd5fa6b9b44d0d6c73ac5de171241981))
- **uikit:** add MapoDetail and MapoDetailLangSwitch ([8f63900](https://github.com/lotrekagency/mapo-new/commit/8f639001ec7470b9bcdee76b6562106e6064c4cd))
- **uikit:** add MapoList component system ([33b0687](https://github.com/lotrekagency/mapo-new/commit/33b06871bcc37b38658673190cfe00edbbf85f18))
- **uikit:** add Nuxt module with component registration, layouts, and MapoOverride hook ([24be1cc](https://github.com/lotrekagency/mapo-new/commit/24be1cc976ff0c2f3fb7863fe62181a57d1ab7ae))
- **uikit:** add shell components, layouts, login page, and base CSS ([355955c](https://github.com/lotrekagency/mapo-new/commit/355955c9dd88eb40b0dc7774a51cf9392c415819))
- **uikit:** add slots to MapoLogin and MapoSidebar shell components ([e420712](https://github.com/lotrekagency/mapo-new/commit/e420712ad3af133c32752750511143552f4325c4))
- **uikit:** forward tab slots in MapoDetail; fix confirm/snack API ([8b48575](https://github.com/lotrekagency/mapo-new/commit/8b48575c0762ba36169ea90261f24ff2ccaf498e))
- **uikit:** implement offline and hybrid modes in MapoList components ([2f8e1e2](https://github.com/lotrekagency/mapo-new/commit/2f8e1e21448961f53cacbc4b821106f5220002d7))
- **uikit:** make ListColumn generic and improve cell slot typing ([3b30d96](https://github.com/lotrekagency/mapo-new/commit/3b30d9691e16f02e0011cdb7fc719e3f2ee1a8c8))
- **uikit:** make MapoList pagination configurable ([a17ae89](https://github.com/lotrekagency/mapo-new/commit/a17ae8973e21e4c8a61abb6c26f4f8889272dddc))
- **uikit:** permissions, URL sync, multipart, preview, lang auto-derive ([738e838](https://github.com/lotrekagency/mapo-new/commit/738e8388b35b2590ab0b8f7ec68b9f3b3b48c5be))
- **uikit:** register MapoList and MapoDetail components in module ([98a29fa](https://github.com/lotrekagency/mapo-new/commit/98a29fa60e8336a898ad4940e98c29d4fa7e4740))
- **uikit:** split sidebar danger zone into side-danger slot ([ee9aa57](https://github.com/lotrekagency/mapo-new/commit/ee9aa57e1fad8fa4e7accb022b97dfb0b67709e3))
- **uikit:** update global CSS for form engine ([9e0bcd1](https://github.com/lotrekagency/mapo-new/commit/9e0bcd16f3acaf328b4a812bec9645ee168430ce))
- **uikit:** update MapoDetail and MapoRootComponents ([9a63a7f](https://github.com/lotrekagency/mapo-new/commit/9a63a7f3aad17e4e9447ff4e9b01e1138a37e028))
- **uikit:** update UIKit components ([f23a3b4](https://github.com/lotrekagency/mapo-new/commit/f23a3b4d967ef34dfec8bfe437825853c5cf1b57))
- **uikit:** whole-row drag with visual feedback and v1 filter contract ([592c13a](https://github.com/lotrekagency/mapo-new/commit/592c13a6ea0733754892983039a74e0185459fff))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-beta.1
- **@mapomodule/store:** upgraded to 2.0.0-beta.1
- **@mapomodule/utils:** upgraded to 2.0.0-beta.1
- **@mapomodule/core:** upgraded to 2.0.0-beta.1

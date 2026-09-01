# @mapomodule/form [2.0.0-beta.9](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.8...@mapomodule/form@2.0.0-beta.9) (2026-09-01)

### Features

- added an experimental flat to produce the form directly from openapi schema in option call ([07fd8ca](https://github.com/lotrekagency/mapo-new/commit/07fd8cafdcda450c5c2c35cbccb0370de9801b0e))

### Dependencies

- **@mapomodule/utils:** upgraded to 2.0.0-beta.4

# @mapomodule/form [2.0.0-beta.8](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.7...@mapomodule/form@2.0.0-beta.8) (2026-08-27)

### Bug Fixes

- **release:** build packages from semantic-release prepare, not prepack ([e7f4327](https://github.com/lotrekagency/mapo-new/commit/e7f4327027ac4b4f1f430dfc35fb4669a7703c13))

### Dependencies

- **@mapomodule/i18n:** upgraded to 2.0.0-beta.2
- **@mapomodule/store:** upgraded to 2.0.0-beta.5

# @mapomodule/form [2.0.0-beta.7](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.6...@mapomodule/form@2.0.0-beta.7) (2026-08-27)

### Dependencies

- **@mapomodule/i18n:** upgraded to 2.0.0-beta.1

# @mapomodule/form [2.0.0-beta.6](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.5...@mapomodule/form@2.0.0-beta.6) (2026-08-27)

### Bug Fixes

- **uikit,form,utils:** resolve the router through Nuxt, not vue-router ([bf4aeb3](https://github.com/lotrekagency/mapo-new/commit/bf4aeb3d6fa4edad7b761cdb5f354152f74f603f))

### Dependencies

- **@mapomodule/utils:** upgraded to 2.0.0-beta.3

# @mapomodule/form [2.0.0-beta.5](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.4...@mapomodule/form@2.0.0-beta.5) (2026-07-23)

### Features

- **form:** add image insertion to WYG editor via media manager ([08a39fe](https://github.com/lotrekagency/mapo-new/commit/08a39fea5459da8eceed98b61aa2ac4965a3348d))
- **form:** add media field descriptor types ([49f87c8](https://github.com/lotrekagency/mapo-new/commit/49f87c80f2d077cceb3ca342186930c188d2536e))

### Dependencies

- **@mapomodule/utils:** upgraded to 2.0.0-beta.2

# @mapomodule/form [2.0.0-beta.4](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.3...@mapomodule/form@2.0.0-beta.4) (2026-07-16)

### Bug Fixes

- enable SSR transpilation and auto-import for Nuxt modules ([fe7da33](https://github.com/lotrekagency/mapo-new/commit/fe7da33e7795ca142dc13f791c8cd23f5c638490))

### Dependencies

- **@mapomodule/store:** upgraded to 2.0.0-beta.4

# @mapomodule/form [2.0.0-beta.3](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.2...@mapomodule/form@2.0.0-beta.3) (2026-07-16)

### Dependencies

- **@mapomodule/store:** upgraded to 2.0.0-beta.3

# @mapomodule/form [2.0.0-beta.2](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@2.0.0-beta.1...@mapomodule/form@2.0.0-beta.2) (2026-07-16)

### Bug Fixes

- update package.json scripts to use prepack and switch dependencies to workspace ([c7d3abc](https://github.com/lotrekagency/mapo-new/commit/c7d3abc3eca338e50d1af8f93a4a59065a548a8b))

### Dependencies

- **@mapomodule/store:** upgraded to 2.0.0-beta.2

# @mapomodule/form [2.0.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/form@1.0.0...@mapomodule/form@2.0.0-beta.1) (2026-07-07)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **build:** add build.config.ts, fix core module exports, update articles demo and migration guide ([84641fc](https://github.com/lotrekagency/mapo-new/commit/84641fc7026d19a0549fc8e6bd56ec580a2f2142))
- **form:** expose model and currentLang in field.\* slot bindings ([9d3f2b9](https://github.com/lotrekagency/mapo-new/commit/9d3f2b9f79d5ea96ae5fd9add2cff189e954fed4))
- **form:** normalize FksField endpoint and use $mapoFetch over raw $fetch ([7dcbbe3](https://github.com/lotrekagency/mapo-new/commit/7dcbbe3fba314661522d51d0966f59660ce85992))
- **form:** preserve repeater item UID on update to prevent dropdown remount ([5ab5890](https://github.com/lotrekagency/mapo-new/commit/5ab5890663e5f9042b27284e679bbb1c2ab3578c))
- **form:** sfc typing for generics, ambient shims and field types ([d11fe3c](https://github.com/lotrekagency/mapo-new/commit/d11fe3c7892e0de45ea2aaa8f9930a4702bb3c80))

### Features

- **core:** update crud with new useMapoFetch and enhance article form ([b0b4c40](https://github.com/lotrekagency/mapo-new/commit/b0b4c40d5fc19ed0fd8a9d3a4f8a54fae80633f6))
- **draft:** implement draft persistence for forms ([3e7c8b5](https://github.com/lotrekagency/mapo-new/commit/3e7c8b5d0491e05d9fd8ed7e9d13da87d0c68657))
- enhance form components with TypeScript improvements and formatting adjustments ([62b65dc](https://github.com/lotrekagency/mapo-new/commit/62b65dc43d9e89184119024e0f8df52093f04925))
- enhance repeater components with identity-based selection and improved UX ([203564e](https://github.com/lotrekagency/mapo-new/commit/203564e2ad6ce8088822cfbd0f7b86636f8cc17d))
- **example-e2e:** add e2e example application ([a93a152](https://github.com/lotrekagency/mapo-new/commit/a93a15234247458f62b2375deafc9a17697844e7))
- **form:** add core composables ([4a80b09](https://github.com/lotrekagency/mapo-new/commit/4a80b095c3267f16eeb30a20873202a28f6cb5a3))
- **form:** add core form components ([13dcf2d](https://github.com/lotrekagency/mapo-new/commit/13dcf2d02799007826594fe4a78d34e4e4c970c6))
- **form:** add devtools integration ([f031cc8](https://github.com/lotrekagency/mapo-new/commit/f031cc8bb8a43f1aa36f7cdc9e44ce20bce4500b))
- **form:** add extended field components ([66165aa](https://github.com/lotrekagency/mapo-new/commit/66165aa41f33604e24b1e7ebc32196f94a550fe9))
- **form:** add field.before/after and group.before/after granular slots ([ebce314](https://github.com/lotrekagency/mapo-new/commit/ebce31452fb4ec8c6b4963beb67e78844a85104c))
- **form:** add flattenFieldGroups utility for hierarchical field authoring ([1bf702f](https://github.com/lotrekagency/mapo-new/commit/1bf702fd19390f89f857f64a455dd6fb495f8942))
- **form:** add form registry and plugin ([24befb0](https://github.com/lotrekagency/mapo-new/commit/24befb020bf777b14711e66c54a38d4b802e858f))
- **form:** add form types ([0defaba](https://github.com/lotrekagency/mapo-new/commit/0defabaecac5287b4ef7821d649fcc44b9c5228f))
- **form:** add MapoFormFlatSection and enhance form components ([9b30bbf](https://github.com/lotrekagency/mapo-new/commit/9b30bbf1b2c49a9aa59e4ca744d2ffe8f9a2c05e))
- **form:** add NUI base field adapters ([cad4492](https://github.com/lotrekagency/mapo-new/commit/cad44921836f590ca5c72999b045fd471db124af))
- **form:** add Nuxt module definition ([e5706a5](https://github.com/lotrekagency/mapo-new/commit/e5706a51973f52b30b7a2d670514ac9f784265b3))
- **form:** add tab-level slots to MapoFormTabs ([5d9f560](https://github.com/lotrekagency/mapo-new/commit/5d9f560fe31b9791a58abe7ce35eb4f8fc7a7e26))
- **form:** adopt AnyFieldDescriptor and improve form typing/docs ([cf1ae4a](https://github.com/lotrekagency/mapo-new/commit/cf1ae4a0b41167de5075d28674841cae0361ad26))
- **form:** enhance draft functionality with snack notifications and improved state tracking ([dac45d5](https://github.com/lotrekagency/mapo-new/commit/dac45d52d14c9b92eac7c0f62abb7da8be405e05))
- **form:** enhance draft persistence with user-specific keys and localStorage cleanup ([420c294](https://github.com/lotrekagency/mapo-new/commit/420c29407e353738a9f4de264e8a3c0fe2930f11))
- **form:** enhance form components with draft persistence and validation registration ([e25e4ce](https://github.com/lotrekagency/mapo-new/commit/e25e4cea21f3332d9c1215215069a812489e8be2))
- **form:** enhance form components, composables and registry ([af0d178](https://github.com/lotrekagency/mapo-new/commit/af0d1782afdcb87e30298ef0a560bcb863db9ae3))
- **form:** enhance language support and improve slot handling in form components ([130c26c](https://github.com/lotrekagency/mapo-new/commit/130c26cc924a8922750abde52baab147398ec4d1))
- **form:** improve form components with enhanced comments, refactoring, and draft handling ([23c62ad](https://github.com/lotrekagency/mapo-new/commit/23c62ad9684bd61275925040db6123b9a1c47bb7))
- **form:** initialize form package ([ed9ab86](https://github.com/lotrekagency/mapo-new/commit/ed9ab8698d5bd1a35ab466118863474cbbd68859))
- **form:** repeater items reuse useMapoForm; add notifyErrors option ([eed1be9](https://github.com/lotrekagency/mapo-new/commit/eed1be98118f2ae6bd8f8fda1be1dc3e8f3923fc))
- **form:** support nested tabs (tab array/slash) and subtabs inside groups ([400e4c6](https://github.com/lotrekagency/mapo-new/commit/400e4c63d0ed76bf82841be4c79b9c5a14b14f33))
- **form:** update README and package.json ([3a72f1c](https://github.com/lotrekagency/mapo-new/commit/3a72f1cfd664facda78721339a29781966ac63fc))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

### Dependencies

- **@mapomodule/store:** upgraded to 2.0.0-beta.1
- **@mapomodule/utils:** upgraded to 2.0.0-beta.1

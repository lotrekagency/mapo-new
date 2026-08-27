# mapomodule [2.0.0-beta.10](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.9...mapomodule@2.0.0-beta.10) (2026-08-27)

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-beta.7
- **@mapomodule/i18n:** upgraded to 2.0.0-beta.1
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.9

# mapomodule [2.0.0-beta.9](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.8...mapomodule@2.0.0-beta.9) (2026-08-27)

### Features

- **mapomodule:** install the i18n module ([1bf5038](https://github.com/lotrekagency/mapo-new/commit/1bf5038f03fd67c0a6f605f6d82b72b31885f973))

### Dependencies

- **@mapomodule/core:** upgraded to 2.0.0-beta.6
- **@mapomodule/form:** upgraded to 2.0.0-beta.6
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.8
- **@mapomodule/utils:** upgraded to 2.0.0-beta.3

# mapomodule [2.0.0-beta.8](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.7...mapomodule@2.0.0-beta.8) (2026-07-28)

### Dependencies

- **@mapomodule/uikit:** upgraded to 2.0.0-beta.7

# mapomodule [2.0.0-beta.7](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.6...mapomodule@2.0.0-beta.7) (2026-07-28)

### Dependencies

- **@mapomodule/uikit:** upgraded to 2.0.0-beta.6

# mapomodule [2.0.0-beta.6](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.5...mapomodule@2.0.0-beta.6) (2026-07-23)

### Dependencies

- **@mapomodule/core:** upgraded to 2.0.0-beta.5
- **@mapomodule/form:** upgraded to 2.0.0-beta.5
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.5
- **@mapomodule/utils:** upgraded to 2.0.0-beta.2

# mapomodule [2.0.0-beta.5](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.4...mapomodule@2.0.0-beta.5) (2026-07-16)

### Dependencies

- **@mapomodule/core:** upgraded to 2.0.0-beta.4
- **@mapomodule/form:** upgraded to 2.0.0-beta.4
- **@mapomodule/store:** upgraded to 2.0.0-beta.4
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.4

# mapomodule [2.0.0-beta.4](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.3...mapomodule@2.0.0-beta.4) (2026-07-16)

### Dependencies

- **@mapomodule/core:** upgraded to 2.0.0-beta.3
- **@mapomodule/form:** upgraded to 2.0.0-beta.3
- **@mapomodule/store:** upgraded to 2.0.0-beta.3
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.3

# mapomodule [2.0.0-beta.3](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.2...mapomodule@2.0.0-beta.3) (2026-07-16)

### Bug Fixes

- update package.json scripts to use prepack and switch dependencies to workspace ([c7d3abc](https://github.com/lotrekagency/mapo-new/commit/c7d3abc3eca338e50d1af8f93a4a59065a548a8b))

### Dependencies

- **@mapomodule/core:** upgraded to 2.0.0-beta.2
- **@mapomodule/form:** upgraded to 2.0.0-beta.2
- **@mapomodule/store:** upgraded to 2.0.0-beta.2
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.2

# mapomodule [2.0.0-beta.2](https://github.com/lotrekagency/mapo-new/compare/mapomodule@2.0.0-beta.1...mapomodule@2.0.0-beta.2) (2026-07-07)

### Bug Fixes

- **mapomodule:** remove commented-out i18n module installation ([1880d0c](https://github.com/lotrekagency/mapo-new/commit/1880d0c3913aecd51e0b721ecfdda5355568eb7b))

# mapomodule [2.0.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/mapomodule@1.0.0...mapomodule@2.0.0-beta.1) (2026-07-07)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **build:** add build.config.ts, fix core module exports, update articles demo and migration guide ([84641fc](https://github.com/lotrekagency/mapo-new/commit/84641fc7026d19a0549fc8e6bd56ec580a2f2142))
- **lint,typecheck:** resolve ESLint and TypeScript errors across packages ([87f44a2](https://github.com/lotrekagency/mapo-new/commit/87f44a2f6621e56218d2babef302f7b845cd148c))
- **mapomodule:** resolve sub-modules via createResolver for pnpm strict mode ([c5a08bc](https://github.com/lotrekagency/mapo-new/commit/c5a08bcd70d74df2d0c2bf31369d5a45a51ed257))
- **packages:** add prepare script to stub dist before postinstall ([4d10fee](https://github.com/lotrekagency/mapo-new/commit/4d10feeb918d9ea7f0c328bb2a200197739881cb))

### Features

- **core:** type runtime config and forward only core options ([7249fd7](https://github.com/lotrekagency/mapo-new/commit/7249fd7383157aa22b551aef443f67cd8391ce14))
- enhance form components with TypeScript improvements and formatting adjustments ([62b65dc](https://github.com/lotrekagency/mapo-new/commit/62b65dc43d9e89184119024e0f8df52093f04925))
- **exports:** add ./types subpath to all packages and create mapomodule aggregator ([a59be8a](https://github.com/lotrekagency/mapo-new/commit/a59be8aebc13b785936e862c59080b6caad99271))
- **form:** update README and package.json ([3a72f1c](https://github.com/lotrekagency/mapo-new/commit/3a72f1cfd664facda78721339a29781966ac63fc))
- **module:** re-export utilities from @mapo/utils in index.ts ([6bd5ee8](https://github.com/lotrekagency/mapo-new/commit/6bd5ee834ae64fcf5e8bb9280a7d9f9ec00b89b3))
- scaffold @mapo/\* packages and mapomodule workspace structure ([e59764a](https://github.com/lotrekagency/mapo-new/commit/e59764ac5c80e9af4f2ad718df31907fdf8c8a39))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

### Dependencies

- **@mapomodule/core:** upgraded to 2.0.0-beta.1
- **@mapomodule/form:** upgraded to 2.0.0-beta.1
- **@mapomodule/store:** upgraded to 2.0.0-beta.1
- **@mapomodule/uikit:** upgraded to 2.0.0-beta.1
- **@mapomodule/utils:** upgraded to 2.0.0-beta.1

# @mapomodule/store [2.0.0-beta.6](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/store@2.0.0-beta.5...@mapomodule/store@2.0.0-beta.6) (2026-09-01)

### Bug Fixes

- fix auth permission on user model ([54b1d03](https://github.com/lotrekagency/mapo-new/commit/54b1d036ddd32b0d94ab4d37452300f4786cddfd))

# @mapomodule/store [2.0.0-beta.5](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/store@2.0.0-beta.4...@mapomodule/store@2.0.0-beta.5) (2026-08-27)

### Bug Fixes

- **release:** build packages from semantic-release prepare, not prepack ([e7f4327](https://github.com/lotrekagency/mapo-new/commit/e7f4327027ac4b4f1f430dfc35fb4669a7703c13))

# @mapomodule/store [2.0.0-beta.4](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/store@2.0.0-beta.3...@mapomodule/store@2.0.0-beta.4) (2026-07-16)

### Bug Fixes

- enable SSR transpilation and auto-import for Nuxt modules ([fe7da33](https://github.com/lotrekagency/mapo-new/commit/fe7da33e7795ca142dc13f791c8cd23f5c638490))

# @mapomodule/store [2.0.0-beta.3](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/store@2.0.0-beta.2...@mapomodule/store@2.0.0-beta.3) (2026-07-16)

### Bug Fixes

- update dependencies and improve module resolution for Pinia and TailwindCSS ([2c18c13](https://github.com/lotrekagency/mapo-new/commit/2c18c13161faf0c9986a2fe896cbe0ad3843461b))

# @mapomodule/store [2.0.0-beta.2](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/store@2.0.0-beta.1...@mapomodule/store@2.0.0-beta.2) (2026-07-16)

### Bug Fixes

- update package.json scripts to use prepack and switch dependencies to workspace ([c7d3abc](https://github.com/lotrekagency/mapo-new/commit/c7d3abc3eca338e50d1af8f93a4a59065a548a8b))

# @mapomodule/store [2.0.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/store@1.0.0...@mapomodule/store@2.0.0-beta.1) (2026-07-07)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **build:** add build.config.ts, fix core module exports, update articles demo and migration guide ([84641fc](https://github.com/lotrekagency/mapo-new/commit/84641fc7026d19a0549fc8e6bd56ec580a2f2142))
- **core:** remove dead Nitro config plugin and sidebar.clipped ([6346abe](https://github.com/lotrekagency/mapo-new/commit/6346abe1577b0b08eac616b3d51e091ffa34cd3a))
- **packages:** add prepare script to stub dist before postinstall ([4d10fee](https://github.com/lotrekagency/mapo-new/commit/4d10feeb918d9ea7f0c328bb2a200197739881cb))
- **store:** resolve cross-package types in runtime exports ([883a611](https://github.com/lotrekagency/mapo-new/commit/883a611270e1a9b62b7a48b08d9bac1d05d274a7))
- **store:** resolve pending confirm promise on concurrent ask() ([5aabe1e](https://github.com/lotrekagency/mapo-new/commit/5aabe1e4d24d584a9b81a3b81d7398b4b2d0b51f))

### Features

- **@mapomodule/store:** implement pinia stores as nuxt module ([0958962](https://github.com/lotrekagency/mapo-new/commit/09589629b5acf0ac84cf160e5c1ccee36b1b20e5))
- **exports:** add ./types subpath to all packages and create mapomodule aggregator ([a59be8a](https://github.com/lotrekagency/mapo-new/commit/a59be8aebc13b785936e862c59080b6caad99271))
- **module:** update module installation to resolve path dynamically ([3822ead](https://github.com/lotrekagency/mapo-new/commit/3822eadb88eea26007e9342d65621db839864d2a))
- **store:** enhance snack store ([b5a3550](https://github.com/lotrekagency/mapo-new/commit/b5a3550af1ce61aabd75a3457616bb938232eee2))
- **store:** update type imports and enhance module exports for better type resolution ([dddcdc8](https://github.com/lotrekagency/mapo-new/commit/dddcdc839ccb4b03dd6a77b67d09d491f020fcd3))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

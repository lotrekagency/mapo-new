# @mapomodule/core [2.0.0-beta.2](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/core@2.0.0-beta.1...@mapomodule/core@2.0.0-beta.2) (2026-07-16)

### Bug Fixes

- update package.json scripts to use prepack and switch dependencies to workspace ([c7d3abc](https://github.com/lotrekagency/mapo-new/commit/c7d3abc3eca338e50d1af8f93a4a59065a548a8b))

### Dependencies

- **@mapomodule/store:** upgraded to 2.0.0-beta.2

# @mapomodule/core [2.0.0-beta.1](https://github.com/lotrekagency/mapo-new/compare/@mapomodule/core@1.0.0...@mapomodule/core@2.0.0-beta.1) (2026-07-07)

- feat(release)!: prepare for first 2.0.0.beta release \ BREAKING CHANGE: this is a completely rewritten version of mapo ([d906c8d](https://github.com/lotrekagency/mapo-new/commit/d906c8da8675bef2505ead5f744fd72fbf5acab2))

### Bug Fixes

- **build:** add build.config.ts, fix core module exports, update articles demo and migration guide ([84641fc](https://github.com/lotrekagency/mapo-new/commit/84641fc7026d19a0549fc8e6bd56ec580a2f2142))
- **build:** move constants into runtime and remove cross-boundary imports ([be56ee4](https://github.com/lotrekagency/mapo-new/commit/be56ee4e2021dc7f8ffb1688795b3b2874f2e1c1))
- **core:** add vue-router as devDependency and update lockfile ([b0e8ca0](https://github.com/lotrekagency/mapo-new/commit/b0e8ca0179336b3b33571b3a357a284dba83d289))
- **core:** decrement fetch pending counter once per request, add onRequestError ([21528ff](https://github.com/lotrekagency/mapo-new/commit/21528ff4ab201bd24790e0f6b984c66103d6906c))
- **core:** resolve cross-package types and harden route-meta access ([748704b](https://github.com/lotrekagency/mapo-new/commit/748704b5a5186415e59ea19ea5c5bac6dc684893))
- **lint,typecheck:** resolve ESLint and TypeScript errors across packages ([87f44a2](https://github.com/lotrekagency/mapo-new/commit/87f44a2f6621e56218d2babef302f7b845cd148c))
- **packages:** add prepare script to stub dist before postinstall ([4d10fee](https://github.com/lotrekagency/mapo-new/commit/4d10feeb918d9ea7f0c328bb2a200197739881cb))
- **typecheck:** resolve TS errors in core middleware, uikit module, and utils tsconfig ([7c51dcb](https://github.com/lotrekagency/mapo-new/commit/7c51dcba0065f90e7fee2fc9c21d8890e5ae3325))

### Features

- **@mapomodule/core:** implement service layer as Nuxt module ([216308b](https://github.com/lotrekagency/mapo-new/commit/216308b09c85f5d9b7471a4d62c13f34272d56ce))
- **core:** add centralized loading state to useMapoFetch ([7a23c1c](https://github.com/lotrekagency/mapo-new/commit/7a23c1c40d083b0202bd12c1940332cca1d28b39))
- **core:** add permissions/roles middleware and useCanAccessRoute composable ([58573de](https://github.com/lotrekagency/mapo-new/commit/58573dead821d324b49344ebcfd1a8bdd150d262))
- **core:** auto-import useMapoFetch and add to public exports ([75bc86e](https://github.com/lotrekagency/mapo-new/commit/75bc86e4afe06041be2e566314a7bb128add02f0))
- **core:** type runtime config and forward only core options ([7249fd7](https://github.com/lotrekagency/mapo-new/commit/7249fd7383157aa22b551aef443f67cd8391ce14))
- **core:** update crud with new useMapoFetch and enhance article form ([b0b4c40](https://github.com/lotrekagency/mapo-new/commit/b0b4c40d5fc19ed0fd8a9d3a4f8a54fae80633f6))
- **core:** update package.json to include types and default exports for runtime ([12adcbd](https://github.com/lotrekagency/mapo-new/commit/12adcbd97ab520d2cff135ee36890b1325e89058))
- **exports:** add ./types subpath to all packages and create mapomodule aggregator ([a59be8a](https://github.com/lotrekagency/mapo-new/commit/a59be8aebc13b785936e862c59080b6caad99271))
- **form:** enhance draft persistence with user-specific keys and localStorage cleanup ([420c294](https://github.com/lotrekagency/mapo-new/commit/420c29407e353738a9f4de264e8a3c0fe2930f11))
- **store:** update type imports and enhance module exports for better type resolution ([dddcdc8](https://github.com/lotrekagency/mapo-new/commit/dddcdc839ccb4b03dd6a77b67d09d491f020fcd3))

### BREAKING CHANGES

- this is a completely rewritten version of mapo

### Dependencies

- **@mapomodule/store:** upgraded to 2.0.0-beta.1
- **@mapomodule/utils:** upgraded to 2.0.0-beta.1

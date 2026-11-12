# @mapomodule/ai 1.0.0-experimental.1 (2026-11-12)

### Bug Fixes

- **ai:** ask Anthropic again with the schema in the prompt when it cannot compile it ([d04569c](https://github.com/lotrekagency/mapo-new/commit/d04569c4aeb5229464922145e8fd75ad836255ca))
- **ai:** count a synci18n field as empty only when every language is ([d180a8d](https://github.com/lotrekagency/mapo-new/commit/d180a8ddf3db0b8242ecd9977b8ad9b9d80242de))
- **ai:** count each record a list holds once, and start Next to check again after a new answer ([6e0749b](https://github.com/lotrekagency/mapo-new/commit/6e0749b1fdc31277c3d04064abaf16781a951aad))
- **ai:** keep fields named as tokens, secrets or API keys away from the AI ([cd5cc76](https://github.com/lotrekagency/mapo-new/commit/cd5cc762ad48179195590c5cc212ee8da1fc314f))
- **ai:** let a value wait when another field's onChange filled its field first ([15ccb10](https://github.com/lotrekagency/mapo-new/commit/15ccb1089d82ff22411f8bb1e0ac1e15383efde6))
- **ai:** read the status of the AI settings page as outside data ([6235751](https://github.com/lotrekagency/mapo-new/commit/623575107c7732d911c513bae66910b213d53e5a))
- **ai:** run a field's pattern only when its work has a bound ([481a3c3](https://github.com/lotrekagency/mapo-new/commit/481a3c3d85764c9ef9564664f3b73d9b4e97ca98))
- **ai:** verify a number only when its quote writes no other number ([32d8ebd](https://github.com/lotrekagency/mapo-new/commit/32d8ebd21dba872e7780b9d7faecfdc2646fd1fb))
- **ai:** verify dates, one-word values and rich text against their quotes ([6938c43](https://github.com/lotrekagency/mapo-new/commit/6938c4385b789a047e90f858cfa8e3f48dc5559b))

### Features

- **ai:** add the @mapomodule/ai package skeleton ([e5e4d5c](https://github.com/lotrekagency/mapo-new/commit/e5e4d5c4bceb9e7483314457d77adc9e6d1dd477))
- **ai:** add the AI settings page, with the user's preference and the check of a connection ([6aae15b](https://github.com/lotrekagency/mapo-new/commit/6aae15ba94b501da80c6d65252cc99975d518e68))
- **ai:** add the gateway's run route, with providers, a mock, layered prompts, limits and an audit ([c1e4470](https://github.com/lotrekagency/mapo-new/commit/c1e447006917c385c04279cb9bf02a7bad945f7b))
- **ai:** add the Ollama and OpenAI-compatible providers, for models on the app's own servers ([df16dc9](https://github.com/lotrekagency/mapo-new/commit/df16dc915958e083cac37f943c96c961f196ca7f))
- **ai:** add the OpenAI and Anthropic providers ([050514d](https://github.com/lotrekagency/mapo-new/commit/050514d22572dcfdeabb31c869a73e53f78d7ee5))
- **ai:** choose the items of a list, added after the record's own ([a0ab483](https://github.com/lotrekagency/mapo-new/commit/a0ab48321f8484608caf28ca3c6e03e3a5b70a24))
- **ai:** compile entity models into fill and extract contracts ([6304d36](https://github.com/lotrekagency/mapo-new/commit/6304d36a50eb49c3a4c9f6009c372534050ca7c6))
- **ai:** describe what the AI may fill in a record ([0c75569](https://github.com/lotrekagency/mapo-new/commit/0c755695ccffda5c751436fc0e29e4421e3f9ddf))
- **ai:** fill a detail form through the gateway with useMapoAiFill ([2f0a9de](https://github.com/lotrekagency/mapo-new/commit/2f0a9de047b801a84855faf026d4f74246da28e4))
- **ai:** fill every detail form from a text or files with Magic Fill ([3add53e](https://github.com/lotrekagency/mapo-new/commit/3add53e10627ed7e742372c70bb082adf09777ec))
- **ai:** keep Magic Fill's session in the detail's draft ([52ffa76](https://github.com/lotrekagency/mapo-new/commit/52ffa76cf8bdb4d967ed13e66dce332f33bd3d0a))
- **ai:** keep the module state encrypted in Nitro storage ([46f48ac](https://github.com/lotrekagency/mapo-new/commit/46f48acaab47a5c4ee6456d4b1fc6f152bd319ef))
- **ai:** let a field's descriptor guide the AI and keep a relation's records from it ([fe3a9dd](https://github.com/lotrekagency/mapo-new/commit/fe3a9dda89e8615786440caac5214b9b68c4a5d0))
- **ai:** let an override of a Magic Fill part say which part it is ([4963fe0](https://github.com/lotrekagency/mapo-new/commit/4963fe00b2e2b97ea4903babff17504e5d68d9f4))
- **ai:** let the AI's admins change how the AI works, within what the app allows ([5fc38d6](https://github.com/lotrekagency/mapo-new/commit/5fc38d645aa98e58a1c46048c24896bddd9239c5))
- **ai:** preview run, stop the provider when page goes away ([9b0ae68](https://github.com/lotrekagency/mapo-new/commit/9b0ae68ba85e823f7fcd91bff1c727a48c40408c))
- **ai:** read and verify nested values: repeaters, objects, SEO blocks and map points ([b35187c](https://github.com/lotrekagency/mapo-new/commit/b35187c77ef145da704c9419edbcbdf3aec152e7))
- **ai:** read text, web pages and spreadsheets into the AI's source ([7216fc6](https://github.com/lotrekagency/mapo-new/commit/7216fc61d3c5e1eed07409a9f509894711e2b6b8))
- **ai:** resolve provider keys from user, admin and project levels ([03bb4d5](https://github.com/lotrekagency/mapo-new/commit/03bb4d5a49d230b67d3e3a90849ae2a6d6d53e88))
- **ai:** resolve relations and show where each value comes from ([c78ed2b](https://github.com/lotrekagency/mapo-new/commit/c78ed2bcfc054797cf0c8ddc90f5959db7d0c7dd))
- **ai:** sanitize the AI's answers and verify their quotes ([83fe02e](https://github.com/lotrekagency/mapo-new/commit/83fe02ed6b0f2bc4eda9b06961474fe9380a9570))
- **ai:** show the AI's usage and the changes of keys and settings, read from the audit ([1d680d1](https://github.com/lotrekagency/mapo-new/commit/1d680d1e82a331fbc677a182414e320eeb9bf8af))
- **ai:** take the operator to each value to check, and say why a call to the AI is refused ([eab0f1c](https://github.com/lotrekagency/mapo-new/commit/eab0f1ce5a8a5fc7ce4447396a24f60d08d384e5))
- **example-ai:** add an app that turns on the AI module as a project does ([b69f625](https://github.com/lotrekagency/mapo-new/commit/b69f625b10be816186818f802dcfb9041e13204a))
- **mcp:** guide the setup of the AI module and Magic Fill ([331d4e2](https://github.com/lotrekagency/mapo-new/commit/331d4e241fd1a78d4c2394a4b0c339d3588b7c83))

### Dependencies

- **@mapomodule/form:** upgraded to 2.0.0-experimental.1
- **@mapomodule/utils:** upgraded to 2.0.0-experimental.1

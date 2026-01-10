# Changelog

## [1.2.0](https://github.com/raniellimontagna/klick/compare/v1.1.0...v1.2.0) (2026-01-10)


### Features

* adds multi-puzzle support and cube visualization ([5bdbe75](https://github.com/raniellimontagna/klick/commit/5bdbe754b880121c7524842bc38d1aa728d47d09))
* applies glassmorphism UI theme and refines styles ([1474d80](https://github.com/raniellimontagna/klick/commit/1474d8045f8f731a6b08dce9238e544a5fdf9952))
* enhance average calculation to handle legacy solves and improve effective time resolution ([2667d3e](https://github.com/raniellimontagna/klick/commit/2667d3eac5eb510ac6d8d35e2f079db6ee63ef2e))
* enhances UI with new dark theme, timer feedback, and 3D visualizer ([0575104](https://github.com/raniellimontagna/klick/commit/0575104091f8417f7d68260e4e3142098bccc681))
* integrates Radix UI DropdownMenu component ([83e915e](https://github.com/raniellimontagna/klick/commit/83e915e58179ca28edc921ea8102df3bc3fac27f))


### Performance Improvements

* implement route-based code splitting and optimize bundle size ([aa534bf](https://github.com/raniellimontagna/klick/commit/aa534bffeea7ddd52c439ae8261ade93aa2deddc))

## [1.1.0](https://github.com/RanielliMontagna/klick/compare/v1.0.0...v1.1.0) (2025-10-29)


### Features

* add reusable Card component and refactor UI to utilize it across various pages ([eeb0377](https://github.com/RanielliMontagna/klick/commit/eeb037716d964c66419df44ac31ea678f8406d6c))
* add TrainingPage and related components for training functionality ([a05a687](https://github.com/RanielliMontagna/klick/commit/a05a68774a2c59922e7d2ca9349eb1e948ad711c))
* refactor component imports and add new UI components ([d853b7e](https://github.com/RanielliMontagna/klick/commit/d853b7e47c8fd748df2afe5ce1f6fe750a7710f1))


### Bug Fixes

* correct favicon path and update theme button styles ([b2f7d46](https://github.com/RanielliMontagna/klick/commit/b2f7d46788e9d7cee7e541d295a612f9b0513cc3))
* enhance validity checks for average TPS calculation ([740dad7](https://github.com/RanielliMontagna/klick/commit/740dad74caf86ddec83df782cf42770d458ce10d))
* update descriptions for consistency and performance metrics in localization files ([c18c482](https://github.com/RanielliMontagna/klick/commit/c18c48274839d4a75096fb94bd5eb3a5443e6ff6))
* update TutorialTranslation type and refactor tutorial visualization config for improved type safety ([f3886ad](https://github.com/RanielliMontagna/klick/commit/f3886ad95f520b65ff39f3378afe0a4a6d960c1f))

## 1.0.0 (2025-10-29)


### Features

* add advanced statistics modal with charts for evolution, consistency, and performance ([a8802a1](https://github.com/RanielliMontagna/klick/commit/a8802a1e38e22fc8af2cc6083b521539881996c4))
* add button types for accessibility in modals and tables ([0faa97b](https://github.com/RanielliMontagna/klick/commit/0faa97bfcbacf1c7ecb8da447e8c725581d9215b))
* add confirmation dialog and educational modal for statistics; implement clear session functionality ([f0cd284](https://github.com/RanielliMontagna/klick/commit/f0cd28414fcc39fcd3268758df845da684251e54))
* add internationalization support and enhance UI components ([846e756](https://github.com/RanielliMontagna/klick/commit/846e7563c5913820b1b4c1960d6b4d84cf885e6d))
* add language selection feature; implement LanguageSelector component and localization support for English, Spanish, and Portuguese ([56b8669](https://github.com/RanielliMontagna/klick/commit/56b86692d386134e73c24bfeb79c31d40bcb5da5))
* add navigation link to logo in MainLayout ([3431ba2](https://github.com/RanielliMontagna/klick/commit/3431ba2f52eaba63af92937bb12692397b6a8f10))
* add PageHeader component and integrate it across multiple pages with localized descriptions ([c661bf9](https://github.com/RanielliMontagna/klick/commit/c661bf994dad37c6d6825475f2f7b00c80b083cb))
* add PWA support with service worker and update prompt ([c5e4734](https://github.com/RanielliMontagna/klick/commit/c5e473482a4f814fae9ca5f84ff5408b4c8c80d6))
* add scramble guide modal; implement visual guide for interpreting scrambles and integrate with ScrambleBox ([04f78e8](https://github.com/RanielliMontagna/klick/commit/04f78e8d10f521b88c2096475de43c8fa834c221))
* add settings button to header; improve layout and accessibility of language selector and session switcher components ([aa42883](https://github.com/RanielliMontagna/klick/commit/aa428838f2dbd224e1921df145fdcdd877aa6fc2))
* add SolveTable and SolveDetailsModal components; implement history table with filters and delete functionality ([23fd311](https://github.com/RanielliMontagna/klick/commit/23fd311ad01c5352a88bc24991e2a7ffc8f8db23))
* enhance accessibility; add focus styles to buttons and text elements for improved keyboard navigation ([704b9d8](https://github.com/RanielliMontagna/klick/commit/704b9d82d39bfa382495d546489cdcc141397450))
* enhance HeaderDropdownMenu and LanguageSelector styles, add SessionManagerModal to MainLayout ([7772cc0](https://github.com/RanielliMontagna/klick/commit/7772cc0eb083ae9c22ad6735f40488869d80d6b7))
* enhance HistoryPage with solve details modal and view details functionality ([1f2508f](https://github.com/RanielliMontagna/klick/commit/1f2508f1608994514e40c256e6ce95155a576ff4))
* enhance keyboard shortcuts for session management; improve state handling in useTimer ([0093bb3](https://github.com/RanielliMontagna/klick/commit/0093bb340a44bf23d98e5de4886f20ec457e2c57))
* enhance UI components; update header styles and improve language selector layout with short labels ([7be4244](https://github.com/RanielliMontagna/klick/commit/7be4244c900bb3755321128e90b91aaad7db2bc8))
* enhance UI with Framer Motion animations ([a8a6e82](https://github.com/RanielliMontagna/klick/commit/a8a6e82c387e74a096586ce4207b48b0af601abd))
* implement header dropdown components; add HeaderDropdownButton and HeaderDropdownMenu for improved UI interactions ([152f857](https://github.com/RanielliMontagna/klick/commit/152f857f4473b517eb3466bd38977a7e84055c35))
* implement interactive onboarding system with 7 steps ([1cb1110](https://github.com/RanielliMontagna/klick/commit/1cb1110909d41be34f62c3bb980f7ad09ec476a3))
* implement onboarding data attributes and enhance PWA update prompts with internationalization ([fcca09c](https://github.com/RanielliMontagna/klick/commit/fcca09c5c8d290aa219210498c5efe39cdc59fda))
* implement routes and new structure ([e8ac00f](https://github.com/RanielliMontagna/klick/commit/e8ac00fc705d19ba260df771ac03b7e09b4779b1))
* implement session management system; add SessionSwitcher and SessionManagerModal components with session creation, renaming, and deletion functionality ([d9f3f58](https://github.com/RanielliMontagna/klick/commit/d9f3f58dfcf26c46c88eff6452a6c061157189fd))
* implement settings modal; add export/import functionality and localization support for settings ([00ab13b](https://github.com/RanielliMontagna/klick/commit/00ab13bd007bbaeb9f4c0700949b24229ab50a52))
* implement sound system; add audio feedback for timer events and integrate with settings ([7a76fc6](https://github.com/RanielliMontagna/klick/commit/7a76fc68b24c23097499d404297886e722d80761))
* implement statistics calculations and display; add tests for averages ([1b1c48d](https://github.com/RanielliMontagna/klick/commit/1b1c48d5870219643ff619ea571fa744b581c835))
* implement theme toggle; add light and dark theme support with user settings integration ([87b5d87](https://github.com/RanielliMontagna/klick/commit/87b5d878092eb27176326ad3ca7a82fcdded0ee4))
* integrate PWA support; register service worker and configure caching strategies ([8f5494b](https://github.com/RanielliMontagna/klick/commit/8f5494bedbfb87215e1a79547a3a398dd7800c87))
* migrates all buttons to reusable UI component ([ffb6134](https://github.com/RanielliMontagna/klick/commit/ffb6134fba381bf5dd948bf81877077ee513ccdc))
* refactor styles; remove App.css and integrate styles into index.css ([daba605](https://github.com/RanielliMontagna/klick/commit/daba605c1356270473a5a5d86de8c0fb9d139663))
* **tutorial:** implement beginner's tutorial modal with step-by-step guidance ([3bad9ac](https://github.com/RanielliMontagna/klick/commit/3bad9acbd85c553bb86a0f59261b066c67636363))
* update documentation and improve code comments; refactor timer logic and enhance scramble generation tests ([2939d2a](https://github.com/RanielliMontagna/klick/commit/2939d2afad996a6cdf947541d9b63e983f96f947))
* update logo implementation and replace icon; remove unused assets ([f55bdf9](https://github.com/RanielliMontagna/klick/commit/f55bdf978e9c2a19e671c9c88b72d3707b35a47b))
* upgrade tailwind to v4 ([95ed8d4](https://github.com/RanielliMontagna/klick/commit/95ed8d42dbbd6cfa9848db670b4689db7c0393c2))


### Bug Fixes

* update penalty condition to allow positive overtime only ([54dee77](https://github.com/RanielliMontagna/klick/commit/54dee777d65ae361f0b7bf7911043ffbf1af7ee7))

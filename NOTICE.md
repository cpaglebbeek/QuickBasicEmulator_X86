# NOTICE — QuickBasicEmulator_X86

## Vendored as submodule: QB64-Phoenix-Edition/QB64pe

Deze repository bevat een git-submodule fork van [QB64-Phoenix-Edition/QB64pe](https://github.com/QB64-Phoenix-Edition/QB64pe) in `vendor/qb64pe/`.

| Veld | Waarde |
|---|---|
| Upstream | https://github.com/QB64-Phoenix-Edition/QB64pe |
| Imported commit | `722b7d99a75d2c0f8965a91c18c40648ac2643e7` |
| Imported commit-date | 2026-05-31 |
| Imported commit-message | `Automatic update of ./internal/source` |
| Import datum | 2026-06-01 |
| Submodule pattern | Git submodule (geen volledig kopie, ~294MB working-tree) |
| Doorgifte-licentie | AGPL-3.0-or-later (`LICENSE` in root) |

### License-compatibiliteit

QB64-PE zelf (libqb, the core runtime) is **MIT** licensed. Zie `vendor/qb64pe/licenses/README.md` voor het volledige register van third-party bibliotheken (meestal MIT/Public Domain/BSD; enkele LGPL die alleen pulled-in worden als specifieke features gebruikt).

MIT → AGPL-3.0 is een toegestane re-license-richting (MIT is permissive). De originele MIT-tekst blijft behouden in `vendor/qb64pe/licenses/license_qb64.txt` zodat upstream-copyright en MIT-warranty-disclaim eveneens behouden blijven.

**LGPL-components** (libstdc++ on Windows, etc.) zijn optioneel en worden alleen statisch ge-linkt als de QB-source ze gebruikt. Voor K2026C-stijl programma's (PRINT/INPUT/loops/arrays) zijn alleen libqb (MIT) + FreeGLUT (MIT) + miniaudio (MIT, alleen bij sound) nodig — allemaal MIT.

### Patches & wijzigingen

Onze wijzigingen op de vendored code:
- **Geen directe modificaties** aan `vendor/qb64pe/` (submodule-discipline)
- Onze CMake-/build-wrapper leeft in root + `src/`
- Dialect-flag implementatie (`--dialect=gw|qbasic|qb45`) via wrapper-CLI, niet via QB64-PE-patch
- Bij toekomstige wijzigingen: documenteer in `patches/README.md` met patch-intent en upstream-link

### Updates uit upstream

Voor upstream-sync:
1. `cd vendor/qb64pe && git pull origin main`
2. Update commit-hash + datum in deze NOTICE.md
3. `cd ..` en `git add vendor/qb64pe NOTICE.md`
4. Test build + run K2026C regression
5. Commit + push

### Build-vereisten (macOS)

- macOS Catalina+ (per QB64-PE README)
- Xcode Command Line Tools (`xcode-select --install`)
- `./vendor/qb64pe/setup_osx.command` voor eerste setup

## Spec-referenties (geen verbatim code-port)

- [`microsoft/GW-BASIC`](https://github.com/microsoft/GW-BASIC) (MIT) — gebruikt als spec-referentie voor onze GW-BASIC dialect-mode (vanaf v0.3.0 een command-line flag op QB64-PE). Geen verbatim assembly→C++ port.

## Andere afhankelijkheden

Zie `Meta_QuickBasicEmulator/docs/DEPENDENCIES.md` voor het volledige register.

## Vragen / IP-issues

Issue openen op [cpaglebbeek/Meta_QuickBasicEmulator](https://github.com/cpaglebbeek/Meta_QuickBasicEmulator/issues).

# QuickBasicEmulator_X86

Native runtime voor Windows/Linux/macOS. Compileert `.bas` (GW-BASIC, QBasic, QuickBASIC 4.5) naar native binaries.

> ⚠️ **v0.0.1-Gates — Skeleton.** Geen QB64-PE-fork in deze versie. Fork-import gepland voor v0.3.0-Chen. Zie [ROADMAP](https://github.com/cpaglebbeek/Meta_QuickBasicEmulator/blob/main/ROADMAP.md).

## Tech

- **C++17** + **CMake**
- Vanaf v0.3.0: vendored fork van [QB64-Phoenix-Edition/QB64pe](https://github.com/QB64-Phoenix-Edition/QB64pe) (MIT → AGPL-3.0 doorgifte)
- Dialect-flag: `--dialect=gw|qbasic|qb45`
- Consumeert `QuickBasicEmulator_Core` dialect-spec via vendored JSON

## Build

```bash
mkdir build && cd build
cmake ..
cmake --build .
```

## Project + ecosystem

- **Meta:** [`cpaglebbeek/Meta_QuickBasicEmulator`](https://github.com/cpaglebbeek/Meta_QuickBasicEmulator)
- **Ecosystem:** Retro_Computing
- **Licentie:** AGPL-3.0

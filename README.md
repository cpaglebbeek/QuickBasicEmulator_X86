# QuickBasicEmulator_X86

Native runtime voor Windows/Linux/macOS. Compileert `.bas` (GW-BASIC, QBasic, QuickBASIC 4.5) naar native binaries via vendored QB64-PE.

> 🟡 **v0.3.0-Chen — Submodule + wrapper skeleton.** QB64-PE fork toegevoegd als git submodule (commit `722b7d99`, MIT). Wrapper CLI gebouwd. **Eerste setup vereist** — zie hieronder.

## Tech

- **C++17** + **CMake** (wrapper CLI)
- **QB64-PE** (MIT → AGPL-3.0 doorgifte) als git submodule in `vendor/qb64pe/`
- Dialect-flag: `--dialect=gw|qbasic|qb45` (v0.3.0: alleen geaccepteerd, v0.3.1+: dialect-rewrite)
- Consumeert `QuickBasicEmulator_Core` dialect-spec via vendored JSON

## Build (eerste keer)

```bash
# 1. Submodule ophalen (als nog niet gedaan)
git submodule update --init --recursive

# 2. QB64-PE setup (macOS) — downloadt benodigde toolchain (~paar minuten)
cd vendor/qb64pe
./setup_osx.command

# 3. Build wrapper
cd ../..
cmake -B build -S .
cmake --build build

# 4. Run
./build/qbe_x86 --dialect=qb45 -o hello hello.bas
```

Voor Linux: `setup_lnx.sh`. Voor Windows: `setup_win.cmd` of `setup_mingw.cmd`.

## Status v0.3.0-Chen

- ✅ Submodule QB64-PE @ `722b7d99` (2026-05-31)
- ✅ Wrapper CLI compileert (parse args, exec QB64-PE)
- ✅ NOTICE + LEGAL met license-doorgifte (MIT → AGPL-3.0)
- ⚠ QB64-PE setup_osx.command nog niet uitgevoerd in deze sessie — wacht op user-test
- ⚠ K2026C end-to-end-test nog niet gedraaid op X86

## Project + ecosystem

- **Meta:** [`cpaglebbeek/Meta_QuickBasicEmulator`](https://github.com/cpaglebbeek/Meta_QuickBasicEmulator)
- **Ecosystem:** Retro_Computing
- **Licentie:** AGPL-3.0

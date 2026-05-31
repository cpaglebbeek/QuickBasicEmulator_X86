# CLAUDE.md — QuickBasicEmulator_X86

## Rol

Native runtime. Fase-1 = QB64-PE-fork (vanaf v0.3.0-Chen) + dialect-flag.

## Sessie-startprotocol

1. Pull deze repo + Meta_QuickBasicEmulator
2. Lees ROADMAP voor huidige milestone
3. `cmake ..` in build/ voor toolchain-check

## QB64-PE-fork-protocol (vanaf v0.3.0)

1. `git clone https://github.com/QB64-Phoenix-Edition/QB64pe.git /tmp/qb64pe-source`
2. Vendor in `src/qb64pe-fork/` (volledige source-import)
3. NOTICE.md vullen met origin + commit-hash + datum
4. Patches in `patches/` voor dialect-flag implementatie
5. CMake-script aanpassen om `Core/spec/dialect_*.json` te vendor-bundlen

## Build-targets

- Windows (MSVC + MinGW)
- Linux (GCC + Clang)
- macOS (Clang)

## Code-locaties

| Wat | Waar |
|---|---|
| Entry point | `src/main.cpp` |
| QB64-PE-fork (v0.3.0+) | `src/qb64pe-fork/` |
| Patches | `patches/` |
| Build-config | `CMakeLists.txt` |


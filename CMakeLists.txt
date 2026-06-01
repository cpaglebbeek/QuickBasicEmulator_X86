cmake_minimum_required(VERSION 3.20)
project(QuickBasicEmulator_X86
    VERSION 0.3.0
    DESCRIPTION "Native runtime for GW-BASIC, QBasic and QuickBASIC 4.5 — vendors QB64-PE"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# v0.3.0-Chen: QB64-PE submodule check
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/vendor/qb64pe/Makefile")
    message(FATAL_ERROR "QB64-PE submodule missing. Run: git submodule update --init --recursive")
endif()

message(STATUS "QB64-PE fork detected at: ${CMAKE_CURRENT_SOURCE_DIR}/vendor/qb64pe")
message(STATUS "Build QB64-PE via: cd vendor/qb64pe && ./setup_osx.command (first time) or make (subsequent)")
message(STATUS "Wrapper CLI binary (qbe_x86) compiles separately and invokes vendored QB64-PE.")

# Our thin wrapper CLI — handles dialect-flag + invokes vendored QB64-PE compiler.
add_executable(qbe_x86 src/main.cpp)
target_compile_definitions(qbe_x86 PRIVATE
    QBE_QB64PE_PATH="${CMAKE_CURRENT_SOURCE_DIR}/vendor/qb64pe"
)

install(TARGETS qbe_x86 DESTINATION bin)

cmake_minimum_required(VERSION 3.20)
project(QuickBasicEmulator_X86
    VERSION 0.0.1
    DESCRIPTION "Native runtime for GW-BASIC, QBasic and QuickBASIC 4.5"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(qbe_x86 src/main.cpp)

# v0.3.0-Chen: vendor QB64-PE fork hier toevoegen
# add_subdirectory(src/qb64pe-fork)

install(TARGETS qbe_x86 DESTINATION bin)

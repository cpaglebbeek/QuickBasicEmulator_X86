// QuickBasicEmulator_X86 — wrapper CLI
//
// v0.3.0-Chen — vendored QB64-PE fork via git submodule.
// Deze wrapper:
//   1. Leest input .bas
//   2. Bepaalt dialect (--dialect=gw|qbasic|qb45, default qb45)
//   3. Roept vendored QB64-PE compiler aan met dialect-specifieke pre-processing
//
// Voor v0.3.0 eerste implementatie:
//   - Dialect-flag wordt geaccepteerd maar nog niet doorgegeven aan QB64-PE
//   - Wrapper exec'ed `vendor/qb64pe/qb64pe -c <input> -o <output>`
//   - v0.3.1+: dialect-specifieke source-rewrite (GW line-number-handling etc.)

#include <iostream>
#include <string>
#include <cstdlib>
#include <vector>

#ifndef QBE_QB64PE_PATH
#define QBE_QB64PE_PATH "./vendor/qb64pe"
#endif

struct Args {
    std::string input;
    std::string output;
    std::string dialect = "qb45";
    bool show_help = false;
};

Args parse_args(int argc, char* argv[]) {
    Args a;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--help" || arg == "-h") {
            a.show_help = true;
        } else if (arg.rfind("--dialect=", 0) == 0) {
            a.dialect = arg.substr(10);
        } else if (arg == "-o" && i + 1 < argc) {
            a.output = argv[++i];
        } else if (a.input.empty()) {
            a.input = arg;
        }
    }
    return a;
}

void print_help(const char* prog) {
    std::cout
        << "qbe_x86 — QuickBasicEmulator native runtime (v0.3.0-Chen)\n\n"
        << "Usage:\n"
        << "  " << prog << " [--dialect=gw|qbasic|qb45] [-o output] <input.bas>\n\n"
        << "Options:\n"
        << "  --dialect=gw|qbasic|qb45   Source-language dialect (default: qb45)\n"
        << "  -o <path>                  Output binary path (default: a.out)\n"
        << "  -h, --help                 Show this help\n\n"
        << "Vendored compiler: " << QBE_QB64PE_PATH << "\n"
        << "Per dialect-flag: dialect-specifieke source-rewrite in v0.3.1+.\n"
        << "Voor v0.3.0: input wordt direct doorgegeven aan QB64-PE (qb45 semantics).\n";
}

int main(int argc, char* argv[]) {
    auto args = parse_args(argc, argv);
    if (args.show_help || args.input.empty()) {
        print_help(argv[0]);
        return args.input.empty() && !args.show_help ? 1 : 0;
    }

    std::cout << "qbe_x86 v0.3.0-Chen — dialect=" << args.dialect
              << " input=" << args.input << "\n";

    // For v0.3.0: invoke vendored qb64pe binary.
    // (Assumes user has run `cd vendor/qb64pe && ./setup_osx.command` first.)
    std::string cmd = std::string(QBE_QB64PE_PATH) + "/qb64pe -c " + args.input;
    if (!args.output.empty()) cmd += " -o " + args.output;

    std::cout << "Invoking: " << cmd << "\n";
    int rc = std::system(cmd.c_str());
    if (rc != 0) {
        std::cerr << "QB64-PE returned " << rc << "\n";
        std::cerr << "First-time setup: cd " << QBE_QB64PE_PATH << " && ./setup_osx.command\n";
    }
    return rc;
}

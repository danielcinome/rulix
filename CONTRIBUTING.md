# Contributing to Rulix

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22 LTS (`nvm use` will pick up the `.nvmrc`)
- Git

### Getting Started

```bash
git clone https://github.com/danielcinome/rulix.git
cd rulix
nvm use
npm install
npm run build
npm test
```

### Available Scripts

| Command | Description |
|---|---|
| `npm run build` | Build with tsup (ESM + CJS) |
| `npm run dev` | Build in watch mode |
| `npm test` | Run tests with vitest |
| `npm run lint` | Check lint and formatting with biome |
| `npm run lint:fix` | Auto-fix lint and formatting |
| `npm run typecheck` | TypeScript type checking |

### Verification

Before submitting any change, run the full check suite in this order:

```bash
npm run lint:fix
npm run typecheck
npm test
```

## How to Contribute

### Bug Reports

Open an issue using the [Bug Report](https://github.com/danielcinome/rulix/issues/new?template=bug_report.yml) template. Include:

- Rulix version (`rulix --version`)
- Node.js version (`node --version`)
- Steps to reproduce
- Expected vs actual behavior

### Feature Requests

Open an issue using the [Feature Request](https://github.com/danielcinome/rulix/issues/new?template=new_adapter.yml) template. Describe the use case before the solution.

### Adding a New Adapter

This is the most impactful contribution. Each adapter adds support for a new AI coding tool.

1. Create `src/adapters/<tool-name>.ts` implementing the `RulixAdapter` interface
2. Add test fixtures in `tests/fixtures/<tool-name>/`
3. Write tests in `tests/adapters/<tool-name>.test.ts`
4. Register the adapter in `src/adapters/registry.ts`
5. Update the Supported Tools table in `README.md`
6. Submit PR with a changeset (`npx changeset`)

See [Writing an Adapter](docs/adapters.md) for a detailed guide.

### Pull Requests

1. Fork the repo and create a branch: `feat/my-feature`, `fix/my-fix`
2. Make your changes
3. Run the full check suite:
   ```bash
   npm run lint:fix
   npm run typecheck
   npm test
   ```
4. Add a changeset if your change is user-facing: `npx changeset`
5. Open a PR against `main`

### Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or updating tests
- `chore:` — Tooling, CI, dependencies

### Code Standards

- **TypeScript strict mode** — no `any`, explicit return types on public functions
- **Biome** for formatting and linting — run `npm run lint:fix` before committing
- **No default exports** — use named exports everywhere
- **JSDoc** on all public interfaces and functions
- **Tests** for all new functionality

## Architecture

```
src/
├── core/       # Parser, IR types, validator, tokenizer (tool-agnostic)
├── adapters/   # One file per tool (cursor.ts, claude-code.ts, etc.)
├── cli/        # CLI entry point and command implementations
└── index.ts    # Public API
```

Key principle: **All logic operates on the IR (Intermediate Representation), never on raw tool-specific formats.** Adapters translate between tool formats and the IR.

## Decision Process

- **Small changes** (bug fixes, docs): Single review, merge
- **New features** (adapters, commands): Open a discussion issue first
- **Breaking changes**: RFC issue with 1-week comment period

## Code of Conduct

Be respectful, constructive, and collaborative. We're all here to make AI-assisted development better.

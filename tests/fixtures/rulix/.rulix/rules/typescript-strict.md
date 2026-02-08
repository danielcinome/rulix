---
id: typescript-strict
scope: always
description: "Enforce strict TypeScript conventions"
category: style
priority: 1
---

# TypeScript Conventions

- Always use `strict: true` in tsconfig
- Never use `any` — prefer `unknown` with type narrowing
- Use explicit return types on public functions
- Prefer `interface` over `type` for object shapes

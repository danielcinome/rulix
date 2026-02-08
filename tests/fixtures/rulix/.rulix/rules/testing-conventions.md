---
id: testing-conventions
scope: file-scoped
description: "Testing conventions for test files"
globs: ["**/*.test.ts", "**/*.spec.ts"]
category: testing
priority: 2
---

# Testing

- Use `describe`/`it` blocks for structure
- One assertion per test when possible
- Name tests with "should" pattern

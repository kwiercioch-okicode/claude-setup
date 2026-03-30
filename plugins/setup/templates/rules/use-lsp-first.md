# Use LSP First

For code navigation, prefer LSP tools over grep/search:

| Task | Use | Avoid |
|---|---|---|
| Find function definition | LSP goToDefinition | Grep for function name |
| Find all callers/usages | LSP findReferences | Grep for symbol |
| Find implementations | LSP goToImplementation | Grep for method signatures |
| Get type info | LSP hover | Reading entire source file |

Fall back to Grep/Glob only when:
- LSP is not available for the language
- Searching string literals, comments, or config values
- Finding files by name pattern

# Stop and Ask

Do NOT proceed autonomously when:
- Requirements are ambiguous and both interpretations lead to different implementations
- The fix requires changing a public API, database schema, or shared contract
- You've attempted two different approaches and both failed
- The task scope has grown beyond the original request
- You're about to delete or overwrite code you don't fully understand

Do proceed autonomously when:
- The bug has a clear reproduction, cause, and fix
- The task is well-scoped and the approach is obvious
- Tests exist and will catch regressions
- You're fixing something you broke

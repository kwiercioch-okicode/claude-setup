# Test First

Every code change starts with a test.

| Scenario | First step |
|---|---|
| Bug fix | Write failing test that reproduces the bug |
| Feature | Write failing test that specifies expected behavior |
| Refactor | Write characterization test that passes BEFORE touching code |

Do NOT write production code before the test exists and fails for the right reason.

**Skip for:** infrastructure/config, CSS-only visual fixes, pure typos.

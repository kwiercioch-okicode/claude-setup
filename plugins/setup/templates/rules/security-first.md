# Security First

- Never use raw SQL - always use ORM/query builder
- Never log passwords, tokens, or raw request bodies
- User-facing error messages must be generic - log detail server-side only
- Validate all user input at system boundaries
- Never hardcode secrets, API keys, or credentials
- Never commit .env files, credentials.json, or private keys
- Use parameterized queries for any dynamic data
- Sanitize output to prevent XSS

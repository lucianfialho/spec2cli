# tocli Examples

## `todo-api/`

A local Todo API server + demo script that exercises every tocli feature.

```bash
bash examples/todo-api/demo.sh
```

What it tests:
- Spec loading (OpenAPI 3.x YAML)
- Dynamic command generation from spec tags/operations
- Output formats (json, pretty, table)
- Auth (401 without token, 201 with token)
- CRUD operations (create, read, update, delete)
- Verbose mode, dynamic help, query param filtering

---
name: recipe-test-crud
version: 1.0.0
description: "Test full CRUD cycle (Create, Read, Update, Delete) on any API resource"
metadata:
  openclaw:
    category: "recipe"
    domain: "api"
    requires:
      bins: ["spec2cli"]
      skills: ["spec2cli-basics", "spec2cli-auth"]
---

# Recipe: Test CRUD Cycle

Use this workflow to verify that Create, Read, Update, and Delete operations work correctly for an API resource.

## Prerequisites

- An OpenAPI spec (local file or URL)
- Auth token if the API requires it
- Know which resource group to test (run `--agent-help` first)

## Step 1: Verify the initial state

```bash
spec2cli --spec <spec> --output table <group> list
```

Note the current count and existing IDs.

## Step 2: Create a resource

```bash
spec2cli --spec <spec> --token <TOKEN> --output json <group> create --<required-fields>
```

Save the returned ID. Verify with:

```bash
spec2cli --spec <spec> --output json <group> get --id <NEW_ID>
```

**Check**: Does the response match what you sent?

## Step 3: Update the resource

```bash
spec2cli --spec <spec> --token <TOKEN> --output json <group> update --id <NEW_ID> --<field> <new-value>
```

Verify the update:

```bash
spec2cli --spec <spec> --output json <group> get --id <NEW_ID>
```

**Check**: Is the field updated? Are other fields preserved?

## Step 4: List to confirm

```bash
spec2cli --spec <spec> --output table <group> list
```

**Check**: Does the new resource appear? Is the count incremented?

## Step 5: Delete the resource

```bash
spec2cli --spec <spec> --token <TOKEN> --quiet <group> delete --id <NEW_ID>
echo "Exit code: $?"
```

**Check**: Exit code 0 = success.

## Step 6: Verify deletion

```bash
spec2cli --spec <spec> --output json <group> get --id <NEW_ID>
```

**Check**: Should return 404.

## Example: CRUD on Todo API

```bash
SPEC="./examples/todo-api/openapi.yaml"
BASE="http://localhost:4000"
TOKEN="test-token-123"

# List
spec2cli --spec $SPEC --base-url $BASE --output table todos list

# Create
spec2cli --spec $SPEC --base-url $BASE --token $TOKEN --output json todos create --title "Test CRUD" --priority high

# Read (use the returned ID)
spec2cli --spec $SPEC --base-url $BASE --output json todos get --id 8

# Update
spec2cli --spec $SPEC --base-url $BASE --token $TOKEN --output json todos update --id 8 --status done

# Delete
spec2cli --spec $SPEC --base-url $BASE --token $TOKEN --quiet todos delete --id 8

# Verify 404
spec2cli --spec $SPEC --base-url $BASE --output json todos get --id 8
```

## Tips

- Use `--verbose` on any step to see the raw HTTP request/response
- Use `--output json | jq .id` to extract the ID after create
- If delete returns empty string instead of 404, the API uses 204 No Content (success)

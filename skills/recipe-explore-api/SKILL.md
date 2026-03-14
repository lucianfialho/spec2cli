---
name: recipe-explore-api
version: 1.0.0
description: "Step-by-step workflow to explore and test an unfamiliar API"
metadata:
  openclaw:
    category: "recipe"
    domain: "api"
    requires:
      bins: ["spec2cli"]
      skills: ["spec2cli-basics", "spec2cli-auth"]
---

# Recipe: Explore an API

Use this workflow when you encounter a new API and need to understand what it offers.

## Step 1: Get the full picture

```bash
spec2cli --spec <spec-url-or-path> --agent-help
```

This returns a compact YAML with every command group, command, required/optional params, and auth info. Read it to understand the API surface.

## Step 2: Identify the relevant group

From the `--agent-help` output, pick the group that matches your task. For example, if you need to work with users, look for a `users` group.

## Step 3: Check auth requirements

Look at the `auth` field in the `--agent-help` output. If auth is required:

```bash
# Use inline token
spec2cli --spec <spec> --token <TOKEN> <group> <command>

# Or set env var
export API_TOKEN=<TOKEN>
```

## Step 4: List resources first

Start with a read-only list command to see what data exists:

```bash
spec2cli --spec <spec> --output table <group> list
```

Use `--output table` for quick scanning, `--output json` for detailed data.

## Step 5: Get a single resource

Pick an ID from the list and get details:

```bash
spec2cli --spec <spec> --output json <group> get --id <ID>
```

## Step 6: Test a write operation

If needed, create or update a resource:

```bash
spec2cli --spec <spec> --token <TOKEN> <group> create --<required-param> <value>
```

Use `--verbose` to see the exact HTTP request:

```bash
spec2cli --spec <spec> --verbose --token <TOKEN> <group> create --name test
```

## Example: Exploring the Petstore API

```bash
# 1. Overview
spec2cli use petstore --agent-help

# 2. List pets
spec2cli use petstore pet findpetsbystatus --status available --output table

# 3. Get one pet
spec2cli use petstore pet getpetbyid --petId 1 --output json

# 4. See the HTTP details
spec2cli use petstore --verbose pet getpetbyid --petId 1
```

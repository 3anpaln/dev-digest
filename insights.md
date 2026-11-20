# Cross-package insights

A typecheck can pass in both the client and server while their API shapes disagree. Each resolves `@devdigest/shared` to its own vendored directory. Reviewer-core resolves the same name to the server copy. When investigating a response mismatch, compare the contract and its consumer on both sides of the HTTP call. [Client aliases](client/tsconfig.json) · [Server aliases](server/tsconfig.json) · [Engine aliases](reviewer-core/tsconfig.json)

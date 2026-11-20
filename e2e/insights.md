# Browser suite insights

The home page redirects to the first repository returned by the API. Several flows expect that repository to contain seeded PR #482. If a flow lands on a different list in a populated development database, the isolated launcher supplies a fresh database with just the demo repository. [Home redirect](../client/src/app/page.tsx) · [Boot flow](specs/01-app-boot.flow.json) · [Isolated launcher](../scripts/e2e.sh)

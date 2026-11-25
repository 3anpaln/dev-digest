---
name: improve-codebase-architecture
description: Survey an existing codebase for refactoring opportunities, compare candidates in a visual report, and discuss the candidate the user selects.
---

Read the [shared architecture guide](../../../.claude/skills/improve-codebase-architecture/SKILL.md) and its [HTML report template](../../../.claude/skills/improve-codebase-architecture/HTML-REPORT.md). Resolve supporting paths from the shared guide's directory.

Use these steps for the companion skills named in the guide:

- For codebase design, compare the complexity exposed by the interface with the behavior it hides. Consider whether removing a module concentrates complexity or spreads it among callers, and whether tests can exercise the behavior through the interface.
- After the user selects a candidate, discuss one consequential design question at a time. Resolve what you can from the repository and explain the recommended option when asking for a choice.
- For domain modeling, use the terms established in repository docs and ADRs. Confirm a new term with the user before recording it.

Inspect the code directly when sub-agents are unavailable. Keep any generated report in the repository's ignored `.devdigest/cache/` directory and follow the project's existing ADR conventions.

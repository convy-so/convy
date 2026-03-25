# Creator Playbooks Evals

These fixtures are lightweight regression cases for the creator playbook and refinement assistant layers.

They are intentionally simple:

- `playbook-interpretation.json`
  - guided playbook authoring inputs
  - expected status
  - expected signals in the interpretation/preview

- `refinement-proposals.json`
  - creator refinement messages
  - expected proposal routing
  - expected guardrail behavior

The fixtures are designed to be consumed by a future script or CI job that calls:

- `compilePlaybookAuthorInput(...)`
- `buildRefinementAssistantResponse(...)`

The key requirement is regression safety, not benchmark complexity.

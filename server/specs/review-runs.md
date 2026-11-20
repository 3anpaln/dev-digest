# Starting a review

- A valid review request creates a run for each selected agent and returns the run IDs while review work continues in the background.
- Clients use each ID to subscribe to live events and retrieve the saved trace. Run history for the PR includes failed runs.
- A failure during one agent’s review leaves the other selected agents eligible to run.

[Review service](../src/modules/reviews/service.ts) · [Run routes](../src/modules/reviews/routes.ts) · [Integration tests](../test/reviews.it.test.ts)

# Starting a review

- A valid review request creates a run for each selected agent and returns the run IDs while review work continues in the background.
- Clients use each ID to subscribe to live events and retrieve the saved trace. Run history for the PR includes failed runs.
- A failure during one agent’s review leaves the other selected agents eligible to run.
- After cancellation is accepted, the executor checks for cancellation before each new model attempt, including schema-repair and transport retries. A request already sent can finish and contribute its recorded charge.
- `POST /runs/:id/cancel` returns `cancelled: true` when the request changes a running row in the caller’s workspace to cancelled. It returns `cancelled: false` if no such running row exists. The API logs the request and its outcome.
- The run bus signals `done` once when the live log closes after success, failure, or accepted cancellation. The SSE endpoint drains queued log events and closes the connection. Clients read the run status from `GET /pulls/:id/runs` to determine the outcome. After cancellation, the saved trace can become available after the stream closes because the executor can still be settling an in-flight request.

[Review service](../src/modules/reviews/service.ts) · [Run routes](../src/modules/reviews/routes.ts) · [Integration tests](../test/reviews.it.test.ts)

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const stream = vi.hoisted(() => ({ events: [], running: false }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => stream,
}));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  stream.running = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunStatus (smoke)", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = renderWithIntl(<RunStatus runIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("refreshes run state once when the log stream closes", () => {
    const onDone = vi.fn();
    const view = (callback: () => void) => (
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunStatus runIds={["run-1"]} onDone={callback} />
      </NextIntlClientProvider>
    );
    stream.running = true;
    const { rerender } = render(view(onDone));
    expect(onDone).not.toHaveBeenCalled();
    stream.running = false;
    rerender(view(onDone));
    expect(onDone).toHaveBeenCalledTimes(1);
    const replacement = vi.fn();
    rerender(view(replacement));
    expect(replacement).not.toHaveBeenCalled();
  });
});

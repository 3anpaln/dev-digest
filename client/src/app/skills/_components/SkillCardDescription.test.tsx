import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { SkillCardDescription } from "./SkillCardDescription";

it("shows the full description on hover and keyboard focus and closes on Escape", () => {
  const description = "Check changed paths, request bodies, and response contracts for existing callers.";
  render(<SkillCardDescription name="Route checks" description={description} />);
  const trigger = screen.getByRole("button", { name: "Description for Route checks" });

  fireEvent.mouseEnter(trigger);
  expect(within(screen.getByRole("tooltip")).getByText(description)).toBeVisible();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  fireEvent.focus(trigger);
  expect(screen.getByRole("tooltip")).toBeVisible();
  fireEvent.blur(trigger);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

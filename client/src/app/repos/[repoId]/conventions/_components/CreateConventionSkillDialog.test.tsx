import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../../../../../lib/api";
import { CreateConventionSkillDialog } from "./CreateConventionSkillDialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it("renders without crypto and reuses the save UUID when the user retries", async () => {
  const initial = {
    name: "repo-conventions",
    description: "Reviewed conventions",
    body: "# Repository conventions",
    revision: "draft-revision",
    accepted_count: 1,
  };
  const onClose = vi.fn();
  const dialog = (
    <QueryClientProvider client={new QueryClient()}>
      <CreateConventionSkillDialog repoId="repo" branch="main" repository="acme/repo"
        initial={initial} opener={null} onClose={onClose} />
    </QueryClientProvider>
  );

  vi.stubGlobal("crypto", undefined);
  expect(renderToString(dialog)).toContain("Create skill from conventions");

  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  render(dialog);

  const requestId = "a4a6156f-2d84-4579-9179-4032847aed16";
  const randomUUID = vi.fn().mockReturnValueOnce(requestId).mockReturnValue("e3392e38-30f2-499f-88e9-a70030fe547d");
  vi.stubGlobal("crypto", { randomUUID });
  const post = vi.spyOn(api, "post")
    .mockRejectedValueOnce(new Error("The response was lost. Try again."))
    .mockResolvedValueOnce({ id: requestId });

  fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The response was lost. Try again.");
  fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());

  const { name, description, body, revision } = initial;
  const expectedSave = ["/repos/repo/conventions/skills?branch=main", { name, description, body, revision, requestId }];
  expect(post.mock.calls).toEqual([expectedSave, expectedSave]);
});

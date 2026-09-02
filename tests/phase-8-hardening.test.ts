import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn<(path: string) => never>(),
}));

vi.mock("next/navigation", () => ({
  redirect: navigation.redirect,
}));

import BookPage from "@/app/doctors/[doctorId]/book/page";

describe("Phase 8.8 patient scheduling hardening", () => {
  beforeEach(() => {
    navigation.redirect.mockReset().mockImplementation((path) => {
      throw new Error(`redirect:${path}`);
    });
  });

  it("redirects the obsolete direct booking route to the canonical request flow", async () => {
    await expect(BookPage({
      params: Promise.resolve({ doctorId: "doctor id" }),
    })).rejects.toThrow("redirect:/doctors/doctor%20id#availability");

    expect(navigation.redirect).toHaveBeenCalledWith("/doctors/doctor%20id#availability");
  });
});

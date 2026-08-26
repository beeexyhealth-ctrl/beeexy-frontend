// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeeexyApiError } from "@/lib/beeexy-api/problem-details";
import { notifyPrivateAccessRequired } from "@/lib/beeexy-api/private-access-events";
import { PrivateAccessProvider } from "@/features/private-access/private-access-provider";

const privateAccessApi = vi.hoisted(() => ({
  getPrivateAccessSession: vi.fn(),
  loginPrivateAccess: vi.fn(),
  logoutPrivateAccess: vi.fn(),
}));

vi.mock("@/lib/beeexy-api/private-access-api", () => ({ beeexyPrivateAccessApi: privateAccessApi }));

function renderGate() {
  return render(
    <PrivateAccessProvider>
      <div>Protected Beeexy content</div>
    </PrivateAccessProvider>,
  );
}

async function fillAndSubmit(username = "demo-user", password = "demo-password", keyword = "demo-keyword") {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Keyword"), { target: { value: keyword } });
  fireEvent.click(screen.getByRole("button", { name: /enter beeexy/i }));
}

beforeEach(() => {
  privateAccessApi.getPrivateAccessSession.mockReset();
  privateAccessApi.loginPrivateAccess.mockReset();
  privateAccessApi.logoutPrivateAccess.mockReset();
});

afterEach(() => cleanup());

describe("Private Access bootstrap", () => {
  it("hides protected content while the authoritative session check is pending", async () => {
    let resolveSession!: (value: { authenticated: boolean; expiresAt: null }) => void;
    privateAccessApi.getPrivateAccessSession.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));

    renderGate();

    expect(screen.getByText("Checking private access")).toBeInTheDocument();
    expect(screen.queryByText("Protected Beeexy content")).not.toBeInTheDocument();

    await vi.waitFor(() => expect(privateAccessApi.getPrivateAccessSession).toHaveBeenCalledOnce());
    await act(async () => resolveSession({ authenticated: true, expiresAt: null }));
    expect(await screen.findByText("Protected Beeexy content")).toBeInTheDocument();
  });

  it("shows the gate for no session and skips it for an existing valid session", async () => {
    privateAccessApi.getPrivateAccessSession.mockResolvedValueOnce({ authenticated: false, expiresAt: null });
    const first = renderGate();

    expect(await screen.findByRole("heading", { name: "Enter the Beeexy private demo." })).toBeInTheDocument();
    expect(screen.queryByText("Protected Beeexy content")).not.toBeInTheDocument();
    first.unmount();

    privateAccessApi.getPrivateAccessSession.mockResolvedValueOnce({ authenticated: true, expiresAt: null });
    renderGate();
    expect(await screen.findByText("Protected Beeexy content")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enter the Beeexy private demo." })).not.toBeInTheDocument();
  });

  it("offers a retry without exposing protected content when bootstrap fails", async () => {
    privateAccessApi.getPrivateAccessSession.mockRejectedValueOnce(new Error("backend unavailable"));
    renderGate();

    expect(await screen.findByText(/could not verify private access/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check session again" })).toBeInTheDocument();
    expect(screen.queryByText("Protected Beeexy content")).not.toBeInTheDocument();
  });
});

describe("Private Access form", () => {
  it("renders all secret fields and submits the exact, unnormalized payload once", async () => {
    privateAccessApi.getPrivateAccessSession
      .mockResolvedValueOnce({ authenticated: false, expiresAt: null })
      .mockResolvedValueOnce({ authenticated: true, expiresAt: null });
    privateAccessApi.loginPrivateAccess.mockResolvedValueOnce(undefined);
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    renderGate();
    await screen.findByLabelText("Username");

    await fillAndSubmit(" demo-user ", " pass word ", " KeyWord ");

    expect(await screen.findByText("Protected Beeexy content")).toBeInTheDocument();
    expect(privateAccessApi.loginPrivateAccess).toHaveBeenCalledOnce();
    expect(privateAccessApi.loginPrivateAccess).toHaveBeenCalledWith({
      username: " demo-user ",
      password: " pass word ",
      keyword: " KeyWord ",
    });
    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });

  it("prevents duplicate submissions while login is pending", async () => {
    let resolveLogin!: () => void;
    privateAccessApi.getPrivateAccessSession
      .mockResolvedValueOnce({ authenticated: false, expiresAt: null })
      .mockResolvedValueOnce({ authenticated: true, expiresAt: null });
    privateAccessApi.loginPrivateAccess.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveLogin = resolve;
    }));
    renderGate();
    await screen.findByLabelText("Username");

    await fillAndSubmit();
    fireEvent.submit(screen.getByLabelText("Username").closest("form")!);

    expect(privateAccessApi.loginPrivateAccess).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Checking access..." })).toBeDisabled();

    resolveLogin();
    expect(await screen.findByText("Protected Beeexy content")).toBeInTheDocument();
  });

  it("shows generic invalid-credential feedback without rendering submitted secrets", async () => {
    privateAccessApi.getPrivateAccessSession.mockResolvedValueOnce({ authenticated: false, expiresAt: null });
    privateAccessApi.loginPrivateAccess.mockRejectedValueOnce(new BeeexyApiError(401, {
      problem: { title: "Private access denied.", detail: "server detail with no field distinction" },
    }));
    const { container } = renderGate();
    await screen.findByLabelText("Username");

    await fillAndSubmit("shared-user-secret", "shared-password-secret", "shared-keyword-secret");

    expect(await screen.findByText(/access credentials are incorrect/i)).toBeInTheDocument();
    const feedback = container.querySelector(".private-access-feedback")?.textContent || "";
    expect(feedback).not.toContain("shared-user-secret");
    expect(feedback).not.toContain("shared-password-secret");
    expect(feedback).not.toContain("shared-keyword-secret");
    expect(feedback).not.toContain("server detail");
  });

  it("respects Retry-After and distinguishes a network failure", async () => {
    privateAccessApi.getPrivateAccessSession.mockResolvedValueOnce({ authenticated: false, expiresAt: null });
    privateAccessApi.loginPrivateAccess.mockRejectedValueOnce(new BeeexyApiError(429, { retryAfter: "90" }));
    const first = renderGate();
    await screen.findByLabelText("Username");
    await fillAndSubmit();

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again in 90s/i })).toBeDisabled();
    first.unmount();

    privateAccessApi.getPrivateAccessSession.mockResolvedValueOnce({ authenticated: false, expiresAt: null });
    privateAccessApi.loginPrivateAccess.mockRejectedValueOnce(new Error("network down"));
    renderGate();
    await screen.findByLabelText("Username");
    await fillAndSubmit();
    expect(await screen.findByText(/could not check access right now/i)).toBeInTheDocument();
  });

  it("returns to the gate when the shared client detects an expired private session", async () => {
    privateAccessApi.getPrivateAccessSession.mockResolvedValueOnce({ authenticated: true, expiresAt: null });
    renderGate();
    expect(await screen.findByText("Protected Beeexy content")).toBeInTheDocument();

    act(() => notifyPrivateAccessRequired());

    expect(await screen.findByText(/private demo session ended/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected Beeexy content")).not.toBeInTheDocument();
  });
});

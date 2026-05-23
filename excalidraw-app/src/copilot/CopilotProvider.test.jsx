import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { CopilotProvider, useCopilot } from "./CopilotProvider";

let copilotListener = null;

beforeEach(() => {
  copilotListener = null;
  window.electronAPI = {
    copilotStart: vi.fn().mockResolvedValue({ ok: true }),
    copilotSend: vi.fn().mockResolvedValue({ ok: true }),
    copilotAbort: vi.fn().mockResolvedValue({ ok: true }),
    copilotReset: vi.fn().mockResolvedValue({ ok: true }),
    onCopilotEvent: vi.fn((callback) => {
      copilotListener = callback;
      return () => {
        copilotListener = null;
      };
    }),
  };
});

afterEach(() => {
  cleanup();
  delete window.electronAPI;
});

function Harness() {
  const { messages, streamingText, sendMessage } = useCopilot();
  return (
    <div>
      <button onClick={() => sendMessage("hi")}>send</button>
      <div data-testid="messages">{JSON.stringify(messages)}</div>
      <div data-testid="streaming">{streamingText}</div>
    </div>
  );
}

describe("CopilotProvider", () => {
  it("does not start the main-process session when closed", () => {
    render(
      <CopilotProvider isOpen={false}>
        <Harness />
      </CopilotProvider>,
    );
    expect(window.electronAPI.copilotStart).not.toHaveBeenCalled();
  });

  it("starts the main-process session when opened", () => {
    render(
      <CopilotProvider isOpen={true}>
        <Harness />
      </CopilotProvider>,
    );
    expect(window.electronAPI.copilotStart).toHaveBeenCalledTimes(1);
  });

  it("sends user messages through IPC", async () => {
    render(
      <CopilotProvider isOpen={true}>
        <Harness />
      </CopilotProvider>,
    );

    await act(async () => {
      screen.getByText("send").click();
    });

    expect(window.electronAPI.copilotSend).toHaveBeenCalledWith("hi");
    const messages = JSON.parse(screen.getByTestId("messages").textContent);
    expect(messages).toEqual([{ id: expect.any(String), role: "user", text: "hi" }]);
  });

  it("streams deltas and appends final assistant message from main-process events", async () => {
    render(
      <CopilotProvider isOpen={true}>
        <Harness />
      </CopilotProvider>,
    );

    await act(async () => {
      copilotListener({ type: "agent_start" });
      copilotListener({ type: "message_start", role: "assistant" });
      copilotListener({ type: "text_delta", delta: "hello" });
      copilotListener({ type: "text_delta", delta: " world" });
    });

    expect(screen.getByTestId("streaming").textContent).toBe("hello world");

    await act(async () => {
      copilotListener({ type: "message_end", role: "assistant", text: "hello world" });
      copilotListener({ type: "agent_end" });
    });

    expect(screen.getByTestId("streaming").textContent).toBe("");
    const messages = JSON.parse(screen.getByTestId("messages").textContent);
    expect(messages).toEqual([{ id: expect.any(String), role: "assistant", text: "hello world" }]);
  });
});


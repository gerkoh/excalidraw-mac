import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createWindowSession, CLOSE_ACK_TIMEOUT_MS } = require("./windowSession");
const { PROMPT_OPTIONS } = require("./unsavedChanges");

const SAVE = 0;
const DONT_SAVE = 1;
const CANCEL = 2;

const UNSAVED_UNTITLED = { dirty: true, hasFilePath: false, hasContent: true };

// minimal BrowserWindow stand-in; close() re-emits "close" like Electron does
const createFakeWindow = () => {
  const win = {
    destroyed: false,
    minimized: false,
    closed: false,
    closeHandler: null,
    webContents: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      isCrashed: vi.fn(() => false),
    },
    isDestroyed: vi.fn(() => win.destroyed),
    isMinimized: vi.fn(() => win.minimized),
    restore: vi.fn(() => {
      win.minimized = false;
    }),
    show: vi.fn(),
    setDocumentEdited: vi.fn(),
    close: vi.fn(() => {
      const event = closeEvent();
      win.closeHandler?.(event);
      if (!event.preventDefault.mock.calls.length) win.closed = true;
    }),
  };
  return win;
};

const closeEvent = () => ({ preventDefault: vi.fn() });

let win;
let showMessageBox;
let quitting;
let onCloseCancelled;
let quit;
let session;

const createSession = (targetWin = win) => {
  const created = createWindowSession({
    win: targetWin,
    showMessageBox,
    isQuitting: () => quitting,
    onCloseCancelled,
    quit,
  });
  targetWin.closeHandler = (event) => created.handleClose(event);
  return created;
};

// the user picks this button in the "Save changes?" sheet
const userChooses = (response) => showMessageBox.mockResolvedValue({ response });

const sentChannels = (targetWin = win) =>
  targetWin.webContents.send.mock.calls.map(([channel]) => channel);

// starts a close as the user would (close button / ⌘W) and returns the flow's promise
const requestClose = () => {
  const event = closeEvent();
  const flow = session.handleClose(event);
  return { event, flow };
};

const flushPromises = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  win = createFakeWindow();
  showMessageBox = vi.fn(() => Promise.resolve({ response: CANCEL }));
  quitting = false;
  onCloseCancelled = vi.fn();
  quit = vi.fn();
  session = createSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("document state", () => {
  it("starts clean", () => {
    expect(session.getDocumentState()).toEqual({
      dirty: false,
      hasFilePath: false,
      hasContent: false,
    });
  });

  it("stores the normalized state and sets the edited dot", () => {
    session.setDocumentState({ dirty: true, hasFilePath: true, hasContent: true, junk: 1 });
    expect(session.getDocumentState()).toEqual({
      dirty: true,
      hasFilePath: true,
      hasContent: true,
    });
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(true);
  });

  it("clears the edited dot when the drawing becomes clean (auto-save finished)", () => {
    session.setDocumentState({ dirty: true, hasFilePath: true, hasContent: true });
    session.setDocumentState({ dirty: false, hasFilePath: true, hasContent: true });
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(false);
  });

  it("treats garbage from the renderer as clean", () => {
    session.setDocumentState("dirty");
    expect(session.getDocumentState().dirty).toBe(false);
    expect(win.setDocumentEdited).toHaveBeenLastCalledWith(false);
  });

  it("does not touch a destroyed window", () => {
    win.destroyed = true;
    session.setDocumentState(UNSAVED_UNTITLED);
    expect(win.setDocumentEdited).not.toHaveBeenCalled();
    expect(session.getDocumentState()).toEqual(UNSAVED_UNTITLED);
  });
});

describe("confirmReplaceDocument (⌘N, ⌘O, open-file)", () => {
  it.each([
    ["clean", { dirty: false, hasFilePath: false, hasContent: true }],
    ["titled (auto-saved)", { dirty: true, hasFilePath: true, hasContent: true }],
    ["empty", { dirty: true, hasFilePath: false, hasContent: false }],
  ])("proceeds without a prompt when the drawing is %s", async (_label, state) => {
    session.setDocumentState(state);
    await expect(session.confirmReplaceDocument()).resolves.toBe(true);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("prompts on the window itself for an unsaved untitled drawing", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(DONT_SAVE);
    await session.confirmReplaceDocument();
    expect(showMessageBox).toHaveBeenCalledWith(win, PROMPT_OPTIONS);
  });

  it("Don't Save proceeds without saving", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(DONT_SAVE);
    await expect(session.confirmReplaceDocument()).resolves.toBe(true);
    expect(sentChannels()).toEqual([]);
  });

  it("Cancel keeps the current drawing", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(CANCEL);
    await expect(session.confirmReplaceDocument()).resolves.toBe(false);
    expect(sentChannels()).toEqual([]);
  });

  it("Save asks the renderer for Save As and proceeds once it saved", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(SAVE);
    const confirming = session.confirmReplaceDocument();
    await flushPromises();
    expect(sentChannels()).toEqual(["save-as-request"]);

    session.handleSaveAsResult(true);
    await expect(confirming).resolves.toBe(true);
  });

  it("Save then cancelling the Save As dialog keeps the current drawing", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(SAVE);
    const confirming = session.confirmReplaceDocument();
    await flushPromises();
    session.handleSaveAsResult(false);
    await expect(confirming).resolves.toBe(false);
  });

  it.each([["true"], [1], [undefined], [{}]])(
    "only a strict true Save As result counts as saved (%j)",
    async (result) => {
      session.setDocumentState(UNSAVED_UNTITLED);
      userChooses(SAVE);
      const confirming = session.confirmReplaceDocument();
      await flushPromises();
      session.handleSaveAsResult(result);
      await expect(confirming).resolves.toBe(false);
    },
  );

  it("waits for the Save As dialog with no timeout", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(SAVE);
    let settled = false;
    session.confirmReplaceDocument().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(settled).toBe(false);
  });

  it("restores a minimized window and shows it before prompting", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    win.minimized = true;
    userChooses(CANCEL);
    await session.confirmReplaceDocument();
    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.restore.mock.invocationCallOrder[0]).toBeLessThan(
      showMessageBox.mock.invocationCallOrder[0],
    );
  });

  it("does not restore a window that isn't minimized", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    await session.confirmReplaceDocument();
    expect(win.restore).not.toHaveBeenCalled();
  });

  it("ignores a second request while a prompt is already open", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    let answer;
    showMessageBox.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const first = session.confirmReplaceDocument();
    await expect(session.confirmReplaceDocument()).resolves.toBe(false);
    expect(showMessageBox).toHaveBeenCalledTimes(1);

    answer({ response: DONT_SAVE });
    await expect(first).resolves.toBe(true);
  });

  it("can prompt again after a previous prompt finished", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(CANCEL);
    await session.confirmReplaceDocument();
    await session.confirmReplaceDocument();
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it("keeps the current drawing (and logs) if the prompt itself fails", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    showMessageBox.mockRejectedValue(new Error("dialog failed"));
    await expect(session.confirmReplaceDocument()).resolves.toBe(false);
    expect(console.error).toHaveBeenCalled();
    userChooses(DONT_SAVE);
    await expect(session.confirmReplaceDocument()).resolves.toBe(true);
  });

  it("proceeds without prompting when the renderer has crashed", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    win.webContents.isCrashed.mockReturnValue(true);
    await expect(session.confirmReplaceDocument()).resolves.toBe(true);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it("refuses while the window is closing", async () => {
    requestClose();
    await expect(session.confirmReplaceDocument()).resolves.toBe(false);
  });

  it("ignores a stray Save As result when nothing is waiting", () => {
    expect(() => session.handleSaveAsResult(true)).not.toThrow();
  });
});

describe("handleClose", () => {
  it("always prevents the first close so the renderer can save", () => {
    const { event } = requestClose();
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("asks the renderer for its final save, then closes once acknowledged", async () => {
    const { flow } = requestClose();
    await flushPromises();
    expect(sentChannels()).toEqual(["before-close"]);
    expect(win.close).not.toHaveBeenCalled();

    session.handleCloseAcknowledged();
    await flow;

    expect(win.close).toHaveBeenCalledTimes(1);
    expect(win.closed).toBe(true);
  });

  it("lets the close through after the handshake (no second prevent)", async () => {
    const { flow } = requestClose();
    await flushPromises();
    session.handleCloseAcknowledged();
    await flow;
    const event = closeEvent();
    await session.handleClose(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("force-closes after the timeout if the renderer never acknowledges", async () => {
    requestClose();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS - 1);
    expect(win.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      "[main] Close not acknowledged in time, forcing close",
    );
  });

  it("uses a 3 second timeout", () => {
    expect(CLOSE_ACK_TIMEOUT_MS).toBe(3000);
  });

  it("ignores a late acknowledgement after the timeout", async () => {
    requestClose();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS);
    session.handleCloseAcknowledged();
    await flushPromises();
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it("does not fire the timeout after an acknowledgement", async () => {
    requestClose();
    await flushPromises();
    session.handleCloseAcknowledged();
    await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS * 2);
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("ignores repeated close requests while the close is in progress", async () => {
    requestClose();
    const second = requestClose();
    expect(second.event.preventDefault).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(sentChannels()).toEqual(["before-close"]);
  });

  it("does not prompt for a titled drawing, even if dirty (it is saved on close)", async () => {
    session.setDocumentState({ dirty: true, hasFilePath: true, hasContent: true });
    requestClose();
    await flushPromises();
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(sentChannels()).toEqual(["before-close"]);
  });

  describe("unsaved untitled drawing", () => {
    beforeEach(() => session.setDocumentState(UNSAVED_UNTITLED));

    it("prompts before asking for the final save", async () => {
      userChooses(DONT_SAVE);
      requestClose();
      await flushPromises();
      expect(showMessageBox).toHaveBeenCalledTimes(1);
      expect(showMessageBox.mock.invocationCallOrder[0]).toBeLessThan(
        win.webContents.send.mock.invocationCallOrder[0],
      );
    });

    it("Don't Save closes after the handshake", async () => {
      userChooses(DONT_SAVE);
      const { flow } = requestClose();
      await flushPromises();
      expect(sentChannels()).toEqual(["before-close"]);
      session.handleCloseAcknowledged();
      await flow;
      expect(win.closed).toBe(true);
      expect(onCloseCancelled).not.toHaveBeenCalled();
    });

    it("Cancel keeps the window open, sends nothing and cancels any quit", async () => {
      userChooses(CANCEL);
      const { flow } = requestClose();
      await flow;
      expect(win.close).not.toHaveBeenCalled();
      expect(sentChannels()).toEqual([]);
      expect(onCloseCancelled).toHaveBeenCalledTimes(1);
    });

    it("Save runs Save As, then the final save, then closes", async () => {
      userChooses(SAVE);
      const { flow } = requestClose();
      await flushPromises();
      expect(sentChannels()).toEqual(["save-as-request"]);

      session.handleSaveAsResult(true);
      await flushPromises();
      expect(sentChannels()).toEqual(["save-as-request", "before-close"]);

      session.handleCloseAcknowledged();
      await flow;
      expect(win.closed).toBe(true);
    });

    it("Save then cancelling the Save As dialog aborts the close", async () => {
      userChooses(SAVE);
      const { flow } = requestClose();
      await flushPromises();
      session.handleSaveAsResult(false);
      await flow;
      expect(win.close).not.toHaveBeenCalled();
      expect(sentChannels()).toEqual(["save-as-request"]);
      expect(onCloseCancelled).toHaveBeenCalledTimes(1);
    });

    it("the safety timeout never cuts off the prompt", async () => {
      let answer;
      showMessageBox.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      requestClose();
      await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS * 20);
      expect(win.close).not.toHaveBeenCalled();
      expect(sentChannels()).toEqual([]);

      answer({ response: CANCEL });
      await flushPromises();
      expect(win.close).not.toHaveBeenCalled();
    });

    it("the safety timeout never cuts off the Save As dialog, and starts only after it", async () => {
      userChooses(SAVE);
      requestClose();
      await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS * 20);
      expect(win.close).not.toHaveBeenCalled();

      session.handleSaveAsResult(true);
      await vi.advanceTimersByTimeAsync(CLOSE_ACK_TIMEOUT_MS - 1);
      expect(win.close).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(win.close).toHaveBeenCalledTimes(1);
    });

    it("a later close prompts again after a cancelled one", async () => {
      userChooses(CANCEL);
      await requestClose().flow;
      userChooses(DONT_SAVE);
      const { flow } = requestClose();
      await flushPromises();
      session.handleCloseAcknowledged();
      await flow;
      expect(showMessageBox).toHaveBeenCalledTimes(2);
      expect(win.closed).toBe(true);
    });

    it("keeps the window open (and logs) if the prompt fails", async () => {
      showMessageBox.mockRejectedValue(new Error("dialog failed"));
      await requestClose().flow;
      expect(win.close).not.toHaveBeenCalled();
      expect(onCloseCancelled).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalled();
    });

    it("a close while a ⌘N / ⌘O prompt is open is ignored and cancels the quit", async () => {
      showMessageBox.mockReturnValue(new Promise(() => {}));
      session.confirmReplaceDocument();
      await flushPromises();

      const { event, flow } = requestClose();
      await flow;

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(showMessageBox).toHaveBeenCalledTimes(1);
      expect(onCloseCancelled).toHaveBeenCalledTimes(1);
      expect(win.close).not.toHaveBeenCalled();
    });
  });

  describe("quitting (⌘Q)", () => {
    it("restarts the quit after closing, since preventing close cancelled it", async () => {
      quitting = true;
      const { flow } = requestClose();
      await flushPromises();
      session.handleCloseAcknowledged();
      await flow;
      expect(quit).toHaveBeenCalledTimes(1);
      expect(quit.mock.invocationCallOrder[0]).toBeGreaterThan(
        win.close.mock.invocationCallOrder[0],
      );
    });

    it("does not quit after a plain window close", async () => {
      const { flow } = requestClose();
      await flushPromises();
      session.handleCloseAcknowledged();
      await flow;
      expect(quit).not.toHaveBeenCalled();
    });

    it("does not quit when the user cancels", async () => {
      quitting = true;
      session.setDocumentState(UNSAVED_UNTITLED);
      userChooses(CANCEL);
      await requestClose().flow;
      expect(quit).not.toHaveBeenCalled();
      expect(onCloseCancelled).toHaveBeenCalledTimes(1);
    });

    it("reads the quitting flag when the close finishes, not when it started", async () => {
      const { flow } = requestClose();
      await flushPromises();
      quitting = true;
      session.handleCloseAcknowledged();
      await flow;
      expect(quit).toHaveBeenCalledTimes(1);
    });
  });

  describe("renderer gone", () => {
    it("closes immediately without prompting or waiting when the renderer has crashed", async () => {
      session.setDocumentState(UNSAVED_UNTITLED);
      win.webContents.isCrashed.mockReturnValue(true);
      await requestClose().flow;
      expect(showMessageBox).not.toHaveBeenCalled();
      expect(sentChannels()).toEqual([]);
      expect(win.closed).toBe(true);
    });

    it("closes immediately when webContents is already destroyed", async () => {
      win.webContents.isDestroyed.mockReturnValue(true);
      await requestClose().flow;
      expect(win.closed).toBe(true);
    });

    it("stops waiting for the final save when the renderer dies", async () => {
      const { flow } = requestClose();
      await flushPromises();
      session.handleRendererGone();
      await flow;
      expect(win.closed).toBe(true);
    });

    it("aborts the close if the renderer dies during Save As; the next close goes through", async () => {
      session.setDocumentState(UNSAVED_UNTITLED);
      userChooses(SAVE);
      const { flow } = requestClose();
      await flushPromises();
      session.handleRendererGone();
      await flow;
      expect(win.close).not.toHaveBeenCalled();

      win.webContents.isCrashed.mockReturnValue(true);
      await requestClose().flow;
      expect(win.closed).toBe(true);
    });

    it("is harmless when nothing is pending", () => {
      expect(() => session.handleRendererGone()).not.toThrow();
    });
  });
});

describe("per-window isolation", () => {
  it("an acknowledgement for one window does not close another", async () => {
    const otherWin = createFakeWindow();
    const other = createSession(otherWin);

    const closingFirst = requestClose();
    const otherEvent = closeEvent();
    const closingOther = other.handleClose(otherEvent);
    await flushPromises();

    other.handleCloseAcknowledged();
    await closingOther;
    expect(otherWin.closed).toBe(true);
    expect(win.close).not.toHaveBeenCalled();

    session.handleCloseAcknowledged();
    await closingFirst.flow;
    expect(win.closed).toBe(true);
  });

  it("document state is per window", () => {
    const other = createSession(createFakeWindow());
    session.setDocumentState(UNSAVED_UNTITLED);
    expect(other.getDocumentState().dirty).toBe(false);
  });

  it("a recreated window starts fresh, even after the previous one closed", async () => {
    session.setDocumentState(UNSAVED_UNTITLED);
    userChooses(DONT_SAVE);
    const { flow } = requestClose();
    await flushPromises();
    session.handleCloseAcknowledged();
    await flow;

    const nextWin = createFakeWindow();
    const next = createSession(nextWin);
    expect(next.getDocumentState().dirty).toBe(false);
    const event = closeEvent();
    const closing = next.handleClose(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    await flushPromises();
    next.handleCloseAcknowledged();
    await closing;
    expect(nextWin.closed).toBe(true);
  });
});

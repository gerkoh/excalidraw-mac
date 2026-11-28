import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_DOCUMENT_STATE,
  normalizeDocumentState,
  needsSavePrompt,
  UNSAVED_CHOICES,
  UNSAVED_ACTIONS,
  PROMPT_OPTIONS,
  choiceFromResponse,
  decideUnsavedChangesAction,
  confirmUnsavedChanges,
} = require("./unsavedChanges");

const state = (overrides = {}) => ({
  dirty: true,
  hasFilePath: false,
  hasContent: true,
  ...overrides,
});

const { SAVE, DONT_SAVE, CANCEL } = UNSAVED_CHOICES;
const { PROCEED, SAVE_AS } = UNSAVED_ACTIONS;

describe("normalizeDocumentState", () => {
  it("keeps a well-formed state", () => {
    expect(normalizeDocumentState(state())).toEqual(state());
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "dirty"],
    ["a number", 1],
    ["an empty object", {}],
  ])("treats %s as the clean default", (_label, raw) => {
    expect(normalizeDocumentState(raw)).toEqual(DEFAULT_DOCUMENT_STATE);
  });

  it.each([
    ["truthy strings", { dirty: "true", hasFilePath: "yes", hasContent: "1" }],
    ["numbers", { dirty: 1, hasFilePath: 1, hasContent: 1 }],
    ["objects", { dirty: {}, hasFilePath: [], hasContent: {} }],
  ])("only accepts strict true, not %s", (_label, raw) => {
    expect(normalizeDocumentState(raw)).toEqual(DEFAULT_DOCUMENT_STATE);
  });

  it("drops unknown fields", () => {
    expect(normalizeDocumentState({ ...state(), filePath: "/a.excalidraw", extra: 1 })).toEqual(
      state(),
    );
  });

  it("the default is clean, untitled and empty, and frozen", () => {
    expect(DEFAULT_DOCUMENT_STATE).toEqual({ dirty: false, hasFilePath: false, hasContent: false });
    expect(Object.isFrozen(DEFAULT_DOCUMENT_STATE)).toBe(true);
  });
});

describe("needsSavePrompt", () => {
  // every combination of the three flags; only untitled + dirty + non-empty prompts
  const combos = [];
  for (const dirty of [true, false]) {
    for (const hasFilePath of [true, false]) {
      for (const hasContent of [true, false]) {
        combos.push([{ dirty, hasFilePath, hasContent }, dirty && !hasFilePath && hasContent]);
      }
    }
  }

  it.each(combos)("%j → %s", (documentState, expected) => {
    expect(needsSavePrompt(documentState)).toBe(expected);
  });
});

describe("choiceFromResponse", () => {
  it.each([
    [0, SAVE],
    [1, DONT_SAVE],
    [2, CANCEL],
  ])("button %i is %s", (response, choice) => {
    expect(choiceFromResponse(response)).toBe(choice);
  });

  it.each([[-1], [3], [99], [undefined], [null], ["0"]])(
    "unknown response %j is treated as Cancel",
    (response) => {
      expect(choiceFromResponse(response)).toBe(CANCEL);
    },
  );
});

describe("PROMPT_OPTIONS", () => {
  it("offers Save, Don't Save, Cancel in macOS order", () => {
    expect(PROMPT_OPTIONS.buttons).toEqual(["Save", "Don't Save", "Cancel"]);
  });

  it("defaults to Save and maps Esc / Cmd+. to Cancel", () => {
    expect(PROMPT_OPTIONS.defaultId).toBe(0);
    expect(PROMPT_OPTIONS.cancelId).toBe(2);
    expect(choiceFromResponse(PROMPT_OPTIONS.cancelId)).toBe(CANCEL);
    expect(choiceFromResponse(PROMPT_OPTIONS.defaultId)).toBe(SAVE);
  });

  it("asks the question in the message and explains the risk in the detail", () => {
    expect(PROMPT_OPTIONS.message).toBe(
      "Do you want to save the changes you made to this drawing?",
    );
    expect(PROMPT_OPTIONS.detail).toMatch(/lost/);
  });
});

describe("decideUnsavedChangesAction", () => {
  it.each([
    [SAVE, SAVE_AS],
    [DONT_SAVE, PROCEED],
    [CANCEL, CANCEL],
    [undefined, CANCEL],
    ["something else", CANCEL],
  ])("untitled + dirty + content, user chose %s → %s", (choice, action) => {
    expect(decideUnsavedChangesAction(state(), choice)).toBe(action);
  });

  it.each([
    ["clean", state({ dirty: false })],
    ["has a file path (auto-saved)", state({ hasFilePath: true })],
    ["empty", state({ hasContent: false })],
    ["the default state", DEFAULT_DOCUMENT_STATE],
  ])("proceeds without consulting the choice when %s", (_label, documentState) => {
    for (const choice of [SAVE, DONT_SAVE, CANCEL, undefined]) {
      expect(decideUnsavedChangesAction(documentState, choice)).toBe(PROCEED);
    }
  });
});

describe("confirmUnsavedChanges", () => {
  it("does not show a dialog when no prompt is needed", async () => {
    const showMessageBox = vi.fn();
    await expect(confirmUnsavedChanges(state({ dirty: false }), showMessageBox)).resolves.toBe(
      PROCEED,
    );
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it.each([
    [0, SAVE_AS],
    [1, PROCEED],
    [2, CANCEL],
  ])("maps button %i to %s", async (response, action) => {
    const showMessageBox = vi.fn(() => Promise.resolve({ response }));
    await expect(confirmUnsavedChanges(state(), showMessageBox)).resolves.toBe(action);
    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(showMessageBox).toHaveBeenCalledWith(PROMPT_OPTIONS);
  });

  it("propagates a dialog failure to the caller", async () => {
    const error = new Error("dialog failed");
    await expect(confirmUnsavedChanges(state(), () => Promise.reject(error))).rejects.toBe(error);
  });
});

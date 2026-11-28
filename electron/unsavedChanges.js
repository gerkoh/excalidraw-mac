// --- Document state reported by the renderer ---

// a window that never reported (still loading, crashed) is treated as clean
const DEFAULT_DOCUMENT_STATE = Object.freeze({
  dirty: false,
  hasFilePath: false,
  hasContent: false,
});

// IPC payloads come from the renderer, so anything that isn't strictly `true` is false
const normalizeDocumentState = (raw) => {
  if (!raw || typeof raw !== "object") return DEFAULT_DOCUMENT_STATE;
  return {
    dirty: raw.dirty === true,
    hasFilePath: raw.hasFilePath === true,
    hasContent: raw.hasContent === true,
  };
};

// --- "Save changes?" decision ---

// files with a path are auto-saved; only untitled, non-empty, edited drawings can lose work
const needsSavePrompt = (state) => state.dirty && !state.hasFilePath && state.hasContent;

const UNSAVED_CHOICES = Object.freeze({
  SAVE: "save",
  DONT_SAVE: "dont-save",
  CANCEL: "cancel",
});

const UNSAVED_ACTIONS = Object.freeze({
  PROCEED: "proceed",
  SAVE_AS: "save-as",
  CANCEL: "cancel",
});

// button order is the macOS convention: Save (default), Don't Save, Cancel (Esc)
const PROMPT_BUTTONS = [
  { label: "Save", choice: UNSAVED_CHOICES.SAVE },
  { label: "Don't Save", choice: UNSAVED_CHOICES.DONT_SAVE },
  { label: "Cancel", choice: UNSAVED_CHOICES.CANCEL },
];
const CANCEL_BUTTON_INDEX = 2;

const PROMPT_OPTIONS = Object.freeze({
  type: "warning",
  message: "Do you want to save the changes you made to this drawing?",
  detail: "Your changes will be lost if you don't save them.",
  buttons: PROMPT_BUTTONS.map((button) => button.label),
  defaultId: 0,
  cancelId: CANCEL_BUTTON_INDEX,
  noLink: true,
});

// unknown indexes (e.g. dialog dismissed some other way) are treated as Cancel, the safe choice
const choiceFromResponse = (response) =>
  (Number.isInteger(response) && PROMPT_BUTTONS[response]?.choice) || UNSAVED_CHOICES.CANCEL;

// pure decision: document state + the user's choice (only consulted when a prompt is needed)
const decideUnsavedChangesAction = (state, choice) => {
  if (!needsSavePrompt(state)) return UNSAVED_ACTIONS.PROCEED;
  if (choice === UNSAVED_CHOICES.SAVE) return UNSAVED_ACTIONS.SAVE_AS;
  if (choice === UNSAVED_CHOICES.DONT_SAVE) return UNSAVED_ACTIONS.PROCEED;
  return UNSAVED_ACTIONS.CANCEL;
};

// shows the prompt only when needed; showMessageBox is injected (dialog.showMessageBox bound to a window)
const confirmUnsavedChanges = async (state, showMessageBox) => {
  if (!needsSavePrompt(state)) return UNSAVED_ACTIONS.PROCEED;
  const { response } = await showMessageBox(PROMPT_OPTIONS);
  return decideUnsavedChangesAction(state, choiceFromResponse(response));
};

module.exports = {
  DEFAULT_DOCUMENT_STATE,
  normalizeDocumentState,
  needsSavePrompt,
  UNSAVED_CHOICES,
  UNSAVED_ACTIONS,
  PROMPT_OPTIONS,
  choiceFromResponse,
  decideUnsavedChangesAction,
  confirmUnsavedChanges,
};

let nextMessageId = 1;

export function createMessageId() {
  return `msg-${nextMessageId++}`;
}

/** Reset counter between tests. */
export function resetMessageIdsForTests() {
  nextMessageId = 1;
}

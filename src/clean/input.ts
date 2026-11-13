/**
 * Clean Inbox Input Handling
 * Parse user keyboard input into actions
 */

/**
 * Action type including 'quit' for exit
 */
export type ActionType = 'delete' | 'archive' | 'reply' | 'todo' | 'skip' | 'quit';

/**
 * Map of keyboard keys to action types
 */
export const ACTION_KEYS: Record<string, ActionType> = {
  d: 'delete',
  a: 'archive',
  r: 'reply',
  t: 'todo',
  s: 'skip',
  q: 'quit',
};

/**
 * Check if a key is a valid action key
 *
 * @param key - Keyboard key pressed
 * @returns true if key maps to an action
 */
export function isValidActionKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().trim();
  return normalizedKey in ACTION_KEYS;
}

/**
 * Parse a key press into an action type
 *
 * @param key - Keyboard key pressed
 * @returns Action type or null if invalid
 */
export function parseActionKey(key: string): ActionType | null {
  const normalizedKey = key.toLowerCase().trim();

  if (normalizedKey === '') {
    return null;
  }

  if (normalizedKey in ACTION_KEYS) {
    return ACTION_KEYS[normalizedKey];
  }

  return null;
}

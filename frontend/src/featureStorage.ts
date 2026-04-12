export type FeatureStorageScope = 'quiz' | 'perspectives' | 'concept-map';
const FEATURE_STORAGE_PREFIX = 'vq_feature_state:';

const getFeatureStorageKey = (
  username: string,
  scope: FeatureStorageScope,
  videoUrl: string,
) => `${FEATURE_STORAGE_PREFIX}${scope}:${username}:${videoUrl}`;

export function loadFeatureState<T>(
  username: string | null,
  scope: FeatureStorageScope,
  videoUrl: string | null,
): T | null {
  if (!username || !videoUrl) return null;

  const raw = localStorage.getItem(getFeatureStorageKey(username, scope, videoUrl));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(getFeatureStorageKey(username, scope, videoUrl));
    return null;
  }
}

export function saveFeatureState<T>(
  username: string | null,
  scope: FeatureStorageScope,
  videoUrl: string | null,
  value: T,
): void {
  if (!username || !videoUrl) return;

  localStorage.setItem(
    getFeatureStorageKey(username, scope, videoUrl),
    JSON.stringify(value),
  );
}

export function migrateFeatureStateUsername(
  previousUsername: string,
  nextUsername: string,
): void {
  if (!previousUsername || !nextUsername || previousUsername === nextUsername) return;

  const usernameSegment = `:${previousUsername}:`;
  const keysToMigrate: string[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      key &&
      key.startsWith(FEATURE_STORAGE_PREFIX) &&
      key.includes(usernameSegment)
    ) {
      keysToMigrate.push(key);
    }
  }

  keysToMigrate.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value === null) return;

    const nextKey = key.replace(usernameSegment, `:${nextUsername}:`);
    localStorage.setItem(nextKey, value);
    localStorage.removeItem(key);
  });
}

export function clearFeatureStateForUsername(username: string): void {
  if (!username) return;

  const usernameSegment = `:${username}:`;
  const keysToDelete: string[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      key &&
      key.startsWith(FEATURE_STORAGE_PREFIX) &&
      key.includes(usernameSegment)
    ) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => localStorage.removeItem(key));
}

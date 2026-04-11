export type FeatureStorageScope = 'quiz' | 'perspectives' | 'concept-map';

const getFeatureStorageKey = (
  username: string,
  scope: FeatureStorageScope,
  videoUrl: string,
) => `vq_feature_state:${scope}:${username}:${videoUrl}`;

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

const placeholderFragments = ["replace", "your-", "example.com", "example.", "localhost"] as const;

export function hasUsableConfigValue(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized) && !placeholderFragments.some((fragment) => normalized?.includes(fragment));
}

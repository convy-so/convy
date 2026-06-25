export function isDefined<T>(
  value: T | null | undefined,
): value is T {
  return value !== null && value !== undefined;
}

export function requireValue<T>(
  value: T | null | undefined,
  message: string,
): T {
  if (!isDefined(value)) {
    throw new Error(message);
  }

  return value;
}

export function requireFirst<T>(
  values: readonly T[],
  message: string,
): T {
  return requireValue(values[0], message);
}

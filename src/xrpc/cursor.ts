export function createCursor<
  T extends { cid: string; createdAt: number; rowid: number } | undefined,
  R = T extends NonNullable<T> ? string : undefined,
>(item: T): R {
  return item
    ? (`${item.createdAt}::${item.cid}+${item.rowid}` as R)
    : (undefined as R);
}

export const cursorPattern = /(^$|^(\d+)::(\w+)\+(\d+))$/;

export function parseCursor(text: string) {
  const [, matched, time, cid, rowid] = text.match(cursorPattern) ?? [];
  if (!matched) {
    return undefined;
  }
  return {
    time: +time,
    cid,
    rowid: +rowid,
  };
}

export type Cursor = NonNullable<ReturnType<typeof parseCursor>>;

type TRange = {
  /** start rowId */
  s: number;
  /** end rowId */
  e: number;
};

export class Range {
  private range: TRange[] = [];

  constructor(range: TRange[] = []) {
    this.range = range;
  }

  append(result: { rowid: number }[], start: number | undefined) {
    if (!start) {
      return;
    }
    const end = result[result.length - 1]?.rowid ?? start;
    this.range.push({ s: start, e: end });
    this.range = this.range
      .sort((a, b) => b.s - a.s)
      .reduce((r, { s, e }) => {
        if (r.length) {
          const last = r[r.length - 1];
          if (s !== e && last.e <= s) {
            last.e = e;
            return r;
          }
          if (last.s === s && last.e === e) {
            return r;
          }
        }
        return r.concat([{ s, e }]);
      }, [] as TRange[]);
  }

  clear() {
    this.range = [];
  }

  get(row: { rowid: number } | undefined): TRange | undefined {
    return row && this.range.find((r) => row.rowid <= r.s && row.rowid > r.e);
  }

  next(row: { rowid: number } | undefined): TRange | undefined {
    return row && this.range.find((r) => r.s < row.rowid && r.s !== r.e);
  }

  isEOF(row: { rowid: number } | undefined) {
    return !!row && !!this.range.find((r) => r.s === r.e && r.e === row.rowid);
  }

  toString() {
    return JSON.stringify(this.range);
  }
}

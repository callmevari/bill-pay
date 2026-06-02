// Augment TanStack Table's column meta with a `label` field used by the
// column-visibility popover so it can render a human-readable name even
// when the column id is something opaque (composite columns, computed
// fields, etc.).
import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
  }
}

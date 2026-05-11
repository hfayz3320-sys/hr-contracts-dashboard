/**
 * Consistent Export → XLSX button used across data screens.
 *
 * The caller provides the rows already filtered + the column projection.
 * SheetJS is lazy-loaded by `exportToXlsx`; no bundle weight is added to
 * pages that never click the button.
 */
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { exportToXlsx, type ExportColumn } from '@/lib/export/xlsx-export';
import { useMe } from '@/lib/api/use-me';

interface ExportButtonProps<TRow> {
  filename: string;
  sheet: string;
  rows: TRow[];
  columns: ExportColumn<TRow>[];
  summary?: Array<{ label: string; value: string | number }>;
  disabled?: boolean;
}

export function ExportButton<TRow>(props: ExportButtonProps<TRow>) {
  const [busy, setBusy] = useState(false);
  const { data: me } = useMe();
  const isAdmin = me?.isAdmin === true;

  async function onClick() {
    setBusy(true);
    try {
      await exportToXlsx(
        {
          filename: props.filename,
          sheet: props.sheet,
          rows: props.rows,
          columns: props.columns,
          summary: props.summary,
        },
        { redactIdentity: !isAdmin },
      );
      toast.success(`Exported ${props.rows.length.toLocaleString()} rows`);
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={props.disabled || busy || props.rows.length === 0}
      className="gap-2"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Export
    </Button>
  );
}

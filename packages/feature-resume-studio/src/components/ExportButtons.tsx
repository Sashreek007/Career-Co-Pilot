import { Download, FileType2 } from 'lucide-react';

interface ExportButtonsProps {
  resumeId: string;
  onExportJson: (id: string) => void;
  onExportPdf: (id: string) => void;
}

export function ExportButtons({ resumeId, onExportJson, onExportPdf }: ExportButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onExportJson(resumeId)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export JSON
      </button>
      <button
        onClick={() => onExportPdf(resumeId)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
        title="PDF export requires backend connection"
      >
        <FileType2 className="w-3.5 h-3.5" />
        Export PDF
        <span className="text-zinc-600 ml-1">(stub)</span>
      </button>
    </div>
  );
}

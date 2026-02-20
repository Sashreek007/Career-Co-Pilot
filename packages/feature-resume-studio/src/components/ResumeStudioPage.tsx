import { useEffect } from 'react';
import { SplitPane, PageHeader } from '@career-copilot/ui';
import { useResumeStore } from '../state/useResumeStore';
import { VersionList } from './VersionList';
import { ResumePreview } from './ResumePreview';
import { DiffView } from './DiffView';
import { ExportButtons } from './ExportButtons';
import { GitCompareArrows } from 'lucide-react';

export function ResumeStudioPage() {
  const { versions, selectedId, compareId, isLoading, fetchVersions, selectVersion, setCompareId, exportJson, exportPdf } = useResumeStore();
  const selected = versions.find((v) => v.id === selectedId);
  const compare = versions.find((v) => v.id === compareId);
  const isComparing = !!(selected && compare);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <PageHeader
          title="Resume Studio"
          description={`${versions.length} resume versions`}
          actions={
            selected ? (
              <div className="flex items-center gap-2">
                {!isComparing ? (
                  <button
                    onClick={() => {
                      const other = versions.find((v) => v.id !== selectedId);
                      if (other) setCompareId(other.id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                  >
                    <GitCompareArrows className="w-3.5 h-3.5" />
                    Compare
                  </button>
                ) : (
                  <button
                    onClick={() => setCompareId(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-700 text-zinc-200 text-xs font-medium"
                  >
                    Exit Compare
                  </button>
                )}
                <ExportButtons
                  resumeId={selected.id}
                  onExportJson={exportJson}
                  onExportPdf={exportPdf}
                />
              </div>
            ) : null
          }
        />
      </div>

      <div className="flex-1 overflow-hidden mt-4">
        <SplitPane
          leftWidth="w-64"
          left={
            isLoading ? (
              <div className="flex items-center justify-center h-40 text-sm text-zinc-500">Loading…</div>
            ) : (
              <VersionList versions={versions} selectedId={selectedId} onSelect={selectVersion} />
            )
          }
          right={
            isComparing && compare ? (
              <DiffView versionA={selected!} versionB={compare} />
            ) : selected ? (
              <ResumePreview version={selected} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                Select a resume version
              </div>
            )
          }
        />
      </div>
    </div>
  );
}

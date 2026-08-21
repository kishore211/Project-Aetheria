import { useEffect, useRef, useState } from 'react';
import { Download, HardDriveDownload, Save, Trash2, Upload, X } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { worldAccess } from '../../utils/worldAccess';
import {
  SAVE_SLOTS,
  deleteSave,
  listSaves,
  parseSaveFile,
  readSave,
  saveToFileName,
  writeSave,
  type SaveMeta,
  type SaveSlot,
} from '../../utils/saveSystem';

const SLOT_LABELS: Record<SaveSlot, string> = {
  'slot-1': 'Slot 1',
  'slot-2': 'Slot 2',
  'slot-3': 'Slot 3',
  autosave: 'Autosave',
};

const formatWhen = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Three manual slots plus an autosave, and file import/export. */
const SavePanel = ({ open, onClose }: Props) => {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestLoad = useGameStore((state) => state.requestLoad);
  const unlockAchievement = useGameStore((state) => state.unlockAchievement);
  const year = useGameStore((state) => state.year);
  const season = useGameStore((state) => state.season);

  useEffect(() => {
    if (open) setSaves(listSaves());
  }, [open]);

  if (!open) return null;

  const metaFor = (slot: SaveSlot) => saves.find((save) => save.slot === slot);

  const handleSave = (slot: SaveSlot) => {
    const access = worldAccess.current;
    if (!access) {
      setMessage('The world is still waking up — try again in a moment.');
      return;
    }
    const save = access.captureSave(`Year ${year}, ${season}`);
    const error = writeSave(slot, save);
    setMessage(error ? `Could not save: ${error}` : `Saved to ${SLOT_LABELS[slot]}.`);
    if (!error) unlockAchievement('archivist');
    setSaves(listSaves());
  };

  const handleLoad = (slot: SaveSlot) => {
    const save = readSave(slot);
    if (!save) {
      setMessage('That slot is empty.');
      return;
    }
    requestLoad(save);
    onClose();
  };

  const handleDelete = (slot: SaveSlot) => {
    deleteSave(slot);
    setSaves(listSaves());
    setMessage(`${SLOT_LABELS[slot]} cleared.`);
  };

  const handleExport = () => {
    const access = worldAccess.current;
    if (!access) return;
    const save = access.captureSave(`Year ${year}, ${season}`);
    const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = saveToFileName(save);
    link.click();
    URL.revokeObjectURL(url);
    unlockAchievement('archivist');
    setMessage('World exported.');
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const save = parseSaveFile(text);
    if (!save) {
      setMessage('That file is not a readable Aetheria save.');
      return;
    }
    requestLoad(save);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="ui-modal w-full max-w-md bg-secondary rounded-xl shadow-2xl border border-muted/50 p-5 text-foreground">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <HardDriveDownload size={18} className="text-sky-300" />
            Worlds
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <ul className="space-y-2 mb-4">
          {SAVE_SLOTS.map((slot) => {
            const meta = metaFor(slot);
            return (
              <li
                key={slot}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/40 border border-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{SLOT_LABELS[slot]}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {meta
                      ? `${meta.label} · ${meta.population} souls · ${formatWhen(meta.savedAt)}`
                      : 'Empty'}
                  </span>
                </span>
                <button
                  type="button"
                  title="Save here"
                  className="tool-btn p-1.5 rounded bg-muted/60 hover:bg-muted"
                  onClick={() => handleSave(slot)}
                >
                  <Save size={14} />
                </button>
                <button
                  type="button"
                  title="Load this world"
                  disabled={!meta}
                  className="tool-btn p-1.5 rounded bg-muted/60 hover:bg-muted disabled:opacity-30"
                  onClick={() => handleLoad(slot)}
                >
                  <Upload size={14} />
                </button>
                <button
                  type="button"
                  title="Clear this slot"
                  disabled={!meta}
                  className="tool-btn p-1.5 rounded bg-muted/60 hover:bg-destructive/70 disabled:opacity-30"
                  onClick={() => handleDelete(slot)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2">
          <button
            type="button"
            className="tool-btn flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-muted/60 hover:bg-muted text-sm"
            onClick={handleExport}
          >
            <Download size={14} /> Export file
          </button>
          <button
            type="button"
            className="tool-btn flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-muted/60 hover:bg-muted text-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} /> Import file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImport}
          />
        </div>

        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Saves store your edits, creatures and kingdoms; untouched terrain is
          rebuilt from the world seed.
        </p>
      </div>
    </div>
  );
};

export default SavePanel;

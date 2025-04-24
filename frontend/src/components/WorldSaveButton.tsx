import React, { useState } from "react";

interface WorldSaveButtonProps {
  worldName: string;
  worldState: any;
  pngFile: File | null;
}

const WorldSaveButton: React.FC<WorldSaveButtonProps> = ({ worldName, worldState, pngFile }) => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // 1. Save PNG (if present)
      let pngSuccess = true;
      if (pngFile) {
        const formData = new FormData();
        formData.append("file", pngFile);
        formData.append("worldName", worldName);
        // Backend should save to <root>/worlds/<worldName>/<original.png>
        const pngRes = await fetch(`/api/worlds/${encodeURIComponent(worldName)}/upload-png`, {
          method: "POST",
          body: formData,
        });
        if (!pngRes.ok) {
          pngSuccess = false;
          setMessage("Failed to save PNG image.");
        }
      }

      // 2. Save world_state.json
      const wsRes = await fetch(`/api/world-cards/${encodeURIComponent(worldName)}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(worldState),
      });
      if (!wsRes.ok) {
        setMessage("Failed to save world state.");
      } else if (pngSuccess) {
        setMessage("World saved successfully.");
      }
    } catch (err: any) {
      setMessage("Error saving world: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="my-4">
      <button
        className="px-6 py-2 rounded-lg shadow bg-green-700 text-white hover:bg-green-800 transition-colors font-medium"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save World"}
      </button>
      {message && (
        <div className="mt-2 text-sm text-white bg-black/70 rounded p-2">{message}</div>
      )}
    </div>
  );
};

export default WorldSaveButton;

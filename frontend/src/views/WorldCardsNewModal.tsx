// frontend/src/views/WorldCardsNewModal.tsx
import React, { useRef, useState } from "react";
import { Dialog } from "../components/Dialog";

interface WorldCardsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (world: { name: string; description: string; image: File | null }) => void;
}

const WorldCardsNewModal: React.FC<WorldCardsNewModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImage(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim(), image });
    setName("");
    setDescription("");
    setImage(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="New World"
      buttons={[]}
      showCloseButton={false}
      className="max-w-md"
    >
      <form
        className="flex flex-col gap-4 w-full"
        onSubmit={handleSubmit}
      >
        <label className="text-slate-700 dark:text-slate-300">World Name</label>
        <input
          className="input input-bordered w-full dark:bg-stone-800 dark:text-white"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          maxLength={64}
        />
        <label className="text-slate-700 dark:text-slate-300">Description</label>
        <textarea
          className="input input-bordered w-full min-h-[80px] dark:bg-stone-800 dark:text-white"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={256}
        />
        <label className="text-slate-700 dark:text-slate-300">World Image (PNG)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          onChange={handleImageChange}
          className="file-input file-input-bordered w-full dark:bg-stone-800 dark:text-white"
        />
        {image && (
          <img
            src={URL.createObjectURL(image)}
            alt="World Preview"
            className="mt-2 rounded-lg border w-32 h-32 object-cover mx-auto"
          />
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button
            type="button"
            className="px-6 py-2 rounded-lg shadow bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors font-medium"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 rounded-lg shadow bg-blue-700 text-white hover:bg-blue-800 transition-colors font-medium"
            disabled={!name.trim()}
          >
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
};

export default WorldCardsNewModal;

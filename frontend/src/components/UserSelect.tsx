import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, ImagePlus } from 'lucide-react';
import { Dialog } from './Dialog';
import { createEmptyCharacterCard } from '../types/schema';

interface UserProfile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

interface UserSelectProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: UserProfile) => void;
  currentUser?: string;
}

const UserSelect: React.FC<UserSelectProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentUser
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  
  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserDescription, setNewUserDescription] = useState('');
  const [newUserImage, setNewUserImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to load users');
      
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        throw new Error(data.message || 'Failed to load users');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setNewUserImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) {
      setError('Please enter a name');
      return;
    }

    if (!newUserImage) {
      setError('Please select a profile image');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Create a minimal character card structure for the user
      const userCard = createEmptyCharacterCard();
      userCard.data.name = newUserName.trim();
      userCard.data.description = newUserDescription.trim();

      // Create form data
      const formData = new FormData();
      formData.append('file', newUserImage);
      formData.append('metadata', JSON.stringify(userCard));

      // Upload to users directory
      const response = await fetch('/api/user-image', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create user');
      }

      // Reset form and refresh users
      resetNewUserForm();
      loadUsers();
      setShowNewUserDialog(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetNewUserForm = () => {
    setNewUserName('');
    setNewUserDescription('');
    setNewUserImage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-2xl h-[80vh] bg-stone-900 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-800">
          <h2 className="text-lg font-semibold">Select User</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-800">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            className="w-full px-4 py-2 bg-stone-950 border border-stone-700 rounded-lg 
                     focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* User Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="text-center text-red-500 p-4">{error}</div>
          ) : isLoading ? (
            <div className="text-center text-gray-400 p-4">Loading users...</div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {/* Create New User Card */}
              <div 
                className="aspect-square bg-stone-950 rounded-lg border-2 border-dashed 
                         border-stone-800 hover:border-stone-700 transition-colors
                         flex flex-col items-center justify-center cursor-pointer
                         text-gray-400 hover:text-gray-200"
                onClick={() => setShowNewUserDialog(true)}
              >
                <UserPlus size={32} />
                <span className="mt-2">New User</span>
              </div>

              {/* User Cards */}
              {filteredUsers.map((user) => (
                <div
                  key={user.path}
                  className={`aspect-square relative group cursor-pointer 
                           ${currentUser === user.name ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => onSelect(user)}
                >
                  <div className="absolute inset-0 bg-stone-950 rounded-lg overflow-hidden">
                    <img
                      src={`/api/user-image/${encodeURIComponent(user.path)}`}
                      alt={user.name}
                      className="w-full h-full object-cover transform group-hover:scale-105 
                             transition-transform"
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-black/50 p-2">
                    <div className="text-white text-center truncate">{user.name}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create New User Dialog */}
      <Dialog
        isOpen={showNewUserDialog}
        onClose={() => {
          setShowNewUserDialog(false);
          resetNewUserForm();
        }}
        title="Create New User"
        buttons={[
          {
            label: isSubmitting ? 'Creating...' : 'Create',
            onClick: handleCreateUser,
            variant: 'primary',
            disabled: isSubmitting
          },
          {
            label: 'Cancel',
            onClick: () => {
              setShowNewUserDialog(false);
              resetNewUserForm();
            },
            disabled: isSubmitting
          }
        ]}
      >
        <div className="space-y-4">
          {/* Image Upload */}
          <div 
            className="relative w-32 h-32 mx-auto cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center 
                           bg-stone-800 rounded-lg border-2 border-dashed border-stone-700
                           group-hover:border-stone-600 transition-colors">
                <ImagePlus className="w-8 h-8 text-gray-400 group-hover:text-gray-300" />
                <span className="mt-2 text-sm text-gray-400 group-hover:text-gray-300">
                  Select Image
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Name
            </label>
            <input
              type="text"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
                       rounded-lg focus:ring-1 focus:ring-blue-500"
              placeholder="Enter name"
            />
          </div>

          {/* Description Field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={newUserDescription}
              onChange={(e) => setNewUserDescription(e.target.value)}
              className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
                       rounded-lg focus:ring-1 focus:ring-blue-500 h-24 resize-none"
              placeholder="Enter description"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-500 bg-red-950/50 p-3 rounded-lg">
              {error}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
};

export default UserSelect;
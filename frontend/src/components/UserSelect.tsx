// frontend/src/components/UserSelect.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, UserPlus, ImagePlus, Trash2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { createEmptyCharacterCard } from '../types/schema';
import { UserProfile } from '../types/messages'; // *** IMPORT the shared type ***

interface UserSelectProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: UserProfile) => void; // Uses the imported UserProfile type
  currentUser?: string; // This prop remains a string (the name) for comparison
}

// --- Animation Duration (milliseconds) ---
const DELETE_ANIMATION_DURATION = 300;

const UserSelect: React.FC<UserSelectProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentUser
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]); // Uses the imported UserProfile type
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);

  // --- State for Delete Functionality ---
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteFilename, setConfirmDeleteFilename] = useState<string | null>(null);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
  // --- End Delete State ---

  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserDescription, setNewUserDescription] = useState('');
  const [newUserImage, setNewUserImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Memoized filtering
  const filteredUsers = useMemo(() => {
    const searchLower = searchTerm.toLowerCase().trim();
    if (!searchLower) return users;
    return users.filter(user =>
      user.name.toLowerCase().includes(searchLower)
    );
  }, [users, searchTerm]);

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // --- Reset delete states on load ---
      setDeleteError(null);
      setConfirmDeleteFilename(null);
      setDeletingFilename(null);
      // --- End Reset ---

      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to load users');

      const data = await response.json();
      console.log('Loaded users data:', data); // Debug log

      if (data.success && Array.isArray(data.users)) {
        // Map the fetched data to the imported UserProfile type
        const mappedUsers: UserProfile[] = data.users.map((user: any): UserProfile => ({
          name: user.name || 'Unnamed User', // Provide default if name is missing
          filename: user.path || user.filename || '', // Provide default if filename/path is missing
          size: user.size || 0,
          modified: user.modified || Date.now(),
          id: ''
        })).filter((user: { filename: any; }) => user.filename); // Filter out any users without a filename

        setUsers(mappedUsers.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
          setError(data.message || 'Failed to load users');
          setUsers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    } else {
        // Reset state when dialog closes
        setSearchTerm('');
        setError(null);
        setDeleteError(null);
        setConfirmDeleteFilename(null);
        setDeletingFilename(null);
    }
  }, [isOpen, loadUsers]);

  // --- Handler for clicking the trash icon ---
  const handleTrashIconClick = (event: React.MouseEvent, filename: string) => {
    event.stopPropagation();
    setDeleteError(null);

    if (deletingFilename) return;

    if (confirmDeleteFilename === filename) {
      setConfirmDeleteFilename(null);
      initiateDeleteAnimation(filename);
    } else {
      setConfirmDeleteFilename(filename);
    }
  };

  // --- Start animation and schedule API call ---
  const initiateDeleteAnimation = (filename: string) => {
     console.log(`Initiating delete animation for user file: ${filename}`);
     setDeletingFilename(filename);

     setTimeout(() => {
       handleConfirmDeleteApiCall(filename);
     }, DELETE_ANIMATION_DURATION);
  };

  // --- Handle the actual API call after animation delay ---
  const handleConfirmDeleteApiCall = async (filename: string) => {
    // Log which file we are trying to delete
    console.log(`Performing API delete for user file: ${filename}`);
    try {
      // *** THIS IS THE CORRECTED LINE ***
      // Use the new dedicated endpoint for deleting user files
      const response = await fetch(`/api/user/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      // *** END OF CORRECTION ***

      // Process the response (check for errors, parse JSON)
      const result = await response.json().catch(() => ({
          message: response.ok ? 'Deleted successfully' : `Server error (${response.status})`
      }));

      // If the response status code indicates failure
      if (!response.ok) {
        throw new Error(result.detail || result.message || `Failed to delete (${response.status})`);
      }

      // Log success and clear error message
      console.log(`Successfully deleted user file via API: ${filename}`);
      setDeleteError(null);

      // Remove user from local state AFTER successful API call
      setUsers(prevUsers => prevUsers.filter(user => user.filename !== filename));

    } catch (err) {
      // Log error and display message
      console.error(`API Deletion failed for user file ${filename}:`, err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');

      // Reset states on failure
      setDeletingFilename(null);
      setConfirmDeleteFilename(null);
    }
  };


  // --- User Selection Handler ---
  const handleSelectUser = (user: UserProfile) => {
      if (deletingFilename === user.filename || confirmDeleteFilename === user.filename) {
          return;
      }
      setConfirmDeleteFilename(null);
      setDeleteError(null);
      onSelect(user);
  };


  // --- New User Creation Logic ---
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WEBP)'); return;
    }
    setNewUserImage(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
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
      const userCard = createEmptyCharacterCard();
      userCard.data.name = newUserName.trim();
      userCard.data.description = newUserDescription.trim();

      const formData = new FormData();
      formData.append('file', newUserImage);
      formData.append('metadata', JSON.stringify(userCard));

      const response = await fetch('/api/user-image/create', { method: 'POST', body: formData });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to create user (${response.status})` }));
        throw new Error(errorData.message || 'Failed to create user');
      }

      const data = await response.json();
      if (data.success && data.filename) {
        const newUser: UserProfile = {
          name: newUserName.trim(),
          filename: data.filename,
          size: newUserImage.size,
          modified: Date.now(),
          id: ''
        };
        resetNewUserForm();
        await loadUsers();
        setShowNewUserDialog(false);
        onSelect(newUser);
      } else {
          throw new Error(data.message || 'Failed to create user (invalid response).');
      }
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  // --- End New User Logic ---


  if (!isOpen) return null;

  return (
    // --- Main Modal Container ---
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-stone-900 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-800 flex-none">
          <h2 className="text-lg font-semibold text-white">Select User</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors rounded-full hover:bg-stone-700"
            aria-label="Close user selection"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-800 flex-none">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users..."
            className="w-full px-4 py-2 bg-stone-950 border border-stone-700 rounded-lg text-white placeholder-slate-400
                     focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Error Display Areas */}
        {deleteError && (
            <div className="flex-none p-3 mx-4 mt-4 bg-red-900 border border-red-700 text-white rounded-md text-sm flex justify-between items-center shadow-lg">
            <span className="break-words mr-2"><strong>Deletion Error:</strong> {deleteError}</span>
            <button onClick={() => setDeleteError(null)} className="ml-auto flex-shrink-0 px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white" aria-label="Dismiss error">Dismiss</button>
            </div>
        )}
        {!deleteError && error && (
            <div className="flex-none p-3 mx-4 mt-4 bg-yellow-900 border border-yellow-700 text-yellow-100 rounded-md text-sm flex justify-between items-center shadow-lg">
            <span className="break-words mr-2"><strong>Notice:</strong> {error}</span>
            <button onClick={() => setError(null)} className="ml-auto flex-shrink-0 px-2 py-0.5 bg-yellow-700 hover:bg-yellow-600 rounded text-xs focus:outline-none focus:ring-1 focus:ring-white" aria-label="Dismiss notice">Dismiss</button>
            </div>
        )}

        {/* --- User Grid - Scrollable Area --- */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center text-gray-400 p-4">Loading users...</div>
          ) : (
            <>
              {/* Show message if no users found but don't hide the grid */}
              {!isLoading && users.length === 0 && !error && (
                <div className="text-center text-gray-400 p-4 mb-4">
                  No users found. Create a new user to get started.
                </div>
              )}
              
              {/* Always show the grid with at least the New User card */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {/* --- Create New User Card --- Always visible */}
                <div
                  key="new-user-card"
                  className={`
                    relative aspect-[3/4] sm:aspect-square bg-stone-950 rounded-lg border-2 border-dashed
                    border-stone-800 hover:border-stone-700 transition-all duration-200 ease-in-out
                    flex flex-col items-center justify-center cursor-pointer
                    text-gray-400 hover:text-gray-200 hover:scale-[1.02] group p-2
                    ${isSubmitting ? 'opacity-50 cursor-default' : ''}
                    ${deletingFilename ? 'pointer-events-none opacity-50' : ''}
                  `}
                  onClick={() => !isSubmitting && !deletingFilename && setShowNewUserDialog(true)}
                  role="button"
                  tabIndex={0}
                  aria-label="Create a new user profile"
                >
                  <UserPlus size={32} className="transition-transform group-hover:scale-110 mb-1"/>
                  <span className="mt-1 text-sm text-center px-1">New User</span>
                </div>

                {/* Only map over users if there are any */}
                {filteredUsers.map((user) => {
                  const isConfirmingDelete = confirmDeleteFilename === user.filename;
                  const isDeleting = deletingFilename === user.filename;

                  return (
                    // --- Individual Card Container ---
                    <div
                      key={user.filename}
                      className={`
                        relative group aspect-[3/4] sm:aspect-square cursor-pointer rounded-lg overflow-hidden shadow-md bg-stone-800
                        transition-all ${isDeleting ? `duration-${DELETE_ANIMATION_DURATION} ease-out` : 'duration-200 ease-in-out'}
                        ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
                        hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-stone-900
                        ${currentUser === user.name && !isDeleting && !isConfirmingDelete ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-stone-900' : ''}
                        ${isConfirmingDelete ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-stone-900' : ''}
                      `}
                      onClick={() => handleSelectUser(user)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select user ${user.name}`}
                    >
                      {/* --- Delete Button (Conditionally Rendered) --- */}
                      {!isDeleting && (
                          <button
                            title={isConfirmingDelete ? "Confirm Delete" : "Delete user profile"}
                            onClick={(e) => handleTrashIconClick(e, user.filename)}
                            tabIndex={-1}
                            className={`absolute top-1.5 left-1.5 z-10 p-1 rounded-full backdrop-blur-sm
                                        bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
                                        transition-all duration-200 ease-in-out
                                        hover:bg-red-700/70 hover:scale-110 focus:outline-none
                                        focus:opacity-100 focus:bg-red-700/70 focus:scale-110 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-stone-800
                                        ${isConfirmingDelete ? '!opacity-100 !bg-red-600/80 scale-110' : ''}
                                        ${isConfirmingDelete ? 'tabindex-0' : 'group-hover:tabindex-0 group-focus-within:tabindex-0'}
                                      `}
                              aria-label={isConfirmingDelete ? `Confirm delete ${user.name}` : `Delete ${user.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                      )}
                      {/* --- End Delete Button --- */}

                      {/* --- User Image Container --- */}
                      <div className="absolute inset-0 bg-stone-950">
                        <img
                          key={`${user.filename}-img`}
                          src={`/api/user-image/serve/${encodeURIComponent(user.filename)}`}
                          alt={user.name}
                          className={`w-full h-full object-cover object-center transition-transform duration-300 ${isDeleting ? '' : 'group-hover:scale-105 group-focus:scale-105'}`}
                          loading="lazy"
                          onError={(e) => {
                            console.error(`Failed to load image for user: ${user.name} (${user.filename})`);
                            (e.target as HTMLImageElement).style.visibility = 'hidden';
                          }}
                        />
                      </div>
                      {/* --- Name Overlay --- */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium text-center truncate rounded-b-lg pointer-events-none">
                        {user.name}
                      </div>
                    </div> // --- End Individual Card ---
                  );
                })} {/* End map */}
              </div> 
            </>
          )}
        </div> {/* --- End Scrollable Area --- */}

      </div> {/* --- End Modal content container --- */}

      {/* --- Create New User Dialog --- */}
      <Dialog
          isOpen={showNewUserDialog}
          onClose={() => { setShowNewUserDialog(false); resetNewUserForm(); }}
          title="Create New User"
          buttons={[
            { label: 'Cancel', onClick: () => { setShowNewUserDialog(false); resetNewUserForm(); }, disabled: isSubmitting },
            { label: isSubmitting ? 'Creating...' : 'Create', onClick: handleCreateUser, variant: 'primary', disabled: isSubmitting || !newUserName.trim() || !newUserImage }
          ]}
      >
         <div className="space-y-4">
            {/* Image Upload */}
            <div className="relative w-32 h-32 mx-auto cursor-pointer group rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-stone-900"
                 onClick={() => fileInputRef.current?.click()}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                 tabIndex={0}
            >
                {previewUrl ? ( <img src={previewUrl} alt="New user preview" className="w-full h-full object-cover rounded-lg"/> ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-stone-800 rounded-lg border-2 border-dashed border-stone-700 group-hover:border-stone-600 transition-colors">
                        <ImagePlus className="w-8 h-8 text-gray-400 group-hover:text-gray-300" />
                        <span className="mt-2 text-sm text-gray-400 group-hover:text-gray-300">Select Image</span>
                    </div>
                )}
                {/* Hidden File Input */}
                <input ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/webp" onChange={handleImageSelect} className="hidden" aria-hidden="true"/>
            </div>
            {/* Form Fields */}
            <div>
                <label htmlFor="new-user-name" className="block text-sm font-medium text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input id="new-user-name" type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none text-white placeholder-slate-500" placeholder="Enter name" required aria-required="true"/>
            </div>
            <div>
                <label htmlFor="new-user-desc" className="block text-sm font-medium text-gray-300 mb-1">Description (Optional)</label>
                <textarea id="new-user-desc" value={newUserDescription} onChange={(e) => setNewUserDescription(e.target.value)} className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 h-20 resize-none focus:outline-none text-white placeholder-slate-500" placeholder="Enter description (optional)"/>
            </div>
            {/* Error Message within Dialog */}
            {error && !deleteError && (
                <div className="text-sm text-red-500 bg-red-950/50 p-3 rounded-lg border border-red-800">Error: {error}</div>
            )}
        </div>
      </Dialog>

    </div> // --- End Fixed Position Wrapper ---
  );
};

export default UserSelect;
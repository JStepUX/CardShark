// frontend/src/components/UserSelect.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, UserPlus, ImagePlus, Trash2 } from 'lucide-react';
import { Dialog } from './common/Dialog';
import DeleteConfirmationDialog from './common/DeleteConfirmationDialog';
import Button from './common/Button';
import { createEmptyCharacterCard } from '../types/schema';
import { UserProfile } from '../types/messages'; // *** IMPORT the shared type ***

/**
 * Helper function to properly encode file paths for API requests
 * This handles special characters that can cause issues
 */
const encodeFilePath = (path: string): string => {
  if (!path) return '';
  
  // Only use the filename portion, not the full path
  const fileName = path.split(/[\/\\]/).pop() || path;
  
  try {
    // Just encode the filename portion
    return encodeURIComponent(fileName);
  } catch (error) {
    console.error(`Failed to encode path: ${path}`, error);
    return 'unknown';
  }
};

interface UserSelectProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: UserProfile) => void; // Uses the imported UserProfile type
  currentUser?: string; // This prop remains a string (the name) for comparison
}

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

  // State for delete functionality using the DeleteConfirmationDialog
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingFilename, setDeletingFilename] = useState<string | null>(null);

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
      // Reset delete states on load
      setDeleteError(null);
      setUserToDelete(null);
      setDeletingFilename(null);

      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to load users');      const data = await response.json();
      console.log('Loaded users data:', data); // Debug log

      if (data.success && Array.isArray(data.data)) { // The backend returns users in the 'data' field
        // Map the fetched data to the imported UserProfile type
        const mappedUsers: UserProfile[] = data.data.map((user: any): UserProfile => ({ // Use data.data instead of data.users
          name: user.name || 'Unnamed User', // Provide default if name is missing
          description: user.description || '', // User description from PNG metadata
          filename: user.filename || '', // Use user.filename from response (not user.name)
          size: user.size || 0,
          modified: user.modified || Date.now(),
          id: '',
          user_uuid: user.user_uuid || undefined // UUID from database-backed user service
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
        setUserToDelete(null);
        setDeletingFilename(null);
    }
  }, [isOpen, loadUsers]);

  // Handler for clicking the trash icon - now opens the confirmation dialog
  const handleTrashIconClick = (event: React.MouseEvent, user: UserProfile) => {
    event.stopPropagation(); // Prevent card click
    setDeleteError(null); // Clear previous delete error
    setUserToDelete(user);
    setIsDeleteConfirmOpen(true);
  };

  // Handle the actual API call to delete the user after confirmation
  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    setIsDeleting(true);
    setDeletingFilename(userToDelete.filename);
    
    try {
      // Extract filename for better error messages
      const fileName = userToDelete.filename.split(/[\/\\]/).pop() || userToDelete.filename;
      
      console.log(`Performing API delete for user file: ${userToDelete.filename}`);
      
      // Use our improved path encoding function
      const encodedPath = encodeFilePath(userToDelete.filename);
      const response = await fetch(`/api/user/${encodedPath}`, {
        method: 'DELETE',
      });
      
      // Improved error handling
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        // Handle case where response is not valid JSON
        result = { message: response.ok ? 'Success' : `Failed to parse server response (${response.status})` };
      }
      
      // Check for success with better error messages
      if (!response.ok) {
        // Create more informative error message
        let errorMessage = result.detail || result.message || `Failed (${response.status})`;
        
        // Add more context for specific error codes
        if (response.status === 404) {
          errorMessage = `User not found: ${fileName}. The user profile may have been deleted already.`;
        } else if (response.status === 403) {
          errorMessage = `Permission denied when deleting: ${fileName}. Check file permissions.`;
        } else if (response.status >= 500) {
          errorMessage = `Server error while deleting: ${fileName}. Please try again later.`;
        }
        
        throw new Error(errorMessage);
      }
      
      console.log(`Successfully deleted user file via API: ${userToDelete.filename}`);
      
      // Remove user from state AFTER successful API call
      setUsers(prevUsers => prevUsers.filter(user => user.filename !== userToDelete.filename));
      
    } catch (err) {
      console.error(`API Deletion failed for user file ${userToDelete.filename}:`, err);
      setDeleteError(err instanceof Error ? err.message : 'Unknown deletion error.');
      // Reset deleting state on failure
      setDeletingFilename(null);
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      // Keep userToDelete set until animation completes
      setTimeout(() => {
        setUserToDelete(null);
      }, 300);
    }
  };
  
  // Cancel deletion
  const handleCancelDelete = () => {
    setIsDeleteConfirmOpen(false);
    setUserToDelete(null);
  };

  // User Selection Handler - avoid selecting users being deleted
  const handleSelectUser = (user: UserProfile) => {
    if (deletingFilename === user.filename) {
      return;
    }
    setDeleteError(null);
    onSelect(user);
  };

  // New User Creation Logic
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
      }      const data = await response.json();
      if (data.success && data.data?.filename) {
        const newUser: UserProfile = {
          name: newUserName.trim(),
          filename: data.data.filename,
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

  if (!isOpen) return null;

  return (
    // Main Modal Container
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-stone-900 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-800 flex-none">
          <h2 className="text-lg font-semibold text-white">Select User</h2>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={20} />}
            onClick={onClose}
            aria-label="Close user selection"
            pill
          />
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
            <Button variant="destructive" size="sm" onClick={() => setDeleteError(null)} aria-label="Dismiss error" className="ml-auto flex-shrink-0">Dismiss</Button>
            </div>
        )}
        {!deleteError && error && (
            <div className="flex-none p-3 mx-4 mt-4 bg-orange-900 border border-orange-700 text-orange-100 rounded-md text-sm flex justify-between items-center shadow-lg">
            <span className="break-words mr-2"><strong>Notice:</strong> {error}</span>
            <Button variant="secondary" size="sm" onClick={() => setError(null)} aria-label="Dismiss notice" className="ml-auto flex-shrink-0 !bg-orange-700 hover:!bg-orange-600">Dismiss</Button>
            </div>
        )}

        {/* User Grid - Scrollable Area */}
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
                {/* Create New User Card - Always visible */}
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
                  const isDeleting = deletingFilename === user.filename;

                  return (
                    // Individual Card Container
                    <div
                      key={user.filename}
                      className={`
                        relative group aspect-[3/4] sm:aspect-square cursor-pointer rounded-lg overflow-hidden shadow-md bg-stone-800
                        transition-all ${isDeleting ? 'duration-300 ease-out' : 'duration-200 ease-in-out'}
                        ${isDeleting ? 'scale-0 opacity-0 -translate-y-2' : 'scale-100 opacity-100 translate-y-0'}
                        hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 focus-within:ring-offset-stone-900
                        ${currentUser === user.name && !isDeleting ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-stone-900' : ''}
                      `}
                      onClick={() => handleSelectUser(user)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select user ${user.name}`}
                    >
                      {/* Delete Button (Conditionally Rendered) */}
                      {!isDeleting && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={16} />}
                            title="Delete user profile"
                            onClick={(e) => handleTrashIconClick(e, user)}
                            tabIndex={-1}
                            aria-label={`Delete ${user.name}`}
                            pill
                            className="absolute top-1.5 right-1.5 z-10 backdrop-blur-sm
                                      bg-black/40 text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
                                      transition-all duration-200 ease-in-out
                                      hover:!bg-red-700/70 hover:scale-110
                                      focus:opacity-100 focus:!bg-red-700/70 focus:scale-110 focus:ring-red-500 focus:ring-offset-stone-800"
                          />
                      )}

                      {/* User Image Container */}
                      <div className="absolute inset-0 bg-stone-950">
                        <img
                          key={`${user.filename}-img`}
                          src={`/api/user-image/${encodeFilePath(user.filename)}`}
                          alt={user.name}
                          className={`w-full h-full object-cover object-center transition-transform duration-300 ${isDeleting ? '' : 'group-hover:scale-105 group-focus:scale-105'}`}
                          loading="lazy"
                          onError={(e) => {
                            console.error(`Failed to load image for user: ${user.name} (${user.filename})`);
                            (e.target as HTMLImageElement).style.visibility = 'hidden';
                          }}
                        />
                      </div>
                      {/* Name Overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent p-2 pt-6 text-white text-sm font-medium text-center truncate rounded-b-lg pointer-events-none">
                        {user.name}
                      </div>
                    </div> // End Individual Card
                  );
                })} {/* End map */}
              </div> 
            </>
          )}
        </div> {/* End Scrollable Area */}

      </div> {/* End Modal content container */}

      {/* Create New User Dialog */}
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
                <textarea id="new-user-desc" value={newUserDescription} onChange={(e) => { if (e.target.value.length <= 500) setNewUserDescription(e.target.value); }} maxLength={500} className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg focus:ring-1 focus:ring-blue-500 h-20 resize-none focus:outline-none text-white placeholder-slate-500" placeholder="Describe your appearance — things a character would notice (height, hair, eyes, build, etc.)"/>
                <div className={`text-xs mt-1 text-right ${newUserDescription.length > 480 ? 'text-red-400' : newUserDescription.length > 450 ? 'text-yellow-400' : 'text-gray-500'}`}>{newUserDescription.length}/500</div>
            </div>
            {/* Error Message within Dialog */}
            {error && !deleteError && (
                <div className="text-sm text-red-500 bg-red-950/50 p-3 rounded-lg border border-red-800">Error: {error}</div>
            )}
        </div>
      </Dialog>

      {/* Delete confirmation dialog using our reusable component */}
      <DeleteConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete User"
        description="Are you sure you want to delete the user"
        itemName={userToDelete?.name}
        isDeleting={isDeleting}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div> // End Fixed Position Wrapper
  );
};

export default UserSelect;
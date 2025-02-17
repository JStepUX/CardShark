import React, { useState, useEffect } from 'react';
import { X, UserPlus } from 'lucide-react';

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
                onClick={() => {/* TODO: Implement create new user */}}
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
    </div>
  );
};

export default UserSelect;
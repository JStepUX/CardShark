import { useState, useEffect } from 'react';
import { X, Search, Upload, Loader2, Image as ImageIcon, Trash2 } from 'lucide-react';
import { MediaLibrary, MediaItem } from '../media/MediaLibrary';
import { ImageUploader } from '../media/ImageUploader';
import { ImageEditor } from '../media/ImageEditor';
import { BackgroundService } from '../../services/backgroundService';
import { toast } from 'sonner';

interface GalleryImage {
  filename: string;
  theme: string;
  url: string;
}

interface Theme {
  name: string;
  count: number;
  images: string[];
}

export interface ImageSelection {
  id: string;
  name: string;
  url: string;
  filename: string;
  isAnimated?: boolean;
  aspectRatio?: number;
  source: 'gallery' | 'user';
}

interface UnifiedImageGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (image: ImageSelection) => void;
  mode: 'background' | 'room';
  showGallery?: boolean;
  showUserLibrary?: boolean;
  worldId?: string; // Required for room mode
}

export function UnifiedImageGallery({
  isOpen,
  onClose,
  onSelect,
  mode,
  showGallery = true,
  showUserLibrary = true,
  worldId
}: UnifiedImageGalleryProps) {
  // Gallery state
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [searchAllThemes, setSearchAllThemes] = useState(false);
  const [originalTheme, setOriginalTheme] = useState<string | null>(null);

  // User library state
  const [userImages, setUserImages] = useState<MediaItem[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<'gallery' | 'library'>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Load themes on mount
  useEffect(() => {
    if (isOpen && showGallery) {
      loadThemes();
    }
  }, [isOpen, showGallery]);

  // Load user library on mount
  useEffect(() => {
    if (isOpen && showUserLibrary && mode === 'background') {
      loadUserLibrary();
    }
  }, [isOpen, showUserLibrary, mode]);

  // Auto-select first theme when themes load
  useEffect(() => {
    if (themes.length > 0 && !selectedTheme) {
      setSelectedTheme(themes[0].name);
    }
  }, [themes]);

  // Load images when theme selected
  useEffect(() => {
    if (selectedTheme && activeTab === 'gallery' && !searchAllThemes) {
      loadThemeImages(selectedTheme);
    }
  }, [selectedTheme, themes, activeTab, searchAllThemes]);

  // Auto-activate All Themes mode when searching
  useEffect(() => {
    if (searchQuery && !searchAllThemes && activeTab === 'gallery') {
      // User started searching - switch to All Themes mode
      setOriginalTheme(selectedTheme);
      setSearchAllThemes(true);
      loadThemeImages('', true);
    } else if (searchQuery === '' && searchAllThemes && originalTheme) {
      // Search cleared - return to original theme
      setSearchAllThemes(false);
      setSelectedTheme(originalTheme);
      setOriginalTheme(null);
    }
  }, [searchQuery, searchAllThemes, originalTheme, activeTab, selectedTheme]);

  const loadThemes = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/gallery/themes');
      if (!response.ok) throw new Error('Failed to load gallery themes');

      const data = await response.json();
      if (data.success && data.data.themes) {
        const themeList = Object.entries(data.data.themes).map(([name, info]: [string, any]) => ({
          name,
          count: info.count,
          images: info.images
        }));

        setThemes(themeList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load themes');
    } finally {
      setIsLoading(false);
    }
  };

  const loadThemeImages = (themeName: string, loadAll = false) => {
    if (loadAll) {
      // Load images from all themes
      const allImages: GalleryImage[] = themes.flatMap(theme =>
        theme.images.map(filename => ({
          filename,
          theme: theme.name,
          url: `/api/gallery/image/${theme.name}/${filename}`
        }))
      );
      setGalleryImages(allImages);
    } else {
      // Load images from single theme
      const theme = themes.find(t => t.name === themeName);
      if (!theme) return;

      const images: GalleryImage[] = theme.images.map(filename => ({
        filename,
        theme: themeName,
        url: `/api/gallery/image/${themeName}/${filename}`
      }));

      setGalleryImages(images);
    }
  };

  const loadUserLibrary = async () => {
    setIsLoading(true);
    try {
      const data = await BackgroundService.getBackgrounds();

      const mappedBackgrounds: MediaItem[] = data.map((bg: any) => ({
        id: bg.filename,
        name: bg.name,
        filename: bg.filename,
        url: `/api/backgrounds/${encodeURIComponent(bg.filename)}`,
        isAnimated: bg.isAnimated || bg.filename.toLowerCase().endsWith('.gif'),
        aspectRatio: bg.aspectRatio,
        isDefault: false
      }));

      setUserImages(mappedBackgrounds);
    } catch (error) {
      console.error('Failed to load user library', error);
      toast.error('Failed to load your uploaded images');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAllThemesToggle = () => {
    if (!searchAllThemes) {
      // Entering "all themes" mode
      setOriginalTheme(selectedTheme);
      setSearchAllThemes(true);
      loadThemeImages('', true);
    } else {
      // Exiting "all themes" mode
      setSearchAllThemes(false);
      setSearchQuery(''); // Clear search when manually exiting All mode
      if (originalTheme) {
        setSelectedTheme(originalTheme);
        loadThemeImages(originalTheme);
      }
      setOriginalTheme(null);
    }
  };

  const handleGalleryImageSelect = async (imageUrl: string) => {
    if (mode === 'room' && worldId) {
      // For room mode: fetch image, convert to file, upload to world-assets
      try {
        setIsLoading(true);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Failed to fetch gallery image');

        const blob = await response.blob();
        const filename = imageUrl.split('/').pop() || 'gallery_image.png';
        const file = new File([blob], filename, { type: blob.type });

        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch(`/api/world-assets/${worldId}`, {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) throw new Error('Upload failed');

        const data = await uploadResponse.json();
        if (data.success && data.data) {
          onSelect({
            id: data.data.path,
            name: filename,
            url: `/api/world-assets/${worldId}/${data.data.path.split('/').pop()}`,
            filename: filename,
            source: 'gallery'
          });
          onClose();
        }
      } catch (error) {
        console.error('Error setting gallery image:', error);
        toast.error('Failed to set gallery image');
      } finally {
        setIsLoading(false);
      }
    } else {
      // For background mode: use gallery image directly
      const filename = imageUrl.split('/').pop() || 'gallery_image';
      onSelect({
        id: filename,
        name: filename,
        url: imageUrl,
        filename: filename,
        source: 'gallery'
      });
      onClose();
    }
  };

  const handleUserImageSelect = (item: MediaItem) => {
    onSelect({
      id: item.id,
      name: item.name,
      url: item.url,
      filename: item.filename,
      isAnimated: item.isAnimated,
      aspectRatio: item.aspectRatio,
      source: 'user'
    });
    onClose();
  };

  const handleUserImageDelete = async (item: MediaItem) => {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      const success = await BackgroundService.deleteBackground(item.filename);
      if (success) {
        toast.success('Image deleted');
        setUserImages(prev => prev.filter(img => img.id !== item.id));
      } else {
        toast.error('Failed to delete image');
      }
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type === 'image/gif') {
      performUpload(file);
    } else {
      setSelectedFile(file);
      setTempImageUrl(URL.createObjectURL(file));
      setShowEditor(true);
    }
    setShowUploadModal(false);
  };

  const performUpload = async (file: File, aspectRatio?: number) => {
    setIsUploading(true);
    try {
      const result = await BackgroundService.uploadBackground(file, aspectRatio);

      if (result) {
        toast.success('Image uploaded');
        closeEditor();
        await loadUserLibrary();
        setActiveTab('library'); // Switch to library to show the new upload
      } else {
        toast.error('Upload failed');
      }
    } catch (error) {
      toast.error('Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditorSave = async (croppedImageData: string) => {
    if (!selectedFile) return;

    const response = await fetch(croppedImageData);
    const blob = await response.blob();
    const croppedFile = new File([blob], selectedFile.name, { type: selectedFile.type });

    await performUpload(croppedFile);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setSelectedFile(null);
    if (tempImageUrl) {
      URL.revokeObjectURL(tempImageUrl);
      setTempImageUrl(null);
    }
  };

  const filteredGalleryImages = galleryImages.filter(img =>
    img.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUserImages = userImages.filter(img =>
    img.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-stone-900 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-stone-700 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-700">
            <div>
              <h2 className="text-2xl font-bold text-white">
                {mode === 'background' ? 'Background Gallery' : 'Room Image Gallery'}
              </h2>
              <p className="text-sm text-stone-400 mt-1">
                Select from themed gallery or upload custom image
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-6 h-6 text-stone-400" />
            </button>
          </div>

          {/* Tab Selector */}
          {showGallery && showUserLibrary && mode === 'background' && (
            <div className="px-6 pt-4 border-b border-stone-700">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('gallery')}
                  className={`px-4 py-2 rounded-t-lg transition-colors ${
                    activeTab === 'gallery'
                      ? 'bg-purple-600 text-white'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  Themed Gallery ({themes.reduce((sum, t) => sum + t.count, 0)})
                </button>
                <button
                  onClick={() => setActiveTab('library')}
                  className={`px-4 py-2 rounded-t-lg transition-colors ${
                    activeTab === 'library'
                      ? 'bg-purple-600 text-white'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  Your Library ({userImages.length})
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {mode === 'background' && (
            <div className="p-4 border-b border-stone-700 flex gap-3">
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
              >
                <Upload size={18} />
                Upload Custom Image
              </button>
            </div>
          )}

          {/* Gallery Content */}
          {activeTab === 'gallery' && showGallery && (
            <>
              {/* Theme Tabs + Search */}
              <div className="p-4 border-b border-stone-700 space-y-3">
                {/* Theme Selector */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <button
                    onClick={handleAllThemesToggle}
                    className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                      searchAllThemes
                        ? 'bg-purple-600 text-white'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    All ({themes.reduce((sum, t) => sum + t.count, 0)})
                  </button>
                  {themes.map(theme => (
                    <button
                      key={theme.name}
                      onClick={() => {
                        if (searchAllThemes) {
                          setSearchAllThemes(false);
                          setOriginalTheme(null);
                        }
                        setSelectedTheme(theme.name);
                        setSearchQuery('');
                      }}
                      className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                        selectedTheme === theme.name && !searchAllThemes
                          ? 'bg-purple-600 text-white'
                          : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {theme.name.replace('_', ' ')} ({theme.count})
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search images..."
                    className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Gallery Grid */}
              <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <p className="text-red-400">{error}</p>
                    <button
                      onClick={loadThemes}
                      className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredGalleryImages.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon className="w-16 h-16 text-stone-600 mx-auto mb-4" />
                    <p className="text-stone-400">
                      {searchQuery ? 'No images match your search' : 'No images available in this theme'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredGalleryImages.map((image) => (
                      <button
                        key={`${image.theme}-${image.filename}`}
                        onClick={() => handleGalleryImageSelect(image.url)}
                        className="group relative aspect-video bg-stone-800 rounded-lg overflow-hidden border-2 border-transparent hover:border-purple-500 transition-all"
                      >
                        <img
                          src={image.url}
                          alt={image.filename}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="absolute bottom-0 left-0 right-0 p-2">
                            <p className="text-xs text-white truncate">{image.filename}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-stone-700 bg-stone-850">
                <p className="text-sm text-stone-400">
                  {filteredGalleryImages.length} image{filteredGalleryImages.length !== 1 ? 's' : ''} available
                </p>
              </div>
            </>
          )}

          {/* User Library Content */}
          {activeTab === 'library' && showUserLibrary && (
            <>
              {/* Search */}
              <div className="p-4 border-b border-stone-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your images..."
                    className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Library Grid */}
              <div className="flex-1 overflow-y-auto p-6">
                <MediaLibrary
                  items={filteredUserImages}
                  onSelect={handleUserImageSelect}
                  onDelete={handleUserImageDelete}
                  onAdd={() => setShowUploadModal(true)}
                  aspectRatio={16/9}
                  allowNone={true}
                />
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-stone-700 bg-stone-850">
                <p className="text-sm text-stone-400">
                  {filteredUserImages.length} image{filteredUserImages.length !== 1 ? 's' : ''} in your library
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <ImageUploader
          onFileSelect={handleFileSelect}
          onClose={() => setShowUploadModal(false)}
          isUploading={isUploading}
        />
      )}

      {/* Image Editor */}
      {showEditor && tempImageUrl && (
        <ImageEditor
          imageUrl={tempImageUrl}
          onSave={handleEditorSave}
          onCancel={closeEditor}
        />
      )}
    </>
  );
}

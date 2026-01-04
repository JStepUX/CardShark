import { useState, useEffect } from 'react';
import { X, Search, Upload, Loader2, Image as ImageIcon } from 'lucide-react';

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

interface RoomImageGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGalleryImage: (imageUrl: string) => void;
  onUploadCustom: () => void;
}

export function RoomImageGalleryModal({
  isOpen,
  onClose,
  onSelectGalleryImage,
  onUploadCustom
}: RoomImageGalleryModalProps) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load themes on mount
  useEffect(() => {
    if (isOpen) {
      loadThemes();
    }
  }, [isOpen]);

  // Auto-select first theme when themes load
  useEffect(() => {
    if (themes.length > 0 && !selectedTheme) {
      setSelectedTheme(themes[0].name);
    }
  }, [themes]);

  // Load images when theme selected
  useEffect(() => {
    if (selectedTheme) {
      loadThemeImages(selectedTheme);
    }
  }, [selectedTheme, themes]);

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

  const loadThemeImages = (themeName: string) => {
    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;

    const images: GalleryImage[] = theme.images.map(filename => ({
      filename,
      theme: themeName,
      url: `/api/gallery/image/${themeName}/${filename}`
    }));

    setGalleryImages(images);
  };

  const filteredImages = galleryImages.filter(img =>
    img.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImageSelect = (imageUrl: string) => {
    onSelectGalleryImage(imageUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-900 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-stone-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Room Image Gallery</h2>
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

        {/* Action Buttons */}
        <div className="p-4 border-b border-stone-700 flex gap-3">
          <button
            onClick={() => {
              onUploadCustom();
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
          >
            <Upload size={18} />
            Upload Custom Image
          </button>
        </div>

        {/* Theme Tabs + Search */}
        <div className="p-4 border-b border-stone-700 space-y-3">
          {/* Theme Selector */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {themes.map(theme => (
              <button
                key={theme.name}
                onClick={() => setSelectedTheme(theme.name)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  selectedTheme === theme.name
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
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-16 h-16 text-stone-600 mx-auto mb-4" />
              <p className="text-stone-400">
                {searchQuery ? 'No images match your search' : 'No images available in this theme'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredImages.map((image) => (
                <button
                  key={`${image.theme}-${image.filename}`}
                  onClick={() => handleImageSelect(image.url)}
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
            {filteredImages.length} image{filteredImages.length !== 1 ? 's' : ''} available
          </p>
        </div>
      </div>
    </div>
  );
}

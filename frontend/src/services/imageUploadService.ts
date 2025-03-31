/**
 * Service for handling image uploads in the rich text editor
 */

interface UploadResponse {
  success: boolean;
  url?: string;
  message?: string;
}

/**
 * Upload an image file to the server
 */
export async function uploadImage(file: File): Promise<UploadResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to upload image');
    }
    
    return {
      success: true,
      url: data.url,
    };
  } catch (error) {
    console.error('Image upload failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during upload',
    };
  }
}

/**
 * Convert a data URL to a file object
 */
export function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new File([u8arr], filename, { type: mime });
}

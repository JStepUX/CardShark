import React, { createContext, useContext, useState } from 'react';

// Define the type for the image change handler function
type ImageChangeHandler = (newImageData: File | string) => void;

// Define the context type
interface ImageHandlerContextType {
  registerImageHandler: (handler: ImageChangeHandler | null) => void;
  currentHandler: ImageChangeHandler | null;
}

// Create the context
const ImageHandlerContext = createContext<ImageHandlerContextType | null>(null);

// Create the provider component
export const ImageHandlerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentHandler, setCurrentHandler] = useState<ImageChangeHandler | null>(null);

  // Function to register a new handler
  const registerImageHandler = (handler: ImageChangeHandler | null) => {
    setCurrentHandler(handler);
  };

  return (
    <ImageHandlerContext.Provider value={{ registerImageHandler, currentHandler }}>
      {children}
    </ImageHandlerContext.Provider>
  );
};

// Create a hook to use the context
export const useImageHandler = () => {
  const context = useContext(ImageHandlerContext);
  if (!context) {
    throw new Error('useImageHandler must be used within an ImageHandlerProvider');
  }
  return context;
};

export default ImageHandlerContext;
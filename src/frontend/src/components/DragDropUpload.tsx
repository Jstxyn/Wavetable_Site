import React, { useCallback, useState, useRef } from 'react';
import './DragDropUpload.css';

interface DragDropUploadProps {
  onFileUpload: (file: File) => void;
  isUploading: boolean;
  accept?: string;
  maxSize?: number; // in bytes
}

export const DragDropUpload: React.FC<DragDropUploadProps> = ({
  onFileUpload,
  isUploading,
  accept = 'image/*',
  maxSize = 5 * 1024 * 1024 // 5MB default
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validateFile = (file: File): boolean => {
    setError('');
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return false;
    }
    
    // Check file size
    if (file.size > maxSize) {
      setError(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
      return false;
    }
    
    return true;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0]; // Take only the first file
      if (validateFile(file)) {
        onFileUpload(file);
      }
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileUpload(file);
      }
    }
  }, [onFileUpload]);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div 
      className={`drag-drop-upload ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''}`}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      <div className="upload-content">
        {isUploading ? (
          <div className="upload-spinner">
            <div className="spinner"></div>
            <span>Processing image...</span>
          </div>
        ) : (
          <>
            <div className="upload-icon">
              {isDragging ? '📥' : '🖼️'}
            </div>
            <div className="upload-text">
              {isDragging 
                ? 'Drop image here'
                : 'Drag image here or click to upload'
              }
            </div>
            <div className="upload-hint">
              Supported formats: PNG, JPG, GIF
            </div>
          </>
        )}
      </div>
      
      {error && (
        <div className="upload-error">
          {error}
        </div>
      )}
    </div>
  );
};

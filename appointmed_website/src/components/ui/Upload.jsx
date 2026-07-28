import { useState, useRef } from 'react'
import './Upload.css'

const Upload = ({
  accept = '.pdf,.jpg,.jpeg,.png',
  multiple = false,
  onFiles,
  maxSize = 10, // MB
  label = 'Upload files',
  description = 'Drag and drop or click to browse',
  className = ''
}) => {
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState([])
  const inputRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    processFiles(droppedFiles)
  }

  const handleFileInput = (e) => {
    const selectedFiles = Array.from(e.target.files)
    processFiles(selectedFiles)
  }

  const processFiles = (newFiles) => {
    const validFiles = newFiles.filter(file => {
      const sizeMB = file.size / (1024 * 1024)
      return sizeMB <= maxSize
    })
    const updatedFiles = multiple ? [...files, ...validFiles] : validFiles
    setFiles(updatedFiles)
    onFiles?.(updatedFiles)
  }

  const removeFile = (index) => {
    const updatedFiles = files.filter((_, i) => i !== index)
    setFiles(updatedFiles)
    onFiles?.(updatedFiles)
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={`upload ${className}`}>
      <div
        className={`upload__zone ${dragOver ? 'upload__zone--active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInput}
          className="upload__input"
        />
        <div className="upload__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="upload__label">{label}</p>
        <p className="upload__description">{description}</p>
        <p className="upload__hint">Maximum file size: {maxSize}MB</p>
      </div>

      {files.length > 0 && (
        <div className="upload__files">
          {files.map((file, index) => (
            <div key={index} className="upload__file">
              <div className="upload__file-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
              </div>
              <div className="upload__file-info">
                <span className="upload__file-name">{file.name}</span>
                <span className="upload__file-size">{formatSize(file.size)}</span>
              </div>
              <button
                className="upload__file-remove"
                onClick={(e) => {
                  e.stopPropagation()
                  removeFile(index)
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Upload
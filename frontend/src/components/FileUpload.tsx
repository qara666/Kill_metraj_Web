import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { DocumentArrowUpIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { clsx } from 'clsx'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number
  className?: string
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept: acceptedTypes = '.xlsx,.xls,.csv',
  maxSize = 10 * 1024 * 1024, // 10MB
  className
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const error = rejectedFiles[0].errors[0]
      if (error.code === 'file-too-large') {
        toast.error('File is too large. Please upload files under 10MB.')
      } else if (error.code === 'file-invalid-type') {
        toast.error('Invalid file type. Please upload Excel or CSV files.')
      } else {
        toast.error('Invalid file. Please try again.')
      }
      return
    }

    const file = acceptedFiles[0]
    if (file) {
      setSelectedFile(file)
      onFileSelect(file)
      toast.success(`File "${file.name}" selected successfully`)
    }
  }, [onFileSelect])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv']
    },
    maxSize,
    multiple: false
  })

  const removeFile = () => {
    setSelectedFile(null)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className={clsx('w-full', className)}>
      <div
        {...getRootProps()}
        className={clsx(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200',
          isDragActive
            ? 'border-primary-400 bg-primary-50 scale-105'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
          selectedFile && 'border-success-300 bg-success-50'
        )}
      >
        <input {...getInputProps()} />
        
        {selectedFile ? (
          <CheckCircleIcon className="mx-auto h-12 w-12 text-success-500" />
        ) : (
          <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
        )}
        
        <p className="mt-4 text-lg font-medium text-gray-900">
          {selectedFile 
            ? 'File selected successfully' 
            : isDragActive 
              ? 'Drop the file here' 
              : 'Upload Excel or CSV file'
          }
        </p>
        
        <p className="mt-2 text-sm text-gray-500">
          {selectedFile 
            ? 'Ready to process'
            : 'Drag & drop your file here, or click to select'
          }
        </p>
        
        <p className="mt-1 text-xs text-gray-400">
          Supported formats: .xlsx, .xls, .csv (max 10MB)
        </p>
      </div>

      {selectedFile && (
        <div className="mt-4 p-4 bg-success-50 rounded-lg border border-success-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CheckCircleIcon className="h-8 w-8 text-success-500" />
              <div>
                <p className="text-sm font-medium text-success-900">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-success-600">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            
            <button
              onClick={removeFile}
              className="text-success-400 hover:text-success-600 transition-colors"
              title="Remove file"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

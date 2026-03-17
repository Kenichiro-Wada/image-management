import { useState, useRef } from 'react';
import { uploadSingleImage } from '../services/images';
import { UPLOAD_CONFIG } from '../config/api';
import type { UploadResponse } from '../types';

interface ImageUploadProps {
  onUploadComplete?: (response: UploadResponse) => void;
}

export const ImageUpload = ({ onUploadComplete }: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // ファイル検証
    const invalidFiles = Array.from(files).filter(
      file => !UPLOAD_CONFIG.acceptedFormats.includes(file.type) || 
              file.size > UPLOAD_CONFIG.maxFileSize
    );

    if (invalidFiles.length > 0) {
      setError(`無効なファイルが含まれています: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    try {
      setUploading(true);
      setError('');
      
      const fileArray = Array.from(files);
      const totalFiles = fileArray.length;

      // 大量ファイルの場合は事前にアナウンス
      if (totalFiles >= 10) {
        setProgress(`${totalFiles}件のファイルを処理します。しばらくお待ちください...`);
      }
      
      // 1ファイルずつアップロード（API Gatewayの10MB制限対策）
      let totalSuccess = 0;
      let totalFailure = 0;
      
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setProgress(`アップロード中... (${i + 1}/${totalFiles})`);
        
        try {
          await uploadSingleImage(file);
          totalSuccess++;
        } catch (uploadError) {
          console.error(`ファイルアップロード失敗: ${file.name}`, uploadError);
          totalFailure++;
        }
      }
      
      setProgress(`完了: ${totalSuccess}件成功、${totalFailure}件失敗`);
      
      // リスト更新をトリガー
      if (onUploadComplete) {
        onUploadComplete({
          message: `${totalSuccess}件のファイルをアップロードしました`,
          results: [],
          summary: {
            total: totalFiles,
            success: totalSuccess,
            failure: totalFailure,
          },
        });
      }

      // 入力をリセット
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';

      // 3秒後にメッセージをクリア
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="image-upload">
      <h2>画像アップロード</h2>
      
      <div className="upload-buttons">
        {/* 複数ファイル選択 */}
        <div className="upload-option">
          <label htmlFor="file-upload" className="upload-button">
            📁 ファイルを選択
          </label>
          <input
            id="file-upload"
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_CONFIG.acceptedExtensions.join(',')}
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </div>

        {/* フォルダ選択 */}
        <div className="upload-option">
          <label htmlFor="folder-upload" className="upload-button">
            📂 フォルダを選択
          </label>
          <input
            id="folder-upload"
            ref={folderInputRef}
            type="file"
            accept={UPLOAD_CONFIG.acceptedExtensions.join(',')}
            // @ts-ignore - webkitdirectory is not in the type definition
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* 進捗表示 */}
      {progress && (
        <div className="upload-progress">
          {progress}
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="upload-error">
          ⚠️ {error}
        </div>
      )}

      {/* 説明 */}
      <div className="upload-info">
        <p>対応形式: JPEG (.jpg, .jpeg)</p>
        <p>最大ファイルサイズ: {UPLOAD_CONFIG.maxFileSize / 1024 / 1024}MB</p>
      </div>
    </div>
  );
};

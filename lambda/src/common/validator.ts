import { ValidationError } from '../middleware/error-handler';

/**
 * バリデーションルール
 */
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean;
  message?: string;
}

/**
 * バリデーション結果
 */
interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string[]>;
}

/**
 * バリデーター
 */
export class Validator {
  private errors: Record<string, string[]> = {};
  
  /**
   * フィールドをバリデーション
   */
  validate(
    fieldName: string,
    value: any,
    rules: ValidationRule
  ): this {
    const fieldErrors: string[] = [];
    
    // 必須チェック
    if (rules.required && (value === undefined || value === null || value === '')) {
      fieldErrors.push(rules.message || `${fieldName}は必須です`);
      this.errors[fieldName] = fieldErrors;
      return this;
    }
    
    // 値が存在しない場合は以降のチェックをスキップ
    if (value === undefined || value === null || value === '') {
      return this;
    }
    
    // 最小長チェック
    if (rules.minLength !== undefined && typeof value === 'string') {
      if (value.length < rules.minLength) {
        fieldErrors.push(
          rules.message || `${fieldName}は${rules.minLength}文字以上である必要があります`
        );
      }
    }
    
    // 最大長チェック
    if (rules.maxLength !== undefined && typeof value === 'string') {
      if (value.length > rules.maxLength) {
        fieldErrors.push(
          rules.message || `${fieldName}は${rules.maxLength}文字以下である必要があります`
        );
      }
    }
    
    // 最小値チェック
    if (rules.min !== undefined && typeof value === 'number') {
      if (value < rules.min) {
        fieldErrors.push(
          rules.message || `${fieldName}は${rules.min}以上である必要があります`
        );
      }
    }
    
    // 最大値チェック
    if (rules.max !== undefined && typeof value === 'number') {
      if (value > rules.max) {
        fieldErrors.push(
          rules.message || `${fieldName}は${rules.max}以下である必要があります`
        );
      }
    }
    
    // パターンチェック
    if (rules.pattern && typeof value === 'string') {
      if (!rules.pattern.test(value)) {
        fieldErrors.push(
          rules.message || `${fieldName}の形式が正しくありません`
        );
      }
    }
    
    // カスタムバリデーション
    if (rules.custom) {
      if (!rules.custom(value)) {
        fieldErrors.push(
          rules.message || `${fieldName}が無効です`
        );
      }
    }
    
    if (fieldErrors.length > 0) {
      this.errors[fieldName] = fieldErrors;
    }
    
    return this;
  }
  
  /**
   * バリデーション結果を取得
   */
  getResult(): ValidationResult {
    return {
      isValid: Object.keys(this.errors).length === 0,
      errors: this.errors,
    };
  }
  
  /**
   * バリデーションエラーをスロー
   */
  throwIfInvalid(): void {
    const result = this.getResult();
    if (!result.isValid) {
      throw new ValidationError('バリデーションエラー', result.errors);
    }
  }
}

/**
 * 画像ファイルのバリデーション
 */
export const validateImageFile = (
  fileName: string,
  fileSize: number,
  mimeType: string
): void => {
  const validator = new Validator();
  
  // ファイル名
  validator.validate('fileName', fileName, {
    required: true,
    maxLength: 255,
  });
  
  // ファイルサイズ（100MB以下）
  validator.validate('fileSize', fileSize, {
    required: true,
    min: 1,
    max: 100 * 1024 * 1024,
    message: 'ファイルサイズは100MB以下である必要があります',
  });
  
  // MIMEタイプ（JPEG形式のみ）
  validator.validate('mimeType', mimeType, {
    required: true,
    custom: (value) => ['image/jpeg', 'image/jpg'].includes(value),
    message: 'JPEG形式の画像のみアップロード可能です',
  });
  
  validator.throwIfInvalid();
};

/**
 * タグ名のバリデーション
 */
export const validateTagName = (tagName: string): void => {
  const validator = new Validator();
  
  validator.validate('tagName', tagName, {
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/,
    message: 'タグ名は英数字、ひらがな、カタカナ、漢字、アンダースコア、ハイフンのみ使用できます',
  });
  
  validator.throwIfInvalid();
};

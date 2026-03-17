import { Validator, validateImageFile, validateTagName } from './validator';
import { ValidationError } from '../middleware/error-handler';

describe('Validator', () => {
  describe('基本的なバリデーション', () => {
    test('必須チェック - 値が存在する場合', () => {
      const validator = new Validator();
      validator.validate('name', 'test', { required: true });
      
      const result = validator.getResult();
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    test('必須チェック - 値が存在しない場合', () => {
      const validator = new Validator();
      validator.validate('name', '', { required: true });
      
      const result = validator.getResult();
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toContain('nameは必須です');
    });

    test('最小長チェック', () => {
      const validator = new Validator();
      validator.validate('name', 'ab', { minLength: 3 });
      
      const result = validator.getResult();
      expect(result.isValid).toBe(false);
      expect(result.errors.name[0]).toContain('3文字以上');
    });

    test('最大長チェック', () => {
      const validator = new Validator();
      validator.validate('name', 'abcdef', { maxLength: 5 });
      
      const result = validator.getResult();
      expect(result.isValid).toBe(false);
      expect(result.errors.name[0]).toContain('5文字以下');
    });

    test('パターンチェック', () => {
      const validator = new Validator();
      validator.validate('email', 'invalid-email', {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      });
      
      const result = validator.getResult();
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateImageFile', () => {
    test('有効な画像ファイル', () => {
      expect(() => {
        validateImageFile('test.jpg', 1024 * 1024, 'image/jpeg');
      }).not.toThrow();
    });

    test('ファイルサイズが大きすぎる', () => {
      expect(() => {
        validateImageFile('test.jpg', 101 * 1024 * 1024, 'image/jpeg');
      }).toThrow(ValidationError);
    });

    test('JPEG以外の形式', () => {
      expect(() => {
        validateImageFile('test.png', 1024 * 1024, 'image/png');
      }).toThrow(ValidationError);
    });
  });

  describe('validateTagName', () => {
    test('有効なタグ名', () => {
      expect(() => {
        validateTagName('風景');
      }).not.toThrow();
      
      expect(() => {
        validateTagName('landscape');
      }).not.toThrow();
      
      expect(() => {
        validateTagName('tag_name-123');
      }).not.toThrow();
    });

    test('無効なタグ名 - 空文字', () => {
      expect(() => {
        validateTagName('');
      }).toThrow(ValidationError);
    });

    test('無効なタグ名 - 長すぎる', () => {
      expect(() => {
        validateTagName('a'.repeat(51));
      }).toThrow(ValidationError);
    });

    test('無効なタグ名 - 特殊文字', () => {
      expect(() => {
        validateTagName('tag name');
      }).toThrow(ValidationError);
    });
  });
});

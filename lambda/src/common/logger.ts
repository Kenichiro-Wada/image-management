/**
 * ログレベル
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * 構造化ログ
 */
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * ロガークラス
 */
class Logger {
  private context: Record<string, any> = {};
  
  /**
   * コンテキストを設定
   */
  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }
  
  /**
   * コンテキストをクリア
   */
  clearContext(): void {
    this.context = {};
  }
  
  /**
   * ログを出力
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context },
    };
    
    if (data instanceof Error) {
      entry.error = {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };
    } else if (data) {
      entry.context = { ...entry.context, ...data };
    }
    
    console.log(JSON.stringify(entry));
  }
  
  /**
   * DEBUGログ
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }
  
  /**
   * INFOログ
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }
  
  /**
   * WARNログ
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }
  
  /**
   * ERRORログ
   */
  error(message: string, error?: Error | any): void {
    this.log(LogLevel.ERROR, message, error);
  }
}

/**
 * グローバルロガーインスタンス
 */
export const logger = new Logger();

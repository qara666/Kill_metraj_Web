type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private enabled = import.meta.env.MODE !== 'production';

  private log(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      data
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.enabled || level === 'error' || level === 'warn') {
      const styles = {
        debug: 'color: #7f8c8d',
        info: 'color: #2980b9',
        warn: 'color: #f39c12; font-weight: bold',
        error: 'color: #c0392b; font-weight: bold'
      };

      const prefix = `%c[${entry.timestamp}] [${level.toUpperCase()}]`;
      if (data) {
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](prefix, styles[level], message, data);
      } else {
        console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](prefix, styles[level], message);
      }
    }
  }

  debug(message: string, data?: any) {
    this.log('debug', message, data);
  }

  info(message: string, data?: any) {
    this.log('info', message, data);
  }

  warn(message: string, data?: any) {
    this.log('warn', message, data);
  }

  error(message: string, data?: any) {
    this.log('error', message, data);
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  saveLogsExport() {
    const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  clear() {
    this.logs = [];
  }
}

export const logger = new Logger();


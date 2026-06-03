import { Injectable, LoggerService, LogLevel } from '@nestjs/common';

export interface LogEntry {
  level: string;
  message: string;
  context?: string;
  timestamp: string;
  trace?: string;
  [key: string]: unknown;
}

@Injectable()
export class AppLoggerService implements LoggerService {
  private context?: string;

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, ...optionalParams: unknown[]): void {
    this.writeLog('info', message, optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    const trace = optionalParams.find((p) => typeof p === 'string' && p.includes('\n'));
    this.writeLog('error', message, optionalParams, trace as string | undefined);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    this.writeLog('warn', message, optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    this.writeLog('debug', message, optionalParams);
  }

  verbose(message: string, ...optionalParams: unknown[]): void {
    this.writeLog('verbose', message, optionalParams);
  }

  setLogLevels?(_levels: LogLevel[]): void {
    // Can be extended to filter log levels
  }

  private writeLog(
    level: string,
    message: string,
    optionalParams: unknown[],
    trace?: string,
  ): void {
    const context = this.extractContext(optionalParams);

    const entry: LogEntry = {
      level,
      message,
      context: context || this.context,
      timestamp: new Date().toISOString(),
      ...(trace && { trace }),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        process.stderr.write(output + '\n');
        break;
      default:
        process.stdout.write(output + '\n');
        break;
    }
  }

  private extractContext(optionalParams: unknown[]): string | undefined {
    const last = optionalParams[optionalParams.length - 1];
    if (typeof last === 'string' && !last.includes('\n')) {
      return last;
    }
    return undefined;
  }
}

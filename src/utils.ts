import Colors from 'colors'; // eslint-disable-line

// Added so the 'Colors' import doesn't get removed for not being referenced.
Colors.black;

export enum LogLevel {
  ALL = 1,
  DEBUG,
  INFO,
  SUCCESS,
  WARN,
  ERROR,
  NONE,
}

export const log = {
  _logLevel: LogLevel.INFO,
  setLogLevel: (level: LogLevel): void => {
    log._logLevel = level;
  },
  getLogLevel: (): LogLevel => log._logLevel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]): void =>
    log._logLevel <= LogLevel.DEBUG ? console.debug('debug'.gray, 'directus'.blue, ...args) : void 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...args: any[]): void =>
    log._logLevel <= LogLevel.INFO ? console.log('info'.cyan, 'directus'.blue, ...args) : void 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]): void =>
    log._logLevel <= LogLevel.WARN ? console.log('warning'.yellow, 'directus'.blue, ...args) : void 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]): void =>
    log._logLevel <= LogLevel.ERROR ? console.error('error'.red, 'directus'.blue, ...args) : void 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  success: (...args: any[]): void =>
    log._logLevel <= LogLevel.SUCCESS ? console.log('success'.green, 'directus'.blue, ...args) : void 0,
};

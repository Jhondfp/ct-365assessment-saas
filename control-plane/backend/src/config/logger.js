const winston = require('winston');
const config = require('./index');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  trace: 'gray'
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  levels,
  format,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf(
          info => `${info.timestamp} [${info.level}] ${info.message}`
        )
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format
    })
  ]
});

// Application Insights (se configurado)
if (config.APPINSIGHTS_CONNECTION_STRING) {
  try {
    const appInsights = require('applicationinsights');
    appInsights
      .setup(config.APPINSIGHTS_CONNECTION_STRING)
      .setAutoCollectConsole(true)
      .start();
    logger.info('✓ Application Insights conectado');
  } catch (err) {
    logger.warn('Application Insights não configurado');
  }
}

module.exports = logger;

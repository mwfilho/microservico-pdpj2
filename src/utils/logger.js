const winston = require('winston');

function createLogger(service) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        format: winston.format.simple()
      }),
      new winston.transports.File({
        filename: process.env.LOG_FILE_PATH || 'logs/app.log'
      })
    ]
  });
}

module.exports = { createLogger };

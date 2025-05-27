const winston = require('winston');

// Configuração de formato personalizado
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Função para criar um logger configurado com nome do serviço
const createLogger = (service) => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: customFormat,
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, service, ...rest }) => {
            const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
            return `${timestamp} [${service}] ${level}: ${message}${meta}`;
          })
        )
      })
    ]
  });
};

module.exports = {
  createLogger
};

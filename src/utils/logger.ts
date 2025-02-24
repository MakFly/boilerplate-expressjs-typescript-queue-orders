import path from 'path';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Écriture dans les fichiers
        new winston.transports.File({ 
            filename: path.join('logs', 'error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join('logs', 'combined.log') 
        }),
        // Console en développement
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

export default logger; 
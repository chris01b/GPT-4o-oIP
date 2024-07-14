import Pino from 'pino';

const log = new Pino({
    name: 'asterisk-ai-bridge',
});

log.info('Starting');

const startARIClient = async () => {};

const startRTPServer = async () => {};

const startServices = async () => {
    try {
        await startARIClient();
        await startRTPServer();
    } catch (err) {
        log.error('Error starting services:', err);
    }
};

startServices();
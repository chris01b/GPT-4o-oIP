import ariClient from 'ari-client';
import mqtt from 'async-mqtt';
import config from 'config';
import Pino from 'pino';
import Bridge from './lib/Bridge.js';
import RtpServer from './lib/RTPServer.js';

const log = new Pino({
    name: 'asterisk-ai-bridge',
});

const rtpServer = new RtpServer(config.get('rtpServer'), log);
const mqttTopicPrefix = config.get('mqtt.topicPrefix');

const channels = new Map();

let mqttClient;

log.info('Starting');

const startARIClient = async () => {
    mqttClient = await mqtt.connectAsync(config.get('mqtt.url'));
    log.info('Connected to MQTT');

    await mqttClient.subscribe(`${mqttTopicPrefix}/newStream`);
    await mqttClient.subscribe(`${mqttTopicPrefix}/streamEnded`);
    log.info('Subscribed to both newStream & streamEnded topic');

    mqttClient.on('message', (topic, message) => {
        const payload = JSON.parse(message.toString());
        log.info({ payload }, `MQTT received message with topic ${topic}`);

        switch (topic) {
            case `${mqttTopicPrefix}/newStream`:
                // TODO: Create a new stream to DialogFlow
                break;
            case `${mqttTopicPrefix}/streamEnded`:
                // TODO: Stop the stream to DialogFlow
                break;
            default:
                break;
        }
    });

    rtpServer.on('err', (err) => {
        streamsMap.forEach((stream, key) => {
            stream.end();
            streamsMap.delete(key);
        });

        throw err;
    });

    rtpServer.bind();
    log.info('AudioServer listening on UDP port');
};

const startRTPServer = async () => {
    try {
        let mqttClient = null;

        if (config.get('mqtt.url')) {
            log.info('trying to connect to mqtt');
            mqttClient = await mqtt.connectAsync(config.get('mqtt.url'));
            log.info('connected to mqtt');

            mqttClient.on('message', async (topic, message) => {
                const payload = JSON.parse(message.toString());
                log.info({ topic, payload }, 'got a message');
                if (topic.includes('events')) {
                    const channelId = topic.replace(`${config.get('mqtt.topicPrefix')}/`, '').split('/')[0]; // this is super bodge
                    const bridge = channels.get(channelId);
                    bridge.receivedDialogFlowEvent(payload);
                }
            });
        }

        const ariConfig = config.get('ari');

        log.info({ ariConfig }, 'ari config');

        const client = await ariClient.connect(ariConfig.url, ariConfig.username, ariConfig.password);
        log.info('connected to ari websocket');

        client.on('StasisStart', async (event, channel) => {
            if (event.channel.name.includes('UnicastRTP')) {
                return;
            }

            const logger = log.child({ id: channel.id });
            logger.info({ event }, 'channel entered our application');

            if (config.has('asterisk.playback')) {
                const playback = client.Playback();
                const playbackFinished = new Promise(resolve => playback.once('PlaybackFinished', resolve));
                channel.play({ media: `sound:${config.get('asterisk.playback')}` }, playback);
                await playbackFinished;
            }

            const bridge = new Bridge(client, log);
            channels.set(channel.id, bridge);

            bridge.on('empty', async () => {
                await mqttClient.unsubscribe(`${config.get('mqtt.topicPrefix')}/${channel.id}/events`);
                await bridge.destroy();
            });

            if (mqttClient) {
                bridge.on('newStream', async (data) => {
                    await mqttClient.publish(`${config.get('mqtt.topicPrefix')}/newStream`, JSON.stringify({
                        roomName: data.roomName,
                        port: data.port,
                        callerName: data.callerName,
                        channelId: data.channelId
                    }));
                });

                bridge.on('streamEnded', async (data) => {
                    await mqttClient.publish(`${config.get('mqtt.topicPrefix')}/streamEnded`, JSON.stringify({
                        name: data.roomName,
                        port: data.port,
                        callerName: data.callerName,
                        channelId: data.channelId
                    }));
                });

                bridge.on('dialogFlowEvent', async (data) => {
                    if (data.intent && data.intent.parameters.fields.foo && data.intent.parameters.fields.foo.stringValue) {
                        await client.channels.setChannelVar({ channelId: channel.id, variable: 'foo', value: data.intent.parameters.fields.foo.stringValue });
                    }

                    if (data.intent && data.intent.intent && data.intent.intent.endInteraction) {
                        await client.channels.continueInDialplan({ channelId: channel.id });
                    }
                });

                await mqttClient.subscribe(`${config.get('mqtt.topicPrefix')}/${channel.id}/events`);
            }

            await bridge.create();
            await channel.answer();
            await bridge.addChannel(channel);
        });

        await client.start(ariConfig.appName);
        log.info('ari started');
    } catch (err) {
        throw err;
    }
};

const startServices = async () => {
    try {
        await startARIClient();
        await startRTPServer();
    } catch (err) {
        log.error('Error starting services:', err);
    }
};

startServices();
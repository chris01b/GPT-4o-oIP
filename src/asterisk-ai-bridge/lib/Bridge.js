import config from 'config';
import { EventEmitter } from 'events';

class Bridge extends EventEmitter {
    constructor(ariClient, log) {
        super();
        this.logger = log.child({});
        this.ariClient = ariClient;
    }

    // Create a new mixing bridge
    async create() {
        this.bridge = await this.ariClient.Bridge();
        await this.bridge.create({ type: 'mixing' });

        this.bridge.on('ChannelLeftBridge', (event) => {
            this.logger.info(event, 'Channel left bridge');
            if (event.bridge.channels.length === 0) {
                this.emit('empty');
            }
        });

        return this.bridge;
    }

    // Destroy the bridge
    async destroy() {
        const destroyed = await this.bridge.destroy();
        return destroyed;
    }

    // Trigger handling of DialogFlow events in startRTPServer()
    receivedDialogFlowEvent(data) {
        this.emit('dialogFlowEvent', data);
    }

    // Add a channel to the bridge
    async addChannel(channel) {
        await this.bridge.addChannel({ channel: channel.id });

        const externalMediaChannel = this.ariClient.Channel();
        let externalMediaUdpSourcePort = null;
        const callerName = channel.caller.name || 'Unknown';

        // When the main channel ends, hang up the external media channel too
        channel.once('StasisEnd', async () => {
            await externalMediaChannel.hangup();
        });

        // When the main channel starts, add the external media channel
        externalMediaChannel.once('StasisStart', (event, channel) => {
            this.logger.info(event, 'got a stasisStart event on the externalMediaChannel');
            this.bridge.addChannel({ channel: channel.id });
        });

        // When the external media channel ends, trigger handling of it in startARIClient()
        externalMediaChannel.once('StasisEnd', () => {
            this.logger.info('external media channel ended');
            this.emit('streamEnded', {
                roomName: channel.dialplan.exten,
                port: externalMediaUdpSourcePort,
                callerName: callerName,
                channelId: channel.id
            });
        });

        const externalMediaOptions = {
            app: config.get('ari.appName'),
            external_host: `${config.get('rtpServer.host')}:${config.get('rtpServer.port')}`,
            format: config.get('rtpServer.format')
        };

        // Create the external media channel
        const externalMediaRes = await externalMediaChannel.externalMedia(externalMediaOptions);

        externalMediaUdpSourcePort = externalMediaRes.channelvars?.UNICASTRTP_LOCAL_PORT || externalMediaRes.local_port;

        // Start streaming and trigger handling of it in startARIClient()
        this.emit('newStream', {
            roomName: channel.dialplan.exten,
            port: externalMediaUdpSourcePort,
            callerName: callerName,
            channelId: channel.id
        });

        this.logger.info(`created an externalMedia channel with port ${externalMediaUdpSourcePort}`);
    }
}

// Export the Bridge class as the default export
export default Bridge;

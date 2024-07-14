import dgram from 'dgram';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

/**
 * Duplex stream created with two transform streams
 * - inRStream - inbound side read stream
 * - outWStream - outbound side write stream
 */
class DuplexThrough {
    constructor() {
        this.inRStream = new PassThrough();
        this.outWStream = new PassThrough();
    }

    end() {
        this.inRStream.end();
        this.outWStream.end();
    }
}

// TODO: move dgram to await/async promises

export default class RtpUdpServerSocket extends EventEmitter {
    constructor(opts, log) {
        super();
        this.log = log;
        this.swap16 = opts.swap16 || false;
        this.host = opts.host;
        this.port = opts.port;
        this.streams = new Map();
    }

    bind() {
        this.socket = dgram.createSocket('udp4');

        this.socket.on('error', (err) => {
            this.emit('error', err);
            this.socket.close();
        });

        this.socket.on('message', (msg, rinfo) => {
            this.log.info(`Received RTP packet from ${rinfo.address}:${rinfo.port}`);

            /* Strip the 12 byte RTP header */
            let buf = msg.slice(12);
            // Dialogflow wants Uncompressed 16-bit signed little-endian samples (Linear PCM). Asterisk gives it to us in big endian
            if (this.swap16) {
                buf.swap16();
            }

            this.emit(`data-${rinfo.port}`, buf, rinfo);
        });

        return this.socket.bind({
            port: this.port,
            address: this.host,
            exclusive: false
        }, () => {
            this.log.info(`RTP Server bound to ${this.host}:${this.port}`);
        });
    }

    createStream(port) {

        const stream = new DuplexThrough();

        this.log.info({ port }, 'Creating a new stream based on source port');

        stream.inRStream.on('close', () => {
            this.log.info({ port }, 'removing event listener for data on port as stream finished');
            this.removeAllListeners(`data-${port}`);
        });

        this.log.info(`listening on data-${port} for data`);

        this.once(`data-${port}`, (audio, rinfo) => {
            this.log.info(`Audio Stream started from port ${port}`);

            stream.outWStream.on('data', (audioData) => {
                this.log.info(`Sending audio back to Asterisk: ${audioData.length} bytes to ${rinfo.port}`);
                this.socket.send(audioData, rinfo.port, rinfo.address);
            });
        });

        this.on(`data-${port}`, (data) => {
            this.log.info(`Received data on port ${port}: ${data.length} bytes`);
            stream.inRStream.write(data);
        });

        this.streams.set(port, stream);

        return stream;
    }

    endStream(port) {
        this.removeAllListeners(`data-${port}`);
        let stream = this.streams.get(port);
        if (stream) {
            stream.end();
            this.streams.delete(port);
        }
    }
}

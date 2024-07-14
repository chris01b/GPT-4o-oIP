module.exports = {
    ari: {
        url: 'http://tele:8088',
        username: 'username',
        password: 'foo',
        appName: 'asterisk-ai-bridge'
    },
    rtpServer: {
        host: process.env.RTP_SERVER_HOST,
        port: '7777',
        format: 'slin16',
        swap16: true
    },
    mqtt: {
        url: 'mqtt://test.mosquitto.org',
        topicPrefix: 'asterisk-ai'
    },
    asterisk: {
        format: 'slin16',
        audioByteSize: 320,
        packetTimestampIncrement: 160,
        rtpPayloadType: 11,
        playback: 'hello-world'  // Just for debugging
    }
};
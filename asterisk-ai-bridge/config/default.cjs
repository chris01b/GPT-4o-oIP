module.exports = {
    ari: {
        url: 'http://tele:8088',
        username: 'username',
        password: 'foo',
        appName: 'asterisk-ai-bridge'
    },
    rtpServer: {
        host: process.env.RTP_SERVER_HOST, // Because Asterisk's external media channel can't resolve DNS hostname
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
    },
    dialogflow: {
        auth: {
            keyFilename: '', // Path to DialogFlow service account JSON key file
        },
        project: '', // DialogFlow GCP project ID
        initialEventName: '', // Name of the event to trigger the initial intent
        enableOutputSpeech: true,
        audioInputConfig: {
            audioEncoding: 'AUDIO_ENCODING_LINEAR_16',
            sampleRateHertz: 16000,
            languageCode: 'en',
            singleUtterance: false
        },
        audioOutputConfig: {
            audioEncoding: 'OUTPUT_AUDIO_ENCODING_LINEAR_16',
            sampleRateHertz: 8000,  // Different from input because Asterisk doesn't like 16000hz
            synthesizeSpeechConfig: {
                speakingRate: 1,
                pitch: 5,
                volumeGainDb: 0,
                voice: {
                    ssmlGender: 'SSML_VOICE_GENDER_FEMALE'
                }
            }
        }
    }
};
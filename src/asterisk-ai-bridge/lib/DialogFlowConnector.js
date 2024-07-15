import { v2beta1 as dialogflow } from 'dialogflow';
import { EventEmitter } from 'events';
import { Packet } from 'krtp';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';

export default class DialogFlowConnector extends EventEmitter {
    constructor(audioConfig, dialogFlowConfig, id, log) {
        super();

        this.id = id;
        this.log = log.child({ id });
        this._closed = false;
        this.timeouts = [];
        this._dialogFlowProjectId = dialogFlowConfig.projectId;
        this._dialogFlowSessionId = dialogFlowConfig.sessionId;
        this._initialEventName = dialogFlowConfig.initialEventName;
        this._enableDialogflowOutputSpeech = dialogFlowConfig.enableOutputSpeech;
        this._sampleRate = audioConfig.input.sampleRateHertz;
        this._languageCode = audioConfig.input.languageCode;
        this._asteriskConfig = dialogFlowConfig.asteriskConfig;

        this._dialogFlowClient = new dialogflow.SessionsClient(dialogFlowConfig.auth);
        this._dialogFlowPath = this._dialogFlowClient.sessionPath(this._dialogFlowProjectId, this._dialogFlowSessionId);
        this._numOfStreamCycles = 0;

        this._initialStreamRequest = {
            session: this._dialogFlowPath,
            queryInput: {
                audioConfig: audioConfig.input,
            }
        };

        if (this._enableDialogflowOutputSpeech) {
            this._initialStreamRequest.outputAudioConfig = audioConfig.output;
        }

        //Create DialogFlow bi-directional stream
        this._createNewDialogFlowStream();
    }

    _clearAllTimeouts() {
        this.timeouts.forEach((ref) => {
            clearTimeout(ref);
        });
        this.timeouts = [];
    }

    // Close writing to the DialogFlow stream to show we are ready for a response
    _halfCloseDialogFlowStream() {
        this.log.info('Ending the writable stream to DialogFlow');
        this._dialogFlowStream.end();
    }

    _createNewDialogFlowStream() {
        if (this._closed) {
            this.log.info('Requested a new Dialogflow even though we closed the connector');
            return;
        }
    
        this.log.info('Creating new Dialogflow stream');
        this._numOfStreamCycles++;
    
        // We will close the old stream later
        const oldStream = this._dialogFlowStream;
    
        this._dialogFlowStream = this._dialogFlowClient.streamingDetectIntent()
            .on('error', err => {
                this.log.error({ err }, 'Got an error from dialogflow');
            })
            .on('finish', () => {
                this.log.info('Dialogflow stream closed');
            })
            .on('data', (data) => {
                // this.log.info({ data }, 'got data from dialogflow');
    
                // If we get a transcript or intent result, pass it along to handle elsewhere (not implemented)
                if (data.recognitionResult || data.queryResult) {
                    this._sendDataToApp(data);
                }
    
                // If we got the output audio then send it back to Asterisk
                if (data.outputAudio && data.outputAudio.length !== 0) {
                    this._sendAudioToAsterisk(data);
    
                    this._createNewDialogFlowStream();
                }
    
                // If we got the query result and don't have speech output enabled then restart the stream
                if (!this._enableDialogflowOutputSpeech && data.queryResult) {
                    if (this._dialogFlowClient.writableEnded && data.queryResult.intent && !data.queryResult.intent.endInteraction) {
                        this._createNewDialogFlowStream();
                    }
                }
    
               // When we get 'final' transcript, we half close the stream to get the intent data from DialogFlow
                if (data.recognitionResult && data.recognitionResult.isFinal) {
                    this._halfCloseDialogFlowStream();
                }
            });
    
        // If this is the first stream cycle and we have an initial event name then add it to the stream request
        let tmpInitialStreamRequest = null;
        if (this._numOfStreamCycles === 1 && this._initialEventName) {
            tmpInitialStreamRequest = JSON.parse(JSON.stringify(this._initialStreamRequest));
    
            tmpInitialStreamRequest.queryInput.event = {
                name: this._initialEventName,
                languageCode: this._languageCode
            };
        }
    
        // Write the initial stream request to DialogFlow
        if (this._dialogFlowStream && this._dialogFlowStream.writable) {
            try {
                this._dialogFlowStream.write(tmpInitialStreamRequest || this._initialStreamRequest);
            } catch (err) {
                this.log.error({ err }, 'Error writing initial stream request to Dialogflow');
            }
        }
    
        // Setup a timer a 59 second timer keep stream alive if there is no talking
        this._setupTimer();
    
        // Destroy old stream in preparation for new stream
        if (oldStream) {
            this.log.info('Destroying old DialogFlow stream');
            oldStream.destroy();
        }
    }
    
    _sendAudioToAsterisk(dialogFlowData) {

        this.log.info('Got audio to play back to asterisk from dialogflow');
    
        const config = dialogFlowData.outputAudioConfig || dialogFlowData.replyAudio.config;
        const audio = dialogFlowData.outputAudio || dialogFlowData.replyAudio.audio;

        // this.log.info('DATA:',audio.toString('base64'));
        // fs.writeFile(`${this.id}.wav`, Buffer.from(audio.toString('base64').replace('data:audio/wav; codecs=pcm;base64,', ''), 'base64'));
    
        // If the audio length is more than 320 or 640 bytes then we need to split it up
        // 320 for 8k and 640 for 16k
        const audioByteSize = this._asteriskConfig.audioByteSize;
        const format = this._asteriskConfig.format;
    
        let replyAudio = null;
        if (format === 'slin16') {
            // Remove the Wav header DialogFlow adds to the response
            // DialogFlow gives audio back as little endian so convert it to big endian
            replyAudio = audio.slice(44).swap16();
        } else {
            // Audio is headerless if ulaw
            replyAudio = audio;
        }
    
        const frames = replyAudio.length / audioByteSize;
        let pos = 0;
        const type = this._asteriskConfig.rtpPayloadType;
        let seq = randomBytes(2).readUInt16BE(0);
        const ssrc = randomBytes(4).readUInt32BE(0);
        let timestamp = 0;
    
        this._clearAllTimeouts();
    
        for (let i = 0; i < frames + 1; i++) {
            this.timeouts.push(setTimeout(() => {
                const newpos = pos + audioByteSize;
                const buf = replyAudio.slice(pos, newpos);
    
                timestamp = timestamp !== 0 ? timestamp : Date.now() / 1000;
    
                const packet = new Packet(buf, seq, ssrc, timestamp, type);
                seq++;
                timestamp += this._asteriskConfig.packetTimestampIncrement;
    
                try {
                    this._asteriskAudioStream.outWStream.write(packet.serialize());
                } catch (err) {
                    this._clearAllTimeouts();
                }
                pos = newpos;
            }, i * 20));
        }
    }
    
    _sendDataToApp(dialogFlowData) {
        const body = {
            transcript: null,
            intent: null
        };
    
        if (dialogFlowData.recognitionResult) {
            this.log.info({ transcript: dialogFlowData.recognitionResult.transcript }, 'Intermediate transcript');
            body.transcript = dialogFlowData.recognitionResult;
        } else {
            this.log.info({ intent: dialogFlowData.queryResult }, 'Detected intent');
            body.intent = dialogFlowData.queryResult;
        }
        this.log.info({ body }, 'Dialogflow data');
        this.emit('message', body);
    }
    
    // make a new stream every 59 seconds to keep the connection alive
    _setupTimer() {
        clearTimeout(this._timeoutRef);
        this.log.info('Setting up DialogFlow stream timer');
        this._timeoutRef = setTimeout(() => {
            this.log.info('59 Seconds has elapsed, re-starting DialogFlow stream');
            this._createNewDialogFlowStream();
        }, 59000);
    }
    
    close() {
        this.log.info('Asterisk Stream closed so closing connection to DialogFlow and doing tidy up');
        this._closed = true;
        clearTimeout(this._timeoutRef);
    
        this.log.info('Destroying DialogFlow stream');
        if (this._dialogFlowStream) {
            this._dialogFlowStream.destroy();
        }
    }
    
    _receivedAudioMessage(audio) {
        if (this._dialogFlowStream && this._dialogFlowStream.writable) {
            try {
                // this.log.info('Writing Audio to Dialogflow');
                this._dialogFlowStream.write({ inputAudio: audio });
            } catch (err) {
                this.log.error({ err }, 'Error writing audio to Dialogflow');
            }
        }
    }
    
    start(stream) {
        // pipe the audio through!
        this._asteriskAudioStream = stream;
        stream.inRStream.on('data', (audio) => {
            this._receivedAudioMessage(audio);
        });
    }    
}

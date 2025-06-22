import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';

// Load environment variables
dotenv.config();

// URL for the realtime streaming audio (BBC World Service as an example)
const STREAM_URL = "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service";

// Validate API key
const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error('Please set the DEEPGRAM_API_KEY environment variable');
  process.exit(1);
}

async function transcribeLiveAudio() {
  console.log('Starting Deepgram live transcription...');
  console.log('Connecting to audio stream:', STREAM_URL);
  
  try {
    // Create a Deepgram client
    const deepgram = createClient(apiKey);

    // Create a live transcription connection
    const connection = deepgram.listen.live({
      model: "nova-3",
      language: "en-US",
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000, // End of utterance detection (1 second of silence)
    });

    // Set up event handlers
    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('\nConnection to Deepgram established!');
      console.log('Listening for speech... (Press Ctrl+C to stop)\n');
      
      // Fetch the audio stream and send it to Deepgram
      fetch(STREAM_URL)
        .then(response => {
          if (!response.body) {
            throw new Error('No response body from audio stream');
          }
          
          // Get the readable stream from the response
          const readable = response.body;
          
          // Send audio data to Deepgram as it arrives
          readable.on('data', (chunk: Buffer) => {
            if (connection.getReadyState() === WebSocket.OPEN) {
              connection.send(chunk);
            }
          });
          
          readable.on('end', () => {
            console.log('\nAudio stream ended');
            connection.finish();
          });
          
          readable.on('error', (error) => {
            console.error('Stream error:', error);
            connection.finish();
          });
        })
        .catch(error => {
          console.error('Error fetching audio stream:', error);
          connection.finish();
        });
    });

    // Handle transcription results
    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (transcript && data.is_final) {
        console.log(`[${new Date().toISOString()}] ${transcript}`);
      }
    });

    // Handle errors
    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('Deepgram error:', error);
    });

    // Handle connection close
    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('\nConnection to Deepgram closed');
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\nStopping transcription...');
      connection.finish();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Start the transcription
transcribeLiveAudio();

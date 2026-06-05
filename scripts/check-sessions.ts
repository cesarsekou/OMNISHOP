import dotenv from 'dotenv';

dotenv.config();

const openwaUrl = process.env.VITE_OPENWA_API_URL || 'http://localhost:3000';
const openwaApiKey = process.env.VITE_OPENWA_API_KEY || '';
const sessionKey = '16e2ffcc-ec16-48bf-a632-0d495bdbb0d3'; // active session ID

async function testSend() {
  const testNumbers = [
    '22557535379@c.us', // merchant own number (8-digit style from OpenWA info)
    '2250757535379@c.us', // merchant own number (10-digit style)
    '225703681946@c.us', // the other test number
    '2250703681946@c.us' // the other test number with 0
  ];

  for (const chatId of testNumbers) {
    try {
      console.log(`\nAttempting to send to ${chatId}...`);
      const res = await fetch(`${openwaUrl}/sessions/${sessionKey}/messages/send-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': openwaApiKey
        },
        body: JSON.stringify({
          chatId,
          text: `Test message to ${chatId} at ${new Date().toLocaleTimeString()}`
        })
      });

      console.log(`Response Status: ${res.status}`);
      const text = await res.text();
      console.log(`Response Body: ${text}`);
    } catch (err: any) {
      console.error(`Fetch error: ${err.message || err}`);
    }
  }
}

testSend();

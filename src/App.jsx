import { useState, useRef, useEffect } from 'react';
import { Send, Bot } from 'lucide-react';
import './index.css';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_FALLBACK_MODEL = import.meta.env.VITE_GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash-lite';
// Public Giphy key for development. Recommend user to change this in production.
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'GlVGYHqc3SyCEGqmeYsBh0x7a8y4l41G';

const SYSTEM_INSTRUCTION = `You are a chatbot that communicates and responds exclusively with GIF concepts.
You will be provided with the conversation history. Based on the user's latest message, generate a suitable response.
You MUST output your response as a valid JSON object with EXACTLY one key:
1. "gifSearchTerm": A highly relevant short search query to fetch the perfect expression GIF for your response.

Example output:
{"gifSearchTerm": "laughing out loud"}
`;

const parseRetryDelay = (details = []) => {
  const retryInfo = details.find((item) => item['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
  return retryInfo?.retryDelay || null;
};

const buildGeminiError = (parsedError, fallbackMessage = "Failed to fetch from Gemini") => {
  const error = new Error(parsedError?.message || fallbackMessage);
  error.code = parsedError?.status || 'UNKNOWN';
  error.retryDelay = parseRetryDelay(parsedError?.details);
  return error;
};

function App() {
  const [messages, setMessages] = useState([
    { role: 'model', gifUrl: "https://media.giphy.com/media/ASd0Ukj0y3qMM/giphy.gif", gifSearchTerm: "wave hello" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const fetchGif = async (searchTerm) => {
    try {
      const query = new URLSearchParams({
        api_key: GIPHY_API_KEY,
        q: searchTerm,
        limit: '1',
        rating: 'g'
      });
      const res = await fetch('https://api.giphy.com/v1/gifs/search?' + query.toString());
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return data.data[0].images.fixed_height.url;
      }
    } catch (e) {
      console.error("Giphy fetch error", e);
    }
    return null;
  };

  const getGeminiResponse = async (chatHistory, newMessage) => {
    // Format history for Gemini API
    const contents = chatHistory
      .filter((m, i) => !(i === 0 && m.role === 'model')) // Ensure conversation doesn't start with model for strict alternating roles
      .map(m => ({
        role: m.role,
        parts: [{ text: m.role === 'model' ? `[My response: ${m.text}. I also sent a GIF based on the concept: ${m.gifSearchTerm || m.text}]` : m.text }]
      }));

    contents.push({ role: 'user', parts: [{ text: newMessage }] });

    const payload = {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: contents,
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const callGemini = async (modelName) => {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API Error", errorText);

        let parsedError = null;
        try {
          parsedError = JSON.parse(errorText)?.error;
        } catch {
          parsedError = null;
        }

        throw buildGeminiError(parsedError);
      }

      return response.json();
    };

    let data;
    try {
      data = await callGemini(GEMINI_MODEL);
    } catch (error) {
      const shouldRetryWithFallback =
        error?.code === 'NOT_FOUND' &&
        GEMINI_FALLBACK_MODEL &&
        GEMINI_FALLBACK_MODEL !== GEMINI_MODEL;

      if (!shouldRetryWithFallback) throw error;

      data = await callGemini(GEMINI_FALLBACK_MODEL);
    }

    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (resultText) {
      return JSON.parse(resultText); // Parse the promised JSON string
    }
    return null;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!GEMINI_API_KEY) {
      alert('Please set VITE_GEMINI_API_KEY in your .env file!');
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const geminiResult = await getGeminiResponse(messages, userMessage);
      
      if (geminiResult && geminiResult.gifSearchTerm) {
        let gifUrl = await fetchGif(geminiResult.gifSearchTerm);
        // Fallback if no GIF is found
        if (!gifUrl) {
          gifUrl = "https://media.giphy.com/media/8L0Pky6C83SzkzU55a/giphy.gif"; // 'not found' gif
        }

        setMessages(prev => [...prev, {
          role: 'model',
          gifSearchTerm: geminiResult.gifSearchTerm,
          gifUrl: gifUrl
        }]);
      } else {
        throw new Error("Invalid response format from Gemini");
      }
    } catch (error) {
      console.error(error);
      const isRateLimited = error?.code === 'RESOURCE_EXHAUSTED';
      const isModelMissing = error?.code === 'NOT_FOUND';
      const retryText = error?.retryDelay ? ` Try again in about ${error.retryDelay}.` : ' Try again a bit later.';
      let fallbackText = 'Oops! I had a brain freeze. Try again?';
      if (isRateLimited) {
        fallbackText = `I hit the Gemini quota/rate limit.${retryText}`;
      } else if (isModelMissing) {
        fallbackText = `That Gemini model is unavailable for this API version. Try updating VITE_GEMINI_MODEL.${retryText}`;
      }
      setMessages(prev => [...prev, { role: 'model', gifUrl: 'https://media.giphy.com/media/lkdH8FmImcGoyvnGg5/giphy.gif', gifSearchTerm: 'error reaction' }]);
      alert(fallbackText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <Bot size={28} color="var(--primary-color)" />
        <h1>Goofy GIF Goblin</h1>
      </div>
      
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message-wrapper ${msg.role}`}>
            {msg.text && msg.role === 'user' && (
              <div className="message-bubble">
                {msg.text}
              </div>
            )}
            {msg.gifUrl && (
              <div className="gif-container">
                <img src={msg.gifUrl} alt="gif response" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="typing-indicator">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSend} className="chat-form">
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say something silly..."
            disabled={isLoading}
          />
          <button type="submit" className="send-button" disabled={!input.trim() || isLoading}>
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;

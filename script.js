document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References (unchanged) ---
    const chatLog = document.getElementById('chatLog');
    const textInput = document.getElementById('textInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const statusBar = document.getElementById('statusBar');
    const aiVisualizer = document.getElementById('aiVisualizer');

    // --- State Variables (unchanged) ---
    let chatHistory = [];
    let recognition;
    let synth;
    let isRecording = false;
    let currentAssistantMessageDiv = null;
    let isSpeaking = false;

    // --- Constants & Configuration (unchanged) ---
    // !!! WARNING: EXTREMELY INSECURE !!!
    const API_KEY = "AIzaSyDFNk9JTpq6QT4GUN_QNSVmfns07JBCCts"; // <<< PASTE KEY HERE AT YOUR OWN RISK
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const LOCAL_STORAGE_KEY = 'paCoreChatHistory_v1';

    // --- Core Functions ---

    function setStatus(message, isLoading = false) {
        // console.log(`DEBUG: setStatus - "${message}", isLoading: ${isLoading}`); // Debug log
        statusBar.textContent = `Status: ${message}`;
        statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#101a28';
    }

    // --- MODIFIED: Simplified disableInput ---
    function disableInput(disabled) {
        // console.log(`DEBUG: disableInput called with: ${disabled}`); // Debug log
        textInput.disabled = disabled;
        sendButton.disabled = disabled;
        voiceButton.disabled = disabled;
        // No more complex logic based on isSpeaking here.
        // We rely on calling this function correctly elsewhere.
    }

    function setVisualizerState(state) {
        if (aiVisualizer.classList.contains(state) && state !== 'idle') return;
        // console.log(`DEBUG: setVisualizerState to: ${state}`); // Debug log
        aiVisualizer.className = '';
        aiVisualizer.classList.add(state);
    }

    function scrollToBottom() { // (unchanged)
        chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
    }

    function addMessage(role, text, isError = false) { // (unchanged)
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message');
        messageDiv.classList.add(messageClass);
        messageDiv.textContent = text;
        chatLog.appendChild(messageDiv);
        scrollToBottom();
        return messageDiv;
    }

    // --- Local Storage (unchanged) ---
    function saveChatHistoryLocal() { /* ... unchanged ... */
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(chatHistory));
        } catch (e) {
            console.error("Error saving chat history to localStorage:", e);
            setStatus("Error saving history");
             addMessage('assistant', 'Warning: Could not save chat history.', true);
        }
     }
    function loadChatHistoryLocal() { /* ... unchanged ... */
        try {
            const savedHistory = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedHistory) {
                chatHistory = JSON.parse(savedHistory);
                chatLog.innerHTML = '';
                chatHistory.forEach(msg => {
                    if (msg.role && msg.parts && msg.parts.length > 0) {
                        addMessage(msg.role === 'model' ? 'assistant' : msg.role, msg.parts[0].text);
                    }
                });
                setStatus("Chat history loaded");
                console.log("Chat history loaded from localStorage.");
                addMessage('assistant', `--- Session Resumed (${new Date().toLocaleTimeString()}) ---`);
            } else {
                 addMessage('assistant', 'PA Core Initialized. Start typing or use voice.');
                 setStatus("Ready");
            }
        } catch (e) {
            console.error("Error loading chat history from localStorage:", e);
            localStorage.removeItem(LOCAL_STORAGE_KEY);
             addMessage('assistant', 'Error loading previous session. Starting fresh.', true);
             setStatus("Error loading history");
        }
         scrollToBottom();
    }

    // --- AI Interaction (State Fixes) ---
    async function getAssistantResponse(prompt) {
        console.log("DEBUG: getAssistantResponse called."); // Debug log

        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") { /* ... unchanged ... */
            addMessage('assistant', "API Key not configured in script.js.", true);
            setStatus("Error: API Key missing");
            return;
        }
        if (isSpeaking) { /* ... unchanged ... */
             setStatus("Waiting for AI to finish speaking...");
             console.log("DEBUG: Blocked request because AI is speaking."); // Debug log
             return;
         }
        // Prevent double-sends if already thinking
        if (textInput.disabled) {
             console.log("DEBUG: Blocked request because input is already disabled (likely thinking)."); // Debug log
             return;
        }


        setStatus('Assistant thinking...', true);
        disableInput(true); // Disable input *immediately*
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        chatHistory.push({ role: 'user', parts: [{ text: prompt }] });

        const requestBody = { contents: chatHistory };

        try {
            console.log("DEBUG: Fetching AI response..."); // Debug log
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            console.log(`DEBUG: Fetch response status: ${response.status}`); // Debug log


            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Unknown API error structure' } }));
                console.error("API Error Response:", errorData);
                let blockReason = "";
                 const feedback = errorData?.promptFeedback || data?.candidates?.[0]?.finishReason === "SAFETY" ? (errorData?.promptFeedback || data?.candidates?.[0]) : null;
                 if (feedback?.blockReason) {
                    blockReason = ` (Reason: ${feedback.blockReason})`;
                 } else if (feedback?.finishReason === "SAFETY") {
                     blockReason = ` (Reason: SAFETY)`;
                 }
                throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}${blockReason}`);
            }

            const data = await response.json();
            console.log("DEBUG: API Response Data:", data); // Debug log
            let replyText = "Error: Could not extract reply.";
            let isSafeReply = false;

             if (data.candidates && data.candidates.length > 0) {
                 const candidate = data.candidates[0];
                 if (candidate.finishReason === "SAFETY") {
                     replyText = "Response blocked due to safety settings.";
                     console.warn("Safety block:", candidate);
                     addMessage('assistant', replyText, true);
                 } else if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0 && candidate.content.parts[0].text) {
                     replyText = candidate.content.parts[0].text;
                     currentAssistantMessageDiv.textContent = replyText;
                     isSafeReply = true; // Mark as valid for history/speech
                 } else {
                     console.warn("Unexpected candidate structure:", candidate);
                     replyText = "Received response, but content is missing or empty.";
                     currentAssistantMessageDiv.textContent = replyText;
                 }
             } else if (data?.promptFeedback?.blockReason) {
                 replyText = `Request blocked due to safety settings (Reason: ${data.promptFeedback.blockReason}).`;
                 console.warn("Prompt block:", data.promptFeedback);
                 addMessage('assistant', replyText, true);
             } else {
                 console.warn("Unexpected API response structure:", data);
                 currentAssistantMessageDiv.textContent = replyText;
             }

             if (isSafeReply) {
                 console.log("DEBUG: Valid reply received, adding to history and speaking."); // Debug log
                 chatHistory.push({ role: 'model', parts: [{ text: replyText }] });
                 saveChatHistoryLocal();
                 speakText(replyText); // Call speakText, which will handle state changes
             } else {
                 console.log("DEBUG: Reply was unsafe or invalid, resetting state."); // Debug log
                 // --- CRITICAL STATE FIX for unsafe/invalid reply ---
                 setVisualizerState('idle');
                 setStatus('Idle'); // Or maybe 'Blocked'
                 disableInput(false); // Re-enable input immediately
             }

        } catch (error) {
            console.error("Error during AI interaction:", error); // Log the actual error object
            const errorMsg = `Error: ${error.message}`;
            if (currentAssistantMessageDiv) {
                currentAssistantMessageDiv.textContent = errorMsg;
                currentAssistantMessageDiv.classList.add('error-message');
                currentAssistantMessageDiv.classList.remove('assistant-message');
            } else {
                addMessage('assistant', errorMsg, true);
            }
            // --- CRITICAL STATE FIX on API ERROR ---
            setVisualizerState('idle'); // Reset visualizer
            setStatus(`Error`); // Update status bar simply
            disableInput(false); // Re-enable input
        } finally {
            // Input enable/disable is now primarily handled by speakText handlers
            // and the explicit calls in the safe/unsafe reply paths and catch block.
            scrollToBottom();
            currentAssistantMessageDiv = null;
            console.log("DEBUG: getAssistantResponse finally block finished."); // Debug log
        }
    }

    // --- Text Input & Sending (unchanged) ---
    function handleSend() { /* ... unchanged ... */
        const text = textInput.value.trim();
        if (text && !textInput.disabled) {
            addMessage('user', text);
            textInput.value = '';
            getAssistantResponse(text);
        } else {
             console.log(`DEBUG: Send blocked. Text: "${text}", Disabled: ${textInput.disabled}`);
        }
     }
    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => { /* ... unchanged ... */
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    });

    // --- Voice Input (unchanged logic) ---
    function setupSpeechRecognition() { /* ... unchanged ... */
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {setStatus('Speech Recognition not supported'); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; return;}
        recognition = new SpeechRecognition(); recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
        recognition.onresult = (event) => { const speechResult = event.results[0][0].transcript; textInput.value = speechResult; setStatus(`Recognized: "${speechResult}"`); setTimeout(handleSend, 100); };
        recognition.onspeechend = () => stopRecording('Processing...'); recognition.onnomatch = () => stopRecording('No match');
        recognition.onerror = (event) => { setStatus(`Speech Error: ${event.error}`); console.error("Speech Recognition Error:", event); stopRecording('Speech Error'); };
        recognition.onaudiostart = () => { setStatus('Listening...'); voiceButton.classList.add('recording'); voiceButton.textContent = '...'; };
        recognition.onend = () => { if (isRecording) stopRecording('Stopped'); }; setStatus('Speech Ready');
    }
    function startRecording() { /* ... unchanged ... */
        if (!recognition || isRecording || textInput.disabled) return; // Also check if input disabled
        try { isRecording = true; recognition.start(); } catch (e) { isRecording = false; setStatus(`Error starting recording: ${e.message}`); console.error("Error starting recognition:", e); voiceButton.classList.remove('recording'); voiceButton.textContent = '🎙'; }
    }
    function stopRecording(statusMsg = 'Idle') { /* ... unchanged ... */
        if (!isRecording) return;
        try { recognition.stop(); } catch (e) { /* Ignore */ }
        isRecording = false; voiceButton.classList.remove('recording'); voiceButton.textContent = '🎙'; setStatus(statusMsg);
    }
    voiceButton.addEventListener('click', () => { /* ... unchanged ... */
        if (isRecording) { stopRecording('Stopped manually'); } else if (!voiceButton.disabled) { startRecording(); }
    });


    // --- Text-to-Speech (Robust State Handling) ---
    function setupSpeechSynthesis() { // (unchanged)
        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
            const warmUpUtterance = new SpeechSynthesisUtterance(''); warmUpUtterance.volume = 0; synth.speak(warmUpUtterance);
        } else { console.warn("Speech Synthesis not supported."); setStatus("Speech Synthesis not supported"); }
    }

    function speakText(text) {
        console.log("DEBUG: speakText called."); // Debug log
        if (!synth || !text) {
            console.warn("DEBUG: TTS skipped: No synth or no text.");
            setVisualizerState('idle');
            setStatus('Idle');
            disableInput(false); // Ensure input is enabled if skipping TTS
            return;
        }

        // --- CRITICAL: Ensure any lingering speech is stopped FIRST ---
        isSpeaking = false; // Assume stopped initially
        synth.cancel();
        console.log("DEBUG: synth.cancel() called.");

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // --- MODIFIED: Robust Event Handlers ---
        utterance.onstart = () => {
            isSpeaking = true; // Set flag *only* on successful start
            setStatus('Assistant speaking...');
            setVisualizerState('speaking');
            disableInput(true); // Ensure input is disabled *during* speech
            console.log("DEBUG: TTS onstart fired.");
        };

        utterance.onend = () => {
            console.log("DEBUG: TTS onend fired.");
            // --- CRITICAL STATE RESET ---
            isSpeaking = false;
            setStatus('Idle');
            setVisualizerState('idle');
            disableInput(false); // Re-enable input
        };

        utterance.onerror = (event) => {
            console.error("Speech Synthesis Error:", event); // Log the event object
            // --- CRITICAL STATE RESET ---
            isSpeaking = false;
            setStatus(`Speech Error: ${event.error}`);
            setVisualizerState('idle');
            disableInput(false); // Re-enable input
        };

        // Use a minimal timeout just in case cancel needs a moment
        setTimeout(() => {
            console.log("DEBUG: Calling synth.speak()."); // Debug log
             disableInput(true); // Ensure disabled before speak is called
             setVisualizerState('speaking'); // Assume it will start speaking
            synth.speak(utterance);
        }, 50); // Short delay
    }

    // --- Initialization (unchanged) ---
    function initializeApp() {
        console.log("Initializing App...");
        setupSpeechRecognition();
        setupSpeechSynthesis();
        loadChatHistoryLocal();
        setVisualizerState('idle');
        disableInput(false);
    }

    // Run initialization
    initializeApp();

}); // End DOMContentLoaded listener
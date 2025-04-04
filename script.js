document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const chatLog = document.getElementById('chatLog');
    const textInput = document.getElementById('textInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    // Save/Load buttons removed
    const statusBar = document.getElementById('statusBar');
    const aiVisualizer = document.getElementById('aiVisualizer');

    // --- State Variables ---
    let chatHistory = []; // Stores { role: 'user'/'model', parts: [{ text: '...' }] }
    let recognition;
    let synth;
    let isRecording = false;
    let currentAssistantMessageDiv = null;
    let isSpeaking = false; // Track speech synthesis state

    // --- Constants & Configuration ---
    // !!! WARNING: EXTREMELY INSECURE !!!
    const API_KEY = "AIzaSyDFNk9JTpq6QT4GUN_QNSVmfns07JBCCts"; // <<< PASTE KEY HERE AT YOUR OWN RISK
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const LOCAL_STORAGE_KEY = 'paCoreChatHistory_v1'; // Key for localStorage

    // --- Core Functions ---

    function setStatus(message, isLoading = false) {
        statusBar.textContent = `Status: ${message}`;
        statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#101a28';
        // Don't change cursor globally, might be annoying on touch
    }

    function disableInput(disabled) {
        textInput.disabled = disabled;
        sendButton.disabled = disabled;
        voiceButton.disabled = disabled;
        // Keep input disabled if currently speaking
        if (isSpeaking && !disabled) {
            return; // Don't re-enable if speech is ongoing
        }
        textInput.disabled = disabled;
        sendButton.disabled = disabled;
        voiceButton.disabled = disabled;
    }

    function setVisualizerState(state) {
        // Only change if state is different or forcing idle
        if (aiVisualizer.classList.contains(state) && state !== 'idle') return;

        aiVisualizer.className = ''; // Clear previous states
        aiVisualizer.classList.add(state);
        // console.log("Visualizer state:", state); // For debugging
    }

    function scrollToBottom() {
        // Smooth scroll sometimes fights with rapid message additions,
        // use instant scroll during rapid updates if needed.
        chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
        // Use this for instant scroll: chatLog.scrollTop = chatLog.scrollHeight;
    }

    function addMessage(role, text, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message');
        messageDiv.classList.add(messageClass);
        messageDiv.textContent = text;
        chatLog.appendChild(messageDiv);
        scrollToBottom();
        return messageDiv;
    }

    // --- Local Storage ---
    function saveChatHistoryLocal() {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(chatHistory));
            // console.log("Chat history saved."); // For debugging
        } catch (e) {
            console.error("Error saving chat history to localStorage:", e);
            setStatus("Error saving history");
            // Maybe add a message to the chat log about the save error
             addMessage('assistant', 'Warning: Could not save chat history. Local storage might be full.', true);
        }
    }

    function loadChatHistoryLocal() {
        try {
            const savedHistory = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (savedHistory) {
                chatHistory = JSON.parse(savedHistory);
                chatLog.innerHTML = ''; // Clear default greeting/previous logs
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
            localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
             addMessage('assistant', 'Error loading previous session. Starting fresh.', true);
             setStatus("Error loading history");
        }
         scrollToBottom(); // Ensure view is correct after loading
    }


    // --- AI Interaction (State Fixes) ---
    async function getAssistantResponse(prompt) {
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
            addMessage('assistant', "API Key not configured in script.js.", true);
            setStatus("Error: API Key missing");
            return;
        }
         if (isSpeaking) { // Prevent sending new request while AI is speaking
             setStatus("Waiting for AI to finish speaking...");
             return;
         }


        setStatus('Assistant thinking...', true);
        disableInput(true); // Disable input immediately
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        chatHistory.push({ role: 'user', parts: [{ text: prompt }] });
        // Don't save history here yet, save after successful AI response

        const requestBody = { contents: chatHistory }; // Simplified

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Unknown API error structure' } }));
                console.error("API Error Response:", errorData);
                 // Attempt to extract a specific block reason if available
                 let blockReason = "";
                 if (data?.promptFeedback?.blockReason) {
                     blockReason = ` (Reason: ${data.promptFeedback.blockReason})`;
                 }
                 throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}${blockReason}`);
            }

            const data = await response.json();
            let replyText = "Error: Could not extract reply.";

             // More robust reply extraction, checking for blocked content
             if (data.candidates && data.candidates.length > 0) {
                 const candidate = data.candidates[0];
                 if (candidate.finishReason === "SAFETY") {
                     replyText = "Response blocked due to safety settings.";
                     console.warn("Safety block:", candidate);
                     addMessage('assistant', replyText, true); // Add as error/warning
                 } else if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0 && candidate.content.parts[0].text) {
                     replyText = candidate.content.parts[0].text;
                     currentAssistantMessageDiv.textContent = replyText; // Update placeholder
                 } else {
                     console.warn("Unexpected candidate structure:", candidate);
                     replyText = "Received response, but content is missing or empty.";
                     currentAssistantMessageDiv.textContent = replyText;
                 }
             } else if (data?.promptFeedback?.blockReason) {
                 // Handle cases where the *prompt* was blocked entirely
                 replyText = `Request blocked due to safety settings (Reason: ${data.promptFeedback.blockReason}).`;
                 console.warn("Prompt block:", data.promptFeedback);
                 addMessage('assistant', replyText, true); // Add as error/warning
             } else {
                 console.warn("Unexpected API response structure:", data);
                 currentAssistantMessageDiv.textContent = replyText;
             }


             // Only add valid AI replies to history and save
             if (data.candidates && data.candidates[0]?.finishReason !== "SAFETY" && data.candidates[0]?.content?.parts?.[0]?.text) {
                 chatHistory.push({ role: 'model', parts: [{ text: replyText }] });
                 saveChatHistoryLocal(); // Save history AFTER successful AI response
                 speakText(replyText); // Speak the valid response
             } else {
                 // If response was blocked or invalid, don't speak it, reset state
                 setVisualizerState('idle');
                 disableInput(false); // Re-enable input
                 setStatus('Idle');
             }


        } catch (error) {
            console.error("Error calling AI:", error);
            const errorMsg = `Error: ${error.message}`;
            if (currentAssistantMessageDiv) {
                currentAssistantMessageDiv.textContent = errorMsg;
                currentAssistantMessageDiv.classList.add('error-message');
                currentAssistantMessageDiv.classList.remove('assistant-message');
            } else {
                addMessage('assistant', errorMsg, true);
            }
            // --- CRITICAL STATE FIX on ERROR ---
            setVisualizerState('idle'); // Reset visualizer
            disableInput(false); // Re-enable input
            setStatus(`Error: ${error.message}`); // Update status bar
        } finally {
             // Note: Input re-enabling is now handled by speakText onend/onerror
             // or directly in the catch block / non-speaking paths above.
            scrollToBottom();
            currentAssistantMessageDiv = null; // Clear ref
        }
    }

    // --- Text Input & Sending ---
    function handleSend() {
        const text = textInput.value.trim();
        if (text && !textInput.disabled) {
            addMessage('user', text);
            textInput.value = '';
            getAssistantResponse(text);
        }
    }

    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    });

    // --- Voice Input (Web Speech API - unchanged logic, check setup) ---
    function setupSpeechRecognition() {
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            setStatus('Speech Recognition not supported');
            voiceButton.disabled = true;
            voiceButton.style.opacity = '0.5';
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            textInput.value = speechResult;
            setStatus(`Recognized: "${speechResult}"`);
            setTimeout(handleSend, 100);
        };
        recognition.onspeechend = () => stopRecording('Processing...');
        recognition.onnomatch = () => stopRecording('No match');
        recognition.onerror = (event) => {
            setStatus(`Speech Error: ${event.error}`);
            console.error("Speech Recognition Error:", event);
            stopRecording('Speech Error');
        };
        recognition.onaudiostart = () => {
            setStatus('Listening...');
            voiceButton.classList.add('recording');
            voiceButton.textContent = '...';
        };
        recognition.onend = () => { if (isRecording) stopRecording('Stopped'); };
        setStatus('Speech Ready');
    }
    function startRecording() { /* ... unchanged ... */
        if (!recognition || isRecording) return;
        try {
            isRecording = true;
            recognition.start();
        } catch (e) {
            isRecording = false;
            setStatus(`Error starting recording: ${e.message}`);
            console.error("Error starting recognition:", e);
            voiceButton.classList.remove('recording');
            voiceButton.textContent = '🎙';
        }
    }
    function stopRecording(statusMsg = 'Idle') { /* ... unchanged ... */
        if (!isRecording) return;
        try { recognition.stop(); } catch (e) { /* Ignore */ }
        isRecording = false;
        voiceButton.classList.remove('recording');
        voiceButton.textContent = '🎙';
        setStatus(statusMsg);
    }
    voiceButton.addEventListener('click', () => { /* ... unchanged ... */
        if (isRecording) {
            stopRecording('Stopped manually');
        } else if (!voiceButton.disabled) {
            startRecording();
        }
    });


    // --- Text-to-Speech (State Fixes) ---
    function setupSpeechSynthesis() {
        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
            // Warm up TTS engine on some browsers with a silent utterance
            const warmUpUtterance = new SpeechSynthesisUtterance('');
            warmUpUtterance.volume = 0;
            synth.speak(warmUpUtterance);
        } else {
            console.warn("Speech Synthesis not supported.");
            setStatus("Speech Synthesis not supported");
        }
    }

    function speakText(text) {
        if (!synth || !text) {
            console.warn("TTS skipped: No synth or no text.");
            setVisualizerState('idle'); // Ensure idle state if no speech
            disableInput(false); // Re-enable input if no speech happens
            setStatus('Idle');
            return; // Exit early
        }
        // Cancel any previous speech *before* creating new utterance
        synth.cancel();
        isSpeaking = false; // Reset flag initially

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            isSpeaking = true; // Set flag
            setStatus('Assistant speaking...');
            setVisualizerState('speaking');
            disableInput(true); // Ensure input is disabled
            console.log("TTS started."); // Debugging
        };

        utterance.onend = () => {
            isSpeaking = false; // Clear flag
            setStatus('Idle');
            setVisualizerState('idle');
            disableInput(false); // CRITICAL: Re-enable input ONLY after speech finishes
            console.log("TTS finished."); // Debugging
        };

        utterance.onerror = (event) => {
            isSpeaking = false; // Clear flag
            console.error("Speech Synthesis Error:", event);
            setStatus(`Speech Error: ${event.error}`);
            setVisualizerState('idle');
            disableInput(false); // CRITICAL: Re-enable input on TTS error too
        };

        // Small delay before speaking, helps in some browsers/scenarios
        setTimeout(() => {
             synth.speak(utterance);
        }, 100); // 100ms delay
    }

    // --- Initialization ---
    function initializeApp() {
        console.log("Initializing App...");
        setupSpeechRecognition();
        setupSpeechSynthesis();
        loadChatHistoryLocal(); // Load history or show initial greeting
        setVisualizerState('idle');
        disableInput(false); // Ensure input is enabled initially
        // Initial status is set within loadChatHistoryLocal
    }

    // Run initialization
    initializeApp();

}); // End DOMContentLoaded listener
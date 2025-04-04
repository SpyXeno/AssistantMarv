document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const chatLog = document.getElementById('chatLog');
    const textInput = document.getElementById('textInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const statusBar = document.getElementById('statusBar');
    const aiVisualizer = document.getElementById('aiVisualizer');
    const settingsButton = document.getElementById('settingsButton');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const closeSettingsButton = document.getElementById('closeSettingsButton');
    const voiceSelect = document.getElementById('voiceSelect');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');

    // --- State Variables ---
    let chatHistory = [];
    let recognition;
    let synth;
    let voices = []; // To store available TTS voices
    let isRecording = false;
    let isSpeaking = false;
    let currentAssistantMessageDiv = null;
    let currentSettings = { // Default settings
        voiceURI: null,
        rate: 1.0
    };

    // --- Constants ---
    // !!! WARNING: EXTREMELY INSECURE !!!
    const API_KEY = "AIzaSyDFNk9JTpq6QT4GUN_QNSVmfns07JBCCts"; // <<< PASTE KEY HERE AT YOUR OWN RISK
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const HISTORY_STORAGE_KEY = 'paCoreChatHistory_v2'; // Updated key name
    const SETTINGS_STORAGE_KEY = 'paCoreSettings_v1';
    const AI_NAME = "Marv";
    const USER_NAME = "Yung Siq"; // Replace if needed

    // --- Core Functions (setStatus, setVisualizerState, scrollToBottom, addMessage - unchanged) ---
    function setStatus(message, isLoading = false) { /* ... unchanged ... */
        statusBar.textContent = `Status: ${message}`;
        statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#101a28';
    }
    function disableInput(disabled) { /* ... unchanged ... */
        textInput.disabled = disabled; sendButton.disabled = disabled; voiceButton.disabled = disabled;
    }
    function setVisualizerState(state) { /* ... unchanged ... */
        if (aiVisualizer.classList.contains(state) && state !== 'idle') return;
        aiVisualizer.className = ''; aiVisualizer.classList.add(state);
    }
    function scrollToBottom() { /* ... unchanged ... */
        chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
    }
    function addMessage(role, text, isError = false) { /* ... unchanged ... */
        const messageDiv = document.createElement('div'); messageDiv.classList.add('message');
        const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message');
        messageDiv.classList.add(messageClass); messageDiv.textContent = text; chatLog.appendChild(messageDiv);
        scrollToBottom(); return messageDiv;
    }

    // --- Settings Functions ---
    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings));
            console.log("Settings saved:", currentSettings);
        } catch (e) {
            console.error("Error saving settings:", e);
        }
    }

    function loadSettings() {
        try {
            const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (savedSettings) {
                currentSettings = JSON.parse(savedSettings);
                console.log("Settings loaded:", currentSettings);
                // Apply loaded settings
                speedSlider.value = currentSettings.rate;
                speedValue.textContent = parseFloat(currentSettings.rate).toFixed(1);
                // Voice selection applied later when voices are loaded
            }
        } catch (e) {
            console.error("Error loading settings:", e);
            // Use default settings if loading fails
            currentSettings = { voiceURI: null, rate: 1.0 };
        }
    }

    function populateVoiceList() {
        voices = synth.getVoices();
        const previouslySelectedURI = currentSettings.voiceURI;
        voiceSelect.innerHTML = ''; // Clear existing options

        if (voices.length === 0) {
             console.warn("No voices available yet.");
             // Optionally disable voice selection or show a message
             const option = document.createElement('option');
             option.textContent = 'No voices loaded';
             option.disabled = true;
             voiceSelect.appendChild(option);
             return;
        }


        voices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.setAttribute('data-lang', voice.lang);
            option.setAttribute('data-name', voice.name);
            option.value = voice.voiceURI; // Use voiceURI as the value

            // Select the previously saved voice or the default
             if (voice.voiceURI === previouslySelectedURI) {
                 option.selected = true;
             } else if (!previouslySelectedURI && voice.default) {
                 // Fallback to default if nothing was saved
                 option.selected = true;
                 currentSettings.voiceURI = voice.voiceURI; // Update setting if falling back
             }

            voiceSelect.appendChild(option);
        });
         // Ensure the first voice is selected if none matched
         if (!voiceSelect.selectedOptions.length && voiceSelect.options.length > 0) {
             voiceSelect.options[0].selected = true;
             currentSettings.voiceURI = voiceSelect.options[0].value;
         }

        // Update the current setting based on the final selection
        currentSettings.voiceURI = voiceSelect.value;

        console.log("Voice list populated. Current selection:", currentSettings.voiceURI);
    }

    function openSettings() {
        settingsOverlay.classList.remove('hidden');
        // Ensure voice list is up-to-date when opening
        populateVoiceList();
    }

    function closeSettings() {
        settingsOverlay.classList.add('hidden');
    }

    // --- Local Storage (History) ---
    function saveChatHistoryLocal() { /* ... unchanged, but use HISTORY_STORAGE_KEY ... */
        try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory)); }
        catch (e) { console.error("Error saving chat history:", e); setStatus("Error saving history"); addMessage('assistant', 'Warning: Could not save chat history.', true); }
    }
    function loadChatHistoryLocal() { /* ... unchanged, but use HISTORY_STORAGE_KEY ... */
        try {
            const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (savedHistory) {
                chatHistory = JSON.parse(savedHistory);
                chatLog.innerHTML = '';
                chatHistory.forEach(msg => { /* ... */ addMessage(msg.role === 'model' ? 'assistant' : msg.role, msg.parts[0].text); });
                setStatus("Chat history loaded");
                addMessage('assistant', `--- Session Resumed (${new Date().toLocaleTimeString()}) ---`);
            } else {
                addMessage('assistant', `I am ${AI_NAME}. Your personal AI assistant. How may I help you, ${USER_NAME}?`); // Persona greeting
                setStatus("Ready");
            }
        } catch (e) { /* ... error handling ... */
             console.error("Error loading chat history:", e); localStorage.removeItem(HISTORY_STORAGE_KEY);
             addMessage('assistant', 'Error loading previous session. Starting fresh.', true); setStatus("Error loading history");
         }
        scrollToBottom();
    }

    // --- AI Interaction (Inject Persona) ---
    async function getAssistantResponse(prompt) {
        console.log("DEBUG: getAssistantResponse called.");
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") { /* ... unchanged ... */ return; }
        if (isSpeaking || textInput.disabled) { /* ... unchanged ... */ console.log("DEBUG: Blocked request (speaking or disabled)."); return; }

        setStatus('Assistant thinking...', true);
        disableInput(true);
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        // Prepare history for API: Prepend persona context
        const currentChatTurn = { role: 'user', parts: [{ text: prompt }] };
        chatHistory.push(currentChatTurn); // Add user message to main history *temporarily* for context

        // Construct the request content, including persona instructions strategically
         const personaInstruction = `You are ${AI_NAME}, a helpful, concise, and friendly AI assistant created to serve a user named ${USER_NAME}. Respond naturally as ${AI_NAME}.`;

        // Gemini works well with context at the start or within the flow.
        // Let's put the instruction at the start of the *sent* history.
         const apiContent = [
             // System-like instruction disguised as a user message for compatibility
             { role: 'user', parts: [{ text: `(System Instructions: ${personaInstruction})` }] },
             // Optional: A priming response from the model (can help guide its tone)
             { role: 'model', parts: [{ text: `Understood. I am ${AI_NAME}, ready to assist ${USER_NAME}.` }] },
             // The actual chat history leading up to the latest prompt
             ...chatHistory // Includes the latest user prompt added above
         ];


        const requestBody = { contents: apiContent };
        // console.log("DEBUG: Sending API Request Body:", JSON.stringify(requestBody, null, 2)); // DEBUG: Log request


        // --- Try/Catch block for API call (mostly unchanged, remove added message from history on error) ---
        try {
            console.log("DEBUG: Fetching AI response...");
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            console.log(`DEBUG: Fetch response status: ${response.status}`);

            // Remove the latest user turn from main history now it's sent
            // Do this *before* handling response, in case of errors below
             chatHistory.pop();

            if (!response.ok) { /* ... unchanged error handling ... */
                 const errorData = await response.json().catch(() => ({ error: { message: 'Unknown API error structure' } })); console.error("API Error Response:", errorData);
                 let blockReason = ""; const feedback = errorData?.promptFeedback || data?.candidates?.[0]?.finishReason === "SAFETY" ? (errorData?.promptFeedback || data?.candidates?.[0]) : null;
                 if (feedback?.blockReason) blockReason = ` (Reason: ${feedback.blockReason})`; else if (feedback?.finishReason === "SAFETY") blockReason = ` (Reason: SAFETY)`;
                 throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}${blockReason}`);
             }

            const data = await response.json();
            console.log("DEBUG: API Response Data:", data);
            let replyText = "Error: Could not extract reply.";
            let isSafeReply = false;

             if (data.candidates && data.candidates.length > 0) { /* ... unchanged reply extraction ... */
                 const candidate = data.candidates[0];
                 if (candidate.finishReason === "SAFETY") { replyText = "Response blocked due to safety settings."; console.warn("Safety block:", candidate); addMessage('assistant', replyText, true); }
                 else if (candidate.content?.parts?.[0]?.text) { replyText = candidate.content.parts[0].text; currentAssistantMessageDiv.textContent = replyText; isSafeReply = true; }
                 else { console.warn("Unexpected candidate structure:", candidate); replyText = "Received response, but content is missing or empty."; currentAssistantMessageDiv.textContent = replyText; }
             } else if (data?.promptFeedback?.blockReason) { /* ... unchanged prompt block handling ... */
                 replyText = `Request blocked due to safety settings (Reason: ${data.promptFeedback.blockReason}).`; console.warn("Prompt block:", data.promptFeedback); addMessage('assistant', replyText, true);
             } else { /* ... unchanged unexpected structure handling ... */
                 console.warn("Unexpected API response structure:", data); currentAssistantMessageDiv.textContent = replyText;
             }


            // --- Add user message *back* to history PERMANENTLY only if AI response is safe ---
            if (isSafeReply) {
                console.log("DEBUG: Valid reply received.");
                 chatHistory.push(currentChatTurn); // Permanently add the user turn
                chatHistory.push({ role: 'model', parts: [{ text: replyText }] }); // Add AI turn
                saveChatHistoryLocal(); // Save the complete exchange
                speakText(replyText);
            } else {
                console.log("DEBUG: Reply was unsafe or invalid, resetting state.");
                setVisualizerState('idle');
                setStatus('Blocked/Invalid');
                disableInput(false);
                 // User message was already popped, so history remains clean
            }

        } catch (error) {
             // --- Ensure user message is removed from history on error ---
             if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1] === currentChatTurn) {
                 chatHistory.pop();
                 console.log("DEBUG: Removed pending user message from history due to error.");
             }
            console.error("Error during AI interaction:", error);
            const errorMsg = `Error: ${error.message}`;
            if (currentAssistantMessageDiv) { currentAssistantMessageDiv.textContent = errorMsg; currentAssistantMessageDiv.classList.add('error-message'); }
            else { addMessage('assistant', errorMsg, true); }
            setVisualizerState('idle'); setStatus(`Error`); disableInput(false);
        } finally {
            scrollToBottom(); currentAssistantMessageDiv = null;
            console.log("DEBUG: getAssistantResponse finally block finished.");
        }
    }

    // --- Text Input & Sending (unchanged) ---
    function handleSend() { /* ... unchanged ... */
         const text = textInput.value.trim();
         if (text && !textInput.disabled) { addMessage('user', text); textInput.value = ''; getAssistantResponse(text); }
         else { console.log(`DEBUG: Send blocked. Text: "${text}", Disabled: ${textInput.disabled}`); }
    }
    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => { /* ... */ if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } });

    // --- Voice Input (Speech Recognition Fix Attempt) ---
    function setupSpeechRecognition() {
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) { /* ... unchanged error handling ... */ setStatus('Speech Recognition not supported'); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; return; }

        try { // Wrap initialization in try/catch
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.lang = 'en-US'; // Can be changed later if needed
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event) => { /* ... unchanged ... */ const speechResult = event.results[0][0].transcript; textInput.value = speechResult; setStatus(`Recognized: "${speechResult}"`); setTimeout(handleSend, 100); };
            recognition.onspeechend = () => stopRecording('Processing...');
            recognition.onnomatch = () => stopRecording('No match');
            recognition.onerror = (event) => {
                // --- More Detailed Error Logging ---
                let errorMsg = `Speech Error: ${event.error}`;
                if (event.message) {
                    errorMsg += ` - ${event.message}`;
                }
                 console.error("Speech Recognition Error Event:", event); // Log the full event
                setStatus(errorMsg);
                stopRecording('Speech Error'); // Ensure UI resets
                 // Add potential hints based on common errors
                 if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                     addMessage('assistant', "Microphone permission might be denied. Please check browser settings.", true);
                 } else if (event.error === 'network') {
                     addMessage('assistant', "Network error during speech recognition. Check connection.", true);
                 }
            };
            recognition.onaudiostart = () => { /* ... unchanged ... */ setStatus('Listening...'); voiceButton.classList.add('recording'); /* Remove text change for SVG button */ };
            recognition.onend = () => { console.log("DEBUG: Speech recognition 'onend' fired."); if (isRecording) stopRecording('Stopped'); };

            setStatus('Speech Ready');
            console.log("Speech Recognition initialized successfully.");

        } catch (initError) {
             console.error("Failed to initialize Speech Recognition:", initError);
             setStatus("Speech Recognition init failed");
             voiceButton.disabled = true;
             voiceButton.style.opacity = '0.5';
        }
    }

    function startRecording() {
        if (!recognition) { console.error("Attempted to start recording but recognition not initialized."); setStatus("Speech Rec not ready"); return; }
        if (isRecording || textInput.disabled) { console.log("DEBUG: Blocked startRecording (already recording or input disabled)."); return; }

        try {
            console.log("DEBUG: Starting speech recognition...");
            isRecording = true; // Set flag before starting
            recognition.start();
             // Visual state handled by onaudiostart
        } catch (e) {
            console.error("Error starting recognition:", e);
            isRecording = false; // Reset flag on error
            setStatus(`Error starting recording: ${e.message}`);
            voiceButton.classList.remove('recording');
        }
    }
    function stopRecording(statusMsg = 'Idle') {
        console.log(`DEBUG: Stopping speech recognition (Status: ${statusMsg}).`);
        if (!recognition || !isRecording) { return; } // Only stop if active and initialized

        try { recognition.stop(); }
        catch (e) { console.warn("Error stopping recognition (might be harmless):", e); }
        finally { // Ensure state reset regardless of stop() success
            isRecording = false;
            voiceButton.classList.remove('recording');
            setStatus(statusMsg);
        }
    }
    voiceButton.addEventListener('click', () => { /* ... unchanged ... */ if (isRecording) { stopRecording('Stopped manually'); } else if (!voiceButton.disabled) { startRecording(); } });


    // --- Text-to-Speech (Apply Settings) ---
    function setupSpeechSynthesis() {
        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
            // --- IMPORTANT: Use voiceschanged event ---
            synth.onvoiceschanged = () => {
                console.log("DEBUG: Voices changed event fired.");
                populateVoiceList();
                // Re-apply selected voice from settings *after* list is updated
                 const selectedVoiceURI = currentSettings.voiceURI;
                 if (selectedVoiceURI) {
                     const selectedOption = Array.from(voiceSelect.options).find(opt => opt.value === selectedVoiceURI);
                     if (selectedOption) {
                         voiceSelect.value = selectedVoiceURI; // Ensure dropdown reflects setting
                     } else {
                         console.warn("Saved voice URI not found in current list:", selectedVoiceURI);
                         // Optionally reset to default or first available
                         if (voiceSelect.options.length > 0) {
                            voiceSelect.selectedIndex = 0;
                            currentSettings.voiceURI = voiceSelect.value;
                            saveSettings(); // Save the fallback choice
                         }
                     }
                 }
            };
            // Initial population attempt (might be empty)
             populateVoiceList();

        } else { console.warn("Speech Synthesis not supported."); setStatus("Speech Synthesis not supported"); }
    }

    function speakText(text) {
        console.log("DEBUG: speakText called.");
        if (!synth || !text) { /* ... unchanged skip logic ... */ console.warn("DEBUG: TTS skipped."); setVisualizerState('idle'); setStatus('Idle'); disableInput(false); return; }

        isSpeaking = false;
        synth.cancel();
        console.log("DEBUG: synth.cancel() called.");

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; // Default, might be overridden by voice

        // --- Apply Settings ---
        utterance.rate = currentSettings.rate || 1.0;
        const selectedVoice = voices.find(voice => voice.voiceURI === currentSettings.voiceURI);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang; // Use language of selected voice
            console.log(`DEBUG: Using voice: ${selectedVoice.name} (${selectedVoice.lang}) Rate: ${utterance.rate}`);
        } else {
             console.warn("DEBUG: Selected voice not found, using default. URI:", currentSettings.voiceURI);
             utterance.rate = currentSettings.rate || 1.0; // Still apply rate
        }


        utterance.onstart = () => { /* ... unchanged ... */ isSpeaking = true; setStatus('Assistant speaking...'); setVisualizerState('speaking'); disableInput(true); console.log("DEBUG: TTS onstart fired."); };
        utterance.onend = () => { /* ... unchanged ... */ console.log("DEBUG: TTS onend fired."); isSpeaking = false; setStatus('Idle'); setVisualizerState('idle'); disableInput(false); };
        utterance.onerror = (event) => { /* ... unchanged ... */ console.error("Speech Synthesis Error:", event); isSpeaking = false; setStatus(`Speech Error: ${event.error}`); setVisualizerState('idle'); disableInput(false); };

        setTimeout(() => {
            console.log("DEBUG: Calling synth.speak().");
             disableInput(true); // Ensure disabled before speak
             setVisualizerState('speaking'); // Assume it will start
            synth.speak(utterance);
        }, 50);
    }

    // --- Initialization ---
    function initializeApp() {
        console.log("Initializing App...");
        loadSettings(); // Load settings FIRST
        setupSpeechRecognition();
        setupSpeechSynthesis(); // Setup TTS, which triggers voice loading
        loadChatHistoryLocal(); // Load history / Show greeting
        setVisualizerState('idle');
        disableInput(false);

        // --- Event Listeners for Settings ---
        settingsButton.addEventListener('click', openSettings);
        closeSettingsButton.addEventListener('click', closeSettings);

        voiceSelect.addEventListener('change', (e) => {
            currentSettings.voiceURI = e.target.value;
            saveSettings();
             // Optional: Speak a sample?
             // speakText("Voice selected.");
        });

        speedSlider.addEventListener('input', (e) => {
            currentSettings.rate = parseFloat(e.target.value);
            speedValue.textContent = currentSettings.rate.toFixed(1);
            // No need to call saveSettings here, save on change instead for simplicity
        });
         speedSlider.addEventListener('change', () => {
             // Save setting when user finishes sliding
             saveSettings();
             // Optional: Speak a sample?
             // speakText("Speed set.");
         });


        console.log("Initialization complete.");
    }

    // Run initialization
    initializeApp();

}); // End DOMContentLoaded listener
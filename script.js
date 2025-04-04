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
    // let recognition; // Old recognition object - replaced
    let synth;
    let voices = [];
    // let isRecording = false; // Old flag - replaced
    let isSpeaking = false;
    let currentAssistantMessageDiv = null;
    let currentSettings = { voiceURI: null, rate: 1.0 };

    // --- Simple Speech Recognition Variables ---
    let simpleRecognition;
    let isSimpleRecording = false;


    // --- Constants ---
    // !!! WARNING: EXTREMELY INSECURE !!!
    const API_KEY = "AIzaSyDFNk9JTpq6QT4GUN_QNSVmfns07JBCCts"; // <<< PASTE KEY HERE AT YOUR OWN RISK
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const HISTORY_STORAGE_KEY = 'paCoreChatHistory_v2';
    const SETTINGS_STORAGE_KEY = 'paCoreSettings_v1';
    const AI_NAME = "Marv";
    const USER_NAME = "Yung Siq";

    // --- Core Functions ---
    function setStatus(message, isLoading = false) { statusBar.textContent = `Status: ${message}`; statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#101a28'; }
    function disableInput(disabled) { textInput.disabled = disabled; sendButton.disabled = disabled; voiceButton.disabled = disabled; }
    function setVisualizerState(state) { if (aiVisualizer.classList.contains(state) && state !== 'idle') return; aiVisualizer.className = ''; aiVisualizer.classList.add(state); }
    function scrollToBottom() { chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' }); }
    function addMessage(role, text, isError = false) { const messageDiv = document.createElement('div'); messageDiv.classList.add('message'); const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message'); messageDiv.classList.add(messageClass); messageDiv.textContent = text; chatLog.appendChild(messageDiv); scrollToBottom(); return messageDiv; }

    // --- Centralized State Reset ---
    function resetToIdleState(statusMessage = 'Idle') {
        console.log(`DEBUG: resetToIdleState called with status: "${statusMessage}"`);
        isSpeaking = false;
        setStatus(statusMessage);
        setVisualizerState('idle');
        disableInput(false);
        if (synth && synth.speaking) { console.log("DEBUG: resetToIdleState cancelling lingering speech."); synth.cancel(); }
        // Stop the *simple* recognition if it's active
        if (simpleRecognition && isSimpleRecording) {
            console.warn("DEBUG: resetToIdleState stopping simple speech recognition.");
            stopSimpleRecording('Stopped by Reset');
        }
    }

    // --- Settings Functions ---
    function saveSettings() { try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings)); console.log("Settings saved:", currentSettings); } catch (e) { console.error("Error saving settings:", e); } }
    function loadSettings() { try { const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY); if (savedSettings) { currentSettings = JSON.parse(savedSettings); console.log("Settings loaded:", currentSettings); speedSlider.value = currentSettings.rate; speedValue.textContent = parseFloat(currentSettings.rate).toFixed(1); } } catch (e) { console.error("Error loading settings:", e); currentSettings = { voiceURI: null, rate: 1.0 }; } }
    function populateVoiceList() { voices = synth.getVoices(); const previouslySelectedURI = currentSettings.voiceURI; voiceSelect.innerHTML = ''; if (voices.length === 0) { console.warn("No voices available yet."); const option = document.createElement('option'); option.textContent = 'No voices loaded'; option.disabled = true; voiceSelect.appendChild(option); return; } voices.forEach(voice => { const option = document.createElement('option'); option.textContent = `${voice.name} (${voice.lang})`; option.setAttribute('data-lang', voice.lang); option.setAttribute('data-name', voice.name); option.value = voice.voiceURI; if (voice.voiceURI === previouslySelectedURI) { option.selected = true; } else if (!previouslySelectedURI && voice.default) { option.selected = true; currentSettings.voiceURI = voice.voiceURI; } voiceSelect.appendChild(option); }); if (!voiceSelect.selectedOptions.length && voiceSelect.options.length > 0) { voiceSelect.options[0].selected = true; currentSettings.voiceURI = voiceSelect.options[0].value; } currentSettings.voiceURI = voiceSelect.value; console.log("Voice list populated. Current selection:", currentSettings.voiceURI); }
    function openSettings() { settingsOverlay.classList.remove('hidden'); populateVoiceList(); }
    function closeSettings() { settingsOverlay.classList.add('hidden'); }

    // --- Local Storage (History) ---
    function saveChatHistoryLocal() { try { if (!chatHistory || chatHistory.length === 0) { console.log("DEBUG: Attempted to save empty history. Skipping."); return; } localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory)); console.log(`DEBUG: Chat history saved successfully (${chatHistory.length} items).`); } catch (e) { if (e.name === 'QuotaExceededError') { console.error("LocalStorage quota exceeded!"); addMessage('assistant', "Error: Storage limit reached.", true); setStatus("Storage full"); } else { console.error("Error saving chat history:", e); setStatus("Error saving history"); addMessage('assistant', 'Warning: Could not save chat history.', true); } } }
    function loadChatHistoryLocal() { try { const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY); if (savedHistory) { console.log("DEBUG: Found saved history."); chatHistory = JSON.parse(savedHistory); chatLog.innerHTML = ''; chatHistory.forEach(msg => { if (msg.role && msg.parts?.length) { addMessage(msg.role === 'model' ? 'assistant' : msg.role, msg.parts[0].text); } }); setStatus("Chat history loaded"); console.log(`DEBUG: Loaded ${chatHistory.length} history items.`); addMessage('assistant', `--- Session Resumed (${new Date().toLocaleTimeString()}) ---`); } else { console.log("DEBUG: No saved history. Initializing."); chatHistory = []; addMessage('assistant', `I am ${AI_NAME}. Your personal AI assistant. How may I help you, ${USER_NAME}?`); setStatus("Ready"); } } catch (e) { console.error("Error loading/parsing chat history:", e); localStorage.removeItem(HISTORY_STORAGE_KEY); chatHistory = []; addMessage('assistant', 'Error loading previous session. Starting fresh.', true); setStatus("Error loading history"); } scrollToBottom(); }

    // --- AI Interaction ---
    async function getAssistantResponse(prompt) {
        console.log("DEBUG: getAssistantResponse initiated.");
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") { addMessage('assistant', "API Key missing.", true); resetToIdleState("Error: API Key missing"); return; }
        if (isSpeaking || textInput.disabled) { console.log("DEBUG: Blocked request (speaking or disabled)."); return; }

        setStatus('Assistant thinking...', true);
        disableInput(true);
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        const currentUserTurn = { role: 'user', parts: [{ text: prompt }] };
        const personaInstruction = `(System Instructions: You are ${AI_NAME}, a helpful AI assistant for ${USER_NAME}.)`;
        const primingResponse = `Understood. I am ${AI_NAME}.`;

        const apiContentToSend = [ { role: 'user', parts: [{ text: personaInstruction }] }, { role: 'model', parts: [{ text: primingResponse }] }, ...chatHistory, currentUserTurn ];
        const requestBody = { contents: apiContentToSend };

        try {
            console.log("DEBUG: Fetching AI response...");
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            console.log(`DEBUG: Fetch response status: ${response.status}`);

            if (!response.ok) { /* ... unchanged error creation ... */ let errorText = response.statusText; try { const errorData = await response.json(); console.error("API Error Response Body:", errorData); errorText = errorData.error?.message || JSON.stringify(errorData); let blockReason = ""; const feedback = errorData?.promptFeedback; if (feedback?.blockReason) blockReason = ` (Reason: ${feedback.blockReason})`; throw new Error(`API Error (${response.status}): ${errorText}${blockReason}`); } catch (parseError) { console.error("Failed to parse API error response as JSON:", parseError); throw new Error(`API Error (${response.status}): ${response.statusText}`); } }

            const data = await response.json();
            console.log("DEBUG: API Response Data Received:", data);
            let replyText = "Error: Could not extract reply.";
            let isSafeReply = false;

             if (data.candidates && data.candidates.length > 0) { /* ... unchanged reply extraction & safety check ... */ const candidate = data.candidates[0]; const isBlocked = candidate.finishReason === "SAFETY" || candidate.safetyRatings?.some(rating => rating.probability !== "NEGLIGIBLE" && rating.blocked); if (isBlocked) { replyText = "Response blocked due to safety settings."; console.warn("Safety block detected:", candidate.finishReason, candidate.safetyRatings); addMessage('assistant', replyText, true); } else if (candidate.content?.parts?.[0]?.text) { replyText = candidate.content.parts[0].text; currentAssistantMessageDiv.textContent = replyText; isSafeReply = true; } else { console.warn("Unexpected candidate structure or empty content:", candidate); replyText = "Received response, but content is missing or empty."; currentAssistantMessageDiv.textContent = replyText; } }
             else if (data?.promptFeedback?.blockReason) { /* ... */ replyText = `Request blocked (Reason: ${data.promptFeedback.blockReason}).`; console.warn("Prompt block:", data.promptFeedback); addMessage('assistant', replyText, true); }
             else { /* ... */ console.warn("Unexpected API response structure:", data); currentAssistantMessageDiv.textContent = replyText; }

            if (isSafeReply) {
                console.log("DEBUG: Valid reply. Updating history, saving, speaking.");
                chatHistory.push(currentUserTurn);
                chatHistory.push({ role: 'model', parts: [{ text: replyText }] });
                saveChatHistoryLocal();
                speakText(replyText); // Will call resetToIdleState on completion/error
            } else {
                console.log("DEBUG: Unsafe/invalid reply. Resetting state.");
                resetToIdleState('Blocked/Invalid');
            }

        } catch (error) {
            console.error("Error during AI interaction:", error);
            const errorMsg = `Error: ${error.message}`;
            if (currentAssistantMessageDiv) { currentAssistantMessageDiv.textContent = errorMsg; currentAssistantMessageDiv.classList.add('error-message'); }
            else { addMessage('assistant', errorMsg, true); }
            resetToIdleState('API Error');
        } finally {
            scrollToBottom();
            currentAssistantMessageDiv = null;
            console.log("DEBUG: getAssistantResponse finally block finished.");
        }
    }

    // --- Text Input & Sending ---
    function handleSend() { const text = textInput.value.trim(); if (text && !textInput.disabled) { addMessage('user', text); textInput.value = ''; getAssistantResponse(text); } else { console.log(`DEBUG: Send blocked.`); } }
    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } });


    // --- Voice Input (Recreated Simple Version) ---

    // let simpleRecognition; // Defined at top level now
    // let isSimpleRecording = false; // Defined at top level now

    function setupSimpleSpeechRecognition() {
        console.log("DEBUG: Setting up SIMPLE Speech Recognition...");
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            setStatus('Speech Recognition not supported');
            voiceButton.disabled = true;
            voiceButton.style.opacity = '0.5';
            console.error("Speech Recognition API not found in this browser.");
            return false; // Indicate failure
        }

        try {
            simpleRecognition = new SpeechRecognition();
            simpleRecognition.continuous = false; // Only capture single utterances
            simpleRecognition.lang = 'en-US';    // Standard language
            simpleRecognition.interimResults = false; // We only want the final result
            simpleRecognition.maxAlternatives = 1;  // Get only the best guess

            // --- Essential Event Handlers ---

            simpleRecognition.onresult = (event) => {
                console.log("DEBUG: simpleRecognition onresult fired.");
                if (event.results.length > 0 && event.results[0].length > 0) {
                    const transcript = event.results[0][0].transcript.trim();
                    console.log("DEBUG: Transcript received:", transcript);
                    if (transcript) {
                        textInput.value = transcript; // Put text in input box
                        setStatus(`Recognized: "${transcript}"`);
                        handleSend(); // Automatically send the recognized text
                    } else {
                        console.warn("DEBUG: Empty transcript received.");
                        setStatus("Empty result");
                    }
                } else {
                    console.warn("DEBUG: onresult fired but no results array found.");
                    setStatus("No result data");
                }
                // State reset now handled primarily by onend
            };

            simpleRecognition.onerror = (event) => {
                // Log detailed error for debugging
                console.error(`!!! SIMPLE SPEECH RECOGNITION ERROR !!! Error: ${event.error}, Message: ${event.message || 'N/A'}`, event);
                let errorMsg = `Mic Error: ${event.error}`;
                 if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    errorMsg = "Mic permission denied. Check settings.";
                    addMessage('assistant', errorMsg, true);
                 } else if (event.error === 'no-speech') {
                     errorMsg = "No speech detected.";
                 } else {
                     addMessage('assistant', `Mic Error: ${event.error}`, true);
                 }
                setStatus(errorMsg);
                // Ensure state is reset even on error
                isSimpleRecording = false;
                voiceButton.classList.remove('recording');
                disableInput(false); // Re-enable input on error
            };

            simpleRecognition.onend = () => {
                // This fires after recognition stops naturally, or on error, or if stop() is called.
                console.log("DEBUG: simpleRecognition onend fired.");
                isSimpleRecording = false; // Always reset flag when it ends
                voiceButton.classList.remove('recording');
                // Only reset status to idle if it wasn't just set to an error message
                 // and the AI isn't currently speaking or processing
                if (!statusBar.textContent.includes('Error') && !statusBar.textContent.includes('Denied') && !textInput.disabled) {
                    resetToIdleState('Idle'); // Use central reset if appropriate
                } else {
                     console.log("DEBUG: simpleRecognition onend - keeping status/input disabled (AI active or error occurred).");
                     // Make sure input is enabled if an error occurred but AI isn't active
                     if (!isSpeaking && !textInput.disabled && (statusBar.textContent.includes('Error') || statusBar.textContent.includes('Denied'))) {
                        disableInput(false);
                     }
                }
            };

            // --- Optional handlers ---
             simpleRecognition.onaudiostart = () => { console.log("DEBUG: simpleRecognition audiostart fired."); setStatus('Listening...'); voiceButton.classList.add('recording'); };
             simpleRecognition.onspeechstart = () => { console.log("DEBUG: simpleRecognition speechstart fired."); };
             simpleRecognition.onspeechend = () => { console.log("DEBUG: simpleRecognition speechend fired."); setStatus('Processing...'); };

            console.log("Simple Speech Recognition initialized successfully.");
            setStatus("Mic Ready");
            return true; // Indicate success

        } catch (initError) {
            console.error("Failed to initialize Simple Speech Recognition:", initError);
            setStatus("Speech Rec init failed");
            voiceButton.disabled = true;
            voiceButton.style.opacity = '0.5';
            return false; // Indicate failure
        }
    }

    function startSimpleRecording() {
        if (!simpleRecognition) { console.error("Attempted startSimpleRecording: recognition not initialized."); addMessage('assistant', "Mic system not ready.", true); setStatus("Mic system error"); return; }
        if (isSimpleRecording || textInput.disabled) { console.log("DEBUG: Blocked startSimpleRecording (already recording or input disabled)."); return; }

        try {
            console.log("DEBUG: >>> Attempting simpleRecognition.start()...");
            isSimpleRecording = true; // Set flag before starting
            // Visuals/Status handled by onaudiostart
            simpleRecognition.start();
            console.log("DEBUG: <<< simpleRecognition.start() called (no immediate exception).");
        } catch (e) {
            console.error("Error ***DURING*** simpleRecognition.start() call:", e);
            isSimpleRecording = false; // Reset flag
            setStatus(`Mic Start Error: ${e.message}`);
            addMessage('assistant', `Failed to activate mic. Error: ${e.message}`, true);
            voiceButton.classList.remove('recording'); // Manually reset button style
            disableInput(false); // Re-enable input
        }
    }

    function stopSimpleRecording(statusMsg = 'Stopping Mic') {
        console.log(`DEBUG: Stopping simple speech recognition (Status: ${statusMsg}).`);
        if (!simpleRecognition || !isSimpleRecording) { console.log("DEBUG: Ignored stopSimpleRecording (not initialized or not recording)."); return; }
        try {
            simpleRecognition.stop();
        } catch (e) {
            console.warn("Error stopping simple recognition:", e);
            // Force reset state just in case 'onend' doesn't fire correctly after error
            isSimpleRecording = false;
            voiceButton.classList.remove('recording');
            setStatus(statusMsg);
            if (!isSpeaking) disableInput(false);
        }
        // 'onend' should handle the primary state reset (isSimpleRecording=false, button style)
    }


    // --- Text-to-Speech ---
    function setupSpeechSynthesis() { if ('speechSynthesis' in window) { synth = window.speechSynthesis; synth.onvoiceschanged = () => { console.log("DEBUG: Voices changed event fired."); populateVoiceList(); const selectedVoiceURI = currentSettings.voiceURI; if (selectedVoiceURI) { const selectedOption = Array.from(voiceSelect.options).find(opt => opt.value === selectedVoiceURI); if (selectedOption) { voiceSelect.value = selectedVoiceURI; } else { console.warn("Saved voice URI not found:", selectedVoiceURI); if (voiceSelect.options.length > 0) { voiceSelect.selectedIndex = 0; currentSettings.voiceURI = voiceSelect.value; saveSettings(); } } } }; populateVoiceList(); } else { console.warn("Speech Synthesis not supported."); setStatus("Speech Synthesis not supported"); } }
    function speakText(text) {
        console.log("DEBUG: speakText initiated for text:", text.substring(0, 30) + "...");
        if (!synth || !text) { console.warn("DEBUG: TTS skipped: No synth or no text."); resetToIdleState('Idle'); return; }

        isSpeaking = false;
        synth.cancel(); // Cancel any pending speech
        console.log("DEBUG: synth.cancel() called before creating utterance.");

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = currentSettings.rate || 1.0;
        const selectedVoice = voices.find(voice => voice.voiceURI === currentSettings.voiceURI);
        if (selectedVoice) { utterance.voice = selectedVoice; utterance.lang = selectedVoice.lang; console.log(`DEBUG: Using voice: ${selectedVoice.name} Rate: ${utterance.rate}`); }
        else { console.warn("DEBUG: Selected voice not found, using default. URI:", currentSettings.voiceURI); utterance.rate = currentSettings.rate || 1.0; }

        utterance.onstart = () => { console.log("DEBUG: >>> TTS onstart fired."); isSpeaking = true; setStatus('Assistant speaking...'); setVisualizerState('speaking'); disableInput(true); };
        utterance.onend = () => { console.log("DEBUG: <<< TTS onend fired."); resetToIdleState('Idle'); }; // Use centralized reset
        utterance.onerror = (event) => { console.error("!!! SPEECH SYNTHESIS ERROR !!!:", event); resetToIdleState(`Speech Error: ${event.error}`); }; // Use centralized reset

        // Add slight delay AFTER setting up handlers and cancelling
        setTimeout(() => {
             if (isSpeaking) { console.warn("DEBUG: synth.speak() aborted, already speaking."); return; } // Prevent starting if somehow already speaking
            console.log("DEBUG: Calling synth.speak() after delay.");
            disableInput(true);
            setVisualizerState('speaking');
            synth.speak(utterance);
        }, 100);
    }

    // --- Initialization ---
    function initializeApp() {
        console.log("Initializing App...");
        loadSettings();
        // --- Call the NEW setup function ---
        if (!setupSimpleSpeechRecognition()) {
             console.error("CRITICAL: Speech Recognition setup failed. Voice input disabled.");
        }
        setupSpeechSynthesis(); // Keep original TTS setup
        loadChatHistoryLocal();
        resetToIdleState('Ready'); // Use reset for initial state

        // --- Settings Event Listeners ---
        settingsButton.addEventListener('click', openSettings);
        closeSettingsButton.addEventListener('click', closeSettings);
        voiceSelect.addEventListener('change', (e) => { currentSettings.voiceURI = e.target.value; saveSettings(); });
        speedSlider.addEventListener('input', (e) => { currentSettings.rate = parseFloat(e.target.value); speedValue.textContent = currentSettings.rate.toFixed(1); });
        speedSlider.addEventListener('change', () => { saveSettings(); });

        // --- Update Voice Button Listener ---
        // Remove potentially old listeners first if needed (safer)
        voiceButton.removeEventListener('click', voiceButtonClickHandler);
        voiceButton.addEventListener('click', voiceButtonClickHandler); // Add new one

        console.log("Initialization complete.");
    }

     // Define the click handler separately
     const voiceButtonClickHandler = () => {
         if (isSimpleRecording) {
             // stopSimpleRecording('Stopped manually'); // Uncomment to allow stopping
             console.log("DEBUG: Mic button clicked while recording (stop ignored).");
         } else if (!voiceButton.disabled) {
             startSimpleRecording();
         }
     };

    // --- Run initialization ---
    initializeApp();

}); // End DOMContentLoaded listener
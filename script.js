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
    let voices = [];
    let isRecording = false;
    let isSpeaking = false;
    let currentAssistantMessageDiv = null;
    let currentSettings = { voiceURI: null, rate: 1.0 };

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
        if (recognition && isRecording) { console.warn("DEBUG: resetToIdleState stopping stuck speech recognition."); stopRecording('Stopped by Reset'); }
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
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") { addMessage('assistant', "API Key missing.", true); resetToIdleState("Error: API Key missing"); return; } // Use reset
        if (isSpeaking || textInput.disabled) { console.log("DEBUG: Blocked request (speaking or disabled)."); return; }

        setStatus('Assistant thinking...', true);
        disableInput(true);
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        const currentUserTurn = { role: 'user', parts: [{ text: prompt }] };
        const personaInstruction = `(System Instructions: You are ${AI_NAME}, a helpful AI assistant for ${USER_NAME}.)`;
        const primingResponse = `Understood. I am ${AI_NAME}.`;

        const apiContentToSend = [
            { role: 'user', parts: [{ text: personaInstruction }] },
            { role: 'model', parts: [{ text: primingResponse }] },
            ...chatHistory,
            currentUserTurn
        ];
        const requestBody = { contents: apiContentToSend };

        try {
            console.log("DEBUG: Fetching AI response...");
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            console.log(`DEBUG: Fetch response status: ${response.status}`);

            if (!response.ok) {
                let errorText = response.statusText; try { const errorData = await response.json(); console.error("API Error Response Body:", errorData); errorText = errorData.error?.message || JSON.stringify(errorData); let blockReason = ""; const feedback = errorData?.promptFeedback; if (feedback?.blockReason) blockReason = ` (Reason: ${feedback.blockReason})`; throw new Error(`API Error (${response.status}): ${errorText}${blockReason}`); } catch (parseError) { console.error("Failed to parse API error response as JSON:", parseError); throw new Error(`API Error (${response.status}): ${response.statusText}`); }
            }

            const data = await response.json();
            console.log("DEBUG: API Response Data Received:", data);
            let replyText = "Error: Could not extract reply.";
            let isSafeReply = false;

             if (data.candidates && data.candidates.length > 0) {
                 const candidate = data.candidates[0];
                 const isBlocked = candidate.finishReason === "SAFETY" || candidate.safetyRatings?.some(rating => rating.probability !== "NEGLIGIBLE" && rating.blocked);
                 if (isBlocked) { replyText = "Response blocked due to safety settings."; console.warn("Safety block detected:", candidate.finishReason, candidate.safetyRatings); addMessage('assistant', replyText, true); }
                 else if (candidate.content?.parts?.[0]?.text) { replyText = candidate.content.parts[0].text; currentAssistantMessageDiv.textContent = replyText; isSafeReply = true; }
                 else { console.warn("Unexpected candidate structure or empty content:", candidate); replyText = "Received response, but content is missing or empty."; currentAssistantMessageDiv.textContent = replyText; }
             } else if (data?.promptFeedback?.blockReason) { replyText = `Request blocked due to safety settings (Reason: ${data.promptFeedback.blockReason}).`; console.warn("Prompt block:", data.promptFeedback); addMessage('assistant', replyText, true);
             } else { console.warn("Unexpected API response structure:", data); currentAssistantMessageDiv.textContent = replyText; }

            if (isSafeReply) {
                console.log("DEBUG: Valid reply. Updating history, saving, speaking.");
                chatHistory.push(currentUserTurn);
                chatHistory.push({ role: 'model', parts: [{ text: replyText }] });
                saveChatHistoryLocal();
                speakText(replyText); // This will eventually call resetToIdleState
            } else {
                console.log("DEBUG: Unsafe/invalid reply. Resetting state.");
                resetToIdleState('Blocked/Invalid');
            }

        } catch (error) {
            console.error("Error during AI interaction:", error);
            const errorMsg = `Error: ${error.message}`;
            if (currentAssistantMessageDiv) { currentAssistantMessageDiv.textContent = errorMsg; currentAssistantMessageDiv.classList.add('error-message'); }
            else { addMessage('assistant', errorMsg, true); }
            resetToIdleState('API Error'); // Use centralized reset
        } finally {
            scrollToBottom();
            currentAssistantMessageDiv = null; // Clear ref
            console.log("DEBUG: getAssistantResponse finally block finished.");
        }
    }

    // --- Text Input & Sending ---
    function handleSend() { const text = textInput.value.trim(); if (text && !textInput.disabled) { addMessage('user', text); textInput.value = ''; getAssistantResponse(text); } else { console.log(`DEBUG: Send blocked.`); } }
    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } });

    // --- Voice Input (Speech Recognition) ---
    function setupSpeechRecognition() { window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!window.SpeechRecognition) { setStatus('Speech Recognition not supported'); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; return; } try { recognition = new SpeechRecognition(); recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1; recognition.onresult = (event) => { const speechResult = event.results[0][0].transcript; textInput.value = speechResult; setStatus(`Recognized: "${speechResult}"`); setTimeout(handleSend, 100); }; recognition.onspeechend = () => stopRecording('Processing...'); recognition.onnomatch = () => stopRecording('No match'); recognition.onerror = (event) => { let errorMsg = `Speech Error: ${event.error}`; if (event.message) errorMsg += ` - ${event.message}`; console.error("!!! SPEECH RECOGNITION ERROR !!!:", event); switch (event.error) { case 'not-allowed': case 'service-not-allowed': errorMsg = "Mic permission denied."; addMessage('assistant', errorMsg + " Check browser & OS settings.", true); break; case 'network': errorMsg = "Network error."; addMessage('assistant', errorMsg + " Check connection.", true); break; case 'no-speech': errorMsg = "No speech detected."; break; case 'audio-capture': errorMsg = "Mic hardware error."; addMessage('assistant', errorMsg, true); break; case 'language-not-supported': errorMsg = "Language not supported."; addMessage('assistant', errorMsg, true); break; case 'aborted': errorMsg = "Speech input aborted."; console.warn("Speech recognition aborted."); break; default: addMessage('assistant', `Speech Error: ${event.error}`, true); } setStatus(errorMsg); stopRecording('Speech Error'); }; recognition.onaudiostart = () => { setStatus('Listening...'); voiceButton.classList.add('recording'); }; recognition.onend = () => { console.log("DEBUG: Speech recognition 'onend' fired."); if (isRecording) stopRecording('Stopped'); }; setStatus('Speech Ready'); console.log("Speech Recognition initialized successfully."); } catch (initError) { console.error("Failed to initialize Speech Recognition:", initError); setStatus("Speech Rec init failed"); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; } }
    function startRecording() { if (!recognition) { console.error("Attempted startRecording: recognition not initialized."); setStatus("Speech Rec not ready"); return; } if (isRecording || textInput.disabled) { console.log("DEBUG: Blocked startRecording."); return; } setTimeout(() => { if (isRecording) return; try { console.log("DEBUG: >>> Attempting recognition.start()..."); isRecording = true; setStatus('Starting Mic...'); recognition.start(); console.log("DEBUG: <<< recognition.start() called (no immediate exception)."); } catch (e) { console.error("Error ***DURING*** recognition.start() call:", e); isRecording = false; setStatus(`Mic Start Error: ${e.message}`); voiceButton.classList.remove('recording'); addMessage('assistant', `Failed to activate mic. Error: ${e.message}`, true); resetToIdleState('Mic Start Failed'); } }, 10); }
    function stopRecording(statusMsg = 'Idle') { console.log(`DEBUG: Stopping speech recognition (Status: ${statusMsg}).`); if (!recognition || !isRecording) { return; } try { recognition.stop(); } catch (e) { console.warn("Error stopping recognition:", e); } finally { isRecording = false; voiceButton.classList.remove('recording'); if (statusMsg !== 'Stopped by Reset') setStatus(statusMsg); } }
    voiceButton.addEventListener('click', () => { if (isRecording) { stopRecording('Stopped manually'); } else if (!voiceButton.disabled) { startRecording(); } });

    // --- Text-to-Speech ---
    function setupSpeechSynthesis() { if ('speechSynthesis' in window) { synth = window.speechSynthesis; synth.onvoiceschanged = () => { console.log("DEBUG: Voices changed event fired."); populateVoiceList(); const selectedVoiceURI = currentSettings.voiceURI; if (selectedVoiceURI) { const selectedOption = Array.from(voiceSelect.options).find(opt => opt.value === selectedVoiceURI); if (selectedOption) { voiceSelect.value = selectedVoiceURI; } else { console.warn("Saved voice URI not found:", selectedVoiceURI); if (voiceSelect.options.length > 0) { voiceSelect.selectedIndex = 0; currentSettings.voiceURI = voiceSelect.value; saveSettings(); } } } }; populateVoiceList(); } else { console.warn("Speech Synthesis not supported."); setStatus("Speech Synthesis not supported"); } }
    function speakText(text) {
        console.log("DEBUG: speakText initiated for text:", text.substring(0, 30) + "..."); // Log start of text
        if (!synth || !text) { console.warn("DEBUG: TTS skipped: No synth or no text."); resetToIdleState('Idle'); return; }

        isSpeaking = false; // Reset flag *before* cancel
        synth.cancel(); // Attempt to clear queue/stop current
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
             if (isSpeaking) { // Check flag again before speaking
                 console.warn("DEBUG: synth.speak() aborted, already speaking.");
                 return;
             }
            console.log("DEBUG: Calling synth.speak() after delay.");
            disableInput(true); // Ensure disabled
            setVisualizerState('speaking'); // Assume start
            synth.speak(utterance);
        }, 100); // Increased delay slightly
    }

    // --- Initialization ---
    function initializeApp() { console.log("Initializing App..."); loadSettings(); setupSpeechRecognition(); setupSpeechSynthesis(); loadChatHistoryLocal(); resetToIdleState('Ready'); /* Use resetToIdleState for initial setup */ settingsButton.addEventListener('click', openSettings); closeSettingsButton.addEventListener('click', closeSettings); voiceSelect.addEventListener('change', (e) => { currentSettings.voiceURI = e.target.value; saveSettings(); }); speedSlider.addEventListener('input', (e) => { currentSettings.rate = parseFloat(e.target.value); speedValue.textContent = currentSettings.rate.toFixed(1); }); speedSlider.addEventListener('change', () => { saveSettings(); }); console.log("Initialization complete."); }

    // Run initialization
    initializeApp();

}); // End DOMContentLoaded listener
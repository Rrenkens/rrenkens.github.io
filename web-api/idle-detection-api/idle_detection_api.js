const IDLE_THRESHOLD_MS = 60_000;

const IDLE_DETECTOR_UI_STATES = {
    running: {
        btnIcon: 'stop',
        btnLabel: 'Stop Idle Detector',
        badgeClass: 'status-badge status-badge--live',
        statusLabel: 'Live',
    },
    notRunning: {
        btnIcon: 'play_arrow',
        btnLabel: 'Start Idle Detector',
        badgeClass: 'status-badge status-badge--not-running',
        statusLabel: 'Not Running',
    },
};
const USER_STATES = {
    active: {
        label: 'Active',
        icon: 'person',
        dotClass: 'state-dot state-dot--active',
        pillClass: 'event-pill--emerald',
    },
    idle: {
        label: 'Idle',
        icon: 'bedtime',
        dotClass: 'state-dot state-dot--idle',
        pillClass: 'event-pill--rose',
    },
};
const SCREEN_STATES = {
    unlocked: {
        label: 'Unlocked',
        icon: 'lock_open',
        dotClass: 'state-dot state-dot--active',
        pillClass: 'event-pill--emerald',
    },
    locked: {
        label: 'Locked',
        icon: 'lock',
        dotClass: 'state-dot state-dot--idle',
        pillClass: 'event-pill--rose',
    },
};

let abortController = null;
let isIdleDetectorRunning = false;

const idleDetectorToggleBtn = document.getElementById('idleDetectorToggleBtn');
const idleDetectorBtnIcon = document.getElementById('idleDetectorBtnIcon');
const idleDetectorBtnLabel = document.getElementById('idleDetectorBtnLabel');

const idleDetectorStatusBadge = document.getElementById('idleDetectorStatusBadge');
const idleDetectorStatusText = document.getElementById('idleDetectorStatusText');

const userStatePill = document.getElementById('userStatePill');
const screenStatePill = document.getElementById('screenStatePill');

const emptyLogState = document.getElementById('emptyLogState');
const eventList = document.getElementById('eventList');
const clearLogBtn = document.getElementById('clearLogBtn');
const statusEventTemplate = document.getElementById('statusEventTemplate');
const stateEventTemplate = document.getElementById('stateEventTemplate');

function formatTimestamp(date = new Date()) {
    const datePart = date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
    });
    const timePart = date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    return `${datePart} • ${timePart}`;
}

function setLogHasEvents(hasEvents) {
    emptyLogState.hidden = hasEvents;
    eventList.hidden = !hasEvents;
    clearLogBtn.disabled = !hasEvents;
}

function appendStatusEvent(message, isActive) {
    setLogHasEvents(true);

    const fragment = statusEventTemplate.content.cloneNode(true);
    fragment.querySelector('.event-timestamp').textContent = formatTimestamp();

    const pill = fragment.querySelector('.event-pill');
    pill.classList.add(isActive ? 'event-pill--emerald' : 'event-pill--rose');

    const dot = fragment.querySelector('.event-dot');
    dot.classList.add(isActive ? 'event-dot--emerald' : 'event-dot--rose');

    fragment.querySelector('.event-message').textContent = message;

    eventList.appendChild(fragment);
    eventList.scrollTop = eventList.scrollHeight;
}

function populateEventPill(pill, state) {
    pill.classList.add(state.pillClass);
    pill.querySelector('.event-pill-icon').textContent = state.icon;
    pill.querySelector('.event-pill-value').textContent = state.label;
}

function appendStateChangeEvent(user, screen) {
    setLogHasEvents(true);

    const fragment = stateEventTemplate.content.cloneNode(true);
    fragment.querySelector('.event-timestamp').textContent = formatTimestamp();
    populateEventPill(fragment.querySelector('.event-pill--user'), user);
    populateEventPill(fragment.querySelector('.event-pill--screen'), screen);

    eventList.appendChild(fragment);
    eventList.scrollTop = eventList.scrollHeight;
}

function updateStatePill(pill, state, defaultState) {
    const displayState = state ?? defaultState;
    pill.querySelector('.material-symbols-outlined').textContent = displayState.icon;
    pill.querySelector('.state-dot').className = displayState.dotClass;
    pill.querySelector('.state-value-text').textContent = state ? state.label : '';
    pill.querySelector('.state-pill-value').hidden = !state;
}

function updateStatePills(user, screen) {
    updateStatePill(userStatePill, user, USER_STATES.active);
    updateStatePill(screenStatePill, screen, SCREEN_STATES.unlocked);
}

function setRunningUI(running) {
    isIdleDetectorRunning = running;

    const uiState = running ? IDLE_DETECTOR_UI_STATES.running : IDLE_DETECTOR_UI_STATES.notRunning;
    idleDetectorBtnIcon.textContent = uiState.btnIcon;
    idleDetectorBtnLabel.textContent = uiState.btnLabel;
    idleDetectorStatusBadge.className = uiState.badgeClass;
    idleDetectorStatusText.textContent = uiState.statusLabel;

    if (!running) {
        updateStatePills(null, null);
    }
}

async function startIdleDetector() {
    if (!window.isSecureContext) {
        appendStatusEvent('Idle Detection API requires a Secure Context (HTTPS or localhost)', false);
        return;
    }

    if (!('IdleDetector' in window)) {
        appendStatusEvent('Idle Detection API is not supported in this browser', false);
        return;
    }

    idleDetectorToggleBtn.disabled = true;

    try {
        const state = await IdleDetector.requestPermission();
        if (state !== 'granted') {
            appendStatusEvent('Idle Detection API permission is not granted', false);
            return;
        }

        abortController = new AbortController();
        const idleDetector = new IdleDetector();

        await idleDetector.start({
            threshold: IDLE_THRESHOLD_MS,
            signal: abortController.signal,
        });

        setRunningUI(true);
        appendStatusEvent('Idle Detector is active', true);

        function handleStateChange() {
            const user = USER_STATES[idleDetector.userState];
            const screen = SCREEN_STATES[idleDetector.screenState];
            updateStatePills(user, screen);
            appendStateChangeEvent(user, screen);
        }

        handleStateChange();
        idleDetector.addEventListener('change', handleStateChange);
    } catch (err) {
        console.error(err);
        abortController = null;
        setRunningUI(false);
        const message = err instanceof Error ? err.message : String(err);
        appendStatusEvent(`Error: ${message}`, false);
    } finally {
        idleDetectorToggleBtn.disabled = false;
    }
}

function stopIdleDetector() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    setRunningUI(false);
    appendStatusEvent('Idle Detector is stopped', false);
}

function clearEvents() {
    eventList.replaceChildren();
    setLogHasEvents(false);
}

idleDetectorToggleBtn.addEventListener('click', () => {
    if (isIdleDetectorRunning) {
        stopIdleDetector();
    } else {
        startIdleDetector();
    }
});
clearLogBtn.addEventListener('click', clearEvents);

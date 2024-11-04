let controller = null;

function writeMessage(message) {
    const outputArea = document.getElementById("output-area");
    outputArea.textContent += `${new Date().toLocaleString()}: ${message}\n`;
    outputArea.scrollTop = outputArea.scrollHeight;
}

function setButtonsState(isStartIdleDetectorButtonDisabled, isStopIdleDetectorButtonDisabled) {
    const startIdleDetectorButton = document.getElementById("start-idle-detector-button");
    const stopIdleDetectorButton = document.getElementById("stop-idle-detector-button");

    startIdleDetectorButton.disabled = isStartIdleDetectorButtonDisabled;
    stopIdleDetectorButton.disabled = isStopIdleDetectorButtonDisabled;
}

async function startIdleDetector() {
    setButtonsState(true, false);

    const state = await IdleDetector.requestPermission();
    if (state !== 'granted') {
        console.log('Idle detection permission not granted.');
        setButtonsState(true, false);
        return;
    }

    try {
        controller = new AbortController();
        const idleDetector = new IdleDetector();
        idleDetector.addEventListener('change', () => {
            writeMessage(`Idle change: userState=${idleDetector.userState}, screenState=${idleDetector.screenState}.`);
        });

        writeMessage('IdleDetector is active.');
        await idleDetector.start({
            threshold: 60000,
            signal: controller.signal,
        });
    } catch (err) {
        console.error(err.name, err.message);
        setButtonsState(true, false);
    }
}

function stopIdleDetector() {
    setButtonsState(false, true);

    controller.abort();
    writeMessage('IdleDetector is stopped.');
}
